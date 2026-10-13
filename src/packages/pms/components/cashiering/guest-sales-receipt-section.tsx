import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import {
  getGuestInvoiceSalesReceiptFiscal,
  registerGuestAllocationSalesReceipt,
} from "@/packages/pms/lib/fiscal/fiscal.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

const STATUS_LABEL = {
  not_registered: "Not registered",
  not_eligible: "Not eligible",
  queued: "Queued",
  registered: "Registered",
  failed: "Failed",
} as const;

export function GuestSalesReceiptSection({
  restaurantId,
  invoiceId,
  canRegister,
  canInspect,
  money,
}: {
  restaurantId: string;
  invoiceId: string;
  canRegister: boolean;
  canInspect: boolean;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getGuestInvoiceSalesReceiptFiscal);
  const register = useServerFn(registerGuestAllocationSalesReceipt);
  const [allocationId, setAllocationId] = useState<string | null>(null);
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["guest-sales-receipts", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const mutation = useMutation({
    mutationFn: (id: string) => register({ data: { restaurantId, allocationId: id } }),
    onSuccess: async (result) => {
      setAllocationId(null);
      await queryClient.invalidateQueries({
        queryKey: ["guest-sales-receipts", restaurantId, invoiceId],
      });
      if (result.status === "registered") toast.success("Fiscal sales receipt registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal sales receipt is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const lines = query.data?.lines ?? [];
  const selected = lines.find((line) => line.allocationId === allocationId) ?? null;

  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-sm"
      data-testid="guest-sales-receipts"
    >
      <div className="mb-3 flex items-center gap-2">
        <ReceiptText className="size-4 text-[#8a6a1f]" />
        <h3 className="text-sm font-semibold text-[#251605]">Fiscal sales receipts</h3>
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading receipts…</p> : null}
      {!query.isLoading && lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payment has been allocated to this invoice.
        </p>
      ) : null}
      {lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E8E1D7] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Allocated</th>
                <th className="px-2 py-2 font-medium">Coverage</th>
                <th className="px-2 py-2 font-medium">Remaining</th>
                <th className="px-2 py-2 font-medium">Fiscal status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.allocationId} className="border-b border-[#E8E1D7] align-top">
                  <td className="px-2 py-2 tabular-nums">{money(line.amount)}</td>
                  <td className="px-2 py-2">{line.preview?.coverage ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {line.preview ? money(line.preview.remaining) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <p>{STATUS_LABEL[line.status]}</p>
                    {line.status === "registered" && line.registration ? (
                      <p className="text-xs text-muted-foreground">
                        {line.registration.documentNumber ?? "—"} · {line.registration.irn ?? "—"}
                      </p>
                    ) : null}
                    {line.reasons.map((reason) => (
                      <p key={reason} className="text-xs text-muted-foreground">
                        {reason}
                      </p>
                    ))}
                    {line.warning ? (
                      <p className="text-xs text-muted-foreground">{line.warning}</p>
                    ) : null}
                    {line.status === "failed" && line.registration?.lastError ? (
                      <p className="text-xs text-destructive">{line.registration.lastError}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canRegister && line.canRegister ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setAllocationId(line.allocationId)}
                      >
                        Register fiscal sales receipt
                      </Button>
                    ) : null}
                    {canRegister && line.canRetry ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(line.allocationId)}
                      >
                        Retry
                      </Button>
                    ) : null}
                    {canInspect && line.registration?.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        onClick={() => setExchangeId(line.registration?.id ?? null)}
                      >
                        View API exchange
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setAllocationId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register fiscal sales receipt</DialogTitle>
            <DialogDescription>
              This registers the existing allocation. It does not post another payment.
            </DialogDescription>
          </DialogHeader>
          {selected?.preview ? (
            <div className="space-y-1 text-sm">
              <p>Invoice: {selected.preview.invoiceNumber ?? "—"}</p>
              <p>Fiscal invoice document no.: {selected.preview.fiscalDocumentNumber}</p>
              <p>Invoice IRN: {selected.preview.invoiceIrn}</p>
              <p>Payment / allocation: {money(selected.amount)}</p>
              <p>Invoice total: {money(selected.preview.invoiceTotal)}</p>
              <p>This payment: {money(selected.preview.paid)}</p>
              <p>Remaining after payment: {money(selected.preview.remaining)}</p>
              <p>Payment coverage: {selected.preview.coverage}</p>
              <p>Transaction type: {selected.preview.transactionType}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAllocationId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || !selected}
              onClick={() => selected && mutation.mutate(selected.allocationId)}
            >
              {mutation.isPending ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {canInspect && exchangeId ? (
        <FiscalExchangeDrawer
          open={Boolean(exchangeId)}
          onOpenChange={(open) => !open && setExchangeId(null)}
          restaurantId={restaurantId}
          registrationId={exchangeId}
        />
      ) : null}
    </section>
  );
}
