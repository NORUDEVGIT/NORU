import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { GuestProfileWorkspace } from "@/packages/pms/components/workspaces/guest-profile-workspace";
import { parseGuestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/guests/")({
  ssr: false,
  validateSearch: parseGuestProfileSearch,
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
      { title: "Guest Profiles — NORU PMS" },
      {
        name: "description",
        content:
          "Guest directory: individuals plus Company, Group account and Travel Agent masters.",
      },
      { property: "og:title", content: "Guest Profiles — NORU PMS" },
      { property: "og:description", content: "Search, create and open guest and account masters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestProfileDirectoryRoute,
});

function GuestProfileDirectoryRoute() {
  const { card, type, nav } = Route.useSearch();
  return (
    <RestaurantShell active="Guests" module="rooms" pms pmsModule="guest-profile">
      {(m) => (
        <GuestProfileWorkspace
          membership={m}
          returnCard={card}
          returnNav={nav}
          profileType={type ?? "individual"}
        />
      )}
    </RestaurantShell>
  );
}
