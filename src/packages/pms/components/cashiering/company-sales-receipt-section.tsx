import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ReceiptText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import { SalesReceiptCorrectionDialog } from "@/packages/pms/components/cashiering/sales-receipt-correction-dialog";
import { SalesReceiptFiscalResult } from "@/packages/pms/components/cashiering/sales-receipt-fiscal-result";
import {
  correctCompanySalesReceiptAllocation,
  getCompanyInvoiceSalesReceiptFiscal,
  registerCompanyAllocationSalesReceipt,
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

export function CompanySalesReceiptSection({
  restaurantId,
  invoiceId,
  canRegister,
  canInspect,
  canAllocate = false,
  money,
}: {
  restaurantId: string;
  invoiceId: string;
  canRegister: boolean;
  canInspect: boolean;
  canAllocate?: boolean;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCompanyInvoiceSalesReceiptFiscal);
  const register = useServerFn(registerCompanyAllocationSalesReceipt);
  const correct = useServerFn(correctCompanySalesReceiptAllocation);
  const [allocationId, setAllocationId] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["company-sales-receipts", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const mutation = useMutation({
    mutationFn: (id: string) => register({ data: { restaurantId, allocationId: id } }),
    onSuccess: async (result) => {
      setAllocationId(null);
      await queryClient.invalidateQueries({
        queryKey: ["company-sales-receipts", restaurantId, invoiceId],
      });
      if (result.status === "registered") toast.success("Fiscal sales receipt registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal sales receipt is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const correction = useMutation({
    mutationFn: (input: {
      allocationId: string;
      amount: number;
      idempotencyKey: string;
      providerUnregisteredConfirmed: boolean;
    }) => correct({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      setCorrectId(null);
      await queryClient.invalidateQueries({
        queryKey: ["company-sales-receipts", restaurantId, invoiceId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["account-invoice-settlement", restaurantId],
      });
      toast.success("Allocation corrected. Register the new sales receipt line.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const lines = query.data?.lines ?? [];
  const selected = lines.find((line) => line.allocationId === allocationId) ?? null;
  const correcting = lines.find((line) => line.allocationId === correctId) ?? null;

  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-sm"
      data-testid="company-sales-receipts"
    >
      <div className="mb-3 flex items-center gap-2">
        <ReceiptText className="size-4 text-[#8a6a1f]" />
        <h3 className="text-sm font-semibold text-[#251605]">Fiscal sales receipts</h3>
      </div>
      {query.data?.testAdjustmentWarning ? (
        <p
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          {query.data.testAdjustmentWarning}
        </p>
      ) : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading receipts…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : "Fiscal sales receipts could not be loaded."}
        </p>
      ) : null}
      {!query.isLoading && !query.isError && lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No company payment has been allocated to this invoice.
        </p>
      ) : null}
      {lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E8E1D7] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Payment</th>
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
                  <td className="px-2 py-2">Company payment</td>
                  <td className="px-2 py-2 tabular-nums">{money(line.amount)}</td>
                  <td className="px-2 py-2">{line.preview?.coverage ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {line.preview ? money(line.preview.remaining) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <p>{STATUS_LABEL[line.status]}</p>
                    {line.status === "registered" && line.registration ? (
                      <SalesReceiptFiscalResult
                        rrn={line.registration.rrn}
                        providerId={line.registration.providerId}
                        providerStatus={line.registration.providerStatus}
                        qrSrc={line.registration.qrSrc}
                      />
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
                    {line.correctionReason ? (
                      <p className="text-xs text-muted-foreground">{line.correctionReason}</p>
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
                    {canAllocate && line.canCorrect ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        onClick={() => setCorrectId(line.allocationId)}
                      >
                        Correct allocation
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
        <DialogContent className="max-h-[90vh] sm:max-w-lg overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-xs">
                <ReceiptText className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Register Fiscal Corporate Sales Receipt
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Legal B2B sales receipt registration for applied payment allocation.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selected?.preview ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              {query.data?.testAdjustmentWarning ? (
                <p
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  role="status"
                >
                  {query.data.testAdjustmentWarning}
                </p>
              ) : null}
              {/* Company & Document Reference Info */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E8E1D7]/70 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-[#8A641A]" />
                    <span className="font-semibold text-xs text-[#251605]">
                      {selected.preview.companyName}
                    </span>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {selected.preview.coverage.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7A6B58]">
                  <div>TIN: {selected.preview.tin || "—"}</div>
                  <div>VAT: {selected.preview.vatNumber || "—"}</div>
                  <div>Invoice: {selected.preview.invoiceNumber ?? "—"}</div>
                  <div>Fiscal Doc: {selected.preview.fiscalDocumentNumber || "—"}</div>
                  <div className="col-span-2 truncate">
                    Invoice IRN: {selected.preview.invoiceIrn || "—"}
                  </div>
                  <div>Type: B2B</div>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <span className="font-semibold text-xs text-[#251605]">Payment Allocation</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Allocated Amount</p>
                    <p className="font-display text-sm font-bold tabular-nums text-emerald-700">
                      {money(selected.amount)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Total Paid</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(selected.preview.paid)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Remaining Balance</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(selected.preview.remaining)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] bg-white px-6 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAllocationId(null)}
              className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || !selected}
              onClick={() => selected && mutation.mutate(selected.allocationId)}
              className="h-9 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-4 shadow-xs"
            >
              {mutation.isPending ? "Registering…" : "Confirm Sales Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SalesReceiptCorrectionDialog
        open={Boolean(correcting)}
        currentAmount={correcting?.amount ?? 0}
        needsConfirmation={correcting?.correctionNeedsConfirmation ?? false}
        money={money}
        pending={correction.isPending}
        onOpenChange={(open) => !open && setCorrectId(null)}
        onConfirm={(amount, idempotencyKey, providerUnregisteredConfirmed) => {
          if (!correcting) return;
          correction.mutate({
            allocationId: correcting.allocationId,
            amount,
            idempotencyKey,
            providerUnregisteredConfirmed,
          });
        }}
      />
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
