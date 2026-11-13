import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useMoney } from "@/core/state/property-format";
import { cashieringRefundHref } from "@/packages/pms/lib/fo-cancel-noshow";
import {
  listCancellationSettlementExceptions,
  rerunCancellationSettlement,
  type CancellationSettlementException,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { Button } from "@/shared/components/ui/button";

function nextStep(row: CancellationSettlementException): string {
  if (row.pendingCount > 0) return "Credit note or folio correction";
  if (row.reversibleAmount > 0) return "Run settlement";
  if (row.refundDue > 0) return "Refund due";
  if (row.amountDue > 0) return "Amount due";
  return "Review";
}

/** Cancelled and no-show stays whose open folio still carries money to settle. */
export function CancellationSettlementReport({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listCancellationSettlementExceptions);
  const rerun = useServerFn(rerunCancellationSettlement);
  const query = useQuery({
    queryKey: ["cancellation-settlement-exceptions", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
    retry: false,
  });
  const rerunMut = useMutation({
    mutationFn: (row: CancellationSettlementException) =>
      rerun({
        data: {
          restaurantId,
          reservationId: row.reservationId,
          kind: row.status === "no_show" ? "noshow" : "cancel",
        },
      }),
    onSuccess: async (result) => {
      if (result.settlementError) toast.error(result.settlementError);
      else toast.success("Settlement ran again.");
      await queryClient.invalidateQueries({
        queryKey: ["cancellation-settlement-exceptions", restaurantId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading || query.isError) return null;
  const rows = query.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-amber-200" data-testid="cancellation-settlement-report">
      <header className="bg-amber-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Folio settlement needed</h2>
        <p className="text-xs text-amber-900/80">
          Cancelled and no-show stays with an open folio that still has charges to reverse or money to settle.
        </p>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Confirmation</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Folio</th>
            <th className="px-4 py-2 text-right">To reverse</th>
            <th className="px-4 py-2 text-right">Refund due</th>
            <th className="px-4 py-2 text-right">Amount due</th>
            <th className="px-4 py-2">Next step</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reservationId} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{row.confirmationNumber}</td>
              <td className="px-4 py-2">{row.status === "no_show" ? "No-show" : "Cancelled"}</td>
              <td className="px-4 py-2">{row.folioNumber ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(row.reversibleAmount)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(row.refundDue)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(row.amountDue)}</td>
              <td className="px-4 py-2 text-muted-foreground">{nextStep(row)}</td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-2">
                  {row.reversibleAmount > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={rerunMut.isPending}
                      onClick={() => rerunMut.mutate(row)}
                    >
                      Run settlement
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <a href={cashieringRefundHref(row.folioNumber)}>Cashiering</a>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
