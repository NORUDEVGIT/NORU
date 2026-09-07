import { createFileRoute, redirect } from "@tanstack/react-router";
import { PartyPopper } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { PmsPlaceholder } from "@/components/pms/pms-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/sales-events")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/sales-events" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Sales & Events — NORU PMS" },
      {
        name: "description",
        content: "Group business, corporate accounts and event bookings for your property.",
      },
      { property: "og:title", content: "Sales & Events — NORU PMS" },
      { property: "og:description", content: "Group and event business management in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RestaurantShell active="PMS" pmsModule="sales-events">
      {() => (
        <PmsPlaceholder
          title="Sales & Events"
          icon={PartyPopper}
          description="Group blocks, corporate accounts and event bookings."
          planned={[
            "Group blocks linked to room availability",
            "Corporate and travel-agent accounts",
            "Event and meeting-space bookings with catering handover",
          ]}
        />
      )}
    </RestaurantShell>
  ),
});
