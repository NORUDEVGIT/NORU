/**
 * Server domain and validation for Travel Agency Step 4:
 * Payment, Credit & Reservation Rules + Settings-driven Documents.
 *
 * Reuses the shared business-profile domain:
 *  - guest_account_masters (billing/credit columns from 0121, policy FKs from 0124)
 *  - pms_billing_rules (filtered by applicable_profile_types @> travel_agent)
 *  - pms_payment_methods, pms_deposit_policies, pms_cancellation_policies, pms_no_show_policies
 *  - pms_property_currencies + restaurants.currency_code
 *  - pms_company_document_types (applies_to_travel_agency) + guest_company_documents
 *
 * No parallel billing, policy, or document tables.
 */

import type { GuestTravelAgentCreateDraft } from "./guest-travel-agent-create-workspace.ts";

export const TA_PAYMENT_TIMINGS = ["due_on_arrival", "due_on_departure", "prepaid", "credit_terms"] as const;
export type TravelAgencyPaymentTiming = (typeof TA_PAYMENT_TIMINGS)[number];

export const TA_CREDIT_STATUSES = ["pending_approval", "approved", "suspended"] as const;
export type TravelAgencyCreditStatus = (typeof TA_CREDIT_STATUSES)[number];

export const TA_PAYMENT_TIMING_LABELS: Record<TravelAgencyPaymentTiming, string> = {
  due_on_arrival: "Due on Arrival",
  due_on_departure: "Due on Departure",
  prepaid: "Prepaid / Advance Deposit",
  credit_terms: "Credit Terms",
};

export const TA_CREDIT_STATUS_LABELS: Record<TravelAgencyCreditStatus, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  suspended: "Suspended",
};

export const TA_BOOKING_NOTES_MAX = 500;
export const TA_DRAFT_DOCUMENT_PATH_SEGMENT = "travel-agents";

export type TravelAgencyStep4BillingRuleOption = {
  id: string;
  code: string;
  systemCode: string | null;
  name: string;
  description: string | null;
  operationalStatus: "active" | "planned" | "intent_only" | "deprecated";
  isDefault: boolean;
  active: boolean;
};

export type TravelAgencyStep4PaymentMethodOption = {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
};

export type TravelAgencyStep4DepositPolicyOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  depositType: string;
  depositValue: number;
  isDefault: boolean;
  active: boolean;
};

export type TravelAgencyStep4CancellationPolicyOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  cutoffHours: number;
  penaltyType: string;
  penaltyValue: number;
  refundableBeforeCutoff: boolean;
  isDefault: boolean;
  active: boolean;
};

export type TravelAgencyStep4NoShowPolicyOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  releaseHour: number;
  penaltyType: string;
  penaltyValue: number;
  isDefault: boolean;
  active: boolean;
};

export type TravelAgencyStep4DocumentTypeOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  appliesToTravelAgency: boolean;
  displayOrder: number;
  active: boolean;
};

export type TravelAgencyStep4CurrencyOption = {
  code: string;
  isBase: boolean;
};

export type TravelAgencyStep4ExistingValues = {
  billingCurrencyCode: string | null;
  defaultPaymentMethodId: string | null;
  paymentTiming: string | null;
  defaultBillingRuleId: string | null;
  billingInstruction: string | null;
  creditAccountEnabled: boolean;
  creditLimitAmount: number | null;
  creditDays: number | null;
  creditStatus: string | null;
  defaultDepositPolicyId: string | null;
  defaultCancellationPolicyId: string | null;
  defaultNoShowPolicyId: string | null;
  bookingNotes: string | null;
};

export type TravelAgencyStep4Config = {
  currencies: TravelAgencyStep4CurrencyOption[];
  baseCurrency: string;
  paymentMethods: TravelAgencyStep4PaymentMethodOption[];
  billingRules: TravelAgencyStep4BillingRuleOption[];
  depositPolicies: TravelAgencyStep4DepositPolicyOption[];
  cancellationPolicies: TravelAgencyStep4CancellationPolicyOption[];
  noShowPolicies: TravelAgencyStep4NoShowPolicyOption[];
  documentTypes: TravelAgencyStep4DocumentTypeOption[];
  existingValues?: TravelAgencyStep4ExistingValues | null;
};

export type TravelAgencyStep4DocumentInput = {
  documentTypeId: string;
  fileName: string;
  fileStoragePath: string;
  fileSizeBytes?: number;
};

