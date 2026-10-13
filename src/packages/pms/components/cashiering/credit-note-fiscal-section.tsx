import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register fiscal credit note</DialogTitle>
            <DialogDescription>
              Item identity comes from the original fiscal invoice. Amounts come from this credit
              note.
            </DialogDescription>
          </DialogHeader>
          {state?.preview ? (
            <div className="space-y-1 text-sm">
              <p>Credit note: {state.preview.noteNumber}</p>
              <p>Original invoice: {state.preview.originalInvoiceNumber ?? "—"}</p>
              <p>Original fiscal document: {state.preview.originalFiscalDocumentNumber ?? "—"}</p>
              <p>Related IRN: {state.preview.relatedIrn}</p>
              <p>Transaction type: {state.preview.transactionType}</p>
              <p>Currency: {state.preview.currency}</p>
              <p>Pretax credit: {money(state.preview.pretax)}</p>
              <p>Tax credit: {money(state.preview.tax)}</p>
              <p>Total credit: {money(state.preview.total)}</p>
              {state.preview.lines.map((line) => (
                <p key={`${line.itemCode}-${line.productDescription}`}>
                  {line.productDescription} · Item {line.itemCode} · {money(line.creditedAmount)}
                </p>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Registering..." : "Register"}
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
