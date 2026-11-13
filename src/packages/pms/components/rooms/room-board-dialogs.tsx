import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, CheckCircle2, History, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import { getInventoryRules } from "@/packages/pms/lib/inventory-rules.functions";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import { PMS_OP_DATE, PMS_OP_INPUT, PMS_OP_PLACEHOLDER } from "@/packages/pms/lib/pms-operational-surface";
import {
  activateOperationalBlock,
  createOperationalBlock,
  evaluateRoomAssignment,
} from "@/packages/pms/lib/room-inventory.functions";
import type { RoomInventoryEvent } from "@/packages/pms/lib/room-inventory.functions";
import { saveRoom, type HotelRoom, type RoomType } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

import { formatRoomTypeName, statusPhrase } from "./room-board-utils";
import { describeRoomEvent, type RoomHistoryEntry } from "./room-detail-format";
import { addDays, dateLabel, eligibilityCodeLabel } from "./room-inventory-utils";
import { PmsSelect } from "./room-inventory-shared";

const IMPACT_COPY: Record<string, string> = {
  remove_from_inventory: "The room is held and leaves sellable availability for these dates.",
  assignment_only: "The room stays in inventory, but it cannot be assigned for these dates.",
  warning_only: "Staff see a warning. The room can still be sold.",
  no_inventory_impact: "The block is recorded only. Availability does not change.",
};

function bedSummary(roomType: RoomType | undefined): string {
  if (!roomType) return "—";
  if (roomType.beds.length) {
    return roomType.beds
      .map(
        (bed) =>
          `${bed.numberOfBeds} ${bed.bedSize ? `${statusPhrase(bed.bedSize)} ` : ""}${statusPhrase(bed.bedType)}`,
      )
      .join(", ");
  }
  if (roomType.bedType) return `${roomType.bedCount ?? "—"} ${statusPhrase(roomType.bedType)}`;
  return "—";
}

