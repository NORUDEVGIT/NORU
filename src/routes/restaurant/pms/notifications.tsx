import { createFileRoute, redirect } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { PmsPlaceholder } from "@/packages/pms/components/pms/pms-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/notifications")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/notifications" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Notifications & Communications — NORU PMS" },
      {
        name: "description",
        content: "Guest and staff messaging, confirmations and operational alerts.",
      },
      { property: "og:title", content: "Notifications & Communications — NORU PMS" },
      { property: "og:description", content: "Guest and staff messaging for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RestaurantShell active="PMS" pmsModule="notifications">
      {() => (
        <PmsPlaceholder
          title="Notifications & Communications"
          icon={Bell}
          description="Guest messaging and internal operational alerts."
          planned={[
            "Booking confirmation and pre-arrival messages",
            "Internal alerts for arrivals, discrepancies and audit exceptions",
            "Message history on the guest profile",
          ]}
        />
      )}
    </RestaurantShell>
  ),
});
