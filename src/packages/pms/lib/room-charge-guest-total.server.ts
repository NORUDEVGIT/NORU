import type {
  RoomChargeRules,
  RoomChargeServiceRule,
  RoomChargeTaxRule,
  ServiceChargeRules,
} from "./room-charge-guest-total.ts";

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

function appliesToPackageCharge(row: { applicability_scope?: unknown; basis?: unknown }) {
  const scope = row.applicability_scope == null ? "" : String(row.applicability_scope);
  if (scope === "all" || scope === "packages") return true;
  if (scope) return false;
  const basis = row.basis == null ? "" : String(row.basis);
  return basis === "all";
}

function asTax(
  row: Record<string, unknown>,
  applies: (row: { applicability_scope?: unknown; basis?: unknown }) => boolean = appliesToRoomCharge,
): RoomChargeTaxRule | null {
  if (!applies(row)) return null;
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

function asService(
  row: Record<string, unknown>,
  applies: (row: { applicability_scope?: unknown; basis?: unknown }) => boolean = appliesToRoomCharge,
): RoomChargeServiceRule | null {
  if (!applies(row)) return null;
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

function serviceScope(row: { applicability_scope?: unknown }): string {
  return row.applicability_scope == null ? "" : String(row.applicability_scope);
}

function appliesToServiceCharge(row: { applicability_scope?: unknown }) {
  const scope = serviceScope(row);
  return scope === "all" || scope === "services" || scope === "folio";
}

async function departmentTargets(
  db: RoomChargeRuleDb,
  table: string,
  idColumn: string,
  restaurantId: string,
): Promise<Map<string, string[]>> {
  const result = await db.from(table).select(`${idColumn}, department_id`).eq("restaurant_id", restaurantId);
  const byRule = new Map<string, string[]>();
  if (result.error || !Array.isArray(result.data)) return byRule;
  for (const row of result.data as Array<Record<string, unknown>>) {
    const ruleId = String(row[idColumn] ?? "");
    const departmentId = String(row.department_id ?? "");
    if (!ruleId || !departmentId) continue;
    byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), departmentId]);
  }
  return byRule;
}

/**
 * Taxes and service charges post_folio_service_charge applies (source 'service').
 * Department-scoped rules apply only to services billed to a targeted department.
 */
export async function loadServiceChargeRules(
  db: RoomChargeRuleDb,
  restaurantId: string,
): Promise<ServiceChargeRules> {
  const empty: ServiceChargeRules = { ...EMPTY_RULES, departmentTaxes: {}, departmentServices: {} };
  const taxes = await db
    .from("pms_taxes")
    .select("id, code, name, charge_type, amount, applicability_scope, calculation, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (taxes.error) return empty;

  const rules: ServiceChargeRules = { taxes: [], services: [], departmentTaxes: {}, departmentServices: {} };
  const taxRows = (Array.isArray(taxes.data) ? taxes.data : []) as Array<Record<string, unknown>>;
  const taxTargets = taxRows.some((row) => serviceScope(row) === "departments")
    ? await departmentTargets(db, "pms_tax_department_targets", "tax_id", restaurantId)
    : new Map<string, string[]>();
  for (const row of taxRows) {
    if (serviceScope(row) === "departments") {
      const tax = asTax(row, () => true);
      if (!tax) continue;
      for (const departmentId of taxTargets.get(String(row.id ?? "")) ?? []) {
        rules.departmentTaxes[departmentId] = [...(rules.departmentTaxes[departmentId] ?? []), tax];
      }
      continue;
    }
    const tax = asTax(row, appliesToServiceCharge);
    if (tax) rules.taxes.push(tax);
  }

  const services = await db
    .from("pms_service_charges")
    .select("id, code, name, charge_type, amount, applicability_scope, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (services.error) return rules;
  const serviceRows = (Array.isArray(services.data) ? services.data : []) as Array<Record<string, unknown>>;
  const serviceTargets = serviceRows.some((row) => serviceScope(row) === "departments")
    ? await departmentTargets(db, "pms_service_charge_department_targets", "service_charge_id", restaurantId)
    : new Map<string, string[]>();
  for (const row of serviceRows) {
    if (serviceScope(row) === "departments") {
      const service = asService(row, () => true);
      if (!service) continue;
      for (const departmentId of serviceTargets.get(String(row.id ?? "")) ?? []) {
        rules.departmentServices[departmentId] = [
          ...(rules.departmentServices[departmentId] ?? []),
          service,
        ];
      }
      continue;
    }
    const service = asService(row, appliesToServiceCharge);
    if (service) rules.services.push(service);
  }
  return rules;
}

/** Package taxes are not limited by the default room tax group. */
export async function loadPackageChargeRules(
  db: RoomChargeRuleDb,
  restaurantId: string,
): Promise<RoomChargeRules> {
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

  const taxRows = Array.isArray(taxes.data) ? taxes.data : [];
  const taxRules = taxRows.flatMap((row) => {
    const tax = asTax(row as Record<string, unknown>, appliesToPackageCharge);
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
      const service = asService(row as Record<string, unknown>, appliesToPackageCharge);
      return service ? [service] : [];
    }),
  };
}
