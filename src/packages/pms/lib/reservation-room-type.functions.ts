import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRoomTypeOccupancy } from "@/packages/pms/lib/create-reservation-phase1-section4";
import { assertReservationDetailEditable } from "@/packages/pms/lib/reservation-lifecycle.server";
import { unitPackageKept } from "@/packages/pms/lib/reservation-room-package-sync";
import { getRoomTypeAvailabilityCompat } from "@/packages/pms/lib/room-inventory-compat";
import {
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

export type RoomTypePlanOption = {
  id: string;
  name: string;
  code: string;
};

export type RoomTypeChangeMoney = {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string | null;
  ratePlanName: string | null;
  nightly: number | null;
  stayTotal: number | null;
  currency: string | null;
  paymentRequirement: number | null;
};

export type RoomTypePackageLine = {
  id: string;
  name: string;
  amount: number | null;
  kept: boolean;
};

export type RoomTypeChangeImpact = {
  reservationRoomId: string;
  unitSequence: number;
  current: RoomTypeChangeMoney;
  proposed: RoomTypeChangeMoney & { available: number };
  packageImpact: string;
  packages: RoomTypePackageLine[];
  availability: string;
};

type StayPricing = {
  subtotal: number;
  currency: string | null;
  nightly: unknown;
  firstNight: number | null;
};

function moneyAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function readPricing(raw: unknown): StayPricing {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nightly = row.nightly;
  let firstNight: number | null = null;
  if (Array.isArray(nightly) && nightly[0] && typeof nightly[0] === "object") {
    firstNight = moneyAmount((nightly[0] as { rate?: unknown }).rate);
  }
  return {
    subtotal: moneyAmount(row.subtotal) ?? 0,
    currency: typeof row.currency === "string" ? row.currency : null,
    nightly,
    firstNight,
  };
}

function uuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function idsByKey(rows: Array<{ parentId: string; childId: string }>, parentId: string): string[] {
  return rows.filter((row) => row.parentId === parentId).map((row) => row.childId);
}

async function reviewUnitPackages(input: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string;
  roomTypeId: string;
  ratePlanId: string;
  arrivalDate: string;
  departureDate: string;
}): Promise<RoomTypePackageLine[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: attached, error } = await supabaseAdmin
    .from("hotel_reservation_packages")
    .select("id, package_activation_id, package_id, package_price")
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .eq("reservation_room_id", input.reservationRoomId);
  if (error) throw new Error(error.message);
  const rows = attached ?? [];
  if (rows.length === 0) return [];

  const activationIds = rows.map((row) => row.package_activation_id);
  const packageIds = rows.map((row) => row.package_id);
  const [activations, masters, roomLinks, planLinks] = await Promise.all([
    supabaseAdmin
      .from("hotel_package_activations")
      .select(
        "id, active, valid_from, valid_to, charge_basis, package_price, master_room_type_ids, master_rate_plan_ids",
      )
      .eq("restaurant_id", input.restaurantId)
      .in("id", activationIds),
    supabaseAdmin
      .from("pms_packages")
      .select("id, name, active")
      .eq("restaurant_id", input.restaurantId)
      .in("id", packageIds),
    supabaseAdmin
      .from("hotel_package_activation_room_types")
      .select("activation_id, room_type_id")
      .eq("restaurant_id", input.restaurantId)
      .in("activation_id", activationIds),
    supabaseAdmin
      .from("hotel_package_activation_rate_plans")
      .select("activation_id, rate_plan_id")
      .eq("restaurant_id", input.restaurantId)
      .in("activation_id", activationIds),
  ]);
  if (activations.error) throw new Error(activations.error.message);
  if (masters.error) throw new Error(masters.error.message);
  if (roomLinks.error) throw new Error(roomLinks.error.message);
  if (planLinks.error) throw new Error(planLinks.error.message);

  const roomScopes = (roomLinks.data ?? []).map((row) => ({
    parentId: row.activation_id,
    childId: row.room_type_id,
  }));
  const planScopes = (planLinks.data ?? []).map((row) => ({
    parentId: row.activation_id,
    childId: row.rate_plan_id,
  }));

  return rows.map((row) => {
    const activation = (activations.data ?? []).find(
      (item) => item.id === row.package_activation_id,
    );
    const master = (masters.data ?? []).find((item) => item.id === row.package_id);
    const decision = activation
      ? unitPackageKept({
          roomTypeId: input.roomTypeId,
          ratePlanId: input.ratePlanId,
          arrivalDate: input.arrivalDate,
          departureDate: input.departureDate,
          scope: {
            active: activation.active === true,
            validFrom: activation.valid_from,
            validTo: activation.valid_to,
            chargeBasis: activation.charge_basis,
            packagePrice: moneyAmount(activation.package_price),
            masterRoomTypeIds: uuidList(activation.master_room_type_ids),
            masterRatePlanIds: uuidList(activation.master_rate_plan_ids),
            activationRoomTypeIds: idsByKey(roomScopes, activation.id),
            activationRatePlanIds: idsByKey(planScopes, activation.id),
            masterActive: master?.active === true,
          },
        })
      : { kept: false, reason: "PACKAGE_ACTIVATION_NOT_FOUND" };
    return {
      id: row.id,
      name: master?.name ?? "Package",
      amount: moneyAmount(row.package_price),
      kept: decision.kept,
    };
  });
}

