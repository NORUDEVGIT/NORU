import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { GuestDetailWorkspace } from "@/components/workspaces/guest-detail-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/reservations/guests/$guestId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pms/reservations" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Guest profile — NORU PMS" },
      {
        name: "description",
        content: "Guest identity, preferences, stay history and profile history inside PMS Reservations.",
      },
      { property: "og:title", content: "Guest profile — NORU PMS" },
      { property: "og:description", content: "Guest overview, preferences and history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestDetailPmsRoute,
});

function GuestDetailPmsRoute() {
  const { guestId } = Route.useParams();
  return (
    <RestaurantShell active="Reservations" module="rooms" pms pmsModule="reservations">
      {(m) => <GuestDetailWorkspace membership={m} guestId={guestId} backTo="reservations" />}
    </RestaurantShell>
  );
}
