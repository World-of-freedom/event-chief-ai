import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { LoadingState } from "@/components/LoadingState";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isLoading, recoveryMode, session } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingState fullScreen label="Restoring your secure session…" />;
  const destination = (location.state as { from?: string } | null)?.from ?? "/";
  if (session && !recoveryMode) return <Navigate to={destination} replace />;
  return <>{children}</>;
}
