import {
  FISCAL_INVOICE_LIST_LABEL,
  type FiscalInvoiceListStatus,
} from "@/packages/pms/lib/fiscal/fiscal-invoice-list-status";
import { cn } from "@/shared/lib/utils";

const STATUS_CLASS: Record<FiscalInvoiceListStatus, string> = {
  registered: "bg-emerald-50 text-emerald-800",
  error: "bg-red-50 text-red-800",
  queued: "bg-amber-50 text-amber-900",
  not_registered: "bg-[#F7F4EE] text-[#7A6B58]",
};

export function FiscalInvoiceStatusBadge({
  status,
  error,
}: {
  status: FiscalInvoiceListStatus;
  error?: string | null;
}) {
  return (
    <span
      title={status === "error" ? (error ?? undefined) : undefined}
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status],
      )}
    >
      {FISCAL_INVOICE_LIST_LABEL[status]}
    </span>
  );
}
