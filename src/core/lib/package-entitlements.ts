/**
 * Phase 8B1 — NORU four-package entitlement model (client-safe definitions).
 *
 * A property either has an explicit entitlement row for a package or it has
 * none. During compatibility mode (Phase 8B1) an ABSENT row resolves as
 * ENABLED, so introducing this layer cannot lock any existing tenant out.
 * Only an explicit row can report a package as off — and nothing enforces
 * that yet; enforcement lands in a later phase.
 *
 * NORU Core is not sellable and is always available to an active member.
 */
import type { ModuleKey } from "./module-access";

export const PACKAGE_KEYS = [
  "restaurant_management",
  "pms",
  "pos",
  "back_office",
] as const;

export type PackageKey = (typeof PACKAGE_KEYS)[number];

export const PACKAGE_LABELS: Record<PackageKey, string> = {
  restaurant_management: "Restaurant Management",
  pms: "PMS",
  pos: "Standalone POS",
  back_office: "Back Office",
};

/**
 * Transitional documentation only — nothing reads this for enforcement.
 * It records which package will eventually own each of today's module keys.
 * Some keys are shared today and appear under more than one package.
 */
export const PACKAGE_MODULE_MAP: Record<PackageKey, ModuleKey[]> = {
  restaurant_management: ["food_and_beverage", "pos"],
  pms: [
    "pms",
    "front_office",
    "housekeeping",
    "configuration",
    "property_settings",
    "reports_analytics",
    "accounting_finance",
  ],
  // The current `pos` module key stays bound to the restaurant till; the
  // Standalone POS package owns the `standalone_pos` module key (Phase 8H2).
  pos: ["standalone_pos"],
  back_office: [
    "human_resources",
    "inventory",
    "procurement",
    "accounting_finance",
    "reports_analytics",
  ],
};

export type EntitlementSource = "explicit" | "default_compatibility";

export interface PackageEntitlementRow {
  package_key: string;
  enabled: boolean;
  activated_at?: string | null;
  expires_at?: string | null;
}

export interface PackageState {
  packageKey: PackageKey;
  enabled: boolean;
  source: EntitlementSource;
  expiresAt: string | null;
}

/** An explicit row counts as active when enabled and not past its expiry. */
export function isEntitlementActive(row: PackageEntitlementRow, now: Date = new Date()): boolean {
  if (!row.enabled) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

/** Resolve all four packages from whatever rows exist for a property. */
export function resolvePackages(
  rows: PackageEntitlementRow[] = [],
  now: Date = new Date(),
): Record<PackageKey, PackageState> {
  const byKey = new Map(rows.map((r) => [r.package_key, r]));
  const out = {} as Record<PackageKey, PackageState>;
  for (const key of PACKAGE_KEYS) {
    const row = byKey.get(key);
    out[key] = row
      ? {
          packageKey: key,
          enabled: isEntitlementActive(row, now),
          source: "explicit",
          expiresAt: row.expires_at ?? null,
        }
      : {
          packageKey: key,
          // Compatibility mode: no row means the package stays available.
          enabled: true,
          source: "default_compatibility",
          expiresAt: null,
        };
  }
  return out;
}

export function packageFlags(states: Record<PackageKey, PackageState>): Record<PackageKey, boolean> {
  return {
    restaurant_management: states.restaurant_management.enabled,
    pms: states.pms.enabled,
    pos: states.pos.enabled,
    back_office: states.back_office.enabled,
  };
}
