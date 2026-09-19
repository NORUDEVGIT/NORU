/**
 * PMS Property Setup Card 1 — Property & Business fidelity (Issue #162).
 *
 * Spec PATCH v1.2 · Abel APPROVED plan gate 2026-09-17:
 * - Opening Date IN Step 1 Identity (D6 overturn)
 * - 8-step full-screen chrome · old Settings left sidebar OUT
 * - Agreement OUT · Card 1 finish ≠ Activate · no pms_card1_live
 * - Sample-pack: Contacts · Business Date · Structure CRUD
 * - Single Activate remains pms_set1_live
 * - Reuse Live SET1–SET2 / 0062 masters — CREATE missing designed fields
 */

import { SET1_HUB_HREF, displayedBusinessDate, normalizeClock } from "./pms-set1-foundation.ts";
import { SET2_RI_ROOMS_HREF, type Set2Snapshot } from "./pms-set2-structure.ts";
import { CARD2_STEPS, type Card2StepId } from "./pms-property-setup-card2.ts";
import { CARD3_HASH, CARD3_PURPOSE, CARD3_TITLE } from "./pms-property-setup-card3.ts";
import { CARD5_HASH, CARD5_PURPOSE, CARD5_TITLE } from "./pms-property-setup-card5.ts";
import { CARD4_HASH, CARD4_PURPOSE, CARD4_TITLE } from "./pms-property-setup-card4.ts";
import { CARD6_HASH, CARD6_PURPOSE, CARD6_TITLE } from "./pms-property-setup-card6.ts";
import { CARD7_HASH, CARD7_PURPOSE, CARD7_TITLE } from "./pms-property-setup-card7.ts";
import {
  countryNameFromInput,
  isRegionValidForCountry,
  isValidHttpUrl,
  isValidLatitude,
  isValidLongitude,
} from "./pms-geography.ts";

export { ETHIOPIA_REGIONS } from "./pms-geography.ts";

export const CARD1_TITLE = "Property & Business";
export const CARD1_WORKSPACE_TITLE = "Property & Business Setup";
export const CARD1_SUBTITLE =
  "Complete your property information, operating details and compliance for your NORU setup.";
export const CARD1_PURPOSE =
  "Identity & Branding, Check-In & Check-Out, Business Date, Property Structure.";
export const CARD1_HASH = "property-business";
export const CARD1_HREF = `${SET1_HUB_HREF}#${CARD1_HASH}`;
export const CARD1_ROOMS_HREF = SET2_RI_ROOMS_HREF;
export const CARD1_COLUMNS_UNAVAILABLE = "Unavailable — Card 1 columns are not applied yet.";
export const CARD1_FINISH_COPY =
  "Completing Card 1 saves Property & Business. It does not Activate the property. Activate stays a single owner action on pms_set1_live.";
export const CARD1_BUSINESS_DATE_CURRENT_COPY =
  "Staff always see what the house thinks today is before editing rules. CURRENT STATE is the Night Audit business date. Settings cannot roll it.";
export const CARD1_FULL_ADDRESS_COPY = "Full Address is composed from the parts below. It is not editable.";
export const CARD1_ADDRESS_ADAPT_COPY = "Address fields adapt to the selected country.";
export const CARD1_ADDRESS_SUBTITLE = "Configure the property's physical address and geographic location.";
export const CARD1_VAT_GATE_COPY = "VAT certificate is required only when VAT Registered is On.";
export const CARD1_OPENING_DATE_IN = "Opening Date is required on Property Identity.";
export const CARD1_AGREEMENT_OUT = "Agreement signing is out of Card 1.";
export const CARD1_CAPACITY_COPY = "Capacity is derived from Room Inventory. Rooms are not edited here.";
export const CARD1_SIDEBAR_OUT = "Card 1 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";
export const CARD1_STRUCTURE_CRUD_COPY = "Full hierarchy CRUD — not a Coming soon stub.";
export const CARD1_PROPERTY_CODE_TOOLTIP = "Assigned by NORU platform";
export const CARD1_IDENTITY_HELPER =
  "This information is used for property setup and compliance. Opening date is required on Property Identity.";
export const CARD1_BRANDING_HELPER =
  "Add your brand assets and visual identity. These will be used across NORU and guest-facing channels.";
export const CARD1_INDEPENDENT_HELPER = "This is an independently owned and operated property.";
export const CARD1_PUBLIC_HELPER = "Show this property on public channels (e.g. booking engine, directory).";
export const CARD1_BRAND_IMAGE_HELPER = "PNG, JPG or WEBP. Maximum 1 MB.";
export const CARD1_BRAND_IMAGE_TYPE_ERROR = "Only PNG, JPG, JPEG and WEBP images are allowed.";
export const CARD1_BRAND_IMAGE_SIZE_ERROR = "Image must be smaller than 1 MB.";
export const CARD1_BRAND_IMAGE_UPLOAD_ERROR = "Image upload failed. Please try again.";
export const CARD1_BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const CARD1_BRAND_IMAGE_MAX_BYTES = 1024 * 1024;

