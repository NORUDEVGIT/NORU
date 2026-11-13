import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";

import {
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
} from "@/packages/pms/components/pms-filter-popover";
import { CreateGroupWizard } from "@/packages/pms/components/reservations/create-group-wizard";
import type { GroupBlockConfirmationProperty } from "@/packages/pms/lib/group-block-confirmation-print";
import {
  ReservationShellSlot,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { GroupDetailWorkspace } from "@/packages/pms/components/reservations/group-detail-workspace";
import { GROUP_STATUSES } from "@/packages/pms/lib/groups";
import {
  addGroupBlock,
  addRoomingRow,
  amendGroup,
  convertRoomingRow,
  getGroup,
  listGroups,
  releaseGroupBlock,
} from "@/packages/pms/lib/groups.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

export function GroupsWorkspace({
  restaurantId,
  property = null,
  search = "",
  rangeStart,
  rangeEnd,
  canWrite,
  initialGroupProfileId = null,
  canCreateReservation = false,
  createStayActive = false,
  onCreateStay,
  onOpenReservation,
}: {
  restaurantId: string;
  property?: GroupBlockConfirmationProperty | null;
  /** Name, confirmation, code or reference, from the shared Reservations search. */
  search?: string;
  /** Shared Reservations week. Groups and blocks that overlap it are listed. */
  rangeStart: string;
  rangeEnd: string;
  canWrite: boolean;
  initialGroupProfileId?: string | null;
  canCreateReservation?: boolean;
  createStayActive?: boolean;
  onCreateStay: (groupId: string, blockId: string | null) => void;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadGroups = useServerFn(listGroups);
  const loadGroup = useServerFn(getGroup);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const submitAmend = useServerFn(amendGroup);
  const submitBlock = useServerFn(addGroupBlock);
  const submitRelease = useServerFn(releaseGroupBlock);
  const submitRooming = useServerFn(addRoomingRow);
  const submitConvert = useServerFn(convertRoomingRow);

  const [status, setStatus] = useState<(typeof GROUP_STATUSES)[number] | "all">("all");
  const [statusDraft, setStatusDraft] = useState<(typeof GROUP_STATUSES)[number] | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(Boolean(initialGroupProfileId));
  useEffect(() => {
    if (initialGroupProfileId) setNewOpen(true);
  }, [initialGroupProfileId]);

  const listQuery = useQuery({
    queryKey: ["pms-groups", restaurantId, search, status, rangeStart, rangeEnd],
    queryFn: () =>
      loadGroups({
        data: {
          restaurantId,
          search: search.trim().length >= 2 ? search.trim() : undefined,
          status: status === "all" ? undefined : status,
          stayOverlapStart: rangeStart,
          stayOverlapEnd: rangeEnd,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const groupQuery = useQuery({
    queryKey: ["pms-group", restaurantId, selectedId],
    queryFn: () => loadGroup({ data: { restaurantId, groupId: selectedId! } }),
    enabled: selectedId !== null,
  });

  const roomTypesQuery = useQuery({
    queryKey: ["pms-groups-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const groups = listQuery.data?.groups ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-groups", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-group", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-group-operational", restaurantId] });
    void queryClient.invalidateQueries({
      queryKey: ["pms-groups-create-availability", restaurantId],
    });
  }

  return (
    <div className="space-y-3" data-testid="groups-blocks-workspace">
      <ReservationShellSlot name="filter">
        <PmsFilterPopover
          title="Filter Groups"
          activeCount={status !== "all" ? 1 : 0}
          open={filterOpen}
          onOpenChange={(open) => {
            setFilterOpen(open);
            if (open) setStatusDraft(status);
          }}
          onClear={() => {
            setStatus("all");
            setStatusDraft("all");
            setFilterOpen(false);
          }}
          onApply={() => {
            setStatus(statusDraft);
            setFilterOpen(false);
          }}
        >
          <PmsFilterSection title="Status">
            <PmsFilterSelect
              value={statusDraft}
              onValueChange={(value) =>
                setStatusDraft(value as (typeof GROUP_STATUSES)[number] | "all")
              }
              options={[
                ["all", "All statuses"],
                ...GROUP_STATUSES.map((value) => [value, value.replaceAll("_", " ")] as const),
              ]}
              ariaLabel="Status"
            />
          </PmsFilterSection>
        </PmsFilterPopover>
      </ReservationShellSlot>
      {canWrite ? (
        <ReservationShellSlot name="primary">
          <Button
            className={SHELL_PRIMARY_BUTTON}
            data-testid="groups-new-group"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="size-4" />
            New Group
          </Button>
        </ReservationShellSlot>
      ) : null}
      {status !== "all" ? (
        <ul className="flex flex-wrap gap-2" data-testid="groups-filter-chips">
          <li>
            <button
              type="button"
              aria-label={`Remove filter ${status.replaceAll("_", " ")}`}
              className="inline-flex items-center gap-1 rounded-full border border-[#DDD4C5] bg-white px-2.5 py-1 text-xs capitalize text-[#251605]"
              onClick={() => setStatus("all")}
            >
              {status.replaceAll("_", " ")}
              <X className="size-3" />
            </button>
          </li>
        </ul>
      ) : null}
      {canWrite ? (
        <CreateGroupWizard
          restaurantId={restaurantId}
          property={property}
          open={newOpen}
          initialGroupProfileId={initialGroupProfileId}
          onOpenChange={setNewOpen}
          onCreated={(groupId) => {
            setNewOpen(false);
            setSelectedId(groupId);
            invalidate();
          }}
        />
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        {listQuery.isError ? (
          <p className="p-4 text-sm text-destructive">
            {listQuery.error instanceof Error ? listQuery.error.message : "Could not load groups."}
          </p>
        ) : listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No operational groups for these filters.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Stay</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Allotment</th>
                <th className="px-3 py-2">Pickup</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b border-border/70 hover:bg-[#F7F4EE]",
                    selectedId === row.id && "bg-[#F4E9D0]",
                  )}
                  data-testid="groups-row"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.confirmationNumber}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.arrivalDate} → {row.departureDate}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.status}</td>
                  <td className="px-3 py-2 tabular-nums">{row.blockedRooms}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.pickedUp} / {row.remaining} left
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <GroupDetailWorkspace
        restaurantId={restaurantId}
        property={property}
        canWrite={canWrite}
        open={Boolean(selectedId) && !newOpen && !createStayActive}
        detail={groupQuery.data ?? null}
        loading={groupQuery.isLoading}
        error={
          groupQuery.error instanceof Error
            ? groupQuery.error.message
            : groupQuery.isError
              ? "Could not load group."
              : null
        }
        roomTypes={roomTypesQuery.data ?? []}
        onAmend={submitAmend}
        onAddBlock={submitBlock}
        onRelease={submitRelease}
        onAddRooming={submitRooming}
        onConvert={submitConvert}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
        onRetry={() => void groupQuery.refetch()}
        onChanged={invalidate}
        onOpenReservation={(reservationId) => {
          setSelectedId(null);
          onOpenReservation(reservationId);
        }}
        canCreateReservation={canCreateReservation}
        onCreateStay={onCreateStay}
      />
    </div>
  );
}
