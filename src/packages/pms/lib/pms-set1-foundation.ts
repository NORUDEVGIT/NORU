/**
 * PMS-SET1 — Foundation Settings contract (Issue #59).
 *
 * Identity, CI/CO, thin taxes, policies/fees, and go-live checklist.
 * 0047 columns are additive and may be absent at runtime — never crash.
 */

import {
  canEditFoFeeDefaults,
  feeDefaultAmountAllowed,
  type FoFeeDefaults,
} from "./fo-fee-defaults.ts";
import {
  emptySet2Activate,
  evaluateOutlets,
  evaluateRooms,
  evaluateStructure,
  set2MandatoryMissing,
  type Set2ActivateInput,
} from "./pms-set2-structure.ts";
import {
  emptySet3Activate,
  evaluateGuestProfile,
  evaluateRates,
  ratesMandatoryComplete,
  set3MandatoryMissing,
  type Set3ActivateInput,
} from "./pms-set3-rates-guest.ts";
import {
  emptySet4Activate,
  evaluateHousekeeping,
  evaluateMaintenance,
  evaluateRoomInventory,
  hkStatusesMandatoryComplete,
  oooOosMandatoryComplete,
  set4MandatoryMissing,
  type Set4ActivateInput,
} from "./pms-set4-hk-inventory.ts";
import {
  emptySet5Activate,
  evaluateAdminControls,
  evaluateDepartments,
  evaluateGuestServiceTypes,
  evaluateIntegrations,
  evaluateNotifications,
  evaluateSecurityAudit,
  set5MandatoryMissing,
  type Set5ActivateInput,
} from "./pms-set5-depts-guestsvc.ts";

