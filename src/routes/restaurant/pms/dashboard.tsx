import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { PmsHomeDesk } from "@/packages/pms/components/pms/pms-home-desk";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/dashboard")({
  ssr: false,

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/dashboard" },
      });
    }

    await requireRoutePackage("pms");
  },

  head: () => ({
    meta: [
      { title: "PMS — NORU" },
      {
        name: "description",
        content: "Welcome screen for this property’s hotel operating system.",
      },
      { property: "og:title", content: "PMS — NORU" },
      {
        property: "og:description",
        content: "Welcome screen for this property’s hotel operating system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),

  component: DashboardPmsRoute,
});

function DashboardPmsRoute() {
  return (
    <RestaurantShell active="PMS" pms hidePackageRail hideTopHeader>
      {(membership) => (
        <RoomInventoryChrome
          membership={membership}
          activeModule={null}
          showSearch={false}
          helpLabel="PMS welcome screen"
          shellTestId="pms-welcome-command-shell"
          contentClassName="p-0"
          fillViewport
          suppressReturnButton
        >
          <PmsHomeDesk membership={membership} />
        </RoomInventoryChrome>
      )}
    </RestaurantShell>
  );
}
