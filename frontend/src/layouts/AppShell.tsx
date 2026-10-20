import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  Menu,
  Ticket,
  Users,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { comingSoonRoutes, appRoutes, routeLabelForPath } from "@/lib/routes";

const routeIcons = {
  "/": LayoutDashboard,
  "/events": CalendarDays,
  "/needs": Wallet,
  "/discovery": Compass,
  "/pipeline": Workflow,
  "/follow-ups": ClipboardCheck,
  "/coming-soon/speakers": Users,
  "/coming-soon/vendors": Users,
  "/coming-soon/ticketing": Ticket,
} as const;

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  const email = user?.email ?? "Signed-in organizer";
  const initials = email.slice(0, 2).toUpperCase();
  const currentLabel = routeLabelForPath(location.pathname);

  return (
    <div className="app-shell">
      {navOpen ? <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <NavLink className="brand" to="/" aria-label="Event Chief AI home">
          <span className="brand-mark">EC</span>
          <span className="brand-copy">
            Event Chief AI
            <small>Sponsorship workspace</small>
          </span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          <ul className="nav-list">
            {appRoutes.map((item) => {
              const Icon = routeIcons[item.to as keyof typeof routeIcons] ?? LayoutDashboard;
              return (
                <li key={item.to}>
                  <NavLink className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} to={item.to} end={item.to === "/"}>
                    <Icon aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
          <p className="nav-label nav-label-spaced">Coming soon</p>
          <ul className="nav-list">
            {comingSoonRoutes.map((item) => {
              const Icon = routeIcons[item.to as keyof typeof routeIcons] ?? Users;
              return (
                <li key={item.to}>
                  <span className="nav-link disabled" aria-disabled="true">
                    <span className="nav-link-label">
                      <Icon aria-hidden="true" />
                      {item.label}
                    </span>
                    <small>Soon</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sidebar-account">
          <div className="account-row">
            <span className="account-avatar" aria-hidden="true">{initials}</span>
            <div className="account-email" title={email}>{email}</div>
          </div>
          <div className="account-actions">
            <button className="sign-out" type="button" onClick={() => void handleSignOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" type="button" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
              {navOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <NavLink to="/">Home</NavLink>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{currentLabel}</span>
            </nav>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
