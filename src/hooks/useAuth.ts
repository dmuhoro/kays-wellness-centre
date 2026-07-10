import { useState, useEffect } from "react";
import { getCurrentSession } from "@/lib/auth-check.server";

export interface AuthState {
  loading: boolean;
  authenticated: boolean;
  userId: number | null;
  orgId: string | null;
  role: string | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    userId: null,
    orgId: null,
    role: null,
  });

  useEffect(() => {
    let cancelled = false;
    getCurrentSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setState({
          loading: false,
          authenticated: true,
          userId: session.userId,
          orgId: session.orgId,
          role: session.role,
        });
      } else {
        setState({
          loading: false,
          authenticated: false,
          userId: null,
          orgId: null,
          role: null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getCurrentSession();
  return session !== null;
}
