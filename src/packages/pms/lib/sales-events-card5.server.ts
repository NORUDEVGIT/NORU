/**
 * Card 5 Phase 3 — Sales & Events setup (pure helpers).
 * Reuses SET6 catalogues. Venues stay on pms_outlets.
 */

import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD5_SALES_UNAVAILABLE =
  "Sales & Events setup is unavailable until migrations 0052 and 0079 are applied.";
export const CARD5_SALES_AUDIT_SECTION = "card5-sales-events";
export const CARD5_SALES_AUDIT = "pms_card5_sales_events_updated";

export const CARD5_SALES_CATALOGUES = [
  "market_segments",
  "source_codes",
  "lead_types",
  "event_types",
  "event_statuses",
  "function_spaces",
  "pipeline_stages",
  "package_templates",
  "contract_defaults",
] as const;
export type Card5SalesCatalogue = (typeof CARD5_SALES_CATALOGUES)[number];

export const CARD5_SALES_CATALOGUE_LABELS: Record<Card5SalesCatalogue, string> = {
  market_segments: "Market Segments",
  source_codes: "Sales Sources",
  lead_types: "Lead Types",
  event_types: "Event Types",
  event_statuses: "Event Statuses",
  function_spaces: "Function Spaces",
  pipeline_stages: "Sales Pipeline",
  package_templates: "Package Templates",
  contract_defaults: "Contract Defaults",
};

export const CARD5_PRICING_METHODS = ["per_person", "per_event", "hourly", "custom"] as const;
export type Card5PricingMethod = (typeof CARD5_PRICING_METHODS)[number];

export type Card5NamedOption = {
  id: string;
  name: string;
  active: boolean;
  code?: string;
};

export type Card5CurrencyOption = {
  code: string;
  name: string;
  active: boolean;
};

export type Card5SalesItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type Card5OrderedItem = Card5SalesItem & {
  sortOrder: number;
};

export type Card5PipelineStage = Card5OrderedItem & {
  isTerminal: boolean;
};

export type Card5FunctionSpace = Card5SalesItem & {
  outletIds: string[];
};

export type Card5PackageTemplate = {
  id: string;
  code: string;
  name: string;
  eventTypeId: string | null;
  pricingMethod: Card5PricingMethod;
  defaultPrice: number | null;
  currencyCode: string | null;
  taxGroupId: string | null;
  validFrom: string | null;
  validTo: string | null;
  outletIds: string[];
  serviceIds: string[];
  active: boolean;
};

export type Card5ContractDefault = {
  id: string;
  contractType: string;
  depositPolicyId: string | null;
  paymentTerms: string;
  cancellationPolicy: string;
  approvalRequired: boolean;
  defaultValidityDays: number | null;
  active: boolean;
};

export type Card5SalesSnapshot = {
  marketSegments: Card5SalesItem[];
  sourceCodes: Card5SalesItem[];
  leadTypes: Card5SalesItem[];
  eventTypes: Card5SalesItem[];
  eventStatuses: Card5OrderedItem[];
  functionSpaces: Card5FunctionSpace[];
  pipelineStages: Card5PipelineStage[];
  packageTemplates: Card5PackageTemplate[];
  contractDefaults: Card5ContractDefault[];
  facilities: Card5NamedOption[];
  services: Card5NamedOption[];
  taxGroups: Card5NamedOption[];
  currencies: Card5CurrencyOption[];
  depositPolicies: Card5NamedOption[];
};

export type Card5SalesReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

function uniqueCodes(
  rows: Array<{ code: string; name: string }>,
  label: string,
  blockers: string[],
) {
  const codes = new Map<string, number>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  for (const [code, count] of codes) {
    if (code && count > 1) blockers.push(`${label} code ${code} is used more than once.`);
  }
}