function calendarToday(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const SET1_TITLE = "Settings";
export const SET1_FOUNDATION_CHIP = "Foundation";
export const SET1_HUB_HREF = "/restaurant/settings";
export const SET1_PMS_BACK_HREF = "/restaurant/pms";
export const SET1_AUDIT_ACTION = "pms_set1_updated";
export const SET1_DENIED =
  "Only a supervisor, manager or property admin can edit property settings.";
export const SET1_ACTIVATE_DENIED = "Only the property owner can activate Foundation settings.";
export const SET1_BUSINESS_DATE_COPY =
  "Business date advances when Night Audit closes.";
export const SET1_OPS_HELPER =
  "Front Office uses these times to judge early check-in and late check-out. Night Audit owns the business-date roll.";
export const SET1_TAX_HONESTY = "Changes apply to new postings only. Closed folios are not rewritten.";
export const SET1_TAX_RM_SHARE =
  "This is the same 0038 property tax the Restaurant Management till uses. Extra named rates are not in this wave.";
export const SET1_CI_CO_EQUAL_WARNING = "Check-out is the same as check-in. Confirm this is intended.";
export const SET1_COLUMNS_UNAVAILABLE = "Unavailable — foundation columns are not applied yet.";
export const SET1_ACTIVATE_LABEL = "Go live / Activate property";

export const SET1_EDIT_ROLES = ["owner", "manager"] as const;
export const SET1_ACTIVATE_ROLES = ["owner"] as const;

export const SET1_SECTION_HASHES = [
  "identity",
  "ops",
  "taxes",
  "policies",
  "structure",
  "rooms",
  "outlets",
  "rates",
  "guest-profile",
  "housekeeping-rules",
  "room-inventory-rules",
  "maintenance-rules",
  "departments",
  "guest-services-types",
  "notifications",
  "admin-controls",
  "integrations",
  "security-audit",
  "golive",
] as const;
export type Set1SectionId = (typeof SET1_SECTION_HASHES)[number];
export const SET1_FOUNDATION_HASHES = ["identity", "ops", "taxes", "policies"] as const;
export const SET2_LIVE_HASHES = ["structure", "rooms", "outlets"] as const;
export const SET3_LIVE_HASHES = ["rates", "guest-profile"] as const;
export const SET4_LIVE_HASHES = ["housekeeping-rules", "room-inventory-rules", "maintenance-rules"] as const;
export const SET5_LIVE_HASHES = [
  "departments",
  "guest-services-types",
  "notifications",
  "admin-controls",
  "integrations",
  "security-audit",
] as const;

export type Set1Readiness = "complete" | "warning" | "incomplete" | "blocked";
export type Set1Overall = "ready" | "warning" | "blocked";

export const PROPERTY_TYPES = ["hotel", "guesthouse", "apartment_hotel", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  hotel: "Hotel",
  guesthouse: "Guesthouse",
  apartment_hotel: "Apartment hotel",
  other: "Other",
};

export const FEE_BASES = ["percent_stay", "fixed", "first_night"] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const FEE_BASIS_LABELS: Record<FeeBasis, string> = {
  percent_stay: "Percent of stay",
  fixed: "Fixed amount",
  first_night: "First night",
};

export const DEPOSIT_TYPES = ["none", "percent", "fixed", "first_night"] as const;
export type DepositType = (typeof DEPOSIT_TYPES)[number];

export const DEPOSIT_TYPE_LABELS: Record<DepositType, string> = {
  none: "None",
  percent: "Percent",
  fixed: "Fixed amount",
  first_night: "First night",
};

export type TaxIdentity = { label: string; value: string };

// After SET5 Live, Coming soon is SET6 only. Banks and Roles are not SET5 Live.
export const SET1_COMING_SOON: { wave: string; title: string; purpose: string }[] = [
  { wave: "SET6", title: "Sales", purpose: "Group sales and events — no forms in this wave." },
  { wave: "SET6", title: "Distribution", purpose: "Channel and direct-booking distribution — no forms in this wave." },
  { wave: "SET6", title: "Reports", purpose: "Property reports beyond today’s live modules — no forms in this wave." },
  { wave: "SET6", title: "Offline", purpose: "Offline operations — no forms in this wave." },
];

export const SET1_LIVE_CARDS: {
  id: Set1SectionId;
  title: string;
  purpose: string;
}[] = [
  { id: "identity", title: "Identity", purpose: "Name, logo, address and document header." },
  { id: "ops", title: "Check-in & business date", purpose: "Check-in and check-out times in the property timezone." },
  { id: "taxes", title: "Taxes", purpose: "Inclusive or exclusive room-stay rate and service charge." },
  { id: "policies", title: "Policies & fees", purpose: "Cancel, no-show, deposit, early check-in and late check-out." },
  { id: "structure", title: "Structure", purpose: "Buildings, floors and wings." },
  { id: "rooms", title: "Rooms & amenities", purpose: "Deep-link to Room Inventory. Amenities catalogue CRUD is here; attach stays on room types." },
  { id: "outlets", title: "Outlets", purpose: "Revenue outlets. Folio posting routes stay on the existing engine." },
  { id: "rates", title: "Rates & meal plans", purpose: "Deep-link to the rates workspace. Meal and package catalogues live here." },
  { id: "guest-profile", title: "Guest profile rules", purpose: "Required fields, consent defaults, ID types and VIP levels. Profiles stay on the guest directory." },
  { id: "housekeeping-rules", title: "Housekeeping rules", purpose: "Status labels and cleaning posture. Deep-link to Housekeeping — no second board." },
  { id: "room-inventory-rules", title: "Room inventory rules", purpose: "OOO and OOS meaning. Deep-link to Room Inventory. This is not stock inventory." },
  { id: "maintenance-rules", title: "Maintenance rules", purpose: "Categories, priorities, type tags and thin SLA. Deep-link to Maintenance — not a work-order system." },
  { id: "departments", title: "Departments", purpose: "Department and work-centre catalogue. Empty is a warning, not a block." },
  { id: "guest-services-types", title: "Guest services types", purpose: "Request-type catalogue only. Deep-link to Guest Services — not Guest Profile." },
  { id: "notifications", title: "Notifications", purpose: "Email, SMS and in-app channels and templates. Not an ESP. WhatsApp stays future." },
  { id: "admin-controls", title: "Admin controls", purpose: "Thin numbering, approvals and override. Deep-link to Administration — not a second staff manager." },
  { id: "integrations", title: "Integrations", purpose: "Connection status on Settings. POS charge-to-room is live; other connectors stay Foundation." },
  { id: "security-audit", title: "Security & audit", purpose: "Session and retention posture plus thin sensitive-data flags. Not IAM." },
  { id: "golive", title: "Go-live", purpose: "Foundation plus structure, rooms, outlets, rates, guest rules, housekeeping, room inventory, maintenance and SET5 catalogues. One owner Activate. SET5 warnings do not block." },
];

export type Set1IdentityDraft = {
  name: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  timezone: string;
  currencyCode: string;
  propertyCode: string;
  legalName: string;
  propertyType: PropertyType | "";
  taxIdentities: TaxIdentity[];
};

export type Set1OpsDraft = {
  checkInTime: string;
  checkOutTime: string;
  hotelDayOpen: boolean;
};

export type Set1TaxesDraft = {
  taxInclusive: boolean;
  taxName: string;
  taxRate: number;
  serviceEnabled: boolean;
  serviceRate: number;
};

export type Set1PoliciesDraft = {
  cancelWindowHours: string;
  cancelFeeBasis: FeeBasis | "";
  noshowFeeBasis: FeeBasis | "";
  depositRequired: boolean;
  depositType: DepositType | "";
  depositValue: string;
  earlyCheckinAllowed: boolean;
  earlyCheckinFee: string;
  earlyCheckinNeedsApproval: boolean;
  lateCheckoutAllowed: boolean;
  lateCheckoutFee: string;
  lateCheckoutNeedsApproval: boolean;
  fees: FoFeeDefaults;
};

export type Set1Foundation = {
  identity: Set1IdentityDraft;
  ops: Set1OpsDraft;
  taxes: Set1TaxesDraft;
  policies: Set1PoliciesDraft;
  businessDate: string | null;
  timezone: string;
  pmsSet1Live: boolean;
  foundationColumnsAvailable: boolean;
};

export type Set1DomainReport = {
  id: Set1SectionId;
  readiness: Set1Readiness;
  missing: string[];
  warnings: string[];
};

export type Set1Checklist = {
  overall: Set1Overall;
  domains: Record<Set1SectionId, Set1DomainReport>;
  mandatoryMissing: string[];
  canActivate: boolean;
};

export function canEditSet1(role: string): boolean {
  return (SET1_EDIT_ROLES as readonly string[]).includes(role);
}

export function canActivateSet1(role: string): boolean {
  return (SET1_ACTIVATE_ROLES as readonly string[]).includes(role);
}

export function canOpenSet1Hub(role: string): boolean {
  return canEditSet1(role);
}

export function isSet1SectionHash(hash: string): hash is Set1SectionId {
  const id = hash.replace(/^#/, "");
  return (SET1_SECTION_HASHES as readonly string[]).includes(id);
}

export function propertySetupRedirectHref(hash = ""): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return SET1_HUB_HREF;
  if (raw === "cancel-noshow-fees") return `${SET1_HUB_HREF}#policies`;
  return `${SET1_HUB_HREF}#${raw}`;
}

export function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the") ||
    /column .* (was )?not found/.test(msg)
  );
}