export type TravelAgencyStep4Payload = {
  restaurantId: string;
  agencyId: string;
  billingCurrencyCode: string | null;
  defaultPaymentMethodId?: string | null;
  paymentTiming: TravelAgencyPaymentTiming | null;
  defaultBillingRuleId: string | null;
  billingInstruction?: string | null;
  allowCredit: boolean;
  creditLimitAmount?: number | null;
  creditDays?: number | null;
  creditStatus?: TravelAgencyCreditStatus | null;
  defaultDepositPolicyId?: string | null;
  defaultCancellationPolicyId?: string | null;
  defaultNoShowPolicyId?: string | null;
  bookingNotes?: string | null;
  documents?: TravelAgencyStep4DocumentInput[];
};

type Db = { from: (table: string) => any };

function rows<T = any>(res: { data?: unknown; error?: unknown } | null | undefined): T[] {
  if (!res || res.error || !Array.isArray(res.data)) return [];
  return res.data as T[];
}

/** Readable, structured-field-derived policy descriptions (no hardcoded policy logic). */
export function describeDepositPolicy(p: Pick<TravelAgencyStep4DepositPolicyOption, "depositType" | "depositValue">): string {
  switch (p.depositType) {
    case "none":
      return "No deposit required.";
    case "first_night":
      return "First night deposit required.";
    case "percent":
      return `${p.depositValue}% of total stay required as deposit.`;
    case "fixed":
      return `Fixed deposit of ${p.depositValue} required.`;
    default:
      return "Deposit per property policy.";
  }
}

function penaltyPhrase(type: string, value: number): string {
  switch (type) {
    case "none":
      return "no penalty";
    case "first_night":
      return "first-night penalty";
    case "percent_stay":
      return `${value}% of stay penalty`;
    case "fixed_amount":
      return `fixed penalty of ${value}`;
    case "full_stay":
      return "full-stay penalty";
    default:
      return "penalty per property policy";
  }
}

export function describeCancellationPolicy(
  p: Pick<TravelAgencyStep4CancellationPolicyOption, "cutoffHours" | "penaltyType" | "penaltyValue" | "refundableBeforeCutoff">,
): string {
  const before = p.refundableBeforeCutoff
    ? `Free cancellation until ${p.cutoffHours} hours before arrival`
    : `Non-refundable; cutoff ${p.cutoffHours} hours before arrival`;
  return `${before}; ${penaltyPhrase(p.penaltyType, p.penaltyValue)} after cutoff.`;
}

export function describeNoShowPolicy(p: Pick<TravelAgencyStep4NoShowPolicyOption, "releaseHour" | "penaltyType" | "penaltyValue">): string {
  const hour = String(p.releaseHour).padStart(2, "0");
  const phrase = penaltyPhrase(p.penaltyType, p.penaltyValue);
  return `Room released at ${hour}:00 on arrival day; ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} for no-shows.`;
}

/** Legacy free-text payment_terms derived from structured fields (compatibility dual-write). */
export function derivePaymentTermsLabel(
  timing: string | null | undefined,
  creditDays: number | null | undefined,
): string | null {
  if (!timing) return null;
  if (timing === "credit_terms") return creditDays != null && creditDays > 0 ? `Net ${creditDays} Days` : "Credit Terms";
  if (timing === "due_on_arrival") return "Due on Arrival";
  if (timing === "due_on_departure") return "Due on Departure";
  if (timing === "prepaid") return "Prepaid";
  return null;
}

/** Billing rule is travel-agent applicable only if explicitly listed (strict, no fallback). */
export function isTravelAgentApplicableRule(rule: { active?: boolean | null; applicable_profile_types?: unknown }): boolean {
  if (rule.active === false) return false;
  return Array.isArray(rule.applicable_profile_types) && rule.applicable_profile_types.includes("travel_agent");
}

