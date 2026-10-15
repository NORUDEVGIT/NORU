import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Building2, ShieldCheck } from "lucide-react";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import { FiscalSettlementSummaryCard } from "@/packages/pms/components/cashiering/fiscal-settlement-summary";
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-invoice-settlement", restaurantId] }),
        queryClient.invalidateQueries({
          queryKey: ["company-sales-receipts", restaurantId, invoiceId],
        }),
      ]);
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
      {state?.settlement ? <FiscalSettlementSummaryCard settlement={state.settlement} /> : null}
      {!canRegister && !state?.registration ? (
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          A manager registers this invoice.
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
        <DialogContent className="max-h-[90vh] sm:max-w-lg overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Register Fiscal Corporate Invoice
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Legal B2B tax registration with certified electronic fiscal device.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {preview ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              {/* Company Identity Card */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E8E1D7]/70 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-[#8A641A]" />
                    <span className="font-semibold text-xs text-[#251605]">
                      {preview.legalName}
                    </span>
                  </div>
                  <span className="rounded bg-[#C89933]/15 px-2 py-0.5 text-[10px] font-bold text-[#8A641A]">
                    TIN {preview.tin}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#7A6B58] pt-1">
                  <div>Invoice: {preview.invoiceNumber || "—"}</div>
                  <div className="rounded bg-[#F4EFE6] px-1.5 py-0.5 text-[10px] font-medium text-[#7A6B58]">
                    B2B Electronic Invoice
                  </div>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <span className="font-semibold text-xs text-[#251605]">
                  Fiscal Verification Totals
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Pretax Base</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(preview.pretax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Tax Amount</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(preview.tax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#C89933]/30 bg-[#FAF5EB] p-2.5">
                    <p className="text-[10px] font-medium text-[#8A641A]">Grand Total</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(preview.total)}
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
              {mutation.isPending ? "Registering…" : "Confirm Fiscal Registration"}
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
