import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  BedDouble,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Layers3,
  Moon,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  INVENTORY_IMPACTS,
  OVERBOOKING_AUTHORIZATION_NOTE,
  OVERBOOKING_CAPACITY_NOTE,
  OVERBOOKING_FUTURE_LIMITS_NOTE,
  defaultInventoryRules,
  isInventoryImpact,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  ASSIGNMENT_RULES,
  AVAILABILITY_RULES,
  BLOCK_TYPE_DESCRIPTIONS,
  GUEST_MATCHING_RULES,
  IMPACT_STAFF_HELP,
  IMPACT_STAFF_LABELS,
  OPERATIONAL_REQUIREMENT_RULES,
  blockTypeLabel,
  highImpactConsequences,
  ruleStateLabel,
  rulesChanged,
  type RuleDefinition,
} from "./room-inventory-rule-catalog";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
  ROOM_SHELL_PRIMARY_BUTTON,
  RoomShellRefreshButton,
  RoomShellSlot,
  RoomSummaryChips,
} from "./room-inventory-shell";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import { InventoryState, PmsSelect } from "./room-inventory-shared";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_PLACEHOLDER,
  PMS_OP_SELECT_TRIGGER,
} from "@/packages/pms/lib/pms-operational-surface";
import {
  compactStayRange,
  eligibilityStaffLines,
  staffEligibilityError,
  stayNightCount,
} from "./room-eligibility-display";
import { addDays, preferenceReasonLabel } from "./room-inventory-utils";

export interface AssignmentInspectionPrefill {
  roomId: string;
  roomTypeId: string;
}

