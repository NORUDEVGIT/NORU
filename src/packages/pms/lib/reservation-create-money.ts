export type CreateReceiptRequest = {
  amount: number | null;
  tender: string | null;
  reference: string | null;
  idempotencyKey: string | null;
};

export type CreateMoneyPostResult = {
  paymentPosted: boolean;
  paymentError: string | null;
  guestDepositPosted: boolean;
  guestDepositError: string | null;
  folioOpened: boolean;
};

export function normalizeCreateReceipt(input: {
  amount?: number | null;
  tender?: string | null;
  reference?: string | null;
  idempotencyKey?: string | null;
}): CreateReceiptRequest {
  const raw = input.amount;
  const amount =
    raw == null || !Number.isFinite(raw) || raw <= 0 ? null : Math.round(raw * 100) / 100;
  return {
    amount,
    tender: input.tender?.trim() ? input.tender.trim() : null,
    reference: input.reference?.trim() ? input.reference.trim() : null,
    idempotencyKey: input.idempotencyKey?.trim() ? input.idempotencyKey.trim() : null,
  };
}

/** A missing or zero amount posts nothing. A positive amount needs a tender and a key before create. */
export function createReceiptShapeError(receipt: CreateReceiptRequest): string | null {
  if (receipt.amount == null) return null;
  if (!receipt.tender) return "Choose a tender for the amount received.";
  if (!receipt.idempotencyKey || receipt.idempotencyKey.length < 8) {
    return "A payment key is required before money can post.";
  }
  return null;
}

export function createMoneyNeedsFolio(
  payment: CreateReceiptRequest,
  guestDeposit: CreateReceiptRequest,
): boolean {
  return payment.amount != null || guestDeposit.amount != null;
}

export function parseCreateReceiptInput(input: {
  amount: string;
  tender: string;
  reference: string;
  idempotencyKey: string;
}): CreateReceiptRequest {
  const trimmed = input.amount.trim();
  if (!trimmed) {
    return { amount: null, tender: null, reference: null, idempotencyKey: null };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid amount.");
  const receipt = normalizeCreateReceipt({
    amount: value,
    tender: input.tender,
    reference: input.reference,
    idempotencyKey: value > 0 ? input.idempotencyKey : null,
  });
  const shape = createReceiptShapeError(receipt);
  if (shape) throw new Error(shape);
  return receipt;
}

export function emptyCreateMoneyResult(): CreateMoneyPostResult {
  return {
    paymentPosted: false,
    paymentError: null,
    guestDepositPosted: false,
    guestDepositError: null,
    folioOpened: false,
  };
}
