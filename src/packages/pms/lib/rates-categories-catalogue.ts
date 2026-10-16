/**
 * NORU PMS — Predefined Rate Category Catalogue
 *
 * Canonical application-level catalogue containing the 20 approved predefined
 * hotel rate categories for Card 2 Rate & Pricing.
 *
 * Stored in hotel_rate_categories only when selected by the hotel property.
 */

import type { RateCategoryRow } from "./rates-card2.server";

export type PredefinedRateCategory = {
  /** The exact display name from the requirements document */
  name: string;
  /** Canonical database code */
  code: string;
  /** Canonical database name */
  persistedName: string;
  /** Compatible historical or alternative codes */
  legacyCodes?: readonly string[];
  /** Contextual description */
  description: string;
};

export const PREDEFINED_RATE_CATEGORIES: readonly PredefinedRateCategory[] = [
  {
    name: "Best Available Rate (BAR)",
    code: "BAR",
    persistedName: "Best Available Rate",
    description: "Standard flexible daily rate available to all guests.",
  },
  {
    name: "Rack Rate",
    code: "RACK_RATE",
    persistedName: "Rack Rate",
    legacyCodes: ["RACK"],
    description: "Official published retail rate before any discounts.",
  },
  {
    name: "Corporate",
    code: "CORPORATE",
    persistedName: "Corporate",
    legacyCodes: ["CORP"],
    description: "Negotiated rates for corporate accounts and business travelers.",
  },
  {
    name: "Government",
    code: "GOVERNMENT",
    persistedName: "Government",
    legacyCodes: ["GOV"],
    description: "Official rates for government officials and public institutions.",
  },
  {
    name: "Group",
    code: "GROUP",
    persistedName: "Group",
    legacyCodes: ["GRP"],
    description: "Contracted rates for group bookings and block reservations.",
  },
  {
    name: "Travel Agent",
    code: "TRAVEL_AGENT",
    persistedName: "Travel Agent",
    legacyCodes: ["TA"],
    description: "Rates for accredited travel agencies and booking agents.",
  },
  {
    name: "Tour Operator",
    code: "TOUR_OPERATOR",
    persistedName: "Tour Operator",
    legacyCodes: ["TO"],
    description: "Contracted rates for package tours and inbound tour operators.",
  },
  {
    name: "OTA",
    code: "OTA",
    persistedName: "OTA",
    description: "Online Travel Agency distribution rates (Expedia, Booking.com, etc.).",
  },
  {
    name: "Wholesale",
    code: "WHOLESALE",
    persistedName: "Wholesale",
    legacyCodes: ["WHL"],
    description: "Net non-commissionable rates for wholesale bedbanks and distributors.",
  },
  {
    name: "Promotional",
    code: "PROMOTIONAL",
    persistedName: "Promotional",
    legacyCodes: ["PROMO"],
    description: "Special promotional, seasonal marketing, or campaign rates.",
  },
  {
    name: "Package",
    code: "PACKAGE",
    persistedName: "Package",
    legacyCodes: ["PKG"],
    description: "Bundled rates combining room accommodation with meals or amenities.",
  },
  {
    name: "Long Stay",
    code: "LONG_STAY",
    persistedName: "Long Stay",
    description: "Discounted rates for extended stays (weekly or monthly).",
  },
  {
    name: "Early Booking",
    code: "EARLY_BOOKING",
    persistedName: "Early Booking",
    legacyCodes: ["EARLY_BIRD"],
    description: "Advance purchase rates booked well ahead of arrival.",
  },
  {
    name: "Last Minute",
    code: "LAST_MINUTE",
    persistedName: "Last Minute",
    description: "Special distressed inventory rates booked shortly before arrival.",
  },
  {
    name: "Member / Loyalty",
    code: "MEMBER_LOYALTY",
    persistedName: "Member / Loyalty",
    legacyCodes: ["LOYALTY", "MEMBER"],
    description: "Exclusive rates for guest loyalty program members.",
  },
  {
    name: "Walk-in",
    code: "WALK_IN",
    persistedName: "Walk-in",
    legacyCodes: ["WALKIN"],
    description: "Rates applied to guests arriving directly without prior booking.",
  },
  {
    name: "Employee / Staff",
    code: "EMPLOYEE_STAFF",
    persistedName: "Employee / Staff",
    legacyCodes: ["STAFF", "EMPLOYEE"],
    description: "Discounted or complimentary rates for hotel staff and colleagues.",
  },
  {
    name: "Complimentary",
    code: "COMPLIMENTARY",
    persistedName: "Complimentary",
    legacyCodes: ["COMP"],
    description: "Zero-charge accommodation for VIPs, marketing, or management approval.",
  },
  {
    name: "Contract",
    code: "CONTRACT",
    persistedName: "Contract",
    description: "Special contracted pricing for specific partners or long-term agreements.",
  },
  {
    name: "Seasonal",
    code: "SEASONAL",
    persistedName: "Seasonal",
    description: "Time-based rates varying across high, shoulder, and low seasons.",
  },
] as const;

/**
 * Normalizes category name for matching (strips parenthesized text, symbols, and whitespace).
 */
export function normalizeCategoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Checks whether a predefined rate category is already configured for this property.
 * Matches by code (canonical or legacy), exact name, or normalized name.
 */
export function isPredefinedCategoryConfigured(
  preset: PredefinedRateCategory,
  configured: readonly RateCategoryRow[],
): boolean {
  const presetCode = preset.code.toUpperCase().trim();
  const presetLegacy = (preset.legacyCodes ?? []).map((c) => c.toUpperCase().trim());
  const presetNorm1 = normalizeCategoryKey(preset.name);
  const presetNorm2 = normalizeCategoryKey(preset.persistedName);
  const presetNameLower = preset.name.toLowerCase().trim();
  const presetPersistedLower = preset.persistedName.toLowerCase().trim();

  return configured.some((row) => {
    const rowCode = (row.code ?? "").toUpperCase().trim();
    if (rowCode === presetCode || presetLegacy.includes(rowCode)) {
      return true;
    }
    const rowNameLower = (row.name ?? "").toLowerCase().trim();
    if (rowNameLower === presetNameLower || rowNameLower === presetPersistedLower) {
      return true;
    }
    const rowNorm = normalizeCategoryKey(row.name ?? "");
    if (rowNorm && (rowNorm === presetNorm1 || rowNorm === presetNorm2)) {
      return true;
    }
    return false;
  });
}

/**
 * Finds a matching predefined category by name or code.
 * Used to block custom category creation when the user enters an existing preset.
 */
export function findMatchingPredefinedCategory(
  name: string,
  code?: string,
): PredefinedRateCategory | undefined {
  const normName = normalizeCategoryKey(name);
  const lowerName = name.toLowerCase().trim();
  const upperCode = code ? code.toUpperCase().trim() : "";

  return PREDEFINED_RATE_CATEGORIES.find((preset) => {
    if (upperCode) {
      if (preset.code.toUpperCase() === upperCode) return true;
      if (preset.legacyCodes?.some((lc) => lc.toUpperCase() === upperCode)) return true;
    }
    if (lowerName && (preset.name.toLowerCase().trim() === lowerName || preset.persistedName.toLowerCase().trim() === lowerName)) {
      return true;
    }
    const pNorm1 = normalizeCategoryKey(preset.name);
    const pNorm2 = normalizeCategoryKey(preset.persistedName);
    return normName && (normName === pNorm1 || normName === pNorm2);
  });
}
