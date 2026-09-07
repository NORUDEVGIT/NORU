/**
 * Phase 8H6 — one receipt renderer for the whole till.
 *
 * Both the sell screen (immediately after completing a sale) and the
 * transaction detail screen (reprint) render this. There is no second store
 * of receipt text: everything comes from `pos_sales`, `pos_sale_items` and
 * `pos_payments` snapshots taken at the moment of sale, so a later catalog
 * edit can never change an old receipt. Rendering is presentation only — it
 * never changes totals, the receipt number or the sale's state.
 */
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";

export const TENDER_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  voucher: "Voucher",
  other: "Other",
};

export function tenderLabel(method: string) {
  return TENDER_LABEL[method] ?? method;
}

export type ReceiptData = {
  reference: string | null;
  register: string;
  cashier: string;
  completedAt: string | null;
  businessDate: string;
  lines: { name: string; quantity: number; unitPrice?: number; lineTotal: number }[];
  subtotal?: number;
  discountAmount?: number;
  taxAmount: number;
  total: number;
  payments: { method: string; amount: number; change?: number }[];
  refunds?: { method: string; amount: number; createdAt: string }[];
};

export function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const change = receipt.payments.reduce((sum, p) => sum + (p.change ?? 0), 0);

  return (
    <div className="text-sm">
      <dl className="grid gap-1 sm:grid-cols-2">
        <Row label="Receipt" value={receipt.reference ?? "—"} />
        <Row label="Register" value={receipt.register} />
        <Row label="Cashier" value={receipt.cashier} />
        <Row label="Time" value={receipt.completedAt ? dateTime(receipt.completedAt) : "—"} />
        <Row label="Business date" value={receipt.businessDate} />
      </dl>

      <ul className="mt-4 space-y-1 border-t border-border pt-3">
        {receipt.lines.map((l, index) => (
          <li key={index} className="flex justify-between gap-4">
            <span>
              {l.quantity} × {l.name}
              {l.unitPrice !== undefined ? (
                <span className="text-muted-foreground"> · {money(l.unitPrice)} each</span>
              ) : null}
            </span>
            <span className="tabular-nums">{money(l.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border pt-3">
        {receipt.subtotal !== undefined ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(receipt.subtotal)}</span>
          </div>
        ) : null}
        {receipt.discountAmount ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="tabular-nums">−{money(receipt.discountAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="tabular-nums">{money(receipt.taxAmount)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(receipt.total)}</span>
        </div>
        {receipt.payments.map((p, index) => (
          <div key={index} className="flex justify-between text-muted-foreground">
            <span>{tenderLabel(p.method)}</span>
            <span className="tabular-nums">{money(p.amount)}</span>
          </div>
        ))}
        {change > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Change given</span>
            <span className="tabular-nums">{money(change)}</span>
          </div>
        ) : null}
      </div>

      {receipt.refunds && receipt.refunds.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <p className="text-muted-foreground">Refunds</p>
          {receipt.refunds.map((r, index) => (
            <div key={index} className="flex justify-between">
              <span>
                {tenderLabel(r.method)} refund · {dateTime(r.createdAt)}
              </span>
              <span className="tabular-nums">−{money(r.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
