import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { LoadingState } from "@/components/LoadingState";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { configured, isLoading, session } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingState fullScreen label="Restoring your secure session…" />;
  if (!configured || !session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
