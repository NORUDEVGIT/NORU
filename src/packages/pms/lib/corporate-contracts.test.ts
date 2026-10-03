import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  contractTypeDraftSchema,
  cancellationPolicyDraftSchema,
  noShowPolicyDraftSchema,
  buildCancellationPolicyPreview,
  buildNoShowPolicyPreview,
  getCorporateAgreementExpiryState,
  validateCorporateAgreementPayload,
  type CorporateAgreementPayload,
} from "./corporate-contracts.server";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../");

describe("1. Contract Types Master Domain", () => {
  it("validates a proper contract type draft", () => {
    const valid = contractTypeDraftSchema.safeParse({
      code: "CORP_LOCAL",
      name: "Corporate Local Rate Agreement",
      description: "Standard local negotiated rate",
      active: true,
      displayOrder: 1,
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.code, "CORP_LOCAL");
      assert.equal(valid.data.displayOrder, 1);
    }
  });

  it("trims and accepts valid alphanumeric with underscore codes", () => {
    const valid = contractTypeDraftSchema.safeParse({
      code: " CREW_USD ",
      name: " Airline Crew Agreement ",
      active: true,
      displayOrder: 0,
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.code, "CREW_USD");
      assert.equal(valid.data.name, "Airline Crew Agreement");
    }
  });

  it("rejects lowercase or invalid characters in code", () => {
    const result = contractTypeDraftSchema.safeParse({
      code: "corp-local!",
      name: "Corporate Local",
      active: true,
      displayOrder: 0,
    });
    assert.equal(result.success, false);
  });

  it("rejects empty code or name", () => {
    const emptyCode = contractTypeDraftSchema.safeParse({
      code: "   ",
      name: "Valid Name",
      active: true,
      displayOrder: 0,
    });
    assert.equal(emptyCode.success, false);

    const emptyName = contractTypeDraftSchema.safeParse({
      code: "VALID_CODE",
      name: "   ",
      active: true,
      displayOrder: 0,
    });
    assert.equal(emptyName.success, false);
  });

  it("supports deactivation state", () => {
    const inactive = contractTypeDraftSchema.safeParse({
      code: "DEPRECATED_2025",
      name: "Old 2025 Tier",
      active: false,
      displayOrder: 99,
    });
    assert.equal(inactive.success, true);
    if (inactive.success) {
      assert.equal(inactive.data.active, false);
    }
  });
});

describe("2. Cancellation Policies Master Domain", () => {
  it("validates a standard 24h first-night cancellation policy", () => {
    const result = cancellationPolicyDraftSchema.safeParse({
      code: "CANCEL_24H_1N",
      name: "Standard 24h Free / 1st Night",
      cutoffHours: 24,
      penaltyType: "first_night",
      penaltyValue: 0,
      refundableBeforeCutoff: true,
      isDefault: true,
      active: true,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.isDefault, true);
      assert.equal(result.data.cutoffHours, 24);
    }
  });

  it("validates a percent-of-stay cancellation policy", () => {
    const result = cancellationPolicyDraftSchema.safeParse({
      code: "CANCEL_48H_50PCT",
      name: "48h 50% Stay Penalty",
      cutoffHours: 48,
      penaltyType: "percent_stay",
      penaltyValue: 50,
      refundableBeforeCutoff: true,
      isDefault: false,
      active: true,
    });
    assert.equal(result.success, true);
  });

  it("rejects percentage penalty > 100%", () => {
    const result = cancellationPolicyDraftSchema.safeParse({
      code: "CANCEL_INVALID",
      name: "Invalid Percentage",
      cutoffHours: 24,
      penaltyType: "percent_stay",
      penaltyValue: 150,
      refundableBeforeCutoff: true,
      isDefault: false,
      active: true,
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("penaltyValue"));
      assert.ok(issue, "Expected error on penaltyValue exceeding 100%");
    }
  });

  it("rejects negative cutoff hours", () => {
    const result = cancellationPolicyDraftSchema.safeParse({
      code: "CANCEL_NEG",
      name: "Negative Cutoff",
      cutoffHours: -5,
      penaltyType: "none",
      penaltyValue: 0,
      refundableBeforeCutoff: true,
      isDefault: false,
      active: true,
    });
    assert.equal(result.success, false);
  });

  it("generates clear operational descriptions for UI preview", () => {
    const preview1 = buildCancellationPolicyPreview(24, "first_night", 0, true);
    assert.equal(
      preview1,
      "Free cancellation until 24 hours prior to check-in. 1st night room & tax penalty applies after cutoff.",
    );

    const preview2 = buildCancellationPolicyPreview(0, "full_stay", 0, false);
    assert.equal(
      preview2,
      "Non-refundable prior to check-in. 100% full stay charged after cutoff.",
    );

    const preview3 = buildCancellationPolicyPreview(48, "percent_stay", 50, true);
    assert.equal(
      preview3,
      "Free cancellation until 48 hours prior to check-in. 50% of total stay charged after cutoff.",
    );
  });
});