const INK = "#251605";
const PROPERTY_SETUP_HREF =
  "/restaurant/settings?returnTo=/restaurant/pms/room-inventory#rooms-inventory";

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
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const seededStay = useRef(false);
  const [input, setInput] = useState({
    roomId: prefill?.roomId ?? "",
    roomTypeId: prefill?.roomTypeId ?? "",
    arrival: "",
    departure: "",
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
  useEffect(() => {
    const date = businessDateQuery.data?.businessDate;
    if (!date || seededStay.current) return;
    seededStay.current = true;
    setInput((current) => ({
      ...current,
      arrival: current.arrival || date,
      departure: current.departure || addDays(date, 1),
    }));
  }, [businessDateQuery.data]);

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const room = rooms.find((item) => item.id === input.roomId) ?? null;
  const roomType =
    typesQuery.data?.find((item) => item.id === (room?.roomTypeId ?? input.roomTypeId)) ?? null;
  const locations = useMemo(
    () => ({
      buildings: Array.from(
        new Map(
          rooms
            .filter((item) => item.buildingId)
            .map((item) => [item.buildingId!, item.building ?? "Building"] as [string, string]),
        ),
      ),
      floors: Array.from(
        new Map(
          rooms
            .filter((item) => item.floorId)
            .map((item) => [item.floorId!, item.floor ?? "Floor"] as [string, string]),
        ),
      ),
    }),
    [rooms],
  );
  const [attempted, setAttempted] = useState(false);
  const bedChoices = useMemo(() => {
    const values = new Set<string>();
    for (const type of typesQuery.data ?? []) {
      if (type.bedType?.trim()) values.add(type.bedType.trim());
      for (const bed of type.beds) {
        if (bed.bedType.trim()) values.add(bed.bedType.trim());
      }
    }
    if (input.requiredBedType.trim() && !values.has(input.requiredBedType.trim())) {
      values.add(input.requiredBedType.trim());
    }
    return [...values].sort((left, right) => left.localeCompare(right));
  }, [input.requiredBedType, typesQuery.data]);
  const mutation = useMutation({
    mutationFn: async () => {
      const selected = rooms.find((item) => item.id === input.roomId) ?? null;
      const selectedType =
        typesQuery.data?.find((item) => item.id === (selected?.roomTypeId ?? input.roomTypeId)) ??
        null;
      const snapshot: InspectedStay = {
        roomId: input.roomId,
        roomNumber: selected?.roomNumber ?? "",
        roomTypeName: selected?.roomTypeName ?? selectedType?.name ?? "",
        arrival: input.arrival,
        departure: input.departure,
        adults: Number(input.adults),
        children: Number(input.children),
        bedPreference: input.requiredBedType.trim() || null,
        buildingId: input.preferredBuildingId,
        floorId: input.preferredFloorId,
        buildingPreference:
          locations.buildings.find((item) => item[0] === input.preferredBuildingId)?.[1] ?? null,
        floorPreference:
          locations.floors.find((item) => item[0] === input.preferredFloorId)?.[1] ?? null,
        accessibleRequired: input.accessibleRequired,
        connectingRequired: input.connectingRequired,
        guestPreferenceMatched: input.guestPreferenceMatched,
        forCheckIn: input.forCheckIn,
        roomTypeId: input.roomTypeId,
        actualRoomTypeId: selected?.roomTypeId ?? "",
        roomBuilding: selected?.building ?? null,
        roomFloor: selected?.floor ?? null,
        housekeepingStatus: selected?.housekeepingStatus ?? null,
        maintenanceStatus: selected?.maintenanceStatus ?? null,
        operationalStatus: selected?.status ?? null,
        maxOccupancy: selectedType?.maxOccupancy ?? null,
        roomBeds: bedLabel(selectedType),
      };
      const result = await evaluate({
        data: {
          restaurantId,
          roomId: input.roomId,
          roomTypeId: input.roomTypeId,
          arrival: input.arrival,
          departure: input.departure,
          adults: snapshot.adults,
          children: snapshot.children,
          requiredBedType: snapshot.bedPreference,
          accessibleRequired: input.accessibleRequired,
          connectingRequired: input.connectingRequired,
          preferredBuildingId: input.preferredBuildingId || null,
          preferredFloorId: input.preferredFloorId || null,
          guestPreferenceMatched: input.guestPreferenceMatched,
          forCheckIn: input.forCheckIn,
          excludeReservationId: null,
        },
      });
      return { result, snapshot };
    },
  });
  const nights = stayNightCount(input.arrival, input.departure);
  const issues: string[] = [];
  if (!input.roomId) issues.push("Choose a candidate room.");
  else if (!input.roomTypeId) issues.push("This room has no room type.");
  if (!input.arrival) issues.push("Arrival is required.");
  if (!input.departure) issues.push("Departure is required.");
  if (input.arrival && input.departure && input.departure <= input.arrival) {
    issues.push("Departure must be after arrival.");
  }
  const adultsIssue = partyCountIssue("Adults", input.adults);
  const childrenIssue = partyCountIssue("Children", input.children);
  if (adultsIssue) issues.push(adultsIssue);
  if (childrenIssue) issues.push(childrenIssue);
  const inspected = mutation.data?.snapshot ?? null;
  const result = mutation.data?.result ?? null;
  const inspectedRoom = inspected
    ? (rooms.find((item) => item.id === inspected.roomId) ?? null)
    : null;
  const inspectedType = inspectedRoom
    ? (typesQuery.data?.find((item) => item.id === inspectedRoom.roomTypeId) ?? null)
    : null;
  const stale = inspected
    ? input.roomId !== inspected.roomId ||
      input.arrival !== inspected.arrival ||
      input.departure !== inspected.departure ||
      Number(input.adults) !== inspected.adults ||
      Number(input.children) !== inspected.children ||
      (input.requiredBedType.trim() || null) !== inspected.bedPreference ||
      input.preferredBuildingId !== inspected.buildingId ||
      input.preferredFloorId !== inspected.floorId ||
      input.accessibleRequired !== inspected.accessibleRequired ||
      input.connectingRequired !== inspected.connectingRequired ||
      input.guestPreferenceMatched !== inspected.guestPreferenceMatched ||
      input.forCheckIn !== inspected.forCheckIn
    : false;
  const lines = result
    ? eligibilityStaffLines({
        source: result.source,
        eligible: result.eligible,
        blockers: result.blockers,
        warnings: result.warnings,
        preferenceReasons: result.preferenceReasons,
        arrival: inspected?.arrival ?? input.arrival,
        departure: inspected?.departure ?? input.departure,
        guests: (inspected?.adults ?? 0) + (inspected?.children ?? 0),
        maxOccupancy: inspected?.maxOccupancy ?? null,
        housekeepingStatus: inspected?.housekeepingStatus ?? null,
        maintenanceStatus: inspected?.maintenanceStatus ?? null,
        operationalStatus: inspected?.operationalStatus ?? null,
        bedPreference: inspected?.bedPreference ?? null,
        roomBeds: inspected?.roomBeds ?? null,
        buildingPreference: inspected?.buildingPreference ?? null,
        roomBuilding: inspected?.roomBuilding ?? null,
        floorPreference: inspected?.floorPreference ?? null,
        roomFloor: inspected?.roomFloor ?? null,
        accessibleRequired: inspected?.accessibleRequired ?? false,
        connectingRequired: inspected?.connectingRequired ?? false,
        forCheckIn: inspected?.forCheckIn ?? false,
        roomTypeAligned: inspected
          ? inspected.roomTypeId !== "" && inspected.roomTypeId === inspected.actualRoomTypeId
          : true,
      })
    : [];
  const extraPreferences = (result?.preferenceReasons ?? [])
    .filter(
      (reason) =>
        reason !== "building_match" &&
        reason !== "floor_match" &&
        reason !== "guest_preference_match",
    )
    .map((reason) => preferenceReasonLabel(reason));

  function inspect() {
    setAttempted(true);
    if (issues.length > 0 || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,42rem)_minmax(18rem,24rem)] xl:max-w-[68rem]">
      <section className="rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
        <div className="border-b border-[#E5DED4] px-4 py-3">
          <h3 className="text-sm font-bold" style={{ color: INK }}>
            Stay Criteria
          </h3>
          <p className="mt-0.5 text-xs text-[#756A5B]">
            Set the stay once, then change the candidate room and inspect again.
          </p>
        </div>
        {roomsQuery.isLoading ? (
          <div className="px-4 py-8">
            <InventoryState state="loading" />
          </div>
        ) : (
          <div className="space-y-4 px-4 py-3">
            <StaySelect
              icon={BedDouble}
              label="Candidate room"
              prominent
              value={input.roomId}
              placeholder="Select a room"
              onChange={(value) => {
                const selected = rooms.find((item) => item.id === value);
                setInput({
                  ...input,
                  roomId: value,
                  roomTypeId: selected?.roomTypeId ?? "",
                });
              }}
              options={[
                ["", "Select a room"],
                ...rooms.map(
                  (item) =>
                    [item.id, `Room ${item.roomNumber} · ${item.roomTypeName}`] as [string, string],
                ),
              ]}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StayDate
                label="Arrival"
                value={input.arrival}
                onChange={(arrival) =>
                  setInput({
                    ...input,
                    arrival,
                    departure: input.departure <= arrival ? addDays(arrival, 1) : input.departure,
                  })
                }
              />
              <StayDate
                label="Departure"
                min={input.arrival ? addDays(input.arrival, 1) : undefined}
                value={input.departure}
                onChange={(departure) => setInput({ ...input, departure })}
              />
              <StayText
                icon={Moon}
                label="Nights"
                value={nights == null ? "" : String(nights)}
                readOnly
                placeholder="—"
                onChange={() => undefined}
              />
              <StayText
                icon={Users}
                label="Adults"
                type="number"
                min="0"
                value={input.adults}
                onChange={(adults) => setInput({ ...input, adults })}
              />
              <StayText
                icon={UserRound}
                label="Children"
                type="number"
                min="0"
                value={input.children}
                onChange={(children) => setInput({ ...input, children })}
              />
            </div>

            <div className="space-y-2 border-t border-[#E5DED4] pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
                Assignment Preferences
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {bedChoices.length > 0 ? (
                  <StaySelect
                    icon={BedDouble}
                    label="Bed type"
                    value={input.requiredBedType}
                    placeholder="Any bed type"
                    onChange={(requiredBedType) => setInput({ ...input, requiredBedType })}
                    options={[
                      ["", "Any bed type"],
                      ...bedChoices.map((bed) => [bed, staffPhrase(bed)] as [string, string]),
                    ]}
                  />
                ) : (
                  <StayText
                    icon={BedDouble}
                    label="Bed type"
                    value={input.requiredBedType}
                    placeholder="Any bed type"
                    onChange={(requiredBedType) => setInput({ ...input, requiredBedType })}
                  />
                )}
                <StaySelect
                  icon={Building2}
                  label="Building"
                  value={input.preferredBuildingId}
                  placeholder="Any building"
                  onChange={(preferredBuildingId) => setInput({ ...input, preferredBuildingId })}
                  options={[["", "Any building"], ...locations.buildings]}
                />
                <StaySelect
                  icon={Layers3}
                  label="Floor"
                  value={input.preferredFloorId}
                  placeholder="Any floor"
                  onChange={(preferredFloorId) => setInput({ ...input, preferredFloorId })}
                  options={[["", "Any floor"], ...locations.floors]}
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-[#E5DED4] pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">
                Eligibility Checks
              </p>
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
                  label="Match guest preferences"
                  checked={input.guestPreferenceMatched}
                  onChange={(guestPreferenceMatched) =>
                    setInput({ ...input, guestPreferenceMatched })
                  }
                />
                <CheckRow
                  label="Check check-in readiness"
                  checked={input.forCheckIn}
                  onChange={(forCheckIn) => setInput({ ...input, forCheckIn })}
                />
              </div>
            </div>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5DED4] px-4 py-3">
          {attempted && issues.length > 0 ? (
            <ul className="mr-auto space-y-0.5" role="alert">
              {issues.map((issue) => (
                <li key={issue} className="text-xs text-destructive">
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            className={ROOM_SHELL_PRIMARY_BUTTON}
            disabled={mutation.isPending || roomsQuery.isLoading}
            onClick={inspect}
          >
            <Search className="mr-2 size-4" />
            {mutation.isPending ? "Inspecting…" : "Inspect Eligibility"}
          </Button>
        </footer>
      </section>

      <section className="rounded-lg border border-[#DDD4C5] bg-white shadow-sm">
        <div className="border-b border-[#E5DED4] px-4 py-3">
          <h3 className="text-sm font-bold" style={{ color: INK }}>
            Eligibility Result
          </h3>
          {inspected?.roomNumber ? (
            <p className="mt-0.5 text-xs text-[#756A5B]">
              Room {inspected.roomNumber}
              {inspected.roomTypeName ? ` · ${inspected.roomTypeName}` : ""}
              {" · "}
              {compactStayRange(inspected.arrival, inspected.departure)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[#756A5B]">
              The result stays with the room you inspected.
            </p>
          )}
        </div>
        <div className="space-y-3 p-4">
          {mutation.isError ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              {staffEligibilityError(mutation.error)}
            </p>
          ) : null}
          {!result && !mutation.isError ? (
            <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4] px-4 py-6 text-center">
              <Search className="mx-auto mb-2 size-5 text-[#C89933]" />
              <p className="text-xs font-semibold text-[#251605]">Ready to inspect</p>
              <p className="mt-1 text-[11px] text-[#756A5B]">
                Select a candidate room and stay period, then click Inspect eligibility.
              </p>
            </div>
          ) : null}
          {result ? (
            <>
              {stale ? (
                <p className="rounded-md border border-[#E7D7B1] bg-[#FBF6EA] px-3 py-2 text-xs text-[#6B5424]">
                  This result is for Room {inspected?.roomNumber || "the inspected room"},{" "}
                  {compactStayRange(inspected?.arrival ?? "", inspected?.departure ?? "")}. Inspect
                  eligibility again to check the current selection.
                </p>
              ) : null}
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
                  result.eligible ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                }`}
              >
                {result.eligible ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-700" />
                ) : (
                  <Ban className="size-5 shrink-0 text-red-700" />
                )}
                <div>
                  <p
                    className={`text-sm font-bold ${
                      result.eligible ? "text-emerald-950" : "text-red-950"
                    }`}
                  >
                    {result.eligible ? "Eligible" : "Not Eligible"}
                  </p>
                  <p className="text-[11px] text-[#5C5346]">
                    {result.eligible
                      ? "This room can be assigned for the inspected stay."
                      : "This room cannot be assigned for the inspected stay."}
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {lines.map((line) => (
                  <li
                    key={`${line.tone}-${line.text}`}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                      line.tone === "fail"
                        ? "border-red-200 bg-red-50 text-red-950"
                        : line.tone === "warn"
                          ? "border-amber-200 bg-amber-50 text-amber-950"
                          : "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                    }`}
                  >
                    {line.tone === "fail" ? (
                      <Ban className="mt-0.5 size-3.5 shrink-0 text-red-700" />
                    ) : line.tone === "warn" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-700" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-700" />
                    )}
                    <span className="font-medium leading-snug">{line.text}</span>
                  </li>
                ))}
                {extraPreferences.map((label) => (
                  <li
                    key={label}
                    className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-medium text-emerald-950"
                  >
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-700" />
                    {label}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <RoomContextCard
            room={inspected ? inspectedRoom : room}
            roomType={inspected ? inspectedType : roomType}
          />
        </div>
      </section>
    </div>
  );
}

interface InspectedStay {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  bedPreference: string | null;
  buildingId: string;
  floorId: string;
  buildingPreference: string | null;
  floorPreference: string | null;
  accessibleRequired: boolean;
  connectingRequired: boolean;
  guestPreferenceMatched: boolean;
  forCheckIn: boolean;
  roomTypeId: string;
  actualRoomTypeId: string;
  roomBuilding: string | null;
  roomFloor: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  operationalStatus: string | null;
  maxOccupancy: number | null;
  roomBeds: string | null;
}

function partyCountIssue(label: string, value: string): string | null {
  if (!/^\d+$/.test(value.trim())) return `${label} must be a whole number from 0 to 99.`;
  const count = Number(value);
  if (count < 0 || count > 99) return `${label} must be a whole number from 0 to 99.`;
  return null;
}

function staffPhrase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function bedLabel(roomType: RoomType | null): string | null {
  if (!roomType) return null;
  const names = roomType.beds.map((bed) => bed.bedType.trim()).filter(Boolean);
  const unique = [
    ...new Set(names.length > 0 ? names : roomType.bedType ? [roomType.bedType] : []),
  ];
  if (unique.length === 0) return null;
  return unique.map((bed) => staffPhrase(bed)).join(" and ");
}

function StaySelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
  placeholder,
  prominent = false,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
  placeholder: string;
  prominent?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <span
        className={
          prominent
            ? "text-sm font-semibold text-[#251605]"
            : "text-xs font-semibold text-[#5C5346]"
        }
      >
        {label}
      </span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[#8A641A]" />
        <PmsSelect
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          options={options.map((option) => [option[0] ?? "", option[1] ?? ""] as [string, string])}
          triggerClassName={cn(PMS_OP_SELECT_TRIGGER, "pl-9")}
        />
      </div>
    </div>
  );
}

function StayDate({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  return (
    <StayText
      icon={Calendar}
      label={label}
      type="date"
      min={min}
      value={value}
      onChange={onChange}
    />
  );
}

function StayText({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  min,
  readOnly = false,
  placeholder,
}: {
  icon?: typeof Calendar;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#5C5346]">
      {label}
      <span className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8A641A]" />
        ) : null}
        <Input
          type={type}
          min={min}
          readOnly={readOnly}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            PMS_OP_INPUT,
            "h-10 text-xs",
            type === "date" && PMS_OP_DATE,
            PMS_OP_PLACEHOLDER,
            Icon && "pl-8",
          )}
        />
      </span>
    </label>
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
          <span className="text-xs font-bold text-[#251605]">Room {room.roomNumber}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">· {room.roomTypeName}</span>
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

export function RoomInventoryRulesView({ restaurantId }: { restaurantId: string }) {
  const { draft, setDraft, saved, canConfigure, query, save, pending, justSaved } =
    useInventoryPolicy(restaurantId);
  const [confirmLines, setConfirmLines] = useState<string[] | null>(null);
  const rules = draft;
  const dirty = rulesChanged(saved, rules);
  const enabledBlocks = rules.blockTypes.filter((row) => row.enabled).length;
  const activeAssignmentRules = ASSIGNMENT_RULES.filter((rule) => rules[rule.key]).length;
  const invalidImpact = rules.blockTypes.some(
    (row) => row.enabled && !isInventoryImpact(row.inventoryImpact),
  );

  function requestSave() {
    if (!saved || !dirty || invalidImpact) return;
    const consequences = highImpactConsequences(saved, rules);
    if (consequences.length > 0) {
      setConfirmLines(consequences);
      return;
    }
    save();
  }

  function renderRule(rule: RuleDefinition) {
    return (
      <PolicySwitch
        key={rule.key}
        rule={rule}
        checked={rules[rule.key]}
        disabled={!canConfigure}
        onChange={(value) => setDraft({ [rule.key]: value } as Partial<InventoryRulesDraft>)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <RoomShellSlot name="actions">
        <SettingsLink step="inventory-rules" />
      </RoomShellSlot>
      {canConfigure ? (
        <RoomShellSlot name="cta">
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Unsaved changes
              </span>
            ) : justSaved ? (
              <span className="text-[11px] font-semibold text-emerald-700">Rules saved</span>
            ) : null}
            <Button
              type="button"
              variant={dirty ? "default" : "outline"}
              className={
                dirty
                  ? ROOM_SHELL_PRIMARY_BUTTON
                  : "h-9 border-[#DDD4C5] px-4 text-xs font-semibold text-[#756A5B]"
              }
              disabled={!dirty || invalidImpact || pending || query.isLoading}
              onClick={requestSave}
            >
              {pending ? "Saving…" : "Save Rules"}
            </Button>
          </div>
        </RoomShellSlot>
      ) : null}
      <RoomSummaryChips
        items={[
          {
            label: "Assignment rules:",
            value: `${activeAssignmentRules} active`,
            tone: "neutral",
          },
          { label: "Block types:", value: `${enabledBlocks} enabled`, tone: "neutral" },
          {
            label: "Overbooking:",
            value: rules.overbookingAllowed ? "On" : "Off",
            tone: rules.overbookingAllowed ? "warning" : "neutral",
          },
        ]}
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
          {!canConfigure ? (
            <p className="rounded-lg border border-[#E5DED4] bg-[#FAF8F5] px-4 py-3 text-xs leading-5 text-muted-foreground">
              Owner or manager access is required to change inventory rules. Front Office can review
              the rules only.
            </p>
          ) : null}

          <div className="space-y-3">
            <RulePanel
              title="Inventory & Availability"
              description="Decides which rooms count toward sellable availability. Out of Order, Out of Service, and each block's inventory impact always apply."
            >
              <div className="divide-y divide-[#EEE8E0] rounded-lg border border-[#EEE8E0]">
                {AVAILABILITY_RULES.map(renderRule)}
              </div>
            </RulePanel>

            <RulePanel
              title="Assignment Matching"
              description="Checked when a room is assigned, offered at check-in, or inspected in Assignment Eligibility. Blocking rules stop the assignment; preferences only rank rooms and show a warning."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <RuleGroup title="Operational Requirements">
                  {OPERATIONAL_REQUIREMENT_RULES.map(renderRule)}
                </RuleGroup>
                <RuleGroup title="Guest & Room Matching">
                  {GUEST_MATCHING_RULES.map(renderRule)}
                </RuleGroup>
              </div>
            </RulePanel>

            <RulePanel
              title="Block-type Inventory Behavior"
              description="New blocks copy these settings when they are created. Existing blocks keep the settings they were created with."
            >
              <div className="overflow-x-auto rounded-lg border border-[#E5DED4]">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-b border-[#E5DED4] bg-[#F7F4EE] text-[11px] font-bold uppercase tracking-wider text-[#5C5346]">
                    <tr>
                      <th className="px-3.5 py-2">Type</th>
                      <th className="px-3.5 py-2">Enabled</th>
                      <th className="px-3.5 py-2">Approval Required</th>
                      <th className="px-3.5 py-2">Inventory Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEE8E0] bg-white">
                    {rules.blockTypes.map((row) => {
                      const updateRow = (patch: Partial<typeof row>) =>
                        setDraft({
                          blockTypes: rules.blockTypes.map((item) =>
                            item.blockType === row.blockType ? { ...item, ...patch } : item,
                          ),
                        });
                      const impactInvalid = row.enabled && !isInventoryImpact(row.inventoryImpact);
                      return (
                        <tr key={row.blockType} className="transition-colors hover:bg-[#FAF8F5]/60">
                          <td className="px-3.5 py-2.5">
                            <p className="font-bold text-[#251605]">
                              {blockTypeLabel(row.blockType)}
                            </p>
                            <p className="text-[11px] text-[#756A5B]">
                              {BLOCK_TYPE_DESCRIPTIONS[row.blockType]}
                            </p>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Switch
                              checked={row.enabled}
                              disabled={!canConfigure}
                              aria-label={`${blockTypeLabel(row.blockType)} enabled`}
                              className="data-[state=checked]:bg-[#C89933]"
                              onCheckedChange={(enabled) =>
                                updateRow({ enabled: enabled === true })
                              }
                            />
                          </td>
                          <td className={cn("px-3.5 py-2.5", !row.enabled && "opacity-45")}>
                            <Switch
                              checked={row.approvalRequired}
                              disabled={!canConfigure || !row.enabled}
                              aria-label={`${blockTypeLabel(row.blockType)} approval required`}
                              className="data-[state=checked]:bg-[#C89933]"
                              onCheckedChange={(approvalRequired) =>
                                updateRow({ approvalRequired: approvalRequired === true })
                              }
                            />
                          </td>
                          <td className={cn("px-3.5 py-2.5", !row.enabled && "opacity-45")}>
                            <PmsSelect
                              disabled={!canConfigure || !row.enabled}
                              value={row.inventoryImpact}
                              onChange={(value) =>
                                updateRow({ inventoryImpact: value as InventoryImpact })
                              }
                              options={INVENTORY_IMPACTS.map(
                                (impact) =>
                                  [impact, IMPACT_STAFF_LABELS[impact]] as [string, string],
                              )}
                              className="w-full max-w-xs"
                            />
                            {impactInvalid ? (
                              <p className="mt-1 text-[11px] text-destructive">
                                Choose an inventory impact.
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-[#756A5B] sm:grid-cols-2">
                {INVENTORY_IMPACTS.map((impact) => (
                  <div key={impact}>
                    <dt className="inline font-semibold text-[#5C5346]">
                      {IMPACT_STAFF_LABELS[impact]}:
                    </dt>{" "}
                    <dd className="inline">{IMPACT_STAFF_HELP[impact]}</dd>
                  </div>
                ))}
              </dl>
            </RulePanel>
          </div>
        </>
      )}

      <AlertDialog
        open={confirmLines !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmLines(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Save these rule changes?</AlertDialogTitle>
            <AlertDialogDescription>
              These changes affect availability or room assignment as soon as they are saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1.5 text-xs text-[#251605]">
            {(confirmLines ?? []).map((line) => (
              <li key={line} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className={ROOM_SHELL_PRIMARY_BUTTON}
              onClick={() => {
                setConfirmLines(null);
                save();
              }}
            >
              Save Rules
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RuleGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">{title}</h4>
      <div className="divide-y divide-[#EEE8E0] rounded-lg border border-[#EEE8E0]">{children}</div>
    </div>
  );
}

export function RoomOverbookingView({ restaurantId }: { restaurantId: string }) {
  const { query } = useInventoryPolicy(restaurantId);
  const loadBoard = useServerFn(getOverbookingBoard);
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const [night, setNight] = useState<string | null>(null);
  useEffect(() => {
    if (night || !businessDateQuery.data?.businessDate) return;
    setNight(businessDateQuery.data.businessDate);
  }, [businessDateQuery.data, night]);
  const board = useQuery({
    queryKey: ["overbooking-board", restaurantId, night],
    queryFn: () => {
      if (!night) throw new Error("Property business date is not ready.");
      return loadBoard({ data: { restaurantId, start: night, end: night } });
    },
    enabled: Boolean(night),
  });
  const summary = board.data?.nights[0];
  return (
    <div className="space-y-3">
      <RoomShellSlot name="controls">
        <Input
          type="date"
          value={night ?? ""}
          onChange={(event) => setNight(event.target.value)}
          className="h-9 w-40 text-xs"
          aria-label="Overbooking night"
        />
      </RoomShellSlot>
      <RoomShellSlot name="actions">
        <SettingsLink
          label="Configure in Property Setup"
          step="inventory-rules"
          section="overbooking"
        />
      </RoomShellSlot>
      <RoomSummaryChips
        items={[
          {
            label: "Physical available",
            value: summary?.physicalAvailable ?? "—",
            tone: "success",
          },
          {
            label: "Overbooking",
            value: summary?.propertyOverbookingEnabled ? "Enabled" : "Off",
            tone: summary?.propertyOverbookingEnabled ? "warning" : "neutral",
          },
          { label: "Overbooked rooms", value: summary?.totalOverbookedRooms ?? "—", tone: "info" },
        ]}
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
          <section className="rounded-lg border border-[#E5DED4] bg-white p-5 shadow-xs">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Overbooking controls
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              The numbers come from the room-type calculation the reservation transaction uses.
              Allowances are edited in Property Setup.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
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
                <span className="font-bold text-[#251605]">
                  {summary?.physicalAvailable ?? "—"}
                </span>
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
                      <td className="px-3.5 py-3 font-medium text-[#251605]">
                        {type.physicalCapacity}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">{type.demand}</td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">
                        {type.physicalAvailable}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">
                        {type.overbookingAllowance}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">
                        {type.overbookingConsumed}
                      </td>
                      <td className="px-3.5 py-3 font-medium text-[#251605]">
                        {type.overbookingRemaining}
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            !type.overbookingEnabled
                              ? "bg-zinc-100 text-zinc-600"
                              : type.overbookingRemaining === 0 && type.overbookingAllowance > 0
                                ? "bg-red-100 text-red-700"
                                : type.overbookingAllowance > 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
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
  const [saved, setSaved] = useState<InventoryRulesDraft | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
    setSaved(null);
  }, [restaurantId]);

  useEffect(() => {
    if (!query.data || hydrated) return;
    const loaded = normalizeInventoryRules(query.data.rules);
    setDraftState(loaded);
    setSaved(loaded);
    setHydrated(true);
  }, [query.data, hydrated]);

  function setDraft(patch: Partial<InventoryRulesDraft>) {
    setJustSaved(false);
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
      const stored = normalizeInventoryRules(result.rules);
      setDraftState(stored);
      setSaved(stored);
      setJustSaved(true);
      await invalidateRuleViews(queryClient, restaurantId);
      toast.success("Rules saved");
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
    saved,
    justSaved,
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
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-[#DDD4C5] bg-white p-4 shadow-sm", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-bold tracking-tight" style={{ color: INK }}>
          {title}
        </h3>
        <p className="mt-0.5 text-xs leading-5 text-[#756A5B]">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

const RULE_STATE_TONE: Record<string, string> = {
  Blocking: "border-red-200 bg-red-50 text-red-800",
  Preference: "border-amber-200 bg-amber-50 text-amber-800",
  Applied: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Disabled: "border-[#DDD4C5] bg-[#FAF8F4] text-[#756A5B]",
};

function PolicySwitch({
  rule,
  checked,
  disabled,
  onChange,
}: {
  rule: RuleDefinition;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const state = ruleStateLabel(rule.kind, checked);
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-snug" style={{ color: INK }}>
          {rule.label}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-[#756A5B]">{rule.help}</p>
        {rule.inspectorOnly ? (
          <p className="mt-0.5 text-[11px] leading-4 text-[#8A7B68] italic">{rule.inspectorOnly}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            RULE_STATE_TONE[state],
          )}
        >
          {state}
        </span>
        <Switch
          checked={checked}
          disabled={disabled}
          aria-label={rule.label}
          className="data-[state=checked]:bg-[#C89933]"
          onCheckedChange={(value) => onChange(value === true)}
        />
      </div>
    </div>
  );
}

function SettingsLink({
  label = "Manage in Property Setup",
  step = "inventory-rules",
  section,
}: {
  label?: string;
  step?:
    | "room-types"
    | "amenities"
    | "housekeeping"
    | "inventory-rules"
    | "maintenance"
    | "rates-pricing"
    | "meal-plans-packages";
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
