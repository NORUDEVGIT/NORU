import { type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, UtensilsCrossed, ChefHat, ReceiptText, QrCode, Users, Settings, LogOut, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants, type RestaurantMembership } from "@/lib/restaurant.functions";
import { useAuth } from "@/state/auth-store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/restaurant/dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { to: "/restaurant/menu", label: "Menu", icon: UtensilsCrossed, ready: true },
  { to: "/restaurant/kitchen", label: "Kitchen", icon: ChefHat, ready: true },
  { to: "/restaurant/dashboard", label: "Orders", icon: ReceiptText, ready: false },
  { to: "/restaurant/dashboard", label: "Tables & QR Codes", icon: QrCode, ready: false },
  { to: "/restaurant/dashboard", label: "Staff", icon: Users, ready: false },
  { to: "/restaurant/settings", label: "Settings", icon: Settings, ready: true },
] as const;

export function RestaurantShell({
  active,
  children,
}: {
  active: "Dashboard" | "Settings" | "Kitchen" | "Menu";
  children: (membership: RestaurantMembership) => ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-restaurants"],
    queryFn: () => fetchRestaurants(),
    enabled: !!session,
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/restaurant/login", replace: true });
  }

  const membership = data?.[0];

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/restaurant/dashboard" className="flex items-center gap-2 font-display text-lg">
            <Leaf className="size-5 text-primary" />
            Restaurant Portal
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-2 size-4" /> Log out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
        <nav className="md:w-56 md:shrink-0">
          <ul className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.map((item) => (
              <li key={item.label}>
                {item.ready ? (
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium",
                      active === item.label ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <item.icon className="size-4" /> {item.label}
                  </Link>
                ) : (
                  <span
                    title="Coming in the next setup phase"
                    className="flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-muted-foreground/70"
                  >
                    <item.icon className="size-4" /> {item.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 hidden text-xs text-muted-foreground md:block">
            Orders, Tables & Staff are coming in the next setup phase.
          </p>
        </nav>

        <main className="min-w-0 flex-1">
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
  );
}