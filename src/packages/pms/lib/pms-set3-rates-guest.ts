/**
 * PMS-SET3 — Rates & meal-plan rules · Guest profile rules (Issue #68).
 *
 * Live inspect locks:
 * - Rates workspace is LIVE at /restaurant/pms/rates-revenue. No second calendar.
 * - hotel_rate_plans has `active` only. Count active plans; do not invent extra flags.
 * - Guest Profile module is LIVE at /restaurant/pms/guests. No second CRM.
 * - Create guest today requires first name only. After Save, Settings rules
 *   become the source of truth (first name + phone|email + consent defaults).
 * - Single expanding Activate on pms_set1_live. Meal / packages / ID / VIP
 *   empty = Warning, same pattern as SET2 amenities.
 * - 0049 tables/columns are additive and may be absent — never crash.
 */

import type { Set1DomainReport, Set1Readiness } from "./pms-set1-foundation.ts";

export const SET3_RATES_HREF = "/restaurant/pms/rates-revenue";
export const SET3_GUESTS_HREF = "/restaurant/pms/guests";
export const SET3_RATES_UNAVAILABLE = "Unavailable — meal and package catalogues are not applied yet.";
export const SET3_GUEST_RULES_UNAVAILABLE = "Unavailable — guest profile rules are not applied yet.";
export const SET3_ID_VIP_UNAVAILABLE = "Unavailable — ID type and VIP catalogues are not applied yet.";
export const SET3_MEALS_WARNING = "No meal plans in the catalogue yet. This is a warning, not a block.";
export const SET3_PACKAGES_WARNING = "No packages in the catalogue yet. This is a warning, not a block.";
export const SET3_ID_TYPES_WARNING = "No ID types in the catalogue yet. This is a warning, not a block.";
export const SET3_VIP_WARNING = "No VIP levels in the catalogue yet. This is a warning, not a block.";
export const SET3_GUEST_RULES_UNSAVED = "Guest profile rules are a draft until you save. First name plus phone or email, and consent defaults, become required after Save.";
export const SET3_CONTACT_REQUIRED = "Enter a phone number or email address.";
export const SET3_AUDIT_MEAL = "pms_set3_meal_updated";
export const SET3_AUDIT_PACKAGE = "pms_set3_package_updated";
export const SET3_AUDIT_GUEST_RULES = "pms_set3_guest_rules_updated";
export const SET3_AUDIT_ID_TYPE = "pms_set3_id_type_updated";
export const SET3_AUDIT_VIP = "pms_set3_vip_updated";
export const SET3_AUDIT_ACTIONS = [
  SET3_AUDIT_MEAL,
  SET3_AUDIT_PACKAGE,
  SET3_AUDIT_GUEST_RULES,
  SET3_AUDIT_ID_TYPE,
  SET3_AUDIT_VIP,
] as const;

export const MEAL_PLAN_TYPES = [
  "room_only",
  "breakfast",
  "half_board",
  "full_board",
  "all_inclusive",
  "custom",
] as const;
export type MealPlanType = (typeof MEAL_PLAN_TYPES)[number];

export const MEAL_PLAN_TYPE_LABELS: Record<MealPlanType, string> = {
  room_only: "Room only",
  breakfast: "Breakfast",
  half_board: "Half board",
  full_board: "Full board",
  all_inclusive: "All inclusive",
  custom: "Custom",
};

export const PACKAGE_TYPES = ["accommodation", "business", "romantic", "conference", "custom"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  accommodation: "Accommodation",
  business: "Business",
  romantic: "Romantic",
  conference: "Conference",
  custom: "Custom",
};

export const TAX_POSTURES = ["inclusive", "exclusive", "inherit"] as const;
export type TaxPosture = (typeof TAX_POSTURES)[number];

export const TAX_POSTURE_LABELS: Record<TaxPosture, string> = {
  inclusive: "Inclusive",
  exclusive: "Exclusive",
  inherit: "Inherit property tax",
};

export type PmsMealPlan = {
  id: string;
  code: string;
  name: string;
  type: MealPlanType;
  active: boolean;
  included: string[];
  chargeable: string[];
  applicableOutletIds: string[];
  taxPosture: TaxPosture;
};

export type PmsPackage = {
  id: string;
  type: PackageType;
  code: string;
  name: string;
  active: boolean;
  inclusion: string[];
};

export type PmsGuestIdType = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type PmsGuestVipLevel = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type GuestRequiredFields = {
  firstName: boolean;
  lastName: boolean;
  phone: boolean;
  email: boolean;
};

export type GuestConsentDefaults = {
  marketing: boolean;
  dataProcessing: boolean;
};

export type GuestProfileRules = {
  requiredFields: GuestRequiredFields;
  consentDefaults: GuestConsentDefaults;
  companyRelationshipEnabled: boolean;
  savedAt: string | null;
};

export type RatePackageRules = {
  savedAt: string | null;
};

