import { cn } from "@/shared/lib/utils";
import { formatDateTimeInZone, formatMoney } from "@/shared/lib/property-time";
import { BillTotals } from "@/packages/restaurant-management/components/bill-totals";
import {
  RM_RECEIPT_BRAND,
  receiptTenderLabel,
  type RmReceiptSnapshot,
} from "@/packages/restaurant-management/lib/rm-receipts";
import type { RmBillTotals } from "@/packages/restaurant-management/lib/rm-tax";

export function snapshotToBill(snapshot: RmReceiptSnapshot): RmBillTotals {
  return {
    merchandiseSubtotal: snapshot.totals.merchandise,
    discountAmount: snapshot.totals.discount,
    compAmount: snapshot.totals.comp,
    adjustedMerchandise: Math.max(
      0,
      snapshot.totals.merchandise - snapshot.totals.discount - snapshot.totals.comp,
    ),
    merchandiseNet: snapshot.totals.merchandise,
    taxAmount: snapshot.totals.taxAmount,
    serviceAmount: snapshot.totals.serviceAmount,
    payable: snapshot.totals.payable,
    taxInclusive: snapshot.totals.taxInclusive,
    taxRate: snapshot.totals.taxRate,
    serviceEnabled: snapshot.totals.serviceEnabled,
    serviceRate: snapshot.totals.serviceRate,
    taxLabel: snapshot.totals.taxLabel,
  };
}

export function RmGuestReceiptView({
  snapshot,
  reprint = false,
  reprintCount = 0,
  lastReprintedAt = null,
}: {
  snapshot: RmReceiptSnapshot;
  reprint?: boolean;
  reprintCount?: number;
  lastReprintedAt?: string | null;
}) {
  const money = (value: number) => formatMoney(value, snapshot.sale.currencyCode);
  const paidLabel = snapshot.sale.paidAt
    ? formatDateTimeInZone(snapshot.sale.paidAt, snapshot.sale.timezone)
    : null;
  const reprintLabel = lastReprintedAt
    ? formatDateTimeInZone(lastReprintedAt, snapshot.sale.timezone)
    : null;

  return (
    <article
      className="rm-guest-receipt mx-auto w-full max-w-[420px] bg-white px-6 py-8 text-[#251605]"
      style={{ color: RM_RECEIPT_BRAND.hero }}
    >
      {reprint ? (
        <div className="mb-6">
          <div
            className="rounded-md px-4 py-3 text-center text-sm font-extrabold uppercase tracking-[0.18em]"
            style={{ backgroundColor: RM_RECEIPT_BRAND.gold, color: RM_RECEIPT_BRAND.hero }}
          >
            Reprint / Duplicate
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: RM_RECEIPT_BRAND.hero }}>
            {reprintCount > 0 ? `Reprint ${reprintCount}` : "Duplicate"}
            {reprintLabel ? ` · ${reprintLabel}` : ""}
          </p>
        </div>
      ) : null}

      <header className="space-y-2 text-center">
        <h1 className="font-display text-3xl font-semibold leading-tight" style={{ color: RM_RECEIPT_BRAND.hero }}>
          {snapshot.header.name}
        </h1>
        {snapshot.header.addressLines.length > 0 ? (
          <p className="text-sm leading-relaxed text-[#444]">
            {snapshot.header.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        ) : null}
        {snapshot.header.phone || snapshot.header.email ? (
          <p className="text-sm text-[#444]">
            {[snapshot.header.phone, snapshot.header.email].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>

      <p className="mt-6 text-center text-sm text-[#444]">
        Sale #{snapshot.sale.orderNumber}
        {paidLabel ? ` · ${paidLabel}` : ""}
        {` · ${snapshot.sale.channel}`}
      </p>

      <ul className="mt-6 divide-y" style={{ borderColor: RM_RECEIPT_BRAND.rule }}>
        {snapshot.lines.map((line, index) => (
          <li
            key={`${line.name}-${index}`}
            className="rm-guest-receipt-line flex justify-between gap-3 py-2 text-sm"
          >
            <span>
              {line.quantity}× {line.name}
            </span>
            <span className="tabular-nums">{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t pt-3" style={{ borderColor: RM_RECEIPT_BRAND.rule }}>
        <BillTotals bill={snapshotToBill(snapshot)} money={money} density="guest" />
        {snapshot.adjustments.discountReason && snapshot.totals.discount > 0 ? (
          <p className="mt-1 text-xs text-[#666]">Discount: {snapshot.adjustments.discountReason}</p>
        ) : null}
        {snapshot.adjustments.compReason && snapshot.totals.comp > 0 ? (
          <p className="mt-1 text-xs text-[#666]">Comp: {snapshot.adjustments.compReason}</p>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1 text-sm">
        {snapshot.tenders.map((tender, index) => (
          <li key={`${tender.method}-${index}`} className="flex justify-between gap-3">
            <span>
              {tender.label}
              {tender.reference ? ` · ${tender.reference}` : ""}
            </span>
            <span className="tabular-nums">{money(tender.amount)}</span>
          </li>
        ))}
      </ul>

      {snapshot.refunds.length > 0 ? (
        <div className="mt-4 border-t pt-3" style={{ borderColor: RM_RECEIPT_BRAND.rule }}>
          <p className="text-sm font-semibold">Refunds</p>
          <ul className="mt-1 space-y-1 text-sm">
            {snapshot.refunds.map((refund, index) => (
              <li key={`${refund.createdAt}-${index}`} className="flex justify-between gap-3">
                <span>{receiptTenderLabel(refund.method)}</span>
                <span className="tabular-nums">−{money(refund.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p
        className={cn("mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.16em]")}
        style={{ color: RM_RECEIPT_BRAND.green }}
      >
        Powered by NORU
      </p>
    </article>
  );
}
