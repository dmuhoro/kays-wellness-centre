import { eventHandler, getQuery, getHeader, setResponseHeader, createError } from "h3";
import { getCurrentOrgId } from "@/lib/session.server";
import { logger, EVENTS } from "@/lib/logger.server";
import { ensureLiveEventsSchema, pollLiveEvents, cleanLiveEvents } from "@/lib/event-bus.server";

export const GET = eventHandler(async (event) => {
  const orgId = getCurrentOrgId();
  if (!orgId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized — no tenant context" });
  }

  const query = getQuery(event);
  const lastEventId = parseInt(String(query.lastEventId || "0"), 10);

  await ensureLiveEventsSchema();

  logger.info("SSE stream opened", {
    event: EVENTS.SSE_STREAM_OPENED,
    tenant_id: orgId,
  });

  setResponseHeader(event, "Content-Type", "text/event-stream");
  setResponseHeader(event, "Cache-Control", "no-cache");
  setResponseHeader(event, "Connection", "keep-alive");
  setResponseHeader(event, "X-Accel-Buffering", "no");

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let currentId = lastEventId;

      const send = (data: string, eventType?: string) => {
        if (closed) return;
        try {
          if (eventType) controller.enqueue(`event: ${eventType}\n`);
          controller.enqueue(`data: ${data}\n\n`);
        } catch {
          closed = true;
        }
      };

      const heartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(": heartbeat\n\n");
        } catch {
          closed = true;
        }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const events = await pollLiveEvents(orgId, currentId);
          for (const evt of events) {
            send(
              JSON.stringify({ eventType: evt.event_type, payload: evt.payload, timestamp: evt.created_at }),
              evt.event_type,
            );
            currentId = evt.id;
          }
        } catch {
          // poll error — retry next cycle
        }
      };

      const intervalId = setInterval(() => {
        if (closed) {
          clearInterval(intervalId);
          return;
        }
        poll();
      }, 3000);

      const heartbeatId = setInterval(() => {
        if (closed) {
          clearInterval(heartbeatId);
          return;
        }
        heartbeat();
      }, 30_000);

      const cleanupId = setInterval(() => {
        cleanLiveEvents(orgId).catch(() => {});
      }, 300_000);

      event.node.req.on("close", () => {
        closed = true;
        clearInterval(intervalId);
        clearInterval(heartbeatId);
        clearInterval(cleanupId);
      });

      send(JSON.stringify({ eventType: "connected", payload: { orgId }, timestamp: new Date().toISOString() }), "connected");
    },
  });

  return stream;
});
