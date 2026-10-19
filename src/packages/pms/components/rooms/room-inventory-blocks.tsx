import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Ellipsis,
  Eye,
  Layers3,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { getInventoryRules } from "@/packages/pms/lib/inventory-rules.functions";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  activateOperationalBlock,
  approveOperationalBlock,
  cancelOperationalBlock,
  createOperationalBlock,
  listOperationalBlocks,
  listRoomTypeInventoryAvailability,
  releaseOperationalBlock,
  type OperationalBlockStatus,
  type OperationalBlockTargetKind,
  type OperationalInventoryBlock,
} from "@/packages/pms/lib/room-inventory.functions";
import {
  listRooms,
  listRoomTypes,
  type HotelRoom,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { InventoryState } from "./room-inventory-shared";
import { addDays, dateLabel } from "./room-inventory-utils";

type ConfirmAction =
  | { kind: "release"; block: OperationalInventoryBlock }
  | { kind: "cancel"; block: OperationalInventoryBlock };

type CreateIntent = "create" | "create_activate";

interface BlockForm {
  targetKind: OperationalBlockTargetKind;
  targetId: string;
  quantity: string;
  blockType: string;
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
}

const INK = "#251605";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortReference(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function blockCode(block: OperationalInventoryBlock): string {
  return `BLK-${block.id.slice(0, 8).toUpperCase()}`;
}

function overlaps(block: OperationalInventoryBlock, fromDate: string, toDate: string): boolean {
  if (fromDate && block.endDate <= fromDate) return false;
  if (toDate && block.startDate >= toDate) return false;
  return true;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The block action failed.";
  if (/permission|access|manager|owner|authorized/i.test(message)) {
    return "Owner or manager access is required for this block action.";
  }
  if (/capacity|available|inventory/i.test(message)) {
    return `Inventory validation failed: ${message}`;
  }
  if (/approval/i.test(message)) {
    return `Approval is required before this action: ${message}`;
  }
  if (/date|end_date|start_date/i.test(message)) {
    return `Check the block dates: ${message}`;
  }
  return message;
}

function initialForm(businessDate: string): BlockForm {
  return {
    targetKind: "room_type",
    targetId: "",
    quantity: "1",
    blockType: "temporary",
    startDate: businessDate,
    endDate: addDays(businessDate, 1),
    reason: "",
    notes: "",
  };
}

export type RoomBlockCreatePrefill = {
  roomId: string;
  roomTypeId: string;
  roomNumber: string;
  roomTypeName: string;
};

export function RoomInventoryBlocksView({
  restaurantId,
  createPrefill = null,
}: {
  restaurantId: string;
  createPrefill?: RoomBlockCreatePrefill | null;
}) {
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const loadBlocks = useServerFn(listOperationalBlocks);
  const loadRooms = useServerFn(listRooms);
  const loadTypes = useServerFn(listRoomTypes);
  const loadRules = useServerFn(getInventoryRules);
  const loadAvailability = useServerFn(listRoomTypeInventoryAvailability);
  const createBlock = useServerFn(createOperationalBlock);
  const activateBlock = useServerFn(activateOperationalBlock);
  const approveBlock = useServerFn(approveOperationalBlock);
  const releaseBlock = useServerFn(releaseOperationalBlock);
  const cancelBlock = useServerFn(cancelOperationalBlock);
  const queryClient = useQueryClient();

  const [blockType, setBlockType] = useState("all");
  const [status, setStatus] = useState("all");
  const [targetKind, setTargetKind] = useState("all");
  const [building, setBuilding] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [detailBlock, setDetailBlock] = useState<OperationalInventoryBlock | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [form, setForm] = useState<BlockForm>(() => initialForm(today()));

  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const businessDate = businessDateQuery.data?.businessDate ?? today();

  useEffect(() => {
    if (!businessDateQuery.data) return;
    setForm((current) => {
      if (current.startDate !== today() || current.endDate !== addDays(today(), 1)) return current;
      return {
        ...current,
        startDate: businessDateQuery.data.businessDate,
        endDate: addDays(businessDateQuery.data.businessDate, 1),
      };
    });
  }, [businessDateQuery.data]);

  const blocksQuery = useQuery({
    queryKey: ["operational-blocks", restaurantId],
    queryFn: () => loadBlocks({ data: { restaurantId, limit: 500 } }),
    retry: false,
    staleTime: 30_000,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const typesQuery = useQuery({
    queryKey: ["room-inventory-type-options", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const rulesQuery = useQuery({
    queryKey: ["inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    staleTime: 60_000,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const roomTypes = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const typeById = useMemo(
    () => new Map(roomTypes.map((roomType) => [roomType.id, roomType])),
    [roomTypes],
  );
  const buildings = useMemo(
    () => Array.from(new Set(rooms.map((room) => room.building?.trim() || "Unassigned"))).sort(),
    [rooms],
  );
  const rules = rulesQuery.data?.rules.blockTypes ?? [];
  const enabledRules = rules.filter((rule) => rule.enabled);

  useEffect(() => {
    if (!createPrefill) return;
    setForm({
      ...initialForm(businessDate),
      targetKind: "room",
      targetId: createPrefill.roomId,
      blockType: enabledRules[0]?.blockType ?? "temporary",
    });
    setSearch(createPrefill.roomNumber);
    setDetailBlock(null);
    setCreateOpen(true);
    // Reopen only when Room Board selects a room. Rule loading must not wipe the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPrefill]);

  useEffect(() => {
    if (!createPrefill || enabledRules.length === 0) return;
    setForm((current) => {
      if (current.targetKind !== "room" || current.targetId !== createPrefill.roomId) return current;
      if (enabledRules.some((rule) => rule.blockType === current.blockType)) return current;
      return { ...current, blockType: enabledRules[0]?.blockType ?? current.blockType };
    });
  }, [createPrefill, enabledRules]);
  const selectedRule = enabledRules.find((rule) => rule.blockType === form.blockType) ?? null;
  const selectedRoom = form.targetKind === "room" ? roomById.get(form.targetId) : null;
  const previewRoomTypeId =
    form.targetKind === "room"
      ? (selectedRoom?.roomTypeId ??
        (createPrefill?.roomId === form.targetId ? createPrefill.roomTypeId : undefined))
      : form.targetId || undefined;

  const previewQuery = useQuery({
    queryKey: [
      "room-inventory-block-preview",
      restaurantId,
      previewRoomTypeId,
      form.startDate,
      form.endDate,
    ],
    queryFn: () =>
      loadAvailability({
        data: {
          restaurantId,
          arrival: form.startDate,
          departure: form.endDate,
        },
      }),
    enabled: Boolean(
      previewRoomTypeId && form.startDate && form.endDate > form.startDate && createOpen,
    ),
    staleTime: 60_000,
  });
  const previewAvailability = previewQuery.data?.find(
    (row) => row.roomTypeId === previewRoomTypeId,
  );

  const allBlocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);
  const filteredBlocks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allBlocks.filter((block) => {
      if (blockType !== "all" && block.blockType !== blockType) return false;
      if (status !== "all" && block.status !== status) return false;
      if (targetKind !== "all" && block.targetKind !== targetKind) return false;
      if (!overlaps(block, fromDate, toDate)) return false;
      if (building !== "all") {
        if (block.roomId) {
          const roomBuilding = roomById.get(block.roomId)?.building?.trim() || "Unassigned";
          if (roomBuilding !== building) return false;
        } else {
          const typeExistsInBuilding = rooms.some(
            (room) =>
              room.roomTypeId === block.roomTypeId &&
              (room.building?.trim() || "Unassigned") === building,
          );
          if (!typeExistsInBuilding) return false;
        }
      }
      if (!normalizedSearch) return true;
      const room = block.roomId ? roomById.get(block.roomId) : null;
      const roomType = typeById.get(block.roomTypeId);
      return [
        block.id,
        blockCode(block),
        block.reason,
        block.notes ?? "",
        block.blockType,
        block.createdByMembershipId,
        room?.roomNumber ?? "",
        roomType?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    allBlocks,
    blockType,
    building,
    fromDate,
    roomById,
    rooms,
    search,
    status,
    targetKind,
    toDate,
    typeById,
  ]);

  useEffect(() => {
    setPage(1);
  }, [blockType, status, targetKind, building, fromDate, toDate, search, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredBlocks.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filteredBlocks.slice(pageStart, pageStart + pageSize);
  const activeBlocks = allBlocks.filter((block) => block.status === "active");
  const uniqueRoomTargets = new Set(
    activeBlocks.flatMap((block) =>
      block.targetKind === "room" && block.roomId ? [block.roomId] : [],
    ),
  ).size;
  const pendingApprovals = allBlocks.filter((block) => block.status === "pending_approval").length;
  const activeTypeBlocks = activeBlocks.filter(
    (block) => block.targetKind === "room_type" || block.targetKind === "quantity",
  ).length;
  const endingSoon = activeBlocks.filter(
    (block) => block.endDate > businessDate && block.endDate <= addDays(businessDate, 7),
  ).length;
  const managerDenied = blocksQuery.isError;

  async function invalidateOperationalViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["operational-blocks", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-availability", restaurantId] }),
      queryClient.invalidateQueries({
        queryKey: ["room-inventory-availability-tonight", restaurantId],
      }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-calendar", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-calendar-blocks", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-board-blocks", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-events", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-history", restaurantId] }),
    ]);
  }

  const mutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "create"; intent: CreateIntent }
        | { kind: "activate" | "approve"; blockId: string }
        | { kind: "release"; blockId: string; reason: string }
        | { kind: "cancel"; blockId: string; notes: string | null },
    ) => {
      if (action.kind === "create") {
        const room = form.targetKind === "room" ? roomById.get(form.targetId) : null;
        const roomTypeId =
          form.targetKind === "room"
            ? (room?.roomTypeId ??
              (createPrefill?.roomId === form.targetId ? createPrefill.roomTypeId : undefined))
            : form.targetId;
        if (!roomTypeId) throw new Error("Choose a room or room type target.");
        if (form.endDate <= form.startDate) throw new Error("End date must be after start date.");
        if (form.targetKind === "quantity" && Number(form.quantity) < 1) {
          throw new Error("Quantity must be at least 1.");
        }
        const created = await createBlock({
          data: {
            restaurantId,
            targetKind: form.targetKind,
            roomId: form.targetKind === "room" ? form.targetId : null,
            roomTypeId,
            quantity: form.targetKind === "quantity" ? Number(form.quantity) : null,
            groupId: null,
            blockType: form.blockType,
            startDate: form.startDate,
            endDate: form.endDate,
            reason: form.reason,
            notes: form.notes.trim() || null,
          },
        });
        if (action.intent === "create_activate") {
          if (selectedRule?.approvalRequired) {
            throw new Error("This block type requires approval before activation.");
          }
          await activateBlock({ data: { restaurantId, blockId: created.blockId } });
        }
        return { action, blockId: created.blockId };
      }
      if (action.kind === "activate") {
        await activateBlock({ data: { restaurantId, blockId: action.blockId } });
      } else if (action.kind === "approve") {
        await approveBlock({ data: { restaurantId, blockId: action.blockId } });
      } else if (action.kind === "release") {
        await releaseBlock({
          data: { restaurantId, blockId: action.blockId, reason: action.reason },
        });
      } else {
        await cancelBlock({
          data: { restaurantId, blockId: action.blockId, notes: action.notes },
        });
      }
      return { action, blockId: action.blockId };
    },
    onSuccess: async ({ action }) => {
      await invalidateOperationalViews();
      const messages = {
        create:
          action.kind === "create" && action.intent === "create_activate"
            ? "Block created and activated"
            : selectedRule?.approvalRequired
              ? "Block created and submitted for approval"
              : "Block created",
        activate: "Block activated",
        approve: "Block approved",
        release: "Block released",
        cancel: "Block cancelled",
      };
      toast.success(messages[action.kind]);
      setCreateOpen(false);
      setConfirmAction(null);
      setConfirmNote("");
      setForm(initialForm(businessDate));
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const createReady =
    Boolean(selectedRule) &&
    Boolean(form.targetId) &&
    Boolean(form.blockType) &&
    Boolean(form.reason.trim()) &&
    form.endDate > form.startDate &&
    (form.targetKind !== "quantity" || Number(form.quantity) >= 1);

  function clearFilters() {
    setBlockType("all");
    setStatus("all");
    setTargetKind("all");
    setBuilding("all");
    setFromDate("");
    setToDate("");
    setSearch("");
  }

  function openCreate() {
    setForm({
      ...initialForm(businessDate),
      blockType: enabledRules[0]?.blockType ?? "",
    });
    setCreateOpen(true);
    setDetailBlock(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Room & Inventory
          </p>
          <h2 className="mt-0.5 font-display text-2xl font-bold" style={{ color: INK }}>
            Inventory Blocks
          </h2>
          <p className="text-xs text-muted-foreground">
            Manage operational holds, approvals, activation, release, and cancellation.
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 px-3.5 bg-[#C89933] text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
          disabled={managerDenied}
          onClick={openCreate}
        >
          <Plus className="mr-1.5 size-4" />
          Create Block
        </Button>
      </div>

      <BlocksKpis
        active={activeBlocks.length}
        pending={pendingApprovals}
        uniqueRooms={uniqueRoomTargets}
        typeBlocks={activeTypeBlocks}
        endingSoon={endingSoon}
      />

      <BlocksFilters
        blockType={blockType}
        blockTypes={rules.map((rule) => rule.blockType)}
        status={status}
        targetKind={targetKind}
        building={building}
        buildings={buildings}
        fromDate={fromDate}
        toDate={toDate}
        search={search}
        onBlockType={setBlockType}
        onStatus={setStatus}
        onTargetKind={setTargetKind}
        onBuilding={setBuilding}
        onFromDate={setFromDate}
        onToDate={setToDate}
        onSearch={setSearch}
        onClear={clearFilters}
      />

      {blocksQuery.isLoading ? (
        <InventoryState state="loading" />
      ) : managerDenied ? (
        <InventoryState
          state="error"
          title="Blocks are unavailable for your role"
          description="Listing and mutating operational blocks requires owner or manager access. Availability, Calendar, and Room Board remain available."
          onRetry={() => blocksQuery.refetch()}
        />
      ) : filteredBlocks.length === 0 ? (
        <InventoryState
          state="empty"
          title="No matching blocks"
          description="Clear filters or create an operational block."
        />
      ) : (
        <section className="overflow-hidden rounded-lg border border-[#E5DED4] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E5DED4] px-4 py-3">
            <h3 className="text-sm font-bold" style={{ color: INK }}>
              Blocks ({filteredBlocks.length})
            </h3>
            <Button
              size="sm"
              className="h-8 bg-[#C89933] px-3 text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
              onClick={openCreate}
            >
              <Plus className="mr-1.5 size-3.5" />
              New Block
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead className="border-b border-[#E5DED4] bg-[#F8F5F0] text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={
                        pageRows.length > 0 && pageRows.every((block) => selectedIds.has(block.id))
                      }
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        for (const block of pageRows) {
                          if (checked) next.add(block.id);
                          else next.delete(block.id);
                        }
                        setSelectedIds(next);
                      }}
                      aria-label="Select current page"
                    />
                  </th>
                  {[
                    "Block Code",
                    "Target",
                    "Type",
                    "Start Date",
                    "End Date",
                    "Inventory Impact",
                    "Approval Status",
                    "Created By",
                    "Current Status",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((block) => (
                  <BlockTableRow
                    key={block.id}
                    block={block}
                    room={block.roomId ? (roomById.get(block.roomId) ?? null) : null}
                    roomType={typeById.get(block.roomTypeId) ?? null}
                    selected={selectedIds.has(block.id)}
                    pending={mutation.isPending}
                    onSelected={(checked) => {
                      const next = new Set(selectedIds);
                      if (checked) next.add(block.id);
                      else next.delete(block.id);
                      setSelectedIds(next);
                    }}
                    onDetails={() => setDetailBlock(block)}
                    onActivate={() => mutation.mutate({ kind: "activate", blockId: block.id })}
                    onApprove={() => mutation.mutate({ kind: "approve", blockId: block.id })}
                    onRelease={() => {
                      setConfirmNote("");
                      setConfirmAction({ kind: "release", block });
                    }}
                    onCancel={() => {
                      setConfirmNote("");
                      setConfirmAction({ kind: "cancel", block });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <BlocksPagination
            total={filteredBlocks.length}
            loadedTotal={allBlocks.length}
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            start={pageStart}
            end={Math.min(pageStart + pageRows.length, filteredBlocks.length)}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </section>
      )}

      <CreateBlockDrawer
        open={createOpen}
        form={form}
        rooms={rooms}
        pinnedRoom={
          createPrefill
            ? {
                id: createPrefill.roomId,
                label: `Room ${createPrefill.roomNumber} · ${createPrefill.roomTypeName}`,
              }
            : null
        }
        roomTypes={roomTypes}
        rules={enabledRules}
        selectedRule={selectedRule}
        previewAvailability={previewAvailability?.available ?? null}
        previewLoading={previewQuery.isLoading}
        pending={mutation.isPending}
        ready={createReady}
        onOpenChange={setCreateOpen}
        onForm={setForm}
        onCreate={(intent) => mutation.mutate({ kind: "create", intent })}
      />

      <BlockDetailDrawer
        block={detailBlock}
        room={detailBlock?.roomId ? (roomById.get(detailBlock.roomId) ?? null) : null}
        roomType={detailBlock ? (typeById.get(detailBlock.roomTypeId) ?? null) : null}
        onOpenChange={(open) => {
          if (!open) setDetailBlock(null);
        }}
      />

      <ActionConfirmation
        action={confirmAction}
        note={confirmNote}
        pending={mutation.isPending}
        onNote={setConfirmNote}
        onClose={() => {
          setConfirmAction(null);
          setConfirmNote("");
        }}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "release") {
            mutation.mutate({
              kind: "release",
              blockId: confirmAction.block.id,
              reason: confirmNote.trim(),
            });
          } else {
            mutation.mutate({
              kind: "cancel",
              blockId: confirmAction.block.id,
              notes: confirmNote.trim() || null,
            });
          }
        }}
      />
    </div>
  );
}

function BlocksKpis({
  active,
  pending,
  uniqueRooms,
  typeBlocks,
  endingSoon,
}: {
  active: number;
  pending: number;
  uniqueRooms: number;
  typeBlocks: number;
  endingSoon: number;
}) {
  const items = [
    {
      label: "Active Blocks",
      value: active,
      detail: "Currently active",
      icon: CircleSlash2,
      tone: "bg-red-50 text-red-700",
    },
    {
      label: "Pending Approvals",
      value: pending,
      detail: "Awaiting approval",
      icon: ShieldCheck,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Rooms Blocked",
      value: uniqueRooms,
      detail: "Unique explicit room targets",
      icon: Boxes,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Room-Type Blocks",
      value: typeBlocks,
      detail: "Active type / quantity targets",
      icon: Layers3,
      tone: "bg-violet-50 text-violet-700",
    },
    {
      label: "Blocks Ending Soon",
      value: endingSoon,
      detail: "Next 7 business days",
      icon: CalendarClock,
      tone: "bg-emerald-50 text-emerald-700",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex min-h-[72px] items-center gap-3 rounded-lg border border-[#EAE4DB] bg-white px-3.5 py-2.5 shadow-sm"
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${item.tone}`}>
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#756A5B]">{item.label}</p>
              <p className="text-2xl font-bold leading-tight" style={{ color: INK }}>
                {item.value}
              </p>
              <p className="truncate text-xs text-[#8C8071]">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlocksFilters({
  blockType,
  blockTypes,
  status,
  targetKind,
  building,
  buildings,
  fromDate,
  toDate,
  search,
  onBlockType,
  onStatus,
  onTargetKind,
  onBuilding,
  onFromDate,
  onToDate,
  onSearch,
  onClear,
}: {
  blockType: string;
  blockTypes: string[];
  status: string;
  targetKind: string;
  building: string;
  buildings: string[];
  fromDate: string;
  toDate: string;
  search: string;
  onBlockType: (value: string) => void;
  onStatus: (value: string) => void;
  onTargetKind: (value: string) => void;
  onBuilding: (value: string) => void;
  onFromDate: (value: string) => void;
  onToDate: (value: string) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-lg border border-[#E5DED4] bg-white p-3 shadow-sm">
      <div className="grid items-end gap-2.5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_1.5fr_auto]">
        <CompactSelect
          label="Block Type"
          value={blockType}
          onChange={onBlockType}
          options={[
            ["all", "All Block Types"],
            ...blockTypes.map((value) => [value, titleCase(value)]),
          ]}
        />
        <CompactSelect
          label="Status"
          value={status}
          onChange={onStatus}
          options={[
            ["all", "All Statuses"],
            ["draft", "Draft"],
            ["pending_approval", "Pending Approval"],
            ["active", "Active"],
            ["released", "Released"],
            ["cancelled", "Cancelled"],
          ]}
        />
        <CompactSelect
          label="Target Type"
          value={targetKind}
          onChange={onTargetKind}
          options={[
            ["all", "All Targets"],
            ["room", "Room"],
            ["room_type", "Room Type"],
            ["quantity", "Quantity"],
          ]}
        />
        <CompactSelect
          label="Building"
          value={building}
          onChange={onBuilding}
          options={[["all", "All Buildings"], ...buildings.map((value) => [value, value])]}
        />
        <label className="grid gap-1 text-xs font-semibold text-[#5F554B]">
          Date Range
          <span className="flex h-9 items-center rounded-md border border-[#DED7CD] bg-white px-2">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => onFromDate(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-[#251605] outline-none"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              min={fromDate || undefined}
              value={toDate}
              onChange={(event) => onToDate(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-[#251605] outline-none"
            />
          </span>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#5F554B]">
          Search
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Reason, target, block ID, creator…"
            className="h-9 text-xs text-[#251605]"
          />
        </label>
        <Button variant="outline" size="sm" className="h-9 px-3.5 text-xs font-medium" onClick={onClear}>
          Clear
        </Button>
      </div>
    </section>
  );
}

function CompactSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#5F554B]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs text-[#251605] outline-none focus:border-[#C89933]"
      >
        {options.map(([id, name]) => (
          <option key={`${id}-${name}`} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function BlockTableRow({
  block,
  room,
  roomType,
  selected,
  pending,
  onSelected,
  onDetails,
  onActivate,
  onApprove,
  onRelease,
  onCancel,
}: {
  block: OperationalInventoryBlock;
  room: HotelRoom | null;
  roomType: RoomType | null;
  selected: boolean;
  pending: boolean;
  onSelected: (checked: boolean) => void;
  onDetails: () => void;
  onActivate: () => void;
  onApprove: () => void;
  onRelease: () => void;
  onCancel: () => void;
}) {
  const target =
    block.targetKind === "room"
      ? `Room ${room?.roomNumber ?? shortReference(block.roomId ?? block.id)}`
      : block.targetKind === "quantity"
        ? `${block.quantity ?? 0} × ${roomType?.name ?? shortReference(block.roomTypeId)}`
        : (roomType?.name ?? shortReference(block.roomTypeId));
  const approval = !block.approvalRequired
    ? "Not required"
    : block.status === "pending_approval"
      ? "Pending"
      : block.approvedByMembershipId
        ? "Approved"
        : "Required";
  return (
    <tr
      className="cursor-pointer border-b border-[#EEE8E0] last:border-0 hover:bg-[#FAF8F4] transition-colors"
      onClick={onDetails}
    >
      <td className="px-3.5 py-3" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelected(checked === true)}
          aria-label={`Select ${blockCode(block)}`}
        />
      </td>
      <td className="px-3.5 py-3 font-mono text-xs font-bold text-[#251605]">{blockCode(block)}</td>
      <td className="max-w-52 px-3.5 py-3">
        <p className="truncate text-xs font-bold text-[#251605]">{target}</p>
        <p className="text-[11px] text-muted-foreground">{titleCase(block.targetKind)}</p>
      </td>
      <td className="px-3.5 py-3">
        <span className="inline-flex rounded-full bg-[#F3EFE8] px-2.5 py-1 text-xs font-medium text-[#5F492D]">
          {titleCase(block.blockType)}
        </span>
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#3D352B]">{dateLabel(block.startDate)}</td>
      <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#3D352B]">{dateLabel(block.endDate)}</td>
      <td className="px-3.5 py-3">
        {block.inventoryImpact === "remove_from_inventory" ? (
          <p className="text-xs font-semibold text-[#251605]">
            {block.targetKind === "quantity"
              ? `-${block.quantity ?? 0} rooms`
              : block.targetKind === "room"
                ? "-1 room"
                : "Full room type"}
          </p>
        ) : (
          <p className="text-xs font-semibold text-[#251605]">{titleCase(block.inventoryImpact)}</p>
        )}
      </td>
      <td className="px-3.5 py-3">
        <StatusPill
          label={approval}
          tone={
            approval === "Approved" ? "success" : approval === "Pending" ? "warning" : "neutral"
          }
        />
      </td>
      <td className="px-3.5 py-3 font-mono text-xs text-muted-foreground" title={block.createdByMembershipId}>
        {shortReference(block.createdByMembershipId)}
      </td>
      <td className="px-3.5 py-3">
        <BlockStatus status={block.status} />
      </td>
      <td className="px-3.5 py-3" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Block actions">
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDetails}>
              <Eye className="mr-2 size-3.5" />
              View Details
            </DropdownMenuItem>
            {(block.status === "draft" ||
              block.status === "pending_approval" ||
              block.status === "active") && <DropdownMenuSeparator />}
            {block.status === "draft" ? (
              <DropdownMenuItem disabled={pending} onSelect={onActivate}>
                Activate
              </DropdownMenuItem>
            ) : null}
            {block.status === "pending_approval" ? (
              <DropdownMenuItem disabled={pending} onSelect={onApprove}>
                Approve
              </DropdownMenuItem>
            ) : null}
            {block.status === "active" ? (
              <DropdownMenuItem disabled={pending} onSelect={onRelease}>
                Release
              </DropdownMenuItem>
            ) : null}
            {block.status === "draft" || block.status === "pending_approval" ? (
              <DropdownMenuItem
                disabled={pending}
                className="text-destructive focus:text-destructive"
                onSelect={onCancel}
              >
                Cancel
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

function BlockStatus({ status }: { status: OperationalBlockStatus }) {
  const tone =
    status === "active"
      ? "danger"
      : status === "pending_approval"
        ? "warning"
        : status === "released"
          ? "success"
          : "neutral";
  return <StatusPill label={titleCase(status)} tone={tone} />;
}

function BlocksPagination({
  total,
  loadedTotal,
  page,
  pageCount,
  pageSize,
  start,
  end,
  onPage,
  onPageSize,
}: {
  total: number;
  loadedTotal: number;
  page: number;
  pageCount: number;
  pageSize: number;
  start: number;
  end: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5DED4] px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Showing {total === 0 ? 0 : start + 1}–{end} of {total} matching blocks
        {loadedTotal >= 500 ? " (first 500 loaded)" : ""}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs font-medium"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="mr-1 size-3.5" />
          Previous
        </Button>
        <span className="grid size-8 place-items-center rounded bg-[#C89933] text-xs font-bold text-[#251605]">
          {page}
        </span>
        <span className="px-1 text-xs text-muted-foreground">of {pageCount}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs font-medium"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="ml-2 h-8 rounded border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605]"
          aria-label="Rows per page"
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      </div>
    </footer>
  );
}

function CreateBlockDrawer({
  open,
  form,
  rooms,
  pinnedRoom = null,
  roomTypes,
  rules,
  selectedRule,
  previewAvailability,
  previewLoading,
  pending,
  ready,
  onOpenChange,
  onForm,
  onCreate,
}: {
  open: boolean;
  form: BlockForm;
  rooms: HotelRoom[];
  pinnedRoom?: { id: string; label: string } | null;
  roomTypes: RoomType[];
  rules: Array<{
    blockType: string;
    enabled: boolean;
    approvalRequired: boolean;
    inventoryImpact: string;
  }>;
  selectedRule: {
    blockType: string;
    approvalRequired: boolean;
    inventoryImpact: string;
  } | null;
  previewAvailability: number | null;
  previewLoading: boolean;
  pending: boolean;
  ready: boolean;
  onOpenChange: (open: boolean) => void;
  onForm: (form: BlockForm) => void;
  onCreate: (intent: CreateIntent) => void;
}) {
  const selectedRoom =
    form.targetKind === "room" ? rooms.find((room) => room.id === form.targetId) : null;
  const selectedTypeId = form.targetKind === "room" ? selectedRoom?.roomTypeId : form.targetId;
  const selectedType = roomTypes.find((roomType) => roomType.id === selectedTypeId);
  const requestedImpact =
    form.targetKind === "quantity"
      ? Number(form.quantity) || 0
      : form.targetKind === "room"
        ? 1
        : (previewAvailability ?? 0);
  const removesInventory = selectedRule?.inventoryImpact === "remove_from_inventory";
  const after =
    previewAvailability == null
      ? null
      : !removesInventory
        ? previewAvailability
        : form.targetKind === "room"
          ? null
          : Math.max(0, previewAvailability - requestedImpact);
  const impactPercent =
    previewAvailability && after != null
      ? `${Math.round(((previewAvailability - after) / previewAvailability) * 100)}%`
      : "—";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg md:max-w-xl">
        <SheetHeader className="border-b border-[#E5DED4] px-6 py-4 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-[#C89933] border border-amber-200/60 shadow-2xs">
              <LockKeyhole className="size-4.5" />
            </span>
            <div>
              <SheetTitle className="font-display text-xl font-bold" style={{ color: INK }}>
                Create New Block
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                Create an inventory block for operational purposes.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="space-y-5 px-6 py-5">
          {pinnedRoom && form.targetKind === "room" ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-100/90 text-amber-900 font-semibold">
                  <LockKeyhole className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-amber-950 truncate">{pinnedRoom.label}</p>
                  <p className="text-[11px] text-amber-800">Blocking this specific room</p>
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-md">
                Pinned Room
              </span>
            </div>
          ) : null}

          <div className="rounded-xl border border-[#EDE7DF] bg-[#FAF8F5]/60 p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
              Block Configuration
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <DrawerSelect
                label="Block Type *"
                value={form.blockType}
                onChange={(value) => onForm({ ...form, blockType: value })}
                options={
                  rules.length > 0
                    ? rules.map((rule) => [rule.blockType, titleCase(rule.blockType)])
                    : [["", "No enabled block types"]]
                }
              />
              <DrawerSelect
                label="Target Level *"
                value={form.targetKind}
                onChange={(value) =>
                  onForm({
                    ...form,
                    targetKind: value as OperationalBlockTargetKind,
                    targetId: "",
                  })
                }
                options={[
                  ["room", "Room"],
                  ["room_type", "Room Type"],
                  ["quantity", "Quantity of Room Type"],
                ]}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#EDE7DF] bg-white p-4 space-y-4 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
              Target & Dates
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {form.targetKind === "room" ? (
                  <DrawerSelect
                    label="Room *"
                    value={form.targetId}
                    onChange={(value) => onForm({ ...form, targetId: value })}
                    options={[
                      ["", "Select room"],
                      ...(pinnedRoom && !rooms.some((room) => room.id === pinnedRoom.id)
                        ? [[pinnedRoom.id, pinnedRoom.label] as [string, string]]
                        : []),
                      ...rooms.map(
                        (room) =>
                          [room.id, `${room.roomNumber} · ${room.roomTypeName}`] as [string, string],
                      ),
                    ]}
                  />
                ) : (
                  <DrawerSelect
                    label="Room Type *"
                    value={form.targetId}
                    onChange={(value) => onForm({ ...form, targetId: value })}
                    options={[
                      ["", "Select room type"],
                      ...roomTypes.map((roomType) => [roomType.id, roomType.name]),
                    ]}
                  />
                )}
              </div>

              {form.targetKind === "quantity" ? (
                <div className="sm:col-span-2">
                  <DrawerInput
                    label="Quantity *"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(value) => onForm({ ...form, quantity: value })}
                  />
                </div>
              ) : null}

              <DrawerInput
                label="Start Date *"
                type="date"
                value={form.startDate}
                onChange={(value) =>
                  onForm({
                    ...form,
                    startDate: value,
                    endDate: form.endDate <= value ? addDays(value, 1) : form.endDate,
                  })
                }
              />
              <DrawerInput
                label="End Date *"
                type="date"
                min={addDays(form.startDate, 1)}
                value={form.endDate}
                onChange={(value) => onForm({ ...form, endDate: value })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#EDE7DF] bg-white p-4 space-y-3.5 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
              Reason & Notes
            </h4>
            <DrawerInput
              label="Reason *"
              value={form.reason}
              onChange={(value) => onForm({ ...form, reason: value })}
            />
            <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
              Notes
              <textarea
                value={form.notes}
                onChange={(event) => onForm({ ...form, notes: event.target.value })}
                rows={3}
                placeholder="Optional notes or operational context for staff..."
                className="rounded-lg border border-[#DED7CD] bg-white px-3 py-2 text-xs outline-none focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]/20 resize-none transition-all"
              />
            </label>
          </div>

          <section className="rounded-xl border border-[#E5DED4] bg-[#FAF8F5] p-4.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                Inventory Impact Preview
              </h3>
              {selectedRule ? (
                <StatusPill
                  label={titleCase(selectedRule.inventoryImpact)}
                  tone={removesInventory ? "warning" : "neutral"}
                />
              ) : null}
            </div>
            {previewLoading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Loading canonical availability…
              </p>
            ) : selectedType && previewAvailability != null ? (
              <dl className="mt-3 divide-y divide-[#E8E1D7] text-xs">
                <PreviewLine label="Room Type" value={selectedType.name} />
                <PreviewLine
                  label="Rooms to Block"
                  value={
                    removesInventory
                      ? form.targetKind === "room_type"
                        ? "Entire room type"
                        : requestedImpact
                      : "No inventory reduction"
                  }
                />
                <PreviewLine label="Available Rooms Current" value={previewAvailability} />
                <PreviewLine
                  label="Available Rooms After"
                  value={
                    after != null
                      ? after
                      : form.targetKind === "room"
                        ? "Validated on activation"
                        : "—"
                  }
                />
                <PreviewLine label="Impact" value={impactPercent} />
              </dl>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Select a target and valid dates to preview canonical availability.
              </p>
            )}
            {selectedRule ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground border-t border-[#E8E1D7] pt-2.5">
                Approval and impact come from Card 2 rules.{" "}
                <span className="font-semibold text-[#251605]">
                  {selectedRule.approvalRequired
                    ? "This block type requires approval."
                    : "Approval is not required."}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-xs leading-5 text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                No Card 2 block type is enabled. Enable a configured type before creating a block.
              </p>
            )}
          </section>
        </div>
        <SheetFooter className="sticky bottom-0 z-10 border-t border-[#E5DED4] bg-white/95 backdrop-blur-sm px-6 py-3.5 flex sm:flex-row items-center justify-end gap-2.5 shadow-xs">
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold"
            disabled={!ready || pending}
            onClick={() => onCreate("create")}
          >
            {selectedRule?.approvalRequired ? "Submit for Approval" : "Create Block"}
          </Button>
          {selectedRule && !selectedRule.approvalRequired ? (
            <Button
              className="h-9 px-4 text-xs font-semibold bg-[#C89933] text-[#251605] hover:bg-[#B5882D] shadow-xs"
              disabled={!ready || pending}
              onClick={() => onCreate("create_activate")}
            >
              Create & Activate
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DrawerSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-medium text-[#251605] outline-none focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]/20 transition-all"
      >
        {options.map(([id, name]) => (
          <option key={`${id}-${name}`} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DrawerInput({
  label,
  value,
  onChange,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
      {label}
      <Input
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-xs rounded-lg border-[#DED7CD] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]/20"
      />
    </label>
  );
}

function PreviewLine({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="font-bold text-[#251605]">{value}</dd>
    </div>
  );
}

function BlockDetailDrawer({
  block,
  room,
  roomType,
  onOpenChange,
}: {
  block: OperationalInventoryBlock | null;
  room: HotelRoom | null;
  roomType: RoomType | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!block) return null;
  const target =
    block.targetKind === "room"
      ? `Room ${room?.roomNumber ?? shortReference(block.roomId ?? block.id)}`
      : block.targetKind === "quantity"
        ? `${block.quantity ?? 0} × ${roomType?.name ?? shortReference(block.roomTypeId)}`
        : (roomType?.name ?? shortReference(block.roomTypeId));
  const values: Array<[string, string | number | null]> = [
    ["Target", target],
    ["Target Type", titleCase(block.targetKind)],
    ["Block Type", titleCase(block.blockType)],
    ["Inventory Impact", titleCase(block.inventoryImpact)],
    ["Current Status", titleCase(block.status)],
    ["Approval", block.approvalRequired ? "Required" : "Not required"],
    ["Start Date", dateLabel(block.startDate)],
    ["End Date", dateLabel(block.endDate)],
    ["Quantity", block.quantity],
    ["Reason", block.reason],
    ["Notes", block.notes],
    ["Created By", block.createdByMembershipId],
    ["Created At", new Date(block.createdAt).toLocaleString()],
    ["Approved By", block.approvedByMembershipId],
    ["Approved At", block.approvedAt ? new Date(block.approvedAt).toLocaleString() : null],
    ["Activated By", block.activatedByMembershipId],
    ["Activated At", block.activatedAt ? new Date(block.activatedAt).toLocaleString() : null],
    ["Released By", block.releasedByMembershipId],
    ["Released At", block.releasedAt ? new Date(block.releasedAt).toLocaleString() : null],
    ["Release Reason", block.releaseReason],
    ["Cancelled By", block.cancelledByMembershipId],
    ["Cancelled At", block.cancelledAt ? new Date(block.cancelledAt).toLocaleString() : null],
  ];
  return (
    <Sheet open={Boolean(block)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg md:max-w-xl">
        <SheetHeader className="border-b border-[#E5DED4] px-6 py-4 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-[#251605] border border-zinc-200 shadow-2xs">
              <Boxes className="size-4.5" />
            </span>
            <div>
              <SheetTitle className="font-display text-2xl font-bold" style={{ color: INK }}>
                {blockCode(block)}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                Operational inventory block details and lifecycle.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-[#EDE7DF] bg-[#FAF8F5] p-4 shadow-2xs">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Target Entity
              </p>
              <p className="text-sm font-bold text-[#251605] mt-0.5">{target}</p>
            </div>
            <BlockStatus status={block.status} />
          </div>
          <div className="rounded-xl border border-[#EDE7DF] bg-white p-4 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346] mb-2">
              Block Lifecycle & Properties
            </h4>
            <dl className="divide-y divide-[#EEE8E0]">
              {values.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[140px_1fr] gap-3 py-2.5 text-xs">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="break-words text-xs font-bold text-[#251605]">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <SheetFooter className="sticky bottom-0 z-10 border-t border-[#E5DED4] bg-white/95 backdrop-blur-sm px-6 py-3.5 flex sm:flex-row items-center justify-end">
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ActionConfirmation({
  action,
  note,
  pending,
  onNote,
  onClose,
  onConfirm,
}: {
  action: ConfirmAction | null;
  note: string;
  pending: boolean;
  onNote: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const releasing = action?.kind === "release";
  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#251605]">
            {releasing ? "Release block" : "Cancel block"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-5">
            {releasing
              ? "Releasing restores inventory according to canonical block policy. A reason is required."
              : "Cancelling is permanent and is only valid for draft or pending blocks."}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B] py-2">
          {releasing ? "Release reason *" : "Cancellation notes"}
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            rows={3}
            placeholder={releasing ? "Enter reason for releasing block..." : "Enter cancellation notes..."}
            className="rounded-lg border border-[#DED7CD] bg-white px-3 py-2 text-xs outline-none focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]/20 resize-none"
          />
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-9 px-4 text-xs font-semibold" onClick={onClose}>
            Keep Block
          </Button>
          <Button
            variant="destructive"
            className="h-9 px-4 text-xs font-semibold"
            disabled={pending || (releasing && !note.trim())}
            onClick={onConfirm}
          >
            {releasing ? "Release Block" : "Cancel Block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
