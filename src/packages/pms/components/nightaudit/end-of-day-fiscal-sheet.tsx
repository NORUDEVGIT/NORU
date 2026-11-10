import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FiscalJsonViewer } from "@/packages/pms/components/cashiering/fiscal-json-viewer";
import {
  getFiscalRegistrationExchange,
  registerCompanyAllocationSalesReceipt,
  registerCompanyCreditNoteFiscal,
  registerCompanyDebitNoteFiscal,
  registerCompanyInvoiceFiscal,
  registerCompanyWithholdingFiscal,
  registerCreditNoteFiscal,
  registerDebitNoteFiscal,
  registerGuestAllocationSalesReceipt,
  registerGuestInvoiceFiscal,
  retryFiscalRegistrationNow,
} from "@/packages/pms/lib/fiscal/fiscal.functions";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

export type EndOfDayFiscalTarget = {
  sourceType: string;
  sourceId: string;
  registrationId?: string;
  scope: "guest" | "account";
};

const STATUS_LABEL: Record<string, string> = {
  NOT_REGISTERED: "Not registered",
  BLOCKED: "Blocked",
  PENDING: "Queued",
  REGISTERED: "Registered",
  FAILED: "Failed",
  CANCEL_PENDING: "Cancel pending",
  CANCELLED: "Cancelled",
};

