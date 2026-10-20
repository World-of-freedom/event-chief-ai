import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { comingSoonRoutes, appRoutes } from "@/lib/routes";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Event Chief AI home">
          <span className="brand-mark">EC</span>
          <span>Event Chief AI</span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Sponsorship</p>
          <ul className="nav-list">
            {appRoutes.map((item) => (
              <li key={item.to}>
                <NavLink className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} to={item.to} end={item.to === "/"}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="nav-label nav-label-spaced">Coming soon</p>
          <ul className="nav-list">
            {comingSoonRoutes.map((item) => (
              <li key={item.to}>
                <span className="nav-link disabled" aria-disabled="true">
                  {item.label}<small>Coming soon</small>
                </span>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-account">
          <div className="account-email" title={user?.email ?? "Signed-in organizer"}>{user?.email ?? "Signed-in organizer"}</div>
          <div className="account-actions"><ThemeToggle /><button className="sign-out" type="button" onClick={() => void handleSignOut()}>Sign out</button></div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
