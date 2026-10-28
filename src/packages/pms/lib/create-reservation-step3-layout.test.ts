import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("reservation create step 3 policies and payment layout", () => {
  const page = read("../components/bookings/create-reservation-page.tsx");
  const policies = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const guarantee = read("../components/bookings/create-reservation-guarantee.tsx");
  const stayPolicies = policies.slice(
    policies.indexOf('data-testid="stay-policies"'),
    policies.indexOf("function present"),
  );

  it("names the step Policies & Payment", () => {
    assert.match(page, /label: "Policies & Payment"/);
    assert.match(page, /Continue to Policies & Payment/);
    assert.doesNotMatch(page, /Policies & Guarantee/);
  });

  it("shows Payment Information", () => {
    assert.match(guarantee, /Payment Information/);
    assert.match(guarantee, /Review payment details for this reservation/);
    assert.match(guarantee, /Payment Type/);
    assert.match(guarantee, /Payment collection is handled separately from the reservation/);
    assert.match(guarantee, /data-testid="guarantee-method"/);
    assert.doesNotMatch(guarantee, /Guarantee Information/);
    assert.doesNotMatch(guarantee, /CREATE_RESERVATION_GUARANTEE_LABELS_ONLY/);
  });

  it("shows Deposit as a rate-plan summary", () => {
    assert.match(policies, />Deposit</);
    assert.match(policies, /Based on the selected rate plan/);
    assert.match(policies, /Collected separately/);
    assert.match(policies, /data-testid="deposit-policy"/);
    assert.match(policies, /data-testid="rate-plan-deposit-policy"/);
    assert.match(policies, /Deposit Amount/);
    assert.doesNotMatch(policies, /Server recomputes/);
  });

  it("shows Stay Policies", () => {
    assert.match(policies, /Stay Policies/);
    assert.match(policies, /Policies are inherited from the selected rate plan/);
    assert.match(policies, /data-testid="stay-policies"/);
  });

  it("renders four policy summaries inside Stay Policies", () => {
    for (const title of ["Cancellation", "No-show", "Early Departure", "Refundability"]) {
      assert.match(stayPolicies, new RegExp(`title="${title}"`));
    }
    assert.match(stayPolicies, /testId="stay-policy-cancellation"/);
    assert.match(stayPolicies, /testId="stay-policy-no-show"/);
    assert.match(stayPolicies, /testId="stay-policy-early-departure"/);
    assert.match(stayPolicies, /testId="stay-policy-refundability"/);
    assert.match(stayPolicies, /xl:grid-cols-4/);
  });

  it("places Refundability inside the Stay Policies card", () => {
    const refund = stayPolicies.indexOf('testId="stay-policy-refundability"');
    const early = stayPolicies.indexOf('testId="stay-policy-early-departure"');
    assert.ok(early > 0 && refund > early);
  });

  it("removes the cancellation radio options", () => {
    assert.doesNotMatch(policies, /Use Hotel Default Policy/);
    assert.doesNotMatch(policies, /Use Different Policy/);
    assert.doesNotMatch(policies, /type="radio"/);
  });

  it("hides the Additional Policies acknowledgement block", () => {
    assert.doesNotMatch(policies, /Additional Policies/);
    assert.doesNotMatch(policies, /I have informed the guest/);
    assert.doesNotMatch(policies, /I have received guest consent/);
    assert.doesNotMatch(policies, /This is a non-refundable reservation/);
    assert.doesNotMatch(policies, /Special terms and conditions apply/);
  });

  it("keeps the old early-departure selector absent", () => {
    assert.doesNotMatch(policies, /LOCAL_STAY_POLICY_OPTIONS/);
    assert.doesNotMatch(policies, /charge_full_stay|charge_first_night|no_charge/);
    assert.doesNotMatch(policies, /<select/);
    assert.match(policies, /data-testid="rate-plan-early-departure-policy"/);
  });

  it("uses the NORU menu for payment type and payment method", () => {
    assert.doesNotMatch(guarantee, /<select/);
    assert.match(guarantee, /data-testid="guarantee-method"/);
    assert.match(guarantee, /data-testid="deposit-payment-method"/);
    assert.match(guarantee, /onGuaranteeMethodChange/);
    assert.match(guarantee, /onDepositPaymentMethodChange/);
    assert.match(guarantee, /same_as_guarantee/);
    assert.match(guarantee, /Payment Terms/);
    assert.match(guarantee, /No payment terms configured for \$\{companyName\}/);
    assert.doesNotMatch(guarantee, /No payment terms on this master/);
  });

  it("shows the cancellation year and the real no-show penalty", () => {
    const deadline = read("./cancellation-deadline.ts");
    assert.match(deadline, /year: "numeric"/);
    assert.match(deadline, /\$\{date\} · \$\{time/);
    assert.match(policies, /\{cancelDetail\}/);
    assert.match(policies, /data-testid="rate-plan-no-show-penalty"/);
    assert.match(policies, /Non-refundable/);
    assert.match(policies, /Refundable/);
    assert.match(page, /noShowPenaltySummary\(/);
    assert.match(page, /ratePlanNoShowPenalty=/);
    const requirement = policies.slice(
      policies.indexOf('data-testid="deposit-policy"'),
      policies.indexOf('testId="payment-received"'),
    );
    assert.doesNotMatch(requirement, /<input/);
    assert.doesNotMatch(requirement, /onChange/);
    assert.match(policies, /testId="payment-received"/);
    assert.match(policies, /testId="guest-deposit"/);
  });

  it("keeps Cancel, Back, and Continue to Review & Confirm", () => {
    assert.match(page, />\s*Cancel\s*</);
    assert.match(page, /← Back/);
    assert.match(page, /Continue to Review & Confirm/);
  });

  it("renders Expected Price Reminder under payment information in Step 3", () => {
    const reminder = read("../components/bookings/create-reservation-price-reminder.tsx");
    assert.match(policies, /priceReminder/);
    assert.match(page, /CreateReservationPriceReminder/);
    assert.match(page, /priceReminder=\{/);
    assert.match(reminder, /Expected Price Reminder/);
    assert.match(reminder, /data-testid="create-reservation-price-reminder"/);
    assert.match(reminder, /data-testid="reminder-rate-plan-name"/);
    assert.match(reminder, /data-testid="reminder-expected-total-amount"/);
    assert.match(reminder, /reminder-packages/);
    assert.match(reminder, /reminder-payment-balance/);
  });
});

