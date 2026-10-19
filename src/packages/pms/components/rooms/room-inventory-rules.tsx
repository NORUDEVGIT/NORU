import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Layers3,
  Search,
  ShieldAlert,
  SlidersHorizontal,
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
import { InventoryState, InventoryStatusBadge, InventoryViewHeader } from "./room-inventory-shared";
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
        description="Inspect canonical eligibility for a specific room and stay. Evaluation runs only when you inspect."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-[#E5DED4] bg-white p-5 shadow-xs">
          <h3 className="text-base font-bold" style={{ color: INK }}>
            Stay and requirements
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Canonical inputs only. Guest preference is a caller flag, not a guest-profile lookup.
          </p>
          {roomsQuery.isLoading ? (
            <div className="mt-5">
              <InventoryState state="loading" />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Candidate room">
                <select
                  value={input.roomId}
                  onChange={(event) => {
                    const selected = rooms.find((item) => item.id === event.target.value);
                    setInput({
                      ...input,
                      roomId: event.target.value,
                      roomTypeId: selected?.roomTypeId ?? "",
                    });
                  }}
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-xs outline-none focus:border-[#C89933]"
                >
                  <option value="">Select room</option>
                  {rooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      Room {item.roomNumber} · {item.roomTypeName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Room type">
                <input
                  readOnly
                  className="h-9 rounded-md border border-[#DED7CD] bg-[#FAF8F5] px-3 text-xs text-[#251605]"
                  value={room?.roomTypeName ?? roomType?.name ?? ""}
                />
              </Field>
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
              <TextInput
                label="Required bed type"
                value={input.requiredBedType}
                onChange={(requiredBedType) => setInput({ ...input, requiredBedType })}
              />
              <Field label="Preferred building">
                <select
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-xs outline-none focus:border-[#C89933]"
                  value={input.preferredBuildingId}
                  onChange={(event) =>
                    setInput({ ...input, preferredBuildingId: event.target.value })
                  }
                >
                  <option value="">No preference</option>
                  {locations.buildings.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred floor">
                <select
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-xs outline-none focus:border-[#C89933]"
                  value={input.preferredFloorId}
                  onChange={(event) => setInput({ ...input, preferredFloorId: event.target.value })}
                >
                  <option value="">No preference</option>
                  {locations.floors.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="space-y-2.5 sm:col-span-2 pt-1">
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
              <div className="sm:col-span-2 pt-2">
                <Button
                  className="h-9 px-4 text-xs font-semibold bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
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

        <aside className="h-fit rounded-lg border border-[#E5DED4] bg-white shadow-xs lg:sticky lg:top-3">
          <div className="border-b border-[#E5DED4] px-5 py-4">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Candidate result
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Blockers and warnings come from the canonical evaluator. Room facts below are
              read-only context.
            </p>
          </div>
          <div className="space-y-4 p-5">
            {!mutation.data && !mutation.isError ? (
              <InventoryState
                state="empty"
                title="No evaluation yet"
                description="Supply a stay context and inspect a candidate room."
              />
            ) : mutation.isError ? (
              <InventoryState
                state="error"
                title="Eligibility could not be evaluated"
                description={mutation.error.message}
                onRetry={() => mutation.mutate()}
              />
            ) : mutation.data ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-[#E5DED4] bg-[#FAF8F5]/60 p-3.5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Eligibility</p>
                    <p className="text-xl font-bold" style={{ color: INK }}>
                      {mutation.data.eligible ? "Eligible" : "Blocked"}
                    </p>
                  </div>
                  <InventoryStatusBadge tone={mutation.data.eligible ? "success" : "danger"}>
                    {mutation.data.source}
                  </InventoryStatusBadge>
                </div>
                {mutation.data.source === "legacy" ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-5">
                    Legacy evaluation returned a boolean only. Structured blockers and warnings are
                    not available until the canonical assignment RPC is present.
                  </p>
                ) : null}
                <ResultNotes
                  title="Blockers"
                  items={mutation.data.blockers}
                  empty="No blockers returned."
                  tone="danger"
                />
                <ResultNotes
                  title="Warnings"
                  items={mutation.data.warnings}
                  empty="No warnings returned."
                  tone="warning"
                />
                <div className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5]/60 p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                    Preference score
                  </p>
                  <p className="mt-1 text-2xl font-extrabold" style={{ color: INK }}>
                    {mutation.data.preferenceScore}
                  </p>
                  {mutation.data.preferenceReasons.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-[#5F554B]">
                      {mutation.data.preferenceReasons.map((reason) => (
                        <li key={reason}>• {preferenceReasonLabel(reason)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No preference matches.</p>
                  )}
                </div>
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
      <p className="text-xs text-muted-foreground leading-5">
        Select a room to show operational context. This panel does not recalculate eligibility.
      </p>
    );
  }
  const connecting = room.links.some((link) => link.kind === "connecting");
  const beds =
    roomType?.beds.map((bed) => `${bed.numberOfBeds}× ${bed.bedType}`).join(", ") ||
    roomType?.bedType ||
    "—";
  const rows: Array<[string, string]> = [
    ["Room", `${room.roomNumber} · ${room.roomTypeName}`],
    ["Operational status", statusLabel(room.status)],
    ["Housekeeping", statusLabel(room.housekeepingStatus)],
    ["Maintenance", statusLabel(room.maintenanceStatus)],
    ["Sellable", room.sellable ? "Yes" : "No"],
    ["Active", room.active ? "Yes" : "No"],
    ["Accessible", room.accessible ? "Yes" : "No"],
    ["Connecting link", connecting ? "Yes" : "No"],
    ["Building", room.building?.trim() || "—"],
    ["Floor", room.floor?.trim() || "—"],
    ["Max occupancy", roomType ? String(roomType.maxOccupancy) : "—"],
    ["Beds", beds],
  ];
  return (
    <section className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-3.5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
        Room context
      </h4>
      <dl className="mt-2.5 divide-y divide-[#E8E1D7] text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground font-medium">{label}</dt>
            <dd className="text-right font-semibold text-[#251605]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          items.map((item, index) => {
            const code = typeof item.code === "string" ? item.code : `ITEM_${index + 1}`;
            const extras = Object.entries(item).filter(
              ([key, value]) =>
                key !== "code" && key !== "message" && value != null && value !== "",
            );
            return (
              <div
                key={`${code}-${index}`}
                className={`rounded-lg border px-3 py-2.5 ${
                  tone === "danger" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
                }`}
              >
                <p className="text-xs font-bold" style={{ color: INK }}>
                  {eligibilityCodeLabel(code)}
                </p>
                {typeof item.message === "string" ? (
                  <p className="mt-0.5 text-xs text-muted-foreground leading-5">{item.message}</p>
                ) : null}
                {extras.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {extras
                      .map(([key, value]) => `${titleCase(key)}: ${String(value)}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
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
                          <select
                            disabled={!canConfigure || !row.enabled}
                            value={row.inventoryImpact}
                            onChange={(event) =>
                              setDraft({
                                blockTypes: rules.blockTypes.map((item) =>
                                  item.blockType === row.blockType
                                    ? {
                                        ...item,
                                        inventoryImpact: event.target.value as InventoryImpact,
                                      }
                                    : item,
                                ),
                              })
                            }
                            className="h-9 w-full max-w-xs rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium outline-none focus:border-[#C89933]"
                          >
                            {INVENTORY_IMPACTS.map((impact) => (
                              <option key={impact} value={impact}>
                                {IMPACT_LABELS[impact]}
                              </option>
                            ))}
                          </select>
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
