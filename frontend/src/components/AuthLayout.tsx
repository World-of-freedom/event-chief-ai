import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  visual: ReactNode;
}

export function AuthLayout({ children, visual }: AuthLayoutProps) {
  return (
    <main className="relative grid min-h-svh lg:grid-cols-2">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div
        className="relative hidden overflow-hidden border-r bg-sidebar lg:flex lg:items-end lg:p-12"
        aria-hidden="true"
      >
        <span className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/20 blur-3xl" />
        <span className="absolute right-0 bottom-24 size-72 rounded-full bg-info/15 blur-3xl" />
        <p className="relative max-w-md font-heading text-4xl leading-tight font-semibold tracking-tight text-foreground">{visual}</p>
      </div>
      <div className="flex items-center justify-center px-4 py-20">{children}</div>
    </main>
  );
}

export function AuthBrand() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">EC</span>
      Event Chief AI
    </div>
  );
}