export const CARD1_AUDIT_DRAFT = "pms_card1_draft_saved";
export const CARD1_AUDIT_STEP = "pms_card1_step_saved";
export const CARD1_AUDIT_COMPLETED = "pms_card1_completed";
export const CARD1_AUDIT_ACTIONS = [CARD1_AUDIT_DRAFT, CARD1_AUDIT_STEP, CARD1_AUDIT_COMPLETED] as const;

export const CARD1_STEPS = [
  { id: "identity", number: 1, title: "Property Identity" },
  { id: "address", number: 2, title: "Address & Location" },
  { id: "contacts", number: 3, title: "Contacts" },
  { id: "checkin", number: 4, title: "Check-In & Check-Out" },
  { id: "business-date", number: 5, title: "Business Date" },
  { id: "legal", number: 6, title: "Legal Identity" },
  { id: "tax", number: 7, title: "Tax Documents" },
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
    title: "Rooms & Operations",
    purpose: "Rooms & Room Types, Amenities, Housekeeping Rules, Room Inventory Rules, Maintenance Rules.",
    specced: true,
    hash: "rooms-inventory",
  },
  {
    id: "rates-guest-rules",
    number: 3,
    title: CARD3_TITLE,
    purpose: CARD3_PURPOSE,
    specced: true,
    hash: CARD3_HASH,
  },
  {
    id: "housekeeping-maintenance",
    number: 4,
    title: CARD4_TITLE,
    purpose: CARD4_PURPOSE,
    specced: true,
    hash: CARD4_HASH,
  },
  {
    id: "departments-services",
    number: 5,
    title: CARD5_TITLE,
    purpose: CARD5_PURPOSE,
    specced: true,
    hash: CARD5_HASH,
  },
  {
    id: "notifications-security",
    number: 6,
    title: CARD6_TITLE,
    purpose: CARD6_PURPOSE,
    specced: true,
    hash: CARD6_HASH,
  },
  {
    id: "sales-distribution",
    number: 7,
    title: CARD7_TITLE,
    purpose: CARD7_PURPOSE,
    specced: true,
    hash: CARD7_HASH,
  },
  {
    id: "payments-administration",
    number: 8,
    title: "System & Go-Live",
    purpose: "Offline & Sync, System Validation, Go-Live, Property Activation.",
    specced: false,
    hash: null,
  },
] as const;

export type PropertySetupCardId = (typeof PROPERTY_SETUP_CARDS)[number]["id"];

export const CARD1_PMS_NAV = [
  { id: "dashboard", label: "Dashboard", href: "/restaurant/pms/dashboard" },
  { id: "front-office", label: "FO", href: "/restaurant/pms/front-office" },
  { id: "reservations", label: "Reservation", href: "/restaurant/pms/reservations" },
  { id: "housekeeping", label: "Housekeeping", href: "/restaurant/pms/housekeeping" },
  { id: "cashiering", label: "Cashiering", href: "/restaurant/pms/cashiering" },
  { id: "night-audit", label: "Night Audit", href: "/restaurant/pms/night-audit" },
  { id: "settings", label: "Settings", href: SET1_HUB_HREF },
] as const;

export const STAR_RATINGS = [1, 2, 3, 4, 5] as const;
export type StarRating = (typeof STAR_RATINGS)[number];

export const CARD1_PROPERTY_TYPES = [
  "hotel",
  "resort",
  "lodge",
  "guest_house",
  "boutique_hotels",
  "apartment_hotel",
  "hostel",
  "villa",
  "other",
] as const;
export type Card1PropertyType = (typeof CARD1_PROPERTY_TYPES)[number];
export const CARD1_PROPERTY_TYPE_LABELS: Record<Card1PropertyType, string> = {
  hotel: "Hotel",
  resort: "Resort",
  lodge: "Lodge",
  guest_house: "Guest house",
  boutique_hotels: "Boutique hotels",
  apartment_hotel: "Apartment hotel",
  hostel: "Hostel",
  villa: "Villa",
  other: "Other",
};

export const CARD1_BUSINESS_TYPES = ["independent", "boutique", "chain_corporate", "franchise"] as const;
export type Card1BusinessType = (typeof CARD1_BUSINESS_TYPES)[number];
export const CARD1_BUSINESS_TYPE_LABELS: Record<Card1BusinessType, string> = {
  independent: "Independent",
  boutique: "Boutique",
  chain_corporate: "Chain/Corporate",
  franchise: "Franchise",
};

export const CARD1_BRAND_AFFILIATIONS = ["marriott", "hilton", "sheraton", "ihg", "none", "other"] as const;
export type Card1BrandAffiliation = (typeof CARD1_BRAND_AFFILIATIONS)[number];
export const CARD1_BRAND_AFFILIATION_LABELS: Record<Card1BrandAffiliation, string> = {
  marriott: "Marriott",
  hilton: "Hilton",
  sheraton: "Sheraton",
  ihg: "IHG",
  none: "Independent / No Chain",
  other: "Other",
};

export const CARD1_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "am", label: "Amharic" },
  { id: "om", label: "Afaan Oromo" },
  { id: "ti", label: "Tigrinya" },
  { id: "ar", label: "Arabic" },
  { id: "es", label: "Spanish" },
  { id: "nl", label: "Dutch" },
  { id: "zh", label: "Chinese" },
  { id: "pt", label: "Portuguese" },
] as const;