export type Set3ActivateInput = {
  activeRatePlanCount: number;
  mealPlansAvailable: boolean;
  mealPlanCount: number;
  packagesAvailable: boolean;
  packageCount: number;
  guestRulesAvailable: boolean;
  guestRulesSaved: boolean;
  guestMinComplete: boolean;
  idTypesAvailable: boolean;
  idTypeCount: number;
  vipLevelsAvailable: boolean;
  vipLevelCount: number;
};

export type Set3Snapshot = {
  activeRatePlanCount: number;
  mealPlansAvailable: boolean;
  packagesAvailable: boolean;
  guestRulesAvailable: boolean;
  idVipAvailable: boolean;
  mealPlans: PmsMealPlan[];
  packages: PmsPackage[];
  idTypes: PmsGuestIdType[];
  vipLevels: PmsGuestVipLevel[];
  guestRules: GuestProfileRules;
  ratePackageRules: RatePackageRules;
};

export function emptyGuestProfileRules(partial?: Partial<GuestProfileRules>): GuestProfileRules {
  return {
    companyRelationshipEnabled: partial?.companyRelationshipEnabled ?? false,
    savedAt: partial?.savedAt ?? null,
    requiredFields: {
      firstName: true,
      lastName: partial?.requiredFields?.lastName === true,
      phone: partial?.requiredFields?.phone !== false,
      email: partial?.requiredFields?.email === true,
    },
    consentDefaults: {
      marketing: partial?.consentDefaults?.marketing === true,
      dataProcessing: partial?.consentDefaults?.dataProcessing !== false,
    },
  };
}

export function emptyRatePackageRules(partial?: Partial<RatePackageRules>): RatePackageRules {
  return { savedAt: null, ...partial };
}

export function emptySet3Activate(partial?: Partial<Set3ActivateInput>): Set3ActivateInput {
  return {
    activeRatePlanCount: 0,
    mealPlansAvailable: false,
    mealPlanCount: 0,
    packagesAvailable: false,
    packageCount: 0,
    guestRulesAvailable: false,
    guestRulesSaved: false,
    guestMinComplete: false,
    idTypesAvailable: false,
    idTypeCount: 0,
    vipLevelsAvailable: false,
    vipLevelCount: 0,
    ...partial,
  };
}

export function completeSet3Activate(partial?: Partial<Set3ActivateInput>): Set3ActivateInput {
  return emptySet3Activate({
    activeRatePlanCount: 1,
    mealPlansAvailable: true,
    mealPlanCount: 1,
    packagesAvailable: true,
    packageCount: 1,
    guestRulesAvailable: true,
    guestRulesSaved: true,
    guestMinComplete: true,
    idTypesAvailable: true,
    idTypeCount: 1,
    vipLevelsAvailable: true,
    vipLevelCount: 1,
    ...partial,
  });
}

export function emptySet3Snapshot(partial?: Partial<Set3Snapshot>): Set3Snapshot {
  return {
    activeRatePlanCount: 0,
    mealPlansAvailable: false,
    packagesAvailable: false,
    guestRulesAvailable: false,
    idVipAvailable: false,
    mealPlans: [],
    packages: [],
    idTypes: [],
    vipLevels: [],
    guestRules: emptyGuestProfileRules(),
    ratePackageRules: emptyRatePackageRules(),
    ...partial,
  };
}

export function activateInputFromSet3Snapshot(snapshot: Set3Snapshot): Set3ActivateInput {
  return {
    activeRatePlanCount: snapshot.activeRatePlanCount,
    mealPlansAvailable: snapshot.mealPlansAvailable,
    mealPlanCount: snapshot.mealPlans.filter((row) => row.active).length,
    packagesAvailable: snapshot.packagesAvailable,
    packageCount: snapshot.packages.filter((row) => row.active).length,
    guestRulesAvailable: snapshot.guestRulesAvailable,
    guestRulesSaved: Boolean(snapshot.guestRules.savedAt),
    guestMinComplete: guestMinComplete(snapshot.guestRules, snapshot.guestRulesAvailable),
    idTypesAvailable: snapshot.idVipAvailable,
    idTypeCount: snapshot.idTypes.filter((row) => row.active).length,
    vipLevelsAvailable: snapshot.idVipAvailable,
    vipLevelCount: snapshot.vipLevels.filter((row) => row.active).length,
  };
}

export function parseMealPlanType(value: unknown): MealPlanType | "" {
  return (MEAL_PLAN_TYPES as readonly string[]).includes(String(value)) ? (value as MealPlanType) : "";
}

export function parsePackageType(value: unknown): PackageType | "" {
  return (PACKAGE_TYPES as readonly string[]).includes(String(value)) ? (value as PackageType) : "";
}

export function parseTaxPosture(value: unknown): TaxPosture {
  return (TAX_POSTURES as readonly string[]).includes(String(value)) ? (value as TaxPosture) : "inherit";
}

