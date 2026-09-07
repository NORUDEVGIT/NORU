import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { KitchenBoard } from "@/components/kitchen-board";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants, type RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRmRoutes } from "@/lib/rm-routes";
import { useAuth } from "@/core/state/auth-store";

/** Roles allowed to run the kitchen. Waiters are intentionally excluded. */
const KITCHEN_ROLES = ["owner", "manager", "kitchen"];


function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="font-display text-2xl">{title}</h1>
        <div className="mt-3 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function RestaurantKitchen() {
  const rm = useRmRoutes();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  if (isLoading) return <Shell title="Loading kitchen…">Checking your restaurant access.</Shell>;
  if (isError) return <Shell title="Something went wrong">We couldn't load your restaurant access. Please try again.</Shell>;

  // Authorisation comes from active restaurant_users memberships only.
  const allowed = (data ?? []).filter((m) => KITCHEN_ROLES.includes(m.role));

  if (allowed.length === 0) {
    return (
      <Shell title="Access denied">
        <p>This account doesn't have kitchen access for any restaurant.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
          <Button onClick={() => void signOut()}>Log out</Button>
        </div>
      </Shell>
    );
  }

  const membership: RestaurantMembership | undefined =
    allowed.length === 1 ? allowed[0] : allowed.find((m) => m.restaurantId === selectedId);

  if (!membership) {
    return (
      <Shell title="Choose a restaurant">
        <p>You have kitchen access to more than one restaurant.</p>
        <div className="mt-4 grid gap-2">
          {allowed.map((m) => (
            <Button key={m.restaurantId} variant="outline" onClick={() => setSelectedId(m.restaurantId)}>
              {m.restaurant.name}
            </Button>
          ))}
        </div>
      </Shell>
    );
  }

  if (!membership.restaurant.active) {
    return (
      <Shell title="Restaurant suspended">
        <p>
          {membership.restaurant.name} is currently suspended, so the kitchen isn't accepting orders.
          {membership.restaurant.suspensionReason ? ` Reason: ${membership.restaurant.suspensionReason}` : ""}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Button asChild variant="outline"><Link to={rm.dashboard}>Back to dashboard</Link></Button>
        </div>
      </Shell>
    );
  }

  return (
    <KitchenBoard
      restaurantId={membership.restaurantId}
      restaurantName={membership.restaurant.name}
      onSignOut={signOut}
      headerExtra={
        <>
          {!membership.restaurant.approved && (
            <span className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Not live yet — awaiting approval
            </span>
          )}
          <Button asChild variant="ghost" size="lg">
            <Link to={rm.dashboard}>Dashboard</Link>
          </Button>
        </>
      }
    />
  );
}