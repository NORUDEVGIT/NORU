import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

import { GuestTravelAgentHeader } from "@/packages/pms/components/guests/guest-travel-agent-header";
import { GuestTravelAgentOverviewView } from "@/packages/pms/components/guests/guest-travel-agent-overview-view";
import { GuestTravelAgentDetailsView } from "@/packages/pms/components/guests/guest-travel-agent-details-view";
import { GuestTravelAgentContactsTravelersView } from "@/packages/pms/components/guests/guest-travel-agent-contacts-travelers-view";
import { GuestTravelAgentBookingsView } from "@/packages/pms/components/guests/guest-travel-agent-bookings";
import { GuestTravelAgentCommercialCommissionView } from "@/packages/pms/components/guests/guest-travel-agent-commercial-commission-view";
import { GuestTravelAgentAgreementsView } from "@/packages/pms/components/guests/guest-travel-agent-agreements";
import { GuestTravelAgentDocumentsView } from "@/packages/pms/components/guests/guest-travel-agent-documents-view";
import { GuestTravelAgentCommunicationNotesView } from "@/packages/pms/components/guests/guest-travel-agent-communication-notes-view";
import { GuestTravelAgentActivityView } from "@/packages/pms/components/guests/guest-travel-agent-activity-view";
import { GuestTravelAgentSettingsView } from "@/packages/pms/components/guests/guest-travel-agent-settings-view";
import { GuestTravelAgentFormDialog } from "@/packages/pms/components/guests/guest-travel-agent-form-dialog";

// Canonical views preserve and map:
// GuestTravelAgentOverview
// GuestTravelAgentContacts
// GuestTravelAgentBookings
// GuestTravelAgentCommission
// GuestTravelAgentAgreements
// GuestTravelAgentBilling
// GuestTravelAgentDocuments
// GuestTravelAgentNotes
// GuestActivityHubCard
// GuestTravelAgentSettings

