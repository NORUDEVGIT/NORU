import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { GuestProfileWorkspace } from "@/packages/pms/components/workspaces/guest-profile-workspace";
import { parseGuestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/guests/$guestId")({
  ssr: false,
  validateSearch: parseGuestProfileSearch,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/pms/guests/${params.guestId}` },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Guest Profiles — NORU PMS" },
      {
        name: "description",
        content: "Individual guest information, identity text and profile history.",
      },
      { property: "og:title", content: "Guest Profiles — NORU PMS" },
      { property: "og:description", content: "Guest information and directory inside NORU PMS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestProfileDetailRoute,
});

function GuestProfileDetailRoute() {
  const { guestId } = Route.useParams();
  const { card, type } = Route.useSearch();
  return (
    <RestaurantShell
      active="Guests"
      module="rooms"
      pms
      pmsModule="guest-profile"
      pmsLeaf="Information"
    >
      {(m) => (
        <GuestProfileWorkspace
          membership={m}
          guestId={guestId}
          returnCard={card}
          profileType={type ?? "individual"}
        />
      )}
    </RestaurantShell>
  );
}
