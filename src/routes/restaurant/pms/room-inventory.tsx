import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { RoomsWorkspace } from "@/packages/pms/components/workspaces/rooms-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/room-inventory")({
  ssr: false,

  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/room-inventory" },
      });
    }

    await requireRoutePackage("pms");
  },

  head: () => ({
    meta: [
      { title: "Room & Inventory — NORU PMS" },
      {
        name: "description",
        content: "Operate room status, availability, restrictions and inventory readiness.",
      },
      {
        property: "og:title",
        content: "Room & Inventory — NORU PMS",
      },
      {
        property: "og:description",
        content: "Operate room status, availability, restrictions and inventory readiness.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),

  component: RoomInventoryPmsRoute,
});

function RoomInventoryPmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;

  return (
    <RestaurantShell
      active="Rooms"
      module="configuration"
      pms
      pmsModule="room-inventory"
      hidePackageRail
      hideTopHeader
    >
      {(m) => <RoomsWorkspace membership={m} initialTab={searchTab ?? "room-board"} />}
    </RestaurantShell>
  );
}