function BoardDialogFrame({
  open,
  onClose,
  title,
  description,
  testId,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  testId: string;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid={testId}
        className={cn(
          "z-[100] max-h-[90vh] max-w-none gap-0 overflow-hidden rounded-xl border-[#DDD4C5] bg-[#FBF7F1] p-0",
          wide ? "w-[min(94vw,760px)]" : "w-[min(94vw,560px)]",
        )}
      >
        <DialogHeader className="space-y-0.5 border-b border-[#2E1F10] bg-[#1F140A] px-5 py-3.5 text-left">
          <DialogTitle className="font-display text-sm font-semibold text-white">{title}</DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <DialogFooter className="flex-row justify-end gap-2 border-t border-[#E8DFD0] bg-white px-5 py-3 sm:space-x-0">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" className="h-9 border-[#DDD4C5]" disabled={disabled} onClick={onClick}>
      Cancel
    </Button>
  );
}

/* ------------------------------------------------------------------- block */

export function RoomBlockDialog({
  restaurantId,
  room,
  open,
  onClose,
}: {
  restaurantId: string;
  room: HotelRoom | null;
  open: boolean;
  onClose: () => void;
}) {
  const loadRules = useServerFn(getInventoryRules);
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const createBlock = useServerFn(createOperationalBlock);
  const activateBlock = useServerFn(activateOperationalBlock);
  const queryClient = useQueryClient();

  const [blockType, setBlockType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const rulesQuery = useQuery({
    queryKey: ["inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });
  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    enabled: open,
    staleTime: 60_000,
  });
  const enabledRules = (rulesQuery.data?.rules.blockTypes ?? []).filter((rule) => rule.enabled);
  const selectedRule = enabledRules.find((rule) => rule.blockType === blockType) ?? null;

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNotes("");
    setBlockType("");
    const date = businessDateQuery.data?.businessDate ?? "";
    setStartDate(date);
    setEndDate(date ? addDays(date, 1) : "");
    // Reset only when the dialog opens for a room. The business date fills in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room?.id]);

  useEffect(() => {
    const date = businessDateQuery.data?.businessDate;
    if (!open || !date) return;
    setStartDate((current) => current || date);
    setEndDate((current) => current || addDays(date, 1));
  }, [open, businessDateQuery.data?.businessDate]);

  useEffect(() => {
    if (!open || blockType || enabledRules.length === 0) return;
    setBlockType(enabledRules[0]?.blockType ?? "");
  }, [open, blockType, enabledRules]);

  const ready =
    Boolean(room) &&
    Boolean(selectedRule) &&
    Boolean(reason.trim()) &&
    Boolean(startDate) &&
    endDate > startDate;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!room || !selectedRule) throw new Error("Choose a block type.");
      if (endDate <= startDate) throw new Error("End date must be after the start date.");
      const created = await createBlock({
        data: {
          restaurantId,
          targetKind: "room",
          roomId: room.id,
          roomTypeId: room.roomTypeId,
          quantity: null,
          groupId: null,
          blockType: selectedRule.blockType,
          startDate,
          endDate,
          reason: reason.trim(),
          notes: notes.trim() || null,
        },
      });
      if (!selectedRule.approvalRequired) {
        await activateBlock({ data: { restaurantId, blockId: created.blockId } });
      }
      return selectedRule.approvalRequired;
    },
    onSuccess: async (needsApproval) => {
      toast.success(
        needsApproval
          ? `Block for room ${room?.roomNumber ?? ""} submitted for approval.`
          : `Room ${room?.roomNumber ?? ""} blocked for the selected dates.`,
      );
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operational-blocks", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-board-blocks", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-inventory-history", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-inventory-availability", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-inventory-calendar", restaurantId] }),
      ]);
      invalidateFrontOfficeOwnerReads(queryClient);
    },
  });

  return (
    <BoardDialogFrame
      open={open && Boolean(room)}
      onClose={() => !mutation.isPending && onClose()}
      testId="room-block-dialog"
      title={`Block Room ${room?.roomNumber ?? ""}`}
      description={room ? formatRoomTypeName(room.roomTypeName) : ""}
      footer={
        <>
          <CancelButton disabled={mutation.isPending} onClick={onClose} />
          <Button
            type="button"
            className={SHELL_PRIMARY_BUTTON}
            disabled={!ready || mutation.isPending}
            data-testid="room-block-submit"
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Saving…"
              : selectedRule?.approvalRequired
                ? "Submit for Approval"
                : "Block Room"}
          </Button>
        </>
      }
    >
      <div className="flex gap-2.5 rounded-lg border border-[#EADBBD] bg-[#FBF7EE] p-3 text-xs leading-5 text-[#5C5346]">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#8A641A]" />
        <p>
          A room block holds this room for the dates below. It does not change the room's condition.
          Use <strong>Set OOS / OOO</strong> when the room itself is out of use for repair or maintenance.
        </p>
      </div>
      {rulesQuery.isError ? (
        <p className="text-xs text-destructive">Block types could not be loaded for this property.</p>
      ) : enabledRules.length === 0 && !rulesQuery.isLoading ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          No block type is enabled in property setup, so a room block cannot be created.
        </p>
      ) : (
        <PmsSelect
          label="Block type"
          value={blockType}
          onChange={setBlockType}
          options={enabledRules.map((rule) => [rule.blockType, statusPhrase(rule.blockType)] as [string, string])}
        />
      )}
      {selectedRule ? (
        <p className="text-[11px] leading-4 text-[#756A5B]">
          {IMPACT_COPY[selectedRule.inventoryImpact] ?? statusPhrase(selectedRule.inventoryImpact)}
          {selectedRule.approvalRequired ? " This block type needs approval before it takes effect." : ""}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Start date
          <input
            type="date"
            value={startDate}
            data-testid="room-block-start"
            onChange={(event) => {
              const next = event.target.value;
              setStartDate(next);
              if (endDate <= next) setEndDate(addDays(next, 1));
            }}
            className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          End date
          <input
            type="date"
            value={endDate}
            min={startDate ? addDays(startDate, 1) : undefined}
            data-testid="room-block-end"
            onChange={(event) => setEndDate(event.target.value)}
            className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
          />
          <span className="text-[10px] font-normal text-[#756A5B]">
            The room is released on the morning of the end date.
          </span>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
        Reason
        <Textarea
          value={reason}
          maxLength={500}
          data-testid="room-block-reason"
          placeholder="Why is this room being held?"
          onChange={(event) => setReason(event.target.value)}
          className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER, "min-h-20 resize-none")}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
        Notes <span className="font-normal text-[#756A5B]">(optional)</span>
        <Textarea
          value={notes}
          maxLength={1000}
          onChange={(event) => setNotes(event.target.value)}
          className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER, "min-h-16 resize-none")}
        />
      </label>
      {mutation.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : "Could not block the room."}
        </p>
      ) : null}
    </BoardDialogFrame>
  );
}

