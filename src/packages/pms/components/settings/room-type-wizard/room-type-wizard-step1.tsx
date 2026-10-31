import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Info,
  Plus,
  Trash2,
  X,
} from "lucide-react";

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
import { cn } from "@/shared/lib/utils";
import {
  addCustomRoomCategory,
  addCustomRoomClass,
  bulkCreateRooms,
  checkRoomNumberAvailable,
  checkRoomTypeCodeAvailable,
  listRoomClassifications,
  listRooms,
  releaseRoomFromRoomType,
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
  firstActiveBuildingId,
  floorsForBuildingAndWing,
  sequentialRoomLabels,
  withSelectedLocation,
  wingsForBuilding,
} from "@/packages/pms/lib/rooms-card2.server";
import { suggestRoomTypeCode } from "@/packages/pms/lib/rooms-card2-code";
import {
  bulkPreviewBlocksCreate,
  classifyBulkRoomPreview,
} from "@/packages/pms/lib/rooms-card2-preview";
import { parseOptionalMoney, type StagedRoom } from "./room-type-wizard-types";
import { useRoomTypeWizard } from "./room-type-wizard-context";

function locationLabel(name: string, active: boolean): string {
  return active ? name : `${name} (inactive)`;
}

function ClassificationSelect({
  label,
  value,
  options,
  disabled,
  placeholder,
  required,
  error,
  hasError,
  triggerRef,
  onValueChange,
  onAddNew,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  placeholder: string;
  required?: boolean;
  error?: string;
  hasError?: boolean;
  triggerRef?: React.Ref<HTMLButtonElement>;
  onValueChange: (value: string) => void;
  onAddNew: () => void;
}) {
  return (
    <PropertySetupField label={label} required={required} error={error}>
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          ref={triggerRef}
          className={cn(
            "bg-white transition-colors",
            hasError &&
              "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10 text-red-900",
          )}
          aria-invalid={hasError ? true : undefined}
        >
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
      <button
        type="button"
        className="mt-1 text-xs text-muted-foreground underline hover:text-[#251605]"
        disabled={disabled}
        onClick={onAddNew}
      >
        Add custom {label.replace("*", "").trim().toLowerCase()}
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
    attemptedStep1Submit,
    setAttemptedStep1Submit,
    setStep,
  } = useRoomTypeWizard();

  const queryClient = useQueryClient();
  const disabled = !canEdit;
  const saveTypeFn = useServerFn(saveRoomType);
  const saveRoomFn = useServerFn(saveRoom);
  const releaseRoomFn = useServerFn(releaseRoomFromRoomType);
  const bulkFn = useServerFn(bulkCreateRooms);
  const checkCodeFn = useServerFn(checkRoomTypeCodeAvailable);
  const checkNumberFn = useServerFn(checkRoomNumberAvailable);
  const fetchRooms = useServerFn(listRooms);
  const fetchStructure = useServerFn(getPmsSet2Snapshot);
  const fetchClassifications = useServerFn(listRoomClassifications);
  const addCategoryFn = useServerFn(addCustomRoomCategory);
  const addClassFn = useServerFn(addCustomRoomClass);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const maxOccupancyInputRef = useRef<HTMLInputElement>(null);
  const adultCapacityInputRef = useRef<HTMLInputElement>(null);
  const singleBuildingTriggerRef = useRef<HTMLButtonElement>(null);
  const singleRoomNumberInputRef = useRef<HTMLInputElement>(null);

  const [roomMode, setRoomMode] = useState<"single" | "bulk" | null>("single");
  const [single, setSingle] = useState({
    id: undefined as string | undefined,
    localKey: undefined as string | undefined,
    editingRoomNumber: undefined as string | undefined,
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
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([]);
  const [singleAttemptedSubmit, setSingleAttemptedSubmit] = useState(false);

  // Accordion collapsed states
  const [advancedTypeOpen, setAdvancedTypeOpen] = useState(false);
  const [advancedSingleOpen, setAdvancedSingleOpen] = useState(false);
  const [advancedBulkOpen, setAdvancedBulkOpen] = useState(false);
  const [physicalRoomsOpen, setPhysicalRoomsOpen] = useState(true);

  // Add classification dialogs
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
  const allRooms = useMemo(() => allRoomsQuery.data ?? [], [allRoomsQuery.data]);
  const preferredBuildingId = firstActiveBuildingId(structure.buildings);

  // Prefer the first active building. Alphabetical order can pick an inactive
  // building that has no wings/floors, which hides the setup the user created.
  useEffect(() => {
    if (!preferredBuildingId) return;
    if (!single.buildingId) {
      setSingle((prev) => ({ ...prev, buildingId: preferredBuildingId }));
    }
    if (!bulk.buildingId) {
      setBulk((prev) => ({ ...prev, buildingId: preferredBuildingId }));
    }
    if (!typeForm.defaultBuildingId && !roomTypeId) {
      setTypeForm((prev) => ({ ...prev, defaultBuildingId: preferredBuildingId }));
    }
  }, [
    preferredBuildingId,
    single.buildingId,
    bulk.buildingId,
    typeForm.defaultBuildingId,
    roomTypeId,
  ]);

  // Debounced Room Type Code check
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

  // Debounced Single Room Number check
  useEffect(() => {
    const number = single.roomNumber.trim();
    if (!number || roomMode !== "single") {
      setNumberCheck(null);
      return;
    }

    // Exclude the room currently being edited from staged conflicts
    const stagedHit = stagedRooms.find((r) => {
      if (r.roomNumber.trim().toLowerCase() !== number.toLowerCase()) return false;
      if (single.localKey && r.localKey === single.localKey) return false;
      if (single.id && r.id === single.id) return false;
      if (
        single.editingRoomNumber &&
        r.roomNumber.trim().toLowerCase() === single.editingRoomNumber.trim().toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    if (stagedHit) {
      setNumberCheck({
        available: false,
        message: `Room ${number} is already in this wizard list.`,
      });
      return;
    }

    // If editing existing room and the number is unchanged, mark immediately available
    if (
      single.editingRoomNumber &&
      number.toLowerCase() === single.editingRoomNumber.trim().toLowerCase()
    ) {
      setNumberCheck({ available: true, message: `Room ${number} is available` });
      return;
    }

    const handle = window.setTimeout(() => {
      void checkNumberFn({
        data: {
          restaurantId,
          roomNumber: number,
          ...(single.id ? { excludeId: single.id } : {}),
        },
      }).then((res) => {
        if (res.available) {
          setNumberCheck({
            available: true,
            message: res.reclaimable
              ? `Room ${number} is free to assign to this room type.`
              : `Room ${number} is available`,
          });
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
  }, [
    single.roomNumber,
    single.id,
    single.localKey,
    single.editingRoomNumber,
    roomMode,
    stagedRooms,
    restaurantId,
    checkNumberFn,
  ]);

  const typeWings = withSelectedLocation(
    typeForm.defaultBuildingId
      ? wingsForBuilding(structure.wings, structure.floors, typeForm.defaultBuildingId)
      : structure.buildings
          .filter((building) => building.active)
          .flatMap((building) =>
            wingsForBuilding(structure.wings, structure.floors, building.id),
          ),
    typeForm.defaultWingId,
  );
  const typeFloors = withSelectedLocation(
    typeForm.defaultBuildingId
      ? floorsForBuildingAndWing(
          structure.floors,
          structure.wings,
          typeForm.defaultBuildingId,
          typeForm.defaultWingId,
        )
      : structure.floors.filter((floor) =>
          structure.buildings.some((building) => building.active && building.id === floor.buildingId),
        ),
    typeForm.preferredFloorId,
  );
  const roomWings = withSelectedLocation(
    wingsForBuilding(structure.wings, structure.floors, single.buildingId),
    single.wingId,
  );
  const roomFloors = withSelectedLocation(
    floorsForBuildingAndWing(structure.floors, structure.wings, single.buildingId, single.wingId),
    single.floorId,
  );
  const bulkWings = withSelectedLocation(
    wingsForBuilding(structure.wings, structure.floors, bulk.buildingId),
    bulk.wingId,
  );
  const bulkFloors = withSelectedLocation(
    floorsForBuildingAndWing(structure.floors, structure.wings, bulk.buildingId, bulk.wingId),
    bulk.floorId,
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
      existing: allRooms
        .filter((r) => r.active)
        .map((r) => ({
          roomNumber: r.roomNumber,
          roomCode: r.roomCode,
          roomTypeName: r.roomTypeName,
          building: r.building,
          floor: r.floor,
        })),
      excludedNumbers,
    });
  }, [bulkLabels, allRooms, excludedNumbers]);

  // Capacity validation constraints
  const adultExceedsMax = typeForm.adultCapacity > typeForm.maxOccupancy;
  const adultsChildrenExceedsMax =
    typeForm.adultCapacity + typeForm.childCapacity > typeForm.maxOccupancy;

  // Field validation and error states for red border indication
  const isNameInvalid = !typeForm.name.trim();
  const nameHasError =
    (attemptedStep1Submit || formValidationErrors.includes("Room Type Name is required.")) &&
    isNameInvalid;

  const isCodeInvalid = !typeForm.code.trim() || Boolean(codeCheck && !codeCheck.available);
  const codeHasError =
    (attemptedStep1Submit || formValidationErrors.some((e) => e.includes("Code"))) && isCodeInvalid;

  const isCategoryInvalid = !typeForm.category.trim();
  const categoryHasError =
    (attemptedStep1Submit || formValidationErrors.includes("Room Category is required.")) &&
    isCategoryInvalid;

  const isMaxOccupancyInvalid = typeForm.maxOccupancy < 1;
  const maxOccupancyHasError =
    (attemptedStep1Submit ||
      formValidationErrors.includes("Maximum Occupancy must be at least 1.")) &&
    isMaxOccupancyInvalid;

  const isAdultCapacityInvalid = typeForm.adultCapacity < 1 || adultExceedsMax;
  const adultCapacityHasError =
    (attemptedStep1Submit ||
      adultExceedsMax ||
      formValidationErrors.some((e) => e.includes("Adults"))) &&
    isAdultCapacityInvalid;

  const singleBuildingHasError = singleAttemptedSubmit && !single.buildingId;
  const singleNumberHasError =
    singleAttemptedSubmit &&
    (!single.roomNumber.trim() || Boolean(numberCheck && !numberCheck.available));

  // Custom counts for collapsible headers
  const advancedTypeCustomCount = useMemo(() => {
    let count = 0;
    if (typeForm.displayName.trim() && typeForm.displayName.trim() !== typeForm.name.trim())
      count++;
    if (typeForm.class.trim()) count++;
    if (typeForm.standardOccupancy !== 2) count++;
    if (typeForm.smokingPolicy !== "non_smoking") count++;
    if (typeForm.defaultBuildingId) count++;
    if (typeForm.defaultWingId) count++;
    if (typeForm.preferredFloorId) count++;
    if (typeForm.accessibleEligible) count++;
    return count;
  }, [typeForm]);

  const advancedSingleCustomCount = useMemo(() => {
    let count = 0;
    if (single.roomCode.trim() && single.roomCode.trim() !== single.roomNumber.trim()) count++;
    if (single.notes.trim()) count++;
    if (single.smoking) count++;
    if (single.accessible) count++;
    if (single.roomFeatures.length > 0) count++;
    return count;
  }, [single]);

  const advancedBulkCustomCount = useMemo(() => {
    let count = 0;
    if (bulk.quantity.trim()) count++;
    if (bulk.prefix.trim()) count++;
    if (bulk.suffix.trim()) count++;
    return count;
  }, [bulk]);

  async function persistType(): Promise<string | null> {
    if (!typeForm.name.trim() || !typeForm.code.trim()) {
      toast.error("Please enter Room Type Name and Code.");
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

  // Single Room Mutation (Handles both Add and Update)
  const addSingleMutation = useMutation({
    mutationFn: async () => {
      const typeId = roomTypeId ?? (await persistType());
      if (!typeId) return { ok: false as const, message: "Save the room type first." };
      if (!single.buildingId) {
        setSingleAttemptedSubmit(true);
        singleBuildingTriggerRef.current?.focus();
        return { ok: false as const, message: "Choose a building." };
      }
      if (!single.roomNumber.trim()) {
        setSingleAttemptedSubmit(true);
        singleRoomNumberInputRef.current?.focus();
        return { ok: false as const, message: "Enter a room number." };
      }
      if (numberCheck && !numberCheck.available) {
        setSingleAttemptedSubmit(true);
        singleRoomNumberInputRef.current?.focus();
        return { ok: false as const, message: numberCheck.message };
      }
      const building = structure.buildings.find((b) => b.id === single.buildingId);
      const wing = structure.wings.find((w) => w.id === single.wingId);
      const floor = structure.floors.find((f) => f.id === single.floorId);
      const staged: StagedRoom = {
        localKey: single.localKey ?? single.id ?? `staged-${Date.now()}-${single.roomNumber}`,
        id: single.id,
        roomNumber: single.roomNumber.trim(),
        roomCode: single.roomCode.trim() || single.roomNumber.trim(),
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
          ...(single.id ? { id: single.id } : {}),
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
        const updated = result.staged;
        setStagedRooms((prev) => {
          const index = prev.findIndex(
            (r) =>
              (single.localKey && r.localKey === single.localKey) ||
              r.localKey === updated.localKey ||
              (updated.id && r.id === updated.id) ||
              (single.editingRoomNumber && r.roomNumber === single.editingRoomNumber),
          );
          if (index >= 0) {
            const next = [...prev];
            next[index] = updated;
            return next;
          }
          return [...prev, updated];
        });
        toast.success(
          single.id || single.editingRoomNumber
            ? `Room ${updated.roomNumber} updated`
            : `Room ${updated.roomNumber} added`,
        );
        setSingle({
          id: undefined,
          localKey: undefined,
          editingRoomNumber: undefined,
          roomNumber: "",
          roomCode: "",
          buildingId: structure.buildings[0]?.id ?? "",
          wingId: "",
          floorId: "",
          notes: "",
          sellable: true,
          active: true,
          smoking: false,
          accessible: false,
          roomFeatures: [],
          featureDraft: "",
        });
        setSingleAttemptedSubmit(false);
        setNumberCheck(null);
        void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
        void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
      }
    },
  });

  // Edit existing room in single form
  function handleEditRoom(room: StagedRoom) {
    setRoomMode("single");
    setSingle({
      id: room.id,
      localKey: room.localKey,
      editingRoomNumber: room.roomNumber,
      roomNumber: room.roomNumber,
      roomCode: room.roomCode,
      buildingId: room.buildingId,
      wingId: room.wingId,
      floorId: room.floorId,
      notes: room.notes,
      sellable: room.sellable,
      active: room.active,
      smoking: room.smoking,
      accessible: room.accessible,
      roomFeatures: room.roomFeatures ?? [],
      featureDraft: "",
    });
    setNumberCheck({ available: true, message: `Room ${room.roomNumber} is available` });
    toast.info(`Editing Room ${room.roomNumber}`);
  }

  // Remove a setup room so its number can be assigned to another room type.
  async function handleRemoveRoom(room: StagedRoom) {
    if (!room.persisted || !room.id) {
      setStagedRooms((prev) => prev.filter((r) => r.localKey !== room.localKey));
      toast.success(`Removed room ${room.roomNumber}`);
      return;
    }

    const typeId = roomTypeId ?? typeForm.id;
    if (!typeId) {
      setStagedRooms((prev) => prev.filter((r) => r.localKey !== room.localKey));
      return;
    }

    const released = await releaseRoomFn({
      data: {
        restaurantId,
        id: room.id,
        roomTypeId: typeId,
      },
    });

    if (!released.ok) {
      toast.error(released.message);
      return;
    }

    if (released.action === "deactivated") {
      setStagedRooms((prev) =>
        prev.map((r) =>
          r.localKey === room.localKey ? { ...r, active: false, sellable: false } : r,
        ),
      );
      toast.success(
        `Room ${room.roomNumber} has operations, so it was deactivated and kept on this room type.`,
      );
    } else {
      setStagedRooms((prev) => prev.filter((r) => r.localKey !== room.localKey));
      toast.success(`Room ${room.roomNumber} removed. The number is free for other room types.`);
    }
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
  }

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
          excludeNumbers: excludedNumbers,
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

  async function continueToPricing() {
    setAttemptedStep1Submit(true);
    const errors: string[] = [];
    if (!typeForm.name.trim()) errors.push("Room Type Name is required.");
    if (!typeForm.code.trim()) errors.push("Room Type Code is required.");
    if (!typeForm.category.trim()) errors.push("Room Category is required.");
    if (typeForm.maxOccupancy < 1) errors.push("Maximum Occupancy must be at least 1.");
    if (typeForm.adultCapacity < 1) errors.push("Maximum Adults must be at least 1.");
    if (adultExceedsMax) errors.push("Maximum Adults cannot exceed Maximum Occupancy.");
    if (codeCheck && !codeCheck.available) errors.push(codeCheck.message);

    if (errors.length > 0) {
      setFormValidationErrors(errors);
      toast.error(
        `Please fix ${errors.length} required field${errors.length === 1 ? "" : "s"} before continuing.`,
      );
      if (isNameInvalid) {
        nameInputRef.current?.focus();
      } else if (isCodeInvalid) {
        codeInputRef.current?.focus();
      } else if (isCategoryInvalid) {
        categoryTriggerRef.current?.focus();
      } else if (isMaxOccupancyInvalid) {
        maxOccupancyInputRef.current?.focus();
      } else if (isAdultCapacityInvalid) {
        adultCapacityInputRef.current?.focus();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setFormValidationErrors([]);
    setSavingContinue(true);
    try {
      const typeId = roomTypeId ?? (await persistType());
      if (!typeId) return;
      toast.success("Room type saved");
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-room-types", restaurantId] });
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-room-types-ready", restaurantId],
      });
      setStep(2);
    } finally {
      setSavingContinue(false);
    }
  }

  return (
    <div className="space-y-5 pb-20">
      {/* Top Validation Alert when Continue clicked with invalid fields */}
      {formValidationErrors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">
              Please fix the following required fields before continuing:
            </p>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-red-700">
              {formValidationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* CARD A: Room Type Identity */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Room Type Identity
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Basic naming and classification for PMS operations and rate distribution.
          </p>
        </div>

        <div className="mt-4">
          <PropertySetupFormGrid>
            <PropertySetupField
              label="Room Type Name *"
              required
              helper="Descriptive name displayed across reservations and guest folios."
              error={nameHasError ? "Room Type Name is required." : undefined}
            >
              <Input
                ref={nameInputRef}
                disabled={disabled}
                placeholder="e.g. Deluxe King"
                value={typeForm.name}
                className={cn(
                  "bg-white transition-colors",
                  nameHasError &&
                    "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                )}
                aria-invalid={nameHasError ? true : undefined}
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

            <PropertySetupField
              label="Room Type Code *"
              required
              helper="Auto-generated from Room Type Name. You can edit this code."
              error={
                codeHasError
                  ? codeCheck && !codeCheck.available
                    ? codeCheck.message
                    : "Room Type Code is required."
                  : undefined
              }
            >
              <div className="relative">
                <Input
                  ref={codeInputRef}
                  disabled={disabled}
                  placeholder="e.g. DLX-KNG"
                  value={typeForm.code}
                  className={cn(
                    "bg-white font-mono uppercase pr-14 transition-colors",
                    codeHasError &&
                      "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                  )}
                  aria-invalid={codeHasError ? true : undefined}
                  onChange={(e) => {
                    setCodeManuallyEdited(true);
                    setTypeForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }));
                  }}
                />
                {!codeManuallyEdited && typeForm.code && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#EDE6D8] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5C4528]">
                    Auto
                  </span>
                )}
              </div>
              {codeCheck && (
                <p
                  className={`mt-1 text-xs font-medium ${
                    codeCheck.available ? "text-emerald-700" : "text-red-600"
                  }`}
                  data-testid="wizard-code-check"
                >
                  {codeCheck.available ? `✓ ${codeCheck.message}` : `✕ ${codeCheck.message}`}
                </p>
              )}
            </PropertySetupField>

            <ClassificationSelect
              label="Room Category *"
              required
              value={typeForm.category}
              options={classificationsQuery.data?.categories ?? PREDEFINED_ROOM_CATEGORIES}
              disabled={disabled}
              placeholder="Select category"
              error={categoryHasError ? "Room Category is required." : undefined}
              hasError={categoryHasError}
              triggerRef={categoryTriggerRef}
              onValueChange={(val) => setTypeForm((prev) => ({ ...prev, category: val }))}
              onAddNew={() => {
                setCustomName("");
                setAddCategoryOpen(true);
              }}
            />
          </PropertySetupFormGrid>
        </div>
      </section>

      {/* CARD B: Capacity */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">Capacity</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Maximum guest thresholds applied to booking availability and front-desk reservations.
          </p>
        </div>

        <div className="mt-4">
          <PropertySetupFormGrid>
            <PropertySetupField
              label="Maximum Occupancy *"
              required
              helper="Total hard capacity limit for this room type."
              error={maxOccupancyHasError ? "Maximum Occupancy must be at least 1." : undefined}
            >
              <Input
                ref={maxOccupancyInputRef}
                type="number"
                min="1"
                disabled={disabled}
                value={typeForm.maxOccupancy}
                className={cn(
                  "bg-white transition-colors",
                  maxOccupancyHasError &&
                    "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                )}
                aria-invalid={maxOccupancyHasError ? true : undefined}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    maxOccupancy: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>

            <PropertySetupField
              label="Maximum Adults *"
              required
              helper="Max adults accommodated."
              error={
                adultCapacityHasError
                  ? adultExceedsMax
                    ? "Maximum Adults cannot exceed Maximum Occupancy."
                    : "Maximum Adults must be at least 1."
                  : undefined
              }
            >
              <Input
                ref={adultCapacityInputRef}
                type="number"
                min="1"
                max={typeForm.maxOccupancy}
                disabled={disabled}
                value={typeForm.adultCapacity}
                className={cn(
                  "bg-white transition-colors",
                  adultCapacityHasError &&
                    "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                )}
                aria-invalid={adultCapacityHasError ? true : undefined}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    adultCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>

            <PropertySetupField label="Maximum Children" helper="Max children accommodated.">
              <Input
                type="number"
                min="0"
                disabled={disabled}
                value={typeForm.childCapacity}
                className="bg-white"
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    childCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>

            <PropertySetupField label="Maximum Infants" helper="Max infants in cots / cribs.">
              <Input
                type="number"
                min="0"
                disabled={disabled}
                value={typeForm.infantCapacity}
                className="bg-white"
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    infantCapacity: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>
          </PropertySetupFormGrid>

          {adultsChildrenExceedsMax && !adultExceedsMax && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Adults ({typeForm.adultCapacity}) + Children ({typeForm.childCapacity}) exceeds
                Maximum Occupancy ({typeForm.maxOccupancy}). Extra bed or rollaway may be needed.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* CARD C: Bed Configuration */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">Bed Configuration</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure the types and counts of physical beds available in this room type.
          </p>
        </div>

        <div className="mt-4 space-y-2.5">
          {typeForm.beds.map((bed, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-2.5 rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3 sm:grid-cols-[1fr_1fr_100px_auto]"
            >
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Bed Type
                </label>
                <Input
                  disabled={disabled}
                  placeholder="e.g. King Bed, Single"
                  className="bg-white"
                  value={bed.bedType}
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, bedType: e.target.value };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Bed Size
                </label>
                <Input
                  disabled={disabled}
                  placeholder="e.g. 180×200 cm"
                  className="bg-white"
                  value={bed.bedSize}
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, bedSize: e.target.value };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Count
                </label>
                <Input
                  type="number"
                  min="1"
                  disabled={disabled}
                  value={bed.numberOfBeds}
                  className="bg-white"
                  onChange={(e) => {
                    const beds = [...typeForm.beds];
                    beds[index] = { ...bed, numberOfBeds: Number(e.target.value) || 1 };
                    setTypeForm((prev) => ({ ...prev, beds }));
                  }}
                />
              </div>

              <div className="flex items-end pb-0.5">
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
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#D9D2C4] text-xs text-[#251605] hover:bg-[#F4EDE0]"
            disabled={disabled}
            onClick={() =>
              setTypeForm((prev) => ({
                ...prev,
                beds: [...prev.beds, { bedType: "", bedSize: "", numberOfBeds: 1 }],
              }))
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Another Bed
          </Button>
        </div>
      </section>

      {/* CARD D: Room Details */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">Room Details</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Physical dimensions and descriptive highlights for guest presentation.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <PropertySetupFormGrid>
            <PropertySetupField
              label="Room Size"
              helper="Dimensions in square meters or square feet."
            >
              <Input
                disabled={disabled}
                placeholder="e.g. 38 m²"
                className="bg-white"
                value={typeForm.roomSize}
                onChange={(e) => setTypeForm((prev) => ({ ...prev, roomSize: e.target.value }))}
              />
            </PropertySetupField>

            <PropertySetupField label="View Type" helper="Primary view orientation from the room.">
              <Input
                disabled={disabled}
                placeholder="e.g. Mountain View, City View"
                className="bg-white"
                value={typeForm.roomView}
                onChange={(e) => setTypeForm((prev) => ({ ...prev, roomView: e.target.value }))}
              />
            </PropertySetupField>
          </PropertySetupFormGrid>

          <PropertySetupField
            label="Description"
            helper="Summary description for public booking channels and guest folios."
          >
            <Textarea
              disabled={disabled}
              rows={3}
              placeholder="Provide an overview of this room type's design, style, and unique features..."
              className="bg-white text-xs leading-relaxed"
              value={typeForm.description}
              onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </PropertySetupField>
        </div>
      </section>

      {/* CARD E: Availability & Options */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Availability & Options
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Operational availability and guest reservation options.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
            <div>
              <label
                htmlFor="activeToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Active
              </label>
              <span className="text-[11px] text-muted-foreground">Active in hotel operations</span>
            </div>
            <Switch
              id="activeToggle"
              checked={typeForm.active}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, active: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
            <div>
              <label
                htmlFor="sellableToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Sellable
              </label>
              <span className="text-[11px] text-muted-foreground">
                Available for public booking
              </span>
            </div>
            <Switch
              id="sellableToggle"
              checked={typeForm.sellable}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, sellable: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
            <div>
              <label
                htmlFor="extraGuestToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Extra Guest Allowed
              </label>
              <span className="text-[11px] text-muted-foreground">
                Allow guests beyond standard
              </span>
            </div>
            <Switch
              id="extraGuestToggle"
              checked={typeForm.extraGuestAllowed}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraGuestAllowed: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
            <div>
              <label
                htmlFor="extraBedToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Extra Bed Allowed
              </label>
              <span className="text-[11px] text-muted-foreground">
                Rollaway or extra bed eligible
              </span>
            </div>
            <Switch
              id="extraBedToggle"
              checked={typeForm.extraBedAllowed}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraBedAllowed: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
            <div>
              <label
                htmlFor="connectingToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Connecting Room Eligible
              </label>
              <span className="text-[11px] text-muted-foreground">
                Can connect with adjacent room
              </span>
            </div>
            <Switch
              id="connectingToggle"
              checked={typeForm.connectingEligible}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, connectingEligible: v }))}
            />
          </div>
        </div>
      </section>

      {/* CARD F: Advanced Room Type Options Accordion */}
      <Collapsible
        open={advancedTypeOpen}
        onOpenChange={setAdvancedTypeOpen}
        className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs"
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[#251605]">
              Advanced Room Type Options
            </h3>
            {advancedTypeCustomCount > 0 && (
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[10px] font-semibold text-[#251605]">
                {advancedTypeCustomCount} customized
              </span>
            )}
          </div>
          {advancedTypeOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-4 border-t border-[#EDE6D8] pt-4">
          <PropertySetupFormGrid>
            <PropertySetupField
              label="Display Name"
              helper="Custom title for guest-facing collateral."
            >
              <Input
                disabled={disabled}
                placeholder="Defaults to Room Type Name"
                className="bg-white"
                value={typeForm.displayName}
                onChange={(e) => setTypeForm((prev) => ({ ...prev, displayName: e.target.value }))}
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

            <PropertySetupField
              label="Included Occupancy"
              helper="Guests included in the Rate Plan base price before extra-person pricing applies."
            >
              <Input
                type="number"
                min="1"
                max={typeForm.maxOccupancy}
                disabled={disabled}
                value={typeForm.standardOccupancy}
                className="bg-white"
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    standardOccupancy: Number(e.target.value) || 0,
                  }))
                }
              />
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
                <SelectTrigger className="bg-white">
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

            <PropertySetupField
              label="Default Building"
              helper="Default preference when placing rooms."
            >
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
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Preference only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {structure.buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {locationLabel(b.name, b.active)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>

            <PropertySetupField
              label="Default Wing"
              helper={
                typeWings.length > 0
                  ? "Default preference when placing rooms."
                  : typeForm.defaultBuildingId
                    ? "No wings are set up for this building."
                    : "Select a default building to see its wings."
              }
            >
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
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Preference only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {typeWings.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {locationLabel(w.name, w.active)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>

            <PropertySetupField
              label="Preferred Floor"
              helper={
                typeFloors.length > 0
                  ? "Default preference when placing rooms."
                  : typeForm.defaultBuildingId
                    ? "No floors are set up for this building."
                    : "Select a default building to see its floors."
              }
            >
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
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Preference only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {typeFloors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {locationLabel(f.name, f.active)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertySetupField>
          </PropertySetupFormGrid>

          <div className="flex items-center justify-between rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3 max-w-sm">
            <div>
              <label
                htmlFor="accessibleToggle"
                className="text-xs font-semibold text-[#251605] block cursor-pointer"
              >
                Accessible Room Eligible
              </label>
              <span className="text-[11px] text-muted-foreground">
                Eligible for accessible features
              </span>
            </div>
            <Switch
              id="accessibleToggle"
              checked={typeForm.accessibleEligible}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, accessibleEligible: v }))}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* CARD G: PHYSICAL ROOMS — Collapsible Settings Card */}
      <Collapsible
        open={physicalRoomsOpen}
        onOpenChange={setPhysicalRoomsOpen}
        className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs"
      >
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3",
            physicalRoomsOpen && "border-b border-[#EDE6D8] pb-3",
          )}
        >
          <div className="flex-1 min-w-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-[#251605]">
                PHYSICAL ROOMS
              </h3>
              <span className="inline-flex items-center rounded border border-[#E6E1D8] bg-[#F4EDE0] px-2 py-0.5 font-mono text-xs font-medium text-[#251605]">
                {typeForm.name.trim() || "Room Type"} · {typeForm.code || "CODE"}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#D9D2C4] bg-[#F7F4EE] px-2 py-0.5 text-xs font-medium text-[#5C4528]">
                {stagedRooms.length} {stagedRooms.length === 1 ? "room" : "rooms"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create the actual rooms that belong to{" "}
              <span className="font-medium text-[#251605]">
                {typeForm.name || "this room type"}
              </span>
              . Rooms are directly linked without needing a room type selector.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch Tabs (visible when open) */}
            {physicalRoomsOpen && (
              <div className="inline-flex rounded-lg border border-[#E6DFD3] bg-[#F7F4EE] p-0.5">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    roomMode === "single"
                      ? "bg-white text-[#251605] shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-[#251605]"
                  }`}
                  onClick={() => setRoomMode("single")}
                >
                  Single Room
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    roomMode === "bulk"
                      ? "bg-white text-[#251605] shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-[#251605]"
                  }`}
                  onClick={() => setRoomMode("bulk")}
                >
                  Bulk Generation
                </button>
              </div>
            )}

            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-[#5C4528] hover:bg-[#F4EDE0] hover:text-[#251605]"
                aria-label={physicalRoomsOpen ? "Collapse Physical Rooms" : "Expand Physical Rooms"}
              >
                <span>{physicalRoomsOpen ? "Collapse" : "Expand"}</span>
                {physicalRoomsOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          {/* SINGLE ROOM FORM */}
          {roomMode === "single" && (
            <div className="mt-4 rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
                  {single.id || single.editingRoomNumber
                    ? `Edit Room ${single.editingRoomNumber || single.roomNumber}`
                    : "New Physical Room"}
                </h4>
                {(single.id || single.editingRoomNumber) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-[#251605]"
                    onClick={() => {
                      setSingle({
                        id: undefined,
                        localKey: undefined,
                        editingRoomNumber: undefined,
                        roomNumber: "",
                        roomCode: "",
                        buildingId: preferredBuildingId,
                        wingId: "",
                        floorId: "",
                        notes: "",
                        sellable: true,
                        active: true,
                        smoking: false,
                        accessible: false,
                        roomFeatures: [],
                        featureDraft: "",
                      });
                      setNumberCheck(null);
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
              </div>

              <PropertySetupFormGrid>
                <PropertySetupField
                  label="Building *"
                  required
                  error={singleBuildingHasError ? "Building is required." : undefined}
                >
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
                    <SelectTrigger
                      ref={singleBuildingTriggerRef}
                      className={cn(
                        "bg-white transition-colors",
                        singleBuildingHasError &&
                          "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                      )}
                      aria-invalid={singleBuildingHasError ? true : undefined}
                    >
                      <SelectValue placeholder="Select building" />
                    </SelectTrigger>
                    <SelectContent>
                      {structure.buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {locationLabel(b.name, b.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField
                  label="Floor"
                  helper={
                    roomFloors.length > 0 || !single.buildingId
                      ? undefined
                      : "No floors are set up for this building."
                  }
                >
                  <Select
                    value={single.floorId || "__none"}
                    disabled={disabled}
                    onValueChange={(v) =>
                      setSingle((prev) => ({ ...prev, floorId: v === "__none" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {roomFloors.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {locationLabel(f.name, f.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField
                  label="Wing"
                  helper={
                    roomWings.length > 0 || !single.buildingId
                      ? undefined
                      : "No wings are set up for this building."
                  }
                >
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
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {roomWings.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {locationLabel(w.name, w.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField
                  label="Room Number *"
                  required
                  error={
                    singleNumberHasError
                      ? !single.roomNumber.trim()
                        ? "Room Number is required."
                        : numberCheck?.message
                      : numberCheck && !numberCheck.available
                        ? numberCheck.message
                        : undefined
                  }
                >
                  <Input
                    ref={singleRoomNumberInputRef}
                    disabled={disabled}
                    placeholder="e.g. 101 or A-101"
                    value={single.roomNumber}
                    className={cn(
                      "bg-white font-medium transition-colors",
                      (singleNumberHasError || (numberCheck && !numberCheck.available)) &&
                        "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                    )}
                    aria-invalid={
                      singleNumberHasError || (numberCheck && !numberCheck.available)
                        ? true
                        : undefined
                    }
                    onChange={(e) =>
                      setSingle((prev) => ({
                        ...prev,
                        roomNumber: e.target.value,
                        roomCode:
                          prev.roomCode && prev.roomCode !== prev.roomNumber
                            ? prev.roomCode
                            : e.target.value,
                      }))
                    }
                  />
                  {numberCheck && (
                    <p
                      className={`mt-1 text-xs font-medium ${
                        numberCheck.available ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {numberCheck.available
                        ? `✓ ${numberCheck.message}`
                        : `✕ ${numberCheck.message}`}
                    </p>
                  )}
                </PropertySetupField>
              </PropertySetupFormGrid>

              {/* Active & Sellable switches */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-[#251605] cursor-pointer">
                  <Switch
                    checked={single.active}
                    disabled={disabled}
                    onCheckedChange={(v) => setSingle((prev) => ({ ...prev, active: v }))}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-[#251605] cursor-pointer">
                  <Switch
                    checked={single.sellable}
                    disabled={disabled}
                    onCheckedChange={(v) => setSingle((prev) => ({ ...prev, sellable: v }))}
                  />
                  Sellable
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Operational status defaults to Available. Change it later in Inventory workflows.
                </p>
              </div>

              {/* Advanced Room Options Collapsible */}
              <Collapsible
                open={advancedSingleOpen}
                onOpenChange={setAdvancedSingleOpen}
                className="border-t border-[#EDE6D8] pt-3"
              >
                <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-[#251605] hover:text-[#C89933]">
                  {advancedSingleOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Advanced Room Options
                  {advancedSingleCustomCount > 0 && (
                    <span className="rounded-full bg-[#C89933]/20 px-1.5 py-0.2 text-[10px] font-semibold text-[#251605]">
                      {advancedSingleCustomCount} customized
                    </span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <PropertySetupFormGrid>
                    <PropertySetupField label="Room Code" helper="Defaults to Room Number.">
                      <Input
                        disabled={disabled}
                        value={single.roomCode}
                        placeholder="Defaults to room number"
                        className="bg-white font-mono"
                        onChange={(e) =>
                          setSingle((prev) => ({ ...prev, roomCode: e.target.value }))
                        }
                      />
                    </PropertySetupField>

                    <PropertySetupField label="Room Notes">
                      <Input
                        disabled={disabled}
                        value={single.notes}
                        placeholder="Maintenance or location notes"
                        className="bg-white"
                        onChange={(e) => setSingle((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </PropertySetupField>
                  </PropertySetupFormGrid>

                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-xs text-[#251605] cursor-pointer">
                      <Switch
                        checked={single.smoking}
                        disabled={disabled}
                        onCheckedChange={(v) => setSingle((prev) => ({ ...prev, smoking: v }))}
                      />
                      Smoking Allowed
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[#251605] cursor-pointer">
                      <Switch
                        checked={single.accessible}
                        disabled={disabled}
                        onCheckedChange={(v) => setSingle((prev) => ({ ...prev, accessible: v }))}
                      />
                      Accessible Room
                    </label>
                  </div>

                  <PropertySetupField label="Room Features">
                    <div className="flex gap-2 max-w-md">
                      <Input
                        disabled={disabled}
                        placeholder="Add tag (e.g. Balcony, High Floor)"
                        value={single.featureDraft}
                        className="bg-white"
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
                        className="border-[#D9D2C4] text-xs text-[#251605] hover:bg-[#F4EDE0]"
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
                    {single.roomFeatures.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {single.roomFeatures.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-md border border-[#D9D2C4] bg-white px-2 py-0.5 text-xs text-[#251605]"
                          >
                            {tag}
                            <button
                              type="button"
                              disabled={disabled}
                              className="text-muted-foreground hover:text-red-600"
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
                    )}
                  </PropertySetupField>
                </CollapsibleContent>
              </Collapsible>

              <div className="pt-2">
                <Button
                  type="button"
                  disabled={
                    disabled ||
                    addSingleMutation.isPending ||
                    !single.buildingId ||
                    !single.roomNumber.trim() ||
                    Boolean(numberCheck && !numberCheck.available)
                  }
                  className="bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"
                  onClick={() => addSingleMutation.mutate()}
                >
                  {addSingleMutation.isPending
                    ? "Saving room…"
                    : single.id || single.editingRoomNumber
                      ? "Update Room"
                      : "Add Room"}
                </Button>
              </div>
            </div>
          )}

          {/* BULK GENERATION FORM */}
          {roomMode === "bulk" && (
            <div className="mt-4 rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605] border-b border-[#EDE6D8] pb-2">
                Bulk Room Generation
              </h4>

              <PropertySetupFormGrid>
                <PropertySetupField label="Building *" required>
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
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select building" />
                    </SelectTrigger>
                    <SelectContent>
                      {structure.buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {locationLabel(b.name, b.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField
                  label="Floor"
                  helper={
                    bulkFloors.length > 0 || !bulk.buildingId
                      ? undefined
                      : "No floors are set up for this building."
                  }
                >
                  <Select
                    value={bulk.floorId || "__none"}
                    disabled={disabled}
                    onValueChange={(v) =>
                      setBulk((prev) => ({ ...prev, floorId: v === "__none" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {bulkFloors.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {locationLabel(f.name, f.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField
                  label="Wing"
                  helper={
                    bulkWings.length > 0 || !bulk.buildingId
                      ? undefined
                      : "No wings are set up for this building."
                  }
                >
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
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {bulkWings.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {locationLabel(w.name, w.active)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropertySetupField>

                <PropertySetupField label="Starting Room Number *" required>
                  <Input
                    type="number"
                    disabled={disabled}
                    value={bulk.startNumber}
                    className="bg-white font-medium"
                    onChange={(e) =>
                      setBulk((prev) => ({ ...prev, startNumber: Number(e.target.value) || 0 }))
                    }
                  />
                </PropertySetupField>

                <PropertySetupField label="Ending Room Number *" required>
                  <Input
                    type="number"
                    disabled={disabled}
                    value={bulk.endNumber}
                    className="bg-white font-medium"
                    onChange={(e) =>
                      setBulk((prev) => ({
                        ...prev,
                        endNumber: Number(e.target.value) || 0,
                        quantity: "",
                      }))
                    }
                  />
                </PropertySetupField>

                <div className="flex flex-col justify-end">
                  <span className="text-xs text-muted-foreground block mb-1">Generated Rooms</span>
                  <div className="rounded-lg border border-[#EDE6D8] bg-white px-3 py-2 text-xs font-semibold text-[#251605]">
                    {bulkLabels.ok ? `${bulkLabels.labels.length} rooms` : "Invalid range"}
                  </div>
                </div>
              </PropertySetupFormGrid>

              {/* Advanced Bulk Options Collapsible */}
              <Collapsible
                open={advancedBulkOpen}
                onOpenChange={setAdvancedBulkOpen}
                className="border-t border-[#EDE6D8] pt-3"
              >
                <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-[#251605] hover:text-[#C89933]">
                  {advancedBulkOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Advanced Bulk Options
                  {advancedBulkCustomCount > 0 && (
                    <span className="rounded-full bg-[#C89933]/20 px-1.5 py-0.2 text-[10px] font-semibold text-[#251605]">
                      {advancedBulkCustomCount} customized
                    </span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <PropertySetupFormGrid>
                    <PropertySetupField
                      label="Quantity (optional)"
                      helper="Overrides end number when set."
                    >
                      <Input
                        type="number"
                        min="1"
                        disabled={disabled}
                        value={bulk.quantity}
                        placeholder="e.g. 20"
                        className="bg-white"
                        onChange={(e) => setBulk((prev) => ({ ...prev, quantity: e.target.value }))}
                      />
                    </PropertySetupField>

                    <PropertySetupField label="Prefix" helper="Prepended to room number.">
                      <Input
                        disabled={disabled}
                        value={bulk.prefix}
                        placeholder="e.g. A-"
                        className="bg-white"
                        onChange={(e) => setBulk((prev) => ({ ...prev, prefix: e.target.value }))}
                      />
                    </PropertySetupField>

                    <PropertySetupField label="Suffix" helper="Appended to room number.">
                      <Input
                        disabled={disabled}
                        value={bulk.suffix}
                        placeholder="e.g. -N"
                        className="bg-white"
                        onChange={(e) => setBulk((prev) => ({ ...prev, suffix: e.target.value }))}
                      />
                    </PropertySetupField>
                  </PropertySetupFormGrid>
                </CollapsibleContent>
              </Collapsible>

              {/* Bulk Preview and Summary Badges */}
              {bulkPreview && (
                <div className="space-y-3 pt-2" data-testid="wizard-bulk-preview">
                  {/* Compact Settings stat badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-[#EDE6D8] bg-white px-2.5 py-1 text-xs font-medium text-[#251605]">
                      Generated:{" "}
                      <span className="font-semibold">{bulkPreview.summary.generated}</span>
                    </span>
                    <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      Ready: <span className="font-semibold">{bulkPreview.summary.ready}</span>
                    </span>
                    {bulkPreview.summary.conflicts > 0 && (
                      <span className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
                        Conflicts:{" "}
                        <span className="font-semibold">{bulkPreview.summary.conflicts}</span>
                      </span>
                    )}
                    {bulkPreview.summary.excluded > 0 && (
                      <span className="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        Excluded:{" "}
                        <span className="font-semibold">{bulkPreview.summary.excluded}</span>
                      </span>
                    )}
                  </div>

                  {/* Preview Cards */}
                  <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
                    {bulkPreview.items.map((item) => (
                      <div
                        key={item.roomNumber}
                        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-2xs ${
                          item.status === "AVAILABLE"
                            ? "border-emerald-300 bg-emerald-50/70 text-emerald-900"
                            : item.status === "CONFLICT"
                              ? "border-red-300 bg-red-50 text-red-900"
                              : "border-slate-300 bg-slate-100/80 text-slate-600 line-through"
                        }`}
                      >
                        <span className="font-mono font-semibold">{item.roomNumber}</span>
                        {item.status === "AVAILABLE" ? (
                          <span className="text-[11px] text-emerald-700">✓ Available</span>
                        ) : null}
                        {item.status === "CONFLICT" ? (
                          <span className="text-[11px] font-semibold text-red-700">✕ Conflict</span>
                        ) : null}
                        {item.status === "EXCLUDED" ? (
                          <span className="text-[11px] text-slate-500">— Excluded</span>
                        ) : null}

                        {item.status !== "EXCLUDED" ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              setExcludedNumbers((prev) =>
                                prev.includes(item.roomNumber) ? prev : [...prev, item.roomNumber],
                              )
                            }
                            aria-label={`Exclude ${item.roomNumber}`}
                            className="text-muted-foreground hover:text-red-700 ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={disabled}
                            className="text-xs text-[#251605] underline font-medium ml-0.5"
                            onClick={() =>
                              setExcludedNumbers((prev) =>
                                prev.filter((n) => n !== item.roomNumber),
                              )
                            }
                          >
                            undo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Conflict Detail Information */}
                  {bulkPreview.summary.conflicts > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-xs text-red-800 space-y-1">
                      <p className="font-semibold text-red-900">Conflict Details:</p>
                      {bulkPreview.items
                        .filter((i) => i.status === "CONFLICT")
                        .map((item) => (
                          <p key={item.roomNumber}>
                            Room {item.roomNumber} already exists.{" "}
                            <span className="text-red-700">
                              {[
                                item.conflict?.roomTypeName,
                                item.conflict?.building,
                                item.conflict?.floor ? `Floor ${item.conflict.floor}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="button"
                  disabled={
                    disabled ||
                    bulkMutation.isPending ||
                    !bulk.buildingId ||
                    !bulkPreview ||
                    bulkPreviewBlocksCreate(bulkPreview.summary)
                  }
                  className="bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"
                  onClick={() => bulkMutation.mutate()}
                >
                  {bulkMutation.isPending ? "Creating rooms…" : "Create Rooms"}
                </Button>
              </div>
            </div>
          )}

          {/* STAGED / CREATED ROOMS LIST */}
          <div className="mt-5 border-t border-[#EDE6D8] pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
                Rooms Assigned to this Room Type ({stagedRooms.length})
              </h4>
            </div>

            <ul className="mt-3 divide-y divide-[#EDE6D8] rounded-xl border border-[#EDE6D8] bg-[#FDFCFB]">
              {stagedRooms.map((room) => (
                <li
                  key={room.localKey}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs transition-colors hover:bg-white"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-[#251605]">
                        {room.roomNumber}
                      </p>
                      <span className="rounded bg-[#F4EDE0] px-1.5 py-0.2 text-[10px] font-medium text-[#251605] border border-[#E6E1D8]">
                        {[
                          room.buildingName,
                          room.floorName ? `Floor ${room.floorName}` : null,
                          room.wingName,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Main Building"}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          room.persisted ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {room.persisted ? "✓ Saved" : "· Staged"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-[#D9D2C4] px-2 text-xs text-[#251605] hover:bg-[#F4EDE0]"
                      disabled={disabled}
                      onClick={() => handleEditRoom(room)}
                      aria-label={`Edit room ${room.roomNumber}`}
                    >
                      <Edit2 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={disabled}
                      onClick={() => void handleRemoveRoom(room)}
                      aria-label={`Remove room ${room.roomNumber}`}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
              {stagedRooms.length === 0 ? (
                <li className="p-4 text-center text-xs text-muted-foreground">
                  No physical rooms added yet. Use Single Room or Bulk Generation above to add
                  rooms.
                </li>
              ) : null}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D9D2C4] bg-white/95 px-6 py-3.5 backdrop-blur-xs shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <Button
            type="button"
            disabled={disabled || savingContinue || Boolean(codeCheck && !codeCheck.available)}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium px-5"
            onClick={() => void continueToPricing()}
          >
            {savingContinue ? "Saving…" : "Save & Continue to Pricing"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </footer>

      {/* Add Custom Category / Class Modal */}
      {(addCategoryOpen || addClassOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-sm rounded-xl border border-[#D9D2C4] bg-white p-5 shadow-xl">
            <h4 className="font-display text-base font-semibold text-[#251605]">
              {addCategoryOpen ? "Add Custom Category" : "Add Custom Class"}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {addCategoryOpen
                ? "Create a new room category for property classification."
                : "Create a new room class."}
            </p>
            <Input
              className="mt-3 bg-white text-xs"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Classification name"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-[#D9D2C4] text-xs"
                onClick={() => {
                  setAddCategoryOpen(false);
                  setAddClassOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"
                disabled={!customName.trim()}
                onClick={async () => {
                  const val = customName.trim();
                  if (!val) return;
                  if (addCategoryOpen) {
                    const res = await addCategoryFn({ data: { restaurantId, category: val } });
                    if (res.ok) {
                      toast.success(`Category "${val}" added`);
                      setTypeForm((prev) => ({ ...prev, category: val }));
                      void queryClient.invalidateQueries({
                        queryKey: ["pms-card2-classifications", restaurantId],
                      });
                    } else {
                      toast.error(res.message);
                    }
                  } else {
                    const res = await addClassFn({ data: { restaurantId, class: val } });
                    if (res.ok) {
                      toast.success(`Class "${val}" added`);
                      setTypeForm((prev) => ({ ...prev, class: val }));
                      void queryClient.invalidateQueries({
                        queryKey: ["pms-card2-classifications", restaurantId],
                      });
                    } else {
                      toast.error(res.message);
                    }
                  }
                  setAddCategoryOpen(false);
                  setAddClassOpen(false);
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
