import { ArrowRightLeft, CreditCard } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export type InvoiceSettlementStatus = "Unpaid" | "Partially Paid" | "Paid" | "No Amount Due";

export function InvoiceSettlementStrip({
  total,
  allocated,
  outstanding,
  status,
  withholding = 0,
  availableUnallocated = 0,
  expectedMode,
  fiscalReason,
  registered,
  canReceive,
  canAllocate,
  canFiscalRegister,
  money,
  onReceive,
  onAllocate,
}: {
  total: number;
  allocated: number;
  outstanding: number;
  status: InvoiceSettlementStatus;
  withholding?: number;
  availableUnallocated?: number;
  expectedMode: "CASH" | "CREDIT" | null;
  fiscalReason: string | null;
  registered: boolean;
  canReceive: boolean;
  canAllocate: boolean;
  canFiscalRegister: boolean;
  money: (value: number) => string;
  onReceive: () => void;
  onAllocate: () => void;
}) {
  return (
    <div
      className="mt-3 grid gap-3 rounded-xl border border-[#E8E1D7] bg-[#FAF8F5] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]"
      data-testid="invoice-settlement-strip"
    >
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Invoice Total" value={money(total)} />
          <Metric label="Payments Allocated" value={money(allocated)} positive={allocated > 0} />
          <Metric label="Outstanding" value={money(outstanding)} warning={outstanding > 0.01} />
          <Metric label="Settlement Status" value={status} />
          {withholding > 0.009 ? <Metric label="Withholding" value={money(withholding)} /> : null}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          {canReceive && outstanding > 0.01 ? (
            <Button
              type="button"
              size="sm"
              onClick={onReceive}
              className="gap-1.5 bg-[#146C43] text-white hover:bg-[#0E5232]"
              data-testid="invoice-receive-payment"
            >
              <CreditCard className="size-3.5" />
              Receive Payment
            </Button>
          ) : null}
          {canAllocate && availableUnallocated > 0.009 && outstanding > 0.01 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAllocate}
              className="gap-1.5 border-[#DDD4C5] bg-white"
              data-testid="invoice-allocate-existing"
            >
              <ArrowRightLeft className="size-3.5" />
              Allocate Existing
            </Button>
          ) : null}
          {availableUnallocated > 0.009 ? (
            <span className="text-[11px] text-[#7A6B58]">
              {money(availableUnallocated)} available in unallocated payments
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[#E8E1D7] bg-white p-3 text-xs">
        <p className="font-medium uppercase tracking-wider text-[#7A6B58]">
          {registered ? "Registered Fiscal Mode" : "Expected Fiscal Mode"}
        </p>
        <p
          className={cn(
            "mt-1 font-display text-lg font-bold",
            expectedMode === "CASH" ? "text-emerald-700" : "text-[#8A641A]",
          )}
        >
          {expectedMode ?? "Loading"}
        </p>
        {fiscalReason ? <p className="mt-1 text-[#5F554B]">{fiscalReason}</p> : null}
        {!registered && !canFiscalRegister ? (
          <p className="mt-2 font-medium text-[#7A6B58]">A manager registers this invoice.</p>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#E8E1D7] bg-white px-2.5 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-[#7A6B58]">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-bold tabular-nums text-[#251605]",
          positive && "text-emerald-700",
          warning && "text-amber-900",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
