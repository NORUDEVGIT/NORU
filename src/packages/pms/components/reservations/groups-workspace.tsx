import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { CreateGroupWizard } from "@/packages/pms/components/reservations/create-group-wizard";
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
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

export function GroupsWorkspace({
  restaurantId,
  canWrite,
  canCreateReservation = false,
  createStayActive = false,
  onCreateStay,
  onOpenReservation,
}: {
  restaurantId: string;
  canWrite: boolean;
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

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof GROUP_STATUSES)[number] | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ["pms-groups", restaurantId, search, status],
    queryFn: () =>
      loadGroups({
        data: {
          restaurantId,
          search: search.trim().length >= 2 ? search.trim() : undefined,
          status: status === "all" ? undefined : status,
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
    <div className="space-y-4" data-testid="groups-blocks-workspace">
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-52 flex-1 gap-1 text-[11px] font-medium text-muted-foreground">
            Search groups
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, confirmation, code or reference"
              aria-label="Search groups"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Status
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="all">All statuses</option>
              {GROUP_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {canWrite ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              data-testid="groups-new-group"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="size-4" />
              New Group
            </Button>
          ) : null}
        </div>
      </section>
      {canWrite ? (
        <CreateGroupWizard
          restaurantId={restaurantId}
          open={newOpen}
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
