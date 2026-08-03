import { Link } from "@tanstack/react-router";
import { Coffee, Package, BookOpen, ShoppingCart, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Bahan Baku", icon: Package, ready: true },
  { to: "/menu", label: "Menu & Resep", icon: BookOpen, ready: true },
  { to: "/kasir", label: "Kasir", icon: ShoppingCart, ready: false },
  { to: "/laporan", label: "Laporan", icon: BarChart3, ready: false },
] as const;

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coffee className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold leading-none">Quinos POS</span>
          </div>

          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) =>
              item.ready ? (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                  activeOptions={{ exact: true }}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              ) : (
                <span
                  key={item.to}
                  title="Modul berikutnya — belum dibangun"
                  className={cn(
                    "flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/45",
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              ),
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
