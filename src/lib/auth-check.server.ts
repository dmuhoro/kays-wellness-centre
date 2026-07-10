import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./session.server";

export const getCurrentSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = getSession();
  if (!session) return null;
  return {
    userId: session.userId,
    orgId: session.orgId,
    role: session.role,
    exp: session.exp,
  };
});