const STORED_LANGUAGE_LABELS: Record<string, string> = {
  so: "Somali",
};

export function card1LanguageOptions(currentId: string): { id: string; label: string }[] {
  const options: { id: string; label: string }[] = CARD1_LANGUAGES.map((row) => ({
    id: row.id,
    label: row.label,
  }));
  if (currentId && !options.some((row) => row.id === currentId)) {
    options.push({ id: currentId, label: STORED_LANGUAGE_LABELS[currentId] ?? currentId });
  }
  return options;
}

export function isHttpOrDataAsset(value: string): boolean {
  return /^(https?:\/\/|data:)/i.test(value.trim());
}

export function isBrandHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function isPlausibleHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateBrandImageFile(file: { type: string; size: number }): string | null {
  if (!(CARD1_BRAND_IMAGE_TYPES as readonly string[]).includes(file.type)) return CARD1_BRAND_IMAGE_TYPE_ERROR;
  if (file.size > CARD1_BRAND_IMAGE_MAX_BYTES) return CARD1_BRAND_IMAGE_SIZE_ERROR;
  return null;
}

export type Card1IdentityFieldErrors = Partial<{
  name: string;
  propertyType: string;
  businessType: string;
  openingDate: string;
  timezone: string;
  currencyCode: string;
  defaultLanguage: string;
  websiteUrl: string;
  primaryBrandColour: string;
  secondaryBrandColour: string;
  logoUrl: string;
  coverImageUrl: string;
}>;

export function validateIdentityFields(draft: Card1Draft): Card1IdentityFieldErrors {
  const errors: Card1IdentityFieldErrors = {};
  if (draft.name.trim().length < 2) errors.name = "Property name is required.";
  if (!draft.propertyType.trim()) errors.propertyType = "Property type is required.";
  if (!draft.businessType.trim()) errors.businessType = "Business type is required.";
  if (!draft.openingDate.trim()) errors.openingDate = "Opening date is required.";
  if (!draft.timezone.trim()) errors.timezone = "Time zone is required.";
  if (!draft.currencyCode.trim()) errors.currencyCode = "Primary currency is required.";
  if (!draft.defaultLanguage.trim()) errors.defaultLanguage = "Language is required.";
  if (draft.websiteUrl.trim() && !isPlausibleHttpUrl(draft.websiteUrl)) {
    errors.websiteUrl = "Enter a valid website address.";
  }
  if (draft.primaryBrandColour.trim() && !isBrandHex(draft.primaryBrandColour.trim())) {
    errors.primaryBrandColour = "Enter a valid HEX colour.";
  }
  if (draft.secondaryBrandColour.trim() && !isBrandHex(draft.secondaryBrandColour.trim())) {
    errors.secondaryBrandColour = "Enter a valid HEX colour.";
  }
  return errors;
}

export const LEGAL_ENTITY_TYPES = ["plc", "private_limited", "sole_proprietor", "partnership", "other"] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export const LEGAL_ENTITY_TYPE_LABELS: Record<LegalEntityType, string> = {
  plc: "PLC",
  private_limited: "Private limited",
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  other: "Other",
};

export const CARD1_SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "tiktok",
  "tripadvisor",
  "youtube",
  "other",
] as const;
export type Card1SocialPlatform = (typeof CARD1_SOCIAL_PLATFORMS)[number];
export const CARD1_SOCIAL_PLATFORM_LABELS: Record<Card1SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  tripadvisor: "Tripadvisor",
  youtube: "YouTube",
  other: "Other",
};

export const CARD1_PROPERTY_AREA_OPTIONS = [
  "Lobby",
  "Reception",
  "Restaurant",
  "Bar",
  "Pool",
  "Parking",
  "Function",
  "Conference",
  "Spa",
  "Gym",
  "Garden",
  "Business Center",
  "Public",
] as const;

export const CARD1_DEFAULT_BLOCKERS = [
  "incomplete_night_audit",
  "open_cashier_shifts",
  "unsettled_folios",
  "pending_offline_sync",
  "critical_system_errors",
] as const;

export const CARD1_BLOCKER_LABELS: Record<(typeof CARD1_DEFAULT_BLOCKERS)[number], string> = {
  incomplete_night_audit: "Incomplete Night Audit",
  open_cashier_shifts: "Open cashier shifts",
  unsettled_folios: "Unsettled / unbalanced folios",
  pending_offline_sync: "Pending offline sync",
  critical_system_errors: "Critical system errors",
};

export const CARD1_CALENDAR_DISPLAYS = ["gregorian", "ethiopian", "dual"] as const;
export type Card1CalendarDisplay = (typeof CARD1_CALENDAR_DISPLAYS)[number];
export const CARD1_CALENDAR_DISPLAY_LABELS: Record<Card1CalendarDisplay, string> = {
  gregorian: "Gregorian",
  ethiopian: "Ethiopian",
  dual: "Dual (Gregorian + Ethiopian)",
};

export const CARD1_MANUAL_ROLLOVER_ROLES = [
  { id: "owner", label: "Owner" },
  { id: "front_office_manager", label: "Front Office Manager" },
] as const;

