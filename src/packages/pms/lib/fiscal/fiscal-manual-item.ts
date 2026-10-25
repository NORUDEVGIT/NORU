/**
 * Amount-only manual charges have no catalogue service.
 * Fiscal registration assigns an item code, PCS, and quantity 1.
 * Charge posting does not call the provider.
 */
import {
  FISCAL_ITEM_UNIT,
  fiscalNatureOfSupplies,
  type FiscalNatureOfSupplies,
} from "./fiscal.types.ts";

export const MANUAL_NATURE_MIXED =
  "This invoice mixes goods and service lines. A manual charge cannot be given one Nature of supplies.";

export function manualChargeNature(
  anchored: readonly FiscalNatureOfSupplies[],
): FiscalNatureOfSupplies | "mixed" {
  const unique = [...new Set(anchored)];
  if (unique.length > 1) return "mixed";
  return unique[0] ?? "service";
}

/** Nature chosen when the manual charge was posted. Older charges have none. */
export function statedManualNature(
  value: string | null | undefined,
): FiscalNatureOfSupplies | null {
  if (!value) return null;
  return fiscalNatureOfSupplies(value.trim());
}

/**
 * A stored goods/service choice wins. Otherwise the line follows the other
 * mapped lines. A mixed invoice cannot invent one nature for an unstated line.
 */
export function manualIdentityNature(
  stated: string | null | undefined,
  fallback: FiscalNatureOfSupplies | "mixed",
): FiscalNatureOfSupplies | null {
  return statedManualNature(stated) ?? (fallback === "mixed" ? null : fallback);
}

export function manualNatureBlocksInvoice(
  groups: readonly {
    chargeSource: string | null;
    natureOfSupplies?: string | null;
    mapped: boolean;
  }[],
  fallback: FiscalNatureOfSupplies | "mixed",
): boolean {
  if (fallback !== "mixed") return false;
  return groups.some(
    (group) =>
      group.chargeSource === "manual" && !group.mapped && statedManualNature(group.natureOfSupplies) == null,
  );
}

export function manualFiscalMapping(itemCode: string, nature: FiscalNatureOfSupplies) {
  return {
    serviceTypeId: null,
    departmentId: null,
    chargeSource: "manual",
    isDefault: false,
    externalItemCode: itemCode,
    externalUnit: FISCAL_ITEM_UNIT,
    natureOfSupplies: nature,
    harmonizationCode: null,
    active: true,
  };
}

export function groupHasItemMapping(
  group: {
    serviceTypeId: string | null;
    departmentId: string | null;
    chargeSource: string | null;
  },
  mappings: readonly {
    active: boolean;
    serviceTypeId: string | null;
    departmentId: string | null;
    chargeSource: string | null;
    isDefault: boolean;
  }[],
): boolean {
  const active = mappings.filter((mapping) => mapping.active);
  if (
    group.serviceTypeId &&
    active.some((mapping) => mapping.serviceTypeId === group.serviceTypeId)
  ) {
    return true;
  }
  if (group.departmentId && active.some((mapping) => mapping.departmentId === group.departmentId)) {
    return true;
  }
  if (group.chargeSource && active.some((mapping) => mapping.chargeSource === group.chargeSource)) {
    return true;
  }
  return active.some((mapping) => mapping.isDefault);
}

export function anchoredNatures(
  values: readonly (string | null | undefined)[],
): FiscalNatureOfSupplies[] {
  return values
    .map((value) => (value ? fiscalNatureOfSupplies(value.trim()) : null))
    .filter((value): value is FiscalNatureOfSupplies => value != null);
}