import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type TravelAgentDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  TRAVEL_AGENT_DETAIL_MORE_ITEMS,
  TRAVEL_AGENT_DETAIL_PRIMARY_TABS,
  isMoreTravelAgentView,
  resolveCanonicalTravelAgentNavId,
  resolveInitialTravelAgentCommercialSubTab,
  resolveInitialTravelAgentContactsTravelersSubTab,
  type CanonicalTravelAgentViewId,
} from "@/packages/pms/lib/guest-travel-agent-detail-view";
import { TRAVEL_AGENT_DETAIL_NAV, travelAgentDetailNav } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { getTravelAgentDetailWorkspace } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
  const canonicalNavId = resolveCanonicalTravelAgentNavId(navProp);
  const rawNavId = travelAgentDetailNav(navProp);
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

  function selectNav(next: CanonicalTravelAgentViewId | TravelAgentDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: agencyId },
      search: guestProfileSearch({ nav: next as TravelAgentDetailNavId, type: "travel-agent" }),
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

  const isMoreActive = isMoreTravelAgentView(canonicalNavId);
  const activeMoreItem = TRAVEL_AGENT_DETAIL_MORE_ITEMS.find((item) => item.id === canonicalNavId);

  const contactsTravelersSubTab = resolveInitialTravelAgentContactsTravelersSubTab(navProp);
  const commercialSubTab = resolveInitialTravelAgentCommercialSubTab(navProp);

  return (
    <div className="space-y-6" data-testid="travel-agent-detail-workspace">
      <GuestTravelAgentHeader
        restaurantId={restaurantId}
        agency={data.agency}
        onEdit={() => setEditOpen(true)}
        onNavigate={(target) => selectNav(target as CanonicalTravelAgentViewId)}
        canManageRes={canManageRes}
      />

      {/* Modern 5-Primary Tabs + More Dropdown Navigation */}
      <nav
        aria-label="Travel agency sections"
        className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#DDD4C5] pb-px"
        role="tablist"
        data-testid="travel-agent-detail-nav"
      >
        {TRAVEL_AGENT_DETAIL_PRIMARY_TABS.map((item) => {
          const active = item.id === canonicalNavId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`travel-agent-nav-${item.id}`}
              onClick={() => selectNav(item.id)}
              className={cn(
                "shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-[#C89933] text-[#251605] font-semibold"
                  : "border-transparent text-[#756A5B] hover:text-[#251605]",
              )}
            >
              {item.label}
            </button>
          );
        })}

        {/* More ▾ Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              role="tab"
              aria-selected={isMoreActive}
              data-testid="travel-agent-nav-more"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isMoreActive
                  ? "border-[#C89933] text-[#251605] font-semibold"
                  : "border-transparent text-[#756A5B] hover:text-[#251605]",
              )}
            >
              <span>{isMoreActive && activeMoreItem ? activeMoreItem.label : "More"}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {TRAVEL_AGENT_DETAIL_MORE_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => selectNav(item.id)}
                className={cn(
                  "cursor-pointer text-xs font-medium",
                  canonicalNavId === item.id ? "bg-[#F7F4EE] text-[#251605] font-bold" : "text-[#756A5B]",
                )}
                data-testid={`travel-agent-nav-${item.id}`}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Canonical View Mounting */}
      {canonicalNavId === "overview" && (
        <GuestTravelAgentOverviewView
          restaurantId={restaurantId}
          agencyId={agencyId}
          data={data}
          onNavigate={(target) => selectNav(target as CanonicalTravelAgentViewId)}
          onEdit={() => setEditOpen(true)}
          canManageRes={canManageRes}
        />
      )}

      {canonicalNavId === "details" && (
        <GuestTravelAgentDetailsView
          restaurantId={restaurantId}
          agencyId={agencyId}
          onOpenEditDialog={() => setEditOpen(true)}
        />
      )}

      {canonicalNavId === "contacts-travelers" && (
        <GuestTravelAgentContactsTravelersView
          restaurantId={restaurantId}
          agencyId={agencyId}
          agencyName={data.agency.name}
          initialSubTab={contactsTravelersSubTab}
          onEditAgency={() => setEditOpen(true)}
        />
      )}

      {canonicalNavId === "bookings" && (
        <GuestTravelAgentBookingsView
          restaurantId={restaurantId}
          agencyId={agencyId}
          canManage={canManageRes}
        />
      )}

      {canonicalNavId === "commercial-commission" && (
        <GuestTravelAgentCommercialCommissionView
          restaurantId={restaurantId}
          agencyId={agencyId}
          initialSubTab={commercialSubTab}
          onOpenSettings={() => selectNav("settings")}
        />
      )}

      {canonicalNavId === "agreements" && (
        <GuestTravelAgentAgreementsView
          restaurantId={restaurantId}
          agencyId={agencyId}
          canWrite={canWrite}
        />
      )}

      {canonicalNavId === "documents" && (
        <GuestTravelAgentDocumentsView
          restaurantId={restaurantId}
          agencyId={agencyId}
        />
      )}

      {canonicalNavId === "communication-notes" && (
        <GuestTravelAgentCommunicationNotesView
          restaurantId={restaurantId}
          agencyId={agencyId}
        />
      )}

      {canonicalNavId === "activity" && (
        <GuestTravelAgentActivityView
          restaurantId={restaurantId}
          agencyId={agencyId}
          agencyName={data.agency.name}
        />
      )}

      {canonicalNavId === "settings" && (
        <GuestTravelAgentSettingsView
          restaurantId={restaurantId}
          agencyId={agencyId}
          agency={data.agency}
          initialSection={rawNavId as any}
          onNavigateTab={(tab) => selectNav(tab as CanonicalTravelAgentViewId)}
        />
      )}

      {/* Canonical Edit Flow: Single canonical modal dialog */}
      <GuestTravelAgentFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        account={accountQuery.data}
        accountId={agencyId}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
