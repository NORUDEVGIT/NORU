/**
 * Card 7 Phase 4 — Data Import & Migration setup (pure helpers).
 * Governance only: no parser, runner, queue, or auto-merge.
 */
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD7_IMPORT_UNAVAILABLE =
  "Data Import setup is unavailable until migration 0088 is applied.";
export const CARD7_IMPORT_SETUP_ONLY =
  "Import setup is configuration only. Card 7 does not parse files or write domain rows.";
export const CARD7_IMPORT_NO_RUNNER =
  "Migration history records jobs if they exist. This tab does not run or queue imports.";
export const CARD7_IMPORT_NO_MERGE =
  "Duplicate policy may warn, skip or block. Guest merge stays in the guest module.";
export const CARD7_IMPORT_AUDIT_SECTION = "card7-import";
export const CARD7_IMPORT_POLICY_AUDIT = "pms_card7_import_policy_updated";
export const CARD7_IMPORT_TYPES_AUDIT = "pms_card7_import_types_updated";
export const CARD7_IMPORT_TEMPLATES_AUDIT = "pms_card7_import_templates_updated";
export const CARD7_IMPORT_VALIDATION_AUDIT = "pms_card7_import_validation_updated";
export const CARD7_IMPORT_DUPLICATES_AUDIT = "pms_card7_import_duplicates_updated";

export const CARD7_SUPPORTED_IMPORT_CODES = [
  "guest",
  "room",
  "room_type",
  "rate_category",
  "rate_plan",
] as const;
export type Card7SupportedImportCode = (typeof CARD7_SUPPORTED_IMPORT_CODES)[number];

export const CARD7_IMPORT_HANDLER_KEYS = [
  "createGuest",
  "saveRoom",
  "saveRoomType",
  "saveRateCategory",
  "saveRatePlan",
] as const;
export type Card7ImportHandlerKey = (typeof CARD7_IMPORT_HANDLER_KEYS)[number];

export const CARD7_IMPORT_VALUE_KINDS = [
  "text",
  "integer",
  "amount",
  "boolean",
  "date",
  "code",
] as const;
export type Card7ImportValueKind = (typeof CARD7_IMPORT_VALUE_KINDS)[number];

export const CARD7_IMPORT_RULE_KINDS = ["required", "format", "referential"] as const;
export type Card7ImportRuleKind = (typeof CARD7_IMPORT_RULE_KINDS)[number];

export const CARD7_IMPORT_DUPLICATE_ACTIONS = ["warn", "skip", "block"] as const;
export type Card7ImportDuplicateAction = (typeof CARD7_IMPORT_DUPLICATE_ACTIONS)[number];

export const CARD7_IMPORT_JOB_STATUSES = [
  "configured",
  "previewed",
  "imported",
  "failed",
] as const;
export type Card7ImportJobStatus = (typeof CARD7_IMPORT_JOB_STATUSES)[number];

export type Card7ImportType = {
  id: string;
  code: string;
  name: string;
  description: string;
  handlerKey: string;
  active: boolean;
};

export type Card7ImportTypeSetting = {
  id: string;
  importTypeId: string;
  enabled: boolean;
};

export type Card7ImportFieldDefinition = {
  id: string;
  importTypeId: string;
  code: string;
  name: string;
  required: boolean;
  valueKind: Card7ImportValueKind;
  active: boolean;
};

export type Card7ImportMappingField = {
  id: string;
  templateId: string;
  fieldDefinitionId: string;
  sourceColumn: string;
};

export type Card7ImportMappingTemplate = {
  id: string;
  importTypeId: string;
  name: string;
  active: boolean;
  fields: Card7ImportMappingField[];
};

export type Card7ImportValidationRule = {
  id: string;
  importTypeId: string;
  fieldCode: string;
  ruleKind: Card7ImportRuleKind;
  enabled: boolean;
};

export type Card7ImportDuplicatePolicy = {
  id: string;
  importTypeId: string;
  matchKeys: string;
  action: Card7ImportDuplicateAction;
};

export type Card7ImportPolicy = {
  exists: boolean;
  enabled: boolean;
  previewRequired: boolean;
  maxRows: number;
  allowedFormat: "csv";
  ownerManagerExecuteOnly: boolean;
  active: boolean;
};

