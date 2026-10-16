import { ISO_COUNTRIES, countryFromInput } from "./pms-geography.ts";
import type { ContextPickOption } from "./create-reservation-phase1.ts";
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution.ts";
import { activeSet6Options } from "./create-reservation-phase1.ts";

/** Keys that must never appear on createReservation data from Step 3 stubs. */
export const CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS = [
  "commissionPercent",
  "commission",
  "pickupStatus",
  "cutoffDate",
  "flexibleDates",
  "roomPreferences",
  "travelPurpose",
  "corporateRateAmount",
  "agencyRateAmount",
] as const;

export type CreateReservationQuoteIdentity = {
  roomTypeId: string;
  arrival: string;
  departure: string;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  quoteCurrency: string;
  ratePlanId: string;
};

export function quoteIdentityMatches(
  submitted: CreateReservationQuoteIdentity,
  quoted: CreateReservationQuoteIdentity,
): boolean {
  return (
    submitted.roomTypeId === quoted.roomTypeId &&
    submitted.arrival === quoted.arrival &&
    submitted.departure === quoted.departure &&
    submitted.rooms === quoted.rooms &&
    submitted.adults === quoted.adults &&
    submitted.children === quoted.children &&
    submitted.infants === quoted.infants &&
    submitted.quoteCurrency === quoted.quoteCurrency &&
    submitted.ratePlanId === quoted.ratePlanId
  );
}

export function nationalitySelectCode(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return countryFromInput(raw)?.code ?? "";
}

export function nationalityStoredName(code: string): string {
  return ISO_COUNTRIES.find((row) => row.code === code)?.name ?? code;
}

export function nationalitySelectOptions(current: string | null | undefined): Array<{
  value: string;
  label: string;
}> {
  const options = ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }));
  const code = nationalitySelectCode(current);
  if (current?.trim() && !code) {
    return [{ value: "__current", label: current.trim() }, ...options];
  }
  return options;
}

export function resolveSalesChannelOptions(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ContextPickOption[] {
  return activeSet6Options(rows);
}

export function activeCommissionPlan<T extends { active: boolean; effectiveOn: string; expiresOn: string | null }>(
  plans: T[],
  stayDate: string,
): T | null {
  return (
    plans.find(
      (row) =>
        row.active && row.effectiveOn <= stayDate && (!row.expiresOn || row.expiresOn >= stayDate),
    ) ?? null
  );
}

export function addDaysIso(isoDate: string, days: number): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export const FLEXIBLE_DATE_OFFSETS = [-1, 0, 1] as const;

export function payloadHasForbiddenStep3Keys(payload: Record<string, unknown>): string[] {
  return CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS.filter((key) => key in payload);
}

export function canAdvanceFromBookingDetails(args: {
  quotesFetching: boolean;
  roomTypeId: string;
  occupancyOk: boolean;
  priced: boolean;
  canCreateUnpriced: boolean;
  submitted: CreateReservationQuoteIdentity;
  quoted: CreateReservationQuoteIdentity | null;
}): boolean {
  if (args.quotesFetching) return false;
  if (!args.roomTypeId || !args.occupancyOk) return false;
  if (args.priced) {
    if (!args.quoted) return false;
    return quoteIdentityMatches(args.submitted, args.quoted);
  }
  return args.canCreateUnpriced;
}

export function commissionPercentLabel(plan: {
  commissionType: string;
  rateValue: number;
} | null): string {
  if (!plan) return "";
  if (plan.commissionType === "percent") return String(plan.rateValue);
  return String(plan.rateValue);
}

export const AGENCY_RATE_APPLIES_TO_ALL = "Applies to all";

/** Agency Rate label. A commission that covers every plan reads “Applies to all”. */
export function agencyRateDisplayLabel(input: {
  contractLabel?: string | null;
  selectedHint?: string | null;
  openHint?: string | null;
  ratePlanLabel?: string | null;
  appliesToAll?: boolean;
}): string {
  const specific =
    input.contractLabel?.trim() || input.selectedHint?.trim() || input.openHint?.trim() || "";
  if (specific) return specific;
  if (input.appliesToAll) return AGENCY_RATE_APPLIES_TO_ALL;
  return input.ratePlanLabel?.trim() || "—";
}

export type CompanyAgreementRateSource = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  status: string | null;
  validFrom: string;
  validTo: string;
  ratePlanId: string | null;
  ratePlanIds: string[];
  pricingMethod?: string | null;
  ratePlanScope?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
};

