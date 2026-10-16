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
  OVERBOOKING_CAPACITY_NOTE,
  defaultInventoryRules,
  normalizeInventoryRules,
  type InventoryImpact,
  type InventoryRulesDraft,
} from "@/packages/pms/lib/inventory-rules-card2.server";
import {
  getInventoryRules,
  saveInventoryRules,
} from "@/packages/pms/lib/inventory-rules.functions";
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
import { InventoryState, InventoryStatusBadge, InventoryViewHeader } from "./room-inventory-shared";
import { addDays, eligibilityCodeLabel, preferenceReasonLabel } from "./room-inventory-utils";

export interface AssignmentInspectionPrefill {
  roomId: string;
  roomTypeId: string;
}

const INK = "#251605";
const PROPERTY_SETUP_HREF = "/restaurant/settings#rooms-inventory";

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
    <div className="space-y-3">
      <InventoryViewHeader
        title="Assignment Eligibility"
        description="Inspect canonical eligibility for a specific room and stay. Evaluation runs only when you inspect."
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="rounded-lg border border-[#E5DED4] bg-white p-4 shadow-sm">
          <h3 className="text-[13px] font-semibold" style={{ color: INK }}>
            Stay and requirements
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Canonical inputs only. Guest preference is a caller flag, not a guest-profile lookup.
          </p>
          {roomsQuery.isLoading ? (
            <div className="mt-4">
              <InventoryState state="loading" />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-sm outline-none focus:border-[#C89933]"
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
                  className="h-9 rounded-md border border-[#DED7CD] bg-[#FAF8F5] px-3 text-sm"
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
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-sm outline-none focus:border-[#C89933]"
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
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-3 text-sm outline-none focus:border-[#C89933]"
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
              <div className="space-y-2 sm:col-span-2">
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
              <div className="sm:col-span-2">
                <Button
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
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

        <aside className="rounded-lg border border-[#E5DED4] bg-white shadow-sm lg:sticky lg:top-3">
          <div className="border-b border-[#E5DED4] px-4 py-3">
            <h3 className="text-[13px] font-semibold" style={{ color: INK }}>
              Candidate result
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Blockers and warnings come from the canonical evaluator. Room facts below are
              read-only context.
            </p>
          </div>
          <div className="space-y-4 p-4">
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
                <div className="flex items-center justify-between rounded-lg border border-[#E5DED4] px-3 py-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Eligibility</p>
                    <p className="text-lg font-semibold" style={{ color: INK }}>
                      {mutation.data.eligible ? "Eligible" : "Blocked"}
                    </p>
                  </div>
                  <InventoryStatusBadge tone={mutation.data.eligible ? "success" : "danger"}>
                    {mutation.data.source}
                  </InventoryStatusBadge>
                </div>
                {mutation.data.source === "legacy" ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
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
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Preference score
                  </p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: INK }}>
                    {mutation.data.preferenceScore}
                  </p>
                  {mutation.data.preferenceReasons.length ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {mutation.data.preferenceReasons.map((reason) => (
                        <li key={reason}>• {preferenceReasonLabel(reason)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">No preference matches.</p>
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
      <p className="text-[11px] text-muted-foreground">
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
    <section className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] p-3">
      <h4 className="text-[11px] font-semibold" style={{ color: INK }}>
        Room context
      </h4>
      <dl className="mt-2 divide-y divide-[#E8E1D7] text-[10px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
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
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{empty}</p>
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
                className={`rounded-md border px-3 py-2 ${
                  tone === "danger" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
                }`}
              >
                <p className="text-[12px] font-medium" style={{ color: INK }}>
                  {eligibilityCodeLabel(code)}
                </p>
                {typeof item.message === "string" ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{item.message}</p>
                ) : null}
                {extras.length ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
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
    <div className="space-y-3">
      <InventoryViewHeader
        title="Inventory Rules"
        description="Canonical Card 2 inventory policy. This view reuses Property Setup persistence; it does not create a second authority."
        action={
          <div className="flex flex-wrap gap-2">
            <SettingsLink />
            {canConfigure ? (
              <Button
                size="sm"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
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
              detail="Does not expand inventory"
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
            <p className="rounded-md border border-[#E5DED4] bg-[#FAF8F5] px-3 py-2 text-[11px] text-muted-foreground">
              Owner or manager access is required to change inventory rules. Front Office can
              inspect policy only.
            </p>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            <RulePanel
              title="Inventory and availability"
              description="Flags that affect or are stored for sellable inventory. Config-only flags do not change canonical availability math."
            >
              <PolicySwitch
                label="Sellable room required"
                help="Enforced by assignment and availability when a room must be sellable."
                tone="enforced"
                checked={rules.sellableStatusRequired}
                disabled={!canConfigure}
                onChange={(sellableStatusRequired) => setDraft({ sellableStatusRequired })}
              />
              <PolicySwitch
                label="Maintenance affects availability"
                help="Canonical availability excludes rooms that are not maintenance-normal."
                tone="enforced"
                checked={rules.maintenanceAffectsAvailability}
                disabled={!canConfigure}
                onChange={(maintenanceAffectsAvailability) =>
                  setDraft({ maintenanceAffectsAvailability })
                }
              />
              <PolicySwitch
                label="Operational availability required"
                help="Stored policy. The v1 availability RPC does not read this flag."
                tone="config"
                checked={rules.operationalAvailabilityRequired}
                disabled={!canConfigure}
                onChange={(operationalAvailabilityRequired) =>
                  setDraft({ operationalAvailabilityRequired })
                }
              />
              <PolicySwitch
                label="Room blocks remove inventory"
                help="Stored policy. Live removal uses each block's inventory impact."
                tone="config"
                checked={rules.roomBlockRemovesInventory}
                disabled={!canConfigure}
                onChange={(roomBlockRemovesInventory) => setDraft({ roomBlockRemovesInventory })}
              />
              <PolicySwitch
                label="OOO removes inventory"
                help="Stored policy. Canonical availability already pins OOO on the business date."
                tone="config"
                checked={rules.outOfOrderRemovesInventory}
                disabled={!canConfigure}
                onChange={(outOfOrderRemovesInventory) => setDraft({ outOfOrderRemovesInventory })}
              />
              <PolicySwitch
                label="OOS removes inventory"
                help="Stored policy. Canonical availability already pins OOS on the business date."
                tone="config"
                checked={rules.outOfServiceRemovesInventory}
                disabled={!canConfigure}
                onChange={(outOfServiceRemovesInventory) =>
                  setDraft({ outOfServiceRemovesInventory })
                }
              />
            </RulePanel>

            <RulePanel
              title="Assignment matching"
              description="These flags are read by the canonical assignment evaluator."
            >
              <PolicySwitch
                label="Housekeeping affects assignment"
                tone="enforced"
                checked={rules.housekeepingAffectsAssignment}
                disabled={!canConfigure}
                onChange={(housekeepingAffectsAssignment) =>
                  setDraft({ housekeepingAffectsAssignment })
                }
              />
              <PolicySwitch
                label="Require housekeeping readiness"
                tone="enforced"
                checked={rules.requireHousekeepingReadiness}
                disabled={!canConfigure}
                onChange={(requireHousekeepingReadiness) =>
                  setDraft({ requireHousekeepingReadiness })
                }
              />
              <PolicySwitch
                label="Require maintenance availability"
                help="Uses Card 2 maintenance status rules at evaluation time."
                tone="enforced"
                checked={rules.requireMaintenanceAvailability}
                disabled={!canConfigure}
                onChange={(requireMaintenanceAvailability) =>
                  setDraft({ requireMaintenanceAvailability })
                }
              />
              <PolicySwitch
                label="Require room type match"
                tone="enforced"
                checked={rules.requireRoomTypeMatch}
                disabled={!canConfigure}
                onChange={(requireRoomTypeMatch) => setDraft({ requireRoomTypeMatch })}
              />
              <PolicySwitch
                label="Occupancy match required"
                tone="enforced"
                checked={rules.requireOccupancyMatch}
                disabled={!canConfigure}
                onChange={(requireOccupancyMatch) => setDraft({ requireOccupancyMatch })}
              />
              <PolicySwitch
                label="Bed match"
                tone="enforced"
                checked={rules.requireBedTypeMatch}
                disabled={!canConfigure}
                onChange={(requireBedTypeMatch) => setDraft({ requireBedTypeMatch })}
              />
              <PolicySwitch
                label="Accessibility match"
                tone="enforced"
                checked={rules.requireAccessibilityMatch}
                disabled={!canConfigure}
                onChange={(requireAccessibilityMatch) => setDraft({ requireAccessibilityMatch })}
              />
              <PolicySwitch
                label="Connecting-room match"
                tone="enforced"
                checked={rules.requireConnectingRoomMatch}
                disabled={!canConfigure}
                onChange={(requireConnectingRoomMatch) => setDraft({ requireConnectingRoomMatch })}
              />
              <PolicySwitch
                label="Building preference"
                tone="enforced"
                checked={rules.useBuildingPreference}
                disabled={!canConfigure}
                onChange={(useBuildingPreference) => setDraft({ useBuildingPreference })}
              />
              <PolicySwitch
                label="Floor preference"
                tone="enforced"
                checked={rules.useFloorPreference}
                disabled={!canConfigure}
                onChange={(useFloorPreference) => setDraft({ useFloorPreference })}
              />
              <PolicySwitch
                label="Guest preference"
                tone="enforced"
                checked={rules.useGuestPreference}
                disabled={!canConfigure}
                onChange={(useGuestPreference) => setDraft({ useGuestPreference })}
              />
              <PolicySwitch
                label="Manual assignment allowed"
                tone="config"
                checked={rules.manualAssignmentAllowed}
                disabled={!canConfigure}
                onChange={(manualAssignmentAllowed) => setDraft({ manualAssignmentAllowed })}
              />
              <PolicySwitch
                label="Automatic assignment allowed"
                tone="config"
                checked={rules.automaticAssignmentAllowed}
                disabled={!canConfigure}
                onChange={(automaticAssignmentAllowed) => setDraft({ automaticAssignmentAllowed })}
              />
            </RulePanel>

            <RulePanel
              title="Block-type inventory behavior"
              description="Enabled types, approval, and impact are copied onto new operational blocks. Changing impact here does not rewrite existing blocks."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[10px]">
                  <thead className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-1 py-1.5">Type</th>
                      <th className="px-1 py-1.5">Enabled</th>
                      <th className="px-1 py-1.5">Approval</th>
                      <th className="px-1 py-1.5">Inventory impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.blockTypes.map((row) => (
                      <tr key={row.blockType} className="border-t border-[#EEE8E0]">
                        <td className="px-1 py-2 font-medium">{titleCase(row.blockType)}</td>
                        <td className="px-1 py-2">
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
                        <td className="px-1 py-2">
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
                        <td className="px-1 py-2">
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
                            className="h-8 w-full rounded border border-[#DED7CD] bg-white px-2 text-[10px]"
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

            <RulePanel
              title="Operational restriction ownership"
              description="Housekeeping readiness thresholds, OOO/OOS gates, and room-type sellable flags stay in Property Setup."
            >
              <p className="text-[11px] leading-5 text-muted-foreground">
                Housekeeping settings, maintenance status rules, and per-type sellable inventory are
                not duplicated here. Default sellable source, minimum sellable inventory,
                auto-release blocks, and release windows are not configured in this product.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <SettingsLink label="Open Property Setup" />
              </div>
              <PolicySwitch
                label="Housekeeping readiness required (inventory flag)"
                help="Stored on inventory rules. Canonical eligibility uses require housekeeping readiness plus Card 2 HK settings."
                tone="config"
                checked={rules.housekeepingReadinessRequired}
                disabled={!canConfigure}
                onChange={(housekeepingReadinessRequired) =>
                  setDraft({ housekeepingReadinessRequired })
                }
              />
              <PolicySwitch
                label="Maintenance clear required (inventory flag)"
                help="Stored on inventory rules. Canonical eligibility uses require maintenance availability plus maintenance status rules."
                tone="config"
                checked={rules.maintenanceClearRequired}
                disabled={!canConfigure}
                onChange={(maintenanceClearRequired) => setDraft({ maintenanceClearRequired })}
              />
              <PolicySwitch
                label="Room move allowed"
                tone="config"
                checked={rules.roomMoveAllowed}
                disabled={!canConfigure}
                onChange={(roomMoveAllowed) => setDraft({ roomMoveAllowed })}
              />
            </RulePanel>
          </div>
        </>
      )}
    </div>
  );
}

export function RoomOverbookingView({ restaurantId }: { restaurantId: string }) {
  const { draft, setDraft, canConfigure, query, save, pending } = useInventoryPolicy(restaurantId);
  const rules = draft;
  return (
    <div className="space-y-3">
      <InventoryViewHeader
        title="Overbooking"
        description="Configure stored overbooking policy. Operational inventory allowance remains 0 in v1."
        action={
          <div className="flex flex-wrap gap-2">
            <SettingsLink />
            {canConfigure ? (
              <Button
                size="sm"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
                disabled={pending || query.isLoading}
                onClick={() => save()}
              >
                Save overbooking policy
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
          title="Overbooking policy could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi
              icon={Gauge}
              label="Operational allowance"
              value={0}
              detail="Canonical availability"
              tone="bg-emerald-50 text-emerald-700"
            />
            <Kpi
              icon={ShieldAlert}
              label="Configured policy"
              value={rules.overbookingAllowed ? "Enabled" : "Off"}
              detail={
                query.data?.overbooking.configuredButNotOperational
                  ? "Configured, not operational"
                  : "Not used to expand inventory"
              }
              tone="bg-amber-50 text-amber-700"
            />
            <Kpi
              icon={Layers3}
              label="Maximum overbooking"
              value={rules.maximumOverbooking ?? "—"}
              detail="Stored cap only"
              tone="bg-blue-50 text-blue-700"
            />
            <Kpi
              icon={Ban}
              label="Stop-sell fallback"
              value="Not configured"
              detail="No overbooking fallback action"
              tone="bg-zinc-100 text-zinc-700"
            />
          </div>

          <section className="rounded-lg border border-[#E5DED4] bg-white p-4 shadow-sm">
            <h3 className="text-[13px] font-semibold" style={{ color: INK }}>
              Overbooking controls
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saves through the same Card 2 <code>saveInventoryRules</code> path. Nightly cap,
              numeric approval threshold, and stop-sell fallback are not in the schema.
            </p>
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
              {OVERBOOKING_CAPACITY_NOTE} Operational allowance stays 0. Availability math is not
              changed in this workspace.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <PolicySwitch
                label="Overbooking allowed"
                help="Policy configuration only; it does not activate live oversell."
                tone="config"
                checked={rules.overbookingAllowed}
                disabled={!canConfigure}
                onChange={(overbookingAllowed) => setDraft({ overbookingAllowed })}
              />
              {rules.overbookingAllowed ? (
                <>
                  <Field label="Maximum overbooking">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      disabled={!canConfigure}
                      value={rules.maximumOverbooking ?? ""}
                      onChange={(event) =>
                        setDraft({
                          maximumOverbooking:
                            event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Percentage limit">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      disabled={!canConfigure}
                      value={rules.percentageLimit ?? ""}
                      onChange={(event) =>
                        setDraft({
                          percentageLimit:
                            event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <PolicySwitch
                    label="Room-type limit enabled"
                    help="Forward-compatible flag. No per-type allowance table exists."
                    tone="config"
                    checked={rules.roomTypeLimitEnabled}
                    disabled={!canConfigure}
                    onChange={(roomTypeLimitEnabled) => setDraft({ roomTypeLimitEnabled })}
                  />
                  <PolicySwitch
                    label="Date-based limit enabled"
                    help="Forward-compatible flag. No date-based overbooking table exists."
                    tone="config"
                    checked={rules.dateBasedLimitEnabled}
                    disabled={!canConfigure}
                    onChange={(dateBasedLimitEnabled) => setDraft({ dateBasedLimitEnabled })}
                  />
                  <PolicySwitch
                    label="Manager approval required"
                    tone="config"
                    checked={rules.managerApprovalRequired}
                    disabled={!canConfigure}
                    onChange={(managerApprovalRequired) => setDraft({ managerApprovalRequired })}
                  />
                  <PolicySwitch
                    label="Override permission required"
                    tone="config"
                    checked={rules.overridePermissionRequired}
                    disabled={!canConfigure}
                    onChange={(overridePermissionRequired) =>
                      setDraft({ overridePermissionRequired })
                    }
                  />
                  <PolicySwitch
                    label="Overbooking reason required"
                    tone="config"
                    checked={rules.overbookingReasonRequired}
                    disabled={!canConfigure}
                    onChange={(overbookingReasonRequired) =>
                      setDraft({ overbookingReasonRequired })
                    }
                  />
                  <PolicySwitch
                    label="Overbooking alert enabled"
                    tone="config"
                    checked={rules.overbookingAlertEnabled}
                    disabled={!canConfigure}
                    onChange={(overbookingAlertEnabled) => setDraft({ overbookingAlertEnabled })}
                  />
                </>
              ) : null}
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
    <div className="flex min-h-16 items-center gap-2.5 rounded-lg border border-[#EAE4DB] bg-white px-3 py-2 shadow-sm">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9px] text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-5" style={{ color: INK }}>
          {value}
        </p>
        <p className="truncate text-[8px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function RulePanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#E5DED4] bg-white p-4 shadow-sm">
      <h3 className="text-[13px] font-semibold" style={{ color: INK }}>
        {title}
      </h3>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{description}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function PolicySwitch({
  label,
  help,
  checked,
  disabled,
  tone,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  tone: "enforced" | "config";
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[#EEE8E0] px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-medium" style={{ color: INK }}>
            {label}
          </p>
          <InventoryStatusBadge tone={tone === "enforced" ? "info" : "warning"}>
            {tone === "enforced" ? "Enforced" : "Config only"}
          </InventoryStatusBadge>
        </div>
        {help ? <p className="mt-0.5 text-[10px] text-muted-foreground">{help}</p> : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        className="mt-0.5 data-[state=checked]:bg-[#C89933]"
        onCheckedChange={(value) => onChange(value === true)}
      />
    </div>
  );
}

function SettingsLink({ label = "Manage in Property Setup" }: { label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={PROPERTY_SETUP_HREF}>
        {label} <ExternalLink className="ml-2 size-4" />
      </a>
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-[10px] font-medium text-[#5F554B]">
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
        className="h-9"
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
    <label className="flex items-center gap-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-[#C89933]"
      />
      {label}
    </label>
  );
}