describe("3. No-Show Policies Master Domain", () => {
  it("validates a standard 18:00 release 1st night no-show policy", () => {
    const result = noShowPolicyDraftSchema.safeParse({
      code: "NOSHOW_1800_1N",
      name: "Release at 18:00 / First Night Charge",
      releaseHour: 18,
      penaltyType: "first_night",
      penaltyValue: 0,
      isDefault: true,
      active: true,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.releaseHour, 18);
    }
  });

  it("rejects release hour outside 0-23", () => {
    const resultTooHigh = noShowPolicyDraftSchema.safeParse({
      code: "NOSHOW_INVALID",
      name: "Invalid Hour",
      releaseHour: 24,
      penaltyType: "first_night",
      penaltyValue: 0,
      isDefault: false,
      active: true,
    });
    assert.equal(resultTooHigh.success, false);

    const resultNegative = noShowPolicyDraftSchema.safeParse({
      code: "NOSHOW_NEG",
      name: "Negative Hour",
      releaseHour: -1,
      penaltyType: "first_night",
      penaltyValue: 0,
      isDefault: false,
      active: true,
    });
    assert.equal(resultNegative.success, false);
  });

  it("rejects percentage penalty > 100% on no-show", () => {
    const result = noShowPolicyDraftSchema.safeParse({
      code: "NOSHOW_OVER",
      name: "Over 100%",
      releaseHour: 20,
      penaltyType: "percent_stay",
      penaltyValue: 120,
      isDefault: false,
      active: true,
    });
    assert.equal(result.success, false);
  });

  it("generates clear operational descriptions for no-show preview", () => {
    const preview1 = buildNoShowPolicyPreview("first_night", 0, 18);
    assert.equal(
      preview1,
      "Unclaimed rooms released at 18:00. 1st night room & tax penalty is charged on no-show.",
    );

    const preview2 = buildNoShowPolicyPreview("full_stay", 0, 23);
    assert.equal(
      preview2,
      "Unclaimed rooms released at 23:00. 100% full stay is charged on no-show.",
    );
  });
});

describe("4. Expiry Derivation (30-Day Reminder Threshold)", () => {
  it("derives 'future' when reference date is before validFrom", () => {
    const expiry = getCorporateAgreementExpiryState("2026-06-01", "2027-05-31", "2026-05-15");
    assert.equal(expiry.validityState, "future");
    assert.ok(expiry.daysUntilExpiry > 30);
  });

  it("derives 'current' when agreement is active and more than 30 days remain", () => {
    const expiry = getCorporateAgreementExpiryState("2026-01-01", "2026-12-31", "2026-06-01");
    assert.equal(expiry.validityState, "current");
    assert.equal(expiry.daysUntilExpiry, 213);
  });

  it("derives 'expiring_soon' at exact 30 days remaining", () => {
    const expiry = getCorporateAgreementExpiryState("2026-01-01", "2026-06-30", "2026-05-31");
    assert.equal(expiry.validityState, "expiring_soon");
    assert.equal(expiry.daysUntilExpiry, 30);
  });

  it("derives 'expiring_soon' when 5 days remaining", () => {
    const expiry = getCorporateAgreementExpiryState("2026-01-01", "2026-06-05", "2026-05-31");
    assert.equal(expiry.validityState, "expiring_soon");
    assert.equal(expiry.daysUntilExpiry, 5);
  });

  it("derives 'expiring_soon' on the expiration day itself (0 days remaining)", () => {
    const expiry = getCorporateAgreementExpiryState("2026-01-01", "2026-05-31", "2026-05-31");
    assert.equal(expiry.validityState, "expiring_soon");
    assert.equal(expiry.daysUntilExpiry, 0);
  });

  it("derives 'expired' when reference date is past validTo", () => {
    const expiry = getCorporateAgreementExpiryState("2026-01-01", "2026-05-30", "2026-05-31");
    assert.equal(expiry.validityState, "expired");
    assert.equal(expiry.daysUntilExpiry, -1);
  });
});

