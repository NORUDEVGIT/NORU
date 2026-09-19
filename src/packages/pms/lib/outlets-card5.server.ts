/**
 * Card 5 Phase 2 — Outlets & Facilities (pure helpers).
 * Card 5 classification is separate from the legacy SET2 posting type.
 */
import { STAFF_ROLES, type StaffRole } from "@/core/lib/module-access";
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";
import {
  emptyOperatingHours,
  hoursConfigured,
  parseOperatingHours,
  type Card5OperatingHours,
} from "./departments-card5.server.ts";

export const CARD5_FACILITIES_UNAVAILABLE =
  "Outlets & Facilities are unavailable until migration 0078 is applied.";
export const CARD5_FACILITY_AUDIT_SECTION = "card5-outlets-facilities";

export const CARD5_FACILITY_CATEGORIES = [
  "fnb",
  "events",
  "wellness",
  "services",
  "other",
] as const;
export type Card5FacilityCategory = (typeof CARD5_FACILITY_CATEGORIES)[number];

export const CARD5_FACILITY_CATEGORY_LABELS: Record<Card5FacilityCategory, string> = {
  fnb: "F&B",
  events: "Events",
  wellness: "Wellness",
  services: "Services",
  other: "Other",
};

export const CARD5_FACILITY_TYPE_SUGGESTIONS = [
  "restaurant",
  "bar",
  "conference_hall",
  "meeting_room",
  "gym",
  "pool",
  "spa",
  "business_center",
  "custom",
] as const;

export const CARD5_AVAILABILITY_MODES = [
  "always_available",
  "scheduled",
  "reservation_based",
  "temporarily_unavailable",
] as const;
export type Card5AvailabilityMode = (typeof CARD5_AVAILABILITY_MODES)[number];

export const CARD5_FEATURES = [
  "projector",
  "wifi",
  "sound_system",
  "microphones",
  "air_conditioning",
  "stage",
  "screen",
  "buffet",
  "breakfast",
  "lunch",
  "dinner",
  "outdoor_seating",
] as const;
export type Card5FeatureCode = (typeof CARD5_FEATURES)[number];
export type Card5FacilityFeatures = Record<Card5FeatureCode, boolean>;

export type Card5Option = {
  id: string;
  name: string;
  active: boolean;
  parentId?: string | null;
  buildingId?: string | null;
};

export type Card5CurrencyOption = {
  code: string;
  name: string;
  active: boolean;
};

export type Card5Facility = {
  id: string;
  code: string;
  name: string;
  description: string;
  facilityCategory: Card5FacilityCategory;
  facilityTypeCode: string;
  buildingId: string | null;
  floorId: string | null;
  wingId: string | null;
  departmentId: string | null;
  managerUserId: string | null;
  responsibleRole: StaffRole | null;
  minimumCapacity: number | null;
  standardCapacity: number | null;
  maximumCapacity: number | null;
  operatingHours: Card5OperatingHours;
  chargeable: boolean | null;
  revenueCenter: string;
  taxGroupId: string | null;
  currencyCode: string | null;
  reservationRequired: boolean | null;
  advanceBookingRequired: boolean | null;
  minimumLeadMinutes: number | null;
  availabilityMode: Card5AvailabilityMode;
  features: Card5FacilityFeatures;
  active: boolean;
};

export type Card5FacilitiesSnapshot = {
  facilities: Card5Facility[];
  buildings: Card5Option[];
  floors: Card5Option[];
  wings: Card5Option[];
  departments: Card5Option[];
  staff: Array<Card5Option & { role: string }>;
  taxGroups: Card5Option[];
  currencies: Card5CurrencyOption[];
};

export type Card5FacilitiesReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function emptyFacilityFeatures(
  value?: Partial<Card5FacilityFeatures>,
): Card5FacilityFeatures {
  return Object.fromEntries(
    CARD5_FEATURES.map((feature) => [feature, value?.[feature] === true]),
  ) as Card5FacilityFeatures;
}

export function parseFacilityFeatures(value: unknown): Card5FacilityFeatures {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyFacilityFeatures();
  return emptyFacilityFeatures(value as Partial<Card5FacilityFeatures>);
}

export function validCapacityOrder(
  minimum: number | null,
  standard: number | null,
  maximum: number | null,
): boolean {
  const values = [minimum, standard, maximum];
  if (values.some((value) => value != null && (!Number.isInteger(value) || value < 0)))
    return false;
  if (minimum != null && standard != null && minimum > standard) return false;
  if (standard != null && maximum != null && standard > maximum) return false;
  if (minimum != null && maximum != null && minimum > maximum) return false;
  return true;
}

