/**
 * PMS-SET4 — Housekeeping rules · Room inventory rules · Maintenance rules (Issue #74).
 *
 * Abel-approved 2026-09-14 locks:
 * - HK workspace is LIVE at /restaurant/pms/housekeeping. No second board.
 * - HK status Complete when saved (min dirty · clean · inspected). Pickup optional.
 * - Room inventory rules OOO/OOS Complete when saved. NOT warehouse.
 *   Deep-link /restaurant/pms/room-inventory.
 * - Maintenance categories / priorities / SLA / type tags = Warning, never an
 *   Activate Incomplete on their own. No CMMS. Deep-link /restaurant/pms/maintenance.
 * - Single expanding Activate on pms_set1_live. Optional catalogues Warning.
 * - 0050 tables/columns are additive and may be absent — never crash.
 */

import type { Set1DomainReport, Set1Readiness } from "./pms-set1-foundation.ts";

export const SET4_HK_HREF = "/restaurant/pms/housekeeping";
export const SET4_RI_HREF = "/restaurant/pms/room-inventory";
export const SET4_MAINT_HREF = "/restaurant/pms/maintenance";
export const SET4_STOCK_HELPER_HREF = "/restaurant/inventory";

export const SET4_HK_UNAVAILABLE = "Unavailable — housekeeping rule columns are not applied yet.";
export const SET4_RI_UNAVAILABLE = "Unavailable — room inventory rule columns are not applied yet.";
export const SET4_MAINT_UNAVAILABLE = "Unavailable — maintenance catalogues are not applied yet.";
export const SET4_HK_UNSAVED = "Housekeeping statuses are a draft until you save. Dirty, clean and inspected must stay active.";
export const SET4_OOO_UNSAVED = "OOO and OOS meaning is a draft until you save.";
export const SET4_CLEANING_WARNING = "No cleaning types in the posture yet. This is a warning, not a block.";
export const SET4_REASONS_WARNING = "No restriction reasons in the catalogue yet. This is a warning, not a block.";
export const SET4_CATEGORIES_WARNING = "No maintenance categories in the catalogue yet. This is a warning, not a block.";
export const SET4_PRIORITIES_WARNING = "No maintenance priorities in the catalogue yet. This is a warning, not a block.";
export const SET4_TAGS_WARNING = "No maintenance type tags in the catalogue yet. This is a warning, not a block.";
export const SET4_SLA_WARNING = "No acknowledge or resolve guidance saved yet. This is a warning, not a block.";

export const SET4_AUDIT_HK_STATUS = "pms_set4_hk_status_updated";
export const SET4_AUDIT_HK_CLEANING = "pms_set4_hk_cleaning_updated";
export const SET4_AUDIT_OOO_OOS = "pms_set4_ooo_oos_updated";
export const SET4_AUDIT_REASON = "pms_set4_restriction_reason_updated";
export const SET4_AUDIT_CATEGORY = "pms_set4_maintenance_category_updated";
export const SET4_AUDIT_PRIORITY = "pms_set4_maintenance_priority_updated";
export const SET4_AUDIT_TYPE_TAG = "pms_set4_maintenance_tag_updated";
export const SET4_AUDIT_SLA = "pms_set4_maintenance_sla_updated";
export const SET4_AUDIT_ACTIONS = [
  SET4_AUDIT_HK_STATUS,
  SET4_AUDIT_HK_CLEANING,
  SET4_AUDIT_OOO_OOS,
  SET4_AUDIT_REASON,
  SET4_AUDIT_CATEGORY,
  SET4_AUDIT_PRIORITY,
  SET4_AUDIT_TYPE_TAG,
  SET4_AUDIT_SLA,
] as const;

export const HK_STATUS_CODES = ["dirty", "clean", "inspected", "pickup"] as const;
export type HkStatusCode = (typeof HK_STATUS_CODES)[number];
export const HK_STATUS_REQUIRED = ["dirty", "clean", "inspected"] as const;

export const HK_STATUS_LABELS: Record<HkStatusCode, string> = {
  dirty: "Dirty",
  clean: "Clean",
  inspected: "Inspected",
  pickup: "Pick-up",
};

export const HK_CLEANING_TYPES = [
  "departure_cleaning",
  "stayover_cleaning",
  "touch_up",
  "deep_cleaning",
  "re_clean",
  "turn_down",
] as const;
export type HkCleaningType = (typeof HK_CLEANING_TYPES)[number];