export const D8_STRUCTURE_DEFAULTS = {
  buildingRequired: true,
  wingOptional: true,
  floorRequired: true,
  roomCodeFormat: "BLD-WNG-FLR-RM",
  autoNumbering: true,
  duplicateCodePrevention: true,
} as const;

export const PROPERTY_CODE_PREFIX = "NRC";

export type Card1UploadRef = { name: string; kind: string };

export type Card1DepartmentContact = {
  department: string;
  name: string;
  phone: string;
  email: string;
};

export type Card1SocialLink = {
  platform: string;
  url: string;
};

export type Card1SocialContacts = {
  website: string;
  facebook: string;
  instagram: string;
  tripadvisor: string;
  links: Card1SocialLink[];
};

export type Card1EmergencyContact = {
  name: string;
  phone: string;
  notes: string;
};

export type Card1IdentityToggles = {
  showTradingNameOnDocuments: boolean;
  chainProperty: boolean;
  independentProperty: boolean;
  displayPublicly: boolean;
};

export type Card1LocationExtras = {
  googleMapsLink: string;
  nearbyLandmark: string;
  pinVisible: boolean;
};

export type Card1CheckinOps = {
  minLeadTime: string;
  earlyCheckinPolicy: string;
  lateCheckoutPolicy: string;
  dayUseAllowed: boolean;
  frontDesk24h: boolean;
  sameDayCutoff: string;
  overstayGrace: string;
  childPolicy: string;
  extraBedAvailable: boolean;
  idRequiredAtCheckin: boolean;
};

export type Card1LegalExtras = {
  ownershipType: string;
  incorporationDate: string;
};

export type Card1BusinessDateConfig = {
  notes: string;
  closeBlockersEnabled: boolean;
  calendarDisplay: Card1CalendarDisplay;
  approvalRequired: boolean;
  dayBoundary: string;
  nightAuditWindowStart: string;
  nightAuditWindowEnd: string;
  automaticRollover: boolean;
  manualRolloverRoles: string[];
  lockDuringAudit: boolean;
  reservationSellDateRule: string;
  housekeepingBoardDate: string;
  frontOfficeDeskDate: string;
};

export type Card1StructureRules = {
  buildingRequired: boolean;
  wingOptional: boolean;
  floorRequired: boolean;
  roomCodeFormat: string;
  autoNumbering: boolean;
  duplicateCodePrevention: boolean;
};

export type Card1StepStatusMap = Partial<Record<Card1StepId, PropertySetupCardStatus>>;
export type Card2StepStatusMap = Partial<Record<Card2StepId, PropertySetupCardStatus>>;

export type PropertySetupStatus = {
  cards: Partial<Record<PropertySetupCardId, PropertySetupCardStatus>>;
  card1Steps: Card1StepStatusMap;
  card2Steps?: Card2StepStatusMap;
};

export type Card1DerivedCapacity = {
  buildings: number;
  floors: number;
  rooms: number;
  roomTypes: number;
  active: number;
  inactive: number;
  sellable: number;
  nonSellable: number;
};

export type Card1CurrentState = {
  businessDate: string | null;
  systemDate: string;
  propertyLocalTime: string;
  status: "OPEN" | "IN_AUDIT" | "CLOSED";
  lastSuccessfulNightAudit: string;
};

export type Card1Draft = {
  name: string;
  tradingName: string;
  propertyCode: string;
  propertyType: string;
  businessType: string;
  starRating: StarRating | "";
  openingDate: string;
  defaultLanguage: string;
  shortDescription: string;
  timezone: string;
  currencyCode: string;
  logoUrl: string;
  coverImageUrl: string;
  primaryBrandColour: string;
  secondaryBrandColour: string;
  websiteUrl: string;
  brandAffiliation: string;
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
  locationExtras: Card1LocationExtras;
  phone: string;
  email: string;
  whatsapp: string;
  social: Card1SocialContacts;
  departmentContacts: Card1DepartmentContact[];
  emergency: Card1EmergencyContact;
  checkInTime: string;
  checkOutTime: string;
  checkinPolicyText: string;
  checkoutPolicyText: string;
  earlyCheckinPolicyText: string;
  lateCheckoutPolicyText: string;
  checkinOps: Card1CheckinOps;
  businessDateConfig: Card1BusinessDateConfig;
  businessDateBlockers: string[];
  legalName: string;
  legalEntityName: string;
  legalEntityType: LegalEntityType | "";
  registrationNumber: string;
  legalUploadRefs: Card1UploadRef[];
  legalExtras: Card1LegalExtras;
  vatRegistered: boolean;
  vatNumber: string;
  tinNumber: string;
  licenceNumber: string;
  taxUploadRefs: Card1UploadRef[];
  structureRules: Card1StructureRules;
  propertyAreas: string[];
};

export type Card1Snapshot = {
  draft: Card1Draft;
  businessDate: string | null;
  timezone: string;
  pmsSet1Live: boolean;
  card1ColumnsAvailable: boolean;
  fidelityColumnsAvailable: boolean;
  foundationColumnsAvailable: boolean;
  status: PropertySetupStatus;
  derivedCapacity: Card1DerivedCapacity;
  currentState: Card1CurrentState;
  logoPreviewUrl: string;
  coverPreviewUrl: string;
};

