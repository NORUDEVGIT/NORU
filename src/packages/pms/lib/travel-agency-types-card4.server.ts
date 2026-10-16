/**
 * Card 4 — Travel Agency Types catalogue helpers.
 *
 * Property Setup only. Operational travel agent accounts stay on guest_account_masters.
 * Values persist on pms_travel_agency_types (or fallback to defaults when unseeded).
 */

export type TravelAgencyTypeRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type TravelAgencyTypeDraft = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

export type TravelAgencyTypeFieldError = { field: string; message: string };

export const DEFAULT_TRAVEL_AGENCY_TYPES = [
  {
    name: "Online Travel Agency (OTA)",
    code: "OTA",
    description: "Online booking channels, portals, and aggregator platforms.",
    sortOrder: 10,
  },
  {
    name: "Traditional Travel Agency",
    code: "TRAD",
    description: "Brick-and-mortar retail travel agencies and travel consultancies.",
    sortOrder: 20,
  },
  {
    name: "Corporate Travel Agency",
    code: "CORP",
    description: "Business and corporate travel management specialists.",
    sortOrder: 30,
  },
  {
    name: "Leisure Travel Agency",
    code: "LEIS",
    description: "Vacation, holiday, cruise, and leisure travel specialists.",
    sortOrder: 40,
  },
  {
    name: "Business Travel Agency",
    code: "BIZ",
    description: "Commercial and corporate executive travel agencies.",
    sortOrder: 50,
  },
  {
    name: "Tour Operator",
    code: "TOUR",
    description: "Packages, organizes, and markets bundled travel and tours.",
    sortOrder: 60,
  },
  {
    name: "Wholesale Travel Agency",
    code: "WHSL",
    description: "B2B travel wholesalers, bedbanks, and room brokers.",
    sortOrder: 70,
  },
  {
    name: "Travel Management Company (TMC)",
    code: "TMC",
    description: "Full-service corporate travel management, policy, and reporting.",
    sortOrder: 80,
  },
  {
    name: "Destination Management Company (DMC)",
    code: "DMC",
    description: "Local ground handling, excursions, transport, and destination services.",
    sortOrder: 90,
  },
  {
    name: "Inbound Tour Operator",
    code: "INBD",
    description: "Specializes in handling foreign travelers arriving in the destination.",
    sortOrder: 100,
  },
  {
    name: "Outbound Tour Operator",
    code: "OTBD",
    description: "Specializes in arranging domestic clients traveling abroad.",
    sortOrder: 110,
  },
  {
    name: "Domestic Tour Operator",
    code: "DOM",
    description: "Specializes in domestic tours and intrastate travel experiences.",
    sortOrder: 120,
  },
  {
    name: "Travel Consolidator",
    code: "CONS",
    description: "Airline ticketing and hotel inventory volume consolidator.",
    sortOrder: 130,
  },
  {
    name: "Independent Travel Agent",
    code: "IND",
    description: "Home-based, freelance, or solo accredited travel advisors.",
    sortOrder: 140,
  },
  {
    name: "Government/Institutional Travel Agency",
    code: "GOVT",
    description: "Public sector, diplomatic, military, and NGO travel coordinators.",
    sortOrder: 150,
  },
  {
    name: "Specialty Travel Agency",
    code: "SPEC",
    description: "Adventure, medical, wellness, eco-tourism, or niche travel.",
    sortOrder: 160,
  },
  {
    name: "Other",
    code: "OTHR",
    description: "Other custom agency category (user enters custom details).",
    sortOrder: 170,
  },
] as const;

export function normalizeTravelAgencyTypeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeTravelAgencyTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function emptyTravelAgencyTypeDraft(): TravelAgencyTypeDraft {
  return {
    id: null,
    code: "",
    name: "",
    description: "",
    active: true,
    sortOrder: 0,
  };
}

export function validateTravelAgencyTypeDraft(
  draft: TravelAgencyTypeDraft,
  existing: readonly { id: string; name: string; code: string }[],
): TravelAgencyTypeFieldError[] {
  const errors: TravelAgencyTypeFieldError[] = [];
  const name = normalizeTravelAgencyTypeName(draft.name);
  const code = normalizeTravelAgencyTypeCode(draft.code);
  if (!name) errors.push({ field: "name", message: "Travel agency type name is required." });
  else if (name.length > 120) errors.push({ field: "name", message: "Name is too long." });
  if (!code) errors.push({ field: "code", message: "Code is required." });
  else if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) {
    errors.push({ field: "code", message: "Use 2–12 letters or numbers, starting with a letter." });
  }
  const clash = existing.find((row) => {
    if (draft.id && row.id === draft.id) return false;
    return (
      normalizeTravelAgencyTypeName(row.name).toLowerCase() === name.toLowerCase() ||
      normalizeTravelAgencyTypeCode(row.code) === code
    );
  });
  if (clash && normalizeTravelAgencyTypeName(clash.name).toLowerCase() === name.toLowerCase()) {
    errors.push({ field: "name", message: "A travel agency type with this name already exists." });
  }
  if (clash && normalizeTravelAgencyTypeCode(clash.code) === code) {
    errors.push({ field: "code", message: "A travel agency type with this code already exists." });
  }
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0 || draft.sortOrder > 999) {
    errors.push({ field: "sortOrder", message: "Sort order must be between 0 and 999." });
  }
  return errors;
}

export function travelAgencyTypesConfigured(types: readonly { name: string; code: string }[]): boolean {
  return (
    types.length > 0 &&
    types.every((row) => row.name.trim().length > 0 && row.code.trim().length > 0)
  );
}
