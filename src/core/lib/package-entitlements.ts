/**
 * PRODUCT-RETIRE-14G — NORU package entitlement model (client-safe).
 *
 * PMS is the only commercial package in the operational registry.
 * Restaurant Management, Standalone POS and Back Office remain marketing
 * products only. Staff module/RBAC checks are separate.
 *
 * Missing-row compatibility (`packageCompatibilityDefault`) still applies to
 * PMS. NORU Core is not sellable and stays available to an active member.
 */
import type { ModuleKey } from "./module-access";

export const PACKAGE_KEYS = ["pms"] as const;

export type PackageKey = (typeof PACKAGE_KEYS)[number];

export const PACKAGE_LABELS: Record<PackageKey, string> = {
  pms: "PMS",
};

/**
 * Transitional documentation only — nothing reads this for enforcement.
 * Shared/Core modules are presented under PMS.
 */
export const PACKAGE_MODULE_MAP: Record<PackageKey, ModuleKey[]> = {
  pms: [
    "pms",
    "front_office",
    "housekeeping",
    "configuration",
    "property_settings",
    "reports_analytics",
    "accounting_finance",
    "inventory",
    "procurement",
    "human_resources",
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

/**
 * Canonical missing-row policy. PMS keeps historical compatibility (absent =
 * enabled).
 */
export function packageCompatibilityDefault(packageKey: PackageKey): boolean {
  return packageKey === "pms";
}

/** An explicit row counts as active when enabled and not past its expiry. */
export function isEntitlementActive(row: PackageEntitlementRow, now: Date = new Date()): boolean {
  if (!row.enabled) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

/** Resolve operational packages from whatever rows exist for a property. */
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
          enabled: packageCompatibilityDefault(key),
          source: "default_compatibility",
          expiresAt: null,
        };
  }
  return out;
}

export function packageFlags(states: Record<PackageKey, PackageState>): Record<PackageKey, boolean> {
  return { pms: states.pms.enabled };
}
