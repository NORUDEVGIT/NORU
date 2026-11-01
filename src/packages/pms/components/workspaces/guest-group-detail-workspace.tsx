import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  GuestDetailLoading,
  GuestDetailMissing,
} from "@/packages/pms/components/guests/guest-detail-nav";
import { GuestGroupHeader } from "@/packages/pms/components/guests/guest-group-header";
import { GuestGroupOverviewView } from "@/packages/pms/components/guests/guest-group-overview-view";
import { GuestGroupMasterView } from "@/packages/pms/components/guests/guest-group-master-view";
import { GuestGroupMembersView } from "@/packages/pms/components/guests/guest-group-members-view";
import { GuestGroupReservationsView } from "@/packages/pms/components/guests/guest-group-reservations-view";
import { GuestGroupRoomingView } from "@/packages/pms/components/guests/guest-group-rooming-view";
import { GuestGroupCommunicationView } from "@/packages/pms/components/guests/guest-group-communication-view";
import { GuestGroupFinancialView } from "@/packages/pms/components/guests/guest-group-financial-view";
import { GuestGroupItineraryView } from "@/packages/pms/components/guests/guest-group-itinerary-view";
import { GuestGroupDocumentsView } from "@/packages/pms/components/guests/guest-group-documents-view";
import { GuestGroupActivityView } from "@/packages/pms/components/guests/guest-group-activity-view";
import { GuestGroupCreateModal } from "@/packages/pms/components/guests/guest-group-create-modal";

import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GroupDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GROUP_DETAIL_PRIMARY_TABS,
  GROUP_DETAIL_MORE_ITEMS,
  resolveCanonicalGroupNavId,
  type CanonicalGroupViewId,
} from "@/packages/pms/lib/guest-group-detail-view";
import { isGroupCancelled } from "@/packages/pms/lib/guest-group-detail-workspace";
import { getGroupDetailWorkspace } from "@/packages/pms/lib/guest-group-detail.functions";
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
    <div className="relative inline-block" ref={ref} data-testid="group-detail-nav">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="group-nav-overview"
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
              data-testid={`group-nav-${item.id}`}
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

export function GuestGroupDetailWorkspace({
  membership,
  groupId,
  nav: navProp,
}: {
  membership: RestaurantMembership;
  groupId: string;
  nav?: string | undefined;
}) {
  const navigate = useNavigate();
  const restaurantId = membership.restaurant.id;
  const canonicalNavId = resolveCanonicalGroupNavId(navProp);
  const [editOpen, setEditOpen] = useState(false);

  const load = useServerFn(getGroupDetailWorkspace);
  const query = useQuery({
    queryKey: ["group-detail", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
    retry: false,
  });

  function selectNav(next: CanonicalGroupViewId | GroupDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: groupId },
      search: guestProfileSearch({ nav: next as GroupDetailNavId, type: "group" }),
    });
  }

  function backToDirectory() {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: "group" }),
    });
  }

  if (query.isLoading) {
    return <GuestDetailLoading label="Loading group…" />;
  }

  if (query.error || !query.data) {
    const message = (query.error as Error | undefined)?.message;
    const missing = !message || /could not be found/i.test(message);
    return (
      <GuestDetailMissing
        testId="group-detail-missing"
        title={missing ? "Group not found" : "Unable to load group"}
        message={message ?? "This group is not available in the current property."}
        backLabel="Back to Groups"
        onBack={backToDirectory}
      />
    );
  }

  const data = query.data as any;
  const cancelled = isGroupCancelled(data.group.accountStatus);
  const canWrite = (membership.role === "owner" || membership.role === "manager") && !cancelled;
  const canManageRes =
    (membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist") &&
    !cancelled;

  const menuItems = [
    ...(GROUP_DETAIL_PRIMARY_TABS as unknown as MenuItem[]),
    ...(GROUP_DETAIL_MORE_ITEMS as unknown as MenuItem[]),
  ];

  return (
    <div className="space-y-4" data-testid="group-detail-workspace">
      <GuestGroupHeader
        restaurantId={restaurantId}
        group={data.group}
        reservationCount={data.kpis.reservations}
        onEdit={() => setEditOpen(true)}
        onNavigate={selectNav}
        canWrite={membership.role === "owner" || membership.role === "manager"}
        canManageRes={canManageRes}
      />

      {/* Overview button with dropdown of sections */}
      <SectionMenu
        items={menuItems}
        activeId={canonicalNavId}
        onSelect={(id) => selectNav(id as CanonicalGroupViewId)}
      />

      {/* Render active canonical view */}
      <div className="pt-1" data-testid={`group-detail-view-content-${canonicalNavId}`}>
        {canonicalNavId === "overview" && (
          <GuestGroupOverviewView
            groupId={groupId}
            restaurantId={restaurantId}
            data={data}
            onNavigate={selectNav}
            onEdit={() => setEditOpen(true)}
            canManageRes={canManageRes}
          />
        )}

        {canonicalNavId === "master" && (
          <GuestGroupMasterView
            group={data.group}
            canWrite={canWrite}
            onEdit={() => setEditOpen(true)}
          />
        )}

        {canonicalNavId === "members" && (
          <GuestGroupMembersView
            restaurantId={restaurantId}
            groupId={groupId}
            cancelled={cancelled}
          />
        )}

        {canonicalNavId === "reservations" && (
          <GuestGroupReservationsView
            restaurantId={restaurantId}
            groupId={groupId}
            canManage={canManageRes}
          />
        )}

        {canonicalNavId === "rooming" && (
          <GuestGroupRoomingView
            restaurantId={restaurantId}
            groupId={groupId}
            canAssign={canManageRes}
          />
        )}

        {canonicalNavId === "communication" && (
          <GuestGroupCommunicationView
            restaurantId={restaurantId}
            groupId={groupId}
            cancelled={cancelled}
          />
        )}

        {canonicalNavId === "financial" && (
          <GuestGroupFinancialView restaurantId={restaurantId} groupId={groupId} />
        )}

        {canonicalNavId === "itinerary" && (
          <GuestGroupItineraryView
            restaurantId={restaurantId}
            groupId={groupId}
            cancelled={cancelled}
          />
        )}

        {canonicalNavId === "documents" && (
          <GuestGroupDocumentsView restaurantId={restaurantId} groupId={groupId} />
        )}

        {canonicalNavId === "activity" && (
          <GuestGroupActivityView
            restaurantId={restaurantId}
            groupId={groupId}
            groupName={data.group.name}
          />
        )}
      </div>

      {/* Edit Group Dialog */}
      <GuestGroupCreateModal
        open={editOpen}
        onOpenChange={setEditOpen}
        restaurantId={restaurantId}
        mode="edit"
        groupId={groupId}
        group={data.group}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}