export const HK_CLEANING_TYPE_LABELS: Record<HkCleaningType, string> = {
  departure_cleaning: "Departure cleaning",
  stayover_cleaning: "Stayover cleaning",
  touch_up: "Touch-up",
  deep_cleaning: "Deep cleaning",
  re_clean: "Re-clean",
  turn_down: "Turn-down",
};

export const HK_PRIORITIES = ["normal", "high", "urgent"] as const;
export type HkPriorityCode = (typeof HK_PRIORITIES)[number];

export const HK_PRIORITY_LABELS: Record<HkPriorityCode, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const MAINTENANCE_BASELINE_CATEGORIES = [
  { code: "plumbing", name: "Plumbing" },
  { code: "electrical", name: "Electrical" },
  { code: "furniture", name: "Furniture" },
  { code: "equipment", name: "Equipment" },
  { code: "other", name: "Other" },
] as const;

export const MAINTENANCE_TYPE_TAGS = ["preventive", "corrective", "emergency", "inspection"] as const;
export type MaintenanceTypeTag = (typeof MAINTENANCE_TYPE_TAGS)[number];

export const MAINTENANCE_TYPE_TAG_LABELS: Record<MaintenanceTypeTag, string> = {
  preventive: "Preventive",
  corrective: "Corrective",
  emergency: "Emergency",
  inspection: "Inspection",
};

export type HkStatusRule = {
  code: HkStatusCode;
  label: string;
  active: boolean;
};

export type HkStatusRules = {
  statuses: HkStatusRule[];
  savedAt: string | null;
};

export type HkCleaningTypeRule = {
  code: HkCleaningType;
  label: string;
  active: boolean;
};

export type HkPriorityRule = {
  code: HkPriorityCode;
  label: string;
  active: boolean;
};

export type HkServiceTiming = {
  morningFrom: string;
  morningTo: string;
  eveningFrom: string;
  eveningTo: string;
};

export type HkCleaningPosture = {
  types: HkCleaningTypeRule[];
  priorities: HkPriorityRule[];
  inspectionGate: boolean;
  serviceTiming: HkServiceTiming;
  savedAt: string | null;
};

export type OooOosPosture = {
  oooMeaning: string;
  oosMeaning: string;
  reasonRequired: boolean;
  expectedReturnRequired: boolean;
  savedAt: string | null;
};

export type MaintenanceSla = {
  acknowledgeHours: number | null;
  resolveHours: number | null;
  guidance: string;
  savedAt: string | null;
};

export type PmsSet4CatalogueItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Set4ActivateInput = {
  hkColumnsAvailable: boolean;
  hkStatusesSaved: boolean;
  hkMinComplete: boolean;
  cleaningAvailable: boolean;
  cleaningTypeCount: number;
  oooOosAvailable: boolean;
  oooOosSaved: boolean;
  restrictionReasonsAvailable: boolean;
  restrictionReasonCount: number;
  maintenanceAvailable: boolean;
  maintenanceCategoryCount: number;
  maintenancePriorityCount: number;
  maintenanceTypeTagCount: number;
  maintenanceSlaSaved: boolean;
};

export type Set4Snapshot = {
  hkColumnsAvailable: boolean;
  oooOosAvailable: boolean;
  cataloguesAvailable: boolean;
  statusRules: HkStatusRules;
  cleaningPosture: HkCleaningPosture;
  oooOosPosture: OooOosPosture;
  restrictionReasons: PmsSet4CatalogueItem[];
  maintenanceCategories: PmsSet4CatalogueItem[];
  maintenancePriorities: PmsSet4CatalogueItem[];
  maintenanceTypeTags: PmsSet4CatalogueItem[];
  maintenanceSla: MaintenanceSla;
};

export function emptyHkStatusRules(partial?: Partial<HkStatusRules>): HkStatusRules {
  return {
    savedAt: partial?.savedAt ?? null,
    statuses:
      partial?.statuses ??
      HK_STATUS_CODES.map((code) => ({
        code,
        label: HK_STATUS_LABELS[code],
        active: code !== "pickup" ? true : true,
      })),
  };
}

