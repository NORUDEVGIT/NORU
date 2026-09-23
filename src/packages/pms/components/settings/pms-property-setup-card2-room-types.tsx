import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  bulkCreateRooms,
  evaluateCard2RoomTypesReadiness,
  listRooms,
  listRoomTypes,
  saveRoom,
  saveRoomType,
  type HotelRoom,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import {
  MAINTENANCE_STATUSES,
  ROOM_LINK_KINDS,
  ROOM_STATUSES,
  SMOKING_POLICIES,
  type MaintenanceStatus,
  type RoomLinkKind,
  type RoomStatus,
  type SmokingPolicy,
} from "@/packages/pms/lib/rooms.server";
import { HK_STATUSES, type HkStatus } from "@/packages/pms/lib/housekeeping.server";
import { getPmsSet2Snapshot } from "@/packages/pms/lib/pms-set2-structure.functions";
import { emptySet2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import {
  cascadeLocationIds,
  floorsForBuildingAndWing,
  sequentialRoomLabels,
  wingsForBuilding,
} from "@/packages/pms/lib/rooms-card2.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  PropertySetupField,
  PropertySetupFormGrid,
  PropertySetupFormItem,
  PropertySetupRemoveButton,
} from "@/packages/pms/components/settings/setup-kit";

type TypeForm = {
  id?: string;
  code: string;
  name: string;
  shortName: string;
  displayName: string;
  description: string;
  category: string;
  class: string;
  standardOccupancy: number;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  infantCapacity: number;
  extraGuestAllowed: boolean;
  extraBedAllowed: boolean;
  connectingEligible: boolean;
  accessibleEligible: boolean;
  smokingPolicy: SmokingPolicy;
  roomSize: string;
  roomView: string;
  sellable: boolean;
  active: boolean;
  defaultBuildingId: string;
  defaultWingId: string;
  preferredFloorId: string;
  beds: { bedType: string; bedSize: string; numberOfBeds: number }[];
};

type RoomForm = {
  id?: string;
  roomTypeId: string;
  roomNumber: string;
  roomCode: string;
  buildingId: string;
  wingId: string;
  floorId: string;
  notes: string;
  status: RoomStatus;
  housekeepingStatus: HkStatus;
  maintenanceStatus: MaintenanceStatus;
  sellable: boolean;
  active: boolean;
  smoking: boolean;
  accessible: boolean;
  roomFeatures: string[];
  links: { otherRoomId: string; kind: RoomLinkKind }[];
};

const emptyType = (): TypeForm => ({
  code: "",
  name: "",
  shortName: "",
  displayName: "",
  description: "",
  category: "",
  class: "",
  standardOccupancy: 2,
  maxOccupancy: 2,
  adultCapacity: 2,
  childCapacity: 0,
  infantCapacity: 0,
  extraGuestAllowed: false,
  extraBedAllowed: false,
  connectingEligible: false,
  accessibleEligible: false,
  smokingPolicy: "non_smoking",
  roomSize: "",
  roomView: "",
  sellable: true,
  active: true,
  defaultBuildingId: "",
  defaultWingId: "",
  preferredFloorId: "",
  beds: [{ bedType: "", bedSize: "", numberOfBeds: 1 }],
});

function typeFromRow(row: RoomType): TypeForm {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.shortName ?? "",
    displayName: row.displayName ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    class: row.class ?? "",
    standardOccupancy: row.standardOccupancy,
    maxOccupancy: row.maxOccupancy,
    adultCapacity: row.adultCapacity,
    childCapacity: row.childCapacity,
    infantCapacity: row.infantCapacity,
    extraGuestAllowed: row.extraGuestAllowed,
    extraBedAllowed: row.extraBedAllowed,
    connectingEligible: row.connectingEligible,
    accessibleEligible: row.accessibleEligible,
    smokingPolicy: row.smokingPolicy,
    roomSize: row.roomSize ?? "",
    roomView: row.roomView ?? "",
    sellable: row.sellable,
    active: row.active,
    defaultBuildingId: row.defaultBuildingId ?? "",
    defaultWingId: row.defaultWingId ?? "",
    preferredFloorId: row.preferredFloorId ?? "",
    beds:
      row.beds.length > 0
        ? row.beds.map((bed) => ({
            bedType: bed.bedType,
            bedSize: bed.bedSize ?? "",
            numberOfBeds: bed.numberOfBeds,
          }))
        : [{ bedType: "", bedSize: "", numberOfBeds: 1 }],
  };
}

