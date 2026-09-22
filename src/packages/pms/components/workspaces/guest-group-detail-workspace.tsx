import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestGroupHeader } from "@/packages/pms/components/guests/guest-group-header";
import { GuestGroupOverview } from "@/packages/pms/components/guests/guest-group-overview";
import { GuestGroupMembers } from "@/packages/pms/components/guests/guest-group-members";
import { GuestGroupReservations } from "@/packages/pms/components/guests/guest-group-reservations";
import { GuestGroupRooming } from "@/packages/pms/components/guests/guest-group-rooming";
import { GuestGroupFinancials } from "@/packages/pms/components/guests/guest-group-financials";
import { GuestGroupCommunication } from "@/packages/pms/components/guests/guest-group-communication";
import { GuestGroupFormDialog } from "@/packages/pms/components/guests/guest-group-form-dialog";
import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GroupDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { GROUP_DETAIL_NAV, groupDetailNav } from "@/packages/pms/lib/guest-group-detail-workspace";
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
  const navId = groupDetailNav(navProp);
  const [editOpen, setEditOpen] = useState(false);
  const load = useServerFn(getGroupDetailWorkspace);
  const query = useQuery({
    queryKey: ["group-detail", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
    retry: false,
  });

  function selectNav(next: GroupDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: groupId },
      search: guestProfileSearch({ nav: next, type: "group" }),
    });
  }

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading group…</p>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="group-detail-missing">
        <p className="font-display text-lg">Group not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(query.error as Error | undefined)?.message ?? "This group is not available in the current property."}
        </p>
      </div>
    );
  }

  const data = query.data;
  const canWrite = membership.role === "owner" || membership.role === "manager";
  const canManageRes =
    membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist";

  return (
    <div className="space-y-6" data-testid="group-detail-workspace">
      <GuestGroupHeader
        restaurantId={restaurantId}
        group={data.group}
        onEdit={() => setEditOpen(true)}
        onNavigate={selectNav}
        canManageRes={canManageRes}
      />
      <nav
        aria-label="Group sections"
        className="flex w-full gap-1 overflow-x-auto border-b border-border pb-px"
        role="tablist"
        data-testid="group-detail-nav"
      >
        {GROUP_DETAIL_NAV.map((item) => {
          const active = item.id === navId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`group-nav-${item.id}`}
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
        <GuestGroupOverview
          groupId={groupId}
          data={data}
          onNavigate={selectNav}
          onEdit={() => setEditOpen(true)}
          canManageRes={canManageRes}
        />
      ) : navId === "members" ? (
        <GuestGroupMembers restaurantId={restaurantId} groupId={groupId} />
      ) : navId === "reservations" ? (
        <GuestGroupReservations restaurantId={restaurantId} groupId={groupId} canManage={canManageRes} />
      ) : navId === "rooming" ? (
        <GuestGroupRooming restaurantId={restaurantId} groupId={groupId} canAssign={canManageRes} />
      ) : navId === "financial" ? (
        <GuestGroupFinancials restaurantId={restaurantId} groupId={groupId} />
      ) : navId === "communication" ? (
        <GuestGroupCommunication restaurantId={restaurantId} groupId={groupId} />
      ) : (
        <GuestActivityHubCard
          restaurantId={restaurantId}
          accountId={groupId}
          partyName={data.group.name}
          showFilters
        />
      )}

      {canWrite ? (
        <GuestGroupFormDialog
          restaurantId={restaurantId}
          open={editOpen}
          onOpenChange={setEditOpen}
          group={data.group}
        />
      ) : null}
    </div>
  );
}