export function evaluateCard5SalesReadiness(snapshot: Card5SalesSnapshot): Card5SalesReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  uniqueCodes(snapshot.marketSegments, "Market segment", blockers);
  uniqueCodes(snapshot.sourceCodes, "Sales source", blockers);
  uniqueCodes(snapshot.leadTypes, "Lead type", blockers);
  uniqueCodes(snapshot.eventTypes, "Event type", blockers);
  uniqueCodes(snapshot.eventStatuses, "Event status", blockers);
  uniqueCodes(snapshot.functionSpaces, "Function space", blockers);
  uniqueCodes(snapshot.pipelineStages, "Pipeline stage", blockers);
  uniqueCodes(snapshot.packageTemplates, "Package template", blockers);

  const requireActive = (
    rows: Array<{ active: boolean; name: string; code: string }>,
    message: string,
  ) => {
    if (!rows.some((row) => row.active && row.code.trim() && row.name.trim()))
      blockers.push(message);
  };
  requireActive(snapshot.marketSegments, "Add at least one active market segment.");
  requireActive(snapshot.sourceCodes, "Add at least one active sales source.");
  requireActive(snapshot.leadTypes, "Add at least one active lead type.");
  requireActive(snapshot.eventTypes, "Add at least one active event type.");
  requireActive(snapshot.eventStatuses, "Add at least one active event status.");
  requireActive(snapshot.pipelineStages, "Add at least one active pipeline stage.");

  const pipelineSort = new Map<number, number>();
  for (const row of snapshot.pipelineStages.filter((item) => item.active)) {
    pipelineSort.set(row.sortOrder, (pipelineSort.get(row.sortOrder) ?? 0) + 1);
  }
  for (const [order, count] of pipelineSort) {
    if (count > 1) blockers.push(`Pipeline sort order ${order} is used more than once.`);
  }

  const mappedSpaces = snapshot.functionSpaces.filter(
    (row) =>
      row.active && row.outletIds.some((id) => snapshot.facilities.some((item) => item.id === id)),
  );
  if (mappedSpaces.length === 0) {
    blockers.push("Map at least one active function-space label to a Card 5 facility.");
  }
  for (const row of snapshot.functionSpaces) {
    for (const outletId of row.outletIds) {
      if (!snapshot.facilities.some((item) => item.id === outletId)) {
        blockers.push(`${row.name} references an unknown facility.`);
      }
    }
  }

  for (const row of snapshot.packageTemplates.filter((item) => item.active)) {
    const label = row.name || row.code || "A package template";
    if (!row.code.trim() || !row.name.trim()) blockers.push(`${label} needs a name and code.`);
    if (row.eventTypeId && !snapshot.eventTypes.some((item) => item.id === row.eventTypeId)) {
      blockers.push(`${label} references an unknown event type.`);
    }
    if (row.validFrom && row.validTo && row.validFrom > row.validTo) {
      blockers.push(`${label} has an invalid validity window.`);
    }
    if (row.taxGroupId && !snapshot.taxGroups.some((item) => item.id === row.taxGroupId)) {
      blockers.push(`${label} references an unknown tax group.`);
    }
    if (row.currencyCode && !snapshot.currencies.some((item) => item.code === row.currencyCode)) {
      blockers.push(`${label} references an unsupported currency.`);
    }
    for (const outletId of row.outletIds) {
      if (!snapshot.facilities.some((item) => item.id === outletId)) {
        blockers.push(`${label} includes an unknown facility.`);
      }
    }
    for (const serviceId of row.serviceIds) {
      if (!snapshot.services.some((item) => item.id === serviceId)) {
        blockers.push(`${label} includes an unknown service.`);
      }
    }
  }

  const types = new Map<string, number>();
  for (const row of snapshot.contractDefaults) {
    const key = row.contractType.trim().toLowerCase();
    types.set(key, (types.get(key) ?? 0) + 1);
  }
  for (const [type, count] of types) {
    if (type && count > 1) blockers.push(`Contract type ${type} is used more than once.`);
  }
  for (const row of snapshot.contractDefaults.filter((item) => item.active)) {
    if (!row.contractType.trim()) blockers.push("A contract default needs a contract type.");
    if (
      row.depositPolicyId &&
      !snapshot.depositPolicies.some((item) => item.id === row.depositPolicyId)
    ) {
      blockers.push(`${row.contractType} references an unknown deposit policy.`);
    }
  }

  if (!snapshot.packageTemplates.some((row) => row.active)) {
    warnings.push("No active event package templates yet.");
  }
  if (!snapshot.contractDefaults.some((row) => row.active)) {
    warnings.push("No active contract defaults yet.");
  }

  const unique = [...new Set(blockers)];
  const started =
    snapshot.marketSegments.length +
      snapshot.sourceCodes.length +
      snapshot.leadTypes.length +
      snapshot.eventTypes.length +
      snapshot.functionSpaces.length +
      snapshot.packageTemplates.length +
      snapshot.contractDefaults.length >
    0;
  return {
    ready: unique.length === 0,
    status: unique.length === 0 ? "complete" : started ? "in_progress" : "not_started",
    blockers: unique,
    warnings: [...new Set(warnings)],
  };
}

