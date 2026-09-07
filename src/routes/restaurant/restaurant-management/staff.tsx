/**
 * Phase 8F2 — canonical Restaurant Management route. The screen itself is the
 * shared workspace component; no business logic lives here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { StaffWorkspace } from "@/core/components/workspaces/staff-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/staff")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/staff" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Staff & Workforce Management — Restaurant Management — NORU" },
      { name: "description", content: "Restaurant team, roles, schedule and attendance." },
      { property: "og:title", content: "Staff & Workforce Management — Restaurant Management — NORU" },
      { property: "og:description", content: "Restaurant team, roles, schedule and attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Restaurant Management" rmModule="staff">
      {(m) => <StaffWorkspace membership={m} initialTab={searchTab ?? undefined} />}
    </RestaurantShell>
  );
}
