import { cn } from "@/shared/lib/utils";
import type { RmBillTotals } from "@/packages/restaurant-management/lib/rm-tax";

export function BillTotals({
  bill,
  money,
  density = "default",
  preview = false,
}: {
  bill: RmBillTotals;
  money: (value: number) => string;
  density?: "default" | "till" | "guest";
  /** Settings preview always shows tax/service lines so the sample is honest. */
  preview?: boolean;
}) {
  const showTax = preview || bill.taxRate > 0 || bill.taxAmount > 0;
  const showService = preview || bill.serviceEnabled || bill.serviceAmount > 0;
  const compact = density === "till";
  const guest = density === "guest";

  return (
    <div
      className={cn(
        "space-y-1",
        compact ? "text-sm" : guest ? "text-base" : "text-sm",
      )}
    >
      <Row label="Items" value={money(bill.merchandiseSubtotal)} muted compact={compact} />
      {showTax ? (
        bill.taxInclusive ? (
          <Row
            label={bill.taxLabel}
            value={money(bill.taxAmount)}
            muted
            compact={compact}
            hint="Already in the item prices — not added again."
          />
        ) : (
          <Row label={bill.taxLabel} value={money(bill.taxAmount)} muted compact={compact} />
        )
      ) : null}
      {showService ? <Row label="Service" value={money(bill.serviceAmount)} muted compact={compact} /> : null}
      <Row label="Payable" value={money(bill.payable)} payable compact={compact} />
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  payable,
  compact,
  hint,
}: {
  label: string;
  value: string;
  muted?: boolean;
  payable?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  return (
    <div className={cn(payable && "pt-1")}>
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          muted && !payable && "text-muted-foreground",
          payable && (compact ? "text-xl font-bold" : "text-xl font-bold sm:text-2xl"),
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
