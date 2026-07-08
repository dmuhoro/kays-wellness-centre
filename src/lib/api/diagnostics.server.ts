import { createServerFn } from "@tanstack/react-start";
import { isDbAvailable, getConnectionError } from "../db.server";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    dbAvailable: isDbAvailable(),
    dbError: getConnectionError(),
    nodeEnv: process.env.NODE_ENV || "unknown",
    region: process.env.VERCEL_REGION || "local",
  };
});
