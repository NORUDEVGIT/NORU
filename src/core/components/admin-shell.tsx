import { type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Store, Users, Settings, LogOut } from "lucide-react";
import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { amIPlatformAdmin } from "@/core/lib/admin.functions";
import { useAuth } from "@/core/state/auth-store";
import { cn } from "@/shared/lib/utils";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/restaurants", label: "Restaurants", icon: Store },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export type AdminNav = (typeof NAV)[number]["label"];

export function AdminShell({ active, children }: { active: AdminNav; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading } = useAuth();
  const check = useServerFn(amIPlatformAdmin);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["am-i-platform-admin"],
    queryFn: () => check(),
    enabled: !!session,
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/admin/login", replace: true });
  }

  const authorized = data?.isAdmin === true;
  const checking = loading || (!!session && isLoading);

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-3 font-semibold tracking-tight">
            <NoruLogo size="sm" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Platform Admin
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <nav className="md:w-52 md:shrink-0">
          <ul className="flex gap-2 overflow-x-auto md:flex-col">
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                    active === item.label ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <item.icon className="size-4" /> {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          {checking ? (
            <p className="text-sm text-muted-foreground">Checking access…</p>
          ) : !authorized || isError ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <h1 className="text-xl font-semibold">Administrator access required</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This account is not authorized for the platform administration area.
              </p>
              <Button className="mt-4" onClick={() => void signOut()}>Sign in as an administrator</Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: "pending" | "approved" | "suspended" | "rejected" }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    approved: "bg-success/15 text-success",
    suspended: "bg-orange-600/15 text-orange-700 dark:text-orange-400",
    rejected: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", styles[status])}>
      {status}
    </span>
  );
}
