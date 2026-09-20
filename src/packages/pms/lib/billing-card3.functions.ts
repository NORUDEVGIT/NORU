import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  BILLING_PAYER_KIND_LABELS,
  BILLING_PAYER_KINDS,
  CARD3_BILLING_AUDIT_SECTION,
  CARD3_BILLING_UNAVAILABLE,
  INVOICE_FORMAT_LABELS,
  INVOICE_FORMATS,
  INVOICE_TAX_DISPLAY_LABELS,
  INVOICE_TAX_DISPLAYS,
  evaluateBillingCard3Readiness,
  type BillingCard3Inherited,
  type BillingCard3Snapshot,
  type BillingPayerKind,
  type BillingRuleCard3Row,
  type InvoiceFormat,
  type InvoiceSettingsCard3,
  type InvoiceTaxDisplay,
} from "./billing-card3.server";

// 0074 is intentionally not represented in generated types.ts until its approved apply.
// Keep the untyped database boundary isolated to this functions module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,20}$/.test(value), "Use 1–20 letters, numbers, or underscores.");
const descriptionSchema = z.string().trim().max(500).optional();

const invoiceSettingsSchema = z.object({
  restaurantId: idSchema,
  prefix: z
    .string()
    .trim()
    .refine((value) => /^[A-Za-z0-9_-]{1,12}$/.test(value), "Use 1–12 letters, numbers, - or _."),
  startingNumber: z.number().int().min(1).max(1_000_000_000),
  numberPadding: z.number().int().min(1).max(12),
  taxDisplay: z.enum(INVOICE_TAX_DISPLAYS),
  invoiceFormat: z.enum(INVOICE_FORMATS),
});

const billingRuleSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    description: descriptionSchema,
    payerKind: z.enum(BILLING_PAYER_KINDS),
    splitGuestPercent: z.number().min(0).max(100).nullable().optional(),
    paymentTerms: z.string().trim().max(80).optional(),
    isDefault: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.payerKind === "split") {
      if (data.splitGuestPercent == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Split billing needs a guest percent.",
          path: ["splitGuestPercent"],
        });
      }
    } else if (data.splitGuestPercent != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Guest percent is only used for split billing.",
        path: ["splitGuestPercent"],
      });
    }
  });

function unavailable(error: { code?: string; message?: string } | null): never {
  if (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204"
  ) {
    throw new Error(CARD3_BILLING_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_BILLING_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asTaxDisplay(value: unknown): InvoiceTaxDisplay {
  return (INVOICE_TAX_DISPLAYS as readonly string[]).includes(String(value))
    ? (value as InvoiceTaxDisplay)
    : "exclusive";
}

function asInvoiceFormat(value: unknown): InvoiceFormat {
  return (INVOICE_FORMATS as readonly string[]).includes(String(value))
    ? (value as InvoiceFormat)
    : "standard";
}

function asPayerKind(value: unknown): BillingPayerKind {
  return (BILLING_PAYER_KINDS as readonly string[]).includes(String(value))
    ? (value as BillingPayerKind)
    : "guest";
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: CARD3_BILLING_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-billing] audit", result.error.message);
}

function mapInherited(row: any): BillingCard3Inherited {
  return {
    currencyCode: String(row?.currency_code ?? ""),
    legalEntityName: String(row?.legal_entity_name ?? ""),
    legalName: String(row?.legal_name ?? ""),
    brandName: String(row?.brand_name ?? ""),
    tradingName: String(row?.trading_name ?? ""),
    vatNumber: String(row?.vat_number ?? ""),
    vatRegistered: row?.vat_registered === true,
  };
}

function mapInvoiceSettings(row: any): InvoiceSettingsCard3 {
  const taxDisplay = asTaxDisplay(row.tax_display);
  const invoiceFormat = asInvoiceFormat(row.invoice_format);
  return {
    prefix: String(row.prefix ?? ""),
    startingNumber: Number(row.starting_number ?? 1),
    numberPadding: Number(row.number_padding ?? 6),
    taxDisplay,
    taxDisplayLabel: INVOICE_TAX_DISPLAY_LABELS[taxDisplay],
    invoiceFormat,
    invoiceFormatLabel: INVOICE_FORMAT_LABELS[invoiceFormat],
  };
}

function mapBillingRule(row: any): BillingRuleCard3Row {
  const payerKind = asPayerKind(row.payer_kind);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    payerKind,
    payerKindLabel: BILLING_PAYER_KIND_LABELS[payerKind],
    splitGuestPercent: row.split_guest_percent == null ? null : Number(row.split_guest_percent),
    paymentTerms: String(row.payment_terms ?? ""),
    isDefault: row.is_default === true,
    active: row.active !== false,
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<BillingCard3Snapshot> {
  const [restaurant, settings, rules] = await Promise.all([
    db
      .from("restaurants")
      .select(
        "currency_code, legal_entity_name, legal_name, brand_name, trading_name, vat_number, vat_registered",
      )
      .eq("id", restaurantId)
      .maybeSingle(),
    db.from("pms_invoice_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    db
      .from("pms_billing_rules")
      .select(
        "id, code, name, description, payer_kind, split_guest_percent, payment_terms, is_default, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
  ]);
  for (const result of [restaurant, settings, rules]) {
    if (result.error) unavailable(result.error);
  }

  return {
    inherited: mapInherited(restaurant.data),
    invoiceSettings: settings.data ? mapInvoiceSettings(settings.data) : null,
    billingRules: (rules.data ?? []).map(mapBillingRule),
  };
}

export { loadSnapshot as loadBillingCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_BILLING_AUDIT_SECTION })
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) return [];
  return (result.data ?? []).map((row: any) => ({
    id: row.id,
    action: String(row.action ?? ""),
    createdAt: String(row.created_at ?? ""),
    detail: typeof row.metadata?.detail === "string" ? row.metadata.detail : null,
  }));
}

async function requireOwnedRecord(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  message: string,
) {
  const result = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error(message);
}

export const getBillingCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateBillingCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveInvoiceSettingsCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => invoiceSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const result = await db.from("pms_invoice_settings").upsert(
      {
        restaurant_id: data.restaurantId,
        prefix: data.prefix,
        starting_number: data.startingNumber,
        number_padding: data.numberPadding,
        tax_display: data.taxDisplay,
        invoice_format: data.invoiceFormat,
      },
      { onConflict: "restaurant_id" },
    );
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card3_invoice_settings_saved", {
      detail: `${data.prefix} ${data.startingNumber}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateBillingCard3Readiness(snapshot) };
  });

export const saveBillingRuleCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => billingRuleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_billing_rules",
        data.restaurantId,
        data.id,
        "That billing rule doesn't belong to this property.",
      );
    }
    if (data.isDefault) {
      let clear = db
        .from("pms_billing_rules")
        .update({ is_default: false })
        .eq("restaurant_id", data.restaurantId)
        .eq("is_default", true);
      if (data.id) clear = clear.neq("id", data.id);
      const cleared = await clear;
      if (cleared.error) unavailable(cleared.error);
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      payer_kind: data.payerKind,
      split_guest_percent: data.payerKind === "split" ? (data.splitGuestPercent ?? null) : null,
      payment_terms: data.paymentTerms?.trim() ? data.paymentTerms.trim() : null,
      is_default: data.isDefault,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_billing_rules")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_billing_rules").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That billing-rule code is already used.");
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_billing_rule_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateBillingCard3Readiness(snapshot) };
  });
