import {
  parsePackageInclusionType,
  type PackageInclusionType,
} from "@/packages/pms/lib/rate-plan-package-inclusion";
import { isPredefinedMealSelection } from "./rate-plan-wizard-meal-options";
import { isPredefinedPolicySelection } from "./rate-plan-wizard-policy-options";
import {
  emptyRatePlanWizardForm,
  RATE_PLAN_NONE,
  RATE_PLAN_PACKAGE_INCLUSION_DEFAULT,
  RATE_PLAN_WIZARD_STEPS,
  type RatePlanWizardForm,
  type RatePlanWizardStepId,
} from "./rate-plan-wizard-types";

export const CREATE_RATE_PLAN_DRAFT_VERSION = 1 as const;

export type CreateRatePlanWizardDraft = {
  version: typeof CREATE_RATE_PLAN_DRAFT_VERSION;
  restaurantId: string;
  savedAt: string;
  step: RatePlanWizardStepId;
  codeManuallyEdited: boolean;
  form: RatePlanWizardForm;
};

export type CreateRatePlanDraftCatalogues = {
  categories: ReadonlyArray<{ id: string }>;
  roomTypes: ReadonlyArray<{ id: string }>;
  mealPlans: ReadonlyArray<{ id: string }>;
  cancellationPolicies: ReadonlyArray<{ id: string }>;
  depositPolicies: ReadonlyArray<{ id: string }>;
  noShowPolicies: ReadonlyArray<{ id: string }>;
  earlyDeparturePolicies: ReadonlyArray<{ id: string }>;
  packages: ReadonlyArray<{ id: string }>;
};

export function createRatePlanDraftStorageKey(restaurantId: string): string {
  return `noru:pms:${restaurantId}:create-rate-plan:draft`;
}

function draftStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function packageInclusion(value: unknown): PackageInclusionType {
  if (value === "included" || value === "optional") return value;
  return RATE_PLAN_PACKAGE_INCLUSION_DEFAULT;
}

function parseStep(value: unknown): RatePlanWizardStepId {
  const n = Number(value);
  if (RATE_PLAN_WIZARD_STEPS.some((row) => row.id === n)) {
    return n as RatePlanWizardStepId;
  }
  return 1;
}

const PRICING_METHODS = new Set(["use_base", "discount", "markup", "fixed"]);

