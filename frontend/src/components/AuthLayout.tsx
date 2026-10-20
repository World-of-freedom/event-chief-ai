import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  visual: ReactNode;
}

export function AuthLayout({ children, visual }: AuthLayoutProps) {
  return (
    <main className="auth-layout">
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <div className="auth-visual" aria-hidden="true">
        <span className="auth-orb orb-one" />
        <span className="auth-orb orb-two" />
        <p>{visual}</p>
      </div>
      <div className="auth-panel">{children}</div>
    </main>
  );
}
