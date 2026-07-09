import { createServerFn } from "@tanstack/react-start";
import { processNotifications as runQueue } from "../queue.server";

export const triggerQueueProcessing = createServerFn({ method: "POST" }).handler(
  async () => {
    return await runQueue();
  },
);