export function parsePropertyType(value: unknown): PropertyType | "" {
  return (PROPERTY_TYPES as readonly string[]).includes(String(value)) ? (value as PropertyType) : "";
}

export function parseFeeBasis(value: unknown): FeeBasis | "" {
  return (FEE_BASES as readonly string[]).includes(String(value)) ? (value as FeeBasis) : "";
}

export function parseDepositType(value: unknown): DepositType | "" {
  return (DEPOSIT_TYPES as readonly string[]).includes(String(value)) ? (value as DepositType) : "";
}

export function parseTaxIdentities(value: unknown): TaxIdentity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as { label?: unknown; value?: unknown };
      const label = String(rec.label ?? "").trim();
      const item = String(rec.value ?? "").trim();
      if (!label && !item) return null;
      return { label, value: item };
    })
    .filter((row): row is TaxIdentity => row !== null);
}

export function normalizeClock(value: string | null | undefined): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatClockLabel(value: string, timezone: string): string {
  const clock = normalizeClock(value);
  if (!clock) return "Not set";
  return `${clock} (${timezone.replace(/_/g, " ")})`;
}

export function displayedBusinessDate(businessDate: string | null | undefined, timezone: string): string {
  return businessDate?.trim() || calendarToday(timezone);
}

export function ciCoEqual(checkInTime: string, checkOutTime: string): boolean {
  const ci = normalizeClock(checkInTime);
  const co = normalizeClock(checkOutTime);
  return Boolean(ci && co && ci === co);
}

export function taxModeSet(taxInclusive: boolean | null | undefined): boolean {
  return typeof taxInclusive === "boolean";
}

export function namedTaxRateComplete(taxName: string | null | undefined, taxRate: number | null | undefined): boolean {
  return Boolean(String(taxName ?? "").trim()) && Number.isFinite(Number(taxRate));
}

