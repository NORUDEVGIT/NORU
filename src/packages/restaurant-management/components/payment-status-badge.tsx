import { cn } from "@/shared/lib/utils";
import {
  PAYMENT_STATUS_LABEL,
  type RestaurantPaymentStatus,
} from "@/packages/restaurant-management/lib/rm-refunds";

/** Payment badges — colour and wording stay distinct from kitchen OrderStatusBadge. */
const PAYMENT_STYLES: Record<RestaurantPaymentStatus, string> = {
  unpaid: "border border-border bg-background text-muted-foreground",
  paid: "border border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  partially_refunded: "border border-orange-600/30 bg-orange-500/12 text-orange-800 dark:text-orange-300",
  refunded: "border border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: RestaurantPaymentStatus;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={`Payment: ${PAYMENT_STATUS_LABEL[status]}`}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        PAYMENT_STYLES[status],
        className,
      )}
    >
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}
