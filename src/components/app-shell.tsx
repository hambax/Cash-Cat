import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { BookOpen, ChevronLeft, ChevronRight, Hash, LayoutDashboard, List, Settings, Tags } from "lucide-react";
import { GetStartedDialog } from "@/components/get-started-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const SIDEBAR_COLLAPSED_KEY = "cashcat.sidebarCollapsed";

const nav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/transactions", label: "Transactions", icon: List },
  { to: "/tags", label: "Tags", icon: Hash },
  { to: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (to === "/categories") return pathname === "/categories" || pathname.startsWith("/categories/");
  return pathname === to;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-sidebar py-4 transition-[width] duration-200 ease-out",
          sidebarCollapsed ? "w-[3.75rem] px-2" : "w-56 px-3",
        )}
      >
        <div className={cn("mb-4 flex items-start gap-1", sidebarCollapsed ? "flex-col items-center" : "justify-between gap-2")}>
          <div
            className={cn(
              "flex min-w-0 items-center gap-3",
              sidebarCollapsed ? "flex-col justify-center" : "flex-1 px-2",
            )}
          >
            <img
              src="/cash-cat-logo.svg"
              alt=""
              width={36}
              height={36}
              className={cn("shrink-0 object-contain", sidebarCollapsed ? "h-8 w-8" : "h-9 w-9")}
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold">Cash Cat</p>
                <p className="text-xs text-muted-foreground">Local finances</p>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {nav.map((item) => {
            const active = isNavActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-xl py-2 text-sm font-medium transition-colors",
                  sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {!sidebarCollapsed && item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto shrink-0 space-y-3 pt-4">
          <Button
            type="button"
            className={cn("rounded-xl", sidebarCollapsed ? "h-9 w-full px-0" : "w-full")}
            onClick={() => setGetStartedOpen(true)}
            title="Get started"
            aria-label="Get started"
          >
            {sidebarCollapsed ? <BookOpen className="h-4 w-4" aria-hidden /> : "Get started"}
          </Button>
          {!sidebarCollapsed && (
            <>
              <Separator />
              <p className="px-1 text-xs text-muted-foreground">
                Your data stays on this device. No cloud analytics in v1.
              </p>
            </>
          )}
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      <GetStartedDialog open={getStartedOpen} onOpenChange={setGetStartedOpen} />
    </div>
  );
}