export function feeDefaultsPresent(fees: FoFeeDefaults | null | undefined): boolean {
  if (!fees) return false;
  if (typeof fees.cancelFeeRequired !== "boolean" || typeof fees.noshowFeeRequired !== "boolean") return false;
  return feeDefaultAmountAllowed(fees.cancelFeeDefault) && feeDefaultAmountAllowed(fees.noshowFeeDefault);
}

export function identityMandatoryComplete(identity: Pick<Set1IdentityDraft, "name" | "timezone" | "currencyCode">): boolean {
  return identity.name.trim().length >= 2 && Boolean(identity.timezone.trim()) && Boolean(identity.currencyCode.trim());
}

export function opsMandatoryComplete(ops: Set1OpsDraft, foundationColumnsAvailable: boolean): boolean {
  if (!foundationColumnsAvailable) return false;
  return Boolean(normalizeClock(ops.checkInTime) && normalizeClock(ops.checkOutTime));
}

export function taxesMandatoryComplete(taxes: Set1TaxesDraft, foundationColumnsAvailable: boolean): boolean {
  if (!taxModeSet(taxes.taxInclusive) || !Number.isFinite(Number(taxes.taxRate))) return false;
  if (!foundationColumnsAvailable) return false;
  return namedTaxRateComplete(taxes.taxName, taxes.taxRate);
}

export type DocumentHeaderInput = {
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  phone: string;
  email: string;
  logoUrl: string;
};

export function buildDocumentHeader(input: DocumentHeaderInput): {
  name: string;
  lines: string[];
  logoUrl: string | null;
} {
  const street = [input.address, [input.city, input.postcode].filter(Boolean).join(" "), input.country]
    .map((part) => part.trim())
    .filter(Boolean);
  const contact = [input.phone.trim(), input.email.trim()].filter(Boolean);
  return {
    name: input.name.trim() || "Property",
    lines: [...street, ...contact],
    logoUrl: input.logoUrl.trim() || null,
  };
}

export function evaluateIdentity(identity: Set1IdentityDraft, foundationColumnsAvailable: boolean): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (identity.name.trim().length < 2) missing.push("Display name");
  if (!identity.timezone.trim()) missing.push("Timezone");
  if (!identity.currencyCode.trim()) missing.push("Currency");
  if (!foundationColumnsAvailable) {
    warnings.push(SET1_COLUMNS_UNAVAILABLE);
  } else {
    if (!identity.propertyCode.trim()) warnings.push("Property code not set");
    if (!identity.legalName.trim()) warnings.push("Legal name not set");
    if (!identity.propertyType) warnings.push("Property type not set");
    if (identity.taxIdentities.length === 0) warnings.push("No tax identity on file");
  }
  return {
    id: "identity",
    readiness: missing.length ? "incomplete" : warnings.length ? "warning" : "complete",
    missing,
    warnings,
  };
}

export function evaluateOps(ops: Set1OpsDraft, foundationColumnsAvailable: boolean): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!foundationColumnsAvailable) {
    return {
      id: "ops",
      readiness: "incomplete",
      missing: ["Check-in time", "Check-out time"],
      warnings: [SET1_COLUMNS_UNAVAILABLE],
    };
  }
  if (!normalizeClock(ops.checkInTime)) missing.push("Check-in time");
  if (!normalizeClock(ops.checkOutTime)) missing.push("Check-out time");
  if (!missing.length && ciCoEqual(ops.checkInTime, ops.checkOutTime)) {
    warnings.push(SET1_CI_CO_EQUAL_WARNING);
  }
  return {
    id: "ops",
    readiness: missing.length ? "incomplete" : warnings.length ? "warning" : "complete",
    missing,
    warnings,
  };
}

export function evaluateTaxes(taxes: Set1TaxesDraft, foundationColumnsAvailable: boolean): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!taxModeSet(taxes.taxInclusive)) missing.push("Tax mode");
  if (!Number.isFinite(Number(taxes.taxRate))) missing.push("Tax rate");
  if (!foundationColumnsAvailable) {
    missing.push("Tax name");
    warnings.push(SET1_COLUMNS_UNAVAILABLE);
  } else if (!String(taxes.taxName ?? "").trim()) {
    missing.push("Tax name");
  }
  return {
    id: "taxes",
    readiness: missing.length ? "incomplete" : warnings.length ? "warning" : "complete",
    missing,
    warnings,
  };
}

