import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_PAYMENTS_AUDIT_SECTION,
  CARD3_PAYMENTS_UNAVAILABLE,
  DEPOSIT_POLICY_TYPE_LABELS,
  DEPOSIT_POLICY_TYPES,
  PAYMENT_TYPE_CLASS_LABELS,
  PAYMENT_TYPE_CLASSES,
  evaluatePaymentsCard3Readiness,
  type DepositPolicyCard3Row,
  type DepositPolicyType,
  type PaymentMethodCard3Row,
  type PaymentTypeClass,
  type PaymentsCard3Snapshot,
} from "./payments-card3.server";

// 0073 is intentionally not represented in generated types.ts until its approved apply.
// Keep the untyped database boundary isolated to this functions module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,20}$/.test(value), "Use 1–20 letters, numbers, or underscores. Example: VAT_15.");
const descriptionSchema = z.string().trim().max(500).optional();

const paymentMethodSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  typeClass: z
    .union([z.enum(PAYMENT_TYPE_CLASSES), z.literal("")])
    .optional()
    .nullable(),
  notes: z.string().trim().max(240).optional(),
  active: z.boolean(),
});

const depositPolicySchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    description: descriptionSchema,
    required: z.boolean(),
    depositType: z.enum(DEPOSIT_POLICY_TYPES),
    depositValue: z.number().min(0, "Deposit value cannot be negative.").max(10_000_000),
    isDefault: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.depositType === "none" && data.depositValue !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A none deposit must have value 0.",
        path: ["depositValue"],
      });
    }
    if (data.depositType === "percent" && data.depositValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percent deposits cannot exceed 100.",
        path: ["depositValue"],
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
    throw new Error(CARD3_PAYMENTS_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_PAYMENTS_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asPaymentTypeClass(value: unknown): PaymentTypeClass | "" {
  return (PAYMENT_TYPE_CLASSES as readonly string[]).includes(String(value))
    ? (value as PaymentTypeClass)
    : "";
}

function asDepositType(value: unknown): DepositPolicyType {
  return (DEPOSIT_POLICY_TYPES as readonly string[]).includes(String(value))
    ? (value as DepositPolicyType)
    : "none";
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
    metadata: { section: CARD3_PAYMENTS_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-payments] audit", result.error.message);
}

function mapPaymentMethod(row: any): PaymentMethodCard3Row {
  const typeClass = asPaymentTypeClass(row.type_class);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    typeClass,
    typeClassLabel: typeClass ? PAYMENT_TYPE_CLASS_LABELS[typeClass] : "—",
    notes: String(row.notes ?? ""),
    active: row.active !== false,
  };
}

function mapDepositPolicy(row: any): DepositPolicyCard3Row {
  const depositType = asDepositType(row.deposit_type);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    required: row.required === true,
    depositType,
    depositTypeLabel: DEPOSIT_POLICY_TYPE_LABELS[depositType],
    depositValue: Number(row.deposit_value ?? 0),
    isDefault: row.is_default === true,
    active: row.active !== false,
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<PaymentsCard3Snapshot> {
  const [restaurant, methods, policies] = await Promise.all([
    db.from("restaurants").select("currency_code").eq("id", restaurantId).maybeSingle(),
    db
      .from("pms_payment_methods")
      .select("id, code, name, type_class, notes, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_deposit_policies")
      .select(
        "id, code, name, description, required, deposit_type, deposit_value, is_default, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
  ]);
  for (const result of [restaurant, methods, policies]) {
    if (result.error) unavailable(result.error);
  }

  return {
    currencyCode: String(restaurant.data?.currency_code ?? ""),
    paymentMethods: (methods.data ?? []).map(mapPaymentMethod),
    depositPolicies: (policies.data ?? []).map(mapDepositPolicy),
  };
}

export { loadSnapshot as loadPaymentsCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_PAYMENTS_AUDIT_SECTION })
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

export const getPaymentsCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluatePaymentsCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const savePaymentMethodCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentMethodSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_payment_methods",
        data.restaurantId,
        data.id,
        "That payment method doesn't belong to this property.",
      );
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      type_class: data.typeClass ? data.typeClass : null,
      notes: data.notes ?? "",
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_payment_methods")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_payment_methods").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That payment-method code is already used.");
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_payment_method_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluatePaymentsCard3Readiness(snapshot) };
  });

export const saveDepositPolicyCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => depositPolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_deposit_policies",
        data.restaurantId,
        data.id,
        "That deposit policy doesn't belong to this property.",
      );
    }
    if (data.isDefault) {
      let clear = db
        .from("pms_deposit_policies")
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
      required: data.required,
      deposit_type: data.depositType,
      deposit_value: data.depositValue,
      is_default: data.isDefault,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_deposit_policies")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_deposit_policies").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That deposit-policy code is already used.");
      unavailable(result.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_deposit_policy_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluatePaymentsCard3Readiness(snapshot) };
  });
