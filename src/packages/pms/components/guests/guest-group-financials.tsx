import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getGroupFinancials } from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_FINANCIAL_COPY } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupFinancials({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const load = useServerFn(getGroupFinancials);
  const query = useQuery({
    queryKey: ["group-financials", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });
  const data = query.data;

  return (
    <div className="space-y-4" data-testid="group-financials">
      <div>
        <h2 className="font-display text-xl">Financial summary</h2>
        <p className="text-sm text-muted-foreground">{GROUP_FINANCIAL_COPY}</p>
      </div>
      {!data?.folioAccess ? (
        <p className="text-sm text-muted-foreground">Folio amounts are hidden for this role.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Estimated revenue", value: data.summary.estimatedRevenue },
            { label: "Total charges", value: data.summary.totalCharges },
            { label: "Total payments", value: data.summary.totalPayments },
            { label: "Outstanding", value: data.summary.outstandingBalance },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="font-display text-2xl">{item.value.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-dashed border-border p-4">
        <h3 className="font-medium">Group invoices</h3>
        <p className="text-sm text-muted-foreground">{data?.invoices.reason}</p>
      </div>
    </div>
  );
}
