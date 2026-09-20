/**
 * PMS Property Setup Card 1 — load / save Property & Business (Issue #162).
 *
 * Reuses Live SET1 identity / CI-CO / legal_name / business_date and Live SET2
 * structure masters. 0062 / 0063 columns are optional at runtime: missing
 * columns never crash the hub. Completing Card 1 never flips pms_set1_live.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/shared/lib/property-time";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  SET1_DENIED,
  canEditSet1,
  isMissingColumnError,
  normalizeClock,
  optionalNumber,
} from "./pms-set1-foundation";
import { persistCard2RoomTypesReadiness } from "./rooms.functions";
import { loadSet2Snapshot } from "./pms-set2-structure.functions";
import type { Set2Snapshot } from "./pms-set2-structure";
import {
  CARD1_AUDIT_COMPLETED,
  CARD1_AUDIT_DRAFT,
  CARD1_AUDIT_STEP,
  CARD1_BRAND_IMAGE_MAX_BYTES,
  CARD1_BRAND_IMAGE_TYPES,
  CARD1_COLUMNS_UNAVAILABLE,
  CARD1_STEPS,
  card1StepComplete,
  composeFullAddress,
  derivedCapacityFromSet2,
  emptyCard1Draft,
  emptyCard1Snapshot,
  emptyCurrentState,
  formatPropertyCode,
  isHttpOrDataAsset,
  markCard1Complete,
  markStepComplete,
  markStepInProgress,
  parseBusinessDateBlockers,
  parseBusinessDateConfig,
  parseCheckinOps,
  parseDepartmentContacts,
  parseEmergencyContact,
  parseIdentityToggles,
  parseLegalEntityType,
  parseLegalExtras,
  parseLocationExtras,
  parsePropertyAreas,
  parsePropertyCodeSeq,
  parsePropertySetupStatus,
  parseSocialContacts,
  parseStarRating,
  parseStructureRules,
  parseUploadRefs,
  vatCertificateRequired,
  hasVatCertificate,
  type Card1Draft,
  type Card1Snapshot,
  type Card1StepId,
  type PropertySetupStatus,
} from "./pms-property-setup-card1";
import { IMAGE_EXT_BY_TYPE, ROOM_BUCKET, signRoomImages } from "./rooms.server";

const idSchema = z.string().uuid();

const SET1_COLUMNS =
  "id, name, logo_url, phone, email, address, city, postcode, country, timezone, currency_code, business_date, property_code, legal_name, property_type, check_in_time, check_out_time, pms_set1_live, hotel_day_open";

const CARD1_COLUMNS =
  `${SET1_COLUMNS}, trading_name, star_rating, default_language, short_description, identity_toggles, brand_name, brand_code, chain_name, address_region, address_zone, address_woreda, address_kebele, address_subcity, address_house_no, latitude, longitude, full_address, whatsapp, social_contacts, department_contacts, checkin_policy_text, checkout_policy_text, early_checkin_policy_text, late_checkout_policy_text, business_date_config, business_date_blockers, legal_entity_name, legal_entity_type, registration_number, legal_upload_refs, vat_registered, vat_number, tin_number, licence_number, tax_upload_refs, structure_rules_posture, pms_property_setup_status`;

const CARD1_FIDELITY_COLUMNS =
  `${CARD1_COLUMNS}, opening_date, cover_image_url, primary_brand_colour, secondary_brand_colour, website_url, brand_affiliation, business_type, emergency_contacts, property_areas, location_extras, checkin_ops, legal_extras`;

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const uploadRefSchema = z.object({ name: z.string().trim().max(200), kind: z.string().trim().max(80) });
const departmentSchema = z.object({
  department: z.string().trim().max(80),
  name: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(254),
});
const socialLinkSchema = z.object({
  platform: z.string().trim().max(40),
  url: z.string().trim().max(200),
});

const draftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tradingName: z.string().trim().max(160).optional().nullable(),
  propertyCode: z.string().trim().max(40).optional().nullable(),
  propertyType: z.string().trim().max(40).optional().nullable(),
  businessType: z.string().trim().max(40).optional().nullable(),
  starRating: z.union([z.literal(""), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  openingDate: z.string().trim().max(10).optional().nullable(),
  defaultLanguage: z.string().trim().max(16).optional().nullable(),
  shortDescription: z.string().trim().max(500).optional().nullable(),
  timezone: z.string().trim().min(1).max(64),
  currencyCode: z.string().trim().length(3),
  logoUrl: z.string().trim().max(2000).optional().nullable(),
  coverImageUrl: z.string().trim().max(2000).optional().nullable(),
  primaryBrandColour: z.string().trim().max(16).optional().nullable(),
  secondaryBrandColour: z.string().trim().max(16).optional().nullable(),
  websiteUrl: z.string().trim().max(200).optional().nullable(),
  brandAffiliation: z.string().trim().max(40).optional().nullable(),
  identityToggles: z.object({
    showTradingNameOnDocuments: z.boolean(),
    chainProperty: z.boolean(),
    independentProperty: z.boolean(),
    displayPublicly: z.boolean(),
  }),
  brandName: z.string().trim().max(160).optional().nullable(),
  brandCode: z.string().trim().max(40).optional().nullable(),
  chainName: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  addressHouseNo: z.string().trim().max(40).optional().nullable(),
  addressKebele: z.string().trim().max(80).optional().nullable(),
  addressWoreda: z.string().trim().max(80).optional().nullable(),
  addressZone: z.string().trim().max(80).optional().nullable(),
  addressSubcity: z.string().trim().max(80).optional().nullable(),
  addressRegion: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postcode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  latitude: z.string().trim().max(20).optional().nullable(),
  longitude: z.string().trim().max(20).optional().nullable(),
  locationExtras: z.object({
    googleMapsLink: z.string().trim().max(300),
    nearbyLandmark: z.string().trim().max(200),
    pinVisible: z.boolean(),
  }),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  social: z.object({
    website: z.string().trim().max(200),
    facebook: z.string().trim().max(200),
    instagram: z.string().trim().max(200),
    tripadvisor: z.string().trim().max(200),
    links: z.array(socialLinkSchema).max(20),
  }),
  departmentContacts: z.array(departmentSchema).max(20),
  emergency: z.object({
    name: z.string().trim().max(120),
    phone: z.string().trim().max(30),
    notes: z.string().trim().max(500),
  }),
  checkInTime: z.string().trim().max(8).optional().nullable(),
  checkOutTime: z.string().trim().max(8).optional().nullable(),
  checkinPolicyText: z.string().trim().max(2000).optional().nullable(),
  checkoutPolicyText: z.string().trim().max(2000).optional().nullable(),
  earlyCheckinPolicyText: z.string().trim().max(2000).optional().nullable(),
  lateCheckoutPolicyText: z.string().trim().max(2000).optional().nullable(),
  checkinOps: z.object({
    minLeadTime: z.string().trim().max(40),
    earlyCheckinPolicy: z.string().trim().max(80),
    lateCheckoutPolicy: z.string().trim().max(80),
    dayUseAllowed: z.boolean(),
    frontDesk24h: z.boolean(),
    sameDayCutoff: z.string().trim().max(8),
    overstayGrace: z.string().trim().max(40),
    childPolicy: z.string().trim().max(200),
    extraBedAvailable: z.boolean(),
    idRequiredAtCheckin: z.boolean(),
  }),
  businessDateConfig: z.object({
    notes: z.string().trim().max(500),
    closeBlockersEnabled: z.boolean(),
    calendarDisplay: z.enum(["gregorian", "ethiopian", "dual"]),
    approvalRequired: z.boolean(),
    dayBoundary: z.string().trim().max(8),
    nightAuditWindowStart: z.string().trim().max(8),
    nightAuditWindowEnd: z.string().trim().max(8),
    automaticRollover: z.boolean(),
    manualRolloverRoles: z.array(z.string().trim().max(40)).max(8),
    lockDuringAudit: z.boolean(),
    reservationSellDateRule: z.string().trim().max(40),
    housekeepingBoardDate: z.string().trim().max(40),
    frontOfficeDeskDate: z.string().trim().max(40),
  }),
  businessDateBlockers: z.array(z.string().trim().max(120)).max(20),
  legalName: z.string().trim().max(160).optional().nullable(),
  legalEntityName: z.string().trim().max(160).optional().nullable(),
  legalEntityType: z.enum(["", "plc", "private_limited", "sole_proprietor", "partnership", "other"]),
  registrationNumber: z.string().trim().max(80).optional().nullable(),
  legalUploadRefs: z.array(uploadRefSchema).max(12),
  legalExtras: z.object({
    ownershipType: z.string().trim().max(80),
    incorporationDate: z.string().trim().max(10),
  }),
  vatRegistered: z.boolean(),
  vatNumber: z.string().trim().max(80).optional().nullable(),
  tinNumber: z.string().trim().max(80).optional().nullable(),
  licenceNumber: z.string().trim().max(80).optional().nullable(),
  taxUploadRefs: z.array(uploadRefSchema).max(12),
  structureRules: z.object({
    buildingRequired: z.boolean(),
    wingOptional: z.boolean(),
    floorRequired: z.boolean(),
    roomCodeFormat: z.string().trim().max(40),
    autoNumbering: z.boolean(),
    duplicateCodePrevention: z.boolean(),
  }),
  propertyAreas: z.array(z.string().trim().max(40)).max(24),
});

const saveSchema = z.object({
  restaurantId: idSchema,
  step: z.enum(CARD1_STEPS.map((step) => step.id) as [Card1StepId, ...Card1StepId[]]),
  mode: z.enum(["draft", "continue", "finish"]),
  draft: draftSchema,
});

function text(row: RestaurantRow | null, key: keyof RestaurantRow): string {
  const value = row?.[key];
  return value == null ? "" : String(value);
}

function calendarDate(timezone: string): string {
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

function localTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

async function loadLastNightAudit(supabaseAdmin: Admin, restaurantId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("night_audit_runs")
    .select("closed_at, business_date, status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return "";
  return String(data.closed_at ?? data.business_date ?? "");
}

async function assignPropertyCode(supabaseAdmin: Admin, current: string): Promise<string> {
  if (parsePropertyCodeSeq(current) != null) return current.trim().toUpperCase();
  const { data } = await supabaseAdmin.from("restaurants").select("property_code");
  let max = 0;
  for (const row of data ?? []) {
    const seq = parsePropertyCodeSeq(String(row.property_code ?? ""));
    if (seq != null && seq > max) max = seq;
  }
  return formatPropertyCode(max + 1);
}

function snapshotFromRow(
  row: RestaurantRow | null,
  card1ColumnsAvailable: boolean,
  fidelityColumnsAvailable: boolean,
  foundationColumnsAvailable: boolean,
  set2: Set2Snapshot,
  lastSuccessfulNightAudit = "",
): Card1Snapshot {
  const social = parseSocialContacts(card1ColumnsAvailable ? row?.social_contacts : null);
  const draft = emptyCard1Draft({
    name: String(row?.name ?? ""),
    tradingName: card1ColumnsAvailable ? text(row, "trading_name") : "",
    propertyCode: foundationColumnsAvailable ? text(row, "property_code") : "",
    propertyType: foundationColumnsAvailable ? text(row, "property_type") : "",
    businessType: fidelityColumnsAvailable ? text(row, "business_type") : "",
    starRating: card1ColumnsAvailable ? parseStarRating(row?.star_rating) : "",
    openingDate: fidelityColumnsAvailable ? text(row, "opening_date") : "",
    defaultLanguage: card1ColumnsAvailable ? text(row, "default_language") || "en" : "en",
    shortDescription: card1ColumnsAvailable ? text(row, "short_description") : "",
    timezone: String(row?.timezone ?? DEFAULT_TIMEZONE),
    currencyCode: String(row?.currency_code ?? DEFAULT_CURRENCY),
    logoUrl: String(row?.logo_url ?? ""),
    coverImageUrl: fidelityColumnsAvailable ? text(row, "cover_image_url") : "",
    primaryBrandColour: fidelityColumnsAvailable ? text(row, "primary_brand_colour") : "",
    secondaryBrandColour: fidelityColumnsAvailable ? text(row, "secondary_brand_colour") : "",
    websiteUrl: fidelityColumnsAvailable ? text(row, "website_url") : social.website,
    brandAffiliation: fidelityColumnsAvailable ? text(row, "brand_affiliation") : "",
    identityToggles: parseIdentityToggles(card1ColumnsAvailable ? row?.identity_toggles : null),
    brandName: card1ColumnsAvailable ? text(row, "brand_name") : "",
    brandCode: card1ColumnsAvailable ? text(row, "brand_code") : "",
    chainName: card1ColumnsAvailable ? text(row, "chain_name") : "",
    address: String(row?.address ?? ""),
    addressHouseNo: card1ColumnsAvailable ? text(row, "address_house_no") : "",
    addressKebele: card1ColumnsAvailable ? text(row, "address_kebele") : "",
    addressWoreda: card1ColumnsAvailable ? text(row, "address_woreda") : "",
    addressZone: card1ColumnsAvailable ? text(row, "address_zone") : "",
    addressSubcity: card1ColumnsAvailable ? text(row, "address_subcity") : "",
    addressRegion: card1ColumnsAvailable ? text(row, "address_region") : "",
    city: String(row?.city ?? ""),
    postcode: String(row?.postcode ?? ""),
    country: String(row?.country ?? "Ethiopia"),
    latitude: card1ColumnsAvailable && row?.latitude != null ? String(row.latitude) : "",
    longitude: card1ColumnsAvailable && row?.longitude != null ? String(row.longitude) : "",
    locationExtras: parseLocationExtras(fidelityColumnsAvailable ? row?.location_extras : null),
    phone: String(row?.phone ?? ""),
    email: String(row?.email ?? ""),
    whatsapp: card1ColumnsAvailable ? text(row, "whatsapp") : "",
    social,
    departmentContacts: card1ColumnsAvailable ? parseDepartmentContacts(row?.department_contacts) : [],
    emergency: parseEmergencyContact(fidelityColumnsAvailable ? row?.emergency_contacts : null),
    checkInTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_in_time ?? "")) : "",
    checkOutTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_out_time ?? "")) : "",
    checkinPolicyText: card1ColumnsAvailable ? text(row, "checkin_policy_text") : "",
    checkoutPolicyText: card1ColumnsAvailable ? text(row, "checkout_policy_text") : "",
    earlyCheckinPolicyText: card1ColumnsAvailable ? text(row, "early_checkin_policy_text") : "",
    lateCheckoutPolicyText: card1ColumnsAvailable ? text(row, "late_checkout_policy_text") : "",
    checkinOps: parseCheckinOps(fidelityColumnsAvailable ? row?.checkin_ops : null),
    businessDateConfig: parseBusinessDateConfig(card1ColumnsAvailable ? row?.business_date_config : null),
    businessDateBlockers: card1ColumnsAvailable ? parseBusinessDateBlockers(row?.business_date_blockers) : [],
    legalName: foundationColumnsAvailable ? text(row, "legal_name") : "",
    legalEntityName: card1ColumnsAvailable ? text(row, "legal_entity_name") : "",
    legalEntityType: card1ColumnsAvailable ? parseLegalEntityType(row?.legal_entity_type) : "",
    registrationNumber: card1ColumnsAvailable ? text(row, "registration_number") : "",
    legalUploadRefs: card1ColumnsAvailable ? parseUploadRefs(row?.legal_upload_refs) : [],
    legalExtras: parseLegalExtras(fidelityColumnsAvailable ? row?.legal_extras : null),
    vatRegistered: card1ColumnsAvailable ? row?.vat_registered === true : false,
    vatNumber: card1ColumnsAvailable ? text(row, "vat_number") : "",
    tinNumber: card1ColumnsAvailable ? text(row, "tin_number") : "",
    licenceNumber: card1ColumnsAvailable ? text(row, "licence_number") : "",
    taxUploadRefs: card1ColumnsAvailable ? parseUploadRefs(row?.tax_upload_refs) : [],
    structureRules: parseStructureRules(card1ColumnsAvailable ? row?.structure_rules_posture : null),
    propertyAreas: parsePropertyAreas(fidelityColumnsAvailable ? row?.property_areas : null),
  });
  draft.fullAddress = card1ColumnsAvailable && text(row, "full_address") ? text(row, "full_address") : composeFullAddress(draft);
  const status = card1ColumnsAvailable
    ? parsePropertySetupStatus(row?.pms_property_setup_status)
    : emptyCard1Snapshot().status;
  const timezone = draft.timezone;
  const hotelOpen = foundationColumnsAvailable ? row?.hotel_day_open !== false : true;
  return {
    draft,
    businessDate: row?.business_date ?? null,
    timezone,
    pmsSet1Live: foundationColumnsAvailable ? row?.pms_set1_live === true : false,
    card1ColumnsAvailable,
    fidelityColumnsAvailable,
    foundationColumnsAvailable,
    status,
    derivedCapacity: derivedCapacityFromSet2(set2),
    currentState: emptyCurrentState({
      businessDate: row?.business_date ?? null,
      systemDate: calendarDate(timezone),
      propertyLocalTime: localTime(timezone),
      status: hotelOpen ? "OPEN" : "CLOSED",
      lastSuccessfulNightAudit,
    }),
    logoPreviewUrl: isHttpOrDataAsset(draft.logoUrl) ? draft.logoUrl : "",
    coverPreviewUrl: isHttpOrDataAsset(draft.coverImageUrl) ? draft.coverImageUrl : "",
  };
}

async function withBrandPreviews(snapshot: Card1Snapshot): Promise<Card1Snapshot> {
  const paths = [snapshot.draft.logoUrl, snapshot.draft.coverImageUrl].filter(
    (value) => value.trim() && !isHttpOrDataAsset(value),
  );
  if (paths.length === 0) return snapshot;
  const signed = await signRoomImages(paths);
  return {
    ...snapshot,
    logoPreviewUrl: isHttpOrDataAsset(snapshot.draft.logoUrl)
      ? snapshot.draft.logoUrl
      : (signed.get(snapshot.draft.logoUrl) ?? ""),
    coverPreviewUrl: isHttpOrDataAsset(snapshot.draft.coverImageUrl)
      ? snapshot.draft.coverImageUrl
      : (signed.get(snapshot.draft.coverImageUrl) ?? ""),
  };
}

async function loadRestaurantRow(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<{
  row: RestaurantRow | null;
  card1ColumnsAvailable: boolean;
  fidelityColumnsAvailable: boolean;
  foundationColumnsAvailable: boolean;
}> {
  const fidelity = await supabaseAdmin.from("restaurants").select(CARD1_FIDELITY_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!fidelity.error) {
    return {
      row: (fidelity.data as RestaurantRow | null) ?? null,
      card1ColumnsAvailable: true,
      fidelityColumnsAvailable: true,
      foundationColumnsAvailable: true,
    };
  }
  if (!isMissingColumnError(fidelity.error)) throw new Error(fidelity.error.message);
  const full = await supabaseAdmin.from("restaurants").select(CARD1_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!full.error) {
    return {
      row: (full.data as RestaurantRow | null) ?? null,
      card1ColumnsAvailable: true,
      fidelityColumnsAvailable: false,
      foundationColumnsAvailable: true,
    };
  }
  if (!isMissingColumnError(full.error)) throw new Error(full.error.message);
  const foundation = await supabaseAdmin.from("restaurants").select(SET1_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!foundation.error) {
    return {
      row: (foundation.data as RestaurantRow | null) ?? null,
      card1ColumnsAvailable: false,
      fidelityColumnsAvailable: false,
      foundationColumnsAvailable: true,
    };
  }
  if (!isMissingColumnError(foundation.error)) throw new Error(foundation.error.message);
  const core = await supabaseAdmin
    .from("restaurants")
    .select("id, name, logo_url, phone, email, address, city, postcode, country, timezone, currency_code, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (core.error) throw new Error(core.error.message);
  return {
    row: (core.data as RestaurantRow | null) ?? null,
    card1ColumnsAvailable: false,
    fidelityColumnsAvailable: false,
    foundationColumnsAvailable: false,
  };
}

/** Read-only Card 1 source loader for Card 8 System Validation. */
export async function loadCard1ValidationSnapshot(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<{ snapshot: Card1Snapshot; set2: Set2Snapshot }> {
  const [loaded, set2, lastSuccessfulNightAudit] = await Promise.all([
    loadRestaurantRow(supabaseAdmin, restaurantId),
    loadSet2Snapshot(supabaseAdmin, restaurantId),
    loadLastNightAudit(supabaseAdmin, restaurantId),
  ]);
  const snapshot = await withBrandPreviews(
    snapshotFromRow(
      loaded.row,
      loaded.card1ColumnsAvailable,
      loaded.fidelityColumnsAvailable,
      loaded.foundationColumnsAvailable,
      set2,
      lastSuccessfulNightAudit,
    ),
  );
  return { snapshot, set2 };
}

async function writeAudit(
  supabaseAdmin: Admin,
  params: {
    restaurantId: string;
    actorUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    section?: string;
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: params.action,
    metadata: {
      section: params.section ?? null,
      before: params.before as Json,
      after: params.after as Json,
      when: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[pms-card1] audit", error.message);
    return false;
  }
  return true;
}

function draftFromSave(data: z.infer<typeof draftSchema>, propertyCode: string): Card1Draft {
  const draft = emptyCard1Draft({
    ...data,
    propertyCode,
    tradingName: data.tradingName ?? "",
    propertyType: data.propertyType ?? "",
    businessType: data.businessType ?? "",
    openingDate: data.openingDate ?? "",
    defaultLanguage: data.defaultLanguage || "en",
    shortDescription: data.shortDescription ?? "",
    logoUrl: data.logoUrl ?? "",
    coverImageUrl: data.coverImageUrl ?? "",
    primaryBrandColour: data.primaryBrandColour ?? "",
    secondaryBrandColour: data.secondaryBrandColour ?? "",
    websiteUrl: data.websiteUrl ?? "",
    brandAffiliation: data.brandAffiliation ?? "",
    brandName: data.brandName ?? "",
    brandCode: data.brandCode ?? "",
    chainName: data.chainName ?? "",
    address: data.address ?? "",
    addressHouseNo: data.addressHouseNo ?? "",
    addressKebele: data.addressKebele ?? "",
    addressWoreda: data.addressWoreda ?? "",
    addressZone: data.addressZone ?? "",
    addressSubcity: data.addressSubcity ?? "",
    addressRegion: data.addressRegion ?? "",
    city: data.city ?? "",
    postcode: data.postcode ?? "",
    country: data.country ?? "Ethiopia",
    latitude: data.latitude ?? "",
    longitude: data.longitude ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    whatsapp: data.whatsapp ?? "",
    checkInTime: data.checkInTime ?? "",
    checkOutTime: data.checkOutTime ?? "",
    checkinPolicyText: data.checkinPolicyText ?? "",
    checkoutPolicyText: data.checkoutPolicyText ?? "",
    earlyCheckinPolicyText: data.earlyCheckinPolicyText ?? "",
    lateCheckoutPolicyText: data.lateCheckoutPolicyText ?? "",
    legalName: data.legalName ?? "",
    legalEntityName: data.legalEntityName ?? "",
    registrationNumber: data.registrationNumber ?? "",
    vatNumber: data.vatNumber ?? "",
    tinNumber: data.tinNumber ?? "",
    licenceNumber: data.licenceNumber ?? "",
  });
  draft.fullAddress = composeFullAddress(draft);
  return draft;
}

function card1Patch(
  draft: Card1Draft,
  status: PropertySetupStatus,
  foundationColumnsAvailable: boolean,
  fidelityColumnsAvailable: boolean,
): RestaurantUpdate {
  const patch: RestaurantUpdate = {
    name: draft.name,
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    address: draft.address.trim() || null,
    city: draft.city.trim() || null,
    postcode: draft.postcode.trim() || null,
    country: draft.country.trim() || null,
    logo_url: draft.logoUrl.trim() || null,
    timezone: draft.timezone,
    currency_code: draft.currencyCode.toUpperCase(),
    trading_name: draft.tradingName.trim() || null,
    star_rating: draft.starRating === "" ? null : draft.starRating,
    default_language: draft.defaultLanguage.trim() || null,
    short_description: draft.shortDescription.trim() || null,
    identity_toggles: draft.identityToggles as unknown as Json,
    brand_name: draft.brandName.trim() || null,
    brand_code: draft.brandCode.trim() || null,
    chain_name: draft.chainName.trim() || null,
    address_region: draft.addressRegion.trim() || null,
    address_zone: draft.addressZone.trim() || null,
    address_woreda: draft.addressWoreda.trim() || null,
    address_kebele: draft.addressKebele.trim() || null,
    address_subcity: draft.addressSubcity.trim() || null,
    address_house_no: draft.addressHouseNo.trim() || null,
    latitude: optionalNumber(draft.latitude),
    longitude: optionalNumber(draft.longitude),
    full_address: composeFullAddress(draft) || null,
    whatsapp: draft.whatsapp.trim() || null,
    social_contacts: { links: draft.social.links } as unknown as Json,
    department_contacts: draft.departmentContacts as unknown as Json,
    checkin_policy_text: draft.checkinPolicyText.trim() || null,
    checkout_policy_text: draft.checkoutPolicyText.trim() || null,
    early_checkin_policy_text: draft.earlyCheckinPolicyText.trim() || null,
    late_checkout_policy_text: draft.lateCheckoutPolicyText.trim() || null,
    business_date_config: draft.businessDateConfig as unknown as Json,
    business_date_blockers: draft.businessDateBlockers as unknown as Json,
    legal_entity_name: draft.legalEntityName.trim() || null,
    legal_entity_type: draft.legalEntityType || null,
    registration_number: draft.registrationNumber.trim() || null,
    legal_upload_refs: draft.legalUploadRefs as unknown as Json,
    vat_registered: draft.vatRegistered,
    vat_number: draft.vatNumber.trim() || null,
    tin_number: draft.tinNumber.trim() || null,
    licence_number: draft.licenceNumber.trim() || null,
    tax_upload_refs: draft.taxUploadRefs as unknown as Json,
    structure_rules_posture: draft.structureRules as unknown as Json,
    pms_property_setup_status: status as unknown as Json,
  };
  if (fidelityColumnsAvailable) {
    patch.opening_date = draft.openingDate.trim() || null;
    patch.cover_image_url = draft.coverImageUrl.trim() || null;
    patch.primary_brand_colour = draft.primaryBrandColour.trim() || null;
    patch.secondary_brand_colour = draft.secondaryBrandColour.trim() || null;
    patch.website_url = draft.websiteUrl.trim() || null;
    patch.brand_affiliation = draft.brandAffiliation.trim() || null;
    patch.business_type = draft.businessType.trim() || null;
    patch.emergency_contacts = draft.emergency as unknown as Json;
    patch.property_areas = draft.propertyAreas as unknown as Json;
    patch.location_extras = draft.locationExtras as unknown as Json;
    patch.checkin_ops = draft.checkinOps as unknown as Json;
    patch.legal_extras = draft.legalExtras as unknown as Json;
  }
  if (foundationColumnsAvailable) {
    patch.property_code = draft.propertyCode.trim() || null;
    patch.legal_name = draft.legalName.trim() || null;
    patch.property_type = draft.propertyType || null;
    patch.check_in_time = normalizeClock(draft.checkInTime) || null;
    patch.check_out_time = normalizeClock(draft.checkOutTime) || null;
  }
  return patch;
}

function corePatch(draft: Card1Draft): RestaurantUpdate {
  return {
    name: draft.name,
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    address: draft.address.trim() || null,
    city: draft.city.trim() || null,
    postcode: draft.postcode.trim() || null,
    country: draft.country.trim() || null,
    logo_url: draft.logoUrl.trim() || null,
    timezone: draft.timezone,
    currency_code: draft.currencyCode.toUpperCase(),
  };
}

export const getPmsPropertySetupCard1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const set2 = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const lastSuccessfulNightAudit = await loadLastNightAudit(supabaseAdmin, data.restaurantId);
    const snapshot = await withBrandPreviews(
      snapshotFromRow(
        loaded.row,
        loaded.card1ColumnsAvailable,
        loaded.fidelityColumnsAvailable,
        loaded.foundationColumnsAvailable,
        set2,
        lastSuccessfulNightAudit,
      ),
    );
    if (canEditSet1(me.role) && loaded.card1ColumnsAvailable) {
      await persistCard2RoomTypesReadiness(supabaseAdmin, data.restaurantId);
      const { data: refreshed } = await supabaseAdmin
        .from("restaurants")
        .select("pms_property_setup_status")
        .eq("id", data.restaurantId)
        .maybeSingle();
      snapshot.status = parsePropertySetupStatus(refreshed?.pms_property_setup_status);
    }
    return {
      snapshot,
      set2,
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const savePmsPropertySetupCard1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const assignedCode = await assignPropertyCode(supabaseAdmin, loaded.row?.property_code ? String(loaded.row.property_code) : "");
    const draft = draftFromSave(data.draft, assignedCode);
    if (data.mode !== "draft" && vatCertificateRequired(draft.vatRegistered) && !hasVatCertificate(draft.taxUploadRefs)) {
      throw new Error("VAT certificate is required while VAT Registered is On.");
    }

    const set2Before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const lastSuccessfulNightAudit = await loadLastNightAudit(supabaseAdmin, data.restaurantId);
    const before = snapshotFromRow(
      loaded.row,
      loaded.card1ColumnsAvailable,
      loaded.fidelityColumnsAvailable,
      loaded.foundationColumnsAvailable,
      set2Before,
      lastSuccessfulNightAudit,
    );

    if (data.mode !== "draft" && !card1StepComplete(data.step, draft, set2Before)) {
      if (data.step === "identity" && !draft.openingDate.trim()) {
        throw new Error("Opening Date is required to complete Property Identity.");
      }
      if (data.step === "contacts" && (!draft.emergency.name.trim() || !draft.emergency.phone.trim())) {
        throw new Error("Emergency contact name and phone are required to complete Contacts.");
      }
      throw new Error("Complete the required fields on this step before continuing.");
    }

    let status = before.status;
    if (data.mode === "finish") {
      status = markStepComplete(status, data.step, draft, set2Before);
      const complete = CARD1_STEPS.every((row) => card1StepComplete(row.id, draft, set2Before));
      status = complete ? markCard1Complete(status) : { ...status, cards: { ...status.cards, "property-business": "in_progress" } };
    } else if (data.mode === "continue") {
      status = markStepComplete(status, data.step, draft, set2Before);
    } else {
      status = markStepInProgress(status, data.step);
    }

    const patch = loaded.card1ColumnsAvailable
      ? card1Patch(draft, status, loaded.foundationColumnsAvailable, loaded.fidelityColumnsAvailable)
      : corePatch(draft);
    if ("pms_set1_live" in patch) delete patch.pms_set1_live;
    if ("business_date" in patch) delete patch.business_date;

    const { error } = await supabaseAdmin.from("restaurants").update(patch).eq("id", data.restaurantId);
    if (error) {
      if (isMissingColumnError(error)) {
        const retry = await supabaseAdmin.from("restaurants").update(corePatch(draft)).eq("id", data.restaurantId);
        if (retry.error) throw new Error(retry.error.message);
        if (data.mode !== "draft") throw new Error(CARD1_COLUMNS_UNAVAILABLE);
      } else {
        throw new Error(error.message);
      }
    }

    const afterLoad = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const set2 = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const after = await withBrandPreviews(
      snapshotFromRow(
        afterLoad.row,
        afterLoad.card1ColumnsAvailable,
        afterLoad.fidelityColumnsAvailable,
        afterLoad.foundationColumnsAvailable,
        set2,
        lastSuccessfulNightAudit,
      ),
    );
    const action = data.mode === "finish" ? CARD1_AUDIT_COMPLETED : data.mode === "continue" ? CARD1_AUDIT_STEP : CARD1_AUDIT_DRAFT;
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action,
      section: data.step,
      before,
      after,
    });
    return { ok: true as const, snapshot: after, set2, auditWritten, activated: false as const };
  });

export const createPropertyBrandImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        kind: z.enum(["logo", "cover"]),
        contentType: z.enum(CARD1_BRAND_IMAGE_TYPES),
        size: z.number().int().positive().max(CARD1_BRAND_IMAGE_MAX_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const ext = IMAGE_EXT_BY_TYPE[data.contentType];
    if (!ext) return { ok: false as const, message: "Only PNG, JPG, JPEG and WEBP images are allowed." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.restaurantId}/branding/${data.kind}-${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, message: "Image upload failed. Please try again." };
    return { ok: true as const, path, token: signed.token };
  });

export type { Card1Snapshot };