export function evaluatePolicies(
  policies: Set1PoliciesDraft,
  foundationColumnsAvailable: boolean,
): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!feeDefaultsPresent(policies.fees)) {
    missing.push("Cancel fee defaults");
    missing.push("No-show fee defaults");
  }
  if (!foundationColumnsAvailable) {
    warnings.push(SET1_COLUMNS_UNAVAILABLE);
  }
  return {
    id: "policies",
    readiness: missing.length ? "incomplete" : warnings.length ? "warning" : "complete",
    missing,
    warnings,
  };
}

export function evaluateGoLive(
  domains: Omit<Record<Set1SectionId, Set1DomainReport>, "golive">,
  foundationColumnsAvailable: boolean,
  pmsSet1Live: boolean,
): Set1DomainReport {
  const mandatory = [
    ...domains.identity.missing,
    ...domains.ops.missing,
    ...domains.taxes.missing,
    ...domains.policies.missing,
    ...domains.structure.missing,
    ...domains.rooms.missing,
    ...domains.outlets.missing,
    ...domains.rates.missing,
    ...domains["guest-profile"].missing,
    ...domains["housekeeping-rules"].missing,
    ...domains["room-inventory-rules"].missing,
    ...domains["maintenance-rules"].missing,
  ];
  // SET5 missing (dual-hub honesty) is checklist honesty only — never Activate mandatory.
  const blocked = !foundationColumnsAvailable && Boolean(domains.ops.missing.length || domains.taxes.missing.includes("Tax name"));
  const warnings = Object.values(domains).flatMap((d) => d.warnings);
  if (pmsSet1Live && !mandatory.length) {
    return { id: "golive", readiness: warnings.length ? "warning" : "complete", missing: [], warnings };
  }
  return {
    id: "golive",
    readiness: mandatory.length || blocked ? (blocked && mandatory.length ? "blocked" : "incomplete") : warnings.length ? "warning" : "complete",
    missing: mandatory,
    warnings: foundationColumnsAvailable ? warnings : [SET1_COLUMNS_UNAVAILABLE, ...warnings.filter((w) => w !== SET1_COLUMNS_UNAVAILABLE)],
  };
}

