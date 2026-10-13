import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import {
  getCompanyInvoiceFiscal,
  registerCompanyInvoiceFiscal,
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

export function CompanyInvoiceFiscalSection({
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
  const load = useServerFn(getCompanyInvoiceFiscal);
  const register = useServerFn(registerCompanyInvoiceFiscal);
  const [open, setOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const query = useQuery({
    queryKey: ["company-invoice-fiscal", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const mutation = useMutation({
    mutationFn: () => register({ data: { restaurantId, invoiceId } }),
    onSuccess: async (result) => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["company-invoice-fiscal", restaurantId, invoiceId],
      });
      if (result.status === "registered") toast.success("Fiscal company invoice registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal registration is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const state = query.data;
  const preview = state?.preview;
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
  const buyerFix = state?.reasons.some(
    (reason) => reason.includes("legal name") || reason.includes("TIN"),
  );

  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-sm"
      data-testid="company-invoice-fiscal"
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
      {buyerFix ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Correct the company profile before issuing the invoice. An issued invoice keeps the buyer
          identity it was given at issue.
        </p>
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
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Register fiscal company invoice
          </Button>
        ) : null}
        {canRegister && state?.canRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate()}>
            Retry
          </Button>
        ) : null}
        {canInspect && state?.registration?.id ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setExchangeOpen(true)}>
            View API exchange
          </Button>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register fiscal company invoice</DialogTitle>
            <DialogDescription>
              This registers the issued company invoice. It does not post another charge.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="space-y-1 text-sm">
              <p>Company invoice number: {preview.invoiceNumber || "—"}</p>
              <p>Company legal name: {preview.legalName}</p>
              <p>TIN: {preview.tin}</p>
              {preview.vatNumber ? <p>Registration / VAT number: {preview.vatNumber}</p> : null}
              <p>Transaction type: B2B</p>
              <p>Currency: ETB</p>
              <p>Pretax: {money(preview.pretax)}</p>
              <p>Tax: {money(preview.tax)}</p>
              <p>Total: {money(preview.total)}</p>
              {preview.phone ? <p>Phone: {preview.phone}</p> : null}
              {preview.email ? <p>Email: {preview.email}</p> : null}
              {preview.city ? <p>City: {preview.city}</p> : null}
              {preview.region ? <p>Region: {preview.region}</p> : null}
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
