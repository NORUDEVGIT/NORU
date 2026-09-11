/**
 * Issue #27 — Restaurant Management guest receipt policy (client-safe).
 *
 * Pure snapshot builder + email/print renderers. Totals come from stored
 * money columns only — never live menu prices or live tax settings.
 * Standalone POS `pos_*` / ReceiptView are intentionally not referenced.
 */
import { taxLabel, type RmTaxLabel } from "./rm-tax.ts";
import { isOrderSettled } from "./rm-adjust.ts";
import { restaurantPaymentStatus, type RestaurantPaymentStatus } from "./rm-refunds.ts";

export const RM_RECEIPT_BRAND = {
  hero: "#251605",
  gold: "#C89933",
  green: "#436436",
  rule: "#CCCCCC",
} as const;

export type RmReceiptTenderMethod = "cash" | "card" | "room" | "comp";

export interface RmReceiptHeader {
  name: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
}

export interface RmReceiptSale {
  orderNumber: number;
  paidAt: string | null;
  timezone: string;
  currencyCode: string;
  channel: string;
  tableLabel: string;
  billingMethod: string | null;
}

export interface RmReceiptLine {
  name: string;
  quantity: number;
  lineTotal: number;
}

export interface RmReceiptAdjustments {
  discountAmount: number;
  discountReason: string | null;
  compAmount: number;
  compReason: string | null;
}

export interface RmReceiptTotals {
  merchandise: number;
  discount: number;
  comp: number;
  taxAmount: number;
  taxInclusive: boolean;
  taxRate: number;
  taxLabel: RmTaxLabel;
  serviceAmount: number;
  serviceEnabled: boolean;
  serviceRate: number;
  payable: number;
}

export interface RmReceiptTender {
  method: RmReceiptTenderMethod;
  amount: number;
  label: string;
  reference: string | null;
}

export interface RmReceiptRefund {
  amount: number;
  method: string;
  createdAt: string;
}

export interface RmReceiptSnapshot {
  version: 1;
  header: RmReceiptHeader;
  sale: RmReceiptSale;
  lines: RmReceiptLine[];
  adjustments: RmReceiptAdjustments;
  totals: RmReceiptTotals;
  tenders: RmReceiptTender[];
  refunds: RmReceiptRefund[];
}

export type ReceiptEligibleDecision =
  | { ok: true }
  | { ok: false; code: "ORDER_UNPAID"; message: string };

