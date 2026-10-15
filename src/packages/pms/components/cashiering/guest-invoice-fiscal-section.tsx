import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Building2, ShieldCheck, User } from "lucide-react";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import { FiscalSettlementSummaryCard } from "@/packages/pms/components/cashiering/fiscal-settlement-summary";
import { GuestTaxIdentityDialog } from "@/packages/pms/components/guests/guest-tax-identity-editor";
import {
  getGuestInvoiceFiscal,
  registerGuestInvoiceFiscal,
} from "@/packages/pms/lib/fiscal/fiscal.functions";
import { defaultFiscalCustomerType } from "@/packages/pms/lib/guest-tax-identities";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

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
  const [identityOpen, setIdentityOpen] = useState(false);
  const [fiscalType, setFiscalType] = useState<"B2C" | "B2B">(defaultFiscalCustomerType());
  const [taxIdentityId, setTaxIdentityId] = useState("");
  const query = useQuery({
    queryKey: ["guest-invoice-fiscal", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const mutation = useMutation({
    mutationFn: (body: { fiscalType?: "B2C" | "B2B"; taxIdentityId?: string }) =>
      register({ data: { restaurantId, invoiceId, ...body } }),
    onSuccess: async (result) => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["guest-invoice-fiscal", restaurantId, invoiceId],
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["guest-invoice-settlement", restaurantId] }),
        queryClient.invalidateQueries({
          queryKey: ["guest-sales-receipts", restaurantId, invoiceId],
        }),
      ]);
      if (result.status === "registered") toast.success("Fiscal invoice registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal registration is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const state = query.data;
  const selectedIdentity =
    state?.taxIdentities.find((identity) => identity.id === taxIdentityId) ?? null;
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
        {canRegister && state?.canRegister && !state.choiceLocked ? (
          <Button
            type="button"
            onClick={() => {
              setFiscalType(defaultFiscalCustomerType());
              setTaxIdentityId(
                state.taxIdentities.find((identity) => identity.isDefault)?.id ?? "",
              );
              setOpen(true);
            }}
            data-testid="register-fiscal-invoice"
          >
            Register fiscal invoice
          </Button>
        ) : null}
        {canRegister && state?.canRetry ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({})}
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
        <DialogContent className="max-h-[90vh] sm:max-w-xl overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Register Fiscal Invoice
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Verify fiscal customer type and transmit legal electronic registration.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
            {/* Customer Type Choice Cards */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                Fiscal Customer Classification
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFiscalType("B2C")}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all shadow-2xs",
                    fiscalType === "B2C"
                      ? "border-[#C89933] bg-white ring-2 ring-[#C89933]/20"
                      : "border-[#E8E1D7] bg-white/70 hover:bg-white text-[#7A6B58]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "grid size-7 place-items-center rounded-lg",
                        fiscalType === "B2C"
                          ? "bg-[#FAF5EB] text-[#8A641A]"
                          : "bg-neutral-100 text-neutral-500",
                      )}
                    >
                      <User className="size-3.5" />
                    </div>
                    <span className="font-semibold text-xs text-[#251605]">Consumer (B2C)</span>
                  </div>
                  <p className="mt-2 text-[11px] text-[#7A6B58]">
                    Standard retail / individual guest receipt without company TIN.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFiscalType("B2B")}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all shadow-2xs",
                    fiscalType === "B2B"
                      ? "border-[#C89933] bg-white ring-2 ring-[#C89933]/20"
                      : "border-[#E8E1D7] bg-white/70 hover:bg-white text-[#7A6B58]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "grid size-7 place-items-center rounded-lg",
                        fiscalType === "B2B"
                          ? "bg-[#FAF5EB] text-[#8A641A]"
                          : "bg-neutral-100 text-neutral-500",
                      )}
                    >
                      <Building2 className="size-3.5" />
                    </div>
                    <span className="font-semibold text-xs text-[#251605]">Business (B2B)</span>
                  </div>
                  <p className="mt-2 text-[11px] text-[#7A6B58]">
                    Corporate customer with legal registered TIN and VAT number.
                  </p>
                </button>
              </div>
            </div>

            {/* B2B Buyer Identity */}
            {fiscalType === "B2B" ? (
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="buyer-identity" className="text-xs font-semibold text-[#251605]">
                    Select Buyer Tax Identity
                  </label>
                  {state?.guestId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIdentityOpen(true)}
                      className="h-6 text-[11px] text-[#8A641A] hover:bg-[#FAF5EB] font-semibold px-2"
                    >
                      + Add New Identity
                    </Button>
                  ) : null}
                </div>

                <select
                  id="buyer-identity"
                  className="h-9 w-full rounded-lg border border-[#DDD4C5] bg-white px-3 text-xs text-[#251605] shadow-2xs focus:border-[#C89933] focus:outline-none focus:ring-2 focus:ring-[#C89933]/20"
                  value={taxIdentityId}
                  onChange={(event) => setTaxIdentityId(event.target.value)}
                >
                  <option value="">Choose an active tax identity...</option>
                  {(state?.taxIdentities ?? []).map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.legalName} — TIN {identity.tin}
                    </option>
                  ))}
                </select>

                {selectedIdentity ? (
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-[#8A641A]" />
                        <span className="font-semibold text-xs text-[#251605]">
                          {selectedIdentity.legalName}
                        </span>
                      </div>
                      <span className="rounded bg-[#C89933]/15 px-2 py-0.5 text-[10px] font-bold text-[#8A641A]">
                        TIN {selectedIdentity.tin}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5 border border-amber-200/60">
                    A verified tax identity is required for B2B fiscal invoice registration.
                  </p>
                )}
              </div>
            ) : null}

            {/* Document Totals Card */}
            {state?.preview ? (
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#251605]">NORU Document Totals</span>
                  <span className="rounded-md border border-[#E8E1D7] bg-[#FAF8F5] px-2 py-0.5 text-[11px] font-medium text-[#7A6B58]">
                    Invoice {state.preview.invoiceNumber}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Pretax Base</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(state.preview.pretax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2.5">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Tax Amount</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(state.preview.tax)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#C89933]/30 bg-[#FAF5EB] p-2.5">
                    <p className="text-[10px] font-medium text-[#8A641A]">Grand Total</p>
                    <p className="font-display text-sm font-bold tabular-nums text-[#251605]">
                      {money(state.preview.total)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

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
              disabled={mutation.isPending || (fiscalType === "B2B" && !selectedIdentity)}
              onClick={() =>
                mutation.mutate({
                  fiscalType,
                  taxIdentityId: fiscalType === "B2B" ? taxIdentityId : undefined,
                })
              }
              className="h-9 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-4 shadow-xs"
            >
              {mutation.isPending ? "Registering…" : "Confirm Fiscal Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state?.guestId ? (
        <GuestTaxIdentityDialog
          open={identityOpen}
          onOpenChange={setIdentityOpen}
          restaurantId={restaurantId}
          guestId={state.guestId}
          prefill={state.guestPrefill}
          onSaved={async (id) => {
            setTaxIdentityId(id);
            setFiscalType("B2B");
            await queryClient.invalidateQueries({
              queryKey: ["guest-invoice-fiscal", restaurantId, invoiceId],
            });
          }}
        />
      ) : null}
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