export type Card7ImportJob = {
  id: string;
  importTypeId: string;
  status: Card7ImportJobStatus;
  originalFilename: string | null;
  rowCount: number | null;
  notes: string | null;
  createdAt: string;
};

export type Card7ImportJobIssue = {
  id: string;
  jobId: string;
  severity: "error" | "warning";
  rowNumber: number | null;
  code: string;
  message: string;
};

export type Card7ImportSnapshot = {
  types: Card7ImportType[];
  typeSettings: Card7ImportTypeSetting[];
  fields: Card7ImportFieldDefinition[];
  templates: Card7ImportMappingTemplate[];
  validationRules: Card7ImportValidationRule[];
  duplicatePolicies: Card7ImportDuplicatePolicy[];
  policy: Card7ImportPolicy;
  jobs: Card7ImportJob[];
  jobIssues: Card7ImportJobIssue[];
  historyAvailable: boolean;
};

export type Card7ImportReadiness = {
  ready: boolean;
  status: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export function parseImportValueKind(value: unknown): Card7ImportValueKind {
  return (CARD7_IMPORT_VALUE_KINDS as readonly string[]).includes(String(value))
    ? (value as Card7ImportValueKind)
    : "text";
}

export function parseImportRuleKind(value: unknown): Card7ImportRuleKind {
  return (CARD7_IMPORT_RULE_KINDS as readonly string[]).includes(String(value))
    ? (value as Card7ImportRuleKind)
    : "required";
}

export function parseImportDuplicateAction(value: unknown): Card7ImportDuplicateAction {
  return (CARD7_IMPORT_DUPLICATE_ACTIONS as readonly string[]).includes(String(value))
    ? (value as Card7ImportDuplicateAction)
    : "warn";
}

export function parseImportJobStatus(value: unknown): Card7ImportJobStatus {
  return (CARD7_IMPORT_JOB_STATUSES as readonly string[]).includes(String(value))
    ? (value as Card7ImportJobStatus)
    : "configured";
}

export function emptyImportPolicy(partial?: Partial<Card7ImportPolicy>): Card7ImportPolicy {
  return {
    exists: partial?.exists === true,
    enabled: partial?.enabled === true,
    previewRequired: partial?.previewRequired !== false,
    maxRows: partial?.maxRows ?? 500,
    allowedFormat: "csv",
    ownerManagerExecuteOnly: partial?.ownerManagerExecuteOnly !== false,
    active: partial?.active !== false,
  };
}

export function emptyImportSnapshot(
  partial?: Partial<Card7ImportSnapshot>,
): Card7ImportSnapshot {
  return {
    types: partial?.types ?? [],
    typeSettings: partial?.typeSettings ?? [],
    fields: partial?.fields ?? [],
    templates: partial?.templates ?? [],
    validationRules: partial?.validationRules ?? [],
    duplicatePolicies: partial?.duplicatePolicies ?? [],
    policy: partial?.policy ?? emptyImportPolicy(),
    jobs: partial?.jobs ?? [],
    jobIssues: partial?.jobIssues ?? [],
    historyAvailable: partial?.historyAvailable === true,
  };
}

export function supportedImportTypes(snapshot: Card7ImportSnapshot): Card7ImportType[] {
  const allowed = new Set<string>(CARD7_SUPPORTED_IMPORT_CODES);
  return snapshot.types.filter(
    (row) =>
      row.active &&
      allowed.has(row.code) &&
      (CARD7_IMPORT_HANDLER_KEYS as readonly string[]).includes(row.handlerKey),
  );
}

export function importTypeSettingFor(
  snapshot: Card7ImportSnapshot,
  importTypeId: string,
): Card7ImportTypeSetting | null {
  return snapshot.typeSettings.find((row) => row.importTypeId === importTypeId) ?? null;
}

export function importWorkStarted(snapshot: Card7ImportSnapshot): boolean {
  return (
    snapshot.policy.exists ||
    snapshot.typeSettings.length > 0 ||
    snapshot.templates.length > 0 ||
    snapshot.validationRules.length > 0 ||
    snapshot.duplicatePolicies.length > 0
  );
}

export function importPolicyValid(policy: Card7ImportPolicy): boolean {
  if (!policy.exists) return false;
  if (!policy.enabled) return false;
  if (!Number.isInteger(policy.maxRows) || policy.maxRows < 1 || policy.maxRows > 10000) {
    return false;
  }
  return policy.allowedFormat === "csv";
}

export function evaluateCard7ImportReadiness(
  snapshot: Card7ImportSnapshot,
): Card7ImportReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [
    CARD7_IMPORT_SETUP_ONLY,
    CARD7_IMPORT_NO_RUNNER,
    CARD7_IMPORT_NO_MERGE,
  ];
  const types = supportedImportTypes(snapshot);
  const settingByType = new Map(snapshot.typeSettings.map((row) => [row.importTypeId, row]));
  const fieldsByType = new Map<string, Card7ImportFieldDefinition[]>();
  for (const field of snapshot.fields.filter((row) => row.active)) {
    const list = fieldsByType.get(field.importTypeId) ?? [];
    list.push(field);
    fieldsByType.set(field.importTypeId, list);
  }

  if (types.length === 0) {
    blockers.push("Supported import types are missing until 0088 is applied.");
  }

  if (!importPolicyValid(snapshot.policy)) {
    blockers.push("Save and enable a CSV import policy with a valid max-row limit.");
  }

  const enabledTypes = types.filter((row) => settingByType.get(row.id)?.enabled === true);
  if (enabledTypes.length === 0) {
    blockers.push("Enable at least one supported import type.");
  }

  for (const type of enabledTypes) {
    const templates = snapshot.templates.filter(
      (row) => row.importTypeId === type.id && row.active,
    );
    if (templates.length === 0) {
      blockers.push(`Add an active mapping template for ${type.code}.`);
    } else {
      const allowedFieldIds = new Set(
        (fieldsByType.get(type.id) ?? []).map((field) => field.id),
      );
      const requiredCodes = (fieldsByType.get(type.id) ?? [])
        .filter((field) => field.required)
        .map((field) => field.code);
      const mappedIds = new Set(
        templates.flatMap((template) => template.fields.map((field) => field.fieldDefinitionId)),
      );
      if (templates.some((template) => template.fields.length === 0)) {
        blockers.push(`Map at least one approved field on a ${type.code} template.`);
      }
      if (templates.some((template) => template.fields.some((field) => !allowedFieldIds.has(field.fieldDefinitionId)))) {
        blockers.push(`${type.code} mapping must use approved Noru fields only.`);
      }
      for (const code of requiredCodes) {
        const field = (fieldsByType.get(type.id) ?? []).find((row) => row.code === code);
        if (field && !mappedIds.has(field.id)) {
          blockers.push(`Map required field ${type.code}.${code}.`);
        }
      }
    }

    const rules = snapshot.validationRules.filter((row) => row.importTypeId === type.id);
    if (rules.length === 0) {
      blockers.push(`Configure validation rules for ${type.code}.`);
    } else if (
      rules.some(
        (row) => !(CARD7_IMPORT_RULE_KINDS as readonly string[]).includes(row.ruleKind),
      )
    ) {
      blockers.push(`${type.code} has an unsupported validation rule.`);
    }

    const duplicate = snapshot.duplicatePolicies.find((row) => row.importTypeId === type.id);
    if (!duplicate) {
      blockers.push(`Configure duplicate policy for ${type.code}.`);
    } else if (
      !(CARD7_IMPORT_DUPLICATE_ACTIONS as readonly string[]).includes(duplicate.action)
    ) {
      blockers.push(`${type.code} duplicate action must be warn, skip or block.`);
    } else if (!duplicate.matchKeys.trim()) {
      blockers.push(`${type.code} duplicate match keys are required.`);
    }
  }

  if (!snapshot.historyAvailable) {
    blockers.push("Migration history tables are unavailable.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  return {
    ready: uniqueBlockers.length === 0,
    status:
      uniqueBlockers.length === 0
        ? "complete"
        : importWorkStarted(snapshot)
          ? "in_progress"
          : "not_started",
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
}
