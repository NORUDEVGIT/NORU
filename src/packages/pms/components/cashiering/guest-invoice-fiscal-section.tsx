import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import {
  getGuestInvoiceFiscal,
  registerGuestInvoiceFiscal,
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

const SETTINGS_HREF = "/restaurant/settings#connectivity-distribution";

export function GuestInvoiceFiscalSection({
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
  const load = useServerFn(getGuestInvoiceFiscal);
  const register = useServerFn(registerGuestInvoiceFiscal);
  const [open, setOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const query = useQuery({
    queryKey: ["guest-invoice-fiscal", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const mutation = useMutation({
    mutationFn: () => register({ data: { restaurantId, invoiceId } }),
    onSuccess: async (result) => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["guest-invoice-fiscal", restaurantId, invoiceId],
      });
      if (result.status === "registered") toast.success("Fiscal invoice registered.");
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
      data-testid="guest-invoice-fiscal"
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
      {state &&
      (state.missingTaxes.length > 0 || state.missingItems.length > 0 || state.missingDevice) ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-medium">Missing fiscal configuration</p>
          {state.missingTaxes.map((tax) => (
            <p key={tax}>Tax mapping: {tax} → Missing</p>
          ))}
          {state.missingItems.map((item) => (
            <p key={item}>Item mapping: {item} → Missing</p>
          ))}
          {state.missingDevice ? <p>Device ID is missing.</p> : null}
          <a
            className="inline-block text-sm font-medium text-[#8a6a1f] underline"
            href={SETTINGS_HREF}
          >
            Open fiscal settings
          </a>
        </div>
      ) : null}
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
        <p className="mt-2 text-sm text-destructive">{state.registration.lastError}</p>
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
          <Button type="button" onClick={() => setOpen(true)} data-testid="register-fiscal-invoice">
            Register fiscal invoice
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setExchangeOpen(true)}
            data-testid="view-fiscal-exchange"
          >
            View API exchange
          </Button>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register fiscal invoice</DialogTitle>
            <DialogDescription>
              These amounts come from the issued NORU invoice. Transaction type is B2C.
            </DialogDescription>
          </DialogHeader>
          {state?.preview ? (
            <div className="space-y-1 text-sm">
              <p>NORU invoice: {state.preview.invoiceNumber}</p>
              <p>Guest: {state.preview.guestName}</p>
              <p>Transaction type: B2C</p>
              <p>Currency: ETB</p>
              <p>Fiscal mode: {state.preview.mode}</p>
              <p>Pretax: {money(state.preview.pretax)}</p>
              <p>Tax: {money(state.preview.tax)}</p>
              <p>Total: {money(state.preview.total)}</p>
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
