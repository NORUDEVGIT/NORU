import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Layers3,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  INVENTORY_IMPACTS,
  OVERBOOKING_AUTHORIZATION_NOTE,
  OVERBOOKING_CAPACITY_NOTE,
  OVERBOOKING_FUTURE_LIMITS_NOTE,
  defaultInventoryRules,
  normalizeInventoryRules,
  type InventoryImpact,
  type InventoryRulesDraft,
} from "@/packages/pms/lib/inventory-rules-card2.server";
import {
  getInventoryRules,
  saveInventoryRules,
} from "@/packages/pms/lib/inventory-rules.functions";
import { getOverbookingBoard } from "@/packages/pms/lib/overbooking.functions";
import { evaluateRoomAssignment } from "@/packages/pms/lib/room-inventory.functions";
import {
  getRoomsAccess,
  listRooms,
  listRoomTypes,
  type HotelRoom,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import {
  InventoryState,
  InventoryStatusBadge,
  InventoryViewHeader,
  PmsSelect,
} from "./room-inventory-shared";
import { addDays, eligibilityCodeLabel, preferenceReasonLabel } from "./room-inventory-utils";

export interface AssignmentInspectionPrefill {
  roomId: string;
  roomTypeId: string;
}

const INK = "#251605";
const PROPERTY_SETUP_HREF =
  "/restaurant/settings?returnTo=/restaurant/pms/room-inventory#rooms-inventory";

const IMPACT_LABELS: Record<InventoryImpact, string> = {
  remove_from_inventory: "Remove from inventory",
  assignment_only: "Assignment only",
  warning_only: "Warning only",
  no_inventory_impact: "No inventory impact",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return titleCase(value);
}

async function invalidateRuleViews(
  queryClient: ReturnType<typeof useQueryClient>,
  restaurantId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["room-inventory-rules", restaurantId] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-rules", restaurantId] }),
    queryClient.invalidateQueries({ queryKey: ["pms-card2-inventory-rules", restaurantId] }),
    queryClient.invalidateQueries({ queryKey: ["pms-card2-inventory-ready", restaurantId] }),
    queryClient.invalidateQueries({ queryKey: ["operational-blocks", restaurantId] }),
  ]);
}

