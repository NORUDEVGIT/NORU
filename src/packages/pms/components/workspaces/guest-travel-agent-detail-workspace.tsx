import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  GuestDetailLoading,
  GuestDetailMissing,
} from "@/packages/pms/components/guests/guest-detail-nav";
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
import { GuestTravelAgencyCreateModal } from "@/packages/pms/components/guests/guest-travel-agency-create-modal";

import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type TravelAgentDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  TRAVEL_AGENT_DETAIL_MORE_ITEMS,
  TRAVEL_AGENT_DETAIL_PRIMARY_TABS,
  resolveCanonicalTravelAgentNavId,
  resolveInitialTravelAgentCommercialSubTab,
  resolveInitialTravelAgentContactsTravelersSubTab,
  type CanonicalTravelAgentViewId,
} from "@/packages/pms/lib/guest-travel-agent-detail-view";
import { travelAgentDetailNav } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import { getTravelAgentDetailWorkspace } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

type MenuItem = { id: string; label: string };

/** "Overview" button that opens a dropdown of buttons, one per section. */
function SectionMenu({
  items,
  activeId,
  onSelect,
}: {
  items: MenuItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = items.find((i) => i.id === activeId);

  return (
    <div className="relative inline-block" ref={ref} data-testid="travel-agent-detail-nav">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="travel-agent-nav-overview"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {active?.label ?? "Overview"}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={`travel-agent-nav-${item.id}`}
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent ${
                item.id === activeId ? "bg-accent font-medium" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

  function backToDirectory() {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: "travel-agent" }),
    });
  }

  if (query.isLoading) {
    return <GuestDetailLoading label="Loading travel agency…" />;
  }
  if (query.error || !query.data) {
    return (
      <GuestDetailMissing
        testId="travel-agent-detail-missing"
        title="Travel Agency not found"
        message={
          (query.error as Error | undefined)?.message ??
          "This travel agency is not available in the current property."
        }
        backLabel="Back to Travel Agents"
        onBack={backToDirectory}
      />
    );
  }

  const data = query.data;
  const canWrite = membership.role === "owner" || membership.role === "manager";
  const canManageRes =
    membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist";

  const contactsTravelersSubTab = resolveInitialTravelAgentContactsTravelersSubTab(navProp);
  const commercialSubTab = resolveInitialTravelAgentCommercialSubTab(navProp);

  const menuItems = [
    ...(TRAVEL_AGENT_DETAIL_PRIMARY_TABS as unknown as MenuItem[]),
    ...(TRAVEL_AGENT_DETAIL_MORE_ITEMS as unknown as MenuItem[]),
  ];

  return (
    <div className="space-y-4" data-testid="travel-agent-detail-workspace">
      <GuestTravelAgentHeader
        restaurantId={restaurantId}
        agency={data.agency}
        onEdit={() => setEditOpen(true)}
        onNavigate={(target) => selectNav(target as CanonicalTravelAgentViewId)}
        canManageRes={canManageRes}
      />

      {/* Overview button with dropdown of sections */}
      <SectionMenu
        items={menuItems}
        activeId={canonicalNavId}
        onSelect={(id) => selectNav(id as CanonicalTravelAgentViewId)}
      />

      {/* Canonical View Mounting */}
      <div className="pt-1" data-testid={`travel-agent-detail-view-content-${canonicalNavId}`}>
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
            agencyName={data.agency.name}
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
          <GuestTravelAgentDocumentsView restaurantId={restaurantId} agencyId={agencyId} />
        )}

        {canonicalNavId === "communication-notes" && (
          <GuestTravelAgentCommunicationNotesView restaurantId={restaurantId} agencyId={agencyId} />
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
      </div>

      {/* Canonical Edit Flow: Single canonical modal dialog */}
      <GuestTravelAgencyCreateModal
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        agencyId={agencyId}
        agency={accountQuery.data}
        onSaved={() => {
          void query.refetch();
          void accountQuery.refetch();
        }}
      />
    </div>
  );
}