export function emptySalesItem(partial?: Partial<Card5SalesItem>): Card5SalesItem {
  return {
    id: partial?.id ?? "",
    code: partial?.code ?? "",
    name: partial?.name ?? "",
    description: partial?.description ?? "",
    active: partial?.active !== false,
  };
}

export function emptyFunctionSpace(partial?: Partial<Card5FunctionSpace>): Card5FunctionSpace {
  return { ...emptySalesItem(partial), outletIds: partial?.outletIds ?? [] };
}

export function emptyOrderedItem(partial?: Partial<Card5OrderedItem>): Card5OrderedItem {
  return { ...emptySalesItem(partial), sortOrder: partial?.sortOrder ?? 0 };
}

export function emptyPipelineStage(partial?: Partial<Card5PipelineStage>): Card5PipelineStage {
  return { ...emptyOrderedItem(partial), isTerminal: partial?.isTerminal === true };
}

export function emptyPackageTemplate(
  partial?: Partial<Card5PackageTemplate>,
): Card5PackageTemplate {
  return {
    id: partial?.id ?? "",
    code: partial?.code ?? "",
    name: partial?.name ?? "",
    eventTypeId: partial?.eventTypeId ?? null,
    pricingMethod: partial?.pricingMethod ?? "per_event",
    defaultPrice: partial?.defaultPrice ?? null,
    currencyCode: partial?.currencyCode ?? null,
    taxGroupId: partial?.taxGroupId ?? null,
    validFrom: partial?.validFrom ?? null,
    validTo: partial?.validTo ?? null,
    outletIds: partial?.outletIds ?? [],
    serviceIds: partial?.serviceIds ?? [],
    active: partial?.active !== false,
  };
}

export function emptyContractDefault(
  partial?: Partial<Card5ContractDefault>,
): Card5ContractDefault {
  return {
    id: partial?.id ?? "",
    contractType: partial?.contractType ?? "",
    depositPolicyId: partial?.depositPolicyId ?? null,
    paymentTerms: partial?.paymentTerms ?? "",
    cancellationPolicy: partial?.cancellationPolicy ?? "",
    approvalRequired: partial?.approvalRequired === true,
    defaultValidityDays: partial?.defaultValidityDays ?? null,
    active: partial?.active !== false,
  };
}

export function emptySalesSnapshot(): Card5SalesSnapshot {
  return {
    marketSegments: [],
    sourceCodes: [],
    leadTypes: [],
    eventTypes: [],
    eventStatuses: [],
    functionSpaces: [],
    pipelineStages: [],
    packageTemplates: [],
    contractDefaults: [],
    facilities: [],
    services: [],
    taxGroups: [],
    currencies: [],
    depositPolicies: [],
  };
}
