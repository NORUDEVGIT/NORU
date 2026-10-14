import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register fiscal invoice</DialogTitle>
            <DialogDescription>
              These amounts come from the issued NORU invoice. Choose the fiscal customer type. A
              saved tax identity does not select B2B by itself.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium text-[#251605]">Fiscal customer type</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fiscal-customer-type"
                checked={fiscalType === "B2C"}
                onChange={() => setFiscalType("B2C")}
              />
              Consumer — B2C
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fiscal-customer-type"
                checked={fiscalType === "B2B"}
                onChange={() => setFiscalType("B2B")}
              />
              TIN / Business — B2B
            </label>
          </fieldset>
          {fiscalType === "B2B" ? (
            <div className="space-y-2 text-sm">
              <label className="block font-medium text-[#251605]" htmlFor="buyer-identity">
                Buyer identity
              </label>
              <select
                id="buyer-identity"
                className="w-full rounded-md border border-[#DDD4C5] bg-white px-2 py-2"
                value={taxIdentityId}
                onChange={(event) => setTaxIdentityId(event.target.value)}
              >
                <option value="">Select a tax identity</option>
                {(state?.taxIdentities ?? []).map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.legalName} — TIN {identity.tin}
                  </option>
                ))}
              </select>
              {selectedIdentity ? (
                <div className="space-y-1 rounded-md bg-[#FAF8F5] p-3">
                  <p>Legal name: {selectedIdentity.legalName}</p>
                  <p>TIN: {selectedIdentity.tin}</p>
                  <p>Registration number: {selectedIdentity.registrationNumber ?? "—"}</p>
                  <p>Phone: {selectedIdentity.phone ?? "—"}</p>
                  <p>Email: {selectedIdentity.email ?? "—"}</p>
                  <p>City: {selectedIdentity.city ?? "—"}</p>
                  <p>Region: {selectedIdentity.region ?? "—"}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Select an active tax identity for this guest.
                </p>
              )}
              {state?.guestId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIdentityOpen(true)}
                >
                  + Add new tax identity
                </Button>
              ) : null}
            </div>
          ) : null}
          {state?.preview ? (
            <div className="space-y-1 text-sm">
              <p>Fiscal type: {fiscalType}</p>
              {fiscalType === "B2B" && selectedIdentity ? (
                <>
                  <p>Legal name: {selectedIdentity.legalName}</p>
                  <p>TIN: {selectedIdentity.tin}</p>
                  <p>Registration / VAT number: {selectedIdentity.registrationNumber ?? "—"}</p>
                  <p>Phone: {selectedIdentity.phone ?? "—"}</p>
                  <p>Email: {selectedIdentity.email ?? "—"}</p>
                  <p>City: {selectedIdentity.city ?? "—"}</p>
                  <p>Region: {selectedIdentity.region ?? "—"}</p>
                </>
              ) : null}
              <p>NORU invoice: {state.preview.invoiceNumber}</p>
              <p>Currency: ETB</p>
              <p>Pretax: {money(state.preview.pretax)}</p>
              <p>Tax: {money(state.preview.tax)}</p>
              <p>Total: {money(state.preview.total)}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
            >
              {mutation.isPending ? "Registering..." : "Register"}
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
