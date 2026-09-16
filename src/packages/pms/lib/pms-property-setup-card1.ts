/**
 * PMS Property Setup Card 1 — Property & Business (Issue #160).
 *
 * Abel APPROVED 2026-09-16. D6–D8 stand:
 * - Opening Date OUT of Step 1
 * - VAT Certificate required only when VAT Registered On
 * - Building Required · Wing Optional · Floor Required
 *
 * Locks:
 * - Settings home = 8 Property Setup cards (Complete / In Progress / Not Started)
 * - Only Card 1 is Spec’d/build: 8-step workspace
 * - Agreement OUT · Card 1 finish ≠ Activate · no pms_card1_live
 * - Single Activate remains pms_set1_live
 * - Reuse Live SET1–SET2 masters — no second conflicting tables
 * - Full Address = read-only auto-composed
 * - Business Date CURRENT STATE read-only (Night Audit owns the roll)
 * - Structure capacity derived · rooms = deep-link Room Inventory
 * - Cards 2–8 = Coming soon / programme context only
 * - OUT: overbooking · FO-CHROME1 reopen · invent dual masters · Agreement signing
 */

import { SET1_HUB_HREF, displayedBusinessDate, normalizeClock } from "./pms-set1-foundation.ts";
import { SET2_RI_ROOMS_HREF, type Set2Snapshot } from "./pms-set2-structure.ts";

export const CARD1_TITLE = "Property & Business";
export const CARD1_PURPOSE = "Identity, address, contacts, check-in times, business-date config, legal, tax and structure rules.";
export const CARD1_HASH = "property-business";
export const CARD1_HREF = `${SET1_HUB_HREF}#${CARD1_HASH}`;
export const CARD1_ROOMS_HREF = SET2_RI_ROOMS_HREF;
export const CARD1_COLUMNS_UNAVAILABLE = "Unavailable — Card 1 columns are not applied yet.";
export const CARD1_FINISH_COPY =
  "Completing Card 1 saves Property & Business. It does not Activate the property. Activate stays a single owner action on pms_set1_live.";
export const CARD1_BUSINESS_DATE_CURRENT_COPY =
  "CURRENT STATE is the Night Audit business date. Settings cannot roll it.";
export const CARD1_FULL_ADDRESS_COPY = "Full Address is composed from the parts below. It is not editable.";
export const CARD1_VAT_GATE_COPY = "VAT certificate is required only when VAT Registered is On.";
export const CARD1_OPENING_DATE_OUT = "Opening Date is out of Step 1.";
export const CARD1_AGREEMENT_OUT = "Agreement signing is out of Card 1.";
export const CARD1_CAPACITY_COPY = "Capacity is derived from Room Inventory. Rooms are not edited here.";

export const CARD1_AUDIT_DRAFT = "pms_card1_draft_saved";
export const CARD1_AUDIT_STEP = "pms_card1_step_saved";
export const CARD1_AUDIT_COMPLETED = "pms_card1_completed";
export const CARD1_AUDIT_ACTIONS = [CARD1_AUDIT_DRAFT, CARD1_AUDIT_STEP, CARD1_AUDIT_COMPLETED] as const;

export const CARD1_STEPS = [
  { id: "identity", number: 1, title: "Property Identity" },
  { id: "address", number: 2, title: "Address & Location" },
  { id: "contacts", number: 3, title: "Contacts" },
  { id: "checkin", number: 4, title: "Check-in & Check-out" },
  { id: "business-date", number: 5, title: "Business Date" },
  { id: "legal", number: 6, title: "Legal Identity" },
  { id: "tax", number: 7, title: "Tax & Documents" },
  { id: "structure", number: 8, title: "Property Structure" },
] as const;

export type Card1StepId = (typeof CARD1_STEPS)[number]["id"];

export const PROPERTY_SETUP_CARD_STATUSES = ["complete", "in_progress", "not_started"] as const;
export type PropertySetupCardStatus = (typeof PROPERTY_SETUP_CARD_STATUSES)[number];

