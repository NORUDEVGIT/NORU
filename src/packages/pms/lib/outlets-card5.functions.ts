/**
 * Card 5 Phase 2 — Outlets & Facilities load/save.
 * Extends pms_outlets only; owned Card 2/3/Departments masters are read-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { STAFF_ROLES } from "@/core/lib/module-access";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard5Overall } from "./card5-readiness.functions";
import { SET2_AUDIT_OUTLET } from "./pms-set2-structure";
import {
  CARD5_AVAILABILITY_MODES,
  CARD5_FACILITIES_UNAVAILABLE,
  CARD5_FACILITY_AUDIT_SECTION,
  CARD5_FACILITY_CATEGORIES,
  CARD5_FEATURES,
  emptyFacilityFeatures,
  evaluateCard5FacilitiesReadiness,
  parseAvailabilityMode,
  parseFacilityCategory,
  parseFacilityFeatures,
  parseFacilityRole,
  parseOperatingHours,
  validCapacityOrder,
  type Card5FacilitiesSnapshot,
  type Card5Facility,
  type Card5Option,
} from "./outlets-card5.server";
import {
  emptyOperatingHours,
  serializeOperatingHours,
  type Card5OperatingHours,
} from "./departments-card5.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();
const nullableId = idSchema.nullable().optional();
const roleEnum = z.enum(STAFF_ROLES as unknown as [string, ...string[]]);

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD5_FACILITIES_UNAVAILABLE);
  throw new Error(error?.message ?? CARD5_FACILITIES_UNAVAILABLE);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  before: Card5Facility[],
  after: Card5Facility[],
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action: SET2_AUDIT_OUTLET,
    metadata: {
      section: CARD5_FACILITY_AUDIT_SECTION,
      before,
      after,
    } as unknown as Json,
  });
  if (result.error) console.error("[card5-facilities] audit", result.error.message);
}

function mapFacility(row: any): Card5Facility {
  const numberOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    facilityCategory: parseFacilityCategory(row.facility_category),
    facilityTypeCode: String(row.facility_type_code ?? "custom"),
    buildingId: row.building_id == null ? null : String(row.building_id),
    floorId: row.floor_id == null ? null : String(row.floor_id),
    wingId: row.wing_id == null ? null : String(row.wing_id),
    departmentId: row.department_id == null ? null : String(row.department_id),
    managerUserId: row.manager_user_id == null ? null : String(row.manager_user_id),
    responsibleRole: parseFacilityRole(row.responsible_role),
    minimumCapacity: numberOrNull(row.minimum_capacity),
    standardCapacity: numberOrNull(row.standard_capacity),
    maximumCapacity: numberOrNull(row.maximum_capacity),
    operatingHours: parseOperatingHours(row.operating_hours),
    chargeable: row.chargeable == null ? null : row.chargeable === true,
    revenueCenter: String(row.revenue_center ?? ""),
    taxGroupId: row.tax_group_id == null ? null : String(row.tax_group_id),
    currencyCode: row.currency_code == null ? null : String(row.currency_code),
    reservationRequired:
      row.reservation_required == null ? null : row.reservation_required === true,
    advanceBookingRequired:
      row.advance_booking_required == null ? null : row.advance_booking_required === true,
    minimumLeadMinutes: numberOrNull(row.minimum_lead_minutes),
    availabilityMode: parseAvailabilityMode(row.availability_mode),
    features: parseFacilityFeatures(row.features),
    active: row.active !== false,
  };
}

function mapOptions(rows: any[], extra?: (row: any) => Partial<Card5Option>): Card5Option[] {
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.code ?? ""),
    active: row.active !== false,
    ...extra?.(row),
  }));
}

async function loadStaff(db: DbClient, restaurantId: string) {
  const memberships = await db
    .from("restaurant_users")
    .select("user_id, role, active")
    .eq("restaurant_id", restaurantId)
    .order("role");
  if (memberships.error) throw new Error(memberships.error.message);
  const rows = (memberships.data ?? []) as Array<{
    user_id: string;
    role: string;
    active: boolean;
  }>;
  const ids = rows.map((row) => row.user_id);
  const profiles =
    ids.length === 0
      ? { data: [], error: null }
      : await db.from("profiles").select("id, first_name, last_name, email").in("id", ids);
  if (profiles.error) throw new Error(profiles.error.message);
  const names = new Map(
    ((profiles.data ?? []) as any[]).map((row) => [
      String(row.id),
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        String(row.email ?? "Staff member"),
    ]),
  );
  return rows.map((row) => ({
    id: row.user_id,
    name: names.get(row.user_id) ?? "Staff member",
    role: row.role,
    active: row.active !== false,
  }));
}

export async function loadCard5FacilitiesSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card5FacilitiesSnapshot> {
  const facilities = await db
    .from("pms_outlets")
    .select(
      "id, code, name, active, description, facility_category, facility_type_code, building_id, floor_id, wing_id, department_id, manager_user_id, responsible_role, minimum_capacity, standard_capacity, maximum_capacity, operating_hours, chargeable, revenue_center, tax_group_id, currency_code, reservation_required, advance_booking_required, minimum_lead_minutes, availability_mode, features",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (facilities.error) unavailable(facilities.error);

  const [buildings, floors, wings, departments, taxGroups, currencies, staff] = await Promise.all([
    db
      .from("hotel_buildings")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("hotel_floors")
      .select("id, name, active, building_id")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("hotel_wings")
      .select("id, name, active, parent_building_id, parent_floor_id")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_departments")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_tax_groups")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_property_currencies")
      .select("code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    loadStaff(db, restaurantId),
  ]);
  for (const result of [buildings, floors, wings, departments, taxGroups, currencies]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    facilities: ((facilities.data ?? []) as any[]).map(mapFacility),
    buildings: mapOptions(buildings.data ?? []),
    floors: mapOptions(floors.data ?? [], (row) => ({
      buildingId: row.building_id == null ? null : String(row.building_id),
    })),
    wings: mapOptions(wings.data ?? [], (row) => ({
      parentId: row.parent_floor_id != null ? String(row.parent_floor_id) : null,
      buildingId: row.parent_building_id != null ? String(row.parent_building_id) : null,
    })),
    departments: mapOptions(departments.data ?? []),
    staff,
    taxGroups: mapOptions(taxGroups.data ?? []),
    currencies: ((currencies.data ?? []) as any[]).map((row) => ({
      code: String(row.code),
      name: String(row.name ?? row.code),
      active: row.active !== false,
    })),
  };
}

const hoursWindowSchema = z
  .object({
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .nullable();
const hoursSchema = z.object({
  is24Hours: z.boolean(),
  daily: hoursWindowSchema,
  weekend: hoursWindowSchema,
  holiday: hoursWindowSchema,
  holidayNotes: z.string().max(200).optional(),
});
const featuresSchema = z.object(
  Object.fromEntries(CARD5_FEATURES.map((feature) => [feature, z.boolean()])) as Record<
    (typeof CARD5_FEATURES)[number],
    z.ZodBoolean
  >,
);

const facilitySchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    facilityCategory: z.enum(CARD5_FACILITY_CATEGORIES),
    facilityTypeCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase type code such as meeting_room."),
    buildingId: nullableId,
    floorId: nullableId,
    wingId: nullableId,
    departmentId: nullableId,
    managerUserId: nullableId,
    responsibleRole: roleEnum.nullable().optional(),
    minimumCapacity: z.number().int().min(0).nullable(),
    standardCapacity: z.number().int().min(0).nullable(),
    maximumCapacity: z.number().int().min(0).nullable(),
    operatingHours: hoursSchema,
    chargeable: z.boolean().nullable(),
    revenueCenter: z.string().trim().max(40).optional(),
    taxGroupId: nullableId,
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    reservationRequired: z.boolean().nullable(),
    advanceBookingRequired: z.boolean().nullable(),
    minimumLeadMinutes: z.number().int().min(0).nullable(),
    availabilityMode: z.enum(CARD5_AVAILABILITY_MODES),
    features: featuresSchema,
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!validCapacityOrder(value.minimumCapacity, value.standardCapacity, value.maximumCapacity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Capacity must follow minimum ≤ standard ≤ maximum.",
        path: ["standardCapacity"],
      });
    }
  });

function requireOption(
  rows: Array<{ id: string; active: boolean }>,
  id: string | null | undefined,
  label: string,
) {
  if (id && !rows.some((row) => row.id === id && row.active)) {
    throw new Error(`${label} must be an active option from this property.`);
  }
}

export const getCard5Facilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard5FacilitiesSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard5FacilitiesReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard5Facility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => facilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5FacilitiesSnapshot(db, data.restaurantId);

    requireOption(before.buildings, data.buildingId, "Building");
    requireOption(before.floors, data.floorId, "Floor");
    requireOption(before.wings, data.wingId, "Wing");
    requireOption(before.departments, data.departmentId, "Department");
    requireOption(before.staff, data.managerUserId, "Manager");
    requireOption(before.taxGroups, data.taxGroupId, "Tax group");
    if (
      data.currencyCode &&
      !before.currencies.some((row) => row.code === data.currencyCode && row.active)
    ) {
      throw new Error("Currency must be supported by this property.");
    }
    const floor = before.floors.find((row) => row.id === data.floorId);
    if (floor?.buildingId && data.buildingId && floor.buildingId !== data.buildingId) {
      throw new Error("Floor must belong to the selected building.");
    }
    const wing = before.wings.find((row) => row.id === data.wingId);
    if (
      wing &&
      ((wing.parentId && data.floorId && wing.parentId !== data.floorId) ||
        (wing.buildingId && data.buildingId && wing.buildingId !== data.buildingId))
    ) {
      throw new Error("Wing must belong to the selected building or floor.");
    }

    const hours: Card5OperatingHours = emptyOperatingHours({
      is24Hours: data.operatingHours.is24Hours,
      daily: data.operatingHours.daily,
      weekend: data.operatingHours.weekend,
      holiday: data.operatingHours.holiday,
      holidayNotes: data.operatingHours.holidayNotes ?? "",
    });
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: blankToNull(data.description),
      facility_category: data.facilityCategory,
      facility_type_code: data.facilityTypeCode,
      building_id: data.buildingId ?? null,
      floor_id: data.floorId ?? null,
      wing_id: data.wingId ?? null,
      department_id: data.departmentId ?? null,
      manager_user_id: data.managerUserId ?? null,
      responsible_role: data.responsibleRole ?? null,
      minimum_capacity: data.minimumCapacity,
      standard_capacity: data.standardCapacity,
      maximum_capacity: data.maximumCapacity,
      operating_hours: serializeOperatingHours(hours) as unknown as Json,
      chargeable: data.chargeable,
      revenue_center: blankToNull(data.revenueCenter),
      tax_group_id: data.taxGroupId ?? null,
      currency_code: data.currencyCode ?? null,
      reservation_required: data.reservationRequired,
      advance_booking_required: data.advanceBookingRequired,
      minimum_lead_minutes: data.minimumLeadMinutes,
      availability_mode: data.availabilityMode,
      features: emptyFacilityFeatures(data.features) as unknown as Json,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_outlets")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_outlets").insert({ ...payload, type: "other" });
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That facility code is already used.");
      unavailable(result.error);
    }
    const after = await loadCard5FacilitiesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, before.facilities, after.facilities);
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard5FacilitiesReadiness(after),
    };
  });