function roomFromRow(row: HotelRoom): RoomForm {
  return {
    id: row.id,
    roomTypeId: row.roomTypeId,
    roomNumber: row.roomNumber,
    roomCode: row.roomCode ?? "",
    buildingId: row.buildingId ?? "",
    wingId: row.wingId ?? "",
    floorId: row.floorId ?? "",
    notes: row.notes ?? "",
    status: row.status,
    housekeepingStatus: row.housekeepingStatus ?? "clean",
    maintenanceStatus: row.maintenanceStatus,
    sellable: row.sellable,
    active: row.active,
    smoking: row.smoking,
    accessible: row.accessible,
    roomFeatures: row.roomFeatures,
    links: row.links.map((link) => ({ otherRoomId: link.otherRoomId, kind: link.kind })),
  };
}

export function PmsPropertySetupCard2RoomTypes({
  restaurantId,
  canEdit,
  onReadiness,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[]) => void;
  registerActions: (actions: {
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchRooms = useServerFn(listRooms);
  const fetchStructure = useServerFn(getPmsSet2Snapshot);
  const fetchReady = useServerFn(evaluateCard2RoomTypesReadiness);
  const saveTypeFn = useServerFn(saveRoomType);
  const saveRoomFn = useServerFn(saveRoom);
  const bulkFn = useServerFn(bulkCreateRooms);

  const [typeForm, setTypeForm] = useState<TypeForm>(emptyType);
  const [roomForm, setRoomForm] = useState<RoomForm | null>(null);
  const [featureDraft, setFeatureDraft] = useState("");
  const [bulk, setBulk] = useState({
    roomTypeId: "",
    buildingId: "",
    wingId: "",
    floorId: "",
    startNumber: 101,
    endNumber: 103,
    quantity: "",
    prefix: "",
    suffix: "",
  });

  const typesQuery = useQuery({
    queryKey: ["pms-card2-room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: true } }),
  });
  const roomsQuery = useQuery({
    queryKey: ["pms-card2-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const structureQuery = useQuery({
    queryKey: ["pms-card2-structure", restaurantId],
    queryFn: () => fetchStructure({ data: { restaurantId } }),
  });
  const readyQuery = useQuery({
    queryKey: ["pms-card2-room-types-ready", restaurantId],
    queryFn: () => fetchReady({ data: { restaurantId } }),
    enabled: canEdit,
  });

  const types = typesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const structure = structureQuery.data?.snapshot ?? emptySet2Snapshot();
  const readiness = readyQuery.data;

  useEffect(() => {
    if (!readiness) return;
    onReadiness(readiness.stepStatus, readiness.blockers);
  }, [readiness, onReadiness]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types-ready", restaurantId] });
  }

  const saveTypeMutation = useMutation({
    mutationFn: () =>
      saveTypeFn({
        data: {
          restaurantId,
          ...(typeForm.id ? { id: typeForm.id } : {}),
          code: typeForm.code.trim(),
          name: typeForm.name.trim(),
          shortName: typeForm.shortName.trim() || null,
          displayName: typeForm.displayName.trim() || null,
          description: typeForm.description.trim() || null,
          category: typeForm.category.trim() || null,
          class: typeForm.class.trim() || null,
          standardOccupancy: typeForm.standardOccupancy,
          maxOccupancy: typeForm.maxOccupancy,
          adultCapacity: typeForm.adultCapacity,
          childCapacity: typeForm.childCapacity,
          infantCapacity: typeForm.infantCapacity,
          extraGuestAllowed: typeForm.extraGuestAllowed,
          extraBedAllowed: typeForm.extraBedAllowed,
          connectingEligible: typeForm.connectingEligible,
          accessibleEligible: typeForm.accessibleEligible,
          smokingPolicy: typeForm.smokingPolicy,
          roomSize: typeForm.roomSize.trim() || null,
          roomView: typeForm.roomView.trim() || null,
          sellable: typeForm.sellable,
          active: typeForm.active,
          defaultBuildingId: typeForm.defaultBuildingId || null,
          defaultWingId: typeForm.defaultWingId || null,
          preferredFloorId: typeForm.preferredFloorId || null,
          beds: typeForm.beds
            .filter((row) => row.bedType.trim())
            .map((row) => ({
              bedType: row.bedType.trim(),
              bedSize: row.bedSize.trim() || null,
              numberOfBeds: row.numberOfBeds,
            })),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room type saved");
      if (result.id) setTypeForm((prev) => ({ ...prev, id: result.id }));
      refresh();
    },
    onError: () => toast.error("Could not save the room type."),
  });

  const saveRoomMutation = useMutation({
    mutationFn: async () => {
      if (!roomForm) return { ok: true as const, skipped: true };
      return saveRoomFn({
        data: {
          restaurantId,
          ...(roomForm.id ? { id: roomForm.id } : {}),
          roomTypeId: roomForm.roomTypeId,
          roomNumber: roomForm.roomNumber.trim(),
          roomCode: roomForm.roomCode.trim() || roomForm.roomNumber.trim(),
          buildingId: roomForm.buildingId || null,
          wingId: roomForm.wingId || null,
          floorId: roomForm.floorId || null,
          smoking: roomForm.smoking,
          accessible: roomForm.accessible,
          status: roomForm.status,
          housekeepingStatus: roomForm.housekeepingStatus,
          maintenanceStatus: roomForm.maintenanceStatus,
          sellable: roomForm.sellable,
          roomFeatures: roomForm.roomFeatures,
          active: roomForm.active,
          notes: roomForm.notes.trim() || null,
          links: roomForm.links,
        },
      });
    },
    onSuccess: (result) => {
      if (!result || ("skipped" in result && result.skipped)) return;
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room saved");
      refresh();
    },
    onError: () => toast.error("Could not save the room."),
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      bulkFn({
        data: {
          restaurantId,
          roomTypeId: bulk.roomTypeId,
          buildingId: bulk.buildingId,
          wingId: bulk.wingId || null,
          floorId: bulk.floorId || null,
          startNumber: bulk.startNumber,
          endNumber: bulk.quantity.trim() ? null : bulk.endNumber,
          quantity: bulk.quantity.trim() ? Number(bulk.quantity) : null,
          prefix: bulk.prefix || null,
          suffix: bulk.suffix || null,
        },
      }),
    onSuccess: (result) => {
      if (!result.success) {
        const extra = [
          ...result.validationErrors,
          result.conflicts.roomNumbers.length
            ? `Numbers in use: ${result.conflicts.roomNumbers.join(", ")}`
            : "",
          result.conflicts.roomCodes.length
            ? `Codes in use: ${result.conflicts.roomCodes.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        toast.error(extra || "Could not create rooms.");
        return;
      }
      toast.success(`Created ${result.createdCount} rooms`);
      refresh();
    },
    onError: () => toast.error("Could not create rooms."),
  });

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;
    const typeResult = await saveTypeMutation.mutateAsync();
    if (!typeResult.ok) {
      toast.error(typeResult.message);
      return false;
    }
    if (roomForm) {
      const roomResult = await saveRoomMutation.mutateAsync();
      if (roomResult && "ok" in roomResult && !roomResult.ok) {
        toast.error(roomResult.message);
        return false;
      }
    }
    await readyQuery.refetch();
    return true;
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;
    const latest = await fetchReady({ data: { restaurantId } });
    onReadiness(latest.stepStatus, latest.blockers);
    if (!latest.ready) {
      toast.error(latest.blockers[0] ?? "Room Types & Rooms is not complete yet.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  const preview = useMemo(
    () =>
      sequentialRoomLabels({
        startNumber: bulk.startNumber,
        endNumber: bulk.quantity.trim() ? null : bulk.endNumber,
        quantity: bulk.quantity.trim() ? Number(bulk.quantity) : null,
        prefix: bulk.prefix,
        suffix: bulk.suffix,
      }),
    [bulk],
  );

  const disabled = !canEdit;
  const typeWings = wingsForBuilding(structure.wings, structure.floors, typeForm.defaultBuildingId);
  const typeFloors = floorsForBuildingAndWing(
    structure.floors,
    structure.wings,
    typeForm.defaultBuildingId,
    typeForm.defaultWingId,
  );
  const roomWings = wingsForBuilding(structure.wings, structure.floors, roomForm?.buildingId);
  const roomFloors = floorsForBuildingAndWing(
    structure.floors,
    structure.wings,
    roomForm?.buildingId,
    roomForm?.wingId,
  );

  return (
    <div className="space-y-5" data-testid="pms-card2-room-types-form">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl text-[#251605]">Room Types & Rooms</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Status is calculated on the server. Building, wing and floor on a room type are
          preferences only.
        </p>
        <div
          className="mt-3 rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2 text-sm text-[#251605]"
          data-testid="pms-card2-readiness"
        >
          <p className="font-medium">
            {readiness?.ready
              ? "Ready"
              : readiness?.stepStatus === "in_progress"
                ? "In progress"
                : "Not started"}
          </p>
          {(readiness?.blockers ?? []).length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {readiness?.blockers.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">All Room Types & Rooms checks pass.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-[#251605]">Room type configuration</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setTypeForm(emptyType())}
          >
            New type
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {types.map((row) => (
            <Button
              key={row.id}
              type="button"
              size="sm"
              variant={typeForm.id === row.id ? "default" : "outline"}
              className={
                typeForm.id === row.id ? "bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90" : ""
              }
              onClick={() => setTypeForm(typeFromRow(row))}
            >
              {row.code}
            </Button>
          ))}
        </div>
        <PropertySetupFormGrid>
          <PropertySetupField label="Room Type Name">
            <Input
              disabled={disabled}
              value={typeForm.name}
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Room Type Code">
            <Input
              disabled={disabled}
              value={typeForm.code}
              onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Short Name">
            <Input
              disabled={disabled}
              value={typeForm.shortName}
              onChange={(e) => setTypeForm({ ...typeForm, shortName: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Display Name">
            <Input
              disabled={disabled}
              value={typeForm.displayName}
              onChange={(e) => setTypeForm({ ...typeForm, displayName: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Room Category">
            <Input
              disabled={disabled}
              value={typeForm.category}
              onChange={(e) => setTypeForm({ ...typeForm, category: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Room Class">
            <Input
              disabled={disabled}
              value={typeForm.class}
              onChange={(e) => setTypeForm({ ...typeForm, class: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Standard Occupancy">
            <Input
              type="number"
              disabled={disabled}
              value={typeForm.standardOccupancy}
              onChange={(e) =>
                setTypeForm({ ...typeForm, standardOccupancy: Number(e.target.value) })
              }
            />
          </PropertySetupField>
          <PropertySetupField label="Maximum Occupancy">
            <Input
              type="number"
              disabled={disabled}
              value={typeForm.maxOccupancy}
              onChange={(e) => setTypeForm({ ...typeForm, maxOccupancy: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Maximum Adults">
            <Input
              type="number"
              disabled={disabled}
              value={typeForm.adultCapacity}
              onChange={(e) => setTypeForm({ ...typeForm, adultCapacity: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Maximum Children">
            <Input
              type="number"
              disabled={disabled}
              value={typeForm.childCapacity}
              onChange={(e) => setTypeForm({ ...typeForm, childCapacity: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Maximum Infants">
            <Input
              type="number"
              disabled={disabled}
              value={typeForm.infantCapacity}
              onChange={(e) => setTypeForm({ ...typeForm, infantCapacity: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Room Size">
            <Input
              disabled={disabled}
              value={typeForm.roomSize}
              onChange={(e) => setTypeForm({ ...typeForm, roomSize: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="View Type">
            <Input
              disabled={disabled}
              value={typeForm.roomView}
              onChange={(e) => setTypeForm({ ...typeForm, roomView: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Smoking Policy">
            <Select
              value={typeForm.smokingPolicy}
              onValueChange={(value) =>
                setTypeForm({ ...typeForm, smokingPolicy: value as SmokingPolicy })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMOKING_POLICIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
          <PropertySetupField label="Default Building (preference)">
            <Select
              value={typeForm.defaultBuildingId || "__none"}
              onValueChange={(value) => {
                const next = cascadeLocationIds({
                  buildingId: value === "__none" ? "" : value,
                  wingId: typeForm.defaultWingId,
                  floorId: typeForm.preferredFloorId,
                  wings: structure.wings,
                  floors: structure.floors,
                  changed: "building",
                });
                setTypeForm({
                  ...typeForm,
                  defaultBuildingId: next.buildingId,
                  defaultWingId: next.wingId,
                  preferredFloorId: next.floorId,
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {structure.buildings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
          <PropertySetupField label="Default Wing (preference)">
            <Select
              value={typeForm.defaultWingId || "__none"}
              onValueChange={(value) => {
                const next = cascadeLocationIds({
                  buildingId: typeForm.defaultBuildingId,
                  wingId: value === "__none" ? "" : value,
                  floorId: typeForm.preferredFloorId,
                  wings: structure.wings,
                  floors: structure.floors,
                  changed: "wing",
                });
                setTypeForm({
                  ...typeForm,
                  defaultWingId: next.wingId,
                  preferredFloorId: next.floorId,
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {typeWings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
          <PropertySetupField label="Preferred Floor (preference)">
            <Select
              value={typeForm.preferredFloorId || "__none"}
              onValueChange={(value) =>
                setTypeForm({ ...typeForm, preferredFloorId: value === "__none" ? "" : value })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {typeFloors.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
        </PropertySetupFormGrid>
        <PropertySetupFormItem span={3}>
          <PropertySetupField label="Description">
            <Textarea
              disabled={disabled}
              value={typeForm.description}
              onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
            />
          </PropertySetupField>
        </PropertySetupFormItem>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle
            label="Sellable"
            checked={typeForm.sellable}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, sellable: value })}
          />
          <Toggle
            label="Active"
            checked={typeForm.active}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, active: value })}
          />
          <Toggle
            label="Extra Guest Allowed"
            checked={typeForm.extraGuestAllowed}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, extraGuestAllowed: value })}
          />
          <Toggle
            label="Extra Bed Allowed"
            checked={typeForm.extraBedAllowed}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, extraBedAllowed: value })}
          />
          <Toggle
            label="Connecting Room Eligible"
            checked={typeForm.connectingEligible}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, connectingEligible: value })}
          />
          <Toggle
            label="Accessible Room Eligible"
            checked={typeForm.accessibleEligible}
            disabled={disabled}
            onChange={(value) => setTypeForm({ ...typeForm, accessibleEligible: value })}
          />
        </div>

        <h4 className="mt-6 font-medium text-[#251605]">Bed configuration</h4>
        <p className="text-xs text-muted-foreground">
          Multiple rows per type. Empty rows are dropped. Invalid counts are rejected by the server.
        </p>
        <div className="mt-2 space-y-2">
          {typeForm.beds.map((bed, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_6rem_auto]">
              <Input
                disabled={disabled}
                placeholder="Bed type"
                value={bed.bedType}
                onChange={(e) => {
                  const beds = [...typeForm.beds];
                  beds[index] = { ...bed, bedType: e.target.value };
                  setTypeForm({ ...typeForm, beds });
                }}
              />
              <Input
                disabled={disabled}
                placeholder="Bed size"
                value={bed.bedSize}
                onChange={(e) => {
                  const beds = [...typeForm.beds];
                  beds[index] = { ...bed, bedSize: e.target.value };
                  setTypeForm({ ...typeForm, beds });
                }}
              />
              <Input
                type="number"
                disabled={disabled}
                min={1}
                value={bed.numberOfBeds}
                onChange={(e) => {
                  const beds = [...typeForm.beds];
                  beds[index] = { ...bed, numberOfBeds: Number(e.target.value) };
                  setTypeForm({ ...typeForm, beds });
                }}
              />
              <PropertySetupRemoveButton
                disabled={disabled || typeForm.beds.length < 2}
                label="Remove bed row"
                onClick={() =>
                  setTypeForm({ ...typeForm, beds: typeForm.beds.filter((_, i) => i !== index) })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              setTypeForm({
                ...typeForm,
                beds: [...typeForm.beds, { bedType: "", bedSize: "", numberOfBeds: 1 }],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add bed row
          </Button>
          <Button
            type="button"
            className="scroll-mb-32 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            disabled={disabled || saveTypeMutation.isPending}
            onClick={() => saveTypeMutation.mutate()}
          >
            Save room type
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-[#251605]">Existing rooms</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              setRoomForm({
                roomTypeId: types[0]?.id ?? "",
                roomNumber: "",
                roomCode: "",
                buildingId: structure.buildings[0]?.id ?? "",
                wingId: "",
                floorId: "",
                notes: "",
                status: "available",
                housekeepingStatus: "clean",
                maintenanceStatus: "normal",
                sellable: true,
                active: true,
                smoking: false,
                accessible: false,
                roomFeatures: [],
                links: [],
              })
            }
          >
            New room
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Number</th>
                <th>Code</th>
                <th>Type</th>
                <th>Ops</th>
                <th>HK</th>
                <th>Maint.</th>
                <th>Sellable</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-[#EDE6D8]"
                  onClick={() => setRoomForm(roomFromRow(row))}
                >
                  <td className="py-2">{row.roomNumber}</td>
                  <td>{row.roomCode}</td>
                  <td>{row.roomTypeCode}</td>
                  <td>{row.status}</td>
                  <td>{row.housekeepingStatus}</td>
                  <td>{row.maintenanceStatus}</td>
                  <td>{row.sellable ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {roomForm ? (
          <PropertySetupFormGrid>
            <PropertySetupField label="Room Number">
              <Input
                disabled={disabled}
                value={roomForm.roomNumber}
                onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
              />
            </PropertySetupField>
            <PropertySetupField label="Room Code">
              <Input
                disabled={disabled}
                value={roomForm.roomCode}
                onChange={(e) => setRoomForm({ ...roomForm, roomCode: e.target.value })}
                placeholder="Defaults to room number"
              />
            </PropertySetupField>
            <PropertySetupField label="Room Type">
              <Select
                value={roomForm.roomTypeId}
                onValueChange={(value) => setRoomForm({ ...roomForm, roomTypeId: value })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name} ({row.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Building">
              <Select
                value={roomForm.buildingId || "__none"}
                onValueChange={(value) => {
                  const next = cascadeLocationIds({
                    buildingId: value === "__none" ? "" : value,
                    wingId: roomForm.wingId,
                    floorId: roomForm.floorId,
                    wings: structure.wings,
                    floors: structure.floors,
                    changed: "building",
                  });
                  setRoomForm({
                    ...roomForm,
                    buildingId: next.buildingId,
                    wingId: next.wingId,
                    floorId: next.floorId,
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select building" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {structure.buildings.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Wing">
              <Select
                value={roomForm.wingId || "__none"}
                onValueChange={(value) => {
                  const next = cascadeLocationIds({
                    buildingId: roomForm.buildingId,
                    wingId: value === "__none" ? "" : value,
                    floorId: roomForm.floorId,
                    wings: structure.wings,
                    floors: structure.floors,
                    changed: "wing",
                  });
                  setRoomForm({ ...roomForm, wingId: next.wingId, floorId: next.floorId });
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {roomWings.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Floor">
              <Select
                value={roomForm.floorId || "__none"}
                onValueChange={(value) =>
                  setRoomForm({ ...roomForm, floorId: value === "__none" ? "" : value })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {roomFloors.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Operational Status">
              <Select
                value={roomForm.status}
                onValueChange={(value) => setRoomForm({ ...roomForm, status: value as RoomStatus })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Housekeeping Status">
              <Select
                value={roomForm.housekeepingStatus}
                onValueChange={(value) =>
                  setRoomForm({ ...roomForm, housekeepingStatus: value as HkStatus })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HK_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Maintenance Status">
              <Select
                value={roomForm.maintenanceStatus}
                onValueChange={(value) =>
                  setRoomForm({ ...roomForm, maintenanceStatus: value as MaintenanceStatus })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
            <PropertySetupField label="Room Notes" className="md:col-span-2">
              <Textarea
                disabled={disabled}
                value={roomForm.notes}
                onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
              />
            </PropertySetupField>
            <Toggle
              label="Sellable"
              checked={roomForm.sellable}
              disabled={disabled}
              onChange={(value) => setRoomForm({ ...roomForm, sellable: value })}
            />
            <Toggle
              label="Active"
              checked={roomForm.active}
              disabled={disabled}
              onChange={(value) => setRoomForm({ ...roomForm, active: value })}
            />
            <PropertySetupField label="Room features (not amenities)" className="md:col-span-2">
              <div className="flex flex-wrap gap-2">
                {roomForm.roomFeatures.map((feature) => (
                  <Button
                    key={feature}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      setRoomForm({
                        ...roomForm,
                        roomFeatures: roomForm.roomFeatures.filter((row) => row !== feature),
                      })
                    }
                  >
                    {feature} ×
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  disabled={disabled}
                  value={featureDraft}
                  onChange={(e) => setFeatureDraft(e.target.value)}
                  placeholder="Add feature"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || !featureDraft.trim()}
                  onClick={() => {
                    setRoomForm({
                      ...roomForm,
                      roomFeatures: [...roomForm.roomFeatures, featureDraft.trim()],
                    });
                    setFeatureDraft("");
                  }}
                >
                  Add
                </Button>
              </div>
            </PropertySetupField>
            <PropertySetupField label="Connecting / adjacent rooms" className="md:col-span-2">
              {roomForm.links.map((link, index) => (
                <div
                  key={`${link.otherRoomId}-${index}`}
                  className="mb-2 grid gap-2 md:grid-cols-[1fr_10rem_auto]"
                >
                  <Select
                    value={link.otherRoomId}
                    onValueChange={(value) => {
                      const links = [...roomForm.links];
                      links[index] = { ...link, otherRoomId: value };
                      setRoomForm({ ...roomForm, links });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms
                        .filter((row) => row.id !== roomForm.id)
                        .map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.roomNumber}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={link.kind}
                    onValueChange={(value) => {
                      const links = [...roomForm.links];
                      links[index] = { ...link, kind: value as RoomLinkKind };
                      setRoomForm({ ...roomForm, links });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_LINK_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <PropertySetupRemoveButton
                    disabled={disabled}
                    label="Remove room link"
                    onClick={() =>
                      setRoomForm({
                        ...roomForm,
                        links: roomForm.links.filter((_, i) => i !== index),
                      })
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  setRoomForm({
                    ...roomForm,
                    links: [
                      ...roomForm.links,
                      {
                        otherRoomId: rooms.find((row) => row.id !== roomForm.id)?.id ?? "",
                        kind: "connecting",
                      },
                    ],
                  })
                }
              >
                Add link
              </Button>
            </PropertySetupField>
            <div className="md:col-span-2">
              <Button
                type="button"
                className="scroll-mb-32 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={disabled || saveRoomMutation.isPending}
                onClick={() => saveRoomMutation.mutate()}
              >
                Save room
              </Button>
            </div>
          </PropertySetupFormGrid>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Bulk room generation</h3>
        <p className="text-xs text-muted-foreground">
          Sequential numbering only. The server revalidates the batch in one insert.
        </p>
        <PropertySetupFormGrid>
          <PropertySetupField label="Target room type">
            <Select
              value={bulk.roomTypeId}
              onValueChange={(value) => setBulk({ ...bulk, roomTypeId: value })}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
          <PropertySetupField label="Building">
            <Select
              value={bulk.buildingId}
              onValueChange={(value) => {
                const next = cascadeLocationIds({
                  buildingId: value,
                  wingId: bulk.wingId,
                  floorId: bulk.floorId,
                  wings: structure.wings,
                  floors: structure.floors,
                  changed: "building",
                });
                setBulk({
                  ...bulk,
                  buildingId: next.buildingId,
                  wingId: next.wingId,
                  floorId: next.floorId,
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select building" />
              </SelectTrigger>
              <SelectContent>
                {structure.buildings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertySetupField>
          <PropertySetupField label="Starting number">
            <Input
              type="number"
              disabled={disabled}
              value={bulk.startNumber}
              onChange={(e) => setBulk({ ...bulk, startNumber: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Ending number">
            <Input
              type="number"
              disabled={disabled}
              value={bulk.endNumber}
              onChange={(e) => setBulk({ ...bulk, endNumber: Number(e.target.value) })}
            />
          </PropertySetupField>
          <PropertySetupField label="Quantity (optional, instead of end)">
            <Input
              disabled={disabled}
              value={bulk.quantity}
              onChange={(e) => setBulk({ ...bulk, quantity: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Prefix">
            <Input
              disabled={disabled}
              value={bulk.prefix}
              onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })}
            />
          </PropertySetupField>
          <PropertySetupField label="Suffix">
            <Input
              disabled={disabled}
              value={bulk.suffix}
              onChange={(e) => setBulk({ ...bulk, suffix: e.target.value })}
            />
          </PropertySetupField>
        </PropertySetupFormGrid>
        <p className="mt-3 text-sm text-[#251605]" data-testid="pms-card2-bulk-preview">
          Preview:{" "}
          {preview.ok
            ? preview.labels.map((row) => row.roomNumber).join(", ")
            : preview.validationErrors.join(" ")}
        </p>
        <Button
          type="button"
          className="mt-3 scroll-mb-32 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          disabled={disabled || bulkMutation.isPending || !preview.ok}
          onClick={() => bulkMutation.mutate()}
        >
          Create rooms
        </Button>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-[#EDE6D8] px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
