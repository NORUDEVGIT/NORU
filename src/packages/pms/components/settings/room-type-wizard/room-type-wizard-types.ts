import type { SmokingPolicy } from "@/packages/pms/lib/rooms.server";
import type { RoomType } from "@/packages/pms/lib/rooms.functions";

export const ROOM_TYPE_WIZARD_STEPS = [
  { id: 1, title: "Room Type & Rooms" },
  { id: 2, title: "Amenities" },
  { id: 3, title: "Pricing Defaults" },
  { id: 4, title: "Photos" },
  { id: 5, title: "Review & Complete" },
] as const;

export type WizardStepId = (typeof ROOM_TYPE_WIZARD_STEPS)[number]["id"];

export type WizardBedRow = {
  bedType: string;
  bedSize: string;
  numberOfBeds: number;
};

export type WizardTypeForm = {
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
  beds: WizardBedRow[];
  baseNightlyRate: string;
  extraAdultRateDefault: string;
  extraChildRateDefault: string;
};

export type StagedRoom = {
  localKey: string;
  id?: string;
  roomNumber: string;
  roomCode: string;
  buildingId: string;
  buildingName: string;
  wingId: string;
  wingName: string;
  floorId: string;
  floorName: string;
  notes: string;
  sellable: boolean;
  active: boolean;
  smoking: boolean;
  accessible: boolean;
  roomFeatures: string[];
  persisted: boolean;
};

export function emptyWizardType(): WizardTypeForm {
  return {
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
    baseNightlyRate: "",
    extraAdultRateDefault: "",
    extraChildRateDefault: "",
  };
}

export function wizardTypeFromRow(row: RoomType): WizardTypeForm {
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
        ? row.beds.map((b) => ({
            bedType: b.bedType,
            bedSize: b.bedSize ?? "",
            numberOfBeds: b.numberOfBeds,
          }))
        : [{ bedType: "", bedSize: "", numberOfBeds: 1 }],
    baseNightlyRate: row.baseNightlyRate == null ? "" : String(row.baseNightlyRate),
    extraAdultRateDefault:
      row.extraAdultRateDefault == null ? "" : String(row.extraAdultRateDefault),
    extraChildRateDefault:
      row.extraChildRateDefault == null ? "" : String(row.extraChildRateDefault),
  };
}

export function parseOptionalMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
