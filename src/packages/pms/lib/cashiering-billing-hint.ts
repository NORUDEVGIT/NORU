import type { BillingPayerKind, BillingRuleCard3Row } from "./billing-card3.server";

/**
 * Cashiering hint from a Settings billing rule.
 * Create Reservation persists the rule id only. Folio open/post stays Front Office / Cashiering.
 */
export type ReservationBillingHint = {
  billingRuleId: string;
  payerKind: BillingPayerKind;
  paymentTerms: string;
  postsFromCreate: false;
};

export function reservationBillingHintFromRule(rule: BillingRuleCard3Row): ReservationBillingHint {
  return {
    billingRuleId: rule.id,
    payerKind: rule.payerKind,
    paymentTerms: rule.paymentTerms,
    postsFromCreate: false,
  };
}