export function mapTravelAgencyStep4Config(input: {
  baseCurrencyCode: string | null | undefined;
  propertyCurrencies: Array<{ code?: string | null; active?: boolean | null }>;
  paymentMethods: any[];
  billingRules: any[];
  depositPolicies: any[];
  cancellationPolicies: any[];
  noShowPolicies: any[];
  documentTypes: any[];
  existingAgency?: any | null;
}): TravelAgencyStep4Config {
  const baseCurrency = String(input.baseCurrencyCode ?? "").trim().toUpperCase();

  const codes = new Set<string>();
  if (baseCurrency) codes.add(baseCurrency);
  for (const c of input.propertyCurrencies) {
    if (c.active === false) continue;
    const code = String(c.code ?? "").trim().toUpperCase();
    if (code) codes.add(code);
  }
  const currencies = Array.from(codes).map((code) => ({ code, isBase: code === baseCurrency }));

  const paymentMethods = input.paymentMethods
    .filter((m) => m.active !== false)
    .map((m) => ({
      id: String(m.id),
      code: String(m.code ?? ""),
      name: String(m.name ?? ""),
      description: m.notes ? String(m.notes) : undefined,
      active: m.active !== false,
    }));

  const billingRules = input.billingRules.filter(isTravelAgentApplicableRule).map((r) => ({
    id: String(r.id),
    code: String(r.code ?? ""),
    systemCode: r.system_code ?? null,
    name: String(r.name ?? ""),
    description: r.description ?? null,
    operationalStatus: (r.operational_status ?? "active") as TravelAgencyStep4BillingRuleOption["operationalStatus"],
    isDefault: Boolean(r.is_default),
    active: r.active !== false,
  }));

  const depositPolicies = input.depositPolicies
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: String(p.id),
      code: String(p.code ?? ""),
      name: String(p.name ?? ""),
      description: p.description ?? null,
      depositType: String(p.deposit_type ?? "none"),
      depositValue: Number(p.deposit_value ?? 0),
      isDefault: Boolean(p.is_default),
      active: p.active !== false,
    }));

  const cancellationPolicies = input.cancellationPolicies
    .filter((p) => p.active !== false)
    .map((p) => {
      const policyKind = p.policy_kind || "flexible";
      const windowUnit = p.window_unit || "hours_before_arrival";
      const windowValue = p.window_value != null ? Number(p.window_value) : null;
      const cutoffHours = p.cutoff_hours != null
        ? Number(p.cutoff_hours)
        : p.deadline_hours != null
          ? Number(p.deadline_hours)
          : windowUnit === "days_before_arrival" && windowValue != null
            ? windowValue * 24
            : windowValue != null
              ? windowValue
              : (policyKind === "non_refundable" ? 0 : 24);

      const rawPenalty = String(p.penalty_type ?? "none").toLowerCase();
      const penaltyType =
        rawPenalty === "percentage" || rawPenalty === "percent" || rawPenalty === "percent_stay"
          ? "percent_stay"
          : rawPenalty === "fixed" || rawPenalty === "fixed_amount"
            ? "fixed_amount"
            : rawPenalty === "first_night" || rawPenalty === "nights"
              ? "first_night"
              : rawPenalty === "full_stay"
                ? "full_stay"
                : "none";

      return {
        id: String(p.id),
        code: String(p.code ?? ""),
        name: String(p.name ?? ""),
        description: p.description ?? null,
        cutoffHours,
        penaltyType,
        penaltyValue: Number(p.penalty_value ?? 0),
        refundableBeforeCutoff: p.refundable_before_cutoff !== undefined
          ? Boolean(p.refundable_before_cutoff)
          : policyKind !== "non_refundable",
        isDefault: Boolean(p.is_default),
        active: p.active !== false,
      };
    });

  const noShowPolicies = input.noShowPolicies
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: String(p.id),
      code: String(p.code ?? ""),
      name: String(p.name ?? ""),
      description: p.description ?? null,
      releaseHour: Number(p.release_hour ?? 18),
      penaltyType: String(p.penalty_type ?? "none"),
      penaltyValue: Number(p.penalty_value ?? 0),
      isDefault: Boolean(p.is_default),
      active: p.active !== false,
    }));

  // Strict Travel Agency scoping: company/contract-only document types never appear.
  const documentTypes = input.documentTypes
    .filter((d) => d.active !== false && d.applies_to_travel_agency === true)
    .map((d) => ({
      id: String(d.id),
      code: String(d.code ?? ""),
      name: String(d.name ?? ""),
      description: d.description ?? null,
      required: Boolean(d.required),
      appliesToTravelAgency: true,
      displayOrder: Number(d.display_order ?? 0),
      active: d.active !== false,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const a = input.existingAgency;
  const existingValues: TravelAgencyStep4ExistingValues | null = a
    ? {
        billingCurrencyCode: a.billing_currency_code || a.preferred_currency || null,
        defaultPaymentMethodId: a.default_payment_method_id ?? null,
        paymentTiming: a.payment_timing ?? null,
        defaultBillingRuleId: a.default_billing_rule_id ?? null,
        billingInstruction: a.billing_instruction ?? null,
        creditAccountEnabled: Boolean(a.credit_account_enabled),
        creditLimitAmount: a.credit_limit_amount != null ? Number(a.credit_limit_amount) : null,
        creditDays: a.credit_days != null ? Number(a.credit_days) : null,
        creditStatus: a.credit_status ?? null,
        defaultDepositPolicyId: a.default_deposit_policy_id ?? null,
        defaultCancellationPolicyId: a.default_cancellation_policy_id ?? null,
        defaultNoShowPolicyId: a.default_no_show_policy_id ?? null,
        bookingNotes: a.booking_notes ?? null,
      }
    : null;

  return {
    currencies,
    baseCurrency,
    paymentMethods,
    billingRules,
    depositPolicies,
    cancellationPolicies,
    noShowPolicies,
    documentTypes,
    existingValues,
  };
}

export async function loadTravelAgencyStep4Config(
  db: Db,
  restaurantId: string,
  agencyId?: string | null,
): Promise<TravelAgencyStep4Config> {
  const [
    restaurantRes,
    currenciesRes,
    paymentMethodsRes,
    billingRulesRes,
    depositPoliciesRes,
    cancellationPoliciesRes,
    noShowPoliciesRes,
    docTypesRes,
    existingAgencyRes,
  ] = await Promise.all([
    db.from("restaurants").select("currency_code").eq("id", restaurantId).maybeSingle(),
    db.from("pms_property_currencies").select("code, active").eq("restaurant_id", restaurantId).eq("active", true),
    db.from("pms_payment_methods").select("id, code, name, notes, active").eq("restaurant_id", restaurantId).eq("active", true).order("name"),
    db
      .from("pms_billing_rules")
      .select("id, code, system_code, name, description, operational_status, is_default, active, applicable_profile_types")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .contains("applicable_profile_types", ["travel_agent"])
      .order("name"),
    db
      .from("pms_deposit_policies")
      .select("id, code, name, description, deposit_type, deposit_value, is_default, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("pms_rate_cancellation_policies")
      .select("id, code, name, description, policy_kind, window_value, window_unit, deadline_hours, penalty_type, penalty_value, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("pms_no_show_policies")
      .select("id, code, name, description, release_hour, penalty_type, penalty_value, is_default, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("pms_company_document_types")
      .select("id, code, name, description, required, applies_to_travel_agency, display_order, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .eq("applies_to_travel_agency", true)
      .order("display_order"),
    agencyId
      ? db
          .from("guest_account_masters")
          .select(
            "id, billing_currency_code, preferred_currency, default_payment_method_id, payment_timing, default_billing_rule_id, billing_instruction, credit_account_enabled, credit_limit_amount, credit_days, credit_status, default_deposit_policy_id, default_cancellation_policy_id, default_no_show_policy_id, booking_notes",
          )
          .eq("restaurant_id", restaurantId)
          .eq("id", agencyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  let cancelPolicyRows = rows(cancellationPoliciesRes);
  if (!cancelPolicyRows.length) {
    const fallback = await db
      .from("pms_cancellation_policies")
      .select("id, code, name, description, cutoff_hours, penalty_type, penalty_value, refundable_before_cutoff, is_default, active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name");
    cancelPolicyRows = rows(fallback);
  }

  return mapTravelAgencyStep4Config({
    baseCurrencyCode: restaurantRes?.data?.currency_code ?? null,
    propertyCurrencies: rows(currenciesRes),
    paymentMethods: rows(paymentMethodsRes),
    billingRules: rows(billingRulesRes),
    depositPolicies: rows(depositPoliciesRes),
    cancellationPolicies: cancelPolicyRows,
    noShowPolicies: rows(noShowPoliciesRes),
    documentTypes: rows(docTypesRes),
    existingAgency: existingAgencyRes?.error ? null : existingAgencyRes?.data ?? null,
  });
}

/** Missing required Travel Agency document types for a given set of uploaded type IDs. */
export function missingRequiredTravelAgencyDocuments(
  documentTypes: TravelAgencyStep4DocumentTypeOption[],
  uploadedTypeIds: Iterable<string>,
): TravelAgencyStep4DocumentTypeOption[] {
  const have = new Set(uploadedTypeIds);
  return documentTypes.filter((d) => d.active !== false && d.required && !have.has(d.id));
}

/**
 * Server-authoritative validation.
 * - Reference integrity (same property, travel_agent applicability) is enforced in BOTH modes.
 * - Required-field, credit-terms, and required-document rules are enforced only on "complete".
 */
export function validateTravelAgencyStep4(
  payload: TravelAgencyStep4Payload,
  config: TravelAgencyStep4Config,
  mode: "draft" | "complete" = "complete",
  options: { existingDocumentTypeIds?: string[] } = {},
): void {
  // ---- Reference integrity (both modes) ----
  const currency = payload.billingCurrencyCode?.trim().toUpperCase() || null;
  if (currency && !config.currencies.some((c) => c.code === currency)) {
    throw new Error(`Currency ${currency} is not configured for this property.`);
  }
  if (payload.paymentTiming && !(TA_PAYMENT_TIMINGS as readonly string[]).includes(payload.paymentTiming)) {
    throw new Error("A valid Payment Timing is required.");
  }
  if (payload.defaultBillingRuleId && !config.billingRules.some((r) => r.id === payload.defaultBillingRuleId)) {
    throw new Error("Selected Billing Rule does not exist or is not applicable to Travel Agencies.");
  }
  if (payload.defaultPaymentMethodId && !config.paymentMethods.some((m) => m.id === payload.defaultPaymentMethodId)) {
    throw new Error("Selected Settlement Method is invalid or belongs to another property.");
  }
  if (payload.defaultDepositPolicyId && !config.depositPolicies.some((p) => p.id === payload.defaultDepositPolicyId)) {
    throw new Error("Selected Guarantee Policy is invalid for this property.");
  }
  if (
    payload.defaultCancellationPolicyId &&
    !config.cancellationPolicies.some((p) => p.id === payload.defaultCancellationPolicyId)
  ) {
    throw new Error("Selected Cancellation Policy is invalid for this property.");
  }
  if (payload.defaultNoShowPolicyId && !config.noShowPolicies.some((p) => p.id === payload.defaultNoShowPolicyId)) {
    throw new Error("Selected No-Show Policy is invalid for this property.");
  }
  if (payload.creditStatus && !(TA_CREDIT_STATUSES as readonly string[]).includes(payload.creditStatus)) {
    throw new Error("Invalid Credit Status.");
  }
  if (payload.creditLimitAmount != null && (Number.isNaN(payload.creditLimitAmount) || payload.creditLimitAmount < 0)) {
    throw new Error("Credit Limit Amount cannot be negative.");
  }
  if (
    payload.creditDays != null &&
    (!Number.isInteger(payload.creditDays) || payload.creditDays < 0 || payload.creditDays > 365)
  ) {
    throw new Error("Credit Days must be a whole number between 0 and 365.");
  }
  if (payload.bookingNotes && payload.bookingNotes.length > TA_BOOKING_NOTES_MAX) {
    throw new Error(`Booking Notes cannot exceed ${TA_BOOKING_NOTES_MAX} characters.`);
  }
  for (const doc of payload.documents ?? []) {
    if (!config.documentTypes.some((d) => d.id === doc.documentTypeId)) {
      throw new Error("A document type is not configured for Travel Agencies at this property.");
    }
    const prefix = `${payload.restaurantId}/${TA_DRAFT_DOCUMENT_PATH_SEGMENT}/`;
    if (!doc.fileStoragePath.startsWith(prefix)) {
      throw new Error("A document upload path is not valid for this property.");
    }
  }

  if (mode === "draft") return;

  // ---- Completion rules ----
  if (!currency) throw new Error("Billing Currency is required.");
  if (!payload.paymentTiming) throw new Error("A valid Payment Timing is required.");
  if (!payload.defaultBillingRuleId) throw new Error("Default Billing Rule is required.");
  const selectedBillingRule = config.billingRules.find((r) => r.id === payload.defaultBillingRuleId);
  if (selectedBillingRule?.systemCode === "custom_other" && !payload.billingInstruction?.trim()) {
    throw new Error("Billing Instruction is required when custom billing rule is selected.");
  }

  if (payload.paymentTiming === "credit_terms") {
    if (!payload.allowCredit) throw new Error("Enable Credit Arrangement to use Credit Terms.");
    if (payload.creditDays == null || payload.creditDays <= 0) {
      throw new Error("Credit Days is required when Payment Timing is Credit Terms.");
    }
  }
  if (payload.allowCredit && !payload.creditStatus) {
    throw new Error("Credit Status is required when Credit Arrangement is enabled.");
  }

  const uploaded = [
    ...(payload.documents ?? []).map((d) => d.documentTypeId),
    ...(options.existingDocumentTypeIds ?? []),
  ];
  const missing = missingRequiredTravelAgencyDocuments(config.documentTypes, uploaded);
  if (missing.length > 0) {
    throw new Error(
      `The following required documents must be uploaded before creating the agency: ${missing.map((m) => m.name).join(", ")}`,
    );
  }
}

/** Map the wizard draft into the canonical Step 4 payload. Credit-dependent values are cleared when credit is off. */
export function travelAgencyStep4PayloadFromDraft(
  draftOrRestaurantId: GuestTravelAgentCreateDraft | string,
  agencyIdOrOptions?: string | { restaurantId?: string; agencyId?: string; billingRules?: TravelAgencyStep4BillingRuleOption[] },
  maybeDraft?: GuestTravelAgentCreateDraft,
  billingRules: TravelAgencyStep4BillingRuleOption[] = [],
): TravelAgencyStep4Payload {
  let rId = "restaurant";
  let aId = "agency";
  let draft: GuestTravelAgentCreateDraft;
  let rules = billingRules;

  if (typeof draftOrRestaurantId === "string") {
    rId = draftOrRestaurantId;
    aId = typeof agencyIdOrOptions === "string" ? agencyIdOrOptions : "agency";
    draft = maybeDraft!;
  } else {
    draft = draftOrRestaurantId;
    if (typeof agencyIdOrOptions === "object" && agencyIdOrOptions !== null) {
      rId = agencyIdOrOptions.restaurantId || rId;
      aId = agencyIdOrOptions.agencyId || aId;
      rules = agencyIdOrOptions.billingRules || rules;
    }
  }

  const allowCredit = Boolean(draft.allowCredit);
  const limitRaw = String(draft.creditLimitAmount ?? "").trim();
  const limit = limitRaw === "" ? null : Number(limitRaw);
  const rule = rules.find((r) => r.id === draft.defaultBillingRuleId);
  const isCustom = rule ? rule.systemCode === "custom_other" : true;
  const currency = (draft.billingCurrencyCode || draft.currency || "").trim().toUpperCase() || null;
  const timing = (draft.paymentTiming || null) as TravelAgencyPaymentTiming | null;
  return {
    restaurantId: rId,
    agencyId: aId,
    billingCurrencyCode: currency,
    defaultPaymentMethodId: draft.defaultPaymentMethodId || draft.paymentMethodId || null,
    paymentTiming: !allowCredit && timing === "credit_terms" ? timing : timing,
    defaultBillingRuleId: draft.defaultBillingRuleId || null,
    billingInstruction: isCustom ? draft.billingInstruction?.trim() || null : null,
    allowCredit,
    creditLimitAmount: allowCredit ? limit : null,
    creditDays: allowCredit && draft.creditDays != null ? Number(draft.creditDays) : null,
    creditStatus: allowCredit ? draft.creditStatus || "pending_approval" : null,
    defaultDepositPolicyId: draft.defaultDepositPolicyId || null,
    defaultCancellationPolicyId: draft.defaultCancellationPolicyId || null,
    defaultNoShowPolicyId: draft.defaultNoShowPolicyId || null,
    bookingNotes: draft.bookingNotes?.trim() || null,
    documents: (draft.documents ?? [])
      .filter((d) => d.storagePath)
      .map((d) => ({
        documentTypeId: d.documentTypeId,
        fileName: d.name,
        fileStoragePath: d.storagePath,
        fileSizeBytes: d.fileSizeBytes,
      })),
  };
}

/** Column patch written to guest_account_masters (structured source of truth + legacy dual-writes). */
export function travelAgencyStep4MasterPatch(payload: TravelAgencyStep4Payload): Record<string, unknown> {
  const currency = payload.billingCurrencyCode?.trim().toUpperCase() || null;
  return {
    billing_currency_code: currency,
    preferred_currency: currency, // legacy reader compatibility
    default_payment_method_id: payload.defaultPaymentMethodId || null,
    payment_timing: payload.paymentTiming,
    default_billing_rule_id: payload.defaultBillingRuleId || null,
    billing_instruction: payload.billingInstruction || null,
    payment_terms: derivePaymentTermsLabel(payload.paymentTiming, payload.creditDays ?? null), // legacy text
    credit_account_enabled: payload.allowCredit,
    credit_limit_amount: payload.allowCredit ? payload.creditLimitAmount ?? null : null,
    credit_days: payload.allowCredit ? payload.creditDays ?? null : null,
    credit_status: payload.allowCredit ? payload.creditStatus || "pending_approval" : null,
    default_deposit_policy_id: payload.defaultDepositPolicyId || null,
    default_cancellation_policy_id: payload.defaultCancellationPolicyId || null,
    default_no_show_policy_id: payload.defaultNoShowPolicyId || null,
    booking_notes: payload.bookingNotes || null,
  };
}

/**
 * Persist Step 4 to guest_account_masters and link staged uploads to guest_company_documents.
 * Duplicate links (same storage_path) are skipped so Save Draft → Create is idempotent.
 */
export async function persistTravelAgencyStep4(
  db: Db,
  payload: TravelAgencyStep4Payload,
  options: { mode: "draft" | "complete"; membershipId: string; config?: TravelAgencyStep4Config },
): Promise<{ linkedDocuments: number }> {
  const config = options.config ?? (await loadTravelAgencyStep4Config(db, payload.restaurantId, payload.agencyId));

  const existingDocsRes = await db
    .from("guest_company_documents")
    .select("document_type_id, storage_path")
    .eq("restaurant_id", payload.restaurantId)
    .eq("company_master_id", payload.agencyId);
  const existingDocs = rows<{ document_type_id: string; storage_path: string | null }>(existingDocsRes);

  validateTravelAgencyStep4(payload, config, options.mode, {
    existingDocumentTypeIds: existingDocs.map((d) => d.document_type_id),
  });

  if (payload.defaultCancellationPolicyId) {
    try {
      const exists = await db
        .from("pms_cancellation_policies")
        .select("id")
        .eq("id", payload.defaultCancellationPolicyId)
        .maybeSingle();
      if (!exists.data) {
        const card2Policy = await db
          .from("pms_rate_cancellation_policies")
          .select("*")
          .eq("id", payload.defaultCancellationPolicyId)
          .maybeSingle();
        if (card2Policy.data) {
          await db.from("pms_cancellation_policies").upsert(
            {
              id: card2Policy.data.id,
              restaurant_id: card2Policy.data.restaurant_id,
              code: card2Policy.data.code,
              name: card2Policy.data.name,
              description: card2Policy.data.description,
              cutoff_hours: card2Policy.data.deadline_hours ?? 24,
              penalty_type: "none",
              penalty_value: card2Policy.data.penalty_value ?? 0,
              active: true,
            },
            { onConflict: "restaurant_id,code" },
          );
        }
      }
    } catch {
      // Non-blocking sync
    }
  }

  let update = await db
    .from("guest_account_masters")
    .update(travelAgencyStep4MasterPatch(payload))
    .eq("restaurant_id", payload.restaurantId)
    .eq("id", payload.agencyId)
    .eq("account_type", "travel_agent");
  if (
    update.error &&
    (update.error.code === "23503" ||
      update.error.message?.includes("cancellation_policy") ||
      update.error.message?.includes("foreign key"))
  ) {
    const patch = travelAgencyStep4MasterPatch(payload);
    delete patch.default_cancellation_policy_id;
    update = await db
      .from("guest_account_masters")
      .update(patch)
      .eq("restaurant_id", payload.restaurantId)
      .eq("id", payload.agencyId)
      .eq("account_type", "travel_agent");
  }
  if (update.error) {
    throw new Error(`Failed to save payment & reservation rules: ${update.error.message}`);
  }

  const knownPaths = new Set(existingDocs.map((d) => d.storage_path).filter(Boolean));
  const toInsert = (payload.documents ?? [])
    .filter((d) => !knownPaths.has(d.fileStoragePath))
    .map((d) => ({
      restaurant_id: payload.restaurantId,
      company_master_id: payload.agencyId,
      document_type_id: d.documentTypeId,
      name: d.fileName,
      storage_path: d.fileStoragePath,
      uploaded_by_membership_id: options.membershipId,
      review_status: "pending",
    }));
  if (toInsert.length > 0) {
    const inserted = await db.from("guest_company_documents").insert(toInsert);
    if (inserted.error) throw new Error(`Could not link agency documents: ${inserted.error.message}`);
  }
  return { linkedDocuments: toInsert.length };
}
