import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, CalendarPlus, Layers, ListChecks, Users } from "lucide-react";

import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import {
  GROUP_STATUSES,
  GROUP_TYPES,
  groupWorkspaceKpis,
} from "@/packages/pms/lib/groups";
import {
  addGroupBlock,
  addRoomingRow,
  amendGroup,
  convertRoomingRow,
  createGroup,
  getGroup,
  listGroups,
  releaseGroupBlock,
  type GroupBlockRead,
  type GroupListRow,
  type GroupRecord,
} from "@/packages/pms/lib/groups.functions";
import { listGuests } from "@/packages/pms/lib/guests.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

export function GroupsWorkspace({
  restaurantId,
  canWrite,
  onCreateStay,
  onOpenReservation,
}: {
  restaurantId: string;
  canWrite: boolean;
  onCreateStay: (groupId: string, blockId: string | null) => void;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadGroups = useServerFn(listGroups);
  const loadGroup = useServerFn(getGroup);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const loadGuests = useServerFn(listGuests);
  const submitCreate = useServerFn(createGroup);
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
  const kpis = groupWorkspaceKpis(groups);
  const selected = groups.find((row) => row.id === selectedId) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-groups", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-group", restaurantId] });
  }

  const create = useMutation({
    mutationFn: (input: Parameters<typeof submitCreate>[0]["data"]) => submitCreate({ data: input }),
    onSuccess: (group) => {
      toast.success(`Group ${group.confirmationNumber} created.`);
      setNewOpen(false);
      setSelectedId(group.id);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create group."),
  });

  return (
    <div className="space-y-4" data-testid="groups-blocks-workspace">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Group KPIs">
        <Kpi label="Groups" value={kpis.total} loading={listQuery.isLoading} icon={<Users className="size-4" />} />
        <Kpi label="Tentative" value={kpis.tentative} loading={listQuery.isLoading} icon={<Layers className="size-4" />} />
        <Kpi label="Definite" value={kpis.definite} loading={listQuery.isLoading} icon={<Building2 className="size-4" />} />
        <Kpi label="Remaining rooms" value={kpis.remaining} loading={listQuery.isLoading} icon={<ListChecks className="size-4" />} />
        <Kpi label="Pickup" value={kpis.pickedUp} loading={listQuery.isLoading} icon={<CalendarPlus className="size-4" />} />
        <Kpi label="Linked stays" value={kpis.reservations} loading={listQuery.isLoading} icon={<Users className="size-4" />} />
      </section>

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
              onClick={() => setNewOpen((open) => !open)}
            >
              New Group
            </Button>
          ) : null}
        </div>
        {newOpen && canWrite ? (
          <GroupForm
            submitting={create.isPending}
            onSubmit={(values) =>
              create.mutate({
                restaurantId,
                ...values,
              })
            }
          />
        ) : null}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
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
            <p className="p-6 text-sm text-muted-foreground">No operational groups for these filters.</p>
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

        <aside className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="group-quick-view">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">Select a group to view allotment, rooming list and history.</p>
          ) : groupQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : groupQuery.isError ? (
            <p className="text-sm text-destructive">
              {groupQuery.error instanceof Error ? groupQuery.error.message : "Could not load group."}
            </p>
          ) : groupQuery.data ? (
            <GroupQuickView
              restaurantId={restaurantId}
              canWrite={canWrite}
              listRow={selected}
              detail={groupQuery.data}
              roomTypes={roomTypesQuery.data ?? []}
              loadGuests={loadGuests}
              onAmend={submitAmend}
              onAddBlock={submitBlock}
              onRelease={submitRelease}
              onAddRooming={submitRooming}
              onConvert={submitConvert}
              onCreateStay={onCreateStay}
              onOpenReservation={onOpenReservation}
              onChanged={invalidate}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  icon,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F4E9D0] text-[#8A641A]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-14" /> : <p className="font-display text-xl font-semibold">{value}</p>}
      </div>
    </div>
  );
}

