import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GroupDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GROUP_DETAIL_PRIMARY_TABS,
  GROUP_DETAIL_MORE_ITEMS,
  resolveCanonicalGroupNavId,
  isMoreGroupView,
  type CanonicalGroupViewId,
} from "@/packages/pms/lib/guest-group-detail-view";
import { isGroupCancelled } from "@/packages/pms/lib/guest-group-detail-workspace";
import { getGroupDetailWorkspace } from "@/packages/pms/lib/guest-group-detail.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

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

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading group…</p>;
  }

  if (query.error || !query.data) {
    const message = (query.error as Error | undefined)?.message;
    const missing = !message || /could not be found/i.test(message);
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="group-detail-missing">
        <p className="font-display text-lg">{missing ? "Group not found" : "Unable to load group"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ?? "This group is not available in the current property."}
        </p>
      </div>
    );
  }

  const data = query.data as any;
  const cancelled = isGroupCancelled(data.group.accountStatus);
  const canWrite = (membership.role === "owner" || membership.role === "manager") && !cancelled;
  const canManageRes =
    (membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist") && !cancelled;

  const isMoreActive = isMoreGroupView(canonicalNavId);
  const activeMoreItem = GROUP_DETAIL_MORE_ITEMS.find((item) => item.id === canonicalNavId);

  return (
    <div className="space-y-6" data-testid="group-detail-workspace">
      {/* Modern Group Header */}
      <GuestGroupHeader
        restaurantId={restaurantId}
        group={data.group}
        reservationCount={data.kpis.reservations}
        onEdit={() => setEditOpen(true)}
        onNavigate={selectNav}
        canWrite={membership.role === "owner" || membership.role === "manager"}
        canManageRes={canManageRes}
      />

      {/* Modern 5-Primary + More Dropdown Tab Navigation */}
      <nav
        aria-label="Group sections"
        className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#DDD4C5] pb-px"
        role="tablist"
        data-testid="group-detail-nav"
      >
        {GROUP_DETAIL_PRIMARY_TABS.map((item) => {
          const active = item.id === canonicalNavId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`group-nav-${item.id}`}
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
              data-testid="group-nav-more"
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
            {GROUP_DETAIL_MORE_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => selectNav(item.id)}
                className={cn(
                  "cursor-pointer text-xs font-medium",
                  canonicalNavId === item.id ? "bg-[#F7F4EE] text-[#251605] font-bold" : "text-[#756A5B]",
                )}
                data-testid={`group-nav-${item.id}`}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Render active canonical view */}
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
        <GuestGroupFinancialView
          restaurantId={restaurantId}
          groupId={groupId}
        />
      )}

      {canonicalNavId === "itinerary" && (
        <GuestGroupItineraryView
          restaurantId={restaurantId}
          groupId={groupId}
          cancelled={cancelled}
        />
      )}

      {canonicalNavId === "documents" && (
        <GuestGroupDocumentsView
          restaurantId={restaurantId}
          groupId={groupId}
        />
      )}

      {canonicalNavId === "activity" && (
        <GuestGroupActivityView
          restaurantId={restaurantId}
          groupId={groupId}
          groupName={data.group.name}
        />
      )}

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
