/**
 * Operating assets + equipment register — server-only helpers.
 *
 * Assets are never hard deleted. Every meaningful change is diffed here and
 * written to `restaurant_asset_history` by the calling server function.
 */

export const ASSET_TYPES = ["operating_asset", "equipment"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CONDITIONS = ["excellent", "good", "fair", "damaged"] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const ASSET_STATUSES = ["active", "under_maintenance", "out_of_service", "disposed"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_EVENTS = [
  "asset_created",
  "asset_updated",
  "condition_changed",
  "status_changed",
  "location_changed",
  "quantity_changed",
  "disposed",
] as const;
export type AssetEvent = (typeof ASSET_EVENTS)[number];

const MANAGE_ROLES = ["owner", "manager"] as const;
const VIEW_ROLES = ["owner", "manager", "kitchen"] as const;

/** Only owners and managers may create, edit, move, or dispose assets. */
export function canManageAssets(role: string): boolean {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}

/** Kitchen gets read-only visibility; waiters get nothing. */
export function canViewAssets(role: string): boolean {
  return (VIEW_ROLES as readonly string[]).includes(role);
}

export interface AssetRow {
  id: string;
  restaurant_id: string;
  asset_type: string;
  name: string;
  asset_code: string | null;
  quantity: number;
  condition: string;
  status: string;
  location: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  serial_number: string | null;
  warranty_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const ASSET_COLUMNS =
  "id, restaurant_id, asset_type, name, asset_code, quantity, condition, status, location, purchase_date, purchase_cost, serial_number, warranty_expiry, notes, created_at, updated_at";

/** An asset that must belong to this exact restaurant. */
export async function loadAsset(admin: any, restaurantId: string, assetId: string): Promise<AssetRow> {
  const { data } = await admin
    .from("restaurant_assets")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That asset could not be found.");
  return data as AssetRow;
}

/** Field -> history event. Anything else collapses to `asset_updated`. */
const FIELD_EVENT: Record<string, AssetEvent> = {
  condition: "condition_changed",
  status: "status_changed",
  location: "location_changed",
  quantity: "quantity_changed",
};

/**
 * Derive the history event for a patch. A single meaningful field change gets
 * its specific event; a mixed edit is recorded as a general update.
 */
export function eventForChanges(changed: string[]): AssetEvent {
  if (changed.length === 1) {
    const only = changed[0] as string;
    return FIELD_EVENT[only] ?? "asset_updated";
  }
  return "asset_updated";
}

/** Which of `patch`'s fields actually differ from the stored row. */
export function diffFields(row: Record<string, any>, patch: Record<string, any>) {
  const previous: Record<string, any> = {};
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    const current = key === "quantity" || key === "purchase_cost" ? numeric(row[key]) : row[key] ?? null;
    const candidate = key === "quantity" || key === "purchase_cost" ? numeric(value) : value ?? null;
    if (current !== candidate) {
      previous[key] = current;
      next[key] = candidate;
    }
  }
  return { previous, next, changed: Object.keys(next) };
}

function numeric(value: any): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export type WarrantyState = "none" | "valid" | "expiring" | "expired";

/**
 * Warranty state against the restaurant's local date (`YYYY-MM-DD` strings,
 * compared lexically so no timezone shifting happens here).
 */
export function warrantyState(expiry: string | null, today: string, soonDays = 30): WarrantyState {
  if (!expiry) return "none";
  if (expiry < today) return "expired";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + soonDays);
  return expiry <= soon.toISOString().slice(0, 10) ? "expiring" : "valid";
}