function GroupForm({
  submitting,
  initial,
  onSubmit,
}: {
  submitting: boolean;
  initial?: GroupListRow | null;
  onSubmit: (values: {
    name: string;
    groupType: (typeof GROUP_TYPES)[number];
    status: (typeof GROUP_STATUSES)[number];
    arrivalDate: string;
    departureDate: string;
    cutoffDate: string | null;
    notes: string | null;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [groupType, setGroupType] = useState<(typeof GROUP_TYPES)[number]>(
    (initial?.groupType as (typeof GROUP_TYPES)[number] | undefined) ?? "leisure",
  );
  const [status, setStatus] = useState<(typeof GROUP_STATUSES)[number]>(initial?.status ?? "tentative");
  const [arrivalDate, setArrivalDate] = useState(initial?.arrivalDate ?? "");
  const [departureDate, setDepartureDate] = useState(initial?.departureDate ?? "");
  const [cutoffDate, setCutoffDate] = useState(initial?.cutoffDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-[#DDD4C5] bg-[#F7F4EE] p-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: name.trim(),
          groupType,
          status,
          arrivalDate,
          departureDate,
          cutoffDate: cutoffDate || null,
          notes: notes.trim() || null,
        });
      }}
    >
      <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" />
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={groupType}
        onChange={(event) => setGroupType(event.target.value as (typeof GROUP_TYPES)[number])}
      >
        {GROUP_TYPES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={status}
        onChange={(event) => setStatus(event.target.value as (typeof GROUP_STATUSES)[number])}
      >
        {GROUP_STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <Input required type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} />
      <Input required type="date" value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} />
      <Input type="date" value={cutoffDate} onChange={(event) => setCutoffDate(event.target.value)} />
      <Input className="md:col-span-2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
      <Button type="submit" disabled={submitting}>
        {initial ? "Save group" : "Create group"}
      </Button>
    </form>
  );
}

