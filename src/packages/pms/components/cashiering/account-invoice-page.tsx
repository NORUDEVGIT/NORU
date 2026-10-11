import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { FinancialAccountWorkspacePage } from "@/packages/pms/components/cashiering/financial-account-workspace";

/** Canonical account route. Invoices stay inside the workspace Invoices tab. */
export function AccountInvoicePage({
  membership,
  accountId,
}: {
  membership: RestaurantMembership;
  accountId: string;
}) {
  return <FinancialAccountWorkspacePage membership={membership} accountId={accountId} />;
}
