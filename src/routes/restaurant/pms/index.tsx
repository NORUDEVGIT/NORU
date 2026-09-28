import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { PmsHomeDesk } from "@/packages/pms/components/pms/pms-home-desk";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";

export const Route = createFileRoute("/restaurant/pms/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pms" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "PMS Home — NORU" },
      {
        name: "description",
        content: "NORU PMS: front office, reservations, guests, rooms, housekeeping, cashiering, rates, night audit, reports and settings.",
      },
      { property: "og:title", content: "PMS Home — NORU" },
      {
        property: "og:description",
        content: "The hotel operating system for this property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PmsHomeRoute,
});

function PmsHomeRoute() {
  const [moduleQuery, setModuleQuery] = useState("");
  return (
    <RestaurantShell active="PMS" pms hidePackageRail hideTopHeader>
      {(membership) => (
        <RoomInventoryChrome
          membership={membership}
          activeModule={null}
          onRoomSearch={setModuleQuery}
          onSearchChange={setModuleQuery}
          searchPlaceholder="Search modules…"
          helpLabel="PMS home"
          shellTestId="pms-home-command-shell"
        >
          <PmsHomeDesk membership={membership} moduleQuery={moduleQuery} />
        </RoomInventoryChrome>
      )}
    </RestaurantShell>
  );
}