export function emptyIdentityToggles(partial?: Partial<Card1IdentityToggles>): Card1IdentityToggles {
  return {
    showTradingNameOnDocuments: false,
    chainProperty: false,
    independentProperty: false,
    displayPublicly: false,
    ...partial,
  };
}

export function emptySocialContacts(partial?: Partial<Card1SocialContacts>): Card1SocialContacts {
  return { website: "", facebook: "", instagram: "", tripadvisor: "", ...partial, links: partial?.links ?? [] };
}

export function emptyEmergencyContact(partial?: Partial<Card1EmergencyContact>): Card1EmergencyContact {
  return { name: "", phone: "", notes: "", ...partial };
}

export function emptyLocationExtras(partial?: Partial<Card1LocationExtras>): Card1LocationExtras {
  return { googleMapsLink: "", nearbyLandmark: "", pinVisible: true, ...partial };
}

export function emptyCheckinOps(partial?: Partial<Card1CheckinOps>): Card1CheckinOps {
  return {
    minLeadTime: "0 hours",
    earlyCheckinPolicy: "Subject to availability",
    lateCheckoutPolicy: "Subject to availability",
    dayUseAllowed: false,
    frontDesk24h: false,
    sameDayCutoff: "22:00",
    overstayGrace: "1 hour",
    childPolicy: "",
    extraBedAvailable: false,
    idRequiredAtCheckin: false,
    ...partial,
  };
}

export function emptyLegalExtras(partial?: Partial<Card1LegalExtras>): Card1LegalExtras {
  return { ownershipType: "", incorporationDate: "", ...partial };
}

export function emptyBusinessDateConfig(partial?: Partial<Card1BusinessDateConfig>): Card1BusinessDateConfig {
  return {
    notes: "",
    closeBlockersEnabled: true,
    calendarDisplay: "dual",
    approvalRequired: true,
    dayBoundary: "04:00",
    nightAuditWindowStart: "00:00",
    nightAuditWindowEnd: "04:00",
    automaticRollover: true,
    manualRolloverRoles: ["owner", "front_office_manager"],
    lockDuringAudit: true,
    reservationSellDateRule: "use_business_date",
    housekeepingBoardDate: "follow_business_date",
    frontOfficeDeskDate: "follow_business_date",
    ...partial,
  };
}

export function emptyStructureRules(partial?: Partial<Card1StructureRules>): Card1StructureRules {
  return { ...D8_STRUCTURE_DEFAULTS, ...partial };
}

export function emptyPropertySetupStatus(partial?: Partial<PropertySetupStatus>): PropertySetupStatus {
  return { cards: {}, card1Steps: {}, card2Steps: {}, ...partial };
}

export function emptyDerivedCapacity(partial?: Partial<Card1DerivedCapacity>): Card1DerivedCapacity {
  return {
    buildings: 0,
    floors: 0,
    rooms: 0,
    roomTypes: 0,
    active: 0,
    inactive: 0,
    sellable: 0,
    nonSellable: 0,
    ...partial,
  };
}

export function emptyCurrentState(partial?: Partial<Card1CurrentState>): Card1CurrentState {
  return {
    businessDate: null,
    systemDate: "",
    propertyLocalTime: "",
    status: "OPEN",
    lastSuccessfulNightAudit: "",
    ...partial,
  };
}

export function emptyCard1Draft(partial?: Partial<Card1Draft>): Card1Draft {
  return {
    name: "",
    tradingName: "",
    propertyCode: "",
    propertyType: "",
    businessType: "",
    starRating: "",
    openingDate: "",
    defaultLanguage: "en",
    shortDescription: "",
    timezone: "",
    currencyCode: "",
    logoUrl: "",
    coverImageUrl: "",
    primaryBrandColour: "",
    secondaryBrandColour: "",
    websiteUrl: "",
    brandAffiliation: "",
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
    locationExtras: emptyLocationExtras(),
    phone: "",
    email: "",
    whatsapp: "",
    social: emptySocialContacts(),
    departmentContacts: [],
    emergency: emptyEmergencyContact(),
    checkInTime: "",
    checkOutTime: "",
    checkinPolicyText: "",
    checkoutPolicyText: "",
    earlyCheckinPolicyText: "",
    lateCheckoutPolicyText: "",
    checkinOps: emptyCheckinOps(),
    businessDateConfig: emptyBusinessDateConfig(),
    businessDateBlockers: [...CARD1_DEFAULT_BLOCKERS],
    legalName: "",
    legalEntityName: "",
    legalEntityType: "",
    registrationNumber: "",
    legalUploadRefs: [],
    legalExtras: emptyLegalExtras(),
    vatRegistered: false,
    vatNumber: "",
    tinNumber: "",
    licenceNumber: "",
    taxUploadRefs: [],
    structureRules: emptyStructureRules(),
    propertyAreas: [],
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
    fidelityColumnsAvailable: false,
    foundationColumnsAvailable: false,
    status: emptyPropertySetupStatus(),
    derivedCapacity: emptyDerivedCapacity(),
    currentState: emptyCurrentState(),
    logoPreviewUrl: "",
    coverPreviewUrl: "",
    ...partial,
  };
}