function parseForm(raw: unknown): RatePlanWizardForm | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const pricingMethod = text(row.pricingMethod, "fixed");
  if (!PRICING_METHODS.has(pricingMethod)) return null;
  return {
    categoryId: text(row.categoryId),
    roomTypeId: text(row.roomTypeId),
    name: text(row.name),
    code: text(row.code),
    description: text(row.description),
    validFrom: text(row.validFrom),
    validTo: text(row.validTo),
    noEndDate: bool(row.noEndDate, true),
    pricingMethod: pricingMethod as RatePlanWizardForm["pricingMethod"],
    methodPercent: number(row.methodPercent, 10),
    baseRate: number(row.baseRate, 0),
    includedOccupancy: text(row.includedOccupancy),
    extraAdultRate: text(row.extraAdultRate),
    extraChildRate: text(row.extraChildRate),
    cancellationPolicyId: text(row.cancellationPolicyId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    depositPolicyId: text(row.depositPolicyId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    noShowPolicyId: text(row.noShowPolicyId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    earlyDeparturePolicyId:
      text(row.earlyDeparturePolicyId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    mealPlanId: text(row.mealPlanId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    packageId: text(row.packageId, RATE_PLAN_NONE) || RATE_PLAN_NONE,
    packageInclusionType: packageInclusion(row.packageInclusionType),
    active: bool(row.active, true),
    sellable: bool(row.sellable, true),
  };
}

export function parseCreateRatePlanWizardDraft(
  raw: unknown,
  restaurantId: string,
): CreateRatePlanWizardDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== CREATE_RATE_PLAN_DRAFT_VERSION) return null;
  if (text(row.restaurantId) !== restaurantId) return null;
  const form = parseForm(row.form);
  if (!form) return null;
  return {
    version: CREATE_RATE_PLAN_DRAFT_VERSION,
    restaurantId,
    savedAt: text(row.savedAt, new Date().toISOString()),
    step: parseStep(row.step),
    codeManuallyEdited: bool(row.codeManuallyEdited, false),
    form,
  };
}

function selectionStillValid(
  value: string,
  rows: ReadonlyArray<{ id: string }>,
  allowPredefined: "policy" | "meal" | false,
): boolean {
  if (!value || value === RATE_PLAN_NONE) return true;
  if (allowPredefined === "policy" && isPredefinedPolicySelection(value)) return true;
  if (allowPredefined === "meal" && isPredefinedMealSelection(value)) return true;
  return rows.some((row) => row.id === value);
}

/** Clear stale UUID references; keep predefined catalogue keys and valid IDs. */
export function sanitizeCreateRatePlanWizardDraft(
  draft: CreateRatePlanWizardDraft,
  catalogues: CreateRatePlanDraftCatalogues,
): CreateRatePlanWizardDraft {
  const form = { ...draft.form };

  if (!selectionStillValid(form.categoryId, catalogues.categories, false)) {
    form.categoryId = catalogues.categories[0]?.id ?? "";
  }
  if (!selectionStillValid(form.roomTypeId, catalogues.roomTypes, false)) {
    form.roomTypeId = catalogues.roomTypes[0]?.id ?? "";
  }
  if (!selectionStillValid(form.cancellationPolicyId, catalogues.cancellationPolicies, "policy")) {
    form.cancellationPolicyId = RATE_PLAN_NONE;
  }
  if (!selectionStillValid(form.depositPolicyId, catalogues.depositPolicies, "policy")) {
    form.depositPolicyId = RATE_PLAN_NONE;
  }
  if (!selectionStillValid(form.noShowPolicyId, catalogues.noShowPolicies, "policy")) {
    form.noShowPolicyId = RATE_PLAN_NONE;
  }
  if (
    !selectionStillValid(form.earlyDeparturePolicyId, catalogues.earlyDeparturePolicies, "policy")
  ) {
    form.earlyDeparturePolicyId = RATE_PLAN_NONE;
  }
  if (!selectionStillValid(form.mealPlanId, catalogues.mealPlans, "meal")) {
    form.mealPlanId = RATE_PLAN_NONE;
  }
  if (!selectionStillValid(form.packageId, catalogues.packages, false)) {
    form.packageId = RATE_PLAN_NONE;
  }
  form.packageInclusionType = parsePackageInclusionType(form.packageInclusionType);

  return { ...draft, form };
}

/** True when the user has entered something worth keeping as a draft. */
export function isMeaningfulCreateRatePlanDraft(
  form: RatePlanWizardForm,
  step: RatePlanWizardStepId,
  codeManuallyEdited: boolean,
): boolean {
  if (step !== 1) return true;
  if (codeManuallyEdited) return true;
  if (form.name.trim() || form.code.trim() || form.description.trim()) return true;
  if (!form.noEndDate || form.validTo.trim()) return true;
  if (form.pricingMethod === "discount" || form.pricingMethod === "markup") return true;
  if (form.cancellationPolicyId !== RATE_PLAN_NONE) return true;
  if (form.depositPolicyId !== RATE_PLAN_NONE) return true;
  if (form.noShowPolicyId !== RATE_PLAN_NONE) return true;
  if (form.earlyDeparturePolicyId !== RATE_PLAN_NONE) return true;
  if (form.mealPlanId !== RATE_PLAN_NONE) return true;
  if (form.packageId !== RATE_PLAN_NONE) return true;
  if (!form.active) return true;
  return false;
}

export function readCreateRatePlanWizardDraft(
  restaurantId: string,
): CreateRatePlanWizardDraft | null {
  const store = draftStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(createRatePlanDraftStorageKey(restaurantId));
    if (!raw) return null;
    return parseCreateRatePlanWizardDraft(JSON.parse(raw), restaurantId);
  } catch {
    return null;
  }
}

export function writeCreateRatePlanWizardDraft(
  restaurantId: string,
  draft: Omit<CreateRatePlanWizardDraft, "version" | "restaurantId" | "savedAt">,
): void {
  const store = draftStorage();
  if (!store) return;
  if (!isMeaningfulCreateRatePlanDraft(draft.form, draft.step, draft.codeManuallyEdited)) {
    clearCreateRatePlanWizardDraft(restaurantId);
    return;
  }
  try {
    const payload: CreateRatePlanWizardDraft = {
      version: CREATE_RATE_PLAN_DRAFT_VERSION,
      restaurantId,
      savedAt: new Date().toISOString(),
      step: draft.step,
      codeManuallyEdited: draft.codeManuallyEdited,
      form: draft.form,
    };
    store.setItem(createRatePlanDraftStorageKey(restaurantId), JSON.stringify(payload));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearCreateRatePlanWizardDraft(restaurantId: string): void {
  const store = draftStorage();
  if (!store) return;
  try {
    store.removeItem(createRatePlanDraftStorageKey(restaurantId));
  } catch {
    // Ignore
  }
}

export function freshCreateRatePlanWizardState(defaults?: {
  categoryId?: string;
  roomTypeId?: string;
}): { step: RatePlanWizardStepId; codeManuallyEdited: boolean; form: RatePlanWizardForm } {
  return {
    step: 1,
    codeManuallyEdited: false,
    form: emptyRatePlanWizardForm(defaults),
  };
}
