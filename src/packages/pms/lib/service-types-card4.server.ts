/**
 * Card 4 Guest Service Types — Service Types.
 *
 * Property Setup catalogue only. Child of pms_guest_service_categories.
 * Distinct from SET5 request-type catalogues and operational Guest Services.
 */

import type { ServiceCategoryRecord } from "./service-categories-card4.server";

export type ServiceTypeRecord = {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceTypeDraft = {
  id: string | null;
  categoryId: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  displayOrder: number;
};

export type ServiceTypeSnapshot = {
  categories: ServiceCategoryRecord[];
  types: ServiceTypeRecord[];
  lastUpdatedAt: string | null;
};

export type ServiceTypeError = { field: string; message: string };

export const DEFAULT_SERVICE_TYPES: Array<{
  categoryCode: string;
  name: string;
  code: string;
  description: string;
}> = [
  {
    categoryCode: "HK",
    name: "Extra Towels",
    code: "HK_TOWELS",
    description: "Deliver extra towels to the guest room.",
  },
  {
    categoryCode: "HK",
    name: "Room Cleaning",
    code: "HK_CLEAN",
    description: "Additional or on-demand room cleaning.",
  },
  {
    categoryCode: "HK",
    name: "Laundry",
    code: "HK_LAUNDRY",
    description: "Guest laundry collection and return.",
  },
  {
    categoryCode: "HK",
    name: "Turndown Service",
    code: "HK_TURNDOWN",
    description: "Evening turndown preparation.",
  },
  {
    categoryCode: "DIN",
    name: "Breakfast",
    code: "DIN_BKFST",
    description: "Breakfast reservation or in-room breakfast.",
  },
  {
    categoryCode: "DIN",
    name: "Room Service",
    code: "DIN_ROOM_SVC",
    description: "In-room dining orders.",
  },
  {
    categoryCode: "DIN",
    name: "Dinner Reservation",
    code: "DIN_DINNER",
    description: "Restaurant dinner reservation.",
  },
  {
    categoryCode: "TRN",
    name: "Airport Transfer",
    code: "TRN_AIRPORT",
    description: "Airport pickup or drop-off.",
  },
  {
    categoryCode: "TRN",
    name: "Taxi",
    code: "TRN_TAXI",
    description: "Taxi or ride arrangement.",
  },
  {
    categoryCode: "TRN",
    name: "Car Rental",
    code: "TRN_CAR",
    description: "Vehicle rental arrangement.",
  },
  {
    categoryCode: "WEL",
    name: "Spa",
    code: "WEL_SPA",
    description: "Spa treatment booking.",
  },
  {
    categoryCode: "WEL",
    name: "Fitness",
    code: "WEL_FITNESS",
    description: "Fitness or gym access request.",
  },
  {
    categoryCode: "WEL",
    name: "Wellness",
    code: "WEL_WELLNESS",
    description: "Wellness session booking.",
  },
  {
    categoryCode: "FO",
    name: "Wake-up Call",
    code: "FO_WAKE",
    description: "Scheduled wake-up call.",
  },
  {
    categoryCode: "FO",
    name: "Late Checkout",
    code: "FO_LATE_CO",
    description: "Late checkout request.",
  },
  {
    categoryCode: "FO",
    name: "Extra Bed",
    code: "FO_XBED",
    description: "Extra bed or crib request.",
  },
  {
    categoryCode: "MNT",
    name: "Plumbing",
    code: "MNT_PLUMB",
    description: "Plumbing issue in the guest room.",
  },
  {
    categoryCode: "MNT",
    name: "Electrical",
    code: "MNT_ELEC",
    description: "Electrical or lighting issue.",
  },
  {
    categoryCode: "MNT",
    name: "HVAC",
    code: "MNT_HVAC",
    description: "Heating or air-conditioning issue.",
  },
  {
    categoryCode: "CON",
    name: "Tour Booking",
    code: "CON_TOUR",
    description: "Local tour or activity booking.",
  },
  {
    categoryCode: "CON",
    name: "Restaurant Booking",
    code: "CON_REST",
    description: "Off-property restaurant reservation.",
  },
  {
    categoryCode: "CON",
    name: "Local Tips",
    code: "CON_LOCAL",
    description: "Local recommendations from concierge.",
  },
];

export function normalizeServiceTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeServiceTypeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

export function emptyServiceTypeDraft(categoryId = "", displayOrder = 1): ServiceTypeDraft {
  return {
    id: null,
    categoryId,
    name: "",
    code: "",
    description: "",
    active: true,
    displayOrder,
  };
}

export function serviceTypesConfigured(
  categories: readonly ServiceCategoryRecord[],
  types: readonly ServiceTypeRecord[],
): boolean {
  return types.some(
    (row) =>
      row.active &&
      categories.some((category) => category.id === row.categoryId && category.active),
  );
}

export function selectableServiceCategories(
  categories: readonly ServiceCategoryRecord[],
  currentCategoryId?: string | null,
): ServiceCategoryRecord[] {
  return categories.filter((row) => row.active || row.id === currentCategoryId);
}

export function validateServiceTypeDraft(
  draft: ServiceTypeDraft,
  existing: readonly { id: string; name: string; code: string; categoryId: string }[],
  categories: readonly { id: string; name: string; active: boolean }[],
): ServiceTypeError[] {
  const errors: ServiceTypeError[] = [];
  const name = normalizeServiceTypeName(draft.name);
  const code = normalizeServiceTypeCode(draft.code);
  const category = categories.find((row) => row.id === draft.categoryId);
  const current = existing.find((row) => row.id === draft.id);
  if (!draft.categoryId || !category) {
    errors.push({ field: "categoryId", message: "A service type must belong to a category." });
  } else if (!category.active && current?.categoryId !== draft.categoryId) {
    errors.push({
      field: "categoryId",
      message: "Only active categories can be used for new service types.",
    });
  }
  if (!name) errors.push({ field: "name", message: "Please enter a service type name." });
  else if (name.length > 80) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) {
    errors.push({
      field: "code",
      message: "Use 2–20 uppercase letters, numbers, or underscores, starting with a letter.",
    });
  }
  if (draft.description.length > 400) {
    errors.push({ field: "description", message: "Description must be 400 characters or fewer." });
  }
  if (!Number.isInteger(draft.displayOrder) || draft.displayOrder < 1) {
    errors.push({
      field: "displayOrder",
      message: "Display order must be a positive whole number.",
    });
  }
  const others = existing.filter((row) => row.id !== draft.id);
  if (
    others.some(
      (row) =>
        row.categoryId === draft.categoryId &&
        normalizeServiceTypeName(row.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push({
      field: "name",
      message: "A service type with this name already exists in this category.",
    });
  }
  if (others.some((row) => normalizeServiceTypeCode(row.code) === code)) {
    errors.push({ field: "code", message: "This service type code is already in use." });
  }
  return errors;
}