export type ReceiptEmailDecision =
  | { ok: true; email: string }
  | { ok: false; code: "INVALID_EMAIL"; message: string };

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyOrZero(value: number | string | null | undefined): number {
  return round2(Number(value ?? 0));
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Address lines from the property row. Never invent missing parts. */
export function buildAddressLines(input: {
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string[] {
  const lines: string[] = [];
  const street = blankToNull(input.address);
  if (street) lines.push(street);
  const cityLine = [blankToNull(input.city), blankToNull(input.postcode)].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  const country = blankToNull(input.country);
  if (country) lines.push(country);
  return lines;
}

/**
 * Frozen per-hotel header. Phone/email fall back to booking_contact_* only
 * when the primary field is blank — still that restaurant's own identity.
 */
export function buildReceiptHeader(input: {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  bookingContactPhone?: string | null;
  bookingContactEmail?: string | null;
}): RmReceiptHeader {
  return {
    name: blankToNull(input.name) ?? "Restaurant",
    addressLines: buildAddressLines(input),
    phone: blankToNull(input.phone) ?? blankToNull(input.bookingContactPhone),
    email: blankToNull(input.email) ?? blankToNull(input.bookingContactEmail),
  };
}

export function receiptProfileIncomplete(header: RmReceiptHeader): boolean {
  return header.addressLines.length === 0 || !header.phone || !header.email;
}

export function saleChannelLabel(source: string, tableLabel: string): string {
  const table = (tableLabel ?? "").trim();
  if (source === "pos_counter") {
    if (/takeaway/i.test(table)) return "Takeaway";
    if (/counter/i.test(table)) return "Counter";
    return table || "Counter";
  }
  if (source === "waiter_assisted") return table ? `Waiter · ${table}` : "Waiter";
  if (table) return /^table\s/i.test(table) ? table : `Table ${table}`;
  return "Restaurant";
}

export function receiptTenderLabel(method: string): string {
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  if (method === "room") return "Room";
  if (method === "comp") return "Comped";
  return method;
}

export function assertPaidForReceipt(input: {
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
}): ReceiptEligibleDecision {
  if (isOrderSettled(input)) return { ok: true };
  return {
    ok: false,
    code: "ORDER_UNPAID",
    message: "This restaurant sale has not been paid.",
  };
}

export function canOfferGuestReceipt(paymentStatus: RestaurantPaymentStatus): boolean {
  return paymentStatus !== "unpaid";
}

export function paymentStatusForReceipt(input: {
  paidAt: string | null;
  billingMethod: string | null;
  roomPosted: boolean;
  total: number;
  refundedAmount: number;
}): RestaurantPaymentStatus {
  return restaurantPaymentStatus(input);
}

/**
 * Idempotent persist: if a snapshot already exists, keep it.
 * Never overwrite hotel header or stored money.
 */
export function choosePersistedSnapshot(
  existing: RmReceiptSnapshot | null,
  next: RmReceiptSnapshot,
): { snapshot: RmReceiptSnapshot; wrote: boolean } {
  if (existing) return { snapshot: existing, wrote: false };
  return { snapshot: next, wrote: true };
}

export function nextReprintState(
  reprintCount: number,
  at: string,
): { reprintCount: number; lastReprintedAt: string } {
  return { reprintCount: Math.max(0, reprintCount) + 1, lastReprintedAt: at };
}

export function isReprintCopy(input: {
  reprintCount: number;
  mode?: "original" | "reprint";
}): boolean {
  if (input.mode === "reprint") return true;
  if (input.mode === "original") return false;
  return input.reprintCount > 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateReceiptEmail(value: string): ReceiptEmailDecision {
  const email = value.trim();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, code: "INVALID_EMAIL", message: "Enter a valid email address." };
  }
  return { ok: true, email };
}

export function canSubmitReceiptEmail(input: { email: string; submitting: boolean }): boolean {
  if (input.submitting) return false;
  return validateReceiptEmail(input.email).ok;
}

export function receiptEmailSubject(header: RmReceiptHeader, sale: RmReceiptSale): string {
  return `${header.name} · Sale #${sale.orderNumber}`;
}

export function mergeReceiptRefunds(
  snapshot: RmReceiptSnapshot,
  refunds: RmReceiptRefund[],
): RmReceiptSnapshot {
  return { ...snapshot, refunds };
}

export interface BuildReceiptSnapshotInput {
  header: RmReceiptHeader;
  orderNumber: number;
  paidAt: string | null;
  timezone: string;
  currencyCode: string;
  orderSource: string;
  tableLabel: string;
  billingMethod: string | null;
  lines: { name: string; quantity: number; lineTotal: number }[];
  merchandiseSubtotal: number | null;
  discountAmount: number | null;
  discountReason: string | null;
  compAmount: number | null;
  compReason: string | null;
  taxAmount: number | null;
  taxInclusive: boolean | null;
  taxRate: number | null;
  serviceAmount: number | null;
  serviceEnabled: boolean | null;
  serviceRate: number | null;
  payable: number;
  tenders: { method: string; amount: number; reference?: string | null }[];
  refunds: RmReceiptRefund[];
  folioReference?: string | null;
}

/**
 * Build the guest-safe snapshot from stored order / item / payment / refund
 * columns. Callers must not pass live tax settings or current menu prices.
 */
export function buildReceiptSnapshot(input: BuildReceiptSnapshotInput): RmReceiptSnapshot {
  const lines = input.lines.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    lineTotal: moneyOrZero(line.lineTotal),
  }));
  const lineSum = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const merchandise =
    input.merchandiseSubtotal == null ? lineSum : moneyOrZero(input.merchandiseSubtotal);
  const discount = moneyOrZero(input.discountAmount);
  const comp = moneyOrZero(input.compAmount);
  const taxInclusive = input.taxInclusive === true;
  const taxAmount = moneyOrZero(input.taxAmount);
  const serviceAmount = moneyOrZero(input.serviceAmount);
  const payable = moneyOrZero(input.payable);

  const billing = input.billingMethod;
  let tenders: RmReceiptTender[] = input.tenders.map((tender) => ({
    method: (["cash", "card", "room", "comp"].includes(tender.method)
      ? tender.method
      : "card") as RmReceiptTenderMethod,
    amount: moneyOrZero(tender.amount),
    label: receiptTenderLabel(tender.method),
    reference: blankToNull(tender.reference ?? null),
  }));

  if (tenders.length === 0) {
    if (billing === "comp") {
      tenders = [{ method: "comp", amount: 0, label: "Comped", reference: null }];
    } else if (billing === "room_charge") {
      tenders = [
        {
          method: "room",
          amount: payable,
          label: "Room",
          reference: blankToNull(input.folioReference ?? null),
        },
      ];
    }
  } else if (billing === "room_charge" && !tenders.some((tender) => tender.method === "room")) {
    const folio = blankToNull(input.folioReference ?? null);
    tenders = tenders.map((tender) =>
      folio && !tender.reference ? { ...tender, reference: folio } : tender,
    );
  }

  return {
    version: 1,
    header: {
      name: input.header.name,
      addressLines: [...input.header.addressLines],
      phone: input.header.phone,
      email: input.header.email,
    },
    sale: {
      orderNumber: input.orderNumber,
      paidAt: input.paidAt,
      timezone: input.timezone,
      currencyCode: input.currencyCode,
      channel: saleChannelLabel(input.orderSource, input.tableLabel),
      tableLabel: input.tableLabel,
      billingMethod: billing,
    },
    lines,
    adjustments: {
      discountAmount: discount,
      discountReason: blankToNull(input.discountReason),
      compAmount: comp,
      compReason: blankToNull(input.compReason),
    },
    totals: {
      merchandise,
      discount,
      comp,
      taxAmount,
      taxInclusive,
      taxRate: moneyOrZero(input.taxRate),
      taxLabel: taxLabel(taxInclusive),
      serviceAmount,
      serviceEnabled: input.serviceEnabled === true || serviceAmount > 0,
      serviceRate: moneyOrZero(input.serviceRate),
      payable,
    },
    tenders,
    refunds: input.refunds.map((row) => ({
      amount: moneyOrZero(row.amount),
      method: row.method,
      createdAt: row.createdAt,
    })),
  };
}

