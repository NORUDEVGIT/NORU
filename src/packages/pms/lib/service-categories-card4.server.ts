/**
 * Card 4 Guest Service Types — Service Categories.
 *
 * Property Setup catalogue only. Distinct from SET5 pms_guest_request_types
 * and from operational Guest Services requests.
 */

export type ServiceCategoryRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceCategoryDraft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  active: boolean;
  displayOrder: number;
};

export type ServiceCategorySnapshot = {
  categories: ServiceCategoryRecord[];
  lastUpdatedAt: string | null;
};

export type ServiceCategoryError = { field: string; message: string };

export const DEFAULT_SERVICE_CATEGORIES = [
  {
    name: "Housekeeping",
    code: "HK",
    description: "Services related to housekeeping and room cleaning.",
  },
  {
    name: "Dining",
    code: "DIN",
    description: "In-stay dining and room-service requests.",
  },
  {
    name: "Transportation",
    code: "TRN",
    description: "Airport transfers, taxis and vehicle arrangements.",
  },
  {
    name: "Wellness",
    code: "WEL",
    description: "Spa, fitness and wellness services.",
  },
  {
    name: "Front Office",
    code: "FO",
    description: "Front-office guest assistance services.",
  },
  {
    name: "Maintenance",
    code: "MNT",
    description: "In-room and property maintenance requests.",
  },
  {
    name: "Concierge",
    code: "CON",
    description: "Concierge arrangements and guest experience services.",
  },
] as const;

export function normalizeServiceCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeServiceCategoryCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

export function emptyServiceCategoryDraft(displayOrder = 1): ServiceCategoryDraft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    active: true,
    displayOrder,
  };
}

export function serviceCategoriesConfigured(categories: readonly ServiceCategoryRecord[]): boolean {
  return categories.length > 0;
}

export function validateServiceCategoryDraft(
  draft: ServiceCategoryDraft,
  existing: readonly { id: string; name: string; code: string }[],
): ServiceCategoryError[] {
  const errors: ServiceCategoryError[] = [];
  const name = normalizeServiceCategoryName(draft.name);
  const code = normalizeServiceCategoryCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Please enter a category name." });
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
      (row) => normalizeServiceCategoryName(row.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push({ field: "name", message: "A category with this name already exists." });
  }
  if (others.some((row) => normalizeServiceCategoryCode(row.code) === code)) {
    errors.push({ field: "code", message: "This category code is already in use." });
  }
  return errors;
}
