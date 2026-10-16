import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ArrowDownLeft, FileText, ShieldCheck } from "lucide-react";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import {
  getCreditNoteFiscal,
  registerCreditNoteFiscal,
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

export function CreditNoteFiscalSection({
  restaurantId,
  creditNoteId,
  canRegister,
  canInspect,
  money,
}: {
  restaurantId: string;
  creditNoteId: string;
  canRegister: boolean;
  canInspect: boolean;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCreditNoteFiscal);
  const register = useServerFn(registerCreditNoteFiscal);
  const [open, setOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const query = useQuery({
    queryKey: ["credit-note-fiscal", restaurantId, creditNoteId],
    queryFn: () => load({ data: { restaurantId, creditNoteId } }),
  });
  const mutation = useMutation({
    mutationFn: () => register({ data: { restaurantId, creditNoteId } }),
    onSuccess: async (result) => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["credit-note-fiscal", restaurantId, creditNoteId],
      });
      if (result.status === "registered") toast.success("Fiscal credit note registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal registration is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const state = query.data;
  const statusLabel =
    state?.status === "registered"
      ? "Registered"
      : state?.status === "queued"
        ? "Queued"
        : state?.status === "failed"
          ? "Failed"
          : state?.status === "not_eligible"
            ? "Not eligible"
            : "Not registered";

  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4"
      data-testid="credit-note-fiscal"
    >
      <h3 className="text-sm font-semibold text-[#251605]">Fiscal registration</h3>
      <p className="mt-2 text-sm text-[#251605]">
        Status: {query.isLoading ? "Loading" : statusLabel}
      </p>
      {state?.status === "not_eligible" ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {state.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {state?.missingDevice ? <p className="mt-2 text-sm">Device ID is missing.</p> : null}
      {state?.status === "registered" && state.registration ? (
        <div className="mt-3 space-y-1 text-sm">
          <p>Fiscal document number: {state.registration.documentNumber}</p>
          <p>IRN: {state.registration.irn}</p>
          <p>Acknowledged at: {state.registration.acknowledgedAt ?? "Not supplied"}</p>
          <p>Registered at: {state.registration.registeredAt ?? "—"}</p>
          {state.registration.qrSrc ? (
            <img src={state.registration.qrSrc} alt="Signed fiscal QR" className="mt-2 h-28 w-28" />
          ) : state.registration.qrStored ? (
            <p>Signed QR is stored.</p>
          ) : null}
        </div>
      ) : null}
      {state?.status === "failed" && state.registration?.lastError ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-destructive">
          {state.registration.lastError}
        </p>
      ) : null}
      <div
        className={
          (canRegister && (state?.canRegister || state?.canRetry)) ||
          (canInspect && state?.registration?.id)
            ? "mt-3 flex flex-wrap gap-2"
            : "hidden"
        }
      >
        {canRegister && state?.canRegister ? (
          <Button type="button" onClick={() => setOpen(true)}>
            Register fiscal credit note
          </Button>
        ) : null}
        {canRegister && state?.canRetry ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Retrying..." : "Retry fiscal registration"}
          </Button>
        ) : null}
        {canInspect && state?.registration?.id ? (
          <Button type="button" variant="outline" onClick={() => setExchangeOpen(true)}>
            View API exchange
          </Button>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-xl overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-xs">
                <ArrowDownLeft className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Register Fiscal Credit Note
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Legal credit memo registration referencing the original fiscal invoice and IRN.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {state?.preview ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              {/* Document Reference Info */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E8E1D7]/70 pb-2">
                  <span className="font-semibold text-xs text-[#251605]">Credit Note Reference</span>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    {state.preview.noteNumber}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7A6B58]">
                  <div>Original Invoice: {state.preview.originalInvoiceNumber ?? "—"}</div>
                  <div>Fiscal Doc: {state.preview.originalFiscalDocumentNumber ?? "—"}</div>
                  <div className="col-span-2 truncate">Related IRN: {state.preview.relatedIrn || "—"}</div>
                  <div>Type: {state.preview.transactionType}</div>
                  <div>Currency: {state.preview.currency}</div>
                </div>
              </div>

              {/* Credited Lines */}
              {state.preview.lines.length > 0 ? (
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2">
                  <span className="font-semibold text-xs text-[#251605]">Credited Item Adjustments</span>
                  <div className="divide-y divide-[#E8E1D7]/60 text-xs">
                    {state.preview.lines.map((line) => (
                      <div
                        key={`${line.itemCode}-${line.productDescription}`}
                        className="flex items-center justify-between py-1.5"
                      >
                        <div>
                          <p className="font-medium text-[#251605]">{line.productDescription}</p>
                          <p className="text-[10px] text-[#7A6B58]">Item code: {line.itemCode}</p>
                        </div>
                        <span className="font-semibold tabular-nums text-blue-700">
                          {money(line.creditedAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Totals Summary */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <span className="font-semibold text-xs text-[#251605]">Credit Note Totals</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Pretax Credit</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(state.preview.pretax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Tax Credit</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(state.preview.tax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5">
                    <p className="text-[10px] font-medium text-blue-800">Total Credit</p>
                    <p className="font-display text-sm font-bold tabular-nums text-blue-900">
                      {money(state.preview.total)}
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
              onClick={() => setOpen(false)}
              className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="h-9 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-4 shadow-xs"
            >
              {mutation.isPending ? "Registering…" : "Confirm Fiscal Credit Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {canInspect && state?.registration?.id ? (
        <FiscalExchangeDrawer
          open={exchangeOpen}
          onOpenChange={setExchangeOpen}
          restaurantId={restaurantId}
          registrationId={state.registration.id}
        />
      ) : null}
    </section>
  );
}