describe("5. Corporate Agreement Payload Validation", () => {
  const basePayload: CorporateAgreementPayload = {
    companyId: "c1111111-1111-1111-1111-111111111111",
    code: "AGR-2026-001",
    name: "Standard Corporate Agreement",
    contractNumber: "CNT-2026-01",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    currencyCode: "ETB",
    pricingMethod: "rate_plan",
    ratePlanId: "r1111111-1111-1111-1111-111111111111",
  };

  it("validates Method A with valid ratePlanId and no discount fields", () => {
    const res = validateCorporateAgreementPayload(basePayload);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("rejects Method A when ratePlanId is missing", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      ratePlanId: undefined,
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Method A requires selecting an active Rate Plan")));
  });

  it("rejects Method A when discount fields are erroneously provided", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      discountType: "percent",
      discountValue: 10,
    });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e) => e.includes("Method A does not accept discount type or discount value")),
    );
  });

  it("validates Method B with percent discount within bounds", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanId: "r1111111-1111-1111-1111-111111111111",
      discountType: "percent",
      discountValue: 15,
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("validates Method B with fixed discount value >= 0", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanId: "r1111111-1111-1111-1111-111111111111",
      discountType: "fixed",
      discountValue: 250,
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("rejects Method B when discount exceeds 100% for percent type", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanId: "r1111111-1111-1111-1111-111111111111",
      discountType: "percent",
      discountValue: 105,
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Percentage discount cannot exceed 100%")));
  });

  it("rejects Method B when discount value is negative", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanId: "r1111111-1111-1111-1111-111111111111",
      discountType: "fixed",
      discountValue: -50,
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Method B requires a non-negative discount value")));
  });

  it("validates Method A with ratePlanScope 'all' without requiring single ratePlanId", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan",
      ratePlanScope: "all",
      ratePlanIds: ["p1", "p2", "p3"],
      ratePlanId: undefined,
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("validates Method A with multiple selected ratePlanIds", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan",
      ratePlanScope: "selected",
      ratePlanIds: ["p1", "p2"],
      ratePlanId: "p1",
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("validates Method B with ratePlanScope 'all' and uniform discount", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanScope: "all",
      discountApplication: "uniform",
      discountType: "percent",
      discountValue: 20,
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("validates Method B with custom per-plan discounts", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanScope: "selected",
      ratePlanIds: ["p1", "p2"],
      discountApplication: "custom",
      ratePlanDiscounts: [
        { ratePlanId: "p1", discountType: "percent", discountValue: 15 },
        { ratePlanId: "p2", discountType: "fixed", discountValue: 300 },
      ],
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("rejects Method B with custom discounts when a plan discount is negative or exceeds 100%", () => {
    const resOver = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanScope: "selected",
      ratePlanIds: ["p1"],
      discountApplication: "custom",
      ratePlanDiscounts: [
        { ratePlanId: "p1", discountType: "percent", discountValue: 120 },
      ],
    });
    assert.equal(resOver.valid, false);
    assert.ok(resOver.errors.some((e) => e.includes("Percentage discount cannot exceed 100%")));

    const resNeg = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "rate_plan_discount",
      ratePlanScope: "selected",
      ratePlanIds: ["p1"],
      discountApplication: "custom",
      ratePlanDiscounts: [
        { ratePlanId: "p1", discountType: "fixed", discountValue: -10 },
      ],
    });
    assert.equal(resNeg.valid, false);
    assert.ok(resNeg.errors.some((e) => e.includes("non-negative discount value")));
  });

  it("validates Method C with valid room rate rows", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "contracted_rates",
      ratePlanId: undefined,
      discountType: undefined,
      discountValue: undefined,
      contractRates: [
        { roomTypeId: "rt-std", amount: 1500, rateKind: "fixed" },
        { roomTypeId: "rt-dlx", amount: 2200, rateKind: "fixed" },
      ],
    });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("rejects Method C when duplicate room types are provided", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "contracted_rates",
      ratePlanId: undefined,
      contractRates: [
        { roomTypeId: "rt-std", amount: 1500 },
        { roomTypeId: "rt-std", amount: 1800 },
      ],
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Duplicate contracted rate for room type rt-std")));
  });

  it("rejects Method C when no rate lines are provided", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "contracted_rates",
      ratePlanId: undefined,
      contractRates: [],
    });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e) => e.includes("Method C requires at least one contracted room rate line")),
    );
  });

  it("rejects Method C when rate line has negative amount", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      pricingMethod: "contracted_rates",
      ratePlanId: undefined,
      contractRates: [{ roomTypeId: "rt-std", amount: -10 }],
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("amount must be 0 or greater")));
  });

  it("validates dates: rejects validTo before validFrom", () => {
    const res = validateCorporateAgreementPayload({
      ...basePayload,
      validFrom: "2026-12-31",
      validTo: "2026-01-01",
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Valid-to date must be on or after valid-from date")));
  });

  it("PERMITS MULTIPLE ACTIVE CONTRACTS: overlapping contracts for same company are valid", () => {
    // Contract 1: Local ETB contract
    const contract1: CorporateAgreementPayload = {
      ...basePayload,
      code: "AGR-2026-ETB",
      name: "ETB Local Corporate Rate",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      currencyCode: "ETB",
    };
    // Contract 2: USD Crew contract overlapping same company and timeframe
    const contract2: CorporateAgreementPayload = {
      ...basePayload,
      code: "AGR-2026-USD",
      name: "USD Crew Agreement",
      validFrom: "2026-03-01",
      validTo: "2026-10-31",
      currencyCode: "USD",
    };

    const res1 = validateCorporateAgreementPayload(contract1);
    const res2 = validateCorporateAgreementPayload(contract2);

    assert.equal(res1.valid, true);
    assert.equal(res2.valid, true);
    // Explicit design assertion: no single-active constraint
  });
});

