/**
 * PMS-SET1 — load / save Foundation Settings.
 *
 * Identity reuses restaurants contact columns. 0042 fees keep saveFoFeeDefaults.
 * 0047 columns are optional at runtime: missing columns never crash the hub.
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
  FO_FEE_DEFAULTS_AUDIT_ACTION,
  normalizeFoFeeDefaults,
  validateFoFeeDefaults,
  type FoFeeDefaults,
} from "./fo-fee-defaults";
import {
  SET1_ACTIVATE_DENIED,
  SET1_AUDIT_ACTION,
  SET1_DENIED,
  canActivateSet1,
  canEditSet1,
  emptyIdentity,
  emptyOps,
  emptyPolicies,
  emptyTaxes,
  evaluateSet1Checklist,
  isMissingColumnError,
  normalizeClock,
  optionalInt,
  optionalNumber,
  parseDepositType,
  parseFeeBasis,
  parsePropertyType,
  parseTaxIdentities,
  type Set1Foundation,
  type Set1IdentityDraft,
  type Set1OpsDraft,
  type Set1PoliciesDraft,
  type Set1SectionId,
  type Set1TaxesDraft,
  type TaxIdentity,
} from "./pms-set1-foundation";
import { SET2_AUDIT_AMENITY, SET2_AUDIT_OUTLET, SET2_AUDIT_STRUCTURE, activateInputFromSnapshot } from "./pms-set2-structure";
import { loadSet2Snapshot } from "./pms-set2-structure.functions";
import { SET3_AUDIT_ACTIONS, activateInputFromSet3Snapshot } from "./pms-set3-rates-guest";
import { loadSet3Snapshot } from "./pms-set3-rates-guest.functions";

const idSchema = z.string().uuid();

const CORE_COLUMNS =
  "id, name, logo_url, phone, email, address, city, postcode, country, timezone, currency_code, business_date, tax_inclusive, tax_rate, service_enabled, service_rate, fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default";

const FOUNDATION_COLUMNS =
  `${CORE_COLUMNS}, property_code, legal_name, property_type, tax_identities, check_in_time, check_out_time, hotel_day_open, tax_name, cancel_window_hours, cancel_fee_basis, noshow_fee_basis, deposit_required, deposit_type, deposit_value, early_checkin_allowed, early_checkin_fee, early_checkin_needs_approval, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval, pms_set1_live`;

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];

function feesFromRow(row: RestaurantRow | null): FoFeeDefaults {
  return normalizeFoFeeDefaults({
    cancelFeeRequired: row?.fo_cancel_fee_required ?? true,
    cancelFeeDefault: Number(row?.fo_cancel_fee_default ?? 0) || 0,
    noshowFeeRequired: row?.fo_noshow_fee_required ?? true,
    noshowFeeDefault: Number(row?.fo_noshow_fee_default ?? 0) || 0,
  });
}

function snapshotFromRow(row: RestaurantRow | null, foundationColumnsAvailable: boolean): Set1Foundation {
  const identity = emptyIdentity({
    name: String(row?.name ?? ""),
    logoUrl: String(row?.logo_url ?? ""),
    phone: String(row?.phone ?? ""),
    email: String(row?.email ?? ""),
    address: String(row?.address ?? ""),
    city: String(row?.city ?? ""),
    postcode: String(row?.postcode ?? ""),
    country: String(row?.country ?? ""),
    timezone: String(row?.timezone ?? DEFAULT_TIMEZONE),
    currencyCode: String(row?.currency_code ?? DEFAULT_CURRENCY),
    propertyCode: foundationColumnsAvailable ? String(row?.property_code ?? "") : "",
    legalName: foundationColumnsAvailable ? String(row?.legal_name ?? "") : "",
    propertyType: foundationColumnsAvailable ? parsePropertyType(row?.property_type) : "",
    taxIdentities: foundationColumnsAvailable ? parseTaxIdentities(row?.tax_identities) : [],
  });
  const ops = emptyOps({
    checkInTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_in_time ?? "")) : "",
    checkOutTime: foundationColumnsAvailable ? normalizeClock(String(row?.check_out_time ?? "")) : "",
    hotelDayOpen: foundationColumnsAvailable ? row?.hotel_day_open !== false : true,
  });
  const taxes = emptyTaxes({
    taxInclusive: row?.tax_inclusive === true,
    taxName: foundationColumnsAvailable ? String(row?.tax_name ?? "") : "",
    taxRate: Number(row?.tax_rate ?? 0) || 0,
    serviceEnabled: row?.service_enabled === true,
    serviceRate: Number(row?.service_rate ?? 0) || 0,
  });
  const policies = emptyPolicies({
    cancelWindowHours: foundationColumnsAvailable && row?.cancel_window_hours != null ? String(row.cancel_window_hours) : "",
    cancelFeeBasis: foundationColumnsAvailable ? parseFeeBasis(row?.cancel_fee_basis) : "",
    noshowFeeBasis: foundationColumnsAvailable ? parseFeeBasis(row?.noshow_fee_basis) : "",
    depositRequired: foundationColumnsAvailable ? row?.deposit_required === true : false,
    depositType: foundationColumnsAvailable ? parseDepositType(row?.deposit_type) : "",
    depositValue: foundationColumnsAvailable && row?.deposit_value != null ? String(row.deposit_value) : "",
    earlyCheckinAllowed: foundationColumnsAvailable ? row?.early_checkin_allowed === true : false,
    earlyCheckinFee: foundationColumnsAvailable && row?.early_checkin_fee != null ? String(row.early_checkin_fee) : "",
    earlyCheckinNeedsApproval: foundationColumnsAvailable ? row?.early_checkin_needs_approval === true : false,
    lateCheckoutAllowed: foundationColumnsAvailable ? row?.late_checkout_allowed === true : false,
    lateCheckoutFee: foundationColumnsAvailable && row?.late_checkout_fee != null ? String(row.late_checkout_fee) : "",
    lateCheckoutNeedsApproval: foundationColumnsAvailable ? row?.late_checkout_needs_approval === true : false,
    fees: feesFromRow(row),
  });
  return {
    identity,
    ops,
    taxes,
    policies,
    businessDate: row?.business_date ?? null,
    timezone: identity.timezone,
    pmsSet1Live: foundationColumnsAvailable ? row?.pms_set1_live === true : false,
    foundationColumnsAvailable,
  };
}

async function loadRestaurantRow(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<{ row: RestaurantRow | null; foundationColumnsAvailable: boolean }> {
  const full = await supabaseAdmin.from("restaurants").select(FOUNDATION_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (!full.error) return { row: (full.data as RestaurantRow | null) ?? null, foundationColumnsAvailable: true };
  if (!isMissingColumnError(full.error)) throw new Error(full.error.message);
  const core = await supabaseAdmin.from("restaurants").select(CORE_COLUMNS).eq("id", restaurantId).maybeSingle();
  if (core.error) throw new Error(core.error.message);
  return { row: (core.data as RestaurantRow | null) ?? null, foundationColumnsAvailable: false };
}

async function writeAudit(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
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
    console.error("[pms-set1] audit", error.message);
    return false;
  }
  return true;
}

export const getPmsSet1Foundation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row, foundationColumnsAvailable } = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const snapshot = snapshotFromRow(row, foundationColumnsAvailable);
    const [set2, set3] = await Promise.all([
      loadSet2Snapshot(supabaseAdmin, data.restaurantId),
      loadSet3Snapshot(supabaseAdmin, data.restaurantId),
    ]);
    const checklist = evaluateSet1Checklist({
      identity: snapshot.identity,
      ops: snapshot.ops,
      taxes: snapshot.taxes,
      policies: snapshot.policies,
      foundationColumnsAvailable,
      pmsSet1Live: snapshot.pmsSet1Live,
      role: me.role,
      set2: activateInputFromSnapshot(set2),
      set3: activateInputFromSet3Snapshot(set3),
    });
    return {
      snapshot,
      set2,
      set3,
      checklist,
      role: me.role,
      canEdit: canEditSet1(me.role),
      canActivate: canActivateSet1(me.role),
    };
  });

const identitySchema = z.object({
  restaurantId: idSchema,
  section: z.literal("identity"),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postcode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64),
  currencyCode: z.string().trim().length(3),
  propertyCode: z.string().trim().max(40).optional().nullable(),
  legalName: z.string().trim().max(160).optional().nullable(),
  propertyType: z.enum(["hotel", "guesthouse", "apartment_hotel", "other"]).optional().nullable().or(z.literal("")),
  taxIdentities: z.array(z.object({ label: z.string().trim().max(80), value: z.string().trim().max(80) })).max(12),
});

const opsSchema = z.object({
  restaurantId: idSchema,
  section: z.literal("ops"),
  checkInTime: z.string().trim().max(8),
  checkOutTime: z.string().trim().max(8),
  hotelDayOpen: z.boolean(),
});

const taxesSchema = z.object({
  restaurantId: idSchema,
  section: z.literal("taxes"),
  taxInclusive: z.boolean(),
  taxName: z.string().trim().max(80).optional().nullable(),
  taxRate: z.number().min(0).max(100),
  serviceEnabled: z.boolean(),
  serviceRate: z.number().min(0).max(100),
});

const policiesSchema = z.object({
  restaurantId: idSchema,
  section: z.literal("policies"),
  cancelWindowHours: z.string().optional().nullable(),
  cancelFeeBasis: z.enum(["percent_stay", "fixed", "first_night"]).optional().nullable().or(z.literal("")),
  noshowFeeBasis: z.enum(["percent_stay", "fixed", "first_night"]).optional().nullable().or(z.literal("")),
  depositRequired: z.boolean(),
  depositType: z.enum(["none", "percent", "fixed", "first_night"]).optional().nullable().or(z.literal("")),
  depositValue: z.string().optional().nullable(),
  earlyCheckinAllowed: z.boolean(),
  earlyCheckinFee: z.string().optional().nullable(),
  earlyCheckinNeedsApproval: z.boolean(),
  lateCheckoutAllowed: z.boolean(),
  lateCheckoutFee: z.string().optional().nullable(),
  lateCheckoutNeedsApproval: z.boolean(),
  cancelFeeRequired: z.boolean(),
  cancelFeeDefault: z.number().min(0),
  noshowFeeRequired: z.boolean(),
  noshowFeeDefault: z.number().min(0),
});

const saveSchema = z.discriminatedUnion("section", [identitySchema, opsSchema, taxesSchema, policiesSchema]);

function identityPatch(data: z.infer<typeof identitySchema>, foundationColumnsAvailable: boolean): RestaurantUpdate {
  const patch: RestaurantUpdate = {
    name: data.name,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    address: data.address?.trim() || null,
    city: data.city?.trim() || null,
    postcode: data.postcode?.trim() || null,
    country: data.country?.trim() || null,
    logo_url: data.logoUrl?.trim() || null,
    timezone: data.timezone,
    currency_code: data.currencyCode.toUpperCase(),
  };
  if (foundationColumnsAvailable) {
    patch.property_code = data.propertyCode?.trim() || null;
    patch.legal_name = data.legalName?.trim() || null;
    patch.property_type = data.propertyType || null;
    patch.tax_identities = data.taxIdentities.filter((row) => row.label || row.value);
  }
  return patch;
}

function opsPatch(data: z.infer<typeof opsSchema>): RestaurantUpdate {
  return {
    check_in_time: normalizeClock(data.checkInTime) || null,
    check_out_time: normalizeClock(data.checkOutTime) || null,
    hotel_day_open: data.hotelDayOpen,
  };
}

function taxesPatch(data: z.infer<typeof taxesSchema>, foundationColumnsAvailable: boolean): RestaurantUpdate {
  const patch: RestaurantUpdate = {
    tax_inclusive: data.taxInclusive,
    tax_rate: data.taxRate,
    service_enabled: data.serviceEnabled,
    service_rate: data.serviceEnabled ? data.serviceRate : data.serviceRate,
  };
  if (foundationColumnsAvailable) patch.tax_name = data.taxName?.trim() || null;
  return patch;
}

function policiesPatch(data: z.infer<typeof policiesSchema>): RestaurantUpdate {
  return {
    cancel_window_hours: optionalInt(data.cancelWindowHours ?? ""),
    cancel_fee_basis: data.cancelFeeBasis || null,
    noshow_fee_basis: data.noshowFeeBasis || null,
    deposit_required: data.depositRequired,
    deposit_type: data.depositType || null,
    deposit_value: optionalNumber(data.depositValue ?? ""),
    early_checkin_allowed: data.earlyCheckinAllowed,
    early_checkin_fee: optionalNumber(data.earlyCheckinFee ?? ""),
    early_checkin_needs_approval: data.earlyCheckinNeedsApproval,
    late_checkout_allowed: data.lateCheckoutAllowed,
    late_checkout_fee: optionalNumber(data.lateCheckoutFee ?? ""),
    late_checkout_needs_approval: data.lateCheckoutNeedsApproval,
  };
}

function feesFromSave(data: z.infer<typeof policiesSchema>): FoFeeDefaults {
  return normalizeFoFeeDefaults({
    cancelFeeRequired: data.cancelFeeRequired,
    cancelFeeDefault: data.cancelFeeDefault,
    noshowFeeRequired: data.noshowFeeRequired,
    noshowFeeDefault: data.noshowFeeDefault,
  });
}

export const savePmsSet1Foundation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const before = snapshotFromRow(loaded.row, loaded.foundationColumnsAvailable);

    let patch: RestaurantUpdate = {};
    let feeAfter: FoFeeDefaults | null = null;
    if (data.section === "identity") {
      patch = identityPatch(data, loaded.foundationColumnsAvailable);
    } else if (data.section === "ops") {
      if (!loaded.foundationColumnsAvailable) {
        throw new Error("Check-in times are unavailable until foundation columns are applied.");
      }
      if (!normalizeClock(data.checkInTime) || !normalizeClock(data.checkOutTime)) {
        throw new Error("Check-in and check-out times are required.");
      }
      patch = opsPatch(data);
    } else if (data.section === "taxes") {
      patch = taxesPatch(data, loaded.foundationColumnsAvailable);
    } else {
      feeAfter = feesFromSave(data);
      const invalid = validateFoFeeDefaults(feeAfter);
      if (invalid) throw new Error(invalid);
      patch = {
        fo_cancel_fee_required: feeAfter.cancelFeeRequired,
        fo_cancel_fee_default: feeAfter.cancelFeeDefault,
        fo_noshow_fee_required: feeAfter.noshowFeeRequired,
        fo_noshow_fee_default: feeAfter.noshowFeeDefault,
      };
      if (loaded.foundationColumnsAvailable) Object.assign(patch, policiesPatch(data));
    }

    const { error } = await supabaseAdmin.from("restaurants").update(patch).eq("id", data.restaurantId);
    if (error) {
      if (isMissingColumnError(error) && data.section !== "identity" && data.section !== "taxes") {
        throw new Error("Those foundation fields are unavailable until migration 0047 is applied.");
      }
      if (isMissingColumnError(error) && data.section === "identity") {
        const coreOnly = identityPatch(data, false);
        const retry = await supabaseAdmin.from("restaurants").update(coreOnly).eq("id", data.restaurantId);
        if (retry.error) throw new Error(retry.error.message);
      } else if (isMissingColumnError(error) && data.section === "taxes") {
        const coreOnly = taxesPatch(data, false);
        const retry = await supabaseAdmin.from("restaurants").update(coreOnly).eq("id", data.restaurantId);
        if (retry.error) throw new Error(retry.error.message);
      } else {
        throw new Error(error.message);
      }
    }

    const afterLoad = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const after = snapshotFromRow(afterLoad.row, afterLoad.foundationColumnsAvailable);

    let auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET1_AUDIT_ACTION,
      section: data.section,
      before,
      after,
    });
    if (data.section === "policies" && feeAfter) {
      const feeAudit = await writeAudit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: context.userId,
        action: FO_FEE_DEFAULTS_AUDIT_ACTION,
        section: "policies",
        before: before.policies.fees,
        after: feeAfter,
      });
      auditWritten = auditWritten && feeAudit;
    }

    const [set2, set3] = await Promise.all([
      loadSet2Snapshot(supabaseAdmin, data.restaurantId),
      loadSet3Snapshot(supabaseAdmin, data.restaurantId),
    ]);
    const checklist = evaluateSet1Checklist({
      identity: after.identity,
      ops: after.ops,
      taxes: after.taxes,
      policies: after.policies,
      foundationColumnsAvailable: after.foundationColumnsAvailable,
      pmsSet1Live: after.pmsSet1Live,
      role: me.role,
      set2: activateInputFromSnapshot(set2),
      set3: activateInputFromSet3Snapshot(set3),
    });
    return { ok: true as const, snapshot: after, set2, set3, checklist, auditWritten };
  });

export const activatePmsSet1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canActivateSet1(me.role)) throw new Error(SET1_ACTIVATE_DENIED);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    if (!loaded.foundationColumnsAvailable) {
      throw new Error("Activate is unavailable until foundation columns are applied.");
    }
    const before = snapshotFromRow(loaded.row, true);
    const [set2Before, set3Before] = await Promise.all([
      loadSet2Snapshot(supabaseAdmin, data.restaurantId),
      loadSet3Snapshot(supabaseAdmin, data.restaurantId),
    ]);
    const checklist = evaluateSet1Checklist({
      identity: before.identity,
      ops: before.ops,
      taxes: before.taxes,
      policies: before.policies,
      foundationColumnsAvailable: true,
      pmsSet1Live: before.pmsSet1Live,
      role: me.role,
      set2: activateInputFromSnapshot(set2Before),
      set3: activateInputFromSet3Snapshot(set3Before),
    });
    if (!checklist.canActivate) {
      throw new Error(
        checklist.mandatoryMissing.length
          ? `Cannot activate yet. Missing: ${checklist.mandatoryMissing.join(", ")}.`
          : "Cannot activate until every mandatory Foundation, structure, rooms, outlets, rates and guest-rules item is complete.",
      );
    }

    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_set1_live: true })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingColumnError(error)) throw new Error("Activate is unavailable until foundation columns are applied.");
      throw new Error(error.message);
    }

    const afterLoad = await loadRestaurantRow(supabaseAdmin, data.restaurantId);
    const after = snapshotFromRow(afterLoad.row, afterLoad.foundationColumnsAvailable);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET1_AUDIT_ACTION,
      section: "golive",
      before: { pmsSet1Live: before.pmsSet1Live },
      after: { pmsSet1Live: after.pmsSet1Live },
    });
    const [set2After, set3After] = await Promise.all([
      loadSet2Snapshot(supabaseAdmin, data.restaurantId),
      loadSet3Snapshot(supabaseAdmin, data.restaurantId),
    ]);
    return {
      ok: true as const,
      snapshot: after,
      set2: set2After,
      set3: set3After,
      checklist: evaluateSet1Checklist({
        identity: after.identity,
        ops: after.ops,
        taxes: after.taxes,
        policies: after.policies,
        foundationColumnsAvailable: after.foundationColumnsAvailable,
        pmsSet1Live: after.pmsSet1Live,
        role: me.role,
        set2: activateInputFromSnapshot(set2After),
        set3: activateInputFromSet3Snapshot(set3After),
      }),
      auditWritten,
    };
  });

export type Set1AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  section: string | null;
};

export const listPmsSet1Audit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<Set1AuditRow[]> => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("restaurant_staff_audit_log")
      .select("id, action, created_at, metadata")
      .eq("restaurant_id", data.restaurantId)
      .in("action", [
        SET1_AUDIT_ACTION,
        FO_FEE_DEFAULTS_AUDIT_ACTION,
        SET2_AUDIT_STRUCTURE,
        SET2_AUDIT_OUTLET,
        SET2_AUDIT_AMENITY,
        ...SET3_AUDIT_ACTIONS,
      ])
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return [];
    return ((rows ?? []) as Array<{ id: string; action: string; created_at: string; metadata: { section?: string } | null }>).map(
      (row) => ({
        id: row.id,
        action: row.action,
        createdAt: row.created_at,
        section: row.metadata?.section ?? null,
      }),
    );
  });

export type { Set1Foundation, Set1IdentityDraft, Set1OpsDraft, Set1TaxesDraft, Set1PoliciesDraft, Set1SectionId, TaxIdentity };
