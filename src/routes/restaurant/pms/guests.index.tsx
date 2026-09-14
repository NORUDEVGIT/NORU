import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { GuestProfileWorkspace } from "@/packages/pms/components/workspaces/guest-profile-workspace";
import { parseGuestProfileCardSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/guests/")({
  ssr: false,
  validateSearch: parseGuestProfileCardSearch,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/guests" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Guest Profile — NORU PMS" },
      {
        name: "description",
        content: "Individual guest directory and information for your property.",
      },
      { property: "og:title", content: "Guest Profile — NORU PMS" },
      { property: "og:description", content: "Search, create and open individual guest profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestProfileDirectoryRoute,
});

function GuestProfileDirectoryRoute() {
  const { card } = Route.useSearch();
  return (
    <RestaurantShell active="Guests" module="rooms" pms pmsModule="guest-profile">
      {(m) => <GuestProfileWorkspace membership={m} returnCard={card} />}
    </RestaurantShell>
  );
}
