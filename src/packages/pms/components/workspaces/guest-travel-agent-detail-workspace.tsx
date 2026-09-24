import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestTravelAgentHeader } from "@/packages/pms/components/guests/guest-travel-agent-header";
import { GuestTravelAgentOverview } from "@/packages/pms/components/guests/guest-travel-agent-overview";
import { GuestTravelAgentContacts } from "@/packages/pms/components/guests/guest-travel-agent-contacts";
import { GuestTravelAgentBookings } from "@/packages/pms/components/guests/guest-travel-agent-bookings";
import { GuestTravelAgentCommission } from "@/packages/pms/components/guests/guest-travel-agent-commission";
import { GuestTravelAgentAgreements } from "@/packages/pms/components/guests/guest-travel-agent-agreements";
import { GuestTravelAgentBilling } from "@/packages/pms/components/guests/guest-travel-agent-billing";
import { GuestTravelAgentDocuments } from "@/packages/pms/components/guests/guest-travel-agent-documents";
import { GuestTravelAgentNotes } from "@/packages/pms/components/guests/guest-travel-agent-notes";
import { GuestTravelAgentSettings } from "@/packages/pms/components/guests/guest-travel-agent-settings";
import { GuestTravelAgentFormDialog } from "@/packages/pms/components/guests/guest-travel-agent-form-dialog";
import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type TravelAgentDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  TRAVEL_AGENT_DETAIL_NAV,
  travelAgentDetailNav,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { getTravelAgentDetailWorkspace } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestTravelAgentDetailWorkspace({
  membership,
  agencyId,
  nav: navProp,
}: {
  membership: RestaurantMembership;
  agencyId: string;
  nav?: string | undefined;
}) {
  const navigate = useNavigate();
  const restaurantId = membership.restaurant.id;
  const navId = travelAgentDetailNav(navProp);
  const [editOpen, setEditOpen] = useState(false);
  const load = useServerFn(getTravelAgentDetailWorkspace);
  const fetchAccount = useServerFn(getGuestAccount);
  const query = useQuery({
    queryKey: ["travel-agent-detail", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
    retry: false,
  });
  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, agencyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: agencyId } }),
    enabled: editOpen,
    retry: false,
  });

  function selectNav(next: TravelAgentDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: agencyId },
      search: guestProfileSearch({ nav: next, type: "travel-agent" }),
    });
  }

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading travel agency…</p>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="travel-agent-detail-missing">
        <p className="font-display text-lg">Travel Agency not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(query.error as Error | undefined)?.message ?? "This travel agency is not available in the current property."}
        </p>
      </div>
    );
  }

  const data = query.data;
  const canWrite = membership.role === "owner" || membership.role === "manager";
  const canManageRes =
    membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist";

  return (
    <div className="space-y-6" data-testid="travel-agent-detail-workspace">
      <GuestTravelAgentHeader
        restaurantId={restaurantId}
        agency={data.agency}
        onEdit={() => setEditOpen(true)}
        onNavigate={selectNav}
        canManageRes={canManageRes}
      />
      <nav
        aria-label="Travel agency sections"
        className="flex w-full gap-1 overflow-x-auto border-b border-border pb-px"
        role="tablist"
        data-testid="travel-agent-detail-nav"
      >
        {TRAVEL_AGENT_DETAIL_NAV.map((item) => {
          const active = item.id === navId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`travel-agent-nav-${item.id}`}
              onClick={() => selectNav(item.id)}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.title}
            </button>
          );
        })}
      </nav>

      {navId === "overview" ? (
        <GuestTravelAgentOverview
          restaurantId={restaurantId}
          agencyId={agencyId}
          data={data}
          onNavigate={selectNav}
          onEdit={() => setEditOpen(true)}
          canManageRes={canManageRes}
        />
      ) : navId === "contacts" ? (
        <GuestTravelAgentContacts restaurantId={restaurantId} agencyId={agencyId} />
      ) : navId === "bookings" ? (
        <GuestTravelAgentBookings restaurantId={restaurantId} agencyId={agencyId} canManage={canManageRes} />
      ) : navId === "commission" ? (
        <GuestTravelAgentCommission restaurantId={restaurantId} agencyId={agencyId} onOpenSettings={selectNav} />
      ) : navId === "agreements" ? (
        <GuestTravelAgentAgreements restaurantId={restaurantId} agencyId={agencyId} canWrite={canWrite} />
      ) : navId === "payment" ? (
        <GuestTravelAgentBilling restaurantId={restaurantId} agencyId={agencyId} />
      ) : navId === "documents" ? (
        <GuestTravelAgentDocuments restaurantId={restaurantId} agencyId={agencyId} />
      ) : navId === "notes" ? (
        <GuestTravelAgentNotes restaurantId={restaurantId} agencyId={agencyId} />
      ) : navId === "history" ? (
        <GuestActivityHubCard
          restaurantId={restaurantId}
          accountId={agencyId}
          partyName={data.agency.name}
          showFilters
        />
      ) : (
        <GuestTravelAgentSettings restaurantId={restaurantId} agencyId={agencyId} agency={data.agency} />
      )}

      <GuestTravelAgentFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        account={accountQuery.data}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