function firstNightFromSnapshot(snapshot: unknown): number | null {
  if (!Array.isArray(snapshot) || !snapshot[0] || typeof snapshot[0] !== "object") return null;
  return moneyAmount((snapshot[0] as { rate?: unknown }).rate);
}

function paymentRequirement(
  snapshot: unknown,
  stayTotal: number | null,
  firstNight: number | null,
): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const row = snapshot as Record<string, unknown>;
  const current = moneyAmount(row.computed_amount);
  const kind = typeof row.deposit_type === "string" ? row.deposit_type : "";
  const value = moneyAmount(row.deposit_value);
  if (kind === "none") return 0;
  if (kind === "fixed" && value != null) return roundMoney(value);
  if (kind === "percent" && value != null && stayTotal != null) {
    return roundMoney((stayTotal * value) / 100);
  }
  if (kind === "first_night" && firstNight != null) return roundMoney(firstNight);
  return current;
}

async function evaluateRoomTypeChange(input: {
  userClient: unknown;
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string;
  roomTypeId: string;
  ratePlanId: string;
}): Promise<RoomTypeChangeImpact & { unitCount: number; releaseRoomId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await assertReservationDetailEditable(supabaseAdmin, input.restaurantId, input.reservationId);

  const { data: reservation, error: reservationErrorRead } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, status, room_type_id, rate_plan_id, arrival_date, departure_date, adults, children, infants, special_requests, notes, currency, room_subtotal, nightly_rate_snapshot, deposit_requirement_snapshot",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.reservationId)
    .maybeSingle();
  if (reservationErrorRead) throw new Error(reservationErrorRead.message);
  if (!reservation) throw new Error("Reservation not found for this property.");
  if (!["pending", "confirmed"].includes(String(reservation.status))) {
    throw reservationError("INVALID_TRANSITION");
  }

  const { data: units, error: unitsError } = await supabaseAdmin
    .from("hotel_reservation_rooms")
    .select(
      "id, unit_sequence, status, room_type_id, room_id, rate_plan_id, arrival_date, departure_date, adults, children, infants, currency, room_subtotal, nightly_rate_snapshot",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .order("unit_sequence", { ascending: true });
  if (unitsError) throw new Error(unitsError.message);
  const unit = (units ?? []).find((row) => row.id === input.reservationRoomId);
  if (!unit) throw reservationError("ROOM_UNIT_NOT_FOUND");
  if (unit.status && !["pending", "confirmed"].includes(unit.status)) {
    throw reservationError("INVALID_TRANSITION");
  }

  const { data: roomType, error: roomTypeError } = await supabaseAdmin
    .from("room_types")
    .select("id, name, max_occupancy")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.roomTypeId)
    .maybeSingle();
  if (roomTypeError) throw new Error(roomTypeError.message);
  if (!roomType) throw reservationError("ROOM_TYPE_NOT_FOUND");
  assertRoomTypeOccupancy(unit.adults, unit.children, roomType.max_occupancy);

  const availability = await getRoomTypeAvailabilityCompat(input.userClient, {
    restaurantId: input.restaurantId,
    roomTypeId: input.roomTypeId,
    arrival: unit.arrival_date,
    departure: unit.departure_date,
    excludeReservationId: input.reservationId,
  });
  if (unit.room_type_id !== input.roomTypeId && availability.available < 1) {
    throw new Error("The proposed room type has no remaining availability.");
  }

  const { data: ratePlan, error: ratePlanError } = await supabaseAdmin
    .from("hotel_rate_plans")
    .select("id, name, code, room_type_id, active")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.ratePlanId)
    .maybeSingle();
  if (ratePlanError) throw new Error(ratePlanError.message);
  if (!ratePlan || !ratePlan.active || ratePlan.room_type_id !== input.roomTypeId) {
    throw new Error("Choose a rate plan that applies to the new room type.");
  }

  const quoteCurrency = unit.currency ?? reservation.currency;
  const { data: pricingRaw, error: priceError } = await supabaseAdmin.rpc("price_hotel_stay", {
    _restaurant_id: input.restaurantId,
    _rate_plan_id: input.ratePlanId,
    _room_type_id: input.roomTypeId,
    _arrival: unit.arrival_date,
    _departure: unit.departure_date,
    _rooms: 1,
    _adults: unit.adults,
    _children: unit.children,
    _infants: unit.infants ?? 0,
    ...(quoteCurrency ? { _quote_currency: quoteCurrency } : {}),
  });
  if (priceError) throw reservationError(priceError.message);
  const pricing = readPricing(pricingRaw);

  const { data: currentType } = await supabaseAdmin
    .from("room_types")
    .select("name")
    .eq("id", unit.room_type_id)
    .maybeSingle();
  const currentPlanId = unit.rate_plan_id;
  const { data: currentPlan } = currentPlanId
    ? await supabaseAdmin
        .from("hotel_rate_plans")
        .select("name")
        .eq("id", currentPlanId)
        .maybeSingle()
    : { data: null };

  let releaseRoomId: string | null = unit.room_id;
  if (releaseRoomId) {
    const { data: physical } = await supabaseAdmin
      .from("hotel_rooms")
      .select("room_type_id")
      .eq("restaurant_id", input.restaurantId)
      .eq("id", releaseRoomId)
      .maybeSingle();
    if (physical?.room_type_id !== input.roomTypeId) releaseRoomId = null;
  }

  const currentTotal = moneyAmount(unit.room_subtotal);
  const currentNightly = firstNightFromSnapshot(unit.nightly_rate_snapshot);
  const currentPayment = paymentRequirement(
    reservation.deposit_requirement_snapshot,
    currentTotal,
    currentNightly,
  );
  const proposedPayment = paymentRequirement(
    reservation.deposit_requirement_snapshot,
    pricing.subtotal,
    pricing.firstNight,
  );
  const unitCount = units?.length ?? 0;
  const packages = await reviewUnitPackages({
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    reservationRoomId: unit.id,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    arrivalDate: unit.arrival_date,
    departureDate: unit.departure_date,
  });
  const packageImpact =
    unitCount > 1
      ? "Only this room is repriced. Other rooms, and packages on those rooms, stay unchanged."
      : "Packages and promotions on this stay are rechecked when the change is confirmed.";

  return {
    reservationRoomId: unit.id,
    unitSequence: unit.unit_sequence,
    unitCount,
    releaseRoomId,
    current: {
      roomTypeId: unit.room_type_id,
      roomTypeName: currentType?.name ?? "Current room type",
      ratePlanId: currentPlanId,
      ratePlanName: currentPlan?.name ?? null,
      nightly: currentNightly,
      stayTotal: currentTotal,
      currency: unit.currency,
      paymentRequirement: currentPayment,
    },
    proposed: {
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      ratePlanId: ratePlan.id,
      ratePlanName: ratePlan.name,
      nightly: pricing.firstNight,
      stayTotal: pricing.subtotal,
      currency: pricing.currency ?? unit.currency,
      paymentRequirement: proposedPayment,
      available: availability.available,
    },
    packageImpact,
    packages,
    availability:
      availability.available > 0
        ? `${availability.available} rooms of this type are available for these dates.`
        : "This room already holds the selected room type for these dates.",
    pricing,
    reservation,
    unit,
  } as RoomTypeChangeImpact & {
    unitCount: number;
    releaseRoomId: string | null;
    pricing: StayPricing;
    reservation: typeof reservation;
    unit: typeof unit;
  };
}

