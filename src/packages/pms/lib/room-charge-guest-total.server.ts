import type { RoomChargeRules, RoomChargeServiceRule, RoomChargeTaxRule } from "./room-charge-guest-total.ts";

type DbError = { code?: string; message?: string } | null;
type DbResult = { data: unknown; error: DbError };
type EqQuery = PromiseLike<DbResult> & {
  eq: (column: string, value: string | boolean) => EqQuery;
  maybeSingle: () => PromiseLike<DbResult>;
};

export type RoomChargeRuleDb = {
  from: (table: string) => {
    select: (columns: string) => EqQuery;
  };
};

const EMPTY_RULES: RoomChargeRules = { taxes: [], services: [] };

function missingColumn(error: DbError) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function missingSchema(error: DbError) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function asChargeType(value: unknown): "percentage" | "fixed" {
  return value === "fixed" ? "fixed" : "percentage";
}

function appliesToRoomCharge(row: { applicability_scope?: unknown; basis?: unknown }) {
  const scope = row.applicability_scope == null ? "" : String(row.applicability_scope);
  if (scope === "all" || scope === "rate_plans") return true;
  if (scope) return false;
  const basis = row.basis == null ? "" : String(row.basis);
  return basis === "room" || basis === "all";
}

function asTax(row: Record<string, unknown>): RoomChargeTaxRule | null {
  if (!appliesToRoomCharge(row)) return null;
  const rate = Number(row.amount);
  if (!(rate > 0)) return null;
  return {
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    rate,
    calculation: row.calculation === "inclusive" ? "inclusive" : "exclusive",
  };
}

function asService(row: Record<string, unknown>): RoomChargeServiceRule | null {
  if (!appliesToRoomCharge(row)) return null;
  const rate = Number(row.amount);
  if (!(rate > 0)) return null;
  return {
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    rate,
  };
}

/**
 * Room taxes and service charges the folio posts on a room charge.
 * A default room tax group limits the taxes. Occupancy fee is included when
 * it is one of those taxes.
 */
export async function loadRoomChargeRules(
  db: RoomChargeRuleDb,
  restaurantId: string,
): Promise<RoomChargeRules> {
  const property = await db
    .from("restaurants")
    .select("default_room_tax_group_id")
    .eq("id", restaurantId)
    .maybeSingle();
  let groupId: string | null = null;
  if (!property.error) {
    const row = property.data as { default_room_tax_group_id?: string | null } | null;
    groupId = row?.default_room_tax_group_id ? String(row.default_room_tax_group_id) : null;
  } else if (!missingColumn(property.error) && !missingSchema(property.error)) {
    return EMPTY_RULES;
  }

  let taxes = await db
    .from("pms_taxes")
    .select("id, code, name, charge_type, amount, basis, applicability_scope, calculation, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (taxes.error && missingColumn(taxes.error)) {
    taxes = await db
      .from("pms_taxes")
      .select("id, code, name, charge_type, amount, basis, calculation, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true);
  }
  if (taxes.error) return EMPTY_RULES;

  let allowedTaxIds: Set<string> | null = null;
  if (groupId) {
    const group = await db
      .from("pms_tax_groups")
      .select("id, active")
      .eq("restaurant_id", restaurantId)
      .eq("id", groupId)
      .maybeSingle();
    const groupRow = group.data as { active?: boolean } | null;
    if (group.error || !groupRow || groupRow.active === false) {
      allowedTaxIds = new Set();
    } else {
      const mapped = await db
        .from("pms_tax_group_taxes")
        .select("tax_id")
        .eq("restaurant_id", restaurantId)
        .eq("tax_group_id", groupId);
      if (mapped.error) return EMPTY_RULES;
      const rows = Array.isArray(mapped.data) ? mapped.data : [];
      allowedTaxIds = new Set(rows.map((row) => String((row as { tax_id?: string }).tax_id ?? "")));
    }
  }

  const taxRows = Array.isArray(taxes.data) ? taxes.data : [];
  const taxRules = taxRows.flatMap((row) => {
    const record = row as Record<string, unknown>;
    if (allowedTaxIds && !allowedTaxIds.has(String(record.id ?? ""))) return [];
    const tax = asTax(record);
    return tax ? [tax] : [];
  });

  let services = await db
    .from("pms_service_charges")
    .select("code, name, charge_type, amount, basis, applicability_scope, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (services.error && missingColumn(services.error)) {
    services = await db
      .from("pms_service_charges")
      .select("code, name, charge_type, amount, basis, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true);
  }
  if (services.error) return { taxes: taxRules, services: [] };

  const serviceRows = Array.isArray(services.data) ? services.data : [];
  return {
    taxes: taxRules,
    services: serviceRows.flatMap((row) => {
      const service = asService(row as Record<string, unknown>);
      return service ? [service] : [];
    }),
  };
}
