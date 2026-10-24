import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { FinancialAccountWorkspacePage } from "@/packages/pms/components/cashiering/financial-account-workspace";

/** Canonical account route. Invoices stay inside the workspace Invoices tab. */
export function AccountInvoicePage({
  membership,
  accountId,
  initialTab,
  initialAction,
  invoiceId,
  paymentId,
}: {
  membership: RestaurantMembership;
  accountId: string;
  initialTab?: string | undefined;
  initialAction?: string | undefined;
  invoiceId?: string | undefined;
  paymentId?: string | undefined;
}) {
  return (
    <FinancialAccountWorkspacePage
      membership={membership}
      accountId={accountId}
      initialTab={initialTab}
      initialAction={initialAction}
      invoiceId={invoiceId}
      paymentId={paymentId}
    />
  );
}
