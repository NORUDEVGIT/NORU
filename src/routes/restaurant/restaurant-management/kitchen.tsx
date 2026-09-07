/**
 * Phase 8F2 — canonical Restaurant Management route. Full-screen operating
 * surface: it renders the same shared workspace as the legacy address.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { RmContextBar } from "@/packages/restaurant-management/components/rm-context-bar";
import { RestaurantKitchen } from "@/packages/restaurant-management/components/workspaces/kitchen-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/kitchen")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/kitchen" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Kitchen Display — Restaurant Management — NORU" },
      { name: "description", content: "Live preparation board for the kitchen and service departments." },
      { property: "og:title", content: "Kitchen Display — Restaurant Management — NORU" },
      { property: "og:description", content: "Live preparation board for the kitchen and service departments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-dvh">
      <RmContextBar moduleKey="kitchen" note="Live preparation board for the kitchen and service departments." />
      <RestaurantKitchen />
    </div>
  );
}