export function escapeReceiptHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatReceiptMoney(value: number, currencyCode: string): string {
  const currency = (currencyCode || "GBP").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function money(snapshot: RmReceiptSnapshot, value: number): string {
  return formatReceiptMoney(value, snapshot.sale.currencyCode);
}

export interface ReceiptRenderOptions {
  reprint?: boolean;
  reprintedAt?: string | null;
  reprintCount?: number;
}

function reprintCaption(options: ReceiptRenderOptions | undefined): string | null {
  if (!options?.reprint) return null;
  const count = options.reprintCount ?? 0;
  const when = options.reprintedAt ? ` · ${options.reprintedAt}` : "";
  return count > 0 ? `Reprint ${count}${when}` : `Duplicate${when}`;
}

/** Guest-safe plain text. No manager profile hints. */
export function renderReceiptText(
  snapshot: RmReceiptSnapshot,
  options: ReceiptRenderOptions = {},
): string {
  const lines: string[] = [];
  if (options.reprint) {
    lines.push("REPRINT / DUPLICATE");
    const caption = reprintCaption(options);
    if (caption) lines.push(caption);
    lines.push("");
  }
  lines.push(snapshot.header.name);
  for (const line of snapshot.header.addressLines) lines.push(line);
  if (snapshot.header.phone) lines.push(snapshot.header.phone);
  if (snapshot.header.email) lines.push(snapshot.header.email);
  lines.push("");
  lines.push(`Sale #${snapshot.sale.orderNumber}`);
  if (snapshot.sale.paidAt) lines.push(snapshot.sale.paidAt);
  lines.push(snapshot.sale.channel);
  lines.push("");
  for (const line of snapshot.lines) {
    lines.push(`${line.quantity}× ${line.name}    ${money(snapshot, line.lineTotal)}`);
  }
  lines.push("");
  lines.push(`Items    ${money(snapshot, snapshot.totals.merchandise)}`);
  if (snapshot.totals.discount > 0) {
    const reason = snapshot.adjustments.discountReason ? ` (${snapshot.adjustments.discountReason})` : "";
    lines.push(`Discount${reason}    −${money(snapshot, snapshot.totals.discount)}`);
  }
  if (snapshot.totals.comp > 0) {
    const reason = snapshot.adjustments.compReason ? ` (${snapshot.adjustments.compReason})` : "";
    lines.push(`Comp${reason}    −${money(snapshot, snapshot.totals.comp)}`);
  }
  if (snapshot.totals.taxRate > 0 || snapshot.totals.taxAmount > 0) {
    lines.push(`${snapshot.totals.taxLabel}    ${money(snapshot, snapshot.totals.taxAmount)}`);
  }
  if (snapshot.totals.serviceEnabled || snapshot.totals.serviceAmount > 0) {
    lines.push(`Service    ${money(snapshot, snapshot.totals.serviceAmount)}`);
  }
  lines.push(`Payable    ${money(snapshot, snapshot.totals.payable)}`);
  lines.push("");
  for (const tender of snapshot.tenders) {
    const ref = tender.reference ? ` · ${tender.reference}` : "";
    lines.push(`${tender.label}${ref}    ${money(snapshot, tender.amount)}`);
  }
  if (snapshot.refunds.length > 0) {
    lines.push("");
    lines.push("Refunds");
    for (const refund of snapshot.refunds) {
      lines.push(`${receiptTenderLabel(refund.method)}    −${money(snapshot, refund.amount)}`);
    }
  }
  lines.push("");
  lines.push("Powered by NORU");
  return lines.join("\n");
}

/** Guest-safe HTML for email (and a print fallback). No manager hints. */
export function renderReceiptHtml(
  snapshot: RmReceiptSnapshot,
  options: ReceiptRenderOptions = {},
): string {
  const h = escapeReceiptHtml;
  const brand = RM_RECEIPT_BRAND;
  const address = snapshot.header.addressLines.map((line) => h(line)).join("<br />");
  const itemRows = snapshot.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid ${brand.rule};">${h(String(line.quantity))}× ${h(line.name)}</td><td style="padding:6px 0;border-bottom:1px solid ${brand.rule};text-align:right;font-variant-numeric:tabular-nums;">${h(money(snapshot, line.lineTotal))}</td></tr>`,
    )
    .join("");

  const totalRows: string[] = [
    row("Items", money(snapshot, snapshot.totals.merchandise)),
  ];
  if (snapshot.totals.discount > 0) {
    const reason = snapshot.adjustments.discountReason ? ` (${snapshot.adjustments.discountReason})` : "";
    totalRows.push(row(`Discount${reason}`, `−${money(snapshot, snapshot.totals.discount)}`));
  }
  if (snapshot.totals.comp > 0) {
    const reason = snapshot.adjustments.compReason ? ` (${snapshot.adjustments.compReason})` : "";
    totalRows.push(row(`Comp${reason}`, `−${money(snapshot, snapshot.totals.comp)}`));
  }
  if (snapshot.totals.taxRate > 0 || snapshot.totals.taxAmount > 0) {
    totalRows.push(row(snapshot.totals.taxLabel, money(snapshot, snapshot.totals.taxAmount)));
  }
  if (snapshot.totals.serviceEnabled || snapshot.totals.serviceAmount > 0) {
    totalRows.push(row("Service", money(snapshot, snapshot.totals.serviceAmount)));
  }
  totalRows.push(
    `<tr><td style="padding:10px 0 4px;font-weight:700;">Payable</td><td style="padding:10px 0 4px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${h(money(snapshot, snapshot.totals.payable))}</td></tr>`,
  );

  const tenderRows = snapshot.tenders
    .map((tender) => {
      const ref = tender.reference ? ` · ${tender.reference}` : "";
      return row(`${tender.label}${ref}`, money(snapshot, tender.amount));
    })
    .join("");

  const refundRows =
    snapshot.refunds.length === 0
      ? ""
      : `<tr><td colspan="2" style="padding-top:12px;font-weight:600;">Refunds</td></tr>` +
        snapshot.refunds
          .map((refund) => row(receiptTenderLabel(refund.method), `−${money(snapshot, refund.amount)}`))
          .join("");

  const reprintBanner = options.reprint
    ? `<div style="margin:0 0 20px;padding:12px 16px;background:${brand.gold};color:${brand.hero};font-weight:800;letter-spacing:0.12em;text-align:center;text-transform:uppercase;">REPRINT / DUPLICATE</div>
       ${reprintCaption(options) ? `<p style="margin:-12px 0 20px;text-align:center;font-size:12px;color:${brand.hero};">${h(reprintCaption(options) ?? "")}</p>` : ""}`
    : "";

  function row(label: string, value: string): string {
    return `<tr><td style="padding:4px 0;color:#444;">${h(label)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${h(value)}</td></tr>`;
  }

  const contact = [
    snapshot.header.phone ? h(snapshot.header.phone) : null,
    snapshot.header.email ? h(snapshot.header.email) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#fff;color:${brand.hero};font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:420px;margin:0 auto;">
    ${reprintBanner}
    <h1 style="margin:0 0 8px;font-size:28px;line-height:1.15;color:${brand.hero};">${h(snapshot.header.name)}</h1>
    <p style="margin:0 0 4px;font-size:13px;color:#444;">${address}</p>
    ${contact ? `<p style="margin:0 0 20px;font-size:13px;color:#444;">${contact}</p>` : `<div style="height:16px"></div>`}
    <p style="margin:0 0 16px;font-size:13px;color:#444;">Sale #${h(String(snapshot.sale.orderNumber))} · ${h(snapshot.sale.channel)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${itemRows}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px;">${totalRows.join("")}${tenderRows}${refundRows}</table>
    <p style="margin:28px 0 0;text-align:center;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${brand.green};">Powered by NORU</p>
  </div>
</body></html>`;
}
