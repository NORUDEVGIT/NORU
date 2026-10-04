/**
 * Travel Agency Type catalogue. Values live on pms_travel_agency_types (or fallback to defaults).
 * Settings is the source of truth for the Travel Agency creation dropdown.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { DEFAULT_TRAVEL_AGENCY_TYPES } from "./travel-agency-types-card4.server";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

export type TravelAgencyTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

type TravelAgencyTypeDbRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
};

function mapTravelAgencyType(row: TravelAgencyTypeDbRow): TravelAgencyTypeRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    active: row.active,
    sortOrder: row.sort_order,
  };
}

function fallbackDefaultRows(): TravelAgencyTypeRow[] {
  return DEFAULT_TRAVEL_AGENCY_TYPES.map((def, idx) => ({
    id: `default-ta-type-${def.code.toLowerCase()}`,
    code: def.code,
    name: def.name,
    description: def.description,
    active: true,
    sortOrder: def.sortOrder ?? (idx + 1) * 10,
  }));
}

async function fetchTravelAgencyTypes(
  restaurantId: string,
  supabase: { from: (table: string) => unknown },
): Promise<{ rows: TravelAgencyTypeRow[]; missingSchema: boolean }> {
  const result = await admin(supabase)
    .from("pms_travel_agency_types")
    .select("id, code, name, description, active, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
    .order("name");
  if (result.error && (isMissingSchemaError(result.error) || result.error.code === "42P01")) {
    return { rows: fallbackDefaultRows(), missingSchema: true };
  }
  if (result.error) throw new Error(result.error.message);
  return {
    rows: ((result.data ?? []) as TravelAgencyTypeDbRow[]).map(mapTravelAgencyType),
    missingSchema: false,
  };
}

async function ensureDefaultTravelAgencyTypes(
  restaurantId: string,
  supabase: { from: (table: string) => unknown },
  existing: TravelAgencyTypeRow[],
): Promise<TravelAgencyTypeRow[]> {
  if (existing.length > 0) return existing;
  const inserted = await admin(supabase)
    .from("pms_travel_agency_types")
    .insert(
      DEFAULT_TRAVEL_AGENCY_TYPES.map((row) => ({
        restaurant_id: restaurantId,
        code: row.code,
        name: row.name,
        description: row.description,
        active: true,
        sort_order: row.sortOrder,
      })),
    );
  if (inserted.error && inserted.error.code !== "23505") {
    return fallbackDefaultRows();
  }
  const next = await fetchTravelAgencyTypes(restaurantId, supabase);
  return next.rows.length > 0 ? next.rows : fallbackDefaultRows();
}

export async function loadTravelAgencyTypes(
  restaurantId: string,
  supabase: { from: (table: string) => unknown },
): Promise<TravelAgencyTypeRow[]> {
  const loaded = await fetchTravelAgencyTypes(restaurantId, supabase);
  if (loaded.missingSchema) return fallbackDefaultRows();
  return ensureDefaultTravelAgencyTypes(restaurantId, supabase, loaded.rows);
}

export const listTravelAgencyTypesForSelect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await loadTravelAgencyTypes(data.restaurantId, supabaseAdmin);
    return rows.filter((r) => r.active);
  });