describe("6. Migration 0120 Dual-Lane Audit", () => {
  it("verifies supabase migration 0120 contains all required tables, columns, indexes and RLS", () => {
    const sqlPath = join(repoRoot, "supabase/migrations/0120_pms_card3_company_contracts_foundation.sql");
    const sql = readFileSync(sqlPath, "utf8");

    // Table creations
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.pms_contract_types"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.pms_cancellation_policies"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.pms_no_show_policies"));

    // Columns on pms_corporate_agreements
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS contract_type_id uuid"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS pricing_method text NOT NULL DEFAULT 'contracted_rates'"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS rate_plan_id uuid"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS discount_type text"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS discount_value numeric(12,2)"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS deposit_policy_id uuid"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS no_show_policy_id uuid"));

    // Columns on pms_company_document_types
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS applies_to_contract boolean NOT NULL DEFAULT true"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS applies_to_company boolean NOT NULL DEFAULT true"));
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0"));

    // Document linkage
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS agreement_id uuid"));

    // Partial unique default index
    assert.ok(sql.includes("pms_cancellation_policies_default_unique"));
    assert.ok(sql.includes("WHERE is_default;"));
    assert.ok(sql.includes("pms_no_show_policies_default_unique"));

    // RLS enabled
    assert.ok(sql.includes("ALTER TABLE public.pms_contract_types ENABLE ROW LEVEL SECURITY;"));
    assert.ok(sql.includes("ALTER TABLE public.pms_cancellation_policies ENABLE ROW LEVEL SECURITY;"));
    assert.ok(sql.includes("ALTER TABLE public.pms_no_show_policies ENABLE ROW LEVEL SECURITY;"));
  });

  it("verifies drizzle migration 0120 matches supabase migration 0120", () => {
    const drizzleSqlPath = join(repoRoot, "drizzle/migrations/0120_pms_card3_company_contracts_foundation.sql");
    const sql = readFileSync(drizzleSqlPath, "utf8");

    assert.ok(sql.includes("pms_contract_types"));
    assert.ok(sql.includes("pms_cancellation_policies"));
    assert.ok(sql.includes("pms_no_show_policies"));
    assert.ok(sql.includes("pricing_method"));
    assert.ok(sql.includes("applies_to_contract"));
  });
});