export function RoomAssignmentEligibilityView({
  restaurantId,
  prefill,
}: {
  restaurantId: string;
  prefill?: AssignmentInspectionPrefill | null;
}) {
  const loadRooms = useServerFn(listRooms);
  const loadTypes = useServerFn(listRoomTypes);
  const evaluate = useServerFn(evaluateRoomAssignment);
  const roomsQuery = useQuery({
    queryKey: ["assignment-inspection-rooms", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: true } }),
    staleTime: 60_000,
  });
  const typesQuery = useQuery({
    queryKey: ["assignment-inspection-room-types", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId, includeInactive: true } }),
    staleTime: 60_000,
  });
  const [input, setInput] = useState({
    roomId: prefill?.roomId ?? "",
    roomTypeId: prefill?.roomTypeId ?? "",
    arrival: today(),
    departure: addDays(today(), 1),
    adults: "1",
    children: "0",
    requiredBedType: "",
    accessibleRequired: false,
    connectingRequired: false,
    preferredBuildingId: "",
    preferredFloorId: "",
    guestPreferenceMatched: false,
    forCheckIn: false,
  });
  useEffect(() => {
    if (prefill) setInput((current) => ({ ...current, ...prefill }));
  }, [prefill]);

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const room = rooms.find((item) => item.id === input.roomId) ?? null;
  const roomType =
    typesQuery.data?.find((item) => item.id === (room?.roomTypeId ?? input.roomTypeId)) ?? null;
  const mutation = useMutation({
    mutationFn: () =>
      evaluate({
        data: {
          restaurantId,
          roomId: input.roomId,
          roomTypeId: input.roomTypeId,
          arrival: input.arrival,
          departure: input.departure,
          adults: Number(input.adults),
          children: Number(input.children),
          requiredBedType: input.requiredBedType || null,
          accessibleRequired: input.accessibleRequired,
          connectingRequired: input.connectingRequired,
          preferredBuildingId: input.preferredBuildingId || null,
          preferredFloorId: input.preferredFloorId || null,
          guestPreferenceMatched: input.guestPreferenceMatched,
          forCheckIn: input.forCheckIn,
          excludeReservationId: null,
        },
      }),
  });
  const locations = useMemo(
    () => ({
      buildings: Array.from(
        new Map(
          rooms
            .filter((item) => item.buildingId)
            .map((item) => [item.buildingId!, item.building ?? "Building"]),
        ),
      ),
      floors: Array.from(
        new Map(
          rooms
            .filter((item) => item.floorId)
            .map((item) => [item.floorId!, item.floor ?? "Floor"]),
        ),
      ),
    }),
    [rooms],
  );

  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Assignment Eligibility"
        description="Verify stay requirements, check-in readiness, and operational eligibility for candidate rooms."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-[#E5DED4] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5DED4]/80 pb-3">
            <div>
              <h3 className="text-sm font-bold" style={{ color: INK }}>
                Stay & Requirements
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select a room and set stay parameters to evaluate assignment eligibility.
              </p>
            </div>
            {room ? (
              <span className="rounded-md bg-[#FAF8F5] border border-[#E8E1D7] px-2 py-0.5 text-[11px] font-semibold text-[#5F554B]">
                Room {room.roomNumber}
              </span>
            ) : null}
          </div>

          {roomsQuery.isLoading ? (
            <div className="py-8">
              <InventoryState state="loading" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Candidate room">
                    <PmsSelect
                      value={input.roomId}
                      onChange={(val) => {
                        const selected = rooms.find((item) => item.id === val);
                        setInput({
                          ...input,
                          roomId: val,
                          roomTypeId: selected?.roomTypeId ?? "",
                        });
                      }}
                      placeholder="Select a room to evaluate"
                      options={[
                        ["", "Select a room to evaluate"],
                        ...rooms.map((item) => [
                          item.id,
                          `Room ${item.roomNumber} · ${item.roomTypeName} (${titleCase(item.status)})`,
                        ] as [string, string]),
                      ]}
                      className="h-9 w-full rounded-md border-[#DED7CD] bg-white px-3 text-xs"
                    />
                  </Field>
                </div>

                <TextInput
                  label="Arrival"
                  type="date"
                  value={input.arrival}
                  onChange={(arrival) =>
                    setInput({
                      ...input,
                      arrival,
                      departure: input.departure <= arrival ? addDays(arrival, 1) : input.departure,
                    })
                  }
                />
                <TextInput
                  label="Departure"
                  type="date"
                  min={addDays(input.arrival, 1)}
                  value={input.departure}
                  onChange={(departure) => setInput({ ...input, departure })}
                />
                <TextInput
                  label="Adults"
                  type="number"
                  value={input.adults}
                  onChange={(adults) => setInput({ ...input, adults })}
                />
                <TextInput
                  label="Children"
                  type="number"
                  value={input.children}
                  onChange={(children) => setInput({ ...input, children })}
                />
              </div>

              <div className="pt-2 border-t border-[#E5DED4]/60">
                <p className="text-xs font-semibold text-[#5C5346] mb-2.5">Preferences & Features</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextInput
                    label="Bed type"
                    value={input.requiredBedType}
                    onChange={(requiredBedType) => setInput({ ...input, requiredBedType })}
                  />
                  <Field label="Building">
                    <PmsSelect
                      className="h-9 rounded-md border-[#DED7CD] bg-white px-2.5 text-xs"
                      value={input.preferredBuildingId}
                      onChange={(val) =>
                        setInput({ ...input, preferredBuildingId: val })
                      }
                      placeholder="Any Building"
                      options={[
                        ["", "Any Building"],
                        ...locations.buildings,
                      ]}
                    />
                  </Field>
                  <Field label="Floor">
                    <PmsSelect
                      className="h-9 rounded-md border-[#DED7CD] bg-white px-2.5 text-xs"
                      value={input.preferredFloorId}
                      onChange={(val) => setInput({ ...input, preferredFloorId: val })}
                      placeholder="Any Floor"
                      options={[
                        ["", "Any Floor"],
                        ...locations.floors,
                      ]}
                    />
                  </Field>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E5DED4]/60">
                <p className="text-xs font-semibold text-[#5C5346] mb-2">Verification Options</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CheckRow
                    label="Accessible room required"
                    checked={input.accessibleRequired}
                    onChange={(accessibleRequired) => setInput({ ...input, accessibleRequired })}
                  />
                  <CheckRow
                    label="Connecting room required"
                    checked={input.connectingRequired}
                    onChange={(connectingRequired) => setInput({ ...input, connectingRequired })}
                  />
                  <CheckRow
                    label="Guest preference matched"
                    checked={input.guestPreferenceMatched}
                    onChange={(guestPreferenceMatched) =>
                      setInput({ ...input, guestPreferenceMatched })
                    }
                  />
                  <CheckRow
                    label="Evaluate check-in readiness"
                    checked={input.forCheckIn}
                    onChange={(forCheckIn) => setInput({ ...input, forCheckIn })}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  className="h-9 px-5 text-xs font-semibold bg-[#C89933] text-[#251605] hover:bg-[#B5882D] shadow-xs"
                  disabled={
                    !input.roomId ||
                    !input.roomTypeId ||
                    input.departure <= input.arrival ||
                    mutation.isPending
                  }
                  onClick={() => mutation.mutate()}
                >
                  <Search className="mr-2 size-4" />
                  Inspect eligibility
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-xl border border-[#E5DED4] bg-white shadow-xs lg:sticky lg:top-3">
          <div className="border-b border-[#E5DED4] px-5 py-3.5">
            <h3 className="text-sm font-bold" style={{ color: INK }}>
              Evaluation Results
            </h3>
          </div>
          <div className="space-y-3.5 p-4">
            {!mutation.data && !mutation.isError ? (
              <div className="flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-border bg-muted/10">
                <Search className="size-7 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-semibold text-foreground">Ready to evaluate</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Select a candidate room and stay period, then click Inspect eligibility.
                </p>
              </div>
            ) : mutation.isError ? (
              <InventoryState
                state="error"
                title="Eligibility could not be evaluated"
                description={mutation.error.message}
                onRetry={() => mutation.mutate()}
              />
            ) : mutation.data ? (
              <>
                <div
                  className={`flex items-center justify-between rounded-xl border p-3.5 shadow-xs ${
                    mutation.data.eligible
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-red-200 bg-red-50/70"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {mutation.data.eligible ? (
                      <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Ban className="size-5 text-red-600 shrink-0" />
                    )}
                    <div>
                      <p
                        className={`text-sm font-bold ${
                          mutation.data.eligible ? "text-emerald-950" : "text-red-950"
                        }`}
                      >
                        {mutation.data.eligible ? "Eligible for Assignment" : "Blocked from Assignment"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {mutation.data.eligible
                          ? "Room satisfies all stay and operational criteria."
                          : `${mutation.data.blockers.length} blocker${
                              mutation.data.blockers.length === 1 ? "" : "s"
                            } prevent assignment.`}
                      </p>
                    </div>
                  </div>
                  <InventoryStatusBadge tone={mutation.data.eligible ? "success" : "danger"}>
                    {mutation.data.source}
                  </InventoryStatusBadge>
                </div>

                <ResultNotes
                  title="Blockers"
                  items={mutation.data.blockers}
                  empty="No blockers detected."
                  tone="danger"
                />
                <ResultNotes
                  title="Warnings"
                  items={mutation.data.warnings}
                  empty="No warnings detected."
                  tone="warning"
                />

                {mutation.data.preferenceScore > 0 || mutation.data.preferenceReasons.length > 0 ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-[#FAF8F5] p-2.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-[#C89933]" />
                      <span className="font-semibold text-[#5C5346]">Preference Match</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {mutation.data.preferenceReasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded bg-white border border-[#E8E1D7] px-1.5 py-0.5 text-[10px] font-medium text-[#756A5B]"
                        >
                          {preferenceReasonLabel(reason)}
                        </span>
                      ))}
                      <span className="rounded-full bg-[#251605] px-2 py-0.5 text-[11px] font-bold text-white">
                        +{mutation.data.preferenceScore}
                      </span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <RoomContextCard room={room} roomType={roomType} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function RoomContextCard({
  room,
  roomType,
}: {
  room: HotelRoom | null;
  roomType: RoomType | null;
}) {
  if (!room) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-center text-xs text-muted-foreground">
        Select a candidate room to preview Room context.
      </div>
    );
  }

  const connecting = room.links.some((link) => link.kind === "connecting");
  const beds =
    roomType?.beds.map((bed) => `${bed.numberOfBeds}× ${bed.bedType}`).join(", ") ||
    roomType?.bedType ||
    "—";

  return (
    <div className="rounded-xl border border-border bg-[#FAF8F5]/60 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#756A5B] mb-0.5">
            Room context
          </p>
          <span className="text-xs font-bold text-[#251605]">
            Room {room.roomNumber}
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            · {room.roomTypeName}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
            room.status === "available"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {titleCase(room.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border/60 bg-white p-2">
          <span className="text-[10px] font-medium text-muted-foreground block">Housekeeping</span>
          <span className="font-semibold text-foreground capitalize">
            {room.housekeepingStatus?.replaceAll("_", " ") ?? "Not set"}
          </span>
        </div>
        <div className="rounded-lg border border-border/60 bg-white p-2">
          <span className="text-[10px] font-medium text-muted-foreground block">Maintenance</span>
          <span className="font-semibold text-foreground capitalize">
            {room.maintenanceStatus.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 pt-0.5 text-[10px]">
        <span className="inline-flex items-center rounded bg-white border border-[#E8E1D7] px-2 py-0.5 text-[#5F554B]">
          Beds: {beds}
        </span>
        {roomType ? (
          <span className="inline-flex items-center rounded bg-white border border-[#E8E1D7] px-2 py-0.5 text-[#5F554B]">
            Max: {roomType.maxOccupancy} guests
          </span>
        ) : null}
        {room.floor ? (
          <span className="inline-flex items-center rounded bg-white border border-[#E8E1D7] px-2 py-0.5 text-[#5F554B]">
            Floor {room.floor}
          </span>
        ) : null}
        {room.building ? (
          <span className="inline-flex items-center rounded bg-white border border-[#E8E1D7] px-2 py-0.5 text-[#5F554B]">
            {room.building}
          </span>
        ) : null}
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 border ${
            room.sellable
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-muted/40 border-border text-muted-foreground"
          }`}
        >
          {room.sellable ? "Sellable" : "Not Sellable"}
        </span>
        {room.accessible ? (
          <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700">
            Accessible
          </span>
        ) : null}
        {connecting ? (
          <span className="inline-flex items-center rounded bg-purple-50 border border-purple-200 px-2 py-0.5 text-purple-700">
            Connecting
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ResultNotes({
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
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
        <span>{empty}</span>
      </div>
    );
  }

  const Icon = tone === "danger" ? AlertCircle : AlertTriangle;
  const isDanger = tone === "danger";

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#5C5346]">
        {title} ({items.length})
      </p>
      <div className="space-y-1.5">
        {items.map((item, index) => {
          const code = typeof item.code === "string" ? item.code : `ITEM_${index + 1}`;
          const label =
            typeof item.message === "string" && item.message.trim()
              ? item.message
              : eligibilityCodeLabel(code);

          const contextChips = Object.entries(item).filter(
            ([key, value]) =>
              key !== "code" &&
              key !== "message" &&
              key !== "status" &&
              value != null &&
              value !== "",
          );

          return (
            <div
              key={`${code}-${index}`}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                isDanger
                  ? "border-red-200 bg-red-50/80 text-red-950"
                  : "border-amber-200 bg-amber-50/80 text-amber-950"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 mt-0.5 ${
                  isDanger ? "text-red-600" : "text-amber-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{label}</p>
                {contextChips.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {contextChips.map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex rounded bg-black/5 px-1.5 py-0.2 text-[10px] font-medium"
                      >
                        {titleCase(k)}: {String(v)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoomInventoryRulesView({ restaurantId }: { restaurantId: string }) {
  const { draft, setDraft, canConfigure, query, save, pending } = useInventoryPolicy(restaurantId);
  const rules = draft;
  const enabledBlocks = rules.blockTypes.filter((row) => row.enabled).length;
  const enforcedCount = [
    rules.sellableStatusRequired,
    rules.maintenanceAffectsAvailability,
    rules.housekeepingAffectsAssignment,
    rules.requireRoomTypeMatch,
    rules.requireOccupancyMatch,
    rules.requireBedTypeMatch,
    rules.requireAccessibilityMatch,
    rules.requireConnectingRoomMatch,
    rules.useBuildingPreference,
    rules.useFloorPreference,
    rules.useGuestPreference,
    rules.requireHousekeepingReadiness,
    rules.requireMaintenanceAvailability,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Inventory Rules"
        description="Canonical Card 2 inventory policy. This view reuses Property Setup persistence; it does not create a second authority."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SettingsLink step="inventory-rules" />
            {canConfigure ? (
              <Button
                size="sm"
                className="h-9 px-4 text-xs font-semibold bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
                disabled={pending || query.isLoading}
                onClick={() => save()}
              >
                Save rules
              </Button>
            ) : null}
          </div>
        }
      />

      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Inventory rules could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              icon={SlidersHorizontal}
              label="Enforced assignment flags"
              value={enforcedCount}
              detail="Used by the assignment RPC"
              tone="bg-emerald-50 text-emerald-700"
            />
            <Kpi
              icon={Layers3}
              label="Enabled block types"
              value={enabledBlocks}
              detail="Copied onto new operational blocks"
              tone="bg-violet-50 text-violet-700"
            />
            <Kpi
              icon={Ban}
              label="Overbooking config"
              value={rules.overbookingAllowed ? "On" : "Off"}
              detail="Master switch. Numbers are set per room type"
              tone="bg-amber-50 text-amber-700"
            />
            <Kpi
              icon={Gauge}
              label="Operational allowance"
              value={0}
              detail="Canonical availability v1"
              tone="bg-blue-50 text-blue-700"
            />
            <Kpi
              icon={CheckCircle2}
              label="Persisted"
              value={query.data?.persisted ? "Yes" : "Defaults"}
              detail={canConfigure ? "Manager can save" : "Read-only for this role"}
              tone="bg-zinc-100 text-zinc-700"
            />
          </div>

          {!canConfigure ? (
            <p className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] px-4 py-3 text-xs text-muted-foreground leading-5">
              Owner or manager access is required to change inventory rules. Front Office can
              inspect policy only.
            </p>
          ) : null}

          <div className="space-y-4">
            <RulePanel
              title="Inventory and availability"
              description="These flags are read by canonical availability. Out of order, out of service, and each block's own inventory impact are applied directly."
              count="2 rules"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <PolicySwitch
                  label="Sellable room required"
                  help="Enforced by assignment and availability when a room must be sellable."
                  checked={rules.sellableStatusRequired}
                  disabled={!canConfigure}
                  onChange={(sellableStatusRequired) => setDraft({ sellableStatusRequired })}
                />
                <PolicySwitch
                  label="Maintenance affects availability"
                  help="Canonical availability excludes rooms that are not maintenance-normal."
                  checked={rules.maintenanceAffectsAvailability}
                  disabled={!canConfigure}
                  onChange={(maintenanceAffectsAvailability) =>
                    setDraft({ maintenanceAffectsAvailability })
                  }
                />
              </div>
            </RulePanel>

            <RulePanel
              title="Assignment matching"
              description="These flags are read by the canonical assignment evaluator."
              count="11 rules"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                <PolicySwitch
                  label="Housekeeping affects assignment"
                  checked={rules.housekeepingAffectsAssignment}
                  disabled={!canConfigure}
                  onChange={(housekeepingAffectsAssignment) =>
                    setDraft({ housekeepingAffectsAssignment })
                  }
                />
                <PolicySwitch
                  label="Require housekeeping readiness"
                  checked={rules.requireHousekeepingReadiness}
                  disabled={!canConfigure}
                  onChange={(requireHousekeepingReadiness) =>
                    setDraft({ requireHousekeepingReadiness })
                  }
                />
                <PolicySwitch
                  label="Require maintenance availability"
                  help="Uses Card 2 maintenance status rules at evaluation time."
                  checked={rules.requireMaintenanceAvailability}
                  disabled={!canConfigure}
                  onChange={(requireMaintenanceAvailability) =>
                    setDraft({ requireMaintenanceAvailability })
                  }
                />
                <PolicySwitch
                  label="Require room type match"
                  checked={rules.requireRoomTypeMatch}
                  disabled={!canConfigure}
                  onChange={(requireRoomTypeMatch) => setDraft({ requireRoomTypeMatch })}
                />
                <PolicySwitch
                  label="Occupancy match required"
                  checked={rules.requireOccupancyMatch}
                  disabled={!canConfigure}
                  onChange={(requireOccupancyMatch) => setDraft({ requireOccupancyMatch })}
                />
                <PolicySwitch
                  label="Bed match"
                  checked={rules.requireBedTypeMatch}
                  disabled={!canConfigure}
                  onChange={(requireBedTypeMatch) => setDraft({ requireBedTypeMatch })}
                />
                <PolicySwitch
                  label="Accessibility match"
                  checked={rules.requireAccessibilityMatch}
                  disabled={!canConfigure}
                  onChange={(requireAccessibilityMatch) => setDraft({ requireAccessibilityMatch })}
                />
                <PolicySwitch
                  label="Connecting-room match"
                  checked={rules.requireConnectingRoomMatch}
                  disabled={!canConfigure}
                  onChange={(requireConnectingRoomMatch) => setDraft({ requireConnectingRoomMatch })}
                />
                <PolicySwitch
                  label="Building preference"
                  checked={rules.useBuildingPreference}
                  disabled={!canConfigure}
                  onChange={(useBuildingPreference) => setDraft({ useBuildingPreference })}
                />
                <PolicySwitch
                  label="Floor preference"
                  checked={rules.useFloorPreference}
                  disabled={!canConfigure}
                  onChange={(useFloorPreference) => setDraft({ useFloorPreference })}
                />
                <PolicySwitch
                  label="Guest preference"
                  checked={rules.useGuestPreference}
                  disabled={!canConfigure}
                  onChange={(useGuestPreference) => setDraft({ useGuestPreference })}
                />
              </div>
            </RulePanel>

            <RulePanel
              title="Block-type inventory behavior"
              description="Enabled types, approval, and impact are copied onto new operational blocks. Changing impact here does not rewrite existing blocks."
              count="9 types"
            >
              <div className="overflow-x-auto rounded-lg border border-[#E5DED4]">
                <table className="w-full min-w-[540px] text-left text-xs">
                  <thead className="bg-[#F7F4EE] border-b border-[#E5DED4] text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                    <tr>
                      <th className="px-3.5 py-2.5">Type</th>
                      <th className="px-3.5 py-2.5">Enabled</th>
                      <th className="px-3.5 py-2.5">Approval</th>
                      <th className="px-3.5 py-2.5">Inventory impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEE8E0] bg-white">
                    {rules.blockTypes.map((row) => (
                      <tr key={row.blockType} className="hover:bg-[#FAF8F5]/60 transition-colors">
                        <td className="px-3.5 py-3 font-bold text-[#251605]">{titleCase(row.blockType)}</td>
                        <td className="px-3.5 py-3">
                          <Switch
                            checked={row.enabled}
                            disabled={!canConfigure}
                            className="data-[state=checked]:bg-[#C89933]"
                            onCheckedChange={(enabled) =>
                              setDraft({
                                blockTypes: rules.blockTypes.map((item) =>
                                  item.blockType === row.blockType
                                    ? { ...item, enabled: enabled === true }
                                    : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="px-3.5 py-3">
                          <Switch
                            checked={row.approvalRequired}
                            disabled={!canConfigure || !row.enabled}
                            className="data-[state=checked]:bg-[#C89933]"
                            onCheckedChange={(approvalRequired) =>
                              setDraft({
                                blockTypes: rules.blockTypes.map((item) =>
                                  item.blockType === row.blockType
                                    ? { ...item, approvalRequired: approvalRequired === true }
                                    : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="px-3.5 py-3">
                          <PmsSelect
                            disabled={!canConfigure || !row.enabled}
                            value={row.inventoryImpact}
                            onChange={(val) =>
                              setDraft({
                                blockTypes: rules.blockTypes.map((item) =>
                                  item.blockType === row.blockType
                                    ? {
                                        ...item,
                                        inventoryImpact: val as InventoryImpact,
                                      }
                                    : item,
                                ),
                              })
                            }
                            options={INVENTORY_IMPACTS.map((impact) => [impact, IMPACT_LABELS[impact]])}
                            className="h-9 w-full max-w-xs rounded-md border-[#DED7CD] bg-white px-2.5 text-xs font-medium"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RulePanel>
          </div>
        </>
      )}
    </div>
  );
}

export function RoomOverbookingView({ restaurantId }: { restaurantId: string }) {
  const { query } = useInventoryPolicy(restaurantId);
  const loadBoard = useServerFn(getOverbookingBoard);
  const [night, setNight] = useState(() => new Date().toISOString().slice(0, 10));
  const board = useQuery({
    queryKey: ["overbooking-board", restaurantId, night],
    queryFn: () => loadBoard({ data: { restaurantId, start: night, end: night } }),
  });
  const summary = board.data?.nights[0];
  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Overbooking"
        description="Operational room-type overbooking for the selected night. Allowances are configured in Property Setup."
        action={<SettingsLink label="Configure in Property Setup" step="inventory-rules" section="overbooking" />}
      />

      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Overbooking policy could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              icon={Gauge}
              label="Physical available"
              value={summary?.physicalAvailable ?? "—"}
              detail={summary ? `Capacity ${summary.physicalCapacity}` : "Canonical board"}
              tone="bg-emerald-50 text-emerald-700"
            />
            <Kpi
              icon={ShieldAlert}
              label="Overbooking"
              value={summary?.propertyOverbookingEnabled ? "Enabled" : "Off"}
              detail="Property master switch"
              tone="bg-amber-50 text-amber-700"
            />
            <Kpi
              icon={Layers3}
              label="Total overbooked rooms"
              value={summary?.totalOverbookedRooms ?? "—"}
              detail="Informational sum of room-type shortages"
              tone="bg-blue-50 text-blue-700"
            />
            <Kpi
              icon={Ban}
              label="Room types overbooked"
              value={summary?.roomTypesOverbooked ?? "—"}
              detail="Each room type keeps its own allowance"
              tone="bg-zinc-100 text-zinc-700"
            />
          </div>

          <section className="rounded-lg border border-[#E5DED4] bg-white p-5 shadow-xs">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Overbooking controls
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              The numbers come from the room-type calculation the reservation transaction uses.
              Allowances are edited in Property Setup.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-[#5F554B]">
                Night
                <Input
                  type="date"
                  className="mt-1 h-9 text-xs"
                  value={night}
                  onChange={(event) => setNight(event.target.value)}
                />
              </label>
              {summary?.alertEnabled && summary.totalOverbookedRooms > 0 ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-950 leading-5">
                  {summary.roomTypesOverbooked} room type
                  {summary.roomTypesOverbooked === 1 ? " is" : "s are"} currently overbooked
                  {summary.roomTypes
                    .filter((type) => type.shortage > 0)
                    .map((type) => ` · ${type.roomTypeName} +${type.shortage}`)
                    .join("")}
                  .
                </p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-3">
                <span className="text-muted-foreground">Physical capacity: </span>
                <span className="font-bold text-[#251605]">{summary?.physicalCapacity ?? "—"}</span>
              </div>
              <div className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-3">
                <span className="text-muted-foreground">Confirmed demand: </span>
                <span className="font-bold text-[#251605]">{summary?.confirmedDemand ?? "—"}</span>
              </div>
              <div className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-3">
                <span className="text-muted-foreground">Physical available: </span>
                <span className="font-bold text-[#251605]">{summary?.physicalAvailable ?? "—"}</span>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[#E5DED4]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F4EE] border-b border-[#E5DED4] text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                  <tr>
                    <th className="px-3.5 py-2.5">Room type</th>
                    <th className="px-3.5 py-2.5">Physical capacity</th>
                    <th className="px-3.5 py-2.5">Demand</th>
                    <th className="px-3.5 py-2.5">Physical available</th>
                    <th className="px-3.5 py-2.5">Allowed overbooking</th>
                    <th className="px-3.5 py-2.5">Consumed overbooking</th>
                    <th className="px-3.5 py-2.5">Remaining</th>
                    <th className="px-3.5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EBE3] bg-white">
                  {(summary?.roomTypes ?? []).map((type) => (
                    <tr key={type.roomTypeId} className="hover:bg-[#FAF8F5]/60 transition-colors">
                      <td className="px-3.5 py-3 font-bold text-[#251605]">{type.roomTypeName}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.physicalCapacity}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.demand}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.physicalAvailable}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.overbookingAllowance}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.overbookingConsumed}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.overbookingRemaining}</td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          !type.overbookingEnabled
                            ? "bg-zinc-100 text-zinc-600"
                            : type.overbookingRemaining === 0 && type.overbookingAllowance > 0
                              ? "bg-red-100 text-red-700"
                              : type.overbookingAllowance > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-zinc-100 text-zinc-600"
                        }`}>
                          {!type.overbookingEnabled
                            ? "Overbooking disabled"
                            : type.overbookingRemaining === 0 && type.overbookingAllowance > 0
                              ? "Limit reached"
                              : type.overbookingAllowance > 0
                                ? "Available for override"
                                : "No allowance"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                Room type rules
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-5">
                Allowances are edited on each room type in Property Setup. This list is the saved
                configuration, not a shared pool.
              </p>
              <ul className="mt-3 divide-y divide-[#E8E1D7] text-xs">
                {(summary?.roomTypes ?? []).map((type) => (
                  <li key={type.roomTypeId} className="py-2 flex items-center justify-between">
                    <span className="font-bold text-[#251605]">{type.roomTypeName}</span>
                    <span className="text-muted-foreground font-medium">
                      {type.overbookingEnabled ? "Enabled" : "Disabled"}
                      {type.maximumOverbooking != null ? ` · Max ${type.maximumOverbooking}` : ""}
                      {type.percentageLimit != null ? ` · ${type.percentageLimit}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function useInventoryPolicy(restaurantId: string) {
  const loadRules = useServerFn(getInventoryRules);
  const persistRules = useServerFn(saveInventoryRules);
  const loadAccess = useServerFn(getRoomsAccess);
  const queryClient = useQueryClient();
  const accessQuery = useQuery({
    queryKey: ["rooms-access", restaurantId],
    queryFn: () => loadAccess({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const query = useQuery({
    queryKey: ["room-inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    retry: false,
  });
  const [draft, setDraftState] = useState<InventoryRulesDraft>(defaultInventoryRules);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
  }, [restaurantId]);

  useEffect(() => {
    if (!query.data || hydrated) return;
    setDraftState(normalizeInventoryRules(query.data.rules));
    setHydrated(true);
  }, [query.data, hydrated]);

  function setDraft(patch: Partial<InventoryRulesDraft>) {
    setDraftState((current) => normalizeInventoryRules({ ...current, ...patch }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeInventoryRules(draft);
      const result = await persistRules({
        data: {
          restaurantId,
          ...normalized,
        },
      });
      if (!result.ok) throw new Error(result.message ?? "Could not save inventory rules.");
      return result;
    },
    onSuccess: async (result) => {
      setDraftState(normalizeInventoryRules(result.rules));
      await invalidateRuleViews(queryClient, restaurantId);
      toast.success("Inventory rules saved");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not save inventory rules.";
      if (/permission|access|manager|owner|authorized/i.test(message)) {
        toast.error("Owner or manager access is required to change inventory rules.");
        return;
      }
      toast.error(message);
    },
  });

  return {
    draft,
    setDraft,
    canConfigure: Boolean(accessQuery.data?.canConfigure),
    query,
    save: () => mutation.mutate(),
    pending: mutation.isPending,
  };
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-lg border border-[#EAE4DB] bg-white p-3.5 shadow-xs">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[#756A5B]">{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: INK }}>
          {value}
        </p>
        <p className="truncate text-[11px] text-[#8C8071]">{detail}</p>
      </div>
    </div>
  );
}

function RulePanel({
  title,
  description,
  count,
  className,
  children,
}: {
  title: string;
  description: string;
  count?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-[#E5DED4] bg-white p-4 sm:p-5 shadow-xs transition-all", className)}>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold tracking-tight" style={{ color: INK }}>
              {title}
            </h3>
            {count ? (
              <span className="inline-flex items-center rounded-full bg-[#FAF5EB] border border-[#E8DFD1] px-2 py-0.5 text-[11px] font-semibold text-[#8C6214]">
                {count}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function PolicySwitch({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "group flex justify-between gap-2.5 rounded-lg border border-[#EEE8E0] bg-[#FAF8F5]/60 px-3 py-2.5 transition-all duration-150 hover:border-[#DED7CD] hover:bg-[#FAF8F5]",
        help ? "items-start" : "items-center",
      )}
    >
      <div className="min-w-0 pr-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className="text-xs font-semibold leading-snug group-hover:text-[#1A0E03] transition-colors"
            style={{ color: INK }}
          >
            {label}
          </p>
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#C89933]/15 text-[#7A5511]">
            Enforced
          </span>
        </div>
        {help ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{help}</p> : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        className={cn(
          "data-[state=checked]:bg-[#C89933] shrink-0",
          help ? "mt-0.5" : "",
        )}
        onCheckedChange={(value) => onChange(value === true)}
      />
    </div>
  );
}

function SettingsLink({
  label = "Manage in Property Setup",
  step = "inventory-rules",
  section,
}: {
  label?: string;
  step?: "room-types" | "amenities" | "housekeeping" | "inventory-rules" | "maintenance" | "rates-pricing";
  section?: string;
}) {
  const sectionParam = section ? `&section=${encodeURIComponent(section)}` : "";
  const href = `/restaurant/settings?card2Step=${step}${sectionParam}&returnTo=/restaurant/pms/room-inventory#rooms-inventory`;
  return (
    <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs font-medium">
      <a href={href}>
        {label} <ExternalLink className="ml-2 size-4" />
      </a>
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
      {label}
      {children}
    </label>
  );
}

function TextInput({
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
    <Field label={label}>
      <Input
        className="h-9 text-xs"
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-xs font-medium text-[#251605] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded accent-[#C89933] cursor-pointer"
      />
      {label}
    </label>
  );
}