export function propertySetupStatusLabel(status: PropertySetupCardStatus): string {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In Progress";
  return "Not Started";
}

export const PROPERTY_SETUP_CARDS = [
  {
    id: "property-business",
    number: 1,
    title: CARD1_TITLE,
    purpose: CARD1_PURPOSE,
    specced: true,
    hash: CARD1_HASH,
  },
  {
    id: "rooms-inventory",
    number: 2,
    title: "Rooms & Inventory",
    purpose: "Room types, physical rooms and inventory rules. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "rates-guest-rules",
    number: 3,
    title: "Rates & Guest Rules",
    purpose: "Rate plans, meal plans and guest-profile rules. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "housekeeping-maintenance",
    number: 4,
    title: "Housekeeping & Maintenance",
    purpose: "Housekeeping statuses, OOO/OOS and maintenance categories. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "departments-services",
    number: 5,
    title: "Departments & Guest Services",
    purpose: "Departments, work centres and guest-request types. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "notifications-security",
    number: 6,
    title: "Notifications & Security",
    purpose: "Channels, templates and session/audit posture. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "sales-distribution",
    number: 7,
    title: "Sales & Distribution",
    purpose: "Market segments, source codes and channel posture. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
  {
    id: "payments-administration",
    number: 8,
    title: "Payments & Administration",
    purpose: "Payment methods, shifts and thin HR. Programme context — not Spec’d in this wave.",
    specced: false,
    hash: null,
  },
] as const;

export type PropertySetupCardId = (typeof PROPERTY_SETUP_CARDS)[number]["id"];

export const STAR_RATINGS = [1, 2, 3, 4, 5] as const;
export type StarRating = (typeof STAR_RATINGS)[number];

export const CARD1_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "am", label: "Amharic" },
  { id: "om", label: "Afaan Oromo" },
  { id: "ti", label: "Tigrinya" },
  { id: "so", label: "Somali" },
] as const;

export const ETHIOPIA_REGIONS = [
  "Addis Ababa",
  "Afar",
  "Amhara",
  "Benishangul-Gumuz",
  "Central Ethiopia",
  "Dire Dawa",
  "Gambela",
  "Harari",
  "Oromia",
  "Sidama",
  "Somali",
  "South Ethiopia",
  "Southwest Ethiopia",
  "Tigray",
] as const;

export const LEGAL_ENTITY_TYPES = ["plc", "private_limited", "sole_proprietor", "partnership", "other"] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export const LEGAL_ENTITY_TYPE_LABELS: Record<LegalEntityType, string> = {
  plc: "PLC",
  private_limited: "Private limited",
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  other: "Other",
};

export const D8_STRUCTURE_DEFAULTS = {
  buildingRequired: true,
  wingOptional: true,
  floorRequired: true,
} as const;

export type Card1UploadRef = { name: string; kind: string };

export type Card1DepartmentContact = {
  department: string;
  name: string;
  phone: string;
  email: string;
};

export type Card1SocialContacts = {
  website: string;
  facebook: string;
  instagram: string;
  tripadvisor: string;
};

export type Card1IdentityToggles = {
  showTradingNameOnDocuments: boolean;
  chainProperty: boolean;
};

export type Card1BusinessDateConfig = {
  notes: string;
  closeBlockersEnabled: boolean;
};

export type Card1StructureRules = {
  buildingRequired: boolean;
  wingOptional: boolean;
  floorRequired: boolean;
};

export type Card1StepStatusMap = Partial<Record<Card1StepId, PropertySetupCardStatus>>;

export type PropertySetupStatus = {
  cards: Partial<Record<PropertySetupCardId, PropertySetupCardStatus>>;
  card1Steps: Card1StepStatusMap;
};