/* -------------------------------------------------------------- eligibility */

function reasonText(item: Record<string, string | number | boolean | null>, index: number): string {
  const message = typeof item.message === "string" ? item.message.trim() : "";
  if (message && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(message)) return message;
  if (typeof item.code === "string" && item.code.trim()) return eligibilityCodeLabel(item.code);
  return `Reason ${index + 1}`;
}

export function RoomEligibilityDialog({
  restaurantId,
  room,
  open,
  onClose,
}: {
  restaurantId: string;
  room: HotelRoom | null;
  open: boolean;
  onClose: () => void;
}) {
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const evaluate = useServerFn(evaluateRoomAssignment);
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [bedType, setBedType] = useState("");
  const [accessibleRequired, setAccessibleRequired] = useState(false);
  const [connectingRequired, setConnectingRequired] = useState(false);
  const [forCheckIn, setForCheckIn] = useState(false);

  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const date = businessDateQuery.data?.businessDate ?? "";
    setArrival(date);
    setDeparture(date ? addDays(date, 1) : "");
    setAdults("1");
    setChildren("0");
    setBedType("");
    setAccessibleRequired(false);
    setConnectingRequired(false);
    setForCheckIn(false);
  }, [open, room?.id, businessDateQuery.data?.businessDate]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!room) throw new Error("Choose a room.");
      return evaluate({
        data: {
          restaurantId,
          roomId: room.id,
          roomTypeId: room.roomTypeId,
          arrival,
          departure,
          adults: Number(adults) || 0,
          children: Number(children) || 0,
          requiredBedType: bedType.trim() || null,
          accessibleRequired,
          connectingRequired,
          preferredBuildingId: null,
          preferredFloorId: null,
          guestPreferenceMatched: false,
          forCheckIn,
          excludeReservationId: null,
        },
      });
    },
  });

  const result = mutation.data ?? null;
  const datesReady = Boolean(arrival) && departure > arrival;

  return (
    <BoardDialogFrame
      open={open && Boolean(room)}
      onClose={() => !mutation.isPending && onClose()}
      testId="room-eligibility-dialog"
      wide
      title={`Check Assignment Eligibility · Room ${room?.roomNumber ?? ""}`}
      description="See whether this room can be assigned for a stay, and why it cannot."
      footer={
        <>
          <CancelButton disabled={mutation.isPending} onClick={onClose} />
          <Button
            type="button"
            className={SHELL_PRIMARY_BUTTON}
            disabled={!datesReady || mutation.isPending}
            data-testid="room-eligibility-submit"
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Checking…" : "Check Eligibility"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Arrival
          <input
            type="date"
            value={arrival}
            onChange={(event) => {
              const next = event.target.value;
              setArrival(next);
              if (departure <= next) setDeparture(addDays(next, 1));
            }}
            className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Departure
          <input
            type="date"
            value={departure}
            min={arrival ? addDays(arrival, 1) : undefined}
            onChange={(event) => setDeparture(event.target.value)}
            className={cn(PMS_OP_INPUT, PMS_OP_DATE)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Adults
          <input
            type="number"
            min={0}
            max={99}
            value={adults}
            onChange={(event) => setAdults(event.target.value)}
            className={PMS_OP_INPUT}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Children
          <input
            type="number"
            min={0}
            max={99}
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            className={PMS_OP_INPUT}
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
        Required bed type <span className="font-normal text-[#756A5B]">(optional)</span>
        <input
          value={bedType}
          onChange={(event) => setBedType(event.target.value)}
          className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER)}
          placeholder="Leave blank if any bed type is fine"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <CheckField label="Accessible room required" checked={accessibleRequired} onChange={setAccessibleRequired} />
        <CheckField label="Connecting room required" checked={connectingRequired} onChange={setConnectingRequired} />
        <CheckField label="Check in today" checked={forCheckIn} onChange={setForCheckIn} />
      </div>

      {mutation.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Eligibility could not be checked."}
        </p>
      ) : null}

      {result ? (
        <div
          className={cn(
            "space-y-3 rounded-lg border p-3",
            result.eligible ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
          )}
          data-testid="room-eligibility-result"
        >
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              result.eligible ? "text-emerald-950" : "text-red-950",
            )}
          >
            {result.eligible ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
            {result.eligible
              ? "This room can be assigned for the stay."
              : "This room cannot be assigned for the stay."}
          </p>
          <ReasonList
            title="Why it cannot be assigned"
            items={result.blockers}
            empty={result.eligible ? "No problems found." : "No specific reason was returned."}
            tone="danger"
          />
          {result.warnings.length > 0 ? (
            <ReasonList title="Warnings" items={result.warnings} empty="" tone="warning" />
          ) : null}
        </div>
      ) : null}
    </BoardDialogFrame>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 text-xs text-[#251605]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[#C89933]"
      />
      {label}
    </label>
  );
}