export function formatPropertyCode(seq: number): string {
  return `${PROPERTY_CODE_PREFIX}${String(Math.max(1, Math.floor(seq))).padStart(4, "0")}`;
}

export function parsePropertyCodeSeq(code: string): number | null {
  const match = /^NRC(\d{4,})$/.exec(code.trim().toUpperCase());
  return match ? Number(match[1]) : null;
}

export function isNrcPropertyCode(code: string): boolean {
  return parsePropertyCodeSeq(code) != null;
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
  const street = [input.addressHouseNo, input.address].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
  const countryName = countryNameFromInput(String(input.country ?? ""));
  const ethiopia = countryName.toLowerCase() === "ethiopia";
  const parts = ethiopia
    ? [
        countryName || input.country,
        input.addressRegion,
        input.city,
        input.addressSubcity,
        input.addressWoreda,
        input.addressKebele,
        input.addressZone,
        street,
        input.postcode,
      ]
    : [street, input.city, input.addressSubcity, input.addressRegion, input.postcode, countryName || input.country];
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export type Card1AddressFieldErrors = Partial<{
  country: string;
  addressRegion: string;
  city: string;
  latitude: string;
  longitude: string;
  googleMapsLink: string;
}>;

export function validateAddressFields(draft: Card1Draft): Card1AddressFieldErrors {
  const errors: Card1AddressFieldErrors = {};
  if (!draft.country.trim()) errors.country = "Select a country.";
  if (!draft.addressRegion.trim() || !isRegionValidForCountry(draft.country, draft.addressRegion)) {
    errors.addressRegion = "Select a region or state for the selected country.";
  }
  if (!draft.city.trim()) errors.city = "City / Town is required.";
  if (!isValidLatitude(draft.latitude)) errors.latitude = "Latitude must be between -90 and 90.";
  if (!isValidLongitude(draft.longitude)) errors.longitude = "Longitude must be between -180 and 180.";
  if (!isValidHttpUrl(draft.locationExtras.googleMapsLink)) errors.googleMapsLink = "Enter a valid URL.";
  return errors;
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

export function parseSocialLinks(value: unknown): Card1SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as { platform?: unknown; url?: unknown };
      const platform = String(rec.platform ?? "").trim();
      const url = String(rec.url ?? "").trim();
      if (!platform && !url) return null;
      return { platform, url };
    })
    .filter((row): row is Card1SocialLink => row !== null);
}

export function parseSocialContacts(value: unknown): Card1SocialContacts {
  if (!value || typeof value !== "object") return emptySocialContacts();
  if (Array.isArray(value)) return emptySocialContacts({ links: parseSocialLinks(value) });
  const rec = value as Record<string, unknown>;
  const links = parseSocialLinks(rec["links"]);
  const legacy: Card1SocialLink[] = [];
  for (const key of ["facebook", "instagram", "tripadvisor"] as const) {
    const url = String(rec[key] ?? "").trim();
    if (url && !links.some((row) => row.platform === key || row.url === url)) {
      legacy.push({ platform: key, url });
    }
  }
  return emptySocialContacts({
    website: String(rec["website"] ?? "").trim(),
    facebook: String(rec["facebook"] ?? "").trim(),
    instagram: String(rec["instagram"] ?? "").trim(),
    tripadvisor: String(rec["tripadvisor"] ?? "").trim(),
    links: [...links, ...legacy],
  });
}

export function parseEmergencyContact(value: unknown): Card1EmergencyContact {
  if (!value || typeof value !== "object") return emptyEmergencyContact();
  const rec = value as Record<string, unknown>;
  return emptyEmergencyContact({
    name: String(rec["name"] ?? "").trim(),
    phone: String(rec["phone"] ?? "").trim(),
    notes: String(rec["notes"] ?? "").trim(),
  });
}

export function parseIdentityToggles(value: unknown): Card1IdentityToggles {
  if (!value || typeof value !== "object") return emptyIdentityToggles();
  const rec = value as Record<string, unknown>;
  return emptyIdentityToggles({
    showTradingNameOnDocuments: rec["showTradingNameOnDocuments"] === true,
    chainProperty: rec["chainProperty"] === true,
    independentProperty: rec["independentProperty"] === true,
    displayPublicly: rec["displayPublicly"] === true,
  });
}

export function parseLocationExtras(value: unknown): Card1LocationExtras {
  if (!value || typeof value !== "object") return emptyLocationExtras();
  const rec = value as Record<string, unknown>;
  return emptyLocationExtras({
    googleMapsLink: String(rec["googleMapsLink"] ?? "").trim(),
    nearbyLandmark: String(rec["nearbyLandmark"] ?? "").trim(),
    pinVisible: rec["pinVisible"] !== false,
  });
}

export function parseCheckinOps(value: unknown): Card1CheckinOps {
  if (!value || typeof value !== "object") return emptyCheckinOps();
  const rec = value as Record<string, unknown>;
  return emptyCheckinOps({
    minLeadTime: String(rec["minLeadTime"] ?? "0 hours").trim() || "0 hours",
    earlyCheckinPolicy: String(rec["earlyCheckinPolicy"] ?? "").trim(),
    lateCheckoutPolicy: String(rec["lateCheckoutPolicy"] ?? "").trim(),
    dayUseAllowed: rec["dayUseAllowed"] === true,
    frontDesk24h: rec["frontDesk24h"] === true,
    sameDayCutoff: String(rec["sameDayCutoff"] ?? "").trim(),
    overstayGrace: String(rec["overstayGrace"] ?? "").trim(),
    childPolicy: String(rec["childPolicy"] ?? "").trim(),
    extraBedAvailable: rec["extraBedAvailable"] === true,
    idRequiredAtCheckin: rec["idRequiredAtCheckin"] === true,
  });
}