export const listReservationRatePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomTypePlanOption[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error } = await supabaseAdmin
      .from("hotel_rate_plans")
      .select("id, name, code")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (plans ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      code: plan.code,
    }));
  });

export const previewReservationRoomTypeChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
        roomTypeId: idSchema,
        ratePlanId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomTypeChangeImpact> => {
    await requireReservationManager(context as never, data.restaurantId);
    const review = await evaluateRoomTypeChange({
      userClient: context.supabase,
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId,
      roomTypeId: data.roomTypeId,
      ratePlanId: data.ratePlanId,
    });
    return {
      reservationRoomId: review.reservationRoomId,
      unitSequence: review.unitSequence,
      current: review.current,
      proposed: review.proposed,
      packageImpact: review.packageImpact,
      packages: review.packages,
      availability: review.availability,
    };
  });

export const confirmReservationRoomTypeChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema,
        roomTypeId: idSchema,
        ratePlanId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const review = await evaluateRoomTypeChange({
      userClient: context.supabase,
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId,
      roomTypeId: data.roomTypeId,
      ratePlanId: data.ratePlanId,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pricedStay = review as RoomTypeChangeImpact & {
      unitCount: number;
      releaseRoomId: string | null;
      pricing: StayPricing;
      reservation: {
        arrival_date: string;
        departure_date: string;
        adults: number;
        children: number;
        infants: number | null;
        special_requests: string | null;
        notes: string | null;
        deposit_requirement_snapshot: unknown;
      };
      unit: {
        id: string;
        unit_sequence: number;
        room_subtotal: number | string | null;
      };
    };

    if (pricedStay.unitCount <= 1) {
      const { error } = await supabaseAdmin.rpc("amend_hotel_reservation_priced", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _room_type_id: data.roomTypeId,
        _room_id: pricedStay.releaseRoomId as unknown as string,
        _arrival: pricedStay.reservation.arrival_date,
        _departure: pricedStay.reservation.departure_date,
        _adults: pricedStay.reservation.adults,
        _children: pricedStay.reservation.children,
        _special_requests: pricedStay.reservation.special_requests as unknown as string,
        _notes: pricedStay.reservation.notes as unknown as string,
        _rate_plan_id: data.ratePlanId,
        _membership_id: me.id,
        _infants: pricedStay.reservation.infants,
      });
      if (error) throw reservationError(error.message);
    } else {
      const { error: unitError } = await supabaseAdmin
        .from("hotel_reservation_rooms")
        .update({
          room_type_id: data.roomTypeId,
          rate_plan_id: data.ratePlanId,
          room_id: pricedStay.releaseRoomId,
          currency: pricedStay.pricing.currency,
          nightly_rate_snapshot: pricedStay.pricing.nightly as never,
          room_subtotal: pricedStay.pricing.subtotal,
          priced_at: new Date().toISOString(),
        })
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .eq("id", data.reservationRoomId);
      if (unitError) throw new Error(unitError.message);

      const { data: siblings, error: siblingError } = await supabaseAdmin
        .from("hotel_reservation_rooms")
        .select("id, unit_sequence, room_id, room_type_id, rate_plan_id, room_subtotal, currency")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("unit_sequence", { ascending: true });
      if (siblingError) throw new Error(siblingError.message);
      const pointer = siblings?.[0];
      const stayTotal = (siblings ?? []).reduce(
        (sum, row) => sum + (moneyAmount(row.room_subtotal) ?? 0),
        0,
      );
      if (pointer) {
        const snapshot = pricedStay.reservation.deposit_requirement_snapshot;
        const nextRequirement = paymentRequirement(
          snapshot,
          stayTotal,
          pricedStay.pricing.firstNight,
        );
        const nextSnapshot =
          snapshot && typeof snapshot === "object" && nextRequirement != null
            ? {
                ...(snapshot as Record<string, unknown>),
                computed_amount: nextRequirement,
              }
            : snapshot;
        const { error: masterError } = await supabaseAdmin
          .from("hotel_reservations")
          .update({
            room_id: pointer.room_id,
            room_type_id: pointer.room_type_id,
            rate_plan_id: pointer.rate_plan_id,
            room_subtotal: roundMoney(stayTotal),
            currency: pointer.currency,
            ...(nextSnapshot ? { deposit_requirement_snapshot: nextSnapshot as never } : {}),
          })
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.reservationId);
        if (masterError) throw new Error(masterError.message);
      }
      const { error: syncError } = await supabaseAdmin.rpc("sync_hotel_reservation_packages", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _package_activation_ids: null as unknown as string[],
        _mode: "reevaluate",
      });
      if (syncError) throw reservationError(syncError.message);
    }

    for (const line of review.packages) {
      if (line.kept) continue;
      const { error: releaseError } = await supabaseAdmin.rpc(
        "release_hotel_reservation_room_package",
        {
          _restaurant_id: data.restaurantId,
          _reservation_id: data.reservationId,
          _package_row_id: line.id,
          _membership_id: me.id,
        },
      );
      if (releaseError) throw reservationError(releaseError.message);
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "repriced",
      previousValues: {
        reservation_room_id: data.reservationRoomId,
        unit_sequence: review.unitSequence,
        room_type_id: review.current.roomTypeId,
        rate_plan_id: review.current.ratePlanId,
        room_subtotal: review.current.stayTotal,
        payment_requirement: review.current.paymentRequirement,
      },
      newValues: {
        reservation_room_id: data.reservationRoomId,
        unit_sequence: review.unitSequence,
        room_type_id: review.proposed.roomTypeId,
        rate_plan_id: review.proposed.ratePlanId,
        room_subtotal: review.proposed.stayTotal,
        payment_requirement: review.proposed.paymentRequirement,
      },
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });
