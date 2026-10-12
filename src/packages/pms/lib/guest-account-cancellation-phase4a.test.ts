import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  applyGuestAccountCancellationBackfill,
  PHASE4A_AMBIGUOUS_ERROR,
  PHASE4A_CANNOT_CONVERT_ERROR,
  PHASE4A_CROSS_PROPERTY_ERROR,
  PHASE4A_PENALTY_ERROR,
  type GuestAccountCancellationLink,
  type Phase4ACancellationState,
} from "./guest-account-cancellation-phase4a.ts";
import type {
  CanonicalCancellationPolicy,
  LegacyCancellationPolicy,
} from "./corporate-agreement-cancellation-phase2.ts";
import {
  loadTravelAgencyStep4Config,
  mapTravelAgencyStep4Config,
  persistTravelAgencyStep4,
  travelAgencyStep4MasterPatch,
  type TravelAgencyStep4Config,
  type TravelAgencyStep4Payload,
} from "./guest-travel-agency-step4.server.ts";

const propertyA = "11111111-1111-4111-8111-111111111111";
const propertyB = "22222222-2222-4222-8222-222222222222";
const legacyId = "33333333-3333-4333-8333-333333333333";
const canonicalId = "44444444-4444-4444-8444-444444444444";
const keptId = "55555555-5555-4555-8555-555555555555";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function legacy(overrides: Partial<LegacyCancellationPolicy> = {}): LegacyCancellationPolicy {
  return {
    id: legacyId,
    restaurantId: propertyA,
    code: "FLEX24",
    name: "Flex 24",
    description: "Desk copy",
    cutoffHours: 24,
    penaltyType: "percent_stay",
    penaltyValue: 50,
    refundableBeforeCutoff: true,
    active: true,
    ...overrides,
  };
}

function canonical(
  overrides: Partial<CanonicalCancellationPolicy> = {},
): CanonicalCancellationPolicy {
  return {
    id: canonicalId,
    restaurantId: propertyA,
    code: "FLEX24",
    name: "Flex 24",
    description: "Desk copy",
    deadlineHours: 24,
    penaltyType: "percentage",
    penaltyValue: 50,
    active: true,
    policyKind: "free_cancellation",
    windowValue: 24,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    ...overrides,
  };
}

function account(
  overrides: Partial<GuestAccountCancellationLink> = {},
): GuestAccountCancellationLink {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    restaurantId: propertyA,
    defaultCancellationPolicyId: legacyId,
    rateCancellationPolicyId: null,
    ...overrides,
  };
}

function state(overrides: Partial<Phase4ACancellationState> = {}): Phase4ACancellationState {
  return {
    legacy: [legacy()],
    canonical: [canonical({ id: "77777777-7777-4777-8777-777777777777", code: "OTHER" })],
    accounts: [account()],
    ...overrides,
  };
}

function payload(overrides: Partial<TravelAgencyStep4Payload> = {}): TravelAgencyStep4Payload {
  return {
    restaurantId: propertyA,
    agencyId: "88888888-8888-4888-8888-888888888888",
    billingCurrencyCode: "USD",
    defaultPaymentMethodId: null,
    paymentTiming: "due_on_departure",
    defaultBillingRuleId: null,
    billingInstruction: null,
    allowCredit: false,
    creditLimitAmount: null,
    creditDays: null,
    creditStatus: null,
    defaultDepositPolicyId: null,
    defaultCancellationPolicyId: canonicalId,
    defaultNoShowPolicyId: null,
    bookingNotes: null,
    documents: [],
    ...overrides,
  };
}

function config(policyId: string | null = canonicalId): TravelAgencyStep4Config {
  return {
    currencies: [{ code: "USD", isBase: true }],
    baseCurrency: "USD",
    paymentMethods: [],
    billingRules: [],
    depositPolicies: [],
    cancellationPolicies: policyId
      ? [
          {
            id: policyId,
            code: "FLEX24",
            name: "Flex 24",
            description: null,
            cutoffHours: 24,
            penaltyType: "percent_stay",
            penaltyValue: 50,
            refundableBeforeCutoff: true,
            isDefault: false,
            active: true,
          },
        ]
      : [],
    noShowPolicies: [],
    documentTypes: [],
    existingValues: null,
  };
}

type Write = { table: string; op: string; payload?: unknown };

function fakeDb(options: {
  policyRestaurantId?: string | null;
  policyError?: boolean;
  tables?: string[];
}) {
  const writes: Write[] = [];
  const tables: string[] = [];
  const db = {
    from(table: string) {
      tables.push(table);
      const result = {
        data:
          table === "pms_rate_cancellation_policies" && options.policyRestaurantId
            ? { id: canonicalId, restaurant_id: options.policyRestaurantId }
            : table === "guest_company_documents"
              ? []
              : table === "pms_rate_cancellation_policies"
                ? []
                : null,
        error:
          options.policyError && table === "pms_rate_cancellation_policies"
            ? { message: "missing" }
            : null,
      };
      const self: Record<string, unknown> = {
        select() {
          return self;
        },
        eq() {
          return self;
        },
        order() {
          return self;
        },
        contains() {
          return self;
        },
        update(body: unknown) {
          writes.push({ table, op: "update", payload: body });
          return self;
        },
        insert(body: unknown) {
          writes.push({ table, op: "insert", payload: body });
          return self;
        },
        upsert(body: unknown) {
          writes.push({ table, op: "upsert", payload: body });
          return self;
        },
        maybeSingle: async () =>
          table === "guest_company_documents" ? { data: [], error: null } : result,
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(
            table === "guest_company_documents" ? { data: [], error: null } : result,
          ).then(resolve, reject);
        },
      };
      return self;
    },
  };
  return { db, writes, tables };
}

