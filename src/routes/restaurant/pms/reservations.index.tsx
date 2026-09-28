import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { ReservationsWorkspace } from "@/packages/pms/components/workspaces/reservations-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReservationsRouteSearch = {
  tab?: string;
  create?: "new";
  guestId?: string;
  companyId?: string;
  travelAgentId?: string;
};

export const Route = createFileRoute("/restaurant/pms/reservations/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ReservationsRouteSearch => {
    const result: ReservationsRouteSearch = {};
    if (typeof search["tab"] === "string" && search["tab"].trim()) {
      result.tab = search["tab"].trim();
    }
    if (search["create"] === "new") {
      result.create = "new";
    }
    if (
      typeof search["guestId"] === "string" &&
      UUID_REGEX.test(search["guestId"].trim())
    ) {
      result.guestId = search["guestId"].trim();
    }
    if (
      typeof search["companyId"] === "string" &&
      UUID_REGEX.test(search["companyId"].trim())
    ) {
      result.companyId = search["companyId"].trim();
    }
    const rawTaId = search["travelAgentId"] ?? search["travelAgentMasterId"];
    if (
      typeof rawTaId === "string" &&
      UUID_REGEX.test(rawTaId.trim())
    ) {
      result.travelAgentId = rawTaId.trim();
    }
    return result;
  },
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/reservations" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Reservations — NORU PMS" },
      {
        name: "description",
        content: "Search, filter and manage hotel reservations for your property.",
      },
      { property: "og:title", content: "Reservations — NORU PMS" },
      {
        property: "og:description",
        content: "Search, filter and manage hotel reservations for your property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReservationsPmsRoute,
});

function ReservationsPmsRoute() {
  const search = Route.useSearch() as ReservationsRouteSearch;
  return (
    <RestaurantShell
      active="Reservations"
      module="rooms"
      pms
      pmsModule="reservations"
      hidePackageRail
      hideTopHeader
    >
      {(m) => (
        <ReservationsWorkspace
          membership={m}
          initialTab={search.tab ?? "individual"}
          initialCreate={search.create === "new"}
          initialGuestId={search.guestId}
          initialCompanyId={search.companyId}
          initialTravelAgentId={search.travelAgentId}
        />
      )}
    </RestaurantShell>
  );
}
