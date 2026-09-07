import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { RoomsWorkspace } from "@/packages/pms/components/workspaces/rooms-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/rooms/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Front Office — NORU" },
      {
        name: "description",
        content: "Manage arrivals, in-house guests, departures and reservations for your property in NORU.",
      },
      { property: "og:title", content: "Front Office — NORU" },
      { property: "og:description", content: "Daily hotel operations: arrivals, in-house guests, departures and reservations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomsRoute,
});

function RoomsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  const configTab = searchTab === "rooms" || searchTab === "types";
  return (
    <RestaurantShell active="Rooms" module={configTab ? "configuration" : "rooms"}>
      {(m) => <RoomsWorkspace membership={m} initialTab={searchTab ?? undefined} />}
    </RestaurantShell>
  );
}
