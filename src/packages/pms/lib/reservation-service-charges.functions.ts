import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireReservationManager } from "./reservations.server";
import type { ServicePricingUnit } from "./room-charge-guest-total";

const idSchema = z.string().uuid();
const UNITS: readonly ServicePricingUnit[] = [
  "per_service",
  "per_room",
  "per_item",
  "per_person",
  "per_night",
];

export type ReservationServiceCharge = {
  id: string;
  serviceTypeId: string;
  serviceName: string;
  status: string;
  quantity: number;
  pricingUnit: ServicePricingUnit | null;
  unitAmount: number | null;
  currency: string | null;
  departmentId: string | null;
  folioTransactionId: string | null;
  postedAt: string | null;
};

/** Posts pending priced services for an in-house stay (same RPC check-in uses). */
export const postReservationServiceCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ posted: number; skipped: number; failed: boolean }> => {
      const me = await requireReservationManager(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: result, error } = await supabaseAdmin.rpc(
        "post_reservation_service_requests" as never,
        {
          _restaurant_id: data.restaurantId,
          _reservation_id: data.reservationId,
          _membership_id: me.id,
        } as never,
      );
      if (error) return { posted: 0, skipped: 0, failed: true };
      const row = (result ?? {}) as { posted?: number; skipped?: number };
      return { posted: Number(row.posted ?? 0), skipped: Number(row.skipped ?? 0), failed: false };
    },
  );

/** Priced service requests on a reservation (quantity snapshot from 0189). */
export const listReservationServiceCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationServiceCharge[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await supabaseAdmin
      .from("guest_service_history")
      .select(
        "id, service_type_id, status, quantity, pricing_unit, unit_amount, currency, folio_transaction_id, posted_at, requested_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .not("quantity", "is", null)
      .neq("status", "cancelled")
      .order("requested_at");
    if (rows.error && isMissingSchemaError(rows.error)) return [];
    if (rows.error) throw new Error(rows.error.message);
    const list = (rows.data ?? []) as Array<{
      id: string;
      service_type_id: string;
      status: string;
      quantity: number;
      pricing_unit: string | null;
      unit_amount: number | string | null;
      currency: string | null;
      folio_transaction_id: string | null;
      posted_at: string | null;
    }>;
    if (list.length === 0) return [];

    const typeIds = [...new Set(list.map((row) => row.service_type_id))];
    const [types, billing] = await Promise.all([
      supabaseAdmin
        .from("pms_guest_service_types")
        .select("id, name")
        .eq("restaurant_id", data.restaurantId)
        .in("id", typeIds),
      supabaseAdmin
        .from("pms_guest_service_department_assignments")
        .select("service_type_id, department_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .eq("is_billing_department", true)
        .in("service_type_id", typeIds),
    ]);
    const nameById = new Map(
      ((types.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    );
    const departments = new Map<string, string[]>();
    for (const row of (billing.data ?? []) as Array<{
      service_type_id: string;
      department_id: string;
    }>) {
      departments.set(row.service_type_id, [
        ...(departments.get(row.service_type_id) ?? []),
        row.department_id,
      ]);
    }

    return list.map((row) => {
      const billed = departments.get(row.service_type_id) ?? [];
      return {
        id: row.id,
        serviceTypeId: row.service_type_id,
        serviceName: nameById.get(row.service_type_id) ?? "Service",
        status: row.status,
        quantity: Number(row.quantity),
        pricingUnit: UNITS.find((unit) => unit === row.pricing_unit) ?? null,
        unitAmount: row.unit_amount == null ? null : Number(row.unit_amount),
        currency: row.currency,
        departmentId: billed.length === 1 ? billed[0] : null,
        folioTransactionId: row.folio_transaction_id,
        postedAt: row.posted_at,
      };
    });
  });
