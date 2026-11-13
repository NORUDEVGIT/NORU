import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  Boxes,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Ellipsis,
  Eye,
  Hash,
  Layers3,
  Plus,
  ShieldCheck,
  X,
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
import {
  PmsFilterDateRange,
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
} from "@/packages/pms/components/pms-filter-popover";
import { Button } from "@/shared/components/ui/button";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_PLACEHOLDER,
  PMS_OP_SELECT_TRIGGER,
  PMS_OP_TEXTAREA,
} from "@/packages/pms/lib/pms-operational-surface";
import { cn } from "@/shared/lib/utils";
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
  ROOM_TABLE_HEAD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
  ROOM_SHELL_PRIMARY_BUTTON,
  RoomShellRefreshButton,
  RoomShellSlot,
  RoomSummaryChips,
  RoomTableFooter,
} from "./room-inventory-shell";
import { CompactSelect, InventoryState, PmsSelect } from "./room-inventory-shared";
import { addDays, dateLabel } from "./room-inventory-utils";
import {
  blockStatusLabel,
  displayName,
  groupReservationLabel,
  hotelDateTime,
  inventoryImpactSentence,
  inventoryImpactTable,
  lifecycleLine,
  removedRoomCount,
  staffNoteText,
} from "./room-block-display";

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

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
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
    return "Block edit permission is required for this action.";
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
  canBlockEdit = false,
}: {
  restaurantId: string;
  createPrefill?: RoomBlockCreatePrefill | null;
  canBlockEdit?: boolean;
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailBlock, setDetailBlock] = useState<OperationalInventoryBlock | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [form, setForm] = useState<BlockForm>(() => initialForm(""));

  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const businessDate = businessDateQuery.data?.businessDate ?? "";

  useEffect(() => {
    if (!businessDateQuery.data) return;
    setForm((current) => {
      if (current.startDate) return current;
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
  const roomCountByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const room of rooms) {
      counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1);
    }
    return counts;
  }, [rooms]);
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
      if (current.targetKind !== "room" || current.targetId !== createPrefill.roomId)
        return current;
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
        blockCode(block),
        block.reason,
        staffNoteText(block.notes) ?? "",
        block.blockType,
        block.createdByName ?? "",
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

  const blockFilterCount =
    (blockType !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (targetKind !== "all" ? 1 : 0) +
    (building !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);
  const blockSearch = (
    <div className="relative min-w-0 w-full">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="h-9 min-w-0 text-xs"
        placeholder="Search block, room, or reason…"
        aria-label="Search blocks"
      />
    </div>
  );
  const blockFilter = (
    <PmsFilterPopover
      title="Filter Blocks"
      activeCount={blockFilterCount}
      open={filterOpen}
      onOpenChange={setFilterOpen}
      onClear={clearFilters}
      onApply={() => setFilterOpen(false)}
      buttonTestId="blocks-filters-button"
      menuTestId="blocks-filters-menu"
    >
      <PmsFilterSection title="Block Type">
        <PmsFilterSelect
          value={blockType}
          onValueChange={setBlockType}
          options={[
            ["all", "All Types"],
            ...rules.map((rule) => [rule.blockType, titleCase(rule.blockType)] as const),
          ]}
          ariaLabel="Block Type"
        />
      </PmsFilterSection>
      <PmsFilterSection title="Status">
        <PmsFilterSelect
          value={status}
          onValueChange={setStatus}
          options={[
            ["all", "All Statuses"],
            ["draft", "Draft"],
            ["pending_approval", "Pending Approval"],
            ["active", "Active"],
            ["released", "Released"],
            ["cancelled", "Cancelled"],
          ]}
          ariaLabel="Status"
        />
      </PmsFilterSection>
      <PmsFilterSection title="Target Type">
        <PmsFilterSelect
          value={targetKind}
          onValueChange={setTargetKind}
          options={[
            ["all", "All Targets"],
            ["room", "Room"],
            ["room_type", "Room Type"],
            ["quantity", "Quantity"],
          ]}
          ariaLabel="Target Type"
        />
      </PmsFilterSection>
      <PmsFilterSection title="Building">
        <PmsFilterSelect
          value={building}
          onValueChange={setBuilding}
          options={[["all", "All Buildings"], ...buildings.map((value) => [value, value] as const)]}
          ariaLabel="Building"
        />
      </PmsFilterSection>
      <PmsFilterSection title="Date Range">
        <PmsFilterDateRange from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} />
      </PmsFilterSection>
    </PmsFilterPopover>
  );

  return (
    <div className="space-y-3">
      <RoomShellSlot name="controls">{blockSearch}</RoomShellSlot>
      <RoomShellSlot name="filter">{blockFilter}</RoomShellSlot>
      <RoomShellSlot name="actions">
        <RoomShellRefreshButton
          spinning={blocksQuery.isFetching}
          onClick={() => void blocksQuery.refetch()}
          testId="blocks-refresh"
        />
      </RoomShellSlot>
      {canBlockEdit ? (
        <RoomShellSlot name="cta">
          <Button
            type="button"
            className={ROOM_SHELL_PRIMARY_BUTTON}
            disabled={managerDenied}
            onClick={openCreate}
          >
            <Plus className="mr-1.5 size-4" />
            New Block
          </Button>
        </RoomShellSlot>
      ) : null}
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <RoomSummaryChips
            items={[
              { label: "Active", value: activeBlocks.length, tone: "success" },
              { label: "Pending", value: pendingApprovals, tone: "warning" },
              { label: "Rooms", value: uniqueRoomTargets, tone: "info" },
              { label: "Ending soon", value: endingSoon, tone: "neutral" },
            ]}
          />

          {blocksQuery.isLoading ? (
            <InventoryState state="loading" />
          ) : managerDenied ? (
            <InventoryState
              state="error"
              title="Blocks are unavailable for your role"
              description="Block edit permission is required to list and change operational blocks. Availability, Calendar, and Room Board remain available."
              onRetry={() => blocksQuery.refetch()}
            />
          ) : filteredBlocks.length === 0 ? (
            <InventoryState
              state="empty"
              title="No matching blocks"
              description="Clear filters or create an operational block."
            />
          ) : (
            <section className={ROOM_TABLE_WRAP}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-xs">
                  <thead className="border-b border-[#E5DED4] bg-[#F8F5F0] text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                    <tr>
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
                        typeRoomCount={roomCountByType.get(block.roomTypeId) ?? 0}
                        pending={mutation.isPending}
                        canMutate={canBlockEdit}
                        open={detailBlock?.id === block.id}
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
        </div>
        {detailBlock ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-[#251605]/40 lg:hidden"
              aria-label="Close block details"
              onClick={() => setDetailBlock(null)}
            />
            <aside
              className="fixed inset-y-0 right-0 z-50 w-[360px] max-w-full overflow-y-auto border-l border-[#DDD4C5] bg-white shadow-xl lg:sticky lg:inset-auto lg:top-3 lg:z-auto lg:h-[calc(100vh-11.5rem)] lg:max-h-[calc(100vh-11.5rem)] lg:shrink-0 lg:rounded-lg lg:border lg:shadow-sm"
              data-testid="block-detail-drawer"
              aria-label="Block details"
            >
              <BlockDetailDrawer
                block={detailBlock}
                room={detailBlock.roomId ? (roomById.get(detailBlock.roomId) ?? null) : null}
                roomType={typeById.get(detailBlock.roomTypeId) ?? null}
                typeRoomCount={roomCountByType.get(detailBlock.roomTypeId) ?? 0}
                timeZone={businessDateQuery.data?.timezone ?? null}
                onClose={() => setDetailBlock(null)}
              />
            </aside>
          </>
        ) : null}
      </div>

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
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3.5 text-xs font-medium"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </section>
  );
}

function blockTargetLabel(
  block: OperationalInventoryBlock,
  room: HotelRoom | null,
  roomType: RoomType | null,
): string {
  if (block.targetKind === "room") {
    return room?.roomNumber ? `Room ${room.roomNumber}` : "Room";
  }
  const typeName = roomType?.name ?? "Room type";
  if (block.targetKind === "quantity") {
    const count = block.quantity ?? 0;
    return `${count} × ${typeName}`;
  }
  return typeName;
}

function targetTypeLabel(kind: OperationalBlockTargetKind): string {
  if (kind === "room") return "Room";
  if (kind === "quantity") return "Quantity";
  return "Room type";
}

function BlockTableRow({
  block,
  room,
  roomType,
  typeRoomCount,
  pending,
  canMutate,
  open,
  onDetails,
  onActivate,
  onApprove,
  onRelease,
  onCancel,
}: {
  block: OperationalInventoryBlock;
  room: HotelRoom | null;
  roomType: RoomType | null;
  typeRoomCount: number;
  pending: boolean;
  canMutate: boolean;
  open: boolean;
  onDetails: () => void;
  onActivate: () => void;
  onApprove: () => void;
  onRelease: () => void;
  onCancel: () => void;
}) {
  const target = blockTargetLabel(block, room, roomType);
  const approval = !block.approvalRequired
    ? "Not required"
    : block.status === "pending_approval"
      ? "Pending"
      : block.approvedByMembershipId
        ? "Approved"
        : "Required";
  const impact = inventoryImpactTable(
    removedRoomCount(block, typeRoomCount),
    block.inventoryImpact,
  );
  return (
    <tr
      className={`cursor-pointer border-b border-[#EEE8E0] transition-colors last:border-0 hover:bg-[#FAF8F4] ${
        open ? "bg-[#F4E9D0]/70" : ""
      }`}
      onClick={onDetails}
    >
      <td className="px-3.5 py-3 font-mono text-xs font-bold text-[#251605]">{blockCode(block)}</td>
      <td className="max-w-52 px-3.5 py-3">
        <p className="truncate text-xs font-bold text-[#251605]">{target}</p>
        <p className="text-[11px] text-muted-foreground">{targetTypeLabel(block.targetKind)}</p>
      </td>
      <td className="px-3.5 py-3">
        <span className="inline-flex rounded-full border border-[#DDD4C5] bg-[#F4EFE7] px-2 py-0.5 text-[11px] font-medium text-[#5F492D]">
          {titleCase(block.blockType)}
        </span>
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#3D352B]">
        {dateLabel(block.startDate)}
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#3D352B]">
        {dateLabel(block.endDate)}
      </td>
      <td className="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-[#251605]">
        {impact}
      </td>
      <td className="px-3.5 py-3">
        {approval === "Not required" ? (
          <span className="text-[11px] text-[#756A5B]">Not required</span>
        ) : (
          <BlockStatusChip
            label={approval}
            tone={approval === "Approved" ? "active" : approval === "Pending" ? "pending" : "draft"}
          />
        )}
      </td>
      <td className="px-3.5 py-3 text-xs text-[#251605]">{displayName(block.createdByName)}</td>
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
            {canMutate &&
            (block.status === "draft" ||
              block.status === "pending_approval" ||
              block.status === "active") ? (
              <DropdownMenuSeparator />
            ) : null}
            {canMutate && block.status === "draft" ? (
              <DropdownMenuItem disabled={pending} onSelect={onActivate}>
                Activate
              </DropdownMenuItem>
            ) : null}
            {canMutate && block.status === "pending_approval" ? (
              <DropdownMenuItem disabled={pending} onSelect={onApprove}>
                Approve
              </DropdownMenuItem>
            ) : null}
            {canMutate && block.status === "active" ? (
              <DropdownMenuItem disabled={pending} onSelect={onRelease}>
                Release
              </DropdownMenuItem>
            ) : null}
            {canMutate && (block.status === "draft" || block.status === "pending_approval") ? (
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

function BlockStatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "draft" | "pending" | "active" | "released" | "cancelled";
}) {
  const tones = {
    draft: "border-[#DDD4C5] bg-[#FAF8F4] text-[#5C5346]",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    active: "border-emerald-200 bg-emerald-50 text-emerald-800",
    released: "border-[#DDD4C5] bg-white text-[#5C5346]",
    cancelled: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function BlockStatus({ status }: { status: OperationalBlockStatus }) {
  const tone =
    status === "active"
      ? "active"
      : status === "pending_approval"
        ? "pending"
        : status === "released"
          ? "released"
          : status === "cancelled"
            ? "cancelled"
            : "draft";
  return <BlockStatusChip label={blockStatusLabel(status)} tone={tone} />;
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
        <div className="ml-2 w-28">
          <PmsSelect
            value={String(pageSize)}
            onChange={(val) => onPageSize(Number(val))}
            options={[
              ["10", "10 / page"],
              ["25", "25 / page"],
              ["50", "50 / page"],
            ]}
            triggerClassName="h-8 text-xs font-medium"
          />
        </div>
      </div>
    </footer>
  );
}

function impactStatusLabel(impact: string): string {
  if (impact === "remove_from_inventory") return "Remove from inventory";
  if (impact === "assignment_only") return "Cannot assign";
  if (impact === "warning_only") return "Warning only";
  if (impact === "no_inventory_impact") return "No inventory change";
  return "—";
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
  const [attempted, setAttempted] = useState(false);
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
  const inventoryShort =
    removesInventory &&
    previewAvailability != null &&
    ((form.targetKind === "quantity" && requestedImpact > previewAvailability) ||
      (form.targetKind === "room" && previewAvailability < 1));
  const issues: string[] = [];
  if (!form.blockType || !selectedRule) issues.push("Choose a block type.");
  if (!form.targetId) issues.push("Choose a target.");
  if (!form.startDate) issues.push("Start date is required.");
  if (!form.endDate) issues.push("End date is required.");
  if (form.startDate && form.endDate && form.endDate <= form.startDate) {
    issues.push("End date must be after the start date.");
  }
  if (form.targetKind === "quantity" && !(Number(form.quantity) > 0)) {
    issues.push("Quantity must be greater than zero.");
  }
  if (!form.reason.trim()) issues.push("Reason is required.");
  const targetLabel =
    form.targetKind === "room"
      ? selectedRoom?.roomNumber
        ? `Room ${selectedRoom.roomNumber}`
        : (pinnedRoom?.label ?? "Room")
      : (selectedType?.name ?? "Room type");
  const heldLabel = !removesInventory
    ? "None"
    : form.targetKind === "room"
      ? "1 room"
      : form.targetKind === "room_type"
        ? "All currently sellable rooms"
        : `${requestedImpact} ${requestedImpact === 1 ? "room" : "rooms"}`;
  const quantityLabel =
    form.targetKind === "quantity"
      ? form.quantity || "—"
      : form.targetKind === "room"
        ? "1 room"
        : "All rooms of this type";
  const approvalRequired = selectedRule?.approvalRequired === true;

  function submit(intent: CreateIntent) {
    setAttempted(true);
    if (!ready || issues.length > 0) return;
    onCreate(intent);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAttempted(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-testid="create-block-modal"
        className="z-[80] flex max-h-[88vh] w-[min(92vw,840px)] max-w-[840px] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-[#FBF7F1] p-0 shadow-2xl sm:max-w-[840px] sm:rounded-2xl [&>button.absolute]:hidden"
      >
        <header className="relative shrink-0 bg-[#1F140A] px-5 py-3 pr-12 text-left text-[#F3E9D8]">
          <DialogTitle className="font-display text-sm font-semibold text-white">
            Create New Block
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">
            Create an inventory block for operational purposes.
          </DialogDescription>
          <button
            type="button"
            className="absolute right-3 top-2.5 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C89933]" aria-hidden />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {pinnedRoom && form.targetKind === "room" ? (
            <p className="rounded-md border border-[#DDD4C5] bg-white px-3 py-2 text-xs text-[#5C5346]">
              This block is for{" "}
              <span className="font-semibold text-[#251605]">{pinnedRoom.label}</span>.
            </p>
          ) : null}

          <section className="space-y-3 rounded-lg border border-[#DDD4C5] bg-white p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
              Block Configuration
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                icon={Layers3}
                label="Block type"
                value={form.blockType}
                onChange={(value) => onForm({ ...form, blockType: value })}
                options={
                  rules.length > 0
                    ? rules.map((rule) => [rule.blockType, titleCase(rule.blockType)])
                    : [["", "No enabled block types"]]
                }
              />
              <FieldSelect
                icon={Boxes}
                label="Target level"
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
          </section>

          <section className="space-y-3 rounded-lg border border-[#DDD4C5] bg-white p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
              Target & Dates
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {form.targetKind === "room" ? (
                  <FieldSelect
                    icon={BedDouble}
                    label="Room"
                    value={form.targetId}
                    onChange={(value) => onForm({ ...form, targetId: value })}
                    options={[
                      ["", "Select room"],
                      ...(pinnedRoom && !rooms.some((room) => room.id === pinnedRoom.id)
                        ? [[pinnedRoom.id, pinnedRoom.label] as [string, string]]
                        : []),
                      ...rooms.map(
                        (room) =>
                          [room.id, `${room.roomNumber} · ${room.roomTypeName}`] as [
                            string,
                            string,
                          ],
                      ),
                    ]}
                  />
                ) : (
                  <FieldSelect
                    icon={BedDouble}
                    label="Room type"
                    value={form.targetId}
                    onChange={(value) => onForm({ ...form, targetId: value })}
                    options={[
                      ["", "Select room type"],
                      ...roomTypes.map(
                        (roomType) => [roomType.id, roomType.name] as [string, string],
                      ),
                    ]}
                  />
                )}
              </div>
              <FieldInput
                icon={Calendar}
                label="Start date"
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
              <FieldInput
                icon={Calendar}
                label="End date"
                type="date"
                min={form.startDate ? addDays(form.startDate, 1) : undefined}
                value={form.endDate}
                onChange={(value) => onForm({ ...form, endDate: value })}
              />
              {form.targetKind === "quantity" ? (
                <div className="sm:col-span-2">
                  <FieldInput
                    icon={Hash}
                    label="Quantity"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(value) => onForm({ ...form, quantity: value })}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[#DDD4C5] bg-white p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
              Reason & Notes
            </h3>
            <FieldInput
              label="Reason"
              value={form.reason}
              onChange={(value) => onForm({ ...form, reason: value })}
              placeholder="Why this block is needed"
            />
            <label className="grid gap-1.5 text-xs font-semibold text-[#5C5346]">
              Notes
              <textarea
                value={form.notes}
                onChange={(event) => onForm({ ...form, notes: event.target.value })}
                rows={3}
                placeholder="Optional note for staff"
                className={cn(PMS_OP_TEXTAREA, PMS_OP_PLACEHOLDER, "resize-none")}
              />
            </label>
          </section>

          <section className="rounded-lg border border-[#DDD4C5] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
                Inventory Impact Preview
              </h3>
              {selectedRule ? (
                <span className="rounded-full border border-[#DDD4C5] bg-[#F4EFE7] px-2 py-0.5 text-[11px] font-semibold text-[#5F492D]">
                  {impactStatusLabel(selectedRule.inventoryImpact)}
                </span>
              ) : null}
            </div>
            {previewLoading ? (
              <p className="mt-2 text-xs text-[#756A5B]">Loading availability…</p>
            ) : selectedType && previewAvailability != null ? (
              <dl className="mt-1">
                <PreviewLine label="Target" value={targetLabel} />
                <PreviewLine
                  label="Date range"
                  value={
                    form.startDate && form.endDate
                      ? `${dateLabel(form.startDate)} – ${dateLabel(form.endDate)}`
                      : "—"
                  }
                />
                <PreviewLine label="Quantity" value={quantityLabel} />
                <PreviewLine label="Sellable inventory before" value={previewAvailability} />
                <PreviewLine label="Inventory removed or held" value={heldLabel} />
                <PreviewLine
                  label="Remaining sellable inventory"
                  value={
                    form.targetKind === "room"
                      ? "Checked when the block is activated"
                      : after == null
                        ? "—"
                        : after
                  }
                />
              </dl>
            ) : (
              <p className="mt-2 text-xs text-[#756A5B]">
                Choose a target and dates to see the inventory impact.
              </p>
            )}
            {inventoryShort ? (
              <p className="mt-2 text-xs font-medium text-amber-800" role="alert">
                This target does not have enough sellable inventory for these dates.
              </p>
            ) : null}
            {selectedRule ? (
              approvalRequired ? (
                <p className="mt-2 text-xs font-semibold text-[#8A641A]">
                  Approval: Required before this block can be activated.
                </p>
              ) : (
                <p className="mt-2 text-xs text-[#756A5B]">Approval: Not required</p>
              )
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                No block type is available. Enable a block type before creating a block.
              </p>
            )}
          </section>
        </div>

        {attempted && issues.length > 0 ? (
          <ul className="space-y-1 border-t border-[#DDD4C5] px-5 py-2" role="alert">
            {issues.map((issue) => (
              <li key={issue} className="text-xs text-destructive">
                {issue}
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[#DDD4C5] bg-[#FBF7F1] px-5 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-9 border-[#DDD4C5] px-4 text-xs font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {approvalRequired ? (
              <Button
                type="button"
                className={SHELL_PRIMARY_BUTTON}
                disabled={pending}
                onClick={() => submit("create")}
              >
                Create Block
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 border-[#DDD4C5] px-4 text-xs font-semibold"
                  disabled={pending || !selectedRule}
                  onClick={() => submit("create")}
                >
                  Create Block
                </Button>
                <Button
                  type="button"
                  className={SHELL_PRIMARY_BUTTON}
                  disabled={pending || !selectedRule}
                  onClick={() => submit("create_activate")}
                >
                  Create & Activate
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function FieldSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Layers3;
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold text-[#5C5346]">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[#8A641A]" />
        <PmsSelect
          value={value}
          onChange={onChange}
          options={options.map((option) => [option[0], option[1]])}
          triggerClassName={cn(PMS_OP_SELECT_TRIGGER, "pl-9")}
        />
      </div>
    </div>
  );
}

function FieldInput({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  min,
  placeholder,
}: {
  icon?: typeof Calendar;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#5C5346]">
      {label}
      <span className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A641A]" />
        ) : null}
        <Input
          type={type}
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            PMS_OP_INPUT,
            type === "date" && PMS_OP_DATE,
            PMS_OP_PLACEHOLDER,
            Icon && "pl-9",
          )}
        />
      </span>
    </label>
  );
}

function PreviewLine({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <dt className="text-[#756A5B]">{label}</dt>
      <dd className="max-w-[58%] text-right font-semibold text-[#251605]">{value}</dd>
    </div>
  );
}

function BlockDetailDrawer({
  block,
  room,
  roomType,
  typeRoomCount,
  timeZone,
  onClose,
}: {
  block: OperationalInventoryBlock;
  room: HotelRoom | null;
  roomType: RoomType | null;
  typeRoomCount: number;
  timeZone: string | null;
  onClose: () => void;
}) {
  const target = blockTargetLabel(block, room, roomType);
  const removed = removedRoomCount(block, typeRoomCount);
  const impact = inventoryImpactSentence(removed, block.inventoryImpact);
  const note = staffNoteText(block.notes);
  const releaseNote = staffNoteText(block.releaseReason);
  const groupLabel = groupReservationLabel(block);
  const approvalStatus = !block.approvalRequired
    ? "Not required"
    : block.status === "pending_approval"
      ? "Pending"
      : block.approvedAt
        ? "Approved"
        : "Required";
  const when = (iso: string | null) => hotelDateTime(iso, timeZone);
  const lifecycle = [
    lifecycleLine("Created", block.createdByName, when(block.createdAt)),
    lifecycleLine("Activated", block.activatedByName, when(block.activatedAt)),
    lifecycleLine("Released", block.releasedByName, when(block.releasedAt)),
    ...(block.status === "cancelled"
      ? [lifecycleLine("Cancelled", block.cancelledByName, when(block.cancelledAt))]
      : []),
  ];
  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-[#E8E1D7] px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold leading-tight" style={{ color: INK }}>
              {blockCode(block)}
            </h2>
            <p className="mt-1 text-xs leading-4 text-[#5C5346]">{target}</p>
          </div>
          <span className="mt-0.5 shrink-0">
            <BlockStatus status={block.status} />
          </span>
          <button
            type="button"
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#251605] hover:bg-[#F3EEE4]"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <section className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
          Block Summary
        </h3>
        <dl className="mt-1">
          <DetailLine label="Target" value={target} />
          <DetailLine label="Target Type" value={targetTypeLabel(block.targetKind)} />
          <DetailLine label="Block Type" value={titleCase(block.blockType)} />
          <DetailLine label="Start Date" value={dateLabel(block.startDate)} />
          <DetailLine label="End Date" value={dateLabel(block.endDate)} />
          <DetailLine label="Quantity" value={block.quantity ?? "—"} />
          <DetailLine label="Current Status" value={blockStatusLabel(block.status)} />
          <DetailLine label="Reason" value={block.reason} />
          {groupLabel ? <DetailLine label="Group" value={groupLabel} /> : null}
        </dl>
      </section>

      <section className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
          Inventory Impact
        </h3>
        <p
          className={
            removed
              ? "mt-1.5 rounded-md bg-[#F4E9D0] px-3 py-2 text-sm font-bold text-[#251605] ring-1 ring-[#C89933]"
              : "mt-1 text-xs font-medium text-[#251605]"
          }
        >
          {impact}
        </p>
      </section>

      <section className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
          Approval
        </h3>
        {approvalStatus === "Not required" ? (
          <p className="mt-1 text-xs text-[#5C5346]">Not required</p>
        ) : (
          <dl className="mt-1">
            <DetailLine label="Approval status" value={approvalStatus} />
            <DetailLine label="Approved by" value={displayName(block.approvedByName)} />
            <DetailLine label="Approved at" value={when(block.approvedAt) ?? "—"} />
          </dl>
        )}
      </section>

      <section className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
          Lifecycle
        </h3>
        <ul className="mt-1 space-y-1">
          {lifecycle.map((line) => (
            <li key={line} className="text-xs leading-5 text-[#251605]">
              {line}
            </li>
          ))}
          {releaseNote ? (
            <li className="text-xs leading-5 text-[#5C5346]">Release reason: {releaseNote}</li>
          ) : null}
        </ul>
      </section>

      <section className="px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">Notes</h3>
        <p className="mt-1 text-xs leading-5 text-[#5C5346]">{note ?? "No notes recorded"}</p>
      </section>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <dt className="text-[#756A5B]">{label}</dt>
      <dd className="max-w-[58%] text-right font-semibold text-[#251605]">{value}</dd>
    </div>
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
            placeholder={
              releasing ? "Enter reason for releasing block..." : "Enter cancellation notes..."
            }
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
