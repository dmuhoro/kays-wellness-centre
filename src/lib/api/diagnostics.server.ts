import { createServerFn } from "@tanstack/react-start";
import { isDbAvailable, getConnectionError } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { getNodeEnv } from "../env.server";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const available = isDbAvailable();
  logger.info("Server status check", {
    event: EVENTS.ENV_VALIDATION,
    dbAvailable: available,
  });
  return {
    dbAvailable: available,
    dbError: getConnectionError(),
    nodeEnv: getNodeEnv(),
    region: process.env.VERCEL_REGION || "local",
  };
});