export function emptyHkCleaningPosture(partial?: Partial<HkCleaningPosture>): HkCleaningPosture {
  return {
    inspectionGate: partial?.inspectionGate ?? true,
    savedAt: partial?.savedAt ?? null,
    types:
      partial?.types ??
      HK_CLEANING_TYPES.map((code) => ({
        code,
        label: HK_CLEANING_TYPE_LABELS[code],
        active: code !== "turn_down",
      })),
    priorities:
      partial?.priorities ??
      HK_PRIORITIES.map((code) => ({
        code,
        label: HK_PRIORITY_LABELS[code],
        active: true,
      })),
    serviceTiming: {
      morningFrom: partial?.serviceTiming?.morningFrom ?? "",
      morningTo: partial?.serviceTiming?.morningTo ?? "",
      eveningFrom: partial?.serviceTiming?.eveningFrom ?? "",
      eveningTo: partial?.serviceTiming?.eveningTo ?? "",
    },
  };
}

export function emptyOooOosPosture(partial?: Partial<OooOosPosture>): OooOosPosture {
  return {
    oooMeaning: partial?.oooMeaning ?? "Out of order — the room cannot be sold while a physical defect is being repaired.",
    oosMeaning: partial?.oosMeaning ?? "Out of service — the room cannot be sold while it is held for an operational reason.",
    reasonRequired: partial?.reasonRequired ?? true,
    expectedReturnRequired: partial?.expectedReturnRequired ?? false,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyMaintenanceSla(partial?: Partial<MaintenanceSla>): MaintenanceSla {
  return {
    acknowledgeHours: partial?.acknowledgeHours ?? null,
    resolveHours: partial?.resolveHours ?? null,
    guidance: partial?.guidance ?? "",
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptySet4Activate(partial?: Partial<Set4ActivateInput>): Set4ActivateInput {
  return {
    hkColumnsAvailable: false,
    hkStatusesSaved: false,
    hkMinComplete: false,
    cleaningAvailable: false,
    cleaningTypeCount: 0,
    oooOosAvailable: false,
    oooOosSaved: false,
    restrictionReasonsAvailable: false,
    restrictionReasonCount: 0,
    maintenanceAvailable: false,
    maintenanceCategoryCount: 0,
    maintenancePriorityCount: 0,
    maintenanceTypeTagCount: 0,
    maintenanceSlaSaved: false,
    ...partial,
  };
}

export function completeSet4Activate(partial?: Partial<Set4ActivateInput>): Set4ActivateInput {
  return emptySet4Activate({
    hkColumnsAvailable: true,
    hkStatusesSaved: true,
    hkMinComplete: true,
    cleaningAvailable: true,
    cleaningTypeCount: 5,
    oooOosAvailable: true,
    oooOosSaved: true,
    restrictionReasonsAvailable: true,
    restrictionReasonCount: 1,
    maintenanceAvailable: true,
    maintenanceCategoryCount: 5,
    maintenancePriorityCount: 3,
    maintenanceTypeTagCount: 4,
    maintenanceSlaSaved: true,
    ...partial,
  });
}

export function emptySet4Snapshot(partial?: Partial<Set4Snapshot>): Set4Snapshot {
  return {
    hkColumnsAvailable: false,
    oooOosAvailable: false,
    cataloguesAvailable: false,
    statusRules: emptyHkStatusRules(),
    cleaningPosture: emptyHkCleaningPosture(),
    oooOosPosture: emptyOooOosPosture(),
    restrictionReasons: [],
    maintenanceCategories: [],
    maintenancePriorities: [],
    maintenanceTypeTags: [],
    maintenanceSla: emptyMaintenanceSla(),
    ...partial,
  };
}

export function activateInputFromSet4Snapshot(snapshot: Set4Snapshot): Set4ActivateInput {
  return {
    hkColumnsAvailable: snapshot.hkColumnsAvailable,
    hkStatusesSaved: Boolean(snapshot.statusRules.savedAt),
    hkMinComplete: hkStatusMinComplete(snapshot.statusRules, snapshot.hkColumnsAvailable),
    cleaningAvailable: snapshot.hkColumnsAvailable,
    cleaningTypeCount: snapshot.cleaningPosture.types.filter((row) => row.active).length,
    oooOosAvailable: snapshot.oooOosAvailable,
    oooOosSaved: Boolean(snapshot.oooOosPosture.savedAt),
    restrictionReasonsAvailable: snapshot.cataloguesAvailable,
    restrictionReasonCount: snapshot.restrictionReasons.filter((row) => row.active).length,
    maintenanceAvailable: snapshot.cataloguesAvailable,
    maintenanceCategoryCount: snapshot.maintenanceCategories.filter((row) => row.active).length,
    maintenancePriorityCount: snapshot.maintenancePriorities.filter((row) => row.active).length,
    maintenanceTypeTagCount: snapshot.maintenanceTypeTags.filter((row) => row.active).length,
    maintenanceSlaSaved: Boolean(snapshot.maintenanceSla.savedAt),
  };
}

export function parseHkStatusCode(value: unknown): HkStatusCode | "" {
  return (HK_STATUS_CODES as readonly string[]).includes(String(value)) ? (value as HkStatusCode) : "";
}

export function parseHkCleaningType(value: unknown): HkCleaningType | "" {
  return (HK_CLEANING_TYPES as readonly string[]).includes(String(value)) ? (value as HkCleaningType) : "";
}

export function parseHkPriority(value: unknown): HkPriorityCode | "" {
  return (HK_PRIORITIES as readonly string[]).includes(String(value)) ? (value as HkPriorityCode) : "";
}

export function parseHkStatusRules(value: unknown): HkStatusRules {
  if (!value || typeof value !== "object") return emptyHkStatusRules();
  const rec = value as { statuses?: unknown; savedAt?: unknown };
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  if (!savedAt) return emptyHkStatusRules();
  const listed = Array.isArray(rec.statuses) ? rec.statuses : [];
  const byCode = new Map<HkStatusCode, HkStatusRule>();
  for (const row of listed) {
    if (!row || typeof row !== "object") continue;
    const item = row as { code?: unknown; label?: unknown; active?: unknown };
    const code = parseHkStatusCode(item.code);
    if (!code) continue;
    byCode.set(code, {
      code,
      label: String(item.label ?? HK_STATUS_LABELS[code]).trim() || HK_STATUS_LABELS[code],
      active: item.active !== false,
    });
  }
  return {
    savedAt,
    statuses: HK_STATUS_CODES.map((code) => byCode.get(code) ?? { code, label: HK_STATUS_LABELS[code], active: code !== "pickup" }),
  };
}

export function parseHkCleaningPosture(value: unknown): HkCleaningPosture {
  if (!value || typeof value !== "object") return emptyHkCleaningPosture();
  const rec = value as {
    types?: unknown;
    priorities?: unknown;
    inspectionGate?: unknown;
    serviceTiming?: Partial<HkServiceTiming>;
    savedAt?: unknown;
  };
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  if (!savedAt) return emptyHkCleaningPosture();
  const typeRows = Array.isArray(rec.types) ? rec.types : [];
  const typesByCode = new Map<HkCleaningType, HkCleaningTypeRule>();
  for (const row of typeRows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { code?: unknown; label?: unknown; active?: unknown };
    const code = parseHkCleaningType(item.code);
    if (!code) continue;
    typesByCode.set(code, {
      code,
      label: String(item.label ?? HK_CLEANING_TYPE_LABELS[code]).trim() || HK_CLEANING_TYPE_LABELS[code],
      active: item.active !== false,
    });
  }
  const priorityRows = Array.isArray(rec.priorities) ? rec.priorities : [];
  const prioritiesByCode = new Map<HkPriorityCode, HkPriorityRule>();
  for (const row of priorityRows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { code?: unknown; label?: unknown; active?: unknown };
    const code = parseHkPriority(item.code);
    if (!code) continue;
    prioritiesByCode.set(code, {
      code,
      label: String(item.label ?? HK_PRIORITY_LABELS[code]).trim() || HK_PRIORITY_LABELS[code],
      active: item.active !== false,
    });
  }
  return emptyHkCleaningPosture({
    savedAt,
    inspectionGate: rec.inspectionGate !== false,
    types: HK_CLEANING_TYPES.map(
      (code) => typesByCode.get(code) ?? { code, label: HK_CLEANING_TYPE_LABELS[code], active: code !== "turn_down" },
    ),
    priorities: HK_PRIORITIES.map(
      (code) => prioritiesByCode.get(code) ?? { code, label: HK_PRIORITY_LABELS[code], active: true },
    ),
    serviceTiming: {
      morningFrom: String(rec.serviceTiming?.morningFrom ?? ""),
      morningTo: String(rec.serviceTiming?.morningTo ?? ""),
      eveningFrom: String(rec.serviceTiming?.eveningFrom ?? ""),
      eveningTo: String(rec.serviceTiming?.eveningTo ?? ""),
    },
  });
}

export function parseOooOosPosture(value: unknown): OooOosPosture {
  if (!value || typeof value !== "object") return emptyOooOosPosture();
  const rec = value as Partial<OooOosPosture>;
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  if (!savedAt) return emptyOooOosPosture();
  return emptyOooOosPosture({
    oooMeaning: String(rec.oooMeaning ?? "").trim() || emptyOooOosPosture().oooMeaning,
    oosMeaning: String(rec.oosMeaning ?? "").trim() || emptyOooOosPosture().oosMeaning,
    reasonRequired: rec.reasonRequired !== false,
    expectedReturnRequired: rec.expectedReturnRequired === true,
    savedAt,
  });
}

export function parseMaintenanceSla(value: unknown): MaintenanceSla {
  if (!value || typeof value !== "object") return emptyMaintenanceSla();
  const rec = value as Partial<MaintenanceSla>;
  const savedAt = typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
  if (!savedAt) return emptyMaintenanceSla();
  const acknowledge = Number(rec.acknowledgeHours);
  const resolve = Number(rec.resolveHours);
  return emptyMaintenanceSla({
    acknowledgeHours: Number.isFinite(acknowledge) && acknowledge > 0 ? acknowledge : null,
    resolveHours: Number.isFinite(resolve) && resolve > 0 ? resolve : null,
    guidance: String(rec.guidance ?? "").trim(),
    savedAt,
  });
}

export function hkStatusMinFieldsComplete(rules: HkStatusRules): boolean {
  if (!rules.savedAt) return false;
  return HK_STATUS_REQUIRED.every((code) => {
    const row = rules.statuses.find((item) => item.code === code);
    return Boolean(row?.active && row.label.trim());
  });
}

export function hkStatusMinComplete(rules: HkStatusRules, hkColumnsAvailable: boolean): boolean {
  return hkColumnsAvailable && hkStatusMinFieldsComplete(rules);
}

export function hkStatusSaveBlocked(rules: HkStatusRules): string | null {
  for (const code of HK_STATUS_REQUIRED) {
    const row = rules.statuses.find((item) => item.code === code);
    if (!row?.active) return `${HK_STATUS_LABELS[code]} must stay active.`;
    if (!row.label.trim()) return `${HK_STATUS_LABELS[code]} needs a label.`;
  }
  return null;
}

export function oooOosSaveBlocked(posture: OooOosPosture): string | null {
  if (!posture.oooMeaning.trim()) return "Describe what out of order means.";
  if (!posture.oosMeaning.trim()) return "Describe what out of service means.";
  return null;
}

export function hkStatusesMandatoryComplete(input: Pick<Set4ActivateInput, "hkColumnsAvailable" | "hkStatusesSaved" | "hkMinComplete">): boolean {
  return input.hkColumnsAvailable && input.hkStatusesSaved && input.hkMinComplete;
}

export function oooOosMandatoryComplete(input: Pick<Set4ActivateInput, "oooOosAvailable" | "oooOosSaved">): boolean {
  return input.oooOosAvailable && input.oooOosSaved;
}

/** After Save, create uses saved active types. Unsaved posture keeps the live baseline. */
export function resolveCleaningTypesForCreate(posture: HkCleaningPosture | null | undefined): Array<{
  code: HkCleaningType;
  label: string;
}> {
  if (posture?.savedAt) {
    const active = posture.types.filter((row) => row.active);
    if (active.length) return active.map((row) => ({ code: row.code, label: row.label }));
  }
  return HK_CLEANING_TYPES.filter((code) => code !== "turn_down").map((code) => ({
    code,
    label: HK_CLEANING_TYPE_LABELS[code],
  }));
}

export function resolvePrioritiesForCreate(
  posture: HkCleaningPosture | null | undefined,
  catalogue: PmsSet4CatalogueItem[] | null | undefined,
): Array<{ code: string; label: string }> {
  const fromCatalogue = (catalogue ?? []).filter((row) => row.active);
  if (fromCatalogue.length) return fromCatalogue.map((row) => ({ code: row.code, label: row.name }));
  if (posture?.savedAt) {
    const active = posture.priorities.filter((row) => row.active);
    if (active.length) return active.map((row) => ({ code: row.code, label: row.label }));
  }
  return HK_PRIORITIES.map((code) => ({ code, label: HK_PRIORITY_LABELS[code] }));
}

export function resolveMaintenanceCategoriesForCreate(categories: PmsSet4CatalogueItem[] | null | undefined): Array<{
  code: string;
  label: string;
}> {
  const active = (categories ?? []).filter((row) => row.active);
  if (active.length) return active.map((row) => ({ code: row.code, label: row.name }));
  return MAINTENANCE_BASELINE_CATEGORIES.map((row) => ({ code: row.code, label: row.name }));
}

export function resolveRestrictionReasonsForCreate(reasons: PmsSet4CatalogueItem[] | null | undefined): Array<{
  code: string;
  label: string;
}> {
  return (reasons ?? []).filter((row) => row.active).map((row) => ({ code: row.code, label: row.name }));
}

export function cleaningTypeAllowed(posture: HkCleaningPosture | null | undefined, taskType: string): boolean {
  const allowed = resolveCleaningTypesForCreate(posture);
  return allowed.some((row) => row.code === taskType);
}

export function maintenanceCategoryAllowed(categories: PmsSet4CatalogueItem[] | null | undefined, category: string): boolean {
  return resolveMaintenanceCategoriesForCreate(categories).some((row) => row.code === category);
}

export function restrictionSaveBlocked(
  posture: OooOosPosture | null | undefined,
  input: { status: string; reason?: string | null; expectedReturn?: string | null },
): string | null {
  if (input.status === "available") return null;
  if (!posture?.savedAt) return null;
  if (posture.reasonRequired && !String(input.reason ?? "").trim()) return "A reason is required.";
  if (posture.expectedReturnRequired && !String(input.expectedReturn ?? "").trim()) {
    return "Expected return is required.";
  }
  return null;
}

function domain(id: Set1DomainReport["id"], missing: string[], warnings: string[]): Set1DomainReport {
  const readiness: Set1Readiness = missing.length ? "incomplete" : warnings.length ? "warning" : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluateHousekeeping(input: Set4ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.hkColumnsAvailable) {
    missing.push("Housekeeping statuses");
    warnings.push(SET4_HK_UNAVAILABLE);
  } else if (!input.hkStatusesSaved || !input.hkMinComplete) {
    missing.push("Housekeeping statuses");
    if (!input.hkStatusesSaved) warnings.push(SET4_HK_UNSAVED);
  }
  if (!input.hkColumnsAvailable) {
    if (!warnings.includes(SET4_HK_UNAVAILABLE)) warnings.push(SET4_HK_UNAVAILABLE);
  } else if (input.cleaningTypeCount === 0) {
    warnings.push(SET4_CLEANING_WARNING);
  }
  return domain("housekeeping-rules", missing, warnings);
}

export function evaluateRoomInventory(input: Set4ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.oooOosAvailable) {
    missing.push("OOO and OOS meaning");
    warnings.push(SET4_RI_UNAVAILABLE);
  } else if (!input.oooOosSaved) {
    missing.push("OOO and OOS meaning");
    warnings.push(SET4_OOO_UNSAVED);
  }
  if (!input.restrictionReasonsAvailable) {
    if (!warnings.includes(SET4_RI_UNAVAILABLE)) warnings.push(SET4_REASONS_WARNING);
  } else if (input.restrictionReasonCount === 0) {
    warnings.push(SET4_REASONS_WARNING);
  }
  return domain("room-inventory-rules", missing, warnings);
}

export function evaluateMaintenance(input: Set4ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.maintenanceAvailable) warnings.push(SET4_MAINT_UNAVAILABLE);
  else {
    if (input.maintenanceCategoryCount === 0) warnings.push(SET4_CATEGORIES_WARNING);
    if (input.maintenancePriorityCount === 0) warnings.push(SET4_PRIORITIES_WARNING);
    if (input.maintenanceTypeTagCount === 0) warnings.push(SET4_TAGS_WARNING);
    if (!input.maintenanceSlaSaved) warnings.push(SET4_SLA_WARNING);
  }
  return domain("maintenance-rules", [], warnings);
}

export function set4MandatoryMissing(input: Set4ActivateInput): string[] {
  return [...evaluateHousekeeping(input).missing, ...evaluateRoomInventory(input).missing];
}
