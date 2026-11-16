/**
 * Read-only loader for Settings setup progress.
 *
 * Facts are read with the privileged client after the caller proves Settings
 * access, so every viewer of the same property sees the same percentage.
 * Nothing here writes: no status merges, no seeding.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePmsSetupActorAny } from "./pms-permissions.server";
import { PMS_SETTINGS_HUB_PERMISSIONS } from "./pms-client-access";
import { CARD1_STEPS, card1StepComplete } from "./pms-property-setup-card1";
import { evaluateRoomTypesRoomsReadiness } from "./rooms-card2.server";
import {
  ROOMS_MISSING_ROOM,
  ROOMS_MISSING_TYPE,
  buildSetupProgressReport,
  type SetupProgressFacts,
  type SetupProgressReport } from "./pms-setup-progress";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  const result = await query;
  return result.error ? [] : ((result.data as any[] | null) ?? []);
}

async function loadCard1Facts(db: DbClient, restaurantId: string) {
  const { loadCard1ValidationSnapshot } = await import("./pms-property-setup-card1.functions");
  const { snapshot, set2 } = await loadCard1ValidationSnapshot(db, restaurantId);
  const saved =
    Object.keys(snapshot.status.card1Steps).length > 0 ||
    snapshot.status.cards["property-business"] != null;
  return {
    saved,
    steps: CARD1_STEPS.map((step) => ({
      id: step.id,
      title: step.title,
      complete: card1StepComplete(step.id, snapshot.draft, set2) })),
    currencyCode: snapshot.draft.currencyCode,
    vatRegistered: Boolean(snapshot.draft.vatRegistered) };
}

async function loadSecurityFacts(db: DbClient, restaurantId: string, nonOwnerStaff: number) {
  try {
    const [{ loadCard7SecuritySnapshot }, { evaluateCard7SecurityReadiness }] = await Promise.all([
      import("./security-roles-card7.functions"),
      import("./security-roles-card7.server"),
    ]);
    const snapshot = await loadCard7SecuritySnapshot(db, restaurantId);
    const readiness = evaluateCard7SecurityReadiness(snapshot);
    return { hotelRoles: snapshot.roles.length, nonOwnerStaff, blockers: readiness.blockers };
  } catch {
    return { hotelRoles: 0, nonOwnerStaff, blockers: [] };
  }
}

export async function loadSetupProgressFacts(
  db: DbClient,
  restaurantId: string,
): Promise<SetupProgressFacts> {
  const [
    card1,
    roomTypes,
    beds,
    rooms,
    floors,
    wings,
    ratePlans,
    paymentMethods,
    taxes,
    idTypes,
    agreements,
    departments,
    integrations,
    staff,
  ] = await Promise.all([
    loadCard1Facts(db, restaurantId),
    rows(
      db
        .from("room_types")
        .select(
          "id, code, active, standard_occupancy, max_occupancy, adult_capacity, child_capacity, infant_capacity",
        )
        .eq("restaurant_id", restaurantId),
    ),
    rows(db.from("room_type_beds").select("room_type_id, bed_count").eq("restaurant_id", restaurantId)),
    rows(
      db
        .from("hotel_rooms")
        .select("id, room_number, room_code, room_type_id, building_id, wing_id, floor_id, active")
        .eq("restaurant_id", restaurantId),
    ),
    rows(db.from("hotel_floors").select("id, building_id, wing_id").eq("restaurant_id", restaurantId)),
    rows(db.from("hotel_wings").select("id, parent_building_id").eq("restaurant_id", restaurantId)),
    rows(db.from("hotel_rate_plans").select("active, currency").eq("restaurant_id", restaurantId)),
    rows(db.from("pms_payment_methods").select("active").eq("restaurant_id", restaurantId)),
    rows(db.from("pms_taxes").select("active").eq("restaurant_id", restaurantId)),
    rows(
      db.from("pms_guest_id_types").select("active, valid_for_profile_type_ids").eq("restaurant_id", restaurantId),
    ),
    rows(
      db
        .from("pms_registration_agreement_versions")
        .select("active, published_at")
        .eq("restaurant_id", restaurantId),
    ),
    rows(db.from("pms_departments").select("active").eq("restaurant_id", restaurantId)),
    rows(
      db.from("pms_integrations").select("enabled, status, last_error").eq("restaurant_id", restaurantId),
    ),
    rows(db.from("restaurant_users").select("role, active").eq("restaurant_id", restaurantId)),
  ]);

  const activeTypes = roomTypes.filter((row) => row.active !== false);
  const activeRooms = rooms.filter((row) => row.active !== false);
  const readiness = evaluateRoomTypesRoomsReadiness({
    types: activeTypes.map((row) => ({
      id: row.id,
      code: String(row.code ?? ""),
      standardOccupancy: Number(row.standard_occupancy ?? 0),
      maxOccupancy: Number(row.max_occupancy ?? 0),
      adultCapacity: Number(row.adult_capacity ?? 0),
      childCapacity: Number(row.child_capacity ?? 0),
      infantCapacity: Number(row.infant_capacity ?? 0) })),
    beds: beds.map((row) => ({ roomTypeId: row.room_type_id, bedCount: Number(row.bed_count ?? 0) })),
    rooms: activeRooms.map((row) => ({
      id: row.id,
      roomNumber: String(row.room_number ?? ""),
      roomCode: row.room_code ?? null,
      roomTypeId: row.room_type_id ?? null,
      buildingId: row.building_id ?? null,
      wingId: row.wing_id ?? null,
      floorId: row.floor_id ?? null })),
    floors: floors.map((row) => ({ id: row.id, buildingId: row.building_id, wingId: row.wing_id ?? null })),
    wings: wings.map((row) => ({ id: row.id, parentBuildingId: row.parent_building_id ?? null })) });

  const currency = card1.currencyCode.trim().toUpperCase();
  const activeRatePlans = ratePlans.filter((row) => row.active === true);
  const enabledIntegrations = integrations.filter((row) => row.enabled === true);
  const nonOwnerStaff = staff.filter((row) => row.active !== false && row.role !== "owner").length;

  return {
    card1,
    rooms: {
      roomTypes: roomTypes.length,
      activeRoomTypes: activeTypes.length,
      rooms: rooms.length,
      activeRooms: activeRooms.length,
      configurationIssues: readiness.blockers.filter(
        (message) => message !== ROOMS_MISSING_TYPE && message !== ROOMS_MISSING_ROOM,
      ) },
    financial: {
      ratePlans: ratePlans.length,
      activeRatePlans: activeRatePlans.length,
      ratePlansInOtherCurrency: currency
        ? activeRatePlans.filter(
            (row) => row.currency && String(row.currency).trim().toUpperCase() !== currency,
          ).length
        : 0,
      paymentMethods: paymentMethods.length,
      activePaymentMethods: paymentMethods.filter((row) => row.active === true).length,
      taxes: taxes.length,
      activeTaxes: taxes.filter((row) => row.active === true).length },
    guest: {
      assignedIdDocuments: idTypes.filter(
        (row) =>
          row.active === true &&
          Array.isArray(row.valid_for_profile_type_ids) &&
          row.valid_for_profile_type_ids.length > 0,
      ).length,
      publishedAgreement: agreements.some((row) => row.active === true && row.published_at != null) },
    organization: {
      departments: departments.length,
      activeDepartments: departments.filter((row) => row.active === true).length },
    connectivity: {
      integrations: integrations.length,
      enabled: enabledIntegrations.length,
      enabledWithErrors: enabledIntegrations.filter(
        (row) => row.status === "error" || row.last_error != null,
      ).length },
    security: await loadSecurityFacts(db, restaurantId, nonOwnerStaff) };
}

export const getPmsSetupProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SetupProgressReport> => {
    await requirePmsSetupActorAny(context as never, data.restaurantId, PMS_SETTINGS_HUB_PERMISSIONS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildSetupProgressReport(await loadSetupProgressFacts(supabaseAdmin, data.restaurantId));
  });
