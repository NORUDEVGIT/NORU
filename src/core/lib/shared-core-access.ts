/**
 * PRODUCT-RETIRE-04 — retained shared/Core hotel services.
 *
 * These modules stay available to a PMS-enabled property. Staff module/RBAC
 * checks remain separate and are never replaced by package entitlement.
 */
import type { ModuleKey } from "./module-access";
import type { PackageKey } from "./package-entitlements";

export const SHARED_CORE_MODULES = [
  "inventory",
  "procurement",
  "human_resources",
  "accounting_finance",
  "reports_analytics",
] as const satisfies readonly ModuleKey[];

export type SharedCoreModule = (typeof SHARED_CORE_MODULES)[number];

export function isSharedCoreModule(moduleKey: ModuleKey): moduleKey is SharedCoreModule {
  return (SHARED_CORE_MODULES as readonly ModuleKey[]).includes(moduleKey);
}

/** Presentation owner for retained shared/Core module links. */
export function sharedCoreOwningPackage(moduleKey: ModuleKey): PackageKey | null {
  return isSharedCoreModule(moduleKey) ? "pms" : null;
}

/**
 * Link visibility: module permission AND the owning commercial package.
 * Does not grant access; server functions keep their own RBAC gates.
 */
export function sharedCoreLinkVisible(
  moduleKey: ModuleKey,
  allowedModules: readonly string[],
  hasPackage: (key: PackageKey) => boolean,
): boolean {
  if (!allowedModules.includes(moduleKey)) return false;
  const owner = sharedCoreOwningPackage(moduleKey);
  return owner ? hasPackage(owner) : false;
}

/**
 * Stock-write commercial gate. Shared hotel inventory is a PMS/Core service.
 * Standalone POS never authorized inventory; retired RMS / Back Office keys
 * are no longer part of the operational package model.
 */
export function inventoryWritePackageAllowed(flags: { pms: boolean }): boolean {
  return flags.pms;
}
