/**
 * FO Phase 6 — Guest Services summary for Front Office.
 * Reads guest_service_history. Frozen fo_guest_requests is not the runtime writer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPermissionDeniedMessage } from "./front-office-shell";
import { isMissingSchemaError } from "./pms-set2-structure";
import { requireReservationManager } from "./reservations.server";
import { requireGuestManager } from "./guests.server";
import {
  isGuestServiceStatus,
  type GuestServicePriority,
  type GuestServiceStatus,
} from "./guest-services-workspace";
import {
  foGuestServiceDerivedFlags,
  foGuestServiceSignals,
  type FoGuestServiceItem,
  type FoGuestServiceSignals,
} from "./fo-guest-services";

const idSchema = z.string().uuid();

export type FoGuestServiceTypeOption = {
  id: string;
  name: string;
  categoryName: string | null;
  active: boolean;
};

export type FoGuestServiceSummary = {
  available: boolean;
  permissionDenied: boolean;
  typesConfigured: boolean;
  slaConfigured: false;
  items: FoGuestServiceItem[];
  active: FoGuestServiceItem[];
  types: FoGuestServiceTypeOption[];
  signals: FoGuestServiceSignals;
  derived: ReturnType<typeof foGuestServiceDerivedFlags>;
};

const EMPTY_SIGNALS: FoGuestServiceSignals = {
  activeCount: 0,
  unresolvedCount: 0,
  hasUrgent: false,
  hasOverdue: false,
  highestPriority: null,
};

function emptySummary(extra: Partial<FoGuestServiceSummary> = {}): FoGuestServiceSummary {
  return {
    available: false,
    permissionDenied: false,
    typesConfigured: false,
    slaConfigured: false,
    items: [],
    active: [],
    types: [],
    signals: EMPTY_SIGNALS,
    derived: foGuestServiceDerivedFlags(EMPTY_SIGNALS),
    ...extra,
  };
}

export const getFrontOfficeGuestServiceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        guestId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FoGuestServiceSummary> => {
    try {
      await requireReservationManager(context as never, data.restaurantId);
      await requireGuestManager(context as never, data.restaurantId);
    } catch (error) {
      if (isPermissionDeniedMessage(error)) return emptySummary({ permissionDenied: true });
      throw error;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let result = await context.supabase
      .from("guest_service_history")
      .select(
        "id, service_type_id, status, requested_at, reservation_id, notes, request_number, priority, preferred_at, assigned_membership_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("reservation_id", data.reservationId)
      .order("requested_at", { ascending: false })
      .limit(20);

    if (result.error && isMissingSchemaError(result.error)) {
      return emptySummary({ available: false });
    }
    if (result.error) throw new Error(result.error.message);

    const typesRes = await supabaseAdmin
      .from("pms_guest_service_types")
      .select("id, name, active, category_id")
      .eq("restaurant_id", data.restaurantId)
      .order("display_order");
    if (typesRes.error && isMissingSchemaError(typesRes.error)) {
      return emptySummary({ available: false });
    }
    const categoriesRes = await supabaseAdmin
      .from("pms_guest_service_categories")
      .select("id, name")
      .eq("restaurant_id", data.restaurantId);
    const categoryName = new Map(
      ((categoriesRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    );
    const types: FoGuestServiceTypeOption[] = (
      (typesRes.data ?? []) as Array<{ id: string; name: string; active: boolean; category_id: string | null }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      categoryName: row.category_id ? categoryName.get(row.category_id) ?? null : null,
      active: row.active,
    }));
    const typeById = new Map(types.map((row) => [row.id, row]));

    const assignedIds = [
      ...new Set(
        ((result.data ?? []) as Array<{ assigned_membership_id: string | null }>)
          .map((row) => row.assigned_membership_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actorNames = new Map<string, string>();
    if (assignedIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", assignedIds);
      const userIds = [...new Set(((members ?? []) as Array<{ user_id: string }>).map((row) => row.user_id))];
      const { data: profiles } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", userIds)
        : { data: [] };
      const nameByUser = new Map(
        ((profiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((row) => [
          row.id,
          [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Staff",
        ]),
      );
      for (const member of (members ?? []) as Array<{ id: string; user_id: string }>) {
        actorNames.set(member.id, nameByUser.get(member.user_id) ?? "Staff");
      }
    }

    const items: FoGuestServiceItem[] = (
      (result.data ?? []) as Array<{
        id: string;
        service_type_id: string;
        status: string;
        requested_at: string;
        notes: string | null;
        request_number: string | null;
        priority: string | null;
        preferred_at: string | null;
        assigned_membership_id: string | null;
      }>
    )
      .filter((row) => isGuestServiceStatus(row.status))
      .map((row) => {
        const type = typeById.get(row.service_type_id);
        const priority: GuestServicePriority =
          row.priority === "urgent" || row.priority === "high" ? row.priority : "normal";
        return {
          id: row.id,
          requestNumber: row.request_number,
          serviceName: type?.name ?? "Service request",
          categoryName: type?.categoryName ?? null,
          status: row.status as GuestServiceStatus,
          priority,
          assignedName: row.assigned_membership_id ? actorNames.get(row.assigned_membership_id) ?? null : null,
          requestedAt: row.requested_at,
          preferredAt: row.preferred_at,
          notes: row.notes,
        };
      });

    const nowMs = Date.now();
    const signals = foGuestServiceSignals(items, nowMs);
    const active = items.filter((item) => item.status === "requested" || item.status === "in_progress").slice(0, 5);

    return {
      available: true,
      permissionDenied: false,
      typesConfigured: types.some((type) => type.active),
      slaConfigured: false,
      items,
      active,
      types: types.filter((type) => type.active),
      signals,
      derived: foGuestServiceDerivedFlags(signals),
    };
  });