export function EndOfDayFiscalSheet({
  restaurantId,
  target,
  onClose,
  onRefresh,
}: {
  restaurantId: string;
  target: EndOfDayFiscalTarget;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const permissions = usePmsPermissions(restaurantId);
  const canRegister = permissions.canAny([PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE]);
  const queryClient = useQueryClient();
  const loadExchange = useServerFn(getFiscalRegistrationExchange);
  const retry = useServerFn(retryFiscalRegistrationNow);
  const registerGuestInvoice = useServerFn(registerGuestInvoiceFiscal);
  const registerCompanyInvoice = useServerFn(registerCompanyInvoiceFiscal);
  const registerCredit = useServerFn(registerCreditNoteFiscal);
  const registerCompanyCredit = useServerFn(registerCompanyCreditNoteFiscal);
  const registerDebit = useServerFn(registerDebitNoteFiscal);
  const registerCompanyDebit = useServerFn(registerCompanyDebitNoteFiscal);
  const registerGuestReceipt = useServerFn(registerGuestAllocationSalesReceipt);
  const registerCompanyReceipt = useServerFn(registerCompanyAllocationSalesReceipt);
  const registerWithholding = useServerFn(registerCompanyWithholdingFiscal);
  const [registrationId, setRegistrationId] = useState(target.registrationId ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const exchangeQuery = useQuery({
    queryKey: ["end-of-day-fiscal-exchange", restaurantId, registrationId],
    queryFn: () =>
      loadExchange({ data: { restaurantId, registrationId: registrationId ?? "" } }),
    enabled: Boolean(registrationId),
    retry: false,
  });
  const registration = exchangeQuery.data?.registration ?? null;
  const latestAttempt = exchangeQuery.data?.attempts.at(-1) ?? null;

  const send = useMutation({
    mutationFn: async () => {
      const status = registration?.status ?? null;
      if (registrationId && (status === "FAILED" || status === "BLOCKED")) {
        await retry({ data: { restaurantId, registrationId } });
        return { registrationId, message: null as string | null };
      }
      const result = await registerBySource(
        {
          registerGuestInvoice,
          registerCompanyInvoice,
          registerCredit,
          registerCompanyCredit,
          registerDebit,
          registerCompanyDebit,
          registerGuestReceipt,
          registerCompanyReceipt,
          registerWithholding,
        },
        restaurantId,
        target,
      );
      return readOutcome(result, registrationId);
    },
    onSuccess: async (outcome) => {
      if (outcome.registrationId) setRegistrationId(outcome.registrationId);
      setNotice(outcome.message);
      await queryClient.invalidateQueries({
        queryKey: ["end-of-day-fiscal-exchange", restaurantId],
      });
      onRefresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const waitingForExchange = Boolean(registrationId) && exchangeQuery.isLoading;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="z-[80] flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-[#E8E1D7] bg-white px-5 py-4 text-left">
          <DialogTitle className="text-[#251605]">Fiscal registration</DialogTitle>
          <DialogDescription>
            Send this document again and read the response the fiscal machine returns.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F7F4EE] px-5 py-4">
          <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 text-sm">
            <p className="font-medium text-[#251605]">
              Status:{" "}
              {exchangeQuery.isLoading
                ? "Loading"
                : registration
                  ? (STATUS_LABEL[registration.status] ?? registration.status)
                  : "Not sent"}
            </p>
            {registration?.lastErrorMessage ? (
              <p className="mt-2 text-destructive">{registration.lastErrorMessage}</p>
            ) : null}
            {notice ? <p className="mt-2 text-[#251605]">{notice}</p> : null}
            {exchangeQuery.isError ? (
              <p className="mt-2 text-destructive">
                {exchangeQuery.error instanceof Error
                  ? exchangeQuery.error.message
                  : "The last response could not be loaded."}
              </p>
            ) : null}
            {canRegister ? (
              <Button
                type="button"
                className="mt-3"
                disabled={send.isPending || waitingForExchange}
                onClick={() => send.mutate()}
                data-testid="end-of-day-fiscal-send"
              >
                {send.isPending ? "Sending…" : registrationId ? "Register again" : "Register"}
              </Button>
            ) : (
              <p className="mt-3 text-muted-foreground">
                A manager can send this registration. The last machine response is below.
              </p>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#251605]">Machine response</h3>
            {latestAttempt ? (
              <p className="text-xs text-[#756A5B]">
                Last attempt HTTP {latestAttempt.httpStatus ?? "—"}
                {latestAttempt.errorMessage ? ` · ${latestAttempt.errorMessage}` : ""}
              </p>
            ) : null}
            <FiscalJsonViewer
              value={
                registration?.responseState === "ready" ? registration.responseSnapshot : null
              }
              emptyLabel={
                registrationId
                  ? "No provider response has been recorded yet."
                  : "Nothing has been sent to the fiscal machine yet."
              }
            />
          </section>

          {registration ? (
            <details className="rounded-xl border border-[#E8E1D7] bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-[#251605]">
                Request sent
              </summary>
              <div className="mt-3">
                <FiscalJsonViewer
                  value={
                    registration.requestState === "ready" ? registration.requestSnapshot : null
                  }
                  emptyLabel="No request snapshot stored."
                />
              </div>
            </details>
          ) : null}
        </div>
        <DialogFooter className="border-t border-[#E8E1D7] bg-white px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RegisterFns = {
  registerGuestInvoice: (input: {
    data: { restaurantId: string; invoiceId: string };
  }) => Promise<unknown>;
  registerCompanyInvoice: (input: {
    data: { restaurantId: string; invoiceId: string };
  }) => Promise<unknown>;
  registerCredit: (input: {
    data: { restaurantId: string; creditNoteId: string };
  }) => Promise<unknown>;
  registerCompanyCredit: (input: {
    data: { restaurantId: string; creditNoteId: string };
  }) => Promise<unknown>;
  registerDebit: (input: { data: { restaurantId: string; debitNoteId: string } }) => Promise<unknown>;
  registerCompanyDebit: (input: {
    data: { restaurantId: string; debitNoteId: string };
  }) => Promise<unknown>;
  registerGuestReceipt: (input: {
    data: { restaurantId: string; allocationId: string };
  }) => Promise<unknown>;
  registerCompanyReceipt: (input: {
    data: { restaurantId: string; allocationId: string };
  }) => Promise<unknown>;
  registerWithholding: (input: {
    data: { restaurantId: string; certificateId: string };
  }) => Promise<unknown>;
};

async function registerBySource(
  fns: RegisterFns,
  restaurantId: string,
  target: EndOfDayFiscalTarget,
): Promise<unknown> {
  const sourceId = target.sourceId;
  if (target.sourceType === "guest_invoice") {
    return fns.registerGuestInvoice({ data: { restaurantId, invoiceId: sourceId } });
  }
  if (target.sourceType === "account_invoice") {
    return fns.registerCompanyInvoice({ data: { restaurantId, invoiceId: sourceId } });
  }
  if (target.sourceType === "credit_note") {
    return target.scope === "account"
      ? fns.registerCompanyCredit({ data: { restaurantId, creditNoteId: sourceId } })
      : fns.registerCredit({ data: { restaurantId, creditNoteId: sourceId } });
  }
  if (target.sourceType === "debit_note") {
    return target.scope === "account"
      ? fns.registerCompanyDebit({ data: { restaurantId, debitNoteId: sourceId } })
      : fns.registerDebit({ data: { restaurantId, debitNoteId: sourceId } });
  }
  if (target.sourceType === "guest_allocation" || (target.sourceType === "sales_receipt" && target.scope === "guest")) {
    return fns.registerGuestReceipt({ data: { restaurantId, allocationId: sourceId } });
  }
  if (
    target.sourceType === "account_allocation" ||
    (target.sourceType === "sales_receipt" && target.scope === "account")
  ) {
    return fns.registerCompanyReceipt({ data: { restaurantId, allocationId: sourceId } });
  }
  if (target.sourceType === "withholding" || target.sourceType === "withholding_certificate") {
    return fns.registerWithholding({ data: { restaurantId, certificateId: sourceId } });
  }
  throw new Error("Open the folio to register this document.");
}

function readOutcome(
  result: unknown,
  fallbackId: string | null,
): { registrationId: string | null; message: string | null } {
  if (!result || typeof result !== "object") return { registrationId: fallbackId, message: null };
  const row = result as {
    status?: string;
    reasons?: string[];
    registration?: { id?: string; lastError?: string | null } | null;
  };
  const message =
    row.registration?.lastError ||
    row.reasons?.[0] ||
    (row.status === "registered"
      ? "The fiscal machine accepted this document."
      : row.status === "queued"
        ? "The fiscal machine has not answered yet. The registration is still queued."
        : row.status === "not_eligible"
          ? "This document cannot be registered."
          : row.status === "failed"
            ? "The fiscal machine rejected this document."
            : null);
  return { registrationId: row.registration?.id ?? fallbackId, message };
}
