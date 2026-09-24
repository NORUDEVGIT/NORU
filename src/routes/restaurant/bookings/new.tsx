import { createFileRoute, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { CreateReservationPage } from "@/packages/pms/components/bookings/create-reservation-page";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED } from "@/packages/pms/lib/create-reservation-phase1";

export const Route = createFileRoute("/restaurant/bookings/new")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/bookings/new" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "New Reservation — Front Office — NORU" },
      {
        name: "description",
        content:
          "Create a hotel reservation: pick the guest, stay dates, room type and optional room assignment.",
      },
      { property: "og:title", content: "New Reservation — NORU" },
      {
        property: "og:description",
        content: "Create a reservation with live room-type availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewReservationRoute,
});

function NewReservationRoute() {
  return (
    <RestaurantShell
      active="New Reservation"
      sidebarDefaultCollapsed={CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED}
    >
      {(m) => <CreateReservationPage membership={m} />}
    </RestaurantShell>
  );
}
