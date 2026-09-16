/**
 * PMS Property Setup Card 1 — load / save Property & Business.
 *
 * Reuses Live SET1 identity / CI-CO / legal_name / business_date and Live SET2
 * structure masters. 0062 columns are optional at runtime: missing columns
 * never crash the hub. Completing Card 1 never flips pms_set1_live.
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
import { loadSet2Snapshot } from "./pms-set2-structure.functions";
import type { Set2Snapshot } from "./pms-set2-structure";
import {
  CARD1_AUDIT_COMPLETED,
  CARD1_AUDIT_DRAFT,
  CARD1_AUDIT_STEP,
  CARD1_COLUMNS_UNAVAILABLE,
  CARD1_STEPS,
  card1StepComplete,
  composeFullAddress,
  derivedCapacityFromSet2,
  emptyCard1Draft,
  emptyCard1Snapshot,
  markCard1Complete,
  markStepComplete,
  markStepInProgress,
  parseBusinessDateBlockers,
  parseBusinessDateConfig,
  parseDepartmentContacts,
  parseIdentityToggles,
  parseLegalEntityType,
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

const idSchema = z.string().uuid();

const SET1_COLUMNS =
  "id, name, logo_url, phone, email, address, city, postcode, country, timezone, currency_code, business_date, property_code, legal_name, property_type, check_in_time, check_out_time, pms_set1_live";

const CARD1_COLUMNS =
  `${SET1_COLUMNS}, trading_name, star_rating, default_language, short_description, identity_toggles, brand_name, brand_code, chain_name, address_region, address_zone, address_woreda, address_kebele, address_subcity, address_house_no, latitude, longitude, full_address, whatsapp, social_contacts, department_contacts, checkin_policy_text, checkout_policy_text, early_checkin_policy_text, late_checkout_policy_text, business_date_config, business_date_blockers, legal_entity_name, legal_entity_type, registration_number, legal_upload_refs, vat_registered, vat_number, tin_number, licence_number, tax_upload_refs, structure_rules_posture, pms_property_setup_status`;

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

const draftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tradingName: z.string().trim().max(160).optional().nullable(),
  propertyCode: z.string().trim().max(40).optional().nullable(),
  propertyType: z.string().trim().max(40).optional().nullable(),
  starRating: z.union([z.literal(""), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  defaultLanguage: z.string().trim().max(16).optional().nullable(),
  shortDescription: z.string().trim().max(500).optional().nullable(),
  timezone: z.string().trim().min(1).max(64),
  currencyCode: z.string().trim().length(3),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  identityToggles: z.object({
    showTradingNameOnDocuments: z.boolean(),
    chainProperty: z.boolean(),
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
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  social: z.object({
    website: z.string().trim().max(200),
    facebook: z.string().trim().max(200),
    instagram: z.string().trim().max(200),
    tripadvisor: z.string().trim().max(200),
  }),
  departmentContacts: z.array(departmentSchema).max(20),
  checkInTime: z.string().trim().max(8).optional().nullable(),
  checkOutTime: z.string().trim().max(8).optional().nullable(),
  checkinPolicyText: z.string().trim().max(2000).optional().nullable(),
  checkoutPolicyText: z.string().trim().max(2000).optional().nullable(),
  earlyCheckinPolicyText: z.string().trim().max(2000).optional().nullable(),
  lateCheckoutPolicyText: z.string().trim().max(2000).optional().nullable(),
  businessDateConfig: z.object({
    notes: z.string().trim().max(500),
    closeBlockersEnabled: z.boolean(),
  }),
  businessDateBlockers: z.array(z.string().trim().max(120)).max(20),
  legalName: z.string().trim().max(160).optional().nullable(),
  legalEntityName: z.string().trim().max(160).optional().nullable(),
  legalEntityType: z.enum(["", "plc", "private_limited", "sole_proprietor", "partnership", "other"]),
  registrationNumber: z.string().trim().max(80).optional().nullable(),
  legalUploadRefs: z.array(uploadRefSchema).max(12),
  vatRegistered: z.boolean(),
  vatNumber: z.string().trim().max(80).optional().nullable(),
  tinNumber: z.string().trim().max(80).optional().nullable(),
  licenceNumber: z.string().trim().max(80).optional().nullable(),
  taxUploadRefs: z.array(uploadRefSchema).max(12),
  structureRules: z.object({
    buildingRequired: z.boolean(),
    wingOptional: z.boolean(),
    floorRequired: z.boolean(),
  }),
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

function snapshotFromRow(
  row: RestaurantRow | null,
  card1ColumnsAvailable: boolean,
  foundationColumnsAvailable: boolean,
  set2: Set2Snapshot,
): Card1Snapshot {
  const draft = emptyCard1Draft({
    name: String(row?.name ?? ""),
    tradingName: card1ColumnsAvailable ? text(row, "trading_name") : "",
    propertyCode: foundationColumnsAvailable ? text(row, "property_code") : "",
    propertyType: foundationColumnsAvailable ? text(row, "property_type") : "",
    starRating: card1ColumnsAvailable ? parseStarRating(row?.star_rating) : "",
    defaultLanguage: card1ColumnsAvailable ? text(row, "default_language") || "en" : "en",
    shortDescription: card1ColumnsAvailable ? text(row, "short_description") : "",
    timezone: String(row?.timezone ?? DEFAULT_TIMEZONE),
    currencyCode: String(row?.currency_code ?? DEFAULT_CURRENCY),
    logoUrl: String(row?.logo_url ?? ""),
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
    phone: String(row?.phone ?? ""),
    email: String(row?.email ?? ""),
    whatsapp: card1ColumnsAvailable ? text(row, "whatsapp") : "",
    social: parseSocialContacts(card1ColumnsAvailable ? row?.social_contacts : null),
    departmentContacts: card1ColumnsAvailable ? parseDepartmentContacts(row?.department_contacts) : [],
    checkInTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_in_time ?? "")) : "",
    checkOutTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_out_time ?? "")) : "",
    checkinPolicyText: card1ColumnsAvailable ? text(row, "checkin_policy_text") : "",
    checkoutPolicyText: card1ColumnsAvailable ? text(row, "checkout_policy_text") : "",
    earlyCheckinPolicyText: card1ColumnsAvailable ? text(row, "early_checkin_policy_text") : "",
    lateCheckoutPolicyText: card1ColumnsAvailable ? text(row, "late_checkout_policy_text") : "",
    businessDateConfig: parseBusinessDateConfig(card1ColumnsAvailable ? row?.business_date_config : null),
    businessDateBlockers: card1ColumnsAvailable ? parseBusinessDateBlockers(row?.business_date_blockers) : [],
    legalName: foundationColumnsAvailable ? text(row, "legal_name") : "",
    legalEntityName: card1ColumnsAvailable ? text(row, "legal_entity_name") : "",
    legalEntityType: card1ColumnsAvailable ? parseLegalEntityType(row?.legal_entity_type) : "",
    registrationNumber: card1ColumnsAvailable ? text(row, "registration_number") : "",
    legalUploadRefs: card1ColumnsAvailable ? parseUploadRefs(row?.legal_upload_refs) : [],
    vatRegistered: card1ColumnsAvailable ? row?.vat_registered === true : false,
    vatNumber: card1ColumnsAvailable ? text(row, "vat_number") : "",
    tinNumber: card1ColumnsAvailable ? text(row, "tin_number") : "",
    licenceNumber: card1ColumnsAvailable ? text(row, "licence_number") : "",
    taxUploadRefs: card1ColumnsAvailable ? parseUploadRefs(row?.tax_upload_refs) : [],
    structureRules: parseStructureRules(card1ColumnsAvailable ? row?.structure_rules_posture : null),
  });
  draft.fullAddress = card1ColumnsAvailable && text(row, "full_address") ? text(row, "full_address") : composeFullAddress(draft);
  const status = card1ColumnsAvailable
    ? parsePropertySetupStatus(row?.pms_property_setup_status)
    : emptyCard1Snapshot().status;
  return {
    draft,
    businessDate: row?.business_date ?? null,
    timezone: draft.timezone,
    pmsSet1Live: foundationColumnsAvailable ? row?.pms_set1_live === true : false,
    card1ColumnsAvailable,
    foundationColumnsAvailable,
    status,
    derivedCapacity: derivedCapacityFromSet2(set2),
  };
}

async function loadRestaurantRow(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<{ row: RestaurantRow | null; card1ColumnsAvailable: boolean; foundationColumnsAvailable: boolean }> {
  const full = await supabaseAdmin.from("restaurants").select(CARD1_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!full.error) {
    return { row: (full.data as RestaurantRow | null) ?? null, card1ColumnsAvailable: true, foundationColumnsAvailable: true };
  }
  if (!isMissingColumnError(full.error)) throw new Error(full.error.message);
  const foundation = await supabaseAdmin.from("restaurants").select(SET1_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!foundation.error) {
    return { row: (foundation.data as RestaurantRow | null) ?? null, card1ColumnsAvailable: false, foundationColumnsAvailable: true };
  }
  if (!isMissingColumnError(foundation.error)) throw new Error(foundation.error.message);
  const core = await supabaseAdmin
    .from("restaurants")
    .select("id, name, logo_url, phone, email, address, city, postcode, country, timezone, currency_code, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (core.error) throw new Error(core.error.message);
  return { row: (core.data as RestaurantRow | null) ?? null, card1ColumnsAvailable: false, foundationColumnsAvailable: false };
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

function draftFromSave(data: z.infer<typeof draftSchema>): Card1Draft {
  const draft = emptyCard1Draft({
    ...data,
    tradingName: data.tradingName ?? "",
    propertyCode: data.propertyCode ?? "",
    propertyType: data.propertyType ?? "",
    defaultLanguage: data.defaultLanguage || "en",
    shortDescription: data.shortDescription ?? "",
    logoUrl: data.logoUrl ?? "",
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

function card1Patch(draft: Card1Draft, status: PropertySetupStatus, foundationColumnsAvailable: boolean): RestaurantUpdate {
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
    social_contacts: draft.social as unknown as Json,
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
    const snapshot = snapshotFromRow(loaded.row, loaded.card1ColumnsAvailable, loaded.foundationColumnsAvailable, set2);
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

    const draft = draftFromSave(data.draft);
    if (data.mode !== "draft" && vatCertificateRequired(draft.vatRegistered) && !hasVatCertificate(draft.taxUploadRefs)) {
      throw new Error("VAT certificate is required while VAT Registered is On.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const set2Before = await loadSet2Snapshot(supabaseAdmin, data.restaurantId);
    const before = snapshotFromRow(loaded.row, loaded.card1ColumnsAvailable, loaded.foundationColumnsAvailable, set2Before);

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
      ? card1Patch(draft, status, loaded.foundationColumnsAvailable)
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
    const after = snapshotFromRow(afterLoad.row, afterLoad.card1ColumnsAvailable, afterLoad.foundationColumnsAvailable, set2);
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

export type { Card1Snapshot };
