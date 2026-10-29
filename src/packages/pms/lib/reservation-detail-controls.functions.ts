import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "@/packages/pms/lib/guests.server";
import { companionProfileNotes } from "@/packages/pms/lib/reservation-detail-guest";
import { rateError, requireRateManager } from "@/packages/pms/lib/rates.server";
import { assertReservationDetailEditable } from "@/packages/pms/lib/reservation-lifecycle.server";
import {
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

const traceStatus = z.enum(["pending", "in_progress", "completed", "cancelled"]);
const tracePriority = z.enum(["low", "normal", "high", "urgent"]);

export type ReservationTrace = {
  id: string;
  task: string;
  assigneeName: string | null;
  department: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  dueAt: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

function traceRow(row: Record<string, unknown>): ReservationTrace {
  const priority = row.priority;
  const status = row.status;
  return {
    id: String(row.id),
    task: String(row.task ?? ""),
    assigneeName: row.assignee_name == null ? null : String(row.assignee_name),
    department: row.department == null ? null : String(row.department),
    priority:
      priority === "low" || priority === "high" || priority === "urgent" ? priority : "normal",
    dueAt: row.due_at == null ? null : String(row.due_at),
    status:
      status === "in_progress" || status === "completed" || status === "cancelled"
        ? status
        : "pending",
    notes: row.notes == null ? null : String(row.notes),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Guest-profile fields for one accompanying guest. Does not attach the stay. */
export const saveStayCompanionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().max(120).nullable(),
        phone: z.string().trim().max(60).nullable().optional(),
        email: z.string().trim().max(200).nullable().optional(),
        gender: z.enum(["female", "male", "other", "unspecified"]).nullable(),
        nationality: z.string().trim().max(120).nullable().optional(),
        dateOfBirth: z.string().trim().max(20).nullable().optional(),
        idDocumentType: z
          .enum(["passport", "national_id", "driving_licence", "other"])
          .nullable()
          .optional(),
        idDocumentNumber: z.string().trim().max(80).nullable(),
        relationship: z.string().trim().max(80),
        age: z.string().trim().max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin
      .from("guest_profiles")
      .select("id, notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (existing.error) throw reservationError(existing.error.message);
    if (!existing.data) throw reservationError("GUEST_NOT_FOUND");
    const notes = companionProfileNotes(
      data.relationship,
      data.age,
      (existing.data as { notes?: string | null }).notes,
    );
    const updatePayload: Record<string, unknown> = {
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone ?? null,
      gender: data.gender,
      id_document_number: data.idDocumentNumber,
      notes,
    };
    if (data.nationality !== undefined) updatePayload.nationality = data.nationality;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.dateOfBirth !== undefined) updatePayload.date_of_birth = data.dateOfBirth;
    if (data.idDocumentType !== undefined) updatePayload.id_document_type = data.idDocumentType;

    const updated = await supabaseAdmin
      .from("guest_profiles")
      .update(updatePayload)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (updated.error) throw reservationError(updated.error.message);
    return { id: data.guestId };
  });

export const releaseReservationRoomPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        packageRowId: idSchema,
        reservationRoomId: idSchema,
        stayScope: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const { error } = await supabaseAdmin.rpc("release_hotel_reservation_room_package", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _package_row_id: data.packageRowId,
      _membership_id: me.id,
      _selected_reservation_room_id: data.reservationRoomId,
      _stay_scope: data.stayScope,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId };
  });

export const applyReservationPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        promotionActivationId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const { error } = await supabaseAdmin.rpc("sync_hotel_reservation_promotion", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _promotion_activation_id: data.promotionActivationId,
      _mode: "apply",
    });
    if (error) throw rateError(error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "promotion_applied",
      newValues: { promotion_activation_id: data.promotionActivationId },
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

/** Deletes the promotion snapshot. Does not change room_subtotal. */
export const removeReservationPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const { error } = await supabaseAdmin.rpc("remove_hotel_reservation_promotion", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw rateError(error.message);
    return { id: data.reservationId };
  });