export function evaluateCard5FacilitiesReadiness(
  snapshot: Card5FacilitiesSnapshot,
): Card5FacilitiesReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const codes = new Map<string, number>();
  for (const row of snapshot.facilities) {
    const code = row.code.trim().toUpperCase();
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  for (const [code, count] of codes) {
    if (code && count > 1) blockers.push(`Facility code ${code} is used more than once.`);
  }

  for (const row of snapshot.facilities.filter((item) => item.active)) {
    const label = row.name || row.code || "A facility";
    if (!row.code.trim() || !row.name.trim()) blockers.push(`${label} needs a name and code.`);
    if (!CARD5_FACILITY_CATEGORIES.includes(row.facilityCategory)) {
      blockers.push(`${label} needs a valid category.`);
    }
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(row.facilityTypeCode)) {
      blockers.push(`${label} needs a valid facility type code.`);
    }
    if (!validCapacityOrder(row.minimumCapacity, row.standardCapacity, row.maximumCapacity)) {
      blockers.push(`${label} has an invalid capacity order.`);
    }
    if (row.buildingId && !snapshot.buildings.some((item) => item.id === row.buildingId)) {
      blockers.push(`${label} references an unknown building.`);
    }
    if (row.floorId && !snapshot.floors.some((item) => item.id === row.floorId)) {
      blockers.push(`${label} references an unknown floor.`);
    }
    if (row.buildingId && row.floorId) {
      const floor = snapshot.floors.find((item) => item.id === row.floorId);
      if (floor?.buildingId && floor.buildingId !== row.buildingId) {
        blockers.push(`${label} floor does not belong to the selected building.`);
      }
    }
    if (row.wingId && !snapshot.wings.some((item) => item.id === row.wingId)) {
      blockers.push(`${label} references an unknown wing.`);
    }
    if (row.departmentId && !snapshot.departments.some((item) => item.id === row.departmentId)) {
      blockers.push(`${label} references an unknown department.`);
    }
    if (row.taxGroupId && !snapshot.taxGroups.some((item) => item.id === row.taxGroupId)) {
      blockers.push(`${label} references an unknown tax group.`);
    }
    if (row.currencyCode && !snapshot.currencies.some((item) => item.code === row.currencyCode)) {
      blockers.push(`${label} references an unsupported currency.`);
    }
    if (row.availabilityMode === "scheduled" && !hoursConfigured(row.operatingHours)) {
      blockers.push(`${label} needs operating hours for scheduled availability.`);
    }
    if (row.minimumLeadMinutes != null && row.minimumLeadMinutes < 0) {
      blockers.push(`${label} lead time cannot be negative.`);
    }
    if (!row.departmentId && !row.managerUserId && !row.responsibleRole) {
      warnings.push(`${label} has no department, manager, or responsible role.`);
    }
  }

  if (!snapshot.facilities.some((row) => row.active)) {
    blockers.push("Add at least one active facility.");
  }
  const unique = [...new Set(blockers)];
  return {
    ready: unique.length === 0,
    status:
      unique.length === 0
        ? "complete"
        : snapshot.facilities.length > 0
          ? "in_progress"
          : "not_started",
    blockers: unique,
    warnings: [...new Set(warnings)],
  };
}

export function emptyFacilitiesSnapshot(): Card5FacilitiesSnapshot {
  return {
    facilities: [],
    buildings: [],
    floors: [],
    wings: [],
    departments: [],
    staff: [],
    taxGroups: [],
    currencies: [],
  };
}

export function emptyFacilityDraft(partial?: Partial<Card5Facility>): Card5Facility {
  return {
    id: partial?.id ?? "",
    code: partial?.code ?? "",
    name: partial?.name ?? "",
    description: partial?.description ?? "",
    facilityCategory: partial?.facilityCategory ?? "other",
    facilityTypeCode: partial?.facilityTypeCode ?? "custom",
    buildingId: partial?.buildingId ?? null,
    floorId: partial?.floorId ?? null,
    wingId: partial?.wingId ?? null,
    departmentId: partial?.departmentId ?? null,
    managerUserId: partial?.managerUserId ?? null,
    responsibleRole: partial?.responsibleRole ?? null,
    minimumCapacity: partial?.minimumCapacity ?? null,
    standardCapacity: partial?.standardCapacity ?? null,
    maximumCapacity: partial?.maximumCapacity ?? null,
    operatingHours: emptyOperatingHours(partial?.operatingHours),
    chargeable: partial?.chargeable ?? null,
    revenueCenter: partial?.revenueCenter ?? "",
    taxGroupId: partial?.taxGroupId ?? null,
    currencyCode: partial?.currencyCode ?? null,
    reservationRequired: partial?.reservationRequired ?? null,
    advanceBookingRequired: partial?.advanceBookingRequired ?? null,
    minimumLeadMinutes: partial?.minimumLeadMinutes ?? null,
    availabilityMode: partial?.availabilityMode ?? "always_available",
    features: emptyFacilityFeatures(partial?.features),
    active: partial?.active !== false,
  };
}

export function parseFacilityCategory(value: unknown): Card5FacilityCategory {
  return CARD5_FACILITY_CATEGORIES.includes(value as Card5FacilityCategory)
    ? (value as Card5FacilityCategory)
    : "other";
}

export function parseAvailabilityMode(value: unknown): Card5AvailabilityMode {
  return CARD5_AVAILABILITY_MODES.includes(value as Card5AvailabilityMode)
    ? (value as Card5AvailabilityMode)
    : "always_available";
}

export function parseFacilityRole(value: unknown): StaffRole | null {
  return STAFF_ROLES.includes(value as StaffRole) ? (value as StaffRole) : null;
}

export { parseOperatingHours };
