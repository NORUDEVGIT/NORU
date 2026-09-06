import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { ConfigurationWorkspace } from "@/components/workspaces/configuration-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/property-setup")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/property-setup" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Property Setup — NORU PMS" },
      { name: "description", content: "Rooms, rates, distribution and operational master data for your property." },
      { property: "og:title", content: "Property Setup — NORU PMS" },
      { property: "og:description", content: "Rooms, rates, distribution and operational master data for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertySetupPmsRoute,
});

function PropertySetupPmsRoute() {
  return (
    <RestaurantShell active="Configuration" module="configuration" pms pmsModule="property-setup">
      {(m) => <ConfigurationWorkspace membership={m} />}
    </RestaurantShell>
  );
}