export function parseLegalExtras(value: unknown): Card1LegalExtras {
  if (!value || typeof value !== "object") return emptyLegalExtras();
  const rec = value as Record<string, unknown>;
  return emptyLegalExtras({
    ownershipType: String(rec["ownershipType"] ?? "").trim(),
    incorporationDate: String(rec["incorporationDate"] ?? "").trim(),
  });
}

export function parseCalendarDisplay(value: unknown): Card1CalendarDisplay {
  return (CARD1_CALENDAR_DISPLAYS as readonly string[]).includes(String(value))
    ? (value as Card1CalendarDisplay)
    : "dual";
}

export function parseBusinessDateConfig(value: unknown): Card1BusinessDateConfig {
  if (!value || typeof value !== "object") return emptyBusinessDateConfig();
  const rec = value as Record<string, unknown>;
  const roles = Array.isArray(rec["manualRolloverRoles"])
    ? rec["manualRolloverRoles"].map((row) => String(row ?? "").trim()).filter(Boolean)
    : undefined;
  return emptyBusinessDateConfig({
    notes: String(rec["notes"] ?? "").trim(),
    closeBlockersEnabled: rec["closeBlockersEnabled"] !== false,
    calendarDisplay: parseCalendarDisplay(rec["calendarDisplay"]),
    approvalRequired: rec["approvalRequired"] !== false,
    dayBoundary: String(rec["dayBoundary"] ?? rec["businessDayBoundary"] ?? "").trim() || "04:00",
    nightAuditWindowStart: String(rec["nightAuditWindowStart"] ?? "").trim() || "00:00",
    nightAuditWindowEnd: String(rec["nightAuditWindowEnd"] ?? "").trim() || "04:00",
    automaticRollover: rec["automaticRollover"] !== false,
    manualRolloverRoles: roles && roles.length > 0 ? roles : ["owner", "front_office_manager"],
    lockDuringAudit: rec["lockDuringAudit"] !== false,
    reservationSellDateRule: String(rec["reservationSellDateRule"] ?? "use_business_date").trim() || "use_business_date",
    housekeepingBoardDate: String(rec["housekeepingBoardDate"] ?? "follow_business_date").trim() || "follow_business_date",
    frontOfficeDeskDate: String(rec["frontOfficeDeskDate"] ?? "follow_business_date").trim() || "follow_business_date",
  });
}

export function parseBusinessDateBlockers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [...CARD1_DEFAULT_BLOCKERS];
  return value.map((row) => String(row ?? "").trim()).filter(Boolean);
}

export function parseStructureRules(value: unknown): Card1StructureRules {
  if (!value || typeof value !== "object") return emptyStructureRules();
  const rec = value as Record<string, unknown>;
  return emptyStructureRules({
    buildingRequired: rec["buildingRequired"] !== false,
    wingOptional: rec["wingOptional"] !== false,
    floorRequired: rec["floorRequired"] !== false,
    roomCodeFormat: String(rec["roomCodeFormat"] ?? D8_STRUCTURE_DEFAULTS.roomCodeFormat).trim() || D8_STRUCTURE_DEFAULTS.roomCodeFormat,
    autoNumbering: rec["autoNumbering"] !== false,
    duplicateCodePrevention: rec["duplicateCodePrevention"] !== false,
  });
}

export function parsePropertyAreas(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => String(row ?? "").trim()).filter(Boolean);
}

export function parseCardStatus(value: unknown): PropertySetupCardStatus {
  return (PROPERTY_SETUP_CARD_STATUSES as readonly string[]).includes(String(value))
    ? (value as PropertySetupCardStatus)
    : "not_started";
}

export function parsePropertySetupStatus(value: unknown): PropertySetupStatus {
  if (!value || typeof value !== "object") return emptyPropertySetupStatus();
  const rec = value as { cards?: unknown; card1Steps?: unknown; card2Steps?: unknown };
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
  const card2Steps: Card2StepStatusMap = {};
  if (rec.card2Steps && typeof rec.card2Steps === "object") {
    for (const step of CARD2_STEPS) {
      const raw = (rec.card2Steps as Record<string, unknown>)[step.id];
      if (raw != null) card2Steps[step.id] = parseCardStatus(raw);
    }
  }
  return { cards, card1Steps, card2Steps };
}

function plausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function plausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function departmentRowComplete(row: Card1DepartmentContact): boolean {
  return Boolean(row.department.trim() && plausibleEmail(row.email) && plausiblePhone(row.phone));
}

function departmentRowPresent(row: Card1DepartmentContact): boolean {
  return Boolean(row.department.trim() || row.email.trim() || row.phone.trim() || row.name.trim());
}

