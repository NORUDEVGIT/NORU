import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { FiscalExchangeDrawer } from "@/packages/pms/components/cashiering/fiscal-exchange-drawer";
import {
  recordCompanyWithholdingCertificate,
  reverseCompanyWithholdingCertificate,
} from "@/packages/pms/lib/cashiering-withholding.functions";
import {
  getCompanyInvoiceWithholdingFiscal,
  registerCompanyWithholdingFiscal,
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
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";

const STATUS_LABEL = {
  not_registered: "Not registered",
  not_eligible: "Not eligible",
  queued: "Queued",
  registered: "Registered",
  failed: "Failed",
} as const;

export function CompanyWithholdingSection({
  restaurantId,
  invoiceId,
  accountOpen,
  money,
}: {
  restaurantId: string;
  invoiceId: string;
  accountOpen: boolean;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCompanyInvoiceWithholdingFiscal);
  const register = useServerFn(registerCompanyWithholdingFiscal);
  const record = useServerFn(recordCompanyWithholdingCertificate);
  const reverse = useServerFn(reverseCompanyWithholdingCertificate);
  const [recording, setRecording] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [pretax, setPretax] = useState("");
  const [certificateDate, setCertificateDate] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const query = useQuery({
    queryKey: ["company-withholding", restaurantId, invoiceId],
    queryFn: () => load({ data: { restaurantId, invoiceId } }),
  });
  const board = query.data;
  const reversing = board?.lines.find((line) => line.certificateId === reversingId) ?? null;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["company-withholding", restaurantId, invoiceId] }),
      queryClient.invalidateQueries({ queryKey: ["account-invoice-settlement"] }),
      queryClient.invalidateQueries({ queryKey: ["account-invoice-settlements"] }),
      queryClient.invalidateQueries({
        queryKey: ["company-sales-receipts", restaurantId, invoiceId],
      }),
    ]);
  }

  const recordMutation = useMutation({
    mutationFn: () =>
      record({
        data: {
          restaurantId,
          invoiceId,
          amount: Number(amount),
          pretaxBase: Number(pretax),
          certificateDate,
          reference,
          reason,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      setRecording(false);
      toast.success("Withholding certificate recorded.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reverseMutation = useMutation({
    mutationFn: () =>
      reverse({
        data: {
          restaurantId,
          certificateId: reversingId ?? "",
          reason: reverseReason,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      setReversingId(null);
      setReverseReason("");
      toast.success("Withholding certificate reversed.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const fiscalMutation = useMutation({
    mutationFn: (certificateId: string) => register({ data: { restaurantId, certificateId } }),
    onSuccess: async (result) => {
      await refresh();
      if (result.status === "registered") toast.success("Fiscal withholding registered.");
      else if (result.reasons[0]) toast.error(result.reasons[0]);
      else if (result.registration?.lastError) toast.error(result.registration.lastError);
      else toast.message("Fiscal withholding is queued.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openRecord() {
    setAmount("");
    setPretax(board && board.subtotal > 0 ? board.subtotal.toFixed(2) : "");
    setCertificateDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setReason("");
    setRecording(true);
  }

  return (
    <section
      className="mt-4 space-y-3 rounded-xl border border-[#E8E1D7] p-4 text-sm"
      data-testid="company-withholding"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-[#8a6a1f]" />
          <h3 className="font-medium">Withholding</h3>
        </div>
        {board?.canRecord && accountOpen ? (
          <Button type="button" size="sm" variant="outline" onClick={openRecord}>
            Record Withholding
          </Button>
        ) : null}
      </div>
      {query.isLoading ? <p className="text-muted-foreground">Loading withholding…</p> : null}
      {board ? (
        <div className="space-y-2">
          <p className="flex justify-between">
            <span>Withholding</span>
            <span className="tabular-nums">{money(board.withholding)}</span>
          </p>
          <p className="flex justify-between">
            <span>Outstanding</span>
            <span className="tabular-nums">{money(board.outstanding)}</span>
          </p>
        </div>
      ) : null}
      {board?.lines.map((line) => (
        <div key={line.certificateId} className="rounded-lg border border-[#E8E1D7] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">
                {line.reversal ? "Withholding reversal" : "Withholding certificate"}
                {line.reference ? ` · ${line.reference}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{line.certificateDate}</p>
            </div>
            <p>{STATUS_LABEL[line.status]}</p>
          </div>
          <p className="mt-2 flex justify-between">
            <span>Pretax base</span>
            <span className="tabular-nums">{money(line.pretaxBase)}</span>
          </p>
          <p className="flex justify-between">
            <span>Withholding amount</span>
            <span className="tabular-nums">{money(line.amount)}</span>
          </p>
          {line.reasons[0] ? (
            <p className="mt-2 text-xs text-muted-foreground">{line.reasons[0]}</p>
          ) : null}
          {line.status === "registered" && line.registration ? (
            <div className="mt-2 space-y-1 text-xs">
              <p>RRN {line.registration.rrn ?? "—"}</p>
              {line.registration.externalId ? (
                <p>External id {line.registration.externalId}</p>
              ) : null}
              {line.registration.qrSrc ? (
                <img src={line.registration.qrSrc} alt="Withholding QR" className="h-28 w-28" />
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {board?.canRecord && accountOpen && !line.reversal && !line.reversed ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setReverseReason("");
                  setReversingId(line.certificateId);
                }}
              >
                Reverse Withholding
              </Button>
            ) : null}
            {board?.canRegister && (line.canRegister || line.canRetry) ? (
              <Button
                type="button"
                size="sm"
                disabled={fiscalMutation.isPending}
                onClick={() => fiscalMutation.mutate(line.certificateId)}
              >
                {line.canRetry ? "Retry" : "Register fiscal withholding"}
              </Button>
            ) : null}
            {board?.canRegister && line.registration ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setExchangeId(line.registration?.id ?? null)}
              >
                View API exchange
              </Button>
            ) : null}
          </div>
        </div>
      ))}

      <Dialog open={recording} onOpenChange={setRecording}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>Record withholding</DialogTitle>
            <DialogDescription>
              Enter the certificate amount and pretax base. NORU does not calculate a withholding
              rate.
            </DialogDescription>
          </DialogHeader>
          {board ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
              <ReadOnly label="Company" value={board.companyName || "—"} />
              <ReadOnly label="Invoice number" value={board.invoiceNumber ?? "—"} />
              <ReadOnly label="Invoice total" value={money(board.invoiceTotal)} />
              <ReadOnly label="Effective invoice total" value={money(board.effectiveNet)} />
              <ReadOnly label="Payments allocated" value={money(board.paymentsAllocated)} />
              <ReadOnly label="Existing withholding" value={money(board.withholding)} />
              <ReadOnly label="Current outstanding" value={money(board.outstanding)} />
              <ReadOnly label="Fiscal invoice status" value={board.fiscalInvoiceStatus} />
              <ReadOnly label="Fiscal invoice IRN" value={board.fiscalIrn ?? "—"} />
              <ReadOnly label="Frozen invoice subtotal" value={money(board.subtotal)} />
              <ReadOnly
                label="Original fiscal pretax sum"
                value={board.fiscalPretax == null ? "—" : money(board.fiscalPretax)}
              />
              <div className="space-y-1">
                <Label htmlFor="withholding-amount">Withholding amount</Label>
                <Input
                  id="withholding-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="withholding-pretax">Pretax base</Label>
                <Input
                  id="withholding-pretax"
                  inputMode="decimal"
                  value={pretax}
                  onChange={(event) => setPretax(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Confirm this amount before recording. It is not taken from a tax rate.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="withholding-date">Certificate date</Label>
                <Input
                  id="withholding-date"
                  type="date"
                  value={certificateDate}
                  onChange={(event) => setCertificateDate(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="withholding-reference">Certificate / reference number</Label>
                <Input
                  id="withholding-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="withholding-reason">Reason / notes</Label>
                <Textarea
                  id="withholding-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] pt-3">
            <Button type="button" variant="outline" onClick={() => setRecording(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={recordMutation.isPending || !amount || !pretax || !certificateDate}
              onClick={() => recordMutation.mutate()}
            >
              Record withholding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversing)} onOpenChange={(open) => !open && setReversingId(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>Reverse withholding</DialogTitle>
            <DialogDescription>
              This adds a reversal. The original certificate stays on the account.
            </DialogDescription>
          </DialogHeader>
          {board && reversing ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
              <ReadOnly
                label="Certificate"
                value={reversing.reference || reversing.certificateId}
              />
              <ReadOnly label="Amount" value={money(reversing.amount)} />
              <ReadOnly label="Invoice" value={board.invoiceNumber ?? "—"} />
              <ReadOnly
                label="Outstanding after reversal"
                value={money(board.outstanding + reversing.amount)}
              />
              <div className="space-y-1">
                <Label htmlFor="withholding-reverse-reason">Reason</Label>
                <Textarea
                  id="withholding-reverse-reason"
                  value={reverseReason}
                  onChange={(event) => setReverseReason(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] pt-3">
            <Button type="button" variant="outline" onClick={() => setReversingId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reverseMutation.isPending || reverseReason.trim().length === 0}
              onClick={() => reverseMutation.mutate()}
            >
              Reverse withholding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FiscalExchangeDrawer
        open={Boolean(exchangeId)}
        onOpenChange={(open) => !open && setExchangeId(null)}
        restaurantId={restaurantId}
        registrationId={exchangeId ?? ""}
      />
    </section>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </p>
  );
}
