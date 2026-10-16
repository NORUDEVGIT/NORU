import {
  FISCAL_INVOICE_LIST_LABEL,
  type FiscalInvoiceListStatus,
} from "@/packages/pms/lib/fiscal/fiscal-invoice-list-status";
import { cn } from "@/shared/lib/utils";

const STATUS_CONFIG: Record<
  FiscalInvoiceListStatus,
  { badge: string; dot: string }
> = {
  registered: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  error: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  queued: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500 animate-pulse",
  },
  not_registered: {
    badge: "border-[#E8E1D7] bg-[#F7F4EE] text-[#7A6B58]",
    dot: "bg-neutral-400",
  },
};

export function FiscalInvoiceStatusBadge({
  status,
  error,
}: {
  status: FiscalInvoiceListStatus;
  error?: string | null;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_registered;
  return (
    <span
      title={status === "error" ? (error ?? undefined) : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        config.badge,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", config.dot)} />
      <span>{FISCAL_INVOICE_LIST_LABEL[status]}</span>
    </span>
  );
}
