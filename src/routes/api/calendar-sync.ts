import crypto from "node:crypto";
import { eventHandler, getQuery, setResponseHeader, setResponseStatus, createError } from "h3";
import { getDb } from "@/lib/db.server";
import { logger, EVENTS } from "@/lib/logger.server";

interface CalendarEvent {
  id: number;
  lead_name: string;
  lead_email: string;
  service: string;
  appointment_timestamp: string;
  provider_name: string;
  room_name: string;
  organization_name: string;
  organization_timezone: string;
}

async function lookupToken(token: string): Promise<{ orgId: string; providerId?: number } | null> {
  if (!token || token.length < 32) return null;
  try {
    const db = await getDb();
    const rows = await db.unsafe<Array<{ organization_id: string }>>(
      `SELECT organization_id FROM webhook_configs
       WHERE secret = $1 AND active = true
       LIMIT 1`,
      [token],
    );
    if (rows.length > 0) {
      return { orgId: rows[0].organization_id };
    }
  } catch {
    // Fall through to null
  }
  return null;
}

function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcalDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function generateUid(event: CalendarEvent): string {
  const hash = crypto.createHash("sha256")
    .update(`${event.id}-${event.appointment_timestamp}-${event.organization_name}`)
    .digest("hex")
    .slice(0, 16);
  return `${hash}@kayswellness.calendar`;
}

function buildICalContent(events: CalendarEvent[], orgName: string): string {
  const now = formatIcalDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kay's Wellness Centre//Calendar Sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(orgName)} — Appointments`,
    "X-WR-TIMEZONE:Africa/Nairobi",
  ];

  for (const event of events) {
    const dtStart = formatIcalDate(event.appointment_timestamp);
    if (!dtStart) continue;

    const endDate = new Date(event.appointment_timestamp);
    endDate.setHours(endDate.getHours() + 1);
    const dtEnd = formatIcalDate(endDate.toISOString());

    const description = [
      `Patient: ${event.lead_name}`,
      `Service: ${event.service}`,
      `Provider: ${event.provider_name || "Any"}`,
      event.room_name ? `Room: ${event.room_name}` : "",
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${generateUid(event)}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcalText(event.service)} — ${escapeIcalText(event.lead_name)}`,
      `DESCRIPTION:${escapeIcalText(description)}`,
      event.lead_email ? `ATTENDEE;CN=${escapeIcalText(event.lead_name)}:mailto:${event.lead_email}` : "",
      `LOCATION:${escapeIcalText([event.provider_name, event.room_name].filter(Boolean).join(" — "))}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter((l) => l !== "").join("\r\n");
}

async function getUpcomingAppointments(
  orgId: string,
  providerId?: number,
): Promise<CalendarEvent[]> {
  const db = await getDb();
  const conditions = [
    "cl.organization_id = $1",
    "cl.appointment_timestamp IS NOT NULL",
    "cl.appointment_timestamp > NOW()",
  ];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (providerId) {
    conditions.push(`cl.provider_id = $${idx++}`);
    params.push(providerId);
  }

  return db.unsafe<CalendarEvent[]>(
    `SELECT cl.id, cl.name AS lead_name, cl.email AS lead_email, cl.service,
            cl.appointment_timestamp,
            COALESCE(rp.name, '') AS provider_name,
            COALESCE(rr.name, '') AS room_name,
            o.name AS organization_name,
            o.timezone AS organization_timezone
     FROM clinic_leads cl
     LEFT JOIN resources rp ON rp.id = cl.provider_id
     LEFT JOIN resources rr ON rr.id = cl.room_id
     JOIN organizations o ON o.id = cl.organization_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY cl.appointment_timestamp ASC
     LIMIT 200`,
    params,
  );
}

export const GET = eventHandler(async (event) => {
  const query = getQuery(event);
  const token = (query.token as string) || "";

  if (!token || token.length < 16) {
    setResponseStatus(event, 401);
    throw createError({ statusCode: 401, statusMessage: "Invalid or missing calendar token" });
  }

  const auth = await lookupToken(token);
  if (!auth) {
    logger.warn("Calendar sync: invalid token", { event: EVENTS.AUTH_FAILURE });
    setResponseStatus(event, 403);
    throw createError({ statusCode: 403, statusMessage: "Invalid calendar token" });
  }

  const events = await getUpcomingAppointments(auth.orgId, auth.providerId);

  let orgName = "Kay's Wellness Centre";
  try {
    const db = await getDb();
    const orgRows = await db.unsafe<Array<{ name: string }>>(
      `SELECT name FROM organizations WHERE id = $1`,
      [auth.orgId],
    );
    if (orgRows[0]) orgName = orgRows[0].name;
  } catch {
    // Use default
  }

  const ical = buildICalContent(events, orgName);

  setResponseHeader(event, "Content-Type", "text/calendar; charset=utf-8");
  setResponseHeader(event, "Content-Disposition", 'attachment; filename="kays-wellness-calendar.ics"');
  setResponseHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

  logger.info("Calendar feed generated", {
    event: EVENTS.CONFIG_FETCHED,
    orgId: auth.orgId,
    eventCount: events.length,
  });

  return ical;
});