export type Card1Draft = {
  name: string;
  tradingName: string;
  propertyCode: string;
  propertyType: string;
  starRating: StarRating | "";
  defaultLanguage: string;
  shortDescription: string;
  timezone: string;
  currencyCode: string;
  logoUrl: string;
  identityToggles: Card1IdentityToggles;
  brandName: string;
  brandCode: string;
  chainName: string;
  address: string;
  addressHouseNo: string;
  addressKebele: string;
  addressWoreda: string;
  addressZone: string;
  addressSubcity: string;
  addressRegion: string;
  city: string;
  postcode: string;
  country: string;
  latitude: string;
  longitude: string;
  fullAddress: string;
  phone: string;
  email: string;
  whatsapp: string;
  social: Card1SocialContacts;
  departmentContacts: Card1DepartmentContact[];
  checkInTime: string;
  checkOutTime: string;
  checkinPolicyText: string;
  checkoutPolicyText: string;
  earlyCheckinPolicyText: string;
  lateCheckoutPolicyText: string;
  businessDateConfig: Card1BusinessDateConfig;
  businessDateBlockers: string[];
  legalName: string;
  legalEntityName: string;
  legalEntityType: LegalEntityType | "";
  registrationNumber: string;
  legalUploadRefs: Card1UploadRef[];
  vatRegistered: boolean;
  vatNumber: string;
  tinNumber: string;
  licenceNumber: string;
  taxUploadRefs: Card1UploadRef[];
  structureRules: Card1StructureRules;
};

export type Card1Snapshot = {
  draft: Card1Draft;
  businessDate: string | null;
  timezone: string;
  pmsSet1Live: boolean;
  card1ColumnsAvailable: boolean;
  foundationColumnsAvailable: boolean;
  status: PropertySetupStatus;
  derivedCapacity: { rooms: number; roomTypes: number };
};

export function emptyIdentityToggles(partial?: Partial<Card1IdentityToggles>): Card1IdentityToggles {
  return { showTradingNameOnDocuments: false, chainProperty: false, ...partial };
}

export function emptySocialContacts(partial?: Partial<Card1SocialContacts>): Card1SocialContacts {
  return { website: "", facebook: "", instagram: "", tripadvisor: "", ...partial };
}

export function emptyBusinessDateConfig(partial?: Partial<Card1BusinessDateConfig>): Card1BusinessDateConfig {
  return { notes: "", closeBlockersEnabled: false, ...partial };
}

export function emptyStructureRules(partial?: Partial<Card1StructureRules>): Card1StructureRules {
  return { ...D8_STRUCTURE_DEFAULTS, ...partial };
}

export function emptyPropertySetupStatus(partial?: Partial<PropertySetupStatus>): PropertySetupStatus {
  return { cards: {}, card1Steps: {}, ...partial };
}

export function emptyCard1Draft(partial?: Partial<Card1Draft>): Card1Draft {
  return {
    name: "",
    tradingName: "",
    propertyCode: "",
    propertyType: "",
    starRating: "",
    defaultLanguage: "en",
    shortDescription: "",
    timezone: "",
    currencyCode: "",
    logoUrl: "",
    identityToggles: emptyIdentityToggles(),
    brandName: "",
    brandCode: "",
    chainName: "",
    address: "",
    addressHouseNo: "",
    addressKebele: "",
    addressWoreda: "",
    addressZone: "",
    addressSubcity: "",
    addressRegion: "",
    city: "",
    postcode: "",
    country: "Ethiopia",
    latitude: "",
    longitude: "",
    fullAddress: "",
    phone: "",
    email: "",
    whatsapp: "",
    social: emptySocialContacts(),
    departmentContacts: [],
    checkInTime: "",
    checkOutTime: "",
    checkinPolicyText: "",
    checkoutPolicyText: "",
    earlyCheckinPolicyText: "",
    lateCheckoutPolicyText: "",
    businessDateConfig: emptyBusinessDateConfig(),
    businessDateBlockers: [],
    legalName: "",
    legalEntityName: "",
    legalEntityType: "",
    registrationNumber: "",
    legalUploadRefs: [],
    vatRegistered: false,
    vatNumber: "",
    tinNumber: "",
    licenceNumber: "",
    taxUploadRefs: [],
    structureRules: emptyStructureRules(),
    ...partial,
  };
}

