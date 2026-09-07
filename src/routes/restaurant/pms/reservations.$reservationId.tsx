import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { ReservationDetailWorkspace } from "@/components/workspaces/reservation-detail-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/reservations/$reservationId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pms/reservations" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Reservation — NORU PMS" },
      {
        name: "description",
        content: "Reservation detail: stay dates, room assignment, pricing, status actions and change history.",
      },
      { property: "og:title", content: "Reservation — NORU PMS" },
      { property: "og:description", content: "Manage a single reservation for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReservationDetailPmsRoute,
});

function ReservationDetailPmsRoute() {
  const { reservationId } = Route.useParams();
  return (
    <RestaurantShell active="Reservations" module="rooms" pms pmsModule="reservations">
      {(m) => <ReservationDetailWorkspace membership={m} reservationId={reservationId} />}
    </RestaurantShell>
  );
}
