import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { DistributionWorkspace } from "@/components/workspaces/distribution-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/distribution")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/distribution" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Distribution — NORU PMS" },
      { name: "description", content: "Direct booking engine, channels and booking activity for your property." },
      { property: "og:title", content: "Distribution — NORU PMS" },
      { property: "og:description", content: "Direct booking engine, channels and booking activity for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DistributionPmsRoute,
});

function DistributionPmsRoute() {
  return (
    <RestaurantShell active="Distribution" module="configuration" pms>
      {(m) => <DistributionWorkspace membership={m} />}
    </RestaurantShell>
  );
}