export function evaluateSet1Checklist(input: {
  identity: Set1IdentityDraft;
  ops: Set1OpsDraft;
  taxes: Set1TaxesDraft;
  policies: Set1PoliciesDraft;
  foundationColumnsAvailable: boolean;
  pmsSet1Live: boolean;
  role: string;
  set2?: Set2ActivateInput;
  set3?: Set3ActivateInput;
  set4?: Set4ActivateInput;
  set5?: Set5ActivateInput;
}): Set1Checklist {
  const set2 = input.set2 ?? emptySet2Activate();
  const set3 = input.set3 ?? emptySet3Activate();
  const set4 = input.set4 ?? emptySet4Activate();
  const set5 = input.set5 ?? emptySet5Activate();
  const identity = evaluateIdentity(input.identity, input.foundationColumnsAvailable);
  const ops = evaluateOps(input.ops, input.foundationColumnsAvailable);
  const taxes = evaluateTaxes(input.taxes, input.foundationColumnsAvailable);
  const policies = evaluatePolicies(input.policies, input.foundationColumnsAvailable);
  const structure = evaluateStructure(set2);
  const rooms = evaluateRooms(set2);
  const outlets = evaluateOutlets(set2);
  const rates = evaluateRates(set3);
  const guestProfile = evaluateGuestProfile(set3);
  const housekeeping = evaluateHousekeeping(set4);
  const roomInventory = evaluateRoomInventory(set4);
  const maintenance = evaluateMaintenance(set4);
  const departments = evaluateDepartments(set5);
  const guestServiceTypes = evaluateGuestServiceTypes(set5);
  const notifications = evaluateNotifications(set5);
  const adminControls = evaluateAdminControls(set5);
  const integrations = evaluateIntegrations(set5);
  const securityAudit = evaluateSecurityAudit(set5);
  const golive = evaluateGoLive(
    {
      identity,
      ops,
      taxes,
      policies,
      structure,
      rooms,
      outlets,
      rates,
      "guest-profile": guestProfile,
      "housekeeping-rules": housekeeping,
      "room-inventory-rules": roomInventory,
      "maintenance-rules": maintenance,
      departments,
      "guest-services-types": guestServiceTypes,
      notifications,
      "admin-controls": adminControls,
      integrations,
      "security-audit": securityAudit,
    },
    input.foundationColumnsAvailable,
    input.pmsSet1Live,
  );
  const mandatoryMissing = [
    ...identity.missing,
    ...ops.missing,
    ...taxes.missing,
    ...policies.missing,
    ...set2MandatoryMissing(set2),
    ...set3MandatoryMissing(set3),
    ...set4MandatoryMissing(set4),
    ...set5MandatoryMissing(set5),
  ];
  const domains = {
    identity,
    ops,
    taxes,
    policies,
    structure,
    rooms,
    outlets,
    rates,
    "guest-profile": guestProfile,
    "housekeeping-rules": housekeeping,
    "room-inventory-rules": roomInventory,
    "maintenance-rules": maintenance,
    departments,
    "guest-services-types": guestServiceTypes,
    notifications,
    "admin-controls": adminControls,
    integrations,
    "security-audit": securityAudit,
    golive,
  };
  const hasWarning = Object.values(domains).some((d) => d.readiness === "warning" || d.warnings.length);
  const blocked =
    mandatoryMissing.length > 0 ||
    [identity, ops, taxes, policies, structure, rooms, outlets, rates, guestProfile, housekeeping, roomInventory].some(
      (d) => d.readiness === "blocked" || d.readiness === "incomplete",
    );
  const overall: Set1Overall = blocked ? "blocked" : hasWarning ? "warning" : "ready";
  return {
    overall,
    domains,
    mandatoryMissing,
    canActivate:
      canActivateSet1(input.role) &&
      !blocked &&
      identityMandatoryComplete(input.identity) &&
      opsMandatoryComplete(input.ops, input.foundationColumnsAvailable) &&
      taxesMandatoryComplete(input.taxes, input.foundationColumnsAvailable) &&
      feeDefaultsPresent(input.policies.fees) &&
      ratesMandatoryComplete(set3) &&
      set3.guestMinComplete &&
      hkStatusesMandatoryComplete(set4) &&
      oooOosMandatoryComplete(set4),
  };
}

export function readinessLabel(readiness: Set1Readiness): string {
  if (readiness === "complete") return "Complete";
  if (readiness === "warning") return "Warning";
  if (readiness === "incomplete") return "Incomplete";
  return "Blocked";
}

export function overallLabel(overall: Set1Overall): string {
  if (overall === "ready") return "Ready";
  if (overall === "warning") return "Warning";
  return "Blocked";
}

export function emptyIdentity(partial?: Partial<Set1IdentityDraft>): Set1IdentityDraft {
  return {
    name: "",
    logoUrl: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    postcode: "",
    country: "",
    timezone: "",
    currencyCode: "",
    propertyCode: "",
    legalName: "",
    propertyType: "",
    taxIdentities: [],
    ...partial,
  };
}

export function emptyOps(partial?: Partial<Set1OpsDraft>): Set1OpsDraft {
  return { checkInTime: "", checkOutTime: "", hotelDayOpen: true, ...partial };
}

export function emptyTaxes(partial?: Partial<Set1TaxesDraft>): Set1TaxesDraft {
  return { taxInclusive: false, taxName: "", taxRate: 0, serviceEnabled: false, serviceRate: 0, ...partial };
}

export function emptyPolicies(partial?: Partial<Set1PoliciesDraft>): Set1PoliciesDraft {
  return {
    cancelWindowHours: "",
    cancelFeeBasis: "",
    noshowFeeBasis: "",
    depositRequired: false,
    depositType: "",
    depositValue: "",
    earlyCheckinAllowed: false,
    earlyCheckinFee: "",
    earlyCheckinNeedsApproval: false,
    lateCheckoutAllowed: false,
    lateCheckoutFee: "",
    lateCheckoutNeedsApproval: false,
    fees: {
      cancelFeeRequired: true,
      cancelFeeDefault: 0,
      noshowFeeRequired: true,
      noshowFeeDefault: 0,
    },
    ...partial,
  };
}

export function optionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function optionalInt(value: string): number | null {
  const parsed = optionalNumber(value);
  if (parsed == null) return null;
  return Math.round(parsed);
}

export { canEditFoFeeDefaults };