export function emptyCard1Snapshot(partial?: Partial<Card1Snapshot>): Card1Snapshot {
  const draft = partial?.draft ?? emptyCard1Draft();
  return {
    draft,
    businessDate: null,
    timezone: draft.timezone,
    pmsSet1Live: false,
    card1ColumnsAvailable: false,
    foundationColumnsAvailable: false,
    status: emptyPropertySetupStatus(),
    derivedCapacity: { rooms: 0, roomTypes: 0 },
    ...partial,
  };
}

export function composeFullAddress(input: {
  addressHouseNo?: string;
  address?: string;
  addressKebele?: string;
  addressWoreda?: string;
  addressZone?: string;
  addressSubcity?: string;
  city?: string;
  addressRegion?: string;
  postcode?: string;
  country?: string;
}): string {
  const parts = [
    [input.addressHouseNo, input.address].map((part) => String(part ?? "").trim()).filter(Boolean).join(" "),
    input.addressKebele,
    input.addressWoreda,
    input.addressZone,
    input.addressSubcity,
    input.city,
    input.addressRegion,
    input.postcode,
    input.country,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export function vatCertificateRequired(vatRegistered: boolean): boolean {
  return vatRegistered === true;
}

export function hasVatCertificate(refs: Card1UploadRef[]): boolean {
  return refs.some((ref) => ref.kind === "vat_certificate" && ref.name.trim().length > 0);
}

export function parseStarRating(value: unknown): StarRating | "" {
  const n = Number(value);
  return (STAR_RATINGS as readonly number[]).includes(n) ? (n as StarRating) : "";
}

export function parseLegalEntityType(value: unknown): LegalEntityType | "" {
  return (LEGAL_ENTITY_TYPES as readonly string[]).includes(String(value)) ? (value as LegalEntityType) : "";
}

export function parseUploadRefs(value: unknown): Card1UploadRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as { name?: unknown; kind?: unknown };
      const name = String(rec.name ?? "").trim();
      const kind = String(rec.kind ?? "").trim();
      if (!name && !kind) return null;
      return { name, kind };
    })
    .filter((row): row is Card1UploadRef => row !== null);
}

export function parseDepartmentContacts(value: unknown): Card1DepartmentContact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as { department?: unknown; name?: unknown; phone?: unknown; email?: unknown };
      const department = String(rec.department ?? "").trim();
      const name = String(rec.name ?? "").trim();
      const phone = String(rec.phone ?? "").trim();
      const email = String(rec.email ?? "").trim();
      if (!department && !name && !phone && !email) return null;
      return { department, name, phone, email };
    })
    .filter((row): row is Card1DepartmentContact => row !== null);
}

export function parseSocialContacts(value: unknown): Card1SocialContacts {
  if (!value || typeof value !== "object") return emptySocialContacts();
  const rec = value as Record<string, unknown>;
  return emptySocialContacts({
    website: String(rec["website"] ?? "").trim(),
    facebook: String(rec["facebook"] ?? "").trim(),
    instagram: String(rec["instagram"] ?? "").trim(),
    tripadvisor: String(rec["tripadvisor"] ?? "").trim(),
  });
}

export function parseIdentityToggles(value: unknown): Card1IdentityToggles {
  if (!value || typeof value !== "object") return emptyIdentityToggles();
  const rec = value as Record<string, unknown>;
  return emptyIdentityToggles({
    showTradingNameOnDocuments: rec["showTradingNameOnDocuments"] === true,
    chainProperty: rec["chainProperty"] === true,
  });
}

export function parseBusinessDateConfig(value: unknown): Card1BusinessDateConfig {
  if (!value || typeof value !== "object") return emptyBusinessDateConfig();
  const rec = value as Record<string, unknown>;
  return emptyBusinessDateConfig({
    notes: String(rec["notes"] ?? "").trim(),
    closeBlockersEnabled: rec["closeBlockersEnabled"] === true,
  });
}

export function parseBusinessDateBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => String(row ?? "").trim()).filter(Boolean);
}

