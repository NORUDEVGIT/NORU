export function roundInvoicePayment(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function invoicePaymentAllocationKey(paymentKey: string): string {
  return `invoice-allocation:${paymentKey}`.slice(0, 80);
}

export function validateInvoicePaymentAmount(amount: number, outstanding: number): string | null {
  const rounded = roundInvoicePayment(amount);
  if (rounded <= 0) return "Enter an amount greater than zero.";
  if (rounded > roundInvoicePayment(outstanding) + 0.001) {
    return `Payment cannot exceed the invoice outstanding amount of ${roundInvoicePayment(outstanding).toFixed(2)}.`;
  }
  return null;
}
