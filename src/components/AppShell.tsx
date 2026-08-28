import { Link } from "@tanstack/react-router";
import { Coffee, Package, BookOpen, ShoppingCart, BarChart3, LogOut, Bell } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Bahan Baku", icon: Package, ready: true, roles: ["admin"] },
  { to: "/menu", label: "Menu & Resep", icon: BookOpen, ready: true, roles: ["admin"] },
  { to: "/kasir", label: "Kasir", icon: ShoppingCart, ready: true, roles: ["admin", "user"] },
  { to: "/laporan", label: "Laporan", icon: BarChart3, ready: true, roles: ["admin"] },
] as const;

export function AppShell({
  title,
  description,
  actions,
  notificationCount = 0,
  notificationContent,
  notificationFooter,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  notificationCount?: number;
  notificationContent?: ReactNode;
  notificationFooter?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();

  const initials = (user?.displayName ?? user?.username ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const visibleNav = NAV.filter((item) => item.roles.includes(user?.role ?? "user"));

  return (
    <div className="min-h-screen bg-background p-3 sm:p-5">
      <div className="mx-auto flex max-w-[1460px] items-start gap-4 lg:gap-5">
        <aside className="panel-surface sticky top-5 hidden w-[280px] shrink-0 self-start p-4 lg:block">
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-secondary px-3 py-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coffee className="size-5" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold leading-none">Rakyat Coffee's POS</p>
              <p className="text-xs text-muted-foreground">Coffee Operations</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {visibleNav.map((item) =>
              item.ready ? (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-primary text-primary-foreground shadow-md shadow-primary/20" }}
                  activeOptions={{ exact: true }}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  key={item.to}
                  title="Modul berikutnya — belum dibangun"
                  className={cn(
                    "flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/45",
                  )}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </span>
              ),
            )}
          </nav>

          <div className="mt-6 rounded-2xl border border-border bg-secondary p-3">
            <p className="text-sm font-semibold text-foreground">{user?.displayName ?? user?.username}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {user?.role === "admin" ? "Manager" : "Barista"}
            </p>
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-background"
            >
              <LogOut className="size-3.5" /> Logout
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="panel-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Dashboard</p>
                <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 lg:hidden">
                <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                  {user?.role === "admin" ? "Manager" : "Barista"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                >
                  Logout
                </button>
              </div>

              <div className="ml-auto hidden flex-wrap items-center gap-2 lg:flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Notifikasi"
                      className="relative hidden h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-secondary sm:inline-flex"
                    >
                      <Bell className="size-4" />
                      {notificationCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {notificationCount > 99 ? "99+" : notificationCount}
                        </span>
                      ) : null}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-2xl border-border bg-card p-2 shadow-lg">
                    <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold text-foreground">
                      Notifikasi
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notificationContent ?? (
                      <div className="px-3 py-4 text-sm text-muted-foreground">Belum ada notifikasi.</div>
                    )}
                    {notificationFooter ? (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 pb-1 pt-2">{notificationFooter}</div>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="hidden items-center gap-2 rounded-xl border border-border bg-background px-2 py-1.5 sm:flex">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {initials || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="pr-1">
                    <p className="max-w-28 truncate text-xs font-semibold text-foreground">
                      {user?.displayName ?? user?.username}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {user?.role === "admin" ? "Manager" : "Barista"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {actions ? (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/80 pt-4">
                {actions}
              </div>
            ) : null}
          </header>

          <nav className="panel-surface mt-4 flex items-center gap-1 overflow-x-auto p-1.5 lg:hidden">
            {visibleNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-primary text-primary-foreground" }}
                activeOptions={{ exact: true }}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <main className="panel-surface mt-4 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
