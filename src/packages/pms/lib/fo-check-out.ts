/**
 * FO-FS2 — Check-out stepper gating (pure).
 *
 * Policy A: Complete is blocked while |folio balance| ≥ 0.01 unless a
 * supervisor override + reason is recorded. Override leaves the folio OPEN.
 * Credit is not refunded at the Front Office desk.
 */

export const CASHIER_SHIFT_REQUIRED_MESSAGE = "Open a cashier shift to post.";

export const CHECK_OUT_STEPS = ["stay", "folio", "settle", "close", "complete"] as const;
export type CheckOutStepId = (typeof CHECK_OUT_STEPS)[number];

export const CHECK_OUT_STEP_META: { id: CheckOutStepId; letter: string; label: string }[] = [
  { id: "stay", letter: "A", label: "Stay" },
  { id: "folio", letter: "B", label: "Folio" },
  { id: "settle", letter: "C", label: "Settle" },
  { id: "close", letter: "D", label: "Close & document" },
  { id: "complete", letter: "E", label: "Complete" },
];

export const SETTLEMENT_METHOD_CHIPS = [
  { id: "cash", label: "Cash", ledger: "cash" },
  { id: "card", label: "Card", ledger: "card" },
  { id: "transfer", label: "Transfer", ledger: "bank_transfer" },
  { id: "other", label: "Other", ledger: "other" },
] as const;

export type SettlementMethodChipId = (typeof SETTLEMENT_METHOD_CHIPS)[number]["id"];
export type SettlementLedgerMethod = (typeof SETTLEMENT_METHOD_CHIPS)[number]["ledger"];

export const FOLIO_ZERO_EPSILON = 0.01;
export const FOLIO_LEFT_OPEN_CHIP = "Folio left open — override";
export const OVERRIDE_UNPAID_TITLE = "Override unpaid check-out";
export const OVERRIDE_CREDIT_TITLE = "Override credit leave open";
export const REFUND_IN_CASHIERING_CTA = "Refund in Cashiering";
export const CASHIERING_REFUND_PATH = "/restaurant/pms/cashiering";
export const EMAIL_NOT_CONFIGURED_MESSAGE = "Email not configured.";
export const STAY_NOT_IN_HOUSE_MESSAGE = "Only in-house stays can be checked out.";
export const SETTLE_REQUIRED_BANNER = "Settle the folio or request a supervisor override.";
export const CLOSE_REQUIRED_BANNER = "Close the folio at zero before completing check-out.";
export const CREDIT_BLOCK_BANNER =
  "This folio has a credit. Refund in Cashiering — Front Office cannot refund.";

export function mapCashierShiftError(message: string): string {
  if (/shift/i.test(message)) return CASHIER_SHIFT_REQUIRED_MESSAGE;
  return message;
}

export type CheckoutOverrideKind = "unpaid" | "credit";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isFolioSettled(balance: number): boolean {
  return Math.abs(Number.isFinite(balance) ? balance : 0) < FOLIO_ZERO_EPSILON;
}

export function isOwesBalance(balance: number): boolean {
  return (Number.isFinite(balance) ? balance : 0) >= FOLIO_ZERO_EPSILON;
}

export function isCreditBalance(balance: number): boolean {
  return (Number.isFinite(balance) ? balance : 0) <= -FOLIO_ZERO_EPSILON;
}

export function mapSettlementMethod(chipId: string): SettlementLedgerMethod {
  const chip = SETTLEMENT_METHOD_CHIPS.find((c) => c.id === chipId);
  return chip?.ledger ?? "other";
}

export function outstandingAmount(balance: number): number {
  return isOwesBalance(balance) ? roundMoney(balance) : 0;
}

export function paymentAmountAllowed(amount: number, remaining: number): boolean {
  if (!Number.isFinite(amount) || !Number.isFinite(remaining)) return false;
  if (amount <= 0) return false;
  if (remaining < FOLIO_ZERO_EPSILON) return false;
  return roundMoney(amount) - remaining <= 1e-9;
}

export function canContinueStay(input: { loaded: boolean; status: string | null }): boolean {
  return input.loaded && input.status === "checked_in";
}

export function canContinueFolio(input: { folioId: string | null }): boolean {
  return Boolean(input.folioId);
}

export function canContinueSettle(input: { balance: number; override: boolean }): boolean {
  return input.override || isFolioSettled(input.balance);
}

export function shouldCloseFolioAtCheckout(input: {
  balance: number;
  override: boolean;
  folioStatus: string | null;
}): boolean {
  if (input.override) return false;
  if (!isFolioSettled(input.balance)) return false;
  return input.folioStatus !== "closed";
}

export function canContinueClose(input: {
  balance: number;
  override: boolean;
  folioStatus: string | null;
}): boolean {
  if (input.override) return true;
  return isFolioSettled(input.balance) && input.folioStatus === "closed";
}

