/**
 * PMS Polish Wave 1 — load / save payment methods and shift definitions.
 *
 * 0056 tables are optional at runtime: missing relations never crash the hub.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import type { Json } from "@/integrations/supabase/types";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  POLISH1_AUDIT_PAYMENT_METHOD,
  POLISH1_AUDIT_SHIFT,
  activateInputFromPolish1Snapshot,
  emptyPolish1Snapshot,
  type Polish1Snapshot,
  type PmsPaymentMethod,
  type PmsShiftDefinition,
} from "./pms-polish1-payment-admin";

const idSchema = z.string().uuid();
const POLISH1_UNAVAILABLE_PAYMENTS = "Payment methods are unavailable until migration 0056 is applied.";
const POLISH1_UNAVAILABLE_SHIFTS = "Shift definitions are unavailable until migration 0056 is applied.";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

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
    console.error("[pms-polish1] audit", error.message);
    return false;
  }
  return true;
}

function mapPaymentMethod(row: {
  id: string;
  code: string;
  name: string;
  type_class?: string | null;
  notes?: string | null;
  active: boolean;
}): PmsPaymentMethod {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    typeClass: String(row.type_class ?? ""),
    notes: String(row.notes ?? ""),
    active: row.active,
  };
}

function mapShift(row: {
  id: string;
  code: string;
  name: string;
  type_class?: string | null;
  notes?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  active: boolean;
}): PmsShiftDefinition {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    typeClass: String(row.type_class ?? ""),
    notes: String(row.notes ?? ""),
    startTime: String(row.start_time ?? ""),
    endTime: String(row.end_time ?? ""),
    active: row.active,
  };
}

export async function loadPolish1Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Polish1Snapshot> {
  const snapshot = emptyPolish1Snapshot();

  const paymentsRes = await supabaseAdmin
    .from("pms_payment_methods")
    .select("id, code, name, type_class, notes, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (paymentsRes.error && isMissingSchemaError(paymentsRes.error)) {
    snapshot.paymentMethodsAvailable = false;
  } else if (paymentsRes.error) {
    throw new Error(paymentsRes.error.message);
  } else {
    snapshot.paymentMethodsAvailable = true;
    snapshot.paymentMethods = ((paymentsRes.data ?? []) as Array<Parameters<typeof mapPaymentMethod>[0]>).map(
      mapPaymentMethod,
    );
  }

  const shiftsRes = await supabaseAdmin
    .from("pms_shift_definitions")
    .select("id, code, name, type_class, notes, start_time, end_time, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (shiftsRes.error && isMissingSchemaError(shiftsRes.error)) {
    snapshot.shiftsAvailable = false;
  } else if (shiftsRes.error) {
    throw new Error(shiftsRes.error.message);
  } else {
    snapshot.shiftsAvailable = true;
    snapshot.shifts = ((shiftsRes.data ?? []) as Array<Parameters<typeof mapShift>[0]>).map(mapShift);
  }

  return snapshot;
}

export async function loadActivePaymentMethodCodes(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<string[] | null> {
  const snapshot = await loadPolish1Snapshot(supabaseAdmin, restaurantId);
  if (!snapshot.paymentMethodsAvailable) return null;
  return snapshot.paymentMethods.filter((row) => row.active).map((row) => row.code);
}

export const getPmsPolish1Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromPolish1Snapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

async function requireEditor(restaurantId: string, context: { userId: string }) {
  const me = await withPmsPackage(restaurantId, callerMembership(context as never, restaurantId));
  if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
  return me;
}

export const savePmsPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        typeClass: z.string().trim().max(40).optional(),
        notes: z.string().trim().max(240).optional(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.paymentMethodsAvailable) throw new Error(POLISH1_UNAVAILABLE_PAYMENTS);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      type_class: data.typeClass?.trim() ? data.typeClass.trim() : null,
      notes: data.notes ?? "",
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_payment_methods").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_payment_methods").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That payment-method code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(POLISH1_UNAVAILABLE_PAYMENTS);
      throw new Error(result.error.message);
    }
    const after = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: POLISH1_AUDIT_PAYMENT_METHOD,
      section: "payment-methods",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsShiftDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        typeClass: z.string().trim().max(40).optional(),
        notes: z.string().trim().max(240).optional(),
        startTime: z.string().trim().max(8).optional(),
        endTime: z.string().trim().max(8).optional(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.shiftsAvailable) throw new Error(POLISH1_UNAVAILABLE_SHIFTS);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      type_class: data.typeClass?.trim() ? data.typeClass.trim() : null,
      notes: data.notes ?? "",
      start_time: data.startTime?.trim() ? data.startTime.trim() : null,
      end_time: data.endTime?.trim() ? data.endTime.trim() : null,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_shift_definitions").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_shift_definitions").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That shift code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(POLISH1_UNAVAILABLE_SHIFTS);
      throw new Error(result.error.message);
    }
    const after = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: POLISH1_AUDIT_SHIFT,
      section: "administration",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });
