/**
 * Corporate Contracts & Agreements — Domain Models, Validators, and Pure Helpers.
 *
 * Implements Phase 1 foundation for Company Creation Step 4 and Settings Card 3/4 masters:
 * - Contract Types
 * - Cancellation Policies
 * - No-Show Policies
 * - Extended Corporate Agreements (Pricing Methods A/B/C)
 * - Expiry State Derivation
 * - Payload Validation
 */

import { z } from "zod";

export const CORPORATE_AGREEMENT_STATUSES = [
  "draft",
  "active",
  "suspended",
  "terminated",
] as const;
export type CorporateAgreementStatus = (typeof CORPORATE_AGREEMENT_STATUSES)[number];

export const CORPORATE_AGREEMENT_PRICING_METHODS = [
  "rate_plan",
  "rate_plan_discount",
  "contracted_rates",
] as const;
export type CorporateAgreementPricingMethod =
  (typeof CORPORATE_AGREEMENT_PRICING_METHODS)[number];

export const CORPORATE_AGREEMENT_DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type CorporateAgreementDiscountType =
  (typeof CORPORATE_AGREEMENT_DISCOUNT_TYPES)[number];

export const POLICY_PENALTY_TYPES = [
  "none",
  "first_night",
  "percent_stay",
  "fixed_amount",
  "full_stay",
] as const;
export type PolicyPenaltyType = (typeof POLICY_PENALTY_TYPES)[number];

export const POLICY_PENALTY_TYPE_LABELS: Record<PolicyPenaltyType, string> = {
  none: "No Penalty (Free)",
  first_night: "First Night Room Charge",
  percent_stay: "Percentage of Stay",
  fixed_amount: "Fixed Amount",
  full_stay: "Full Stay Room Charge",
};

export const PRICING_METHOD_LABELS: Record<CorporateAgreementPricingMethod, string> = {
  rate_plan: "Method A — Configured Rate Plan",
  rate_plan_discount: "Method B — Discount from Rate Plan",
  contracted_rates: "Method C — Contracted Room Rates",
};

// ---------------------------------------------------------------------------
// 1. Contract Types Master
// ---------------------------------------------------------------------------

export interface ContractTypeRecord {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTypeDraft {
  id?: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  displayOrder: number;
}

export const contractTypeDraftSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(1, "Contract type code is required.")
    .max(30, "Code must not exceed 30 characters.")
    .regex(/^[A-Z0-9_]+$/, "Code must consist of uppercase letters, numbers, and underscores."),
  name: z
    .string()
    .trim()
    .min(1, "Contract type name is required.")
    .max(120, "Name must not exceed 120 characters."),
  description: z.string().trim().max(500, "Description must not exceed 500 characters.").optional().default(""),
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// 2. Cancellation Policies Master
// ---------------------------------------------------------------------------

export interface CancellationPolicyRecord {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  cutoffHours: number;
  penaltyType: PolicyPenaltyType;
  penaltyValue: number;
  refundableBeforeCutoff: boolean;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CancellationPolicyDraft {
  id?: string;
  code: string;
  name: string;
  description?: string;
  cutoffHours: number;
  penaltyType: PolicyPenaltyType;
  penaltyValue: number;
  refundableBeforeCutoff: boolean;
  isDefault: boolean;
  active: boolean;
}

export const cancellationPolicyDraftSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(1, "Cancellation policy code is required.")
    .max(30, "Code must not exceed 30 characters.")
    .regex(/^[A-Z0-9_]+$/, "Code must consist of uppercase letters, numbers, and underscores."),
  name: z
    .string()
    .trim()
    .min(1, "Policy name is required.")
    .max(120, "Name must not exceed 120 characters."),
  description: z.string().trim().max(500).optional().default(""),
  cutoffHours: z.number().int().min(0, "Cutoff hours must be 0 or greater."),
  penaltyType: z.enum(POLICY_PENALTY_TYPES),
  penaltyValue: z.number().min(0, "Penalty value must be 0 or greater.").default(0),
  refundableBeforeCutoff: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.penaltyType === "percent_stay" && data.penaltyValue > 100) {
      return false;
    }
    return true;
  },
  {
    message: "Percentage penalty cannot exceed 100%.",
    path: ["penaltyValue"],
  },
);

export function buildCancellationPolicyPreview(
  cutoffHours: number,
  penaltyType: PolicyPenaltyType,
  penaltyValue: number,
  refundableBeforeCutoff: boolean,
): string {
  const cutoffText =
    cutoffHours === 0
      ? "until day of arrival"
      : `until ${cutoffHours} hours prior to check-in`;

  const refundableText = refundableBeforeCutoff
    ? `Free cancellation ${cutoffText}.`
    : `Non-refundable prior to check-in.`;

  let penaltyText = "";
  switch (penaltyType) {
    case "none":
      penaltyText = "No penalty applies upon late cancellation.";
      break;
    case "first_night":
      penaltyText = "1st night room & tax penalty applies after cutoff.";
      break;
    case "percent_stay":
      penaltyText = `${penaltyValue}% of total stay charged after cutoff.`;
      break;
    case "fixed_amount":
      penaltyText = `Fixed fee of ${penaltyValue} charged after cutoff.`;
      break;
    case "full_stay":
      penaltyText = "100% full stay charged after cutoff.";
      break;
  }

  return `${refundableText} ${penaltyText}`;
}

// ---------------------------------------------------------------------------
// 3. No-Show Policies Master
// ---------------------------------------------------------------------------

export interface NoShowPolicyRecord {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  penaltyType: PolicyPenaltyType;
  penaltyValue: number;
  releaseHour: number;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoShowPolicyDraft {
  id?: string;
  code: string;
  name: string;
  description?: string;
  penaltyType: PolicyPenaltyType;
  penaltyValue: number;
  releaseHour: number;
  isDefault: boolean;
  active: boolean;
}

export const noShowPolicyDraftSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(1, "No-show policy code is required.")
    .max(30, "Code must not exceed 30 characters.")
    .regex(/^[A-Z0-9_]+$/, "Code must consist of uppercase letters, numbers, and underscores."),
  name: z
    .string()
    .trim()
    .min(1, "Policy name is required.")
    .max(120, "Name must not exceed 120 characters."),
  description: z.string().trim().max(500).optional().default(""),
  penaltyType: z.enum(POLICY_PENALTY_TYPES),
  penaltyValue: z.number().min(0, "Penalty value must be 0 or greater.").default(0),
  releaseHour: z.number().int().min(0, "Release hour must be 0-23.").max(23, "Release hour must be 0-23."),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.penaltyType === "percent_stay" && data.penaltyValue > 100) {
      return false;
    }
    return true;
  },
  {
    message: "Percentage penalty cannot exceed 100%.",
    path: ["penaltyValue"],
  },
);

export function buildNoShowPolicyPreview(
  penaltyType: PolicyPenaltyType,
  penaltyValue: number,
  releaseHour: number,
): string {
  const formattedHour = `${String(releaseHour).padStart(2, "0")}:00`;
  let penaltyText = "";
  switch (penaltyType) {
    case "none":
      penaltyText = "No financial penalty applies on no-show.";
      break;
    case "first_night":
      penaltyText = "1st night room & tax penalty is charged on no-show.";
      break;
    case "percent_stay":
      penaltyText = `${penaltyValue}% of total stay is charged on no-show.`;
      break;
    case "fixed_amount":
      penaltyText = `Fixed fee of ${penaltyValue} is charged on no-show.`;
      break;
    case "full_stay":
      penaltyText = "100% full stay is charged on no-show.";
      break;
  }

  return `Unclaimed rooms released at ${formattedHour}. ${penaltyText}`;
}

// ---------------------------------------------------------------------------
// 4. Expiry Derivation Helper (30-day informational reminder)
// ---------------------------------------------------------------------------

export type CorporateAgreementValidityState =
  | "future"
  | "current"
  | "expiring_soon"
  | "expired";

export interface CorporateAgreementExpiryInfo {
  validityState: CorporateAgreementValidityState;
  daysUntilExpiry: number;
}

/**
 * Calculates derived validity state and days remaining until expiration.
 * Threshold for 'expiring_soon' is 0 to 30 days inclusive.
 * Does not mutate or persist anything in the database.
 */
export function getCorporateAgreementExpiryState(
  validFrom: string | Date,
  validTo: string | Date,
  referenceDateInput: string | Date = new Date(),
): CorporateAgreementExpiryInfo {
  function toUtcDateOnly(d: string | Date): number {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    return Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate());
  }

  const fromTime = toUtcDateOnly(validFrom);
  const toTime = toUtcDateOnly(validTo);
  const refTime = toUtcDateOnly(referenceDateInput);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const daysUntilExpiry = Math.round((toTime - refTime) / MS_PER_DAY);

  let validityState: CorporateAgreementValidityState;
  if (refTime < fromTime) {
    validityState = "future";
  } else if (daysUntilExpiry < 0) {
    validityState = "expired";
  } else if (daysUntilExpiry <= 30) {
    validityState = "expiring_soon";
  } else {
    validityState = "current";
  }

  return {
    validityState,
    daysUntilExpiry,
  };
}

// ---------------------------------------------------------------------------
// 5. Extended Corporate Agreement Payload Validation
// ---------------------------------------------------------------------------

export interface ContractRateItemPayload {
  roomTypeId: string;
  amount: number;
  rateKind?: "fixed" | "negotiated";
}

export interface RatePlanDiscountItemPayload {
  ratePlanId: string;
  discountType: "percent" | "fixed";
  discountValue: number;
}

export interface CorporateAgreementPayload {
  companyId: string;
  code: string;
  name: string;
  contractNumber: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  description?: string | null;
  contractTypeId?: string | null;
  status?: CorporateAgreementStatus;
  pricingMethod: CorporateAgreementPricingMethod;
  ratePlanScope?: "all" | "selected";
  ratePlanIds?: string[];
  ratePlanId?: string | null;
  discountApplication?: "uniform" | "custom";
  discountType?: CorporateAgreementDiscountType | null;
  discountValue?: number | null;
  ratePlanDiscounts?: RatePlanDiscountItemPayload[];
  depositPolicyId?: string | null;
  cancellationPolicyId?: string | null;
  noShowPolicyId?: string | null;
  contractRates?: ContractRateItemPayload[];
}

export interface CorporateAgreementValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates corporate agreement payloads per Methods A, B, and C.
 * Enforces strict boundary rules:
 * - Method A: Rate plan(s) or 'all' required, discount fields absent.
 * - Method B: Rate plan(s) or 'all' required, uniform or custom per-plan discount required.
 * - Method C: Rate plan absent, discount fields absent, contract rates required with unique room types.
 * - Multiple active contracts are explicitly permitted.
 */
export function validateCorporateAgreementPayload(
  payload: CorporateAgreementPayload,
): CorporateAgreementValidationResult {
  const errors: string[] = [];

  // General validity
  if (!payload.companyId) errors.push("Company ID is required.");
  if (!payload.code?.trim()) errors.push("Agreement code is required.");
  if (!payload.name?.trim()) errors.push("Agreement name is required.");
  if (!payload.contractNumber?.trim()) errors.push("Contract number is required.");
  if (!payload.currencyCode?.trim()) errors.push("Currency code is required.");

  if (!payload.validFrom) {
    errors.push("Valid-from date is required.");
  }
  if (!payload.validTo) {
    errors.push("Valid-to date is required.");
  }
  if (payload.validFrom && payload.validTo && payload.validTo < payload.validFrom) {
    errors.push("Valid-to date must be on or after valid-from date.");
  }

  // Pricing method specific rules
  switch (payload.pricingMethod) {
    case "rate_plan": {
      const isSelected = payload.ratePlanScope === "selected" || !payload.ratePlanScope;
      const hasPlan = Boolean(payload.ratePlanId) || (payload.ratePlanIds && payload.ratePlanIds.length > 0);
      if (isSelected && !hasPlan) {
        errors.push("Method A requires selecting an active Rate Plan.");
      }
      if (payload.discountType || (payload.discountValue !== null && payload.discountValue !== undefined) || (payload.ratePlanDiscounts && payload.ratePlanDiscounts.length > 0)) {
        errors.push("Method A does not accept discount type or discount value.");
      }
      break;
    }

    case "rate_plan_discount": {
      const isSelected = payload.ratePlanScope === "selected" || !payload.ratePlanScope;
      const hasPlan = Boolean(payload.ratePlanId) || (payload.ratePlanIds && payload.ratePlanIds.length > 0);
      if (isSelected && !hasPlan) {
        errors.push("Method B requires selecting a base Rate Plan.");
      }
      if (payload.discountApplication === "custom") {
        const discounts = payload.ratePlanDiscounts ?? [];
        if (discounts.length === 0 && isSelected) {
          errors.push("Method B custom discounts mode requires configuring at least one rate plan discount.");
        }
        for (let i = 0; i < discounts.length; i++) {
          const d = discounts[i];
          if (!d.discountType) {
            errors.push(`Rate plan discount ${i + 1} requires selecting a discount type.`);
          }
          if (d.discountValue === null || d.discountValue === undefined || d.discountValue < 0) {
            errors.push(`Rate plan discount ${i + 1}: Method B requires a non-negative discount value.`);
          } else if (d.discountType === "percent" && d.discountValue > 100) {
            errors.push(`Rate plan discount ${i + 1}: Percentage discount cannot exceed 100%.`);
          }
        }
      } else {
        if (!payload.discountType) {
          errors.push("Method B requires selecting a discount type (percent or fixed).");
        }
        if (payload.discountValue === null || payload.discountValue === undefined || payload.discountValue < 0) {
          errors.push("Method B requires a non-negative discount value.");
        } else if (payload.discountType === "percent" && payload.discountValue > 100) {
          errors.push("Percentage discount cannot exceed 100%.");
        }
      }
      break;
    }

    case "contracted_rates": {
      if (payload.ratePlanId || (payload.ratePlanIds && payload.ratePlanIds.length > 0)) {
        errors.push("Method C does not use a parent rate plan reference.");
      }
      if (payload.discountType || (payload.discountValue !== null && payload.discountValue !== undefined)) {
        errors.push("Method C does not accept discount fields.");
      }

      const rates = payload.contractRates ?? [];
      if (rates.length === 0) {
        errors.push("Method C requires at least one contracted room rate line.");
      } else {
        const seenRoomTypes = new Set<string>();
        for (let i = 0; i < rates.length; i++) {
          const rate = rates[i];
          if (!rate.roomTypeId) {
            errors.push(`Contract rate line ${i + 1} is missing a room type.`);
          } else if (seenRoomTypes.has(rate.roomTypeId)) {
            errors.push(`Duplicate contracted rate for room type ${rate.roomTypeId}.`);
          } else {
            seenRoomTypes.add(rate.roomTypeId);
          }

          if (rate.amount === null || rate.amount === undefined || rate.amount < 0) {
            errors.push(`Contract rate line ${i + 1} amount must be 0 or greater.`);
          }
        }
      }
      break;
    }

    default:
      errors.push(`Unknown pricing method: ${String(payload.pricingMethod)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