export function card1StepComplete(step: Card1StepId, draft: Card1Draft, set2?: Pick<Set2Snapshot, "buildings" | "floors">): boolean {
  if (step === "identity") {
    return (
      draft.name.trim().length >= 2 &&
      Boolean(draft.propertyType.trim()) &&
      Boolean(draft.businessType.trim()) &&
      Boolean(draft.openingDate.trim()) &&
      Boolean(draft.timezone.trim()) &&
      Boolean(draft.currencyCode.trim()) &&
      Boolean(draft.defaultLanguage.trim())
    );
  }
  if (step === "address") {
    return Object.keys(validateAddressFields(draft)).length === 0;
  }
  if (step === "contacts") {
    const departmentsOk = draft.departmentContacts.every((row) => !departmentRowPresent(row) || departmentRowComplete(row));
    return Boolean(
      plausiblePhone(draft.phone) &&
        plausibleEmail(draft.email) &&
        draft.emergency.name.trim() &&
        plausiblePhone(draft.emergency.phone) &&
        departmentsOk,
    );
  }
  if (step === "checkin") {
    return Boolean(normalizeClock(draft.checkInTime) && normalizeClock(draft.checkOutTime) && draft.checkinOps.minLeadTime.trim());
  }
  if (step === "business-date") {
    return Boolean(
      draft.businessDateConfig.dayBoundary.trim() &&
        draft.businessDateConfig.nightAuditWindowStart.trim() &&
        draft.businessDateConfig.nightAuditWindowEnd.trim() &&
        draft.businessDateConfig.manualRolloverRoles.length > 0,
    );
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

export function derivedCapacityFromSet2(set2: Pick<Set2Snapshot, "roomCount" | "roomTypeCount" | "buildings" | "floors">): Card1DerivedCapacity {
  const buildings = set2.buildings.length;
  const floors = set2.floors.length;
  const activeBuildings = set2.buildings.filter((row) => row.active).length;
  const inactiveBuildings = buildings - activeBuildings;
  return emptyDerivedCapacity({
    buildings,
    floors,
    rooms: set2.roomCount,
    roomTypes: set2.roomTypeCount,
    active: activeBuildings,
    inactive: inactiveBuildings,
    sellable: set2.roomCount,
    nonSellable: 0,
  });
}

export function displayedCard1BusinessDate(businessDate: string | null | undefined, timezone: string): string {
  return displayedBusinessDate(businessDate, timezone);
}

export function structureRoomCodeExample(format: string): string {
  return format.replace("BLD", "MAIN").replace("WNG", "EAST").replace("FLR", "02").replace("RM", "101");
}

export function liveBlockPreview(
  blockers: string[],
  facts?: Partial<Record<(typeof CARD1_DEFAULT_BLOCKERS)[number], boolean>>,
): string {
  const active = CARD1_DEFAULT_BLOCKERS.filter((id) => blockers.includes(id) && facts?.[id] === true);
  if (active.length === 0) {
    return "No live blockers detected from current house facts. Runtime blockers affect date advance, not whether this step can be Complete.";
  }
  const labels = active.map((id) => CARD1_BLOCKER_LABELS[id]).join(" · ");
  return `Business date would currently be blocked because: ${labels}.`;
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
  const buildings = set2.buildings.filter((row) => row.active);
  const floors = set2.floors.filter((row) => row.active).length;
  if (draft.structureRules.buildingRequired && buildings.length < 1) warnings.push("At least one building is required.");
  if (draft.structureRules.floorRequired && floors < 1) warnings.push("At least one floor is required.");
  for (const building of buildings) {
    const declared = building.floorCount;
    if (declared == null) continue;
    const actual = set2.floors.filter((row) => row.active && row.buildingId === building.id).length;
    if (declared !== actual) {
      warnings.push(`${building.name}: Number of Floors (${declared}) differs from floor nodes (${actual}). Soft warning — does not block.`);
    }
  }
  return warnings;
}

export function markStepInProgress(status: PropertySetupStatus, step: Card1StepId): PropertySetupStatus {
  return {
    cards: { ...status.cards, "property-business": "in_progress" },
    card1Steps: { ...status.card1Steps, [step]: status.card1Steps[step] === "complete" ? "complete" : "in_progress" },
    card2Steps: { ...(status.card2Steps ?? {}) },
  };
}

export function markStepComplete(status: PropertySetupStatus, step: Card1StepId, draft: Card1Draft, set2?: Pick<Set2Snapshot, "buildings" | "floors">): PropertySetupStatus {
  const nextSteps = { ...status.card1Steps, [step]: card1StepComplete(step, draft, set2) ? "complete" : "in_progress" };
  const next: PropertySetupStatus = { cards: { ...status.cards }, card1Steps: nextSteps, card2Steps: { ...(status.card2Steps ?? {}) } };
  next.cards["property-business"] = evaluateCard1Status(draft, next, set2);
  return next;
}

export function markCard1Complete(status: PropertySetupStatus): PropertySetupStatus {
  const card1Steps = { ...status.card1Steps };
  for (const step of CARD1_STEPS) card1Steps[step.id] = "complete";
  return {
    cards: { ...status.cards, "property-business": "complete" },
    card1Steps,
    card2Steps: { ...(status.card2Steps ?? {}) },
  };
}
