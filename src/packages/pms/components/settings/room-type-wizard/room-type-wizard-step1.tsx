import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Plus, X } from "lucide-react";

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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  PropertySetupField,
  PropertySetupFormGrid,
  PropertySetupRemoveButton,
} from "@/packages/pms/components/settings/setup-kit";
import {
  addCustomRoomCategory,
  addCustomRoomClass,
  bulkCreateRooms,
  checkRoomNumberAvailable,
  checkRoomTypeCodeAvailable,
  listRoomClassifications,
  listRooms,
  saveRoom,
  saveRoomType,
} from "@/packages/pms/lib/rooms.functions";
import {
  PREDEFINED_ROOM_CATEGORIES,
  PREDEFINED_ROOM_CLASSES,
} from "@/packages/pms/lib/rooms-classification";
import { SMOKING_POLICIES } from "@/packages/pms/lib/rooms.server";
import { getPmsSet2Snapshot } from "@/packages/pms/lib/pms-set2-structure.functions";
import { emptySet2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import {
  cascadeLocationIds,
  floorsForBuildingAndWing,
  sequentialRoomLabels,
  wingsForBuilding,
} from "@/packages/pms/lib/rooms-card2.server";
import { suggestRoomTypeCode } from "@/packages/pms/lib/rooms-card2-code";
import {
  bulkPreviewBlocksCreate,
  classifyBulkRoomPreview,
} from "@/packages/pms/lib/rooms-card2-preview";
import { parseOptionalMoney, type StagedRoom } from "./room-type-wizard-types";
import { useRoomTypeWizard } from "./room-type-wizard";

function ClassificationSelect({
  label,
  value,
  options,
  disabled,
  placeholder,
  onValueChange,
  onAddNew,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  placeholder: string;
  onValueChange: (value: string) => void;
  onAddNew: () => void;
}) {
  return (
    <PropertySetupField label={label}>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value="__add_new__">+ Add new…</SelectItem>
        </SelectContent>
      </Select>
      {value === "__add_new__" ? null : null}
      <button
        type="button"
        className="mt-1 text-xs text-muted-foreground underline"
        disabled={disabled}
        onClick={onAddNew}
      >
        Add custom {label.toLowerCase()}
      </button>
    </PropertySetupField>
  );
}

export function RoomTypeWizardStep1() {
  const {
    restaurantId,
    canEdit,
    typeForm,
    setTypeForm,
    codeManuallyEdited,
    setCodeManuallyEdited,
    roomTypeId,
    setRoomTypeId,
    stagedRooms,
    setStagedRooms,
    setStep,
  } = useRoomTypeWizard();

  const queryClient = useQueryClient();
  const disabled = !canEdit;
  const saveTypeFn = useServerFn(saveRoomType);
  const saveRoomFn = useServerFn(saveRoom);
  const bulkFn = useServerFn(bulkCreateRooms);
  const checkCodeFn = useServerFn(checkRoomTypeCodeAvailable);
  const checkNumberFn = useServerFn(checkRoomNumberAvailable);
  const fetchRooms = useServerFn(listRooms);
  const fetchStructure = useServerFn(getPmsSet2Snapshot);
  const fetchClassifications = useServerFn(listRoomClassifications);
  const addCategoryFn = useServerFn(addCustomRoomCategory);
  const addClassFn = useServerFn(addCustomRoomClass);

  const [roomMode, setRoomMode] = useState<"single" | "bulk" | null>(null);
  const [single, setSingle] = useState({
    roomNumber: "",
    roomCode: "",
    buildingId: "",
    wingId: "",
    floorId: "",
    notes: "",
    sellable: true,
    active: true,
    smoking: false,
    accessible: false,
    roomFeatures: [] as string[],
    featureDraft: "",
  });
  const [numberCheck, setNumberCheck] = useState<{
    available: boolean;
    message: string;
  } | null>(null);
  const [codeCheck, setCodeCheck] = useState<{
    available: boolean;
    message: string;
  } | null>(null);
  const [bulk, setBulk] = useState({
    buildingId: "",
    wingId: "",
    floorId: "",
    startNumber: 101,
    endNumber: 120,
    quantity: "",
    prefix: "",
    suffix: "",
  });
  const [excludedNumbers, setExcludedNumbers] = useState<string[]>([]);
  const [savingContinue, setSavingContinue] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [customName, setCustomName] = useState("");

  const structureQuery = useQuery({
    queryKey: ["pms-card2-structure", restaurantId],
    queryFn: () => fetchStructure({ data: { restaurantId } }),
  });
  const classificationsQuery = useQuery({
    queryKey: ["pms-card2-classifications", restaurantId],
    queryFn: () => fetchClassifications({ data: { restaurantId } }),
  });
  const allRoomsQuery = useQuery({
    queryKey: ["pms-card2-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });

  const structure = structureQuery.data?.snapshot ?? emptySet2Snapshot();
  const allRooms = allRoomsQuery.data ?? [];

  useEffect(() => {
    if (!typeForm.code.trim()) {
      setCodeCheck(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void checkCodeFn({
        data: {
          restaurantId,
          code: typeForm.code,
          ...(roomTypeId ? { excludeId: roomTypeId } : {}),
        },
      }).then((res) => {
        if (res.available) {
          setCodeCheck({ available: true, message: "Code available" });
        } else {
          setCodeCheck({
            available: false,
            message: `${res.code} already exists. Used by: ${res.usedBy?.name ?? res.usedBy?.code}`,
          });
        }
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [typeForm.code, restaurantId, roomTypeId, checkCodeFn]);

  useEffect(() => {
    const number = single.roomNumber.trim();
    if (!number || roomMode !== "single") {
      setNumberCheck(null);
      return;
    }
    const stagedHit = stagedRooms.find(
      (r) => r.roomNumber.trim().toLowerCase() === number.toLowerCase(),
    );
    if (stagedHit) {
      setNumberCheck({
        available: false,
        message: `Room ${number} is already in this wizard list.`,
      });
      return;
    }
    const handle = window.setTimeout(() => {
      void checkNumberFn({
        data: { restaurantId, roomNumber: number },
      }).then((res) => {
        if (res.available) {
          setNumberCheck({ available: true, message: "Room number available" });
        } else {
          const where = [
            res.usedBy?.roomTypeName,
            res.usedBy?.building,
            res.usedBy?.floor ? `Floor ${res.usedBy.floor}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          setNumberCheck({
            available: false,
            message: where
              ? `Room ${number} already exists. ${where}`
              : `Room ${number} already exists.`,
          });
        }
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [single.roomNumber, roomMode, stagedRooms, restaurantId, checkNumberFn]);

  const typeWings = wingsForBuilding(structure.wings, structure.floors, typeForm.defaultBuildingId);
  const typeFloors = floorsForBuildingAndWing(
    structure.floors,
    structure.wings,
    typeForm.defaultBuildingId,
    typeForm.defaultWingId,
  );
  const roomWings = wingsForBuilding(structure.wings, structure.floors, single.buildingId);
  const roomFloors = floorsForBuildingAndWing(
    structure.floors,
    structure.wings,
    single.buildingId,
    single.wingId,
  );
  const bulkWings = wingsForBuilding(structure.wings, structure.floors, bulk.buildingId);
  const bulkFloors = floorsForBuildingAndWing(
    structure.floors,
    structure.wings,
    bulk.buildingId,
    bulk.wingId,
  );

  const bulkLabels = useMemo(
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

  const bulkPreview = useMemo(() => {
    if (!bulkLabels.ok) return null;
    return classifyBulkRoomPreview({
      labels: bulkLabels.labels,
      existing: allRooms.map((r) => ({
        roomNumber: r.roomNumber,
        roomCode: r.roomCode,
        roomTypeName: r.roomTypeName,
        building: r.building,
        floor: r.floor,
      })),
      excludedNumbers,
    });
  }, [bulkLabels, allRooms, excludedNumbers]);

  async function persistType(): Promise<string | null> {
    if (!typeForm.name.trim() || !typeForm.code.trim()) {
      toast.error("Enter a room type name and code.");
      return null;
    }
    if (codeCheck && !codeCheck.available) {
      toast.error(codeCheck.message);
      return null;
    }
    const result = await saveTypeFn({
      data: {
        restaurantId,
        ...(roomTypeId ? { id: roomTypeId } : {}),
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
        baseNightlyRate: parseOptionalMoney(typeForm.baseNightlyRate),
        extraAdultRateDefault: parseOptionalMoney(typeForm.extraAdultRateDefault),
        extraChildRateDefault: parseOptionalMoney(typeForm.extraChildRateDefault),
      },
    });
    if (!result.ok) {
      toast.error(result.message);
      return null;
    }
    setRoomTypeId(result.id);
    setTypeForm((prev) => ({ ...prev, id: result.id }));
    return result.id;
  }

  const addSingleMutation = useMutation({
    mutationFn: async () => {
      const typeId = roomTypeId ?? (await persistType());
      if (!typeId) return { ok: false as const, message: "Save the room type first." };
      if (!single.buildingId) return { ok: false as const, message: "Choose a building." };
      if (!single.roomNumber.trim()) return { ok: false as const, message: "Enter a room number." };
      if (numberCheck && !numberCheck.available) {
        return { ok: false as const, message: numberCheck.message };
      }
      const building = structure.buildings.find((b) => b.id === single.buildingId);
      const wing = structure.wings.find((w) => w.id === single.wingId);
      const floor = structure.floors.find((f) => f.id === single.floorId);
      const staged: StagedRoom = {
        localKey: `staged-${Date.now()}-${single.roomNumber}`,
        roomNumber: single.roomNumber.trim(),
        roomCode: (single.roomCode.trim() || single.roomNumber.trim()),
        buildingId: single.buildingId,
        buildingName: building?.name ?? "",
        wingId: single.wingId,
        wingName: wing?.name ?? "",
        floorId: single.floorId,
        floorName: floor?.name ?? "",
        notes: single.notes,
        sellable: single.sellable,
        active: single.active,
        smoking: single.smoking,
        accessible: single.accessible,
        roomFeatures: single.roomFeatures,
        persisted: false,
      };
      const saved = await saveRoomFn({
        data: {
          restaurantId,
          roomTypeId: typeId,
          roomNumber: staged.roomNumber,
          roomCode: staged.roomCode,
          buildingId: staged.buildingId,
          wingId: staged.wingId || null,
          floorId: staged.floorId || null,
          smoking: staged.smoking,
          accessible: staged.accessible,
          status: "available",
          sellable: staged.sellable,
          roomFeatures: staged.roomFeatures,
          active: staged.active,
          notes: staged.notes.trim() || null,
        },
      });
      if (!saved.ok) return saved;
      return { ok: true as const, staged: { ...staged, id: saved.id, persisted: true } };
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if ("staged" in result && result.staged) {
        setStagedRooms((prev) => [...prev, result.staged]);
        setSingle((prev) => ({
          ...prev,
          roomNumber: "",
          roomCode: "",
          notes: "",
          roomFeatures: [],
          featureDraft: "",
        }));
        setNumberCheck(null);
        toast.success("Room added");
        void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
        void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
      }
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const typeId = roomTypeId ?? (await persistType());
      if (!typeId) return { success: false as const, message: "Save the room type first." };
      if (!bulk.buildingId) return { success: false as const, message: "Choose a building." };
      if (!bulkPreview || bulkPreviewBlocksCreate(bulkPreview.summary)) {
        return { success: false as const, message: "Resolve conflicts before creating rooms." };
      }
      const result = await bulkFn({
        data: {
          restaurantId,
          roomTypeId: typeId,
          buildingId: bulk.buildingId,
          wingId: bulk.wingId || null,
          floorId: bulk.floorId || null,
          startNumber: bulk.startNumber,
          endNumber: bulk.quantity.trim() ? null : bulk.endNumber,
          quantity: bulk.quantity.trim() ? Number(bulk.quantity) : null,
          prefix: bulk.prefix || null,
          suffix: bulk.suffix || null,
          excludeNumbers,
        },
      });
      return result;
    },
    onSuccess: async (result) => {
      if (!("success" in result) || !result.success) {
        const message =
          "message" in result && typeof result.message === "string"
            ? result.message
            : [
                ...("validationErrors" in result ? result.validationErrors : []),
                "conflicts" in result && result.conflicts.roomNumbers.length
                  ? `Numbers in use: ${result.conflicts.roomNumbers.join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ") || "Could not create rooms.";
        toast.error(message);
        return;
      }
      toast.success(`Created ${result.createdCount} rooms`);
      setExcludedNumbers([]);
      setRoomMode(null);
      const refreshed = await fetchRooms({ data: { restaurantId, includeInactive: true } });
      const typeId = roomTypeId ?? typeForm.id;
      setStagedRooms(
        refreshed
          .filter((r) => r.roomTypeId === typeId)
          .map((room) => ({
            localKey: room.id,
            id: room.id,
            roomNumber: room.roomNumber,
            roomCode: room.roomCode ?? room.roomNumber,
            buildingId: room.buildingId ?? "",
            buildingName: room.building ?? "",
            wingId: room.wingId ?? "",
            wingName: room.wing ?? "",
            floorId: room.floorId ?? "",
            floorName: room.floor ?? "",
            notes: room.notes ?? "",
            sellable: room.sellable,
            active: room.active,
            smoking: room.smoking,
            accessible: room.accessible,
            roomFeatures: room.roomFeatures ?? [],
            persisted: true,
          })),
      );
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
    },
  });

  async function continueToAmenities() {
    setSavingContinue(true);
    try {
      const typeId = roomTypeId ?? (await persistType());
      if (!typeId) return;
      toast.success("Room type saved");
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types-ready", restaurantId] });
      setStep(2);
    } finally {
      setSavingContinue(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Room Type Configuration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity, capacity, beds, and sell options for this type.
        </p>

        <div className="mt-4 space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Room Type Identity
          </p>
          <PropertySetupFormGrid>
            <PropertySetupField label="Room Type Name *">
              <Input
                disabled={disabled}
                value={typeForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setTypeForm((prev) => ({
                    ...prev,
                    name,
                    code: codeManuallyEdited ? prev.code : suggestRoomTypeCode(name),
                  }));
                }}
              />
            </PropertySetupField>
            <PropertySetupField label="Room Type Code *">
              <Input
                disabled={disabled}
                value={typeForm.code}
                onChange={(e) => {
                  setCodeManuallyEdited(true);
                  setTypeForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }));
                }}
              />
              {codeCheck ? (
                <p
                  className={`mt-1 text-xs ${codeCheck.available ? "text-green-700" : "text-red-600"}`}
                  data-testid="wizard-code-check"
                >
                  {codeCheck.available ? `✓ ${codeCheck.message}` : `✕ ${codeCheck.message}`}
                </p>
              ) : null}
            </PropertySetupField>
            <ClassificationSelect
              label="Room Category *"
              value={typeForm.category}
              options={classificationsQuery.data?.categories ?? PREDEFINED_ROOM_CATEGORIES}
              disabled={disabled}
              placeholder="Select category"
              onValueChange={(val) => setTypeForm((prev) => ({ ...prev, category: val }))}
              onAddNew={() => {
                setCustomName("");
                setAddCategoryOpen(true);
              }}
            />
          </PropertySetupFormGrid>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Capacity
          </p>
          <PropertySetupFormGrid>
            <PropertySetupField label="Maximum Occupancy *">
              <Input
                type="number"
                disabled={disabled}
                value={typeForm.maxOccupancy}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    maxOccupancy: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>
            <PropertySetupField label="Maximum Adults *">
              <Input
                type="number"
                disabled={disabled}
                value={typeForm.adultCapacity}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    adultCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>
            <PropertySetupField label="Maximum Children">
              <Input
                type="number"
                disabled={disabled}
                value={typeForm.childCapacity}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    childCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>
            <PropertySetupField label="Maximum Infants">
              <Input
                type="number"
                disabled={disabled}
                value={typeForm.infantCapacity}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    infantCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>
          </PropertySetupFormGrid>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bed Configuration
          </p>
          <div className="space-y-2">
            {typeForm.beds.map((bed, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
                <Input
                  disabled={disabled}
                  placeholder="Bed type"
                  value={bed.bedType}
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, bedType: e.target.value };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
                <Input
                  disabled={disabled}
                  placeholder="Bed size"
                  value={bed.bedSize}
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, bedSize: e.target.value };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
                <Input
                  type="number"
                  disabled={disabled}
                  value={bed.numberOfBeds}
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, numberOfBeds: Number(e.target.value) || 1 };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
                <PropertySetupRemoveButton
                  disabled={disabled || typeForm.beds.length <= 1}
                  onClick={() =>
                    setTypeForm((prev) => ({
                      ...prev,
                      beds: prev.beds.filter((_, i) => i !== index),
                    }))
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
                setTypeForm((prev) => ({
                  ...prev,
                  beds: [...prev.beds, { bedType: "", bedSize: "", numberOfBeds: 1 }],
                }))
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add another bed
            </Button>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Room Details
          </p>
          <PropertySetupFormGrid>
            <PropertySetupField label="Room Size">
              <Input
                disabled={disabled}
                value={typeForm.roomSize}
                onChange={(e) => setTypeForm((prev) => ({ ...prev, roomSize: e.target.value }))}
              />
            </PropertySetupField>
            <PropertySetupField label="View Type">
              <Input
                disabled={disabled}
                value={typeForm.roomView}
                onChange={(e) => setTypeForm((prev) => ({ ...prev, roomView: e.target.value }))}
              />
            </PropertySetupField>
          </PropertySetupFormGrid>
          <PropertySetupField label="Description">
            <Textarea
              disabled={disabled}
              value={typeForm.description}
              onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </PropertySetupField>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={typeForm.active}
                disabled={disabled}
                onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, active: v }))}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={typeForm.sellable}
                disabled={disabled}
                onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, sellable: v }))}
              />
              Sellable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={typeForm.extraGuestAllowed}
                disabled={disabled}
                onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraGuestAllowed: v }))}
              />
              Extra Guest Allowed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={typeForm.extraBedAllowed}
                disabled={disabled}
                onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraBedAllowed: v }))}
              />
              Extra Bed Allowed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={typeForm.connectingEligible}
                disabled={disabled}
                onCheckedChange={(v) =>
                  setTypeForm((prev) => ({ ...prev, connectingEligible: v }))
                }
              />
              Connecting Room Eligible
            </label>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-[#251605]">
              Advanced Room Type Options
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <PropertySetupFormGrid>
                <PropertySetupField label="Display Name">
                  <Input
                    disabled={disabled}
                    value={typeForm.displayName}
                    onChange={(e) =>
                      setTypeForm((prev) => ({ ...prev, displayName: e.target.value }))
                    }
                  />
                </PropertySetupField>
                <ClassificationSelect
                  label="Room Class"
                  value={typeForm.class}
                  options={classificationsQuery.data?.classes ?? PREDEFINED_ROOM_CLASSES}
                  disabled={disabled}
                  placeholder="Select class"
                  onValueChange={(val) => setTypeForm((prev) => ({ ...prev, class: val }))}
                  onAddNew={() => {
                    setCustomName("");
                    setAddClassOpen(true);
                  }}
                />
                <PropertySetupField label="Included Occupancy">
                  <Input
                    type="number"
                    disabled={disabled}
                    value={typeForm.standardOccupancy}
                    onChange={(e) =>
                      setTypeForm((prev) => ({
                        ...prev,
                        standardOccupancy: Number(e.target.value) || 0,
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guests included in the Rate Plan base before extra-person surcharge. Not the
                    hard capacity.
                  </p>
                </PropertySetupField>
                <PropertySetupField label="Smoking Policy">
                  <Select
                    value={typeForm.smokingPolicy}
                    disabled={disabled}
                    onValueChange={(v) =>
                      setTypeForm((prev) => ({
                        ...prev,
                        smokingPolicy: v as (typeof SMOKING_POLICIES)[number],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SMOKING_POLICIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>
                <PropertySetupField label="Default Building">
                  <Select
                    value={typeForm.defaultBuildingId || "__none"}
                    disabled={disabled}
                    onValueChange={(v) => {
                      const next = cascadeLocationIds({
                        buildingId: v === "__none" ? "" : v,
                        wingId: typeForm.defaultWingId,
                        floorId: typeForm.preferredFloorId,
                        wings: structure.wings,
                        floors: structure.floors,
                        changed: "building",
                      });
                      setTypeForm((prev) => ({
                        ...prev,
                        defaultBuildingId: next.buildingId ?? "",
                        defaultWingId: next.wingId ?? "",
                        preferredFloorId: next.floorId ?? "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Preference only" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {structure.buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>
                <PropertySetupField label="Default Wing">
                  <Select
                    value={typeForm.defaultWingId || "__none"}
                    disabled={disabled}
                    onValueChange={(v) => {
                      const next = cascadeLocationIds({
                        buildingId: typeForm.defaultBuildingId,
                        wingId: v === "__none" ? "" : v,
                        floorId: typeForm.preferredFloorId,
                        wings: structure.wings,
                        floors: structure.floors,
                        changed: "wing",
                      });
                      setTypeForm((prev) => ({
                        ...prev,
                        defaultWingId: next.wingId ?? "",
                        preferredFloorId: next.floorId ?? "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Preference only" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {typeWings.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>
                <PropertySetupField label="Preferred Floor">
                  <Select
                    value={typeForm.preferredFloorId || "__none"}
                    disabled={disabled}
                    onValueChange={(v) =>
                      setTypeForm((prev) => ({
                        ...prev,
                        preferredFloorId: v === "__none" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Preference only" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {typeFloors.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>
              </PropertySetupFormGrid>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={typeForm.accessibleEligible}
                  disabled={disabled}
                  onCheckedChange={(v) =>
                    setTypeForm((prev) => ({ ...prev, accessibleEligible: v }))
                  }
                />
                Accessible Room Eligible
              </label>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Physical Rooms</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Rooms created here automatically belong to{" "}
          <span className="font-medium text-[#251605]">
            {typeForm.name.trim() || "this room type"}
            {typeForm.code ? ` · ${typeForm.code}` : ""}
          </span>
          . No room type reselection.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={roomMode === "single" ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => setRoomMode(roomMode === "single" ? null : "single")}
          >
            Single Room
          </Button>
          <Button
            type="button"
            variant={roomMode === "bulk" ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => setRoomMode(roomMode === "bulk" ? null : "bulk")}
          >
            Bulk Generation
          </Button>
        </div>

        {roomMode === "single" ? (
          <div className="mt-4 space-y-3 rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4">
            <PropertySetupFormGrid>
              <PropertySetupField label="Building *">
                <Select
                  value={single.buildingId || undefined}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const next = cascadeLocationIds({
                      buildingId: v,
                      wingId: single.wingId,
                      floorId: single.floorId,
                      wings: structure.wings,
                      floors: structure.floors,
                      changed: "building",
                    });
                    setSingle((prev) => ({
                      ...prev,
                      buildingId: next.buildingId ?? "",
                      wingId: next.wingId ?? "",
                      floorId: next.floorId ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select building" />
                  </SelectTrigger>
                  <SelectContent>
                    {structure.buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Floor">
                <Select
                  value={single.floorId || "__none"}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setSingle((prev) => ({ ...prev, floorId: v === "__none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {roomFloors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Wing">
                <Select
                  value={single.wingId || "__none"}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const next = cascadeLocationIds({
                      buildingId: single.buildingId,
                      wingId: v === "__none" ? "" : v,
                      floorId: single.floorId,
                      wings: structure.wings,
                      floors: structure.floors,
                      changed: "wing",
                    });
                    setSingle((prev) => ({
                      ...prev,
                      wingId: next.wingId ?? "",
                      floorId: next.floorId ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {roomWings.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Room Number *">
                <Input
                  disabled={disabled}
                  value={single.roomNumber}
                  onChange={(e) =>
                    setSingle((prev) => ({
                      ...prev,
                      roomNumber: e.target.value,
                      roomCode: prev.roomCode || e.target.value,
                    }))
                  }
                />
                {numberCheck ? (
                  <p
                    className={`mt-1 text-xs ${numberCheck.available ? "text-green-700" : "text-red-600"}`}
                  >
                    {numberCheck.available ? `✓ ${numberCheck.message}` : `✕ ${numberCheck.message}`}
                  </p>
                ) : null}
              </PropertySetupField>
            </PropertySetupFormGrid>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={single.active}
                  disabled={disabled}
                  onCheckedChange={(v) => setSingle((prev) => ({ ...prev, active: v }))}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={single.sellable}
                  disabled={disabled}
                  onCheckedChange={(v) => setSingle((prev) => ({ ...prev, sellable: v }))}
                />
                Sellable
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Operational status defaults to Available. Change it later in Inventory workflows.
            </p>
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                Advanced Room Options
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <PropertySetupFormGrid>
                  <PropertySetupField label="Room Code">
                    <Input
                      disabled={disabled}
                      value={single.roomCode}
                      placeholder="Defaults to room number"
                      onChange={(e) => setSingle((prev) => ({ ...prev, roomCode: e.target.value }))}
                    />
                  </PropertySetupField>
                  <PropertySetupField label="Room Notes">
                    <Input
                      disabled={disabled}
                      value={single.notes}
                      onChange={(e) => setSingle((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </PropertySetupField>
                </PropertySetupFormGrid>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={single.smoking}
                      disabled={disabled}
                      onCheckedChange={(v) => setSingle((prev) => ({ ...prev, smoking: v }))}
                    />
                    Smoking
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={single.accessible}
                      disabled={disabled}
                      onCheckedChange={(v) => setSingle((prev) => ({ ...prev, accessible: v }))}
                    />
                    Accessible
                  </label>
                </div>
                <PropertySetupField label="Room Features">
                  <div className="flex gap-2">
                    <Input
                      disabled={disabled}
                      value={single.featureDraft}
                      onChange={(e) =>
                        setSingle((prev) => ({ ...prev, featureDraft: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const tag = single.featureDraft.trim();
                        if (!tag) return;
                        setSingle((prev) => ({
                          ...prev,
                          roomFeatures: [...prev.roomFeatures, tag],
                          featureDraft: "",
                        }));
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        const tag = single.featureDraft.trim();
                        if (!tag) return;
                        setSingle((prev) => ({
                          ...prev,
                          roomFeatures: [...prev.roomFeatures, tag],
                          featureDraft: "",
                        }));
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {single.roomFeatures.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs border"
                      >
                        {tag}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            setSingle((prev) => ({
                              ...prev,
                              roomFeatures: prev.roomFeatures.filter((t) => t !== tag),
                            }))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </PropertySetupField>
              </CollapsibleContent>
            </Collapsible>
            <Button
              type="button"
              disabled={
                disabled ||
                addSingleMutation.isPending ||
                !single.buildingId ||
                !single.roomNumber.trim() ||
                Boolean(numberCheck && !numberCheck.available)
              }
              onClick={() => addSingleMutation.mutate()}
            >
              Add Room
            </Button>
          </div>
        ) : null}

        {roomMode === "bulk" ? (
          <div className="mt-4 space-y-3 rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4">
            <PropertySetupFormGrid>
              <PropertySetupField label="Building *">
                <Select
                  value={bulk.buildingId || undefined}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const next = cascadeLocationIds({
                      buildingId: v,
                      wingId: bulk.wingId,
                      floorId: bulk.floorId,
                      wings: structure.wings,
                      floors: structure.floors,
                      changed: "building",
                    });
                    setBulk((prev) => ({
                      ...prev,
                      buildingId: next.buildingId ?? "",
                      wingId: next.wingId ?? "",
                      floorId: next.floorId ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select building" />
                  </SelectTrigger>
                  <SelectContent>
                    {structure.buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Floor">
                <Select
                  value={bulk.floorId || "__none"}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setBulk((prev) => ({ ...prev, floorId: v === "__none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {bulkFloors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Wing">
                <Select
                  value={bulk.wingId || "__none"}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const next = cascadeLocationIds({
                      buildingId: bulk.buildingId,
                      wingId: v === "__none" ? "" : v,
                      floorId: bulk.floorId,
                      wings: structure.wings,
                      floors: structure.floors,
                      changed: "wing",
                    });
                    setBulk((prev) => ({
                      ...prev,
                      wingId: next.wingId ?? "",
                      floorId: next.floorId ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {bulkWings.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropertySetupField>
              <PropertySetupField label="Starting Room Number *">
                <Input
                  type="number"
                  disabled={disabled}
                  value={bulk.startNumber}
                  onChange={(e) =>
                    setBulk((prev) => ({ ...prev, startNumber: Number(e.target.value) || 0 }))
                  }
                />
              </PropertySetupField>
              <PropertySetupField label="Ending Room Number *">
                <Input
                  type="number"
                  disabled={disabled}
                  value={bulk.endNumber}
                  onChange={(e) =>
                    setBulk((prev) => ({
                      ...prev,
                      endNumber: Number(e.target.value) || 0,
                      quantity: "",
                    }))
                  }
                />
              </PropertySetupField>
            </PropertySetupFormGrid>
            {bulkLabels.ok ? (
              <p className="text-sm text-[#251605]">
                {bulkLabels.labels.length} rooms will be created
              </p>
            ) : (
              <p className="text-sm text-red-600">{bulkLabels.validationErrors[0]}</p>
            )}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                Advanced Bulk Options
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <PropertySetupFormGrid>
                  <PropertySetupField label="Quantity (optional)">
                    <Input
                      disabled={disabled}
                      value={bulk.quantity}
                      placeholder="Overrides end number when set"
                      onChange={(e) => setBulk((prev) => ({ ...prev, quantity: e.target.value }))}
                    />
                  </PropertySetupField>
                  <PropertySetupField label="Prefix">
                    <Input
                      disabled={disabled}
                      value={bulk.prefix}
                      onChange={(e) => setBulk((prev) => ({ ...prev, prefix: e.target.value }))}
                    />
                  </PropertySetupField>
                  <PropertySetupField label="Suffix">
                    <Input
                      disabled={disabled}
                      value={bulk.suffix}
                      onChange={(e) => setBulk((prev) => ({ ...prev, suffix: e.target.value }))}
                    />
                  </PropertySetupField>
                </PropertySetupFormGrid>
              </CollapsibleContent>
            </Collapsible>

            {bulkPreview ? (
              <div className="space-y-2" data-testid="wizard-bulk-preview">
                <p className="text-xs text-muted-foreground">
                  Generated: {bulkPreview.summary.generated} · Ready: {bulkPreview.summary.ready} ·
                  Excluded: {bulkPreview.summary.excluded} · Conflicts:{" "}
                  {bulkPreview.summary.conflicts}
                </p>
                <div className="flex flex-wrap gap-2">
                  {bulkPreview.items.map((item) => (
                    <span
                      key={item.roomNumber}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                        item.status === "AVAILABLE"
                          ? "border-green-300 bg-green-50 text-green-800"
                          : item.status === "CONFLICT"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                      title={
                        item.status === "CONFLICT"
                          ? [
                              item.conflict?.roomTypeName,
                              item.conflict?.building,
                              item.conflict?.floor,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : item.status
                      }
                    >
                      {item.roomNumber}
                      {item.status === "AVAILABLE" ? " ✓" : null}
                      {item.status === "CONFLICT" ? " ✕" : null}
                      {item.status === "EXCLUDED" ? " —" : null}
                      {item.status !== "EXCLUDED" ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            setExcludedNumbers((prev) =>
                              prev.includes(item.roomNumber)
                                ? prev
                                : [...prev, item.roomNumber],
                            )
                          }
                          aria-label={`Exclude ${item.roomNumber}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          className="underline"
                          onClick={() =>
                            setExcludedNumbers((prev) =>
                              prev.filter((n) => n !== item.roomNumber),
                            )
                          }
                        >
                          undo
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              disabled={
                disabled ||
                bulkMutation.isPending ||
                !bulk.buildingId ||
                !bulkPreview ||
                bulkPreviewBlocksCreate(bulkPreview.summary)
              }
              onClick={() => bulkMutation.mutate()}
            >
              Create rooms
            </Button>
          </div>
        ) : null}

        <div className="mt-5">
          <h4 className="text-sm font-medium text-[#251605]">Rooms to create / created</h4>
          <ul className="mt-2 space-y-2">
            {stagedRooms.map((room) => (
              <li
                key={room.localKey}
                className="flex items-center justify-between rounded-lg border border-[#E6DFD3] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-[#251605]">{room.roomNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {[room.buildingName, room.floorName ? `Floor ${room.floorName}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Location pending"}
                    {room.persisted ? " · Saved" : " · Staged"}
                  </p>
                </div>
                {!room.persisted ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      setStagedRooms((prev) => prev.filter((r) => r.localKey !== room.localKey))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
            {stagedRooms.length === 0 ? (
              <li className="text-sm text-muted-foreground">No rooms yet for this type.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          disabled={disabled || savingContinue || Boolean(codeCheck && !codeCheck.available)}
          onClick={() => void continueToAmenities()}
        >
          {savingContinue ? "Saving…" : "Save & continue to Amenities"}
        </Button>
      </div>

      {(addCategoryOpen || addClassOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-white p-4 shadow-xl">
            <h4 className="font-medium">
              {addCategoryOpen ? "Add category" : "Add class"}
            </h4>
            <Input
              className="mt-3"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddCategoryOpen(false);
                  setAddClassOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const name = customName.trim();
                  if (!name) return;
                  if (addCategoryOpen) {
                    const res = await addCategoryFn({ data: { restaurantId, name } });
                    if (!res.ok) {
                      toast.error(res.message);
                      return;
                    }
                    setTypeForm((prev) => ({ ...prev, category: name }));
                    setAddCategoryOpen(false);
                  } else {
                    const res = await addClassFn({ data: { restaurantId, name } });
                    if (!res.ok) {
                      toast.error(res.message);
                      return;
                    }
                    setTypeForm((prev) => ({ ...prev, class: name }));
                    setAddClassOpen(false);
                  }
                  void queryClient.invalidateQueries({
                    queryKey: ["pms-card2-classifications", restaurantId],
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
