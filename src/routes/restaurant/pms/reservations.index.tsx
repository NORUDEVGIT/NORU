import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { ReservationsWorkspace } from "@/components/workspaces/reservations-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/reservations/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/reservations" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Reservations — NORU PMS" },
      { name: "description", content: "Search, filter and manage hotel reservations for your property." },
      { property: "og:title", content: "Reservations — NORU PMS" },
      { property: "og:description", content: "Search, filter and manage hotel reservations for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReservationsPmsRoute,
});

function ReservationsPmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Reservations" module="rooms" pms pmsModule="reservations">
      {(m) => <ReservationsWorkspace membership={m} initialTab={searchTab ?? "individual"} />}
    </RestaurantShell>
  );
}