export function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export function parseGuestProfileRules(value: unknown): GuestProfileRules {
  if (!value || typeof value !== "object") return emptyGuestProfileRules();
  const rec = value as {
    requiredFields?: Partial<GuestRequiredFields>;
    consentDefaults?: Partial<GuestConsentDefaults>;
    companyRelationshipEnabled?: unknown;
    savedAt?: unknown;
  };
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  if (!savedAt) return emptyGuestProfileRules();
  return emptyGuestProfileRules({
    requiredFields: {
      firstName: true,
      lastName: rec.requiredFields?.lastName === true,
      phone: rec.requiredFields?.phone === true,
      email: rec.requiredFields?.email === true,
    },
    consentDefaults: {
      marketing: rec.consentDefaults?.marketing === true,
      dataProcessing: rec.consentDefaults?.dataProcessing !== false,
    },
    companyRelationshipEnabled: rec.companyRelationshipEnabled === true,
    savedAt,
  });
}

export function parseRatePackageRules(value: unknown): RatePackageRules {
  if (!value || typeof value !== "object") return emptyRatePackageRules();
  const rec = value as { savedAt?: unknown };
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  return emptyRatePackageRules({ savedAt });
}

/** Count honesty: active rate plans only. There is no extra sale-flag column. */
export function countActiveRatePlans(rows: Array<{ active?: boolean | null }>): number {
  return rows.filter((row) => row.active === true).length;
}

export function ratesMandatoryComplete(input: Pick<Set3ActivateInput, "activeRatePlanCount">): boolean {
  return input.activeRatePlanCount >= 1;
}

export function guestContactMinMet(phone: string | null | undefined, email: string | null | undefined): boolean {
  return Boolean(String(phone ?? "").trim() || String(email ?? "").trim());
}

export function guestMinFieldsComplete(rules: GuestProfileRules): boolean {
  if (!rules.savedAt) return false;
  if (!rules.requiredFields.firstName) return false;
  if (!rules.requiredFields.phone && !rules.requiredFields.email) return false;
  if (typeof rules.consentDefaults.marketing !== "boolean") return false;
  if (typeof rules.consentDefaults.dataProcessing !== "boolean") return false;
  return true;
}

export function guestMinComplete(rules: GuestProfileRules, guestRulesAvailable: boolean): boolean {
  return guestRulesAvailable && guestMinFieldsComplete(rules);
}

export function guestCreateBlocked(
  rules: GuestProfileRules | null | undefined,
  input: {
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    phone?: string | null | undefined;
    email?: string | null | undefined;
  },
): string | null {
  if (!rules?.savedAt) return null;
  if (!String(input.firstName ?? "").trim()) return "First name is required.";
  if (rules.requiredFields.lastName && !String(input.lastName ?? "").trim()) return "Last name is required.";
  if (!guestContactMinMet(input.phone, input.email)) return SET3_CONTACT_REQUIRED;
  return null;
}

export function guestRulesSaveBlocked(rules: GuestProfileRules): string | null {
  if (!rules.requiredFields.firstName) return "First name stays required.";
  if (!rules.requiredFields.phone && !rules.requiredFields.email) {
    return "Require a phone number or an email address.";
  }
  return null;
}

function domain(id: Set1DomainReport["id"], missing: string[], warnings: string[]): Set1DomainReport {
  const readiness: Set1Readiness = missing.length ? "incomplete" : warnings.length ? "warning" : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluateRates(input: Set3ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (input.activeRatePlanCount < 1) missing.push("Active rate plan");
  if (!input.mealPlansAvailable) warnings.push(SET3_RATES_UNAVAILABLE);
  else if (input.mealPlanCount === 0) warnings.push(SET3_MEALS_WARNING);
  if (!input.packagesAvailable) {
    if (!warnings.includes(SET3_RATES_UNAVAILABLE)) warnings.push(SET3_RATES_UNAVAILABLE);
  } else if (input.packageCount === 0) warnings.push(SET3_PACKAGES_WARNING);
  return domain("rates", missing, warnings);
}

export function evaluateGuestProfile(input: Set3ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.guestRulesAvailable) {
    missing.push("Guest profile rules");
    warnings.push(SET3_GUEST_RULES_UNAVAILABLE);
  } else if (!input.guestRulesSaved || !input.guestMinComplete) {
    missing.push("Guest profile rules");
    if (!input.guestRulesSaved) warnings.push(SET3_GUEST_RULES_UNSAVED);
  }
  if (!input.idTypesAvailable || !input.vipLevelsAvailable) warnings.push(SET3_ID_VIP_UNAVAILABLE);
  else {
    if (input.idTypeCount === 0) warnings.push(SET3_ID_TYPES_WARNING);
    if (input.vipLevelCount === 0) warnings.push(SET3_VIP_WARNING);
  }
  return domain("guest-profile", missing, warnings);
}

export function set3MandatoryMissing(input: Set3ActivateInput): string[] {
  return [...evaluateRates(input).missing, ...evaluateGuestProfile(input).missing];
}
