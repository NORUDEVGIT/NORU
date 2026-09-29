import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  Users,
  X,
  Hotel,
  BedDouble,
  Building,
} from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { getGroupDetailWorkspace } from "@/packages/pms/lib/guest-group-detail.functions";
import { groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";

export type GroupQuickViewTab = "overview" | "members" | "reservations" | "operations";

export function GuestGroupQuickViewDrawer({
  restaurantId,
  groupId,
  onClose,
  onEditGroup,
}: {
  restaurantId: string;
  groupId: string | null | undefined;
  onClose: () => void;
  onEditGroup?: (groupId: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<GroupQuickViewTab>("overview");
  const isOpen = Boolean(groupId);

  const fetchWorkspace = useServerFn(getGroupDetailWorkspace);

  const groupQuery = useQuery({
    queryKey: ["group-detail", restaurantId, groupId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, groupId: groupId! } }),
    enabled: Boolean(groupId),
    staleTime: 30_000,
  });

  const data = groupQuery.data as any;
  const group = data?.group;
  const kpis = data?.kpis;

  function handleFullWorkspace() {
    if (!groupId) return;
    onClose();
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: groupId },
      search: guestProfileSearch({ type: "group" }),
    });
  }

  function handleAddReservation() {
    if (!groupId) return;
    onClose();
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { create: "new", groupId },
    });
  }

  const tabs: Array<{ id: GroupQuickViewTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "reservations", label: "Reservations" },
    { id: "operations", label: "Operations" },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-2xl sm:max-w-lg"
        data-testid="group-quick-view-drawer"
      >
        {/* Header */}
        <SheetHeader className="border-b border-[#DDD4C5] bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate font-display text-lg text-[#251605]">
                  {group ? group.name : <Skeleton className="h-6 w-36" />}
                </SheetTitle>
                {group?.accountStatus ? (
                  <Badge variant={group.accountStatus === "active" ? "default" : "secondary"}>
                    {groupStatusLabel(group.accountStatus)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-[#756A5B]">
                {group?.code ? (
                  <span>Code: {group.code}</span>
                ) : (
                  <span>Group Quick View</span>
                )}
                {group?.groupTypeName ? ` · ${group.groupTypeName}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#756A5B] transition-colors hover:bg-[#F7F4EE] hover:text-[#251605]"
              aria-label="Close drawer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Quick Actions Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#DDD4C5]/60 pt-3">
            <Button
              type="button"
              size="sm"
              onClick={handleAddReservation}
              className="gap-1.5 bg-[#C89933] text-white hover:bg-[#8A641A]"
              data-testid="quick-view-add-reservation"
            >
              <CalendarPlus className="size-3.5" />
              Add Reservation
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleFullWorkspace}
              className="gap-1.5 border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              data-testid="quick-view-full-workspace"
            >
              <ExternalLink className="size-3.5" />
              Full Workspace
            </Button>
            {onEditGroup && groupId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onEditGroup(groupId);
                }}
                className="gap-1.5 border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                data-testid="quick-view-edit-group"
              >
                <Pencil className="size-3.5" />
                Edit Group
              </Button>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="mt-2 flex w-full gap-1 border-b border-[#DDD4C5]/60 pt-1" role="tablist">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  data-testid={`quick-view-tab-${t.id}`}
                  className={cn(
                    "border-b-2 px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-[#C89933] text-[#251605]"
                      : "border-transparent text-[#756A5B] hover:text-[#251605]",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {groupQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : !group ? (
            <p className="text-sm text-[#756A5B]">Group not found.</p>
          ) : (
            <>
              {/* Tab: Overview */}
              {tab === "overview" && (
                <div className="space-y-4 text-sm" data-testid="quick-view-overview">
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                      Stay & Capacity
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#756A5B]">Stay Dates</span>
                        <p className="font-medium text-[#251605]">
                          {group.arrivalDate && group.departureDate
                            ? `${group.arrivalDate} → ${group.departureDate}`
                            : "Dates not set"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#756A5B]">Expected Pax / Rooms</span>
                        <p className="font-medium text-[#251605]">
                          {group.expectedPax ?? "—"} pax · {group.expectedRooms ?? "—"} rooms
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                      Primary Contact & Partners
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-[#756A5B]" />
                        <span className="text-[#756A5B]">Contact:</span>
                        <span className="font-medium text-[#251605]">
                          {group.primaryContactName || "Not assigned"}
                        </span>
                      </div>
                      {group.primaryContactEmail ? (
                        <div className="flex items-center gap-2">
                          <Mail className="size-3.5 text-[#756A5B]" />
                          <span className="text-[#251605]">{group.primaryContactEmail}</span>
                        </div>
                      ) : null}
                      {group.primaryContactPhone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="size-3.5 text-[#756A5B]" />
                          <span className="text-[#251605]">{group.primaryContactPhone}</span>
                        </div>
                      ) : null}
                      {group.companyMasterName ? (
                        <div className="flex items-center gap-2 pt-1 border-t border-[#DDD4C5]/40">
                          <Building className="size-3.5 text-[#756A5B]" />
                          <span className="text-[#756A5B]">Company:</span>
                          <span className="font-medium text-[#251605]">{group.companyMasterName}</span>
                        </div>
                      ) : null}
                      {group.travelAgentMasterName ? (
                        <div className="flex items-center gap-2">
                          <Hotel className="size-3.5 text-[#756A5B]" />
                          <span className="text-[#756A5B]">Travel Agency:</span>
                          <span className="font-medium text-[#251605]">{group.travelAgentMasterName}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {group.notes || group.specialRequests ? (
                    <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                        Notes & Requests
                      </h3>
                      {group.notes ? (
                        <p className="text-xs text-[#251605]"><span className="font-medium">Notes:</span> {group.notes}</p>
                      ) : null}
                      {group.specialRequests ? (
                        <p className="text-xs text-[#251605]"><span className="font-medium">Special Requests:</span> {group.specialRequests}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Tab: Members Summary */}
              {tab === "members" && (
                <div className="space-y-4 text-sm" data-testid="quick-view-members">
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                      Member Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#756A5B]">Linked Members</span>
                        <p className="font-display text-xl text-[#251605]">{kpis?.members ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-[#756A5B]">Expected Pax</span>
                        <p className="font-display text-xl text-[#251605]">{group.expectedPax ?? "—"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#756A5B]">
                      Open the full workspace to manage, link, or import group members.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab: Reservations Summary */}
              {tab === "reservations" && (
                <div className="space-y-4 text-sm" data-testid="quick-view-reservations">
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                      Reservation Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#756A5B]">Linked Reservations</span>
                        <p className="font-display text-xl text-[#251605]">{kpis?.reservations ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-[#756A5B]">Assigned Rooms</span>
                        <p className="font-display text-xl text-[#251605]">{kpis?.assignedRooms ?? 0}</p>
                      </div>
                    </div>
                    {data.reservationStatus && Object.keys(data.reservationStatus).length > 0 ? (
                      <div className="border-t border-[#DDD4C5]/60 pt-2">
                        <span className="text-xs text-[#756A5B]">By Status:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {Object.entries(data.reservationStatus).map(([status, count]) => (
                            <Badge key={status} variant="outline" className="text-[11px] capitalize">
                              {status.replaceAll("_", " ")}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Tab: Operations */}
              {tab === "operations" && (
                <div className="space-y-4 text-sm" data-testid="quick-view-operations">
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756A5B]">
                      Room Assignment & Inventory
                    </h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[#756A5B]">Assigned</span>
                        <p className="font-display text-lg text-emerald-700">{kpis?.assignedRooms ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-[#756A5B]">Unassigned</span>
                        <p className="font-display text-lg text-amber-700">{data?.unassignedRooms ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-[#756A5B]">Expected</span>
                        <p className="font-display text-lg text-[#251605]">{group.expectedRooms ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-[#DDD4C5]/60">
                      <BedDouble className="size-4 text-[#756A5B]" />
                      <span className="text-xs text-[#756A5B]">
                        Full rooming assignment and auto-assignment are managed in the Rooming List tab.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