describe("guest account cancellation phase 4A", () => {
  const migration = read("../../../../drizzle/migrations/0144_guest_account_rate_cancellation.sql");
  const migrationCopy = read(
    "../../../../supabase/migrations/0144_guest_account_rate_cancellation.sql",
  );
  const travel = read("./guest-travel-agency-step4.server.ts");
  const travelFunctions = read("./guest-travel-agency-step4.functions.ts");
  const detail = read("./guest-travel-agent-detail.functions.ts");
  const card2 = read("./rates-card2.functions.ts");
  const rates = read("./rates.functions.ts");
  const reservations = read("./reservations.functions.ts");
  const contracts = read("./corporate-contracts.functions.ts");
  const contractServer = read("./corporate-contracts.server.ts");
  const companyDetail = read("./guest-company-detail.functions.ts");
  const types = read("../../../integrations/supabase/types.ts");
  const foundation = read(
    "../../../../drizzle/migrations/0120_pms_card3_company_contracts_foundation.sql",
  );

  it("backfills a legacy guest-account policy onto the equivalent canonical row", () => {
    const next = applyGuestAccountCancellationBackfill(state());
    assert.equal(
      next.accounts[0]?.rateCancellationPolicyId,
      "77777777-7777-4777-8777-777777777777",
    );
    assert.equal(next.accounts[0]?.defaultCancellationPolicyId, legacyId);
    assert.equal(next.canonical.length, 1);
  });

  it("reuses a same-property canonical id without creating a duplicate", () => {
    const next = applyGuestAccountCancellationBackfill(
      state({
        legacy: [],
        canonical: [canonical()],
        accounts: [account({ defaultCancellationPolicyId: canonicalId })],
      }),
    );
    assert.equal(next.accounts[0]?.rateCancellationPolicyId, canonicalId);
    assert.equal(next.canonical.length, 1);
    assert.equal(next.canonical[0]?.code, "FLEX24");
  });

  it("does not overwrite an existing canonical guest-account value", () => {
    const next = applyGuestAccountCancellationBackfill(
      state({
        accounts: [account({ rateCancellationPolicyId: keptId })],
      }),
    );
    assert.equal(next.accounts[0]?.rateCancellationPolicyId, keptId);
    assert.equal(next.accounts[0]?.defaultCancellationPolicyId, legacyId);
    assert.equal(next.canonical.length, 1);
  });

  it("fails when more than one canonical row matches", () => {
    assert.throws(
      () =>
        applyGuestAccountCancellationBackfill(
          state({
            canonical: [
              canonical({ id: "77777777-7777-4777-8777-777777777777", code: "ONE" }),
              canonical({ id: "99999999-9999-4999-8999-999999999999", code: "TWO" }),
            ],
          }),
        ),
      new RegExp(PHASE4A_AMBIGUOUS_ERROR),
    );
  });

  it("fails on a cross-property or missing legacy policy", () => {
    assert.throws(
      () =>
        applyGuestAccountCancellationBackfill(
          state({ legacy: [legacy({ restaurantId: propertyB })] }),
        ),
      new RegExp(PHASE4A_CROSS_PROPERTY_ERROR),
    );
    assert.throws(
      () => applyGuestAccountCancellationBackfill(state({ legacy: [], canonical: [] })),
      new RegExp(PHASE4A_CANNOT_CONVERT_ERROR),
    );
    assert.throws(
      () =>
        applyGuestAccountCancellationBackfill(
          state({ legacy: [legacy({ penaltyType: "nights" })], canonical: [] }),
        ),
      new RegExp(PHASE4A_PENALTY_ERROR),
    );
  });

  it("adds the canonical guest-account field without dropping the legacy catalogue", () => {
    assert.equal(migration, migrationCopy);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS rate_cancellation_policy_id uuid/);
    assert.match(
      migration,
      /FOREIGN KEY \(rate_cancellation_policy_id, restaurant_id\)\s+REFERENCES public\.pms_rate_cancellation_policies\(id, restaurant_id\)/,
    );
    assert.match(migration, /guest_account_masters_rate_cancellation_same_property/);
    assert.match(migration, /Phase 4A: ambiguous canonical cancellation policy matches/);
    assert.match(migration, /AND a\.rate_cancellation_policy_id IS NULL/);
    assert.doesNotMatch(migration, /DROP TABLE[^;]*pms_cancellation_policies/);
    assert.doesNotMatch(migration, /DROP COLUMN IF EXISTS default_cancellation_policy_id/);
    assert.doesNotMatch(migration, /DROP COLUMN IF EXISTS cancellation_policy_id/);
    assert.match(foundation, /CREATE TABLE IF NOT EXISTS public\.pms_cancellation_policies/);
    assert.doesNotMatch(contracts, /from\("pms_cancellation_policies"\)/);
    assert.match(types, /rate_cancellation_policy_id: string \| null/);
    assert.match(types, /guest_account_masters_rate_cancellation_same_property/);
  });

  it("loads the Travel Agency picker from the rate catalogue only", async () => {
    const { db, tables } = fakeDb({ policyRestaurantId: propertyA });
    const loaded = await loadTravelAgencyStep4Config(db as never, propertyA, null);
    assert.equal(tables.includes("pms_rate_cancellation_policies"), true);
    assert.equal(tables.includes("pms_cancellation_policies"), false);
    assert.equal(loaded.cancellationPolicies.length, 0);
    const mapped = mapTravelAgencyStep4Config({
      baseCurrencyCode: "USD",
      propertyCurrencies: [],
      paymentMethods: [],
      billingRules: [],
      depositPolicies: [],
      cancellationPolicies: [
        {
          id: canonicalId,
          code: "FLEX24",
          name: "Flex 24",
          policy_kind: "free_cancellation",
          window_value: 2,
          window_unit: "days_before_arrival",
          deadline_hours: 48,
          penalty_type: "percentage",
          penalty_value: 10,
          active: true,
          cutoff_hours: 24,
          refundable_before_cutoff: false,
          is_default: true,
        },
      ],
      noShowPolicies: [],
      documentTypes: [],
      existingAgency: {
        rate_cancellation_policy_id: canonicalId,
        default_cancellation_policy_id: legacyId,
      },
    });
    assert.equal(mapped.cancellationPolicies[0]?.cutoffHours, 48);
    assert.equal(mapped.cancellationPolicies[0]?.isDefault, false);
    assert.equal(mapped.cancellationPolicies[0]?.refundableBeforeCutoff, true);
    assert.equal(mapped.existingValues?.defaultCancellationPolicyId, canonicalId);
    assert.doesNotMatch(travel, /from\("pms_cancellation_policies"\)/);
    assert.doesNotMatch(travelFunctions, /from\("pms_cancellation_policies"\)/);
    assert.doesNotMatch(detail, /from\("pms_cancellation_policies"\)/);
  });

  it("saves the canonical guest-account id and rejects another property", async () => {
    const patch = travelAgencyStep4MasterPatch(payload());
    assert.equal(patch.rate_cancellation_policy_id, canonicalId);
    assert.equal(patch.default_cancellation_policy_id, undefined);
    const cleared = travelAgencyStep4MasterPatch(payload({ defaultCancellationPolicyId: null }));
    assert.equal(cleared.rate_cancellation_policy_id, null);
    assert.equal(cleared.default_cancellation_policy_id, undefined);

    const saved = fakeDb({ policyRestaurantId: propertyA });
    await persistTravelAgencyStep4(saved.db as never, payload(), {
      mode: "draft",
      membershipId: "membership",
      config: config(),
    });
    assert.equal(
      saved.writes.some((write) => write.table === "pms_cancellation_policies"),
      false,
    );
    const update = saved.writes.find((write) => write.table === "guest_account_masters");
    assert.equal(
      (update?.payload as { rate_cancellation_policy_id?: string }).rate_cancellation_policy_id,
      canonicalId,
    );
    assert.equal(
      (update?.payload as { default_cancellation_policy_id?: string })
        .default_cancellation_policy_id,
      undefined,
    );

    const other = fakeDb({ policyRestaurantId: propertyB });
    await assert.rejects(
      () =>
        persistTravelAgencyStep4(other.db as never, payload(), {
          mode: "draft",
          membershipId: "membership",
          config: config(),
        }),
      /Selected Cancellation Policy is invalid for this property/,
    );
    assert.equal(
      other.writes.some((write) => write.table === "guest_account_masters"),
      false,
    );
  });

  it("stops Rate & Pricing from mirroring cancellation rows into the legacy table", () => {
    const saveStart = card2.indexOf("export const saveRateCancellationPolicyCard2");
    const saveEnd = card2.indexOf("export const saveRateRefundabilityCard2");
    const save = card2.slice(saveStart, saveEnd);
    assert.match(save, /from\("pms_rate_cancellation_policies"\)/);
    assert.doesNotMatch(save, /pms_cancellation_policies/);
    assert.doesNotMatch(card2, /from\("pms_cancellation_policies"\)/);
  });

  it("leaves rate plans, quotes, reservation create, and corporate compatibility in place", () => {
    assert.match(rates, /cancellation_policy_id/);
    assert.match(rates, /export const quoteStay/);
    assert.doesNotMatch(rates, /rate_cancellation_policy_id/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.match(contractServer, /export function resolveAgreementCancellation/);
    assert.doesNotMatch(contractServer, /(?<!rate_)cancellation_policy_id/);
    assert.doesNotMatch(contracts, /export const listPmsCancellationPolicies/);
    assert.doesNotMatch(contracts, /export const savePmsCancellationPolicy/);
    assert.doesNotMatch(contracts, /export const setPmsCancellationPolicyActive/);
    assert.doesNotMatch(companyDetail, /from\("pms_cancellation_policies"\)/);
    assert.match(travelFunctions, /rate_cancellation_policy_id: data\.defaultCancellationPolicyId/);
    assert.doesNotMatch(travelFunctions, /default_cancellation_policy_id:/);
    assert.match(detail, /rate_cancellation_policy_id: data\.defaultCancellationPolicyId/);
    assert.doesNotMatch(
      detail,
      /default_cancellation_policy_id: data\.defaultCancellationPolicyId/,
    );
  });
});