export function parseStructureRules(value: unknown): Card1StructureRules {
  if (!value || typeof value !== "object") return emptyStructureRules();
  const rec = value as Record<string, unknown>;
  return emptyStructureRules({
    buildingRequired: rec["buildingRequired"] !== false,
    wingOptional: rec["wingOptional"] !== false,
    floorRequired: rec["floorRequired"] !== false,
  });
}

export function parseCardStatus(value: unknown): PropertySetupCardStatus {
  return (PROPERTY_SETUP_CARD_STATUSES as readonly string[]).includes(String(value))
    ? (value as PropertySetupCardStatus)
    : "not_started";
}

export function parsePropertySetupStatus(value: unknown): PropertySetupStatus {
  if (!value || typeof value !== "object") return emptyPropertySetupStatus();
  const rec = value as { cards?: unknown; card1Steps?: unknown };
  const cards: PropertySetupStatus["cards"] = {};
  if (rec.cards && typeof rec.cards === "object") {
    for (const card of PROPERTY_SETUP_CARDS) {
      const raw = (rec.cards as Record<string, unknown>)[card.id];
      if (raw != null) cards[card.id] = parseCardStatus(raw);
    }
  }
  const card1Steps: Card1StepStatusMap = {};
  if (rec.card1Steps && typeof rec.card1Steps === "object") {
    for (const step of CARD1_STEPS) {
      const raw = (rec.card1Steps as Record<string, unknown>)[step.id];
      if (raw != null) card1Steps[step.id] = parseCardStatus(raw);
    }
  }
  return { cards, card1Steps };
}

export function card1StepComplete(step: Card1StepId, draft: Card1Draft, set2?: Pick<Set2Snapshot, "buildings" | "floors">): boolean {
  if (step === "identity") {
    return draft.name.trim().length >= 2 && Boolean(draft.timezone.trim()) && Boolean(draft.currencyCode.trim());
  }
  if (step === "address") {
    return Boolean(draft.city.trim() && draft.country.trim() && composeFullAddress(draft));
  }
  if (step === "contacts") {
    return Boolean(draft.phone.trim() || draft.email.trim() || draft.whatsapp.trim());
  }
  if (step === "checkin") {
    return Boolean(normalizeClock(draft.checkInTime) && normalizeClock(draft.checkOutTime));
  }
  if (step === "business-date") {
    return true;
  }
  if (step === "legal") {
    return Boolean(draft.legalName.trim() || draft.legalEntityName.trim());
  }
  if (step === "tax") {
    if (!draft.vatRegistered) return true;
    return hasVatCertificate(draft.taxUploadRefs);
  }
  const buildings = set2?.buildings.filter((row) => row.active).length ?? 0;
  const floors = set2?.floors.filter((row) => row.active).length ?? 0;
  const buildingOk = !draft.structureRules.buildingRequired || buildings >= 1;
  const floorOk = !draft.structureRules.floorRequired || floors >= 1;
  return buildingOk && floorOk;
}

export function evaluateCard1StepStatus(
  step: Card1StepId,
  draft: Card1Draft,
  stored: PropertySetupCardStatus | undefined,
  set2?: Pick<Set2Snapshot, "buildings" | "floors">,
): PropertySetupCardStatus {
  if (card1StepComplete(step, draft, set2)) return "complete";
  if (stored === "in_progress" || stored === "complete") return "in_progress";
  return "not_started";
}

export function evaluateCard1Status(
  draft: Card1Draft,
  stored: PropertySetupStatus,
  set2?: Pick<Set2Snapshot, "buildings" | "floors">,
): PropertySetupCardStatus {
  if (CARD1_STEPS.every((step) => card1StepComplete(step.id, draft, set2))) return "complete";
  if (stored.cards["property-business"] === "in_progress" || Object.keys(stored.card1Steps).length > 0) {
    return "in_progress";
  }
  return "not_started";
}

export function evaluateProgrammeCardStatus(
  cardId: PropertySetupCardId,
  stored: PropertySetupStatus,
  card1: PropertySetupCardStatus,
): PropertySetupCardStatus {
  if (cardId === "property-business") return card1;
  return parseCardStatus(stored.cards[cardId]);
}