export function formatCompanyAgreementRateLabel(
  agreement: Pick<
    CompanyAgreementRateSource,
    "name" | "pricingMethod" | "ratePlanScope" | "discountType" | "discountValue"
  >,
  planCode?: string | null,
): string {
  const parts = [agreement.name];
  if (agreement.ratePlanScope === "all" && !planCode) parts.push("All rate plans");
  if (planCode) parts.push(planCode);
  if (
    agreement.pricingMethod === "rate_plan_discount" &&
    agreement.discountValue !== null &&
    agreement.discountValue !== undefined &&
    Number.isFinite(agreement.discountValue)
  ) {
    parts.push(agreement.discountType === "fixed" ? `${agreement.discountValue} off` : `${agreement.discountValue}% off`);
  }
  return parts.filter(Boolean).join(" · ");
}

export type CompanyRatePlanRow = { id: string; code: string; name: string };

export type CompanyBookingRateHint = {
  planId: string | null;
  label: string;
  matched: boolean;
};

export type CompanyContractRateSource = {
  roomTypeId: string;
  roomTypeName: string;
  amount: number;
  currency: string;
};

export function companyAgreementCoversStay(
  agreement: { validFrom: string; validTo: string },
  arrival: string | null | undefined,
): boolean {
  if (!arrival || !agreement.validFrom || !agreement.validTo) return true;
  return agreement.validFrom <= arrival && agreement.validTo >= arrival;
}

/** Saved company agreement rates and the default billing rule for a new reservation. */
export function selectCompanyBookingDefaults(input: {
  arrival?: string | null;
  defaultBillingRuleId: string | null;
  agreements: CompanyAgreementRateSource[];
  plans: CompanyRatePlanRow[];
  negotiatedReference?: string | null;
  accountCode?: string | null;
  contractRates?: CompanyContractRateSource[];
}): {
  defaultBillingRuleId: string | null;
  agreementLabel: string | null;
  hints: CompanyBookingRateHint[];
  contractRates: CompanyContractRateSource[];
} {
  const active = input.agreements.filter(
    (row) => row.active !== false && (!row.status || row.status === "active"),
  );
  const covering = active.filter((row) => companyAgreementCoversStay(row, input.arrival));
  const ordered = [...(covering.length > 0 ? covering : active)].sort((left, right) =>
    right.validFrom.localeCompare(left.validFrom),
  );
  const plansById = new Map(input.plans.map((row) => [row.id, row]));
  const hints: CompanyBookingRateHint[] = [];
  const seen = new Set<string>();
  let agreementLabel: string | null = null;
  for (const agreement of ordered) {
    if (!agreementLabel) {
      agreementLabel = agreement.code ? `${agreement.name} (${agreement.code})` : agreement.name;
    }
    const ids = [
      ...(agreement.ratePlanId ? [agreement.ratePlanId] : []),
      ...agreement.ratePlanIds,
    ].filter(Boolean);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      hints.push({ planId: null, label: formatCompanyAgreementRateLabel(agreement), matched: false });
      continue;
    }
    for (const id of uniqueIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const plan = plansById.get(id);
      hints.push({
        planId: id,
        label: formatCompanyAgreementRateLabel(agreement, plan?.code),
        matched: true,
      });
    }
  }
  const needle = (input.negotiatedReference || input.accountCode || "").trim().toLowerCase();
  if (needle) {
    for (const plan of input.plans) {
      if (seen.has(plan.id)) continue;
      const hay = `${plan.code} ${plan.name}`.toLowerCase();
      if (hay.includes(needle) || needle.includes(plan.code.toLowerCase())) {
        hints.push({ planId: plan.id, label: `${plan.code} · ${plan.name}`, matched: true });
        seen.add(plan.id);
      }
    }
  }
  if (hints.length === 0 && input.negotiatedReference?.trim()) {
    hints.push({ planId: null, label: input.negotiatedReference.trim(), matched: false });
  }
  const contractRates = (input.contractRates ?? []).filter(
    (row) => row.roomTypeId && Number.isFinite(row.amount),
  );
  return {
    defaultBillingRuleId: input.defaultBillingRuleId,
    agreementLabel,
    hints,
    contractRates,
  };
}

export function formatCompanyContractRate(rate: CompanyContractRateSource): string {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate.amount);
  const money = rate.currency ? `${amount} ${rate.currency}` : amount;
  return rate.roomTypeName ? `${rate.roomTypeName} · ${money}` : money;
}

export function companyContactOptionLabel(contact: {
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}): string {
  const reach = [contact.phone, contact.whatsapp, contact.email]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(reach)];
  return unique.length > 0 ? `${contact.name} · ${unique.join(" · ")}` : contact.name;
}