function ReasonList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: Array<Record<string, string | number | boolean | null>>;
  empty: string;
  tone: "danger" | "warning";
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5C5346]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-[#5C5346]">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li
              key={`${reasonText(item, index)}-${index}`}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium",
                tone === "danger" ? "bg-white text-red-900" : "bg-white text-amber-950",
              )}
            >
              {reasonText(item, index)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- configuration */

export function RoomConfigurationDialog({
  restaurantId,
  room,
  roomTypes,
  open,
  onClose,
}: {
  restaurantId: string;
  room: HotelRoom | null;
  roomTypes: RoomType[];
  open: boolean;
  onClose: () => void;
}) {
  const save = useServerFn(saveRoom);
  const queryClient = useQueryClient();
  const [roomTypeId, setRoomTypeId] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [wing, setWing] = useState("");
  const [smoking, setSmoking] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [sellable, setSellable] = useState(true);
  const [features, setFeatures] = useState("");

  useEffect(() => {
    if (!open || !room) return;
    setRoomTypeId(room.roomTypeId);
    setBuilding(room.building ?? "");
    setFloor(room.floor ?? "");
    setWing(room.wing ?? "");
    setSmoking(room.smoking);
    setAccessible(room.accessible);
    setSellable(room.sellable);
    setFeatures(room.roomFeatures.join(", "));
  }, [open, room]);

  const selectedType = roomTypes.find((type) => type.id === roomTypeId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!room) throw new Error("Choose a room.");
      if (!roomTypeId) throw new Error("Choose a room type.");
      const featureList = features
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30);
      const result = await save({
        data: {
          restaurantId,
          id: room.id,
          roomTypeId,
          roomNumber: room.roomNumber,
          roomCode: room.roomCode,
          floor: floor.trim() || null,
          building: building.trim() || null,
          wing: wing.trim() || null,
          buildingId: building.trim() === (room.building ?? "") ? room.buildingId : null,
          floorId: floor.trim() === (room.floor ?? "") ? room.floorId : null,
          wingId: wing.trim() === (room.wing ?? "") ? room.wingId : null,
          smoking,
          accessible,
          status: room.status,
          housekeepingStatus: room.housekeepingStatus ?? undefined,
          maintenanceStatus: room.maintenanceStatus,
          sellable,
          roomFeatures: featureList,
          active: room.active,
          notes: room.notes,
        },
      });
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: async () => {
      toast.success(`Room ${room?.roomNumber ?? ""} configuration saved.`);
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-board-room-types", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
      ]);
    },
  });

  return (
    <BoardDialogFrame
      open={open && Boolean(room)}
      onClose={() => !mutation.isPending && onClose()}
      testId="room-configuration-dialog"
      wide
      title={`Room Configuration · ${room?.roomNumber ?? ""}`}
      description="Room master details. Operational status, housekeeping, and maintenance stay as they are."
      footer={
        <>
          <CancelButton disabled={mutation.isPending} onClick={onClose} />
          <Button
            type="button"
            className={SHELL_PRIMARY_BUTTON}
            disabled={mutation.isPending || !roomTypeId}
            data-testid="room-configuration-save"
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save Configuration"}
          </Button>
        </>
      }
    >
      <PmsSelect
        label="Room type"
        value={roomTypeId}
        onChange={setRoomTypeId}
        options={roomTypes.map((type) => [type.id, formatRoomTypeName(type.name)] as [string, string])}
      />
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs">
        <div>
          <dt className="font-medium text-[#756A5B]">Occupancy</dt>
          <dd className="mt-0.5 font-semibold text-[#251605]">
            {selectedType ? `Up to ${selectedType.maxOccupancy}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[#756A5B]">Bed configuration</dt>
          <dd className="mt-0.5 font-semibold text-[#251605]">{bedSummary(selectedType)}</dd>
        </div>
        <p className="col-span-2 text-[11px] text-[#756A5B]">
          Occupancy and bed configuration follow the room type. Choosing another type updates them.
        </p>
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Building" value={building} onChange={setBuilding} />
        <TextField label="Floor" value={floor} onChange={setFloor} />
        <TextField label="Wing" value={wing} onChange={setWing} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <CheckField label="Smoking" checked={smoking} onChange={setSmoking} />
        <CheckField label="Accessible" checked={accessible} onChange={setAccessible} />
        <CheckField label="Sellable" checked={sellable} onChange={setSellable} />
      </div>
      <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
        Features
        <input
          value={features}
          onChange={(event) => setFeatures(event.target.value)}
          placeholder="Wi-Fi, Balcony, Bathtub"
          className={cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER)}
        />
        <span className="text-[10px] font-normal text-[#756A5B]">Separate features with commas.</span>
      </label>
      {mutation.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : "Could not save the room."}
        </p>
      ) : null}
    </BoardDialogFrame>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className={PMS_OP_INPUT} />
    </label>
  );
}

/* ------------------------------------------------------------------ history */

const TONE_DOT: Record<RoomHistoryEntry["tone"], string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  info: "bg-violet-500",
  neutral: "bg-slate-400",
};

export function RoomHistoryDialog({
  room,
  events,
  loading,
  failed,
  open,
  onClose,
}: {
  room: HotelRoom | null;
  events: RoomInventoryEvent[];
  loading: boolean;
  failed: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const entries = useMemo(
    () => events.filter((event) => event.roomId === room?.id).map(describeRoomEvent),
    [events, room?.id],
  );
  return (
    <BoardDialogFrame
      open={open && Boolean(room)}
      onClose={onClose}
      testId="room-history-dialog"
      wide
      title={`Room History · ${room?.roomNumber ?? ""}`}
      description="Restrictions, returns to service, and room blocks."
      footer={
        <Button type="button" variant="outline" className="h-9 border-[#DDD4C5]" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <p className="text-xs text-[#756A5B]">Loading history…</p>
      ) : failed ? (
        <p className="text-xs text-destructive">History could not be loaded. Refresh the room board and try again.</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-white p-8 text-center">
          <History className="mx-auto size-5 text-[#8A641A]" />
          <p className="mt-2 text-sm font-medium text-[#251605]">No room history yet</p>
        </div>
      ) : (
        <ol className="space-y-2" data-testid="room-history-list">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-[#DDD4C5] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#251605]">
                  <span className={cn("size-2 rounded-full", TONE_DOT[entry.tone])} aria-hidden />
                  {entry.title}
                </p>
                <time className="shrink-0 text-[11px] text-[#756A5B]">{entry.when}</time>
              </div>
              {entry.details.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {entry.details.map((line) => (
                    <li key={line} className="text-xs text-[#3D352B]">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {entry.effective || entry.expectedReturn ? (
                <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-[#5C5346]">
                  {entry.effective ? <span>{entry.effective}</span> : null}
                  {entry.expectedReturn ? <span>Expected return {entry.expectedReturn}</span> : null}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-[#756A5B]">By {entry.staff}</p>
            </li>
          ))}
        </ol>
      )}
    </BoardDialogFrame>
  );
}