export function canCompleteCheckOut(input: {
  stayOk: boolean;
  folioOk: boolean;
  settleOk: boolean;
  closeOk: boolean;
}): boolean {
  return input.stayOk && input.folioOk && input.settleOk && input.closeOk;
}

export function overrideKindForBalance(balance: number): CheckoutOverrideKind | null {
  if (isOwesBalance(balance)) return "unpaid";
  if (isCreditBalance(balance)) return "credit";
  return null;
}

export function cashieringRefundHref(folioNumber?: string | null): string {
  const path = `${CASHIERING_REFUND_PATH}?tab=folios`;
  return folioNumber ? `${path}&folio=${encodeURIComponent(folioNumber)}` : path;
}

export function platformEmailConfigured(secrets: {
  apiKey?: string | null;
  from?: string | null;
}): boolean {
  return Boolean((secrets.apiKey ?? "").trim() && (secrets.from ?? "").trim());
}

export function formatCheckoutMoney(amount: number, currency: string): string {
  const code = (currency || "GBP").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatCheckoutDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type CheckOutDocumentLine = {
  description: string;
  amount: number;
  type: string;
  postedAt: string;
};

export type CheckOutDocumentSnapshot = {
  propertyName: string;
  guestName: string;
  confirmationNumber: string;
  folioNumber: string;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  currency: string;
  lines: CheckOutDocumentLine[];
  charges: number;
  credits: number;
  balance: number;
  folioStatus: string;
  overrideOpen: boolean;
};

export function checkoutDocumentSubject(snapshot: CheckOutDocumentSnapshot): string {
  return `${snapshot.propertyName} · Folio ${snapshot.folioNumber}`;
}

export function renderCheckoutDocumentText(snapshot: CheckOutDocumentSnapshot): string {
  const money = (n: number) => formatCheckoutMoney(n, snapshot.currency);
  const lines = [
    snapshot.propertyName,
    `Guest document · Folio ${snapshot.folioNumber}`,
    `${snapshot.guestName} · ${snapshot.confirmationNumber}`,
    snapshot.roomNumber ? `Room ${snapshot.roomNumber}` : "Room unassigned",
    `${formatCheckoutDate(snapshot.arrivalDate)} → ${formatCheckoutDate(snapshot.departureDate)}`,
    "",
    ...snapshot.lines.map((line) => `${line.description}    ${money(line.amount)}`),
    "",
    `Charges    ${money(snapshot.charges)}`,
    `Credits    ${money(snapshot.credits)}`,
    `Balance    ${money(snapshot.balance)}`,
    `Folio ${snapshot.folioStatus}`,
  ];
  if (snapshot.overrideOpen) lines.push(FOLIO_LEFT_OPEN_CHIP);
  return lines.join("\n");
}

export function renderCheckoutDocumentHtml(snapshot: CheckOutDocumentSnapshot): string {
  const money = (n: number) => formatCheckoutMoney(n, snapshot.currency);
  const rows = snapshot.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #CCCCCC">${escapeHtml(line.description)}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #CCCCCC;text-align:right">${escapeHtml(money(line.amount))}</td></tr>`,
    )
    .join("");
  const override = snapshot.overrideOpen
    ? `<p style="margin-top:16px;padding:8px 12px;background:#C89933;color:#251605;font-weight:600">${escapeHtml(FOLIO_LEFT_OPEN_CHIP)}</p>`
    : "";
  return `<!DOCTYPE html><html lang="en-GB"><body style="margin:0;background:#fff;color:#251605;font-family:Georgia,serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C89933">NORU</p>
    <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(snapshot.propertyName)}</h1>
    <p style="margin:0 0 4px">Guest document · Folio ${escapeHtml(snapshot.folioNumber)}</p>
    <p style="margin:0 0 4px">${escapeHtml(snapshot.guestName)} · ${escapeHtml(snapshot.confirmationNumber)}</p>
    <p style="margin:0 0 16px">${snapshot.roomNumber ? `Room ${escapeHtml(snapshot.roomNumber)}` : "Room unassigned"} · ${escapeHtml(formatCheckoutDate(snapshot.arrivalDate))} → ${escapeHtml(formatCheckoutDate(snapshot.departureDate))}</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin:16px 0 0">Charges ${escapeHtml(money(snapshot.charges))}</p>
    <p style="margin:4px 0 0">Credits ${escapeHtml(money(snapshot.credits))}</p>
    <p style="margin:4px 0 0;font-weight:700">Balance ${escapeHtml(money(snapshot.balance))}</p>
    <p style="margin:8px 0 0">Folio ${escapeHtml(snapshot.folioStatus)}</p>
    ${override}
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
