import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ChefHat,
  ReceiptText,
  QrCode,
  Users,
  UserRound,
  BarChart3,
  Settings,
  LogOut,
  Leaf,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants, type RestaurantMembership } from "@/lib/restaurant.functions";
import { useAuth } from "@/state/auth-store";
import { cn } from "@/lib/utils";

export type RestaurantNavLabel =
  | "Dashboard"
  | "Menu"
  | "Kitchen"
  | "Orders"
  | "Tables & QR"
  | "Staff"
  | "Customers"
  | "Reports"
  | "Settings";

const NAV: { to: string; label: RestaurantNavLabel; icon: typeof LayoutDashboard; ready: boolean }[] = [
  { to: "/restaurant/dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { to: "/restaurant/menu", label: "Menu", icon: UtensilsCrossed, ready: true },
  { to: "/restaurant/kitchen", label: "Kitchen", icon: ChefHat, ready: true },
  { to: "/restaurant/orders", label: "Orders", icon: ReceiptText, ready: true },
  { to: "/restaurant/tables", label: "Tables & QR", icon: QrCode, ready: true },
  { to: "/restaurant/staff", label: "Staff", icon: Users, ready: true },
  { to: "/restaurant/dashboard", label: "Customers", icon: UserRound, ready: false },
  { to: "/restaurant/dashboard", label: "Reports", icon: BarChart3, ready: false },
  { to: "/restaurant/settings", label: "Settings", icon: Settings, ready: true },
];

export function RestaurantShell({
  active,
  children,
}: {
  active: RestaurantNavLabel;
  children: (membership: RestaurantMembership) => ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const [navOpen, setNavOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: !!session && !!user?.id,
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/restaurant/login", replace: true });
  }

  const membership = data?.[0];
  const restaurant = membership?.restaurant;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link
        to="/restaurant/dashboard"
        className="flex items-center gap-2 px-2 font-display text-lg"
        onClick={() => setNavOpen(false)}
      >
        <Leaf className="size-5 text-primary" />
        Restaurant Portal
      </Link>
      <nav className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {NAV.map((item) => (

            <li key={item.label}>
              {item.ready ? (
                <Link
                  to={item.to}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active === item.label
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" /> {item.label}
                </Link>
              ) : (
                <span className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground/60">
                  <item.icon className="size-4 shrink-0" /> {item.label}
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Soon
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => void signOut()}>
        <LogOut className="mr-2 size-4" /> Log out
      </Button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="mx-auto flex w-full max-w-[1600px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-background lg:block">
          {sidebar}
        </aside>

        {/* Mobile drawer */}
        {navOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-background">
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute right-3 top-3 rounded-lg p-1 hover:bg-muted"
                onClick={() => setNavOpen(false)}
              >
                <X className="size-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                onClick={() => setNavOpen(true)}
              >
                <MenuIcon className="size-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">
                  {restaurant?.name ?? "Restaurant"}
                </p>
                <p className="text-xs text-muted-foreground">Restaurant Dashboard</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {restaurant ? <StatusPill status={restaurant.status} /> : null}
                <div className="hidden text-right sm:block">
                  <p className="max-w-[180px] truncate text-xs font-medium">{user?.email ?? ""}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">{membership?.role ?? ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void signOut()}>
                  <LogOut className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Log out</span>
                </Button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your restaurant…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">We couldn't load your restaurant. Please try again.</p>
            ) : !membership ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h1 className="font-display text-2xl">Access denied</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This account isn't linked to a restaurant. If you're a customer, head back to the menu — or register
                  your restaurant to get started.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild><Link to="/restaurant/register">Register a restaurant</Link></Button>
                  <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
                </div>
              </div>
            ) : (
              children(membership)
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RestaurantMembership["restaurant"]["status"] }) {
  const map = {
    approved: { label: "Active", className: "bg-primary/10 text-primary" },
    pending: { label: "Pending approval", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    suspended: { label: "Suspended", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
    rejected: { label: "Not approved", className: "bg-destructive/10 text-destructive" },
  }[status];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", map.className)}>
      {map.label}
    </span>
  );
}
