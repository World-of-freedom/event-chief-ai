import { useEffect, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronsUpDown,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  LogOut,
  PhoneCall,
  ShieldCheck,
  Ticket,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { appRoutes, comingSoonRoutes, routeLabelForPath } from "@/lib/routes";
import { getAdminMe } from "@/lib/api/sponsorship";

const routeIcons: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/events": CalendarDays,
  "/discovery": Compass,
  "/pipeline": Workflow,
  "/follow-ups": ClipboardCheck,
  "/admin": ShieldCheck,
  "/coming-soon/speakers": Users,
  "/coming-soon/vendors": Users,
  "/coming-soon/ticketing": Ticket,
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 pt-8 pb-14 md:px-7">
          <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const queryClient = useQueryClient();
  const adminQuery = useQuery({ queryKey: ["admin", "me"], queryFn: getAdminMe, retry: false });
  const visibleRoutes = adminQuery.data?.is_platform_admin ? [...appRoutes, { label: "User management", to: "/admin" }] : appRoutes;

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      // Drop cached data so the next account never sees this one's records.
      queryClient.clear();
      navigate("/auth", { replace: true });
    }
  }

  const email = user?.email ?? "Signed-in organizer";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" aria-label="Event Chief AI home">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">EC</span>
                <span className="grid leading-tight">
                  <span className="font-semibold">Event Chief AI</span>
                  <span className="text-xs text-muted-foreground">Sponsorship workspace</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleRoutes.map((item) => {
                const Icon = routeIcons[item.to] ?? LayoutDashboard;
                const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <NavLink to={item.to} end={item.to === "/"}>
                        <Icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Coming soon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {comingSoonRoutes.map((item) => {
                const Icon = routeIcons[item.to] ?? Users;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton disabled aria-disabled="true" className="opacity-60">
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Soon</Badge>
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-brand-soft text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm" title={email}>{email}</span>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings/voice-ai")}>
                  <PhoneCall />
                  Voice AI preferences
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function Topbar() {
  const location = useLocation();
  const currentLabel = routeLabelForPath(location.pathname);
  const isHome = location.pathname === "/";

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-7">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {isHome ? null : (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem>
              <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <ThemeToggle />
    </header>
  );
}