export function card1FinishActivatesProperty(): boolean {
  return false;
}

export function nextCard1Step(step: Card1StepId): Card1StepId | null {
  const index = CARD1_STEPS.findIndex((row) => row.id === step);
  if (index < 0 || index >= CARD1_STEPS.length - 1) return null;
  return CARD1_STEPS[index + 1]?.id ?? null;
}

export function previousCard1Step(step: Card1StepId): Card1StepId | null {
  const index = CARD1_STEPS.findIndex((row) => row.id === step);
  if (index <= 0) return null;
  return CARD1_STEPS[index - 1]?.id ?? null;
}

export function continueLabel(step: Card1StepId): string {
  return step === "structure" ? "Complete Card 1" : "Save & Continue";
}

export function finishLabel(step: Card1StepId): string {
  return step === "structure" ? "Save & Finish" : "Save Draft";
}

export function resolveCard1Hash(hash: string): typeof CARD1_HASH | null {
  const raw = hash.replace(/^#/, "");
  if (raw === CARD1_HASH || raw === "card-1" || raw === "card1") return CARD1_HASH;
  return null;
}

export function isCard1WorkspaceHash(hash: string): boolean {
  return resolveCard1Hash(hash) !== null;
}

export function derivedCapacityFromSet2(set2: Pick<Set2Snapshot, "roomCount" | "roomTypeCount">): {
  rooms: number;
  roomTypes: number;
} {
  return { rooms: set2.roomCount, roomTypes: set2.roomTypeCount };
}

export function displayedCard1BusinessDate(businessDate: string | null | undefined, timezone: string): string {
  return displayedBusinessDate(businessDate, timezone);
}

export function card1TaxWarnings(draft: Card1Draft): string[] {
  const warnings: string[] = [];
  if (vatCertificateRequired(draft.vatRegistered) && !hasVatCertificate(draft.taxUploadRefs)) {
    warnings.push("VAT certificate is required while VAT Registered is On.");
  }
  return warnings;
}

export function card1StructureWarnings(
  draft: Card1Draft,
  set2: Pick<Set2Snapshot, "buildings" | "floors" | "wings" | "structureColumnsAvailable">,
): string[] {
  const warnings: string[] = [];
  if (!set2.structureColumnsAvailable) {
    warnings.push("Structure masters are unavailable until SET2 columns are applied.");
    return warnings;
  }
  const buildings = set2.buildings.filter((row) => row.active).length;
  const floors = set2.floors.filter((row) => row.active).length;
  if (draft.structureRules.buildingRequired && buildings < 1) warnings.push("At least one building is required.");
  if (draft.structureRules.floorRequired && floors < 1) warnings.push("At least one floor is required.");
  return warnings;
}

export function markStepInProgress(status: PropertySetupStatus, step: Card1StepId): PropertySetupStatus {
  return {
    cards: { ...status.cards, "property-business": "in_progress" },
    card1Steps: { ...status.card1Steps, [step]: status.card1Steps[step] === "complete" ? "complete" : "in_progress" },
  };
}

export function markStepComplete(status: PropertySetupStatus, step: Card1StepId, draft: Card1Draft, set2?: Pick<Set2Snapshot, "buildings" | "floors">): PropertySetupStatus {
  const nextSteps = { ...status.card1Steps, [step]: card1StepComplete(step, draft, set2) ? "complete" : "in_progress" };
  const next: PropertySetupStatus = { cards: { ...status.cards }, card1Steps: nextSteps };
  next.cards["property-business"] = evaluateCard1Status(draft, next, set2);
  return next;
}

export function markCard1Complete(status: PropertySetupStatus): PropertySetupStatus {
  const card1Steps = { ...status.card1Steps };
  for (const step of CARD1_STEPS) card1Steps[step.id] = "complete";
  return {
    cards: { ...status.cards, "property-business": "complete" },
    card1Steps,
  };
}
