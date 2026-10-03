import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeDepositRequirementAmount,
  defaultActiveDepositPolicy,
  formatGuaranteeCardNumber,
  formatQuotedPolicySummary,
  isCardGuaranteeMethod,
  quotedNonRefundable,
  resolveDepositTenderCode,
} from "./create-reservation-step4.ts";
import type { DepositPolicyCard3Row } from "./payments-card3.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const policy = (partial: Partial<DepositPolicyCard3Row>): DepositPolicyCard3Row => ({
  id: "p1",
  code: "STD",
  name: "Standard",
  description: "",
  required: true,
  depositType: "percent",
  depositTypeLabel: "Percent",
  depositValue: 20,
  isDefault: true,
  active: true,
  ...partial,
});

describe("Create reservation Step 4 policies layout", () => {
  it("composes compact guarantee, deposit, cancellation, no-show, and notes", () => {
    const layout = readRel("../components/bookings/create-reservation-policies-guarantee.tsx");
    const guarantee = readRel("../components/bookings/create-reservation-guarantee.tsx");
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(guarantee, /Guarantee Information/);
    assert.match(layout, /Deposit Information/);
    assert.match(layout, /Cancellation Policy/);
    assert.match(layout, /No-Show & Early Departure Policy/);
    assert.match(layout, /Internal Notes \(Optional\)/);
    assert.match(guarantee, /data-testid="create-reservation-guarantee"/);
    assert.match(guarantee, /data-testid="guarantee-method"/);
    assert.match(layout, /data-testid="deposit-policy"/);
    assert.match(page, /CreateReservationGuarantee/);
    assert.match(page, /CreateReservationPoliciesGuarantee/);
    assert.match(page, /CreateReservationPackages/);
    assert.match(page, /guaranteeMethod: guaranteeMethod.trim\(\) \|\| null/);
  });

  it("keeps card number, CVV, due date, and payment reference off the create payload", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    const guarantee = readRel("../components/bookings/create-reservation-guarantee.tsx");
    const createCall = page.slice(page.indexOf("submitReservation({"), page.indexOf("onSuccess:"));
    assert.doesNotMatch(
      createCall,
      /cardNumber|cvv|cardExpiry|depositAmount|depositDueDate|depositReference|noShowPolicy|ackInformed/i,
    );
    assert.match(createCall, /depositPolicyId/);
    assert.match(createCall, /depositTenderCode/);
    assert.match(guarantee, /replace raw guarantee card inputs with tokenized payment-provider flow/);
    assert.match(guarantee, /CVV is never lifted/);
    assert.doesNotMatch(page, /localStorage|sessionStorage/);
    assert.doesNotMatch(createCall, /\.\.\.step4Policies/);
  });

  it("wires Settings payment methods and deposit policies without posting money", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    const layout = readRel("../components/bookings/create-reservation-policies-guarantee.tsx");
    const functions = readRel("./reservations.functions.ts");
    const drizzle = readRel("../../../../drizzle/migrations/0118_pms_reservation_step4_deposit.sql");
    const supabase = readRel("../../../../supabase/migrations/0118_pms_reservation_step4_deposit.sql");
    assert.match(page, /getPmsPolish1Snapshot/);
    assert.match(page, /getPaymentsCard3/);
    assert.match(page, /activeDepositPolicies/);
    assert.match(layout, /DEPOSIT_POLICY_TYPE_LABELS/);
    assert.match(functions, /persistDepositRequirementSnapshot/);
    assert.match(functions, /deposit_requirement_snapshot/);
    assert.doesNotMatch(functions, /open_folio_for_reservation|post_folio_transaction/);
    assert.match(drizzle, /Cashiering posts deposits/);
    assert.equal(drizzle, supabase);
    assert.doesNotMatch(page, /getDefaultDepositPolicy/);
  });

  it("treats cashier card tenders as card-guarantee UI without inventing a processor", () => {
    assert.equal(
      isCardGuaranteeMethod("card", [{ value: "card", label: "Card", origin: "cashier" }]),
      true,
    );
    assert.equal(
      isCardGuaranteeMethod("VISA", [{ value: "VISA", label: "Visa desk", origin: "setup", typeClass: "card" }]),
      true,
    );
    assert.equal(
      isCardGuaranteeMethod("cash", [{ value: "cash", label: "Cash", origin: "cashier" }]),
      false,
    );
    assert.equal(formatGuaranteeCardNumber("4111111111111111"), "4111 1111 1111 1111");
  });

  it("computes deposit requirement from policy + quote, not browser-authored amounts", () => {
    const quote = {
      subtotal: 400,
      nightly: [{ rate: 120 }, { rate: 280 }],
      currency: "USD",
    };
    assert.equal(computeDepositRequirementAmount({ depositType: "none", depositValue: 0 }, quote), 0);
    assert.equal(computeDepositRequirementAmount({ depositType: "percent", depositValue: 25 }, quote), 100);
    assert.equal(computeDepositRequirementAmount({ depositType: "fixed", depositValue: 75 }, quote), 75);
    assert.equal(computeDepositRequirementAmount({ depositType: "first_night", depositValue: 999 }, quote), 120);
    assert.equal(
      computeDepositRequirementAmount({ depositType: "percent", depositValue: 50 }, null),
      0,
    );
    assert.equal(quotedNonRefundable("non_refundable"), true);
    assert.equal(formatQuotedPolicySummary("Free cancel", "Refundable"), "Free cancel · Refundable");
    assert.equal(
      defaultActiveDepositPolicy([
        policy({ isDefault: false, id: "a" }),
        policy({ isDefault: true, id: "b", active: true }),
      ])?.id,
      "b",
    );
    assert.equal(
      resolveDepositTenderCode({ selected: "same_as_guarantee", guaranteeMethod: "CARD" }),
      "CARD",
    );
    assert.equal(resolveDepositTenderCode({ selected: "CASH", guaranteeMethod: "CARD" }), "CASH");
  });
});
