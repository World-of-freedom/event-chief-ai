import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isLoading, recoveryMode, session } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="app-loading">Restoring your secure session…</div>;
  const destination = (location.state as { from?: string } | null)?.from ?? "/";
  if (session && !recoveryMode) return <Navigate to={destination} replace />;
  return <>{children}</>;
}