function GroupQuickView({
  restaurantId,
  canWrite,
  listRow,
  detail,
  roomTypes,
  loadGuests,
  onAmend,
  onAddBlock,
  onRelease,
  onAddRooming,
  onConvert,
  onCreateStay,
  onOpenReservation,
  onChanged,
}: {
  restaurantId: string;
  canWrite: boolean;
  listRow: GroupListRow | undefined | null;
  detail: {
    group: GroupRecord;
    blocks: GroupBlockRead[];
    rooming: unknown;
    history: unknown;
    reservations: unknown;
  };
  roomTypes: Array<{ id: string; name: string }>;
  loadGuests: typeof listGuests;
  onAmend: typeof amendGroup;
  onAddBlock: typeof addGroupBlock;
  onRelease: typeof releaseGroupBlock;
  onAddRooming: typeof addRoomingRow;
  onConvert: typeof convertRoomingRow;
  onCreateStay: (groupId: string, blockId: string | null) => void;
  onOpenReservation: (reservationId: string) => void;
  onChanged: () => void;
}) {
  const group = detail.group;
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? "");
  const [allotted, setAllotted] = useState(1);
  const [blockStart, setBlockStart] = useState(group.arrivalDate);
  const [blockEnd, setBlockEnd] = useState(group.departureDate);
  const [guestName, setGuestName] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [roomingBlockId, setRoomingBlockId] = useState<string>("");

  const guestsQuery = useQuery({
    queryKey: ["pms-groups-guest-search", restaurantId, guestName],
    queryFn: () => loadGuests({ data: { restaurantId, search: guestName, limit: 8 } }),
    enabled: guestName.trim().length >= 2,
  });

  const amend = useMutation({
    mutationFn: (values: {
      name: string;
      groupType: (typeof GROUP_TYPES)[number];
      status: (typeof GROUP_STATUSES)[number];
      arrivalDate: string;
      departureDate: string;
      cutoffDate: string | null;
      notes: string | null;
    }) =>
      onAmend({
        data: {
          restaurantId,
          groupId: group.id,
          ...values,
        },
      }),
    onSuccess: () => {
      toast.success("Group updated.");
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not amend group."),
  });

  const addBlock = useMutation({
    mutationFn: () =>
      onAddBlock({
        data: {
          restaurantId,
          groupId: group.id,
          roomTypeId,
          startDate: blockStart,
          endDate: blockEnd,
          allotted,
        },
      }),
    onSuccess: () => {
      toast.success("Room block created.");
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create room block."),
  });

  const history = useMemo(
    () =>
      (detail.history as Array<{
        id: string;
        event_type: string;
        previous_values: Record<string, unknown> | null;
        new_values: Record<string, unknown> | null;
        notes: string | null;
        created_at: string;
      }>) ?? [],
    [detail.history],
  );

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {group.confirmationNumber}
        </p>
        <h2 className="font-display text-lg font-semibold">{group.name}</h2>
        <p className="text-muted-foreground">
          {group.arrivalDate} → {group.departureDate} · {group.status}
        </p>
      </div>

      {canWrite && listRow ? (
        <GroupForm
          submitting={amend.isPending}
          initial={listRow}
          onSubmit={(values) => amend.mutate(values)}
        />
      ) : null}

      <div>
        <h3 className="mb-2 font-medium">Room blocks</h3>
        {detail.blocks.length === 0 ? (
          <p className="text-muted-foreground">No allotment yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.blocks.map((block) => (
              <li key={block.id} className="rounded-lg border border-[#DDD4C5] p-2">
                <p>
                  {block.roomTypeName ?? "Room type"} · {block.allotted} allotted · {block.totals.pickedUp} pickup ·{" "}
                  {block.totals.remaining} remaining
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {block.startDate} → {block.endDate} · {block.status}
                </p>
                <ol className="mt-1 grid grid-cols-3 gap-1 text-[11px]">
                  {block.nights.map((night) => (
                    <li key={night.night}>
                      {night.night}: {night.pickedUp}/{night.allotted}
                    </li>
                  ))}
                </ol>
                {canWrite ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onCreateStay(group.id, block.id)}>
                      Create stay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void onRelease({
                          data: { restaurantId, groupId: group.id, blockId: block.id, allotted: 0 },
                        })
                          .then(() => {
                            toast.success("Unused allotment released. Linked stays were kept.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Could not release block."),
                          )
                      }
                    >
                      Release unused
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <form
            className="mt-2 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addBlock.mutate();
            }}
          >
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={roomTypeId}
              onChange={(event) => setRoomTypeId(event.target.value)}
            >
              {roomTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <Input type="date" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} />
            <Input type="date" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} />
            <Input
              type="number"
              min={1}
              value={allotted}
              onChange={(event) => setAllotted(Number(event.target.value))}
            />
            <Button type="submit" size="sm" disabled={addBlock.isPending || !roomTypeId}>
              Add room block
            </Button>
          </form>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 font-medium">Rooming list</h3>
        <ul className="space-y-1">
          {(detail.rooming as Array<{
            id: string;
            guest_name: string;
            status: string;
            reservation_id: string | null;
            guest_id: string | null;
            room_type_id: string | null;
          }>).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <span>
                {row.guest_name} · {row.status}
              </span>
              {row.reservation_id ? (
                <Button size="sm" variant="ghost" onClick={() => onOpenReservation(row.reservation_id!)}>
                  Open stay
                </Button>
              ) : canWrite ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void onConvert({ data: { restaurantId, groupId: group.id, rowId: row.id } })
                      .then((result) => {
                        toast.success("Reservation created from rooming list.");
                        onChanged();
                        onOpenReservation(result.reservationId);
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Could not convert rooming row."),
                      )
                  }
                >
                  Convert
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const block = detail.blocks.find((item) => item.id === roomingBlockId) ?? detail.blocks[0];
              void onAddRooming({
                data: {
                  restaurantId,
                  groupId: group.id,
                  groupBlockId: block?.id ?? null,
                  guestId,
                  guestName: guestName.trim(),
                  arrivalDate: group.arrivalDate,
                  departureDate: group.departureDate,
                  adults: 1,
                  children: 0,
                  roomTypeId: block?.roomTypeId ?? null,
                },
              })
                .then(() => {
                  toast.success("Rooming row added.");
                  setGuestName("");
                  setGuestId(null);
                  onChanged();
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not add rooming row."),
                );
            }}
          >
            <Input
              value={guestName}
              onChange={(event) => {
                setGuestName(event.target.value);
                setGuestId(null);
              }}
              placeholder="Guest name"
              required
            />
            {guestsQuery.data && guestsQuery.data.length > 0 ? (
              <ul className="rounded-md border border-border bg-background">
                {guestsQuery.data.map((guest) => (
                  <li key={guest.id}>
                    <button
                      type="button"
                      className="w-full px-2 py-1 text-left hover:bg-muted"
                      onClick={() => {
                        setGuestId(guest.id);
                        setGuestName(guest.fullName);
                      }}
                    >
                      {guest.fullName}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={roomingBlockId}
              onChange={(event) => setRoomingBlockId(event.target.value)}
            >
              <option value="">First room block</option>
              {detail.blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.roomTypeName ?? block.id}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              Add rooming row
            </Button>
          </form>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 font-medium">Linked reservations</h3>
        <ul className="space-y-1">
          {(detail.reservations as Array<{
            id: string;
            confirmation_number: string;
            status: string;
          }>).map((stay) => (
            <li key={stay.id}>
              <button type="button" className="text-left hover:underline" onClick={() => onOpenReservation(stay.id)}>
                {stay.confirmation_number} · {stay.status}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium">History</h3>
        <ul className="space-y-2 text-[11px] text-muted-foreground">
          {history.map((event) => (
            <li key={event.id}>
              <p>
                {event.event_type} · {event.created_at.slice(0, 16).replace("T", " ")}
              </p>
              {reservationHistoryChanges(event.previous_values, event.new_values).map((change) => (
                <p key={change.key}>
                  {change.key}: {change.from} → {change.to}
                </p>
              ))}
              {event.notes ? <p>{event.notes}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