export const saveAssignmentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
        notes: z.string().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const current = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select("assignment_notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .eq("id", data.reservationRoomId)
      .maybeSingle();
    if (current.error) throw reservationError(current.error.message);
    if (!current.data) throw reservationError("ROOM_UNIT_NOT_FOUND");
    const previous =
      (current.data as { assignment_notes?: string | null }).assignment_notes ?? null;
    const updated = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .update({ assignment_notes: data.notes })
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .eq("id", data.reservationRoomId);
    if (updated.error) throw reservationError(updated.error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "assignment_notes_updated",
      previousValues: { assignment_notes: previous },
      newValues: { assignment_notes: data.notes, reservation_room_id: data.reservationRoomId },
      actorMembershipId: me.id,
    });
    return { id: data.reservationRoomId };
  });

export const saveRateNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        notes: z.string().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const current = await supabaseAdmin
      .from("hotel_reservations")
      .select("rate_notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (current.error) throw reservationError(current.error.message);
    if (!current.data) throw reservationError("RESERVATION_NOT_FOUND");
    const previous = (current.data as { rate_notes?: string | null }).rate_notes ?? null;
    const updated = await supabaseAdmin
      .from("hotel_reservations")
      .update({ rate_notes: data.notes })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId);
    if (updated.error) throw reservationError(updated.error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "rate_notes_updated",
      previousValues: { rate_notes: previous },
      newValues: { rate_notes: data.notes },
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const setReservationNotePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        pinned: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ pinned: boolean }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const current = await supabaseAdmin
      .from("hotel_reservations")
      .select("notes_pinned")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (current.error) throw reservationError(current.error.message);
    if (!current.data) throw reservationError("RESERVATION_NOT_FOUND");
    const previous = (current.data as { notes_pinned?: boolean | null }).notes_pinned === true;
    const updated = await supabaseAdmin
      .from("hotel_reservations")
      .update({ notes_pinned: data.pinned })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId);
    if (updated.error) throw reservationError(updated.error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "note_pinned",
      previousValues: { notes_pinned: previous },
      newValues: { notes_pinned: data.pinned },
      actorMembershipId: me.id,
    });
    return { pinned: data.pinned };
  });

export const listReservationTraces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationTrace[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("reservation_traces")
      .select(
        "id, task, assignee_name, department, priority, due_at, status, notes, completed_at, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .order("created_at", { ascending: true });
    if (error) throw reservationError(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map(traceRow);
  });

export const createReservationTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        task: z.string().trim().min(1).max(500),
        assigneeName: z.string().trim().max(120).nullable(),
        department: z.string().trim().max(120).nullable(),
        priority: tracePriority,
        dueAt: z.string().max(40).nullable(),
        notes: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const inserted = await supabaseAdmin
      .from("reservation_traces")
      .insert({
        restaurant_id: data.restaurantId,
        reservation_id: data.reservationId,
        task: data.task,
        assignee_name: data.assigneeName,
        department: data.department,
        priority: data.priority,
        due_at: data.dueAt,
        notes: data.notes,
        status: "pending",
      })
      .select("id")
      .single();
    if (inserted.error) throw reservationError(inserted.error.message);
    const id = String((inserted.data as { id: string }).id);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "trace_created",
      newValues: {
        trace_id: id,
        task: data.task,
        status: "pending",
        priority: data.priority,
        due_at: data.dueAt,
      },
      actorMembershipId: me.id,
    });
    return { id };
  });

export const updateReservationTrace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        traceId: idSchema,
        status: traceStatus,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertReservationDetailEditable(supabaseAdmin, data.restaurantId, data.reservationId);
    const current = await supabaseAdmin
      .from("reservation_traces")
      .select("status")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId)
      .eq("id", data.traceId)
      .maybeSingle();
    if (current.error) throw reservationError(current.error.message);
    if (!current.data) throw reservationError("TRACE_NOT_FOUND");
    const previous = String((current.data as { status: string }).status);
    const completedAt = data.status === "completed" ? new Date().toISOString() : null;
    const updated = await supabaseAdmin
      .from("reservation_traces")
      .update({
        status: data.status,
        completed_at: data.status === "completed" ? completedAt : null,
        updated_at: new Date().toISOString(),
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.traceId);
    if (updated.error) throw reservationError(updated.error.message);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "trace_updated",
      previousValues: { status: previous, trace_id: data.traceId },
      newValues: { status: data.status, trace_id: data.traceId },
      actorMembershipId: me.id,
    });
    return { id: data.traceId };
  });
