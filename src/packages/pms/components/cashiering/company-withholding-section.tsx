import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FileText, ReceiptText, RotateCcw, ShieldCheck } from "lucide-react";
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
import { cn } from "@/shared/lib/utils";

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
        <DialogContent className="max-h-[92vh] sm:max-w-2xl overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
                <ReceiptText className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Record Withholding Certificate
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Record legal tax withholding deducted by client. NORU applies exact certificate amounts.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {board ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              {/* Invoice & Account Context Card */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#E8E1D7]/70 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-[#8A641A]" />
                    <span className="font-semibold text-xs text-[#251605]">{board.companyName || "—"}</span>
                  </div>
                  <span className="rounded bg-[#FAF5EB] px-2 py-0.5 text-[10px] font-bold text-[#8A641A] border border-[#EADFCB]">
                    Invoice {board.invoiceNumber ?? "—"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Invoice Total</p>
                    <p className="font-display text-xs font-bold tabular-nums text-[#251605]">
                      {money(board.invoiceTotal)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Allocated Paid</p>
                    <p className="font-display text-xs font-bold tabular-nums text-emerald-700">
                      {money(board.paymentsAllocated)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-2">
                    <p className="text-[10px] font-medium text-[#7A6B58]">Existing Withheld</p>
                    <p className="font-display text-xs font-bold tabular-nums text-[#251605]">
                      {money(board.withholding)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2">
                    <p className="text-[10px] font-medium text-amber-900">Outstanding</p>
                    <p className="font-display text-xs font-bold tabular-nums text-amber-950">
                      {money(board.outstanding)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Certificate Input Fields */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-3">
                <span className="font-semibold text-xs text-[#251605]">Certificate Details</span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="withholding-amount" className="text-xs font-semibold text-[#251605]">
                      Withholding Deducted Amount *
                    </Label>
                    <Input
                      id="withholding-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="withholding-pretax" className="text-xs font-semibold text-[#251605]">
                      Pretax Base Subject to Withholding *
                    </Label>
                    <Input
                      id="withholding-pretax"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={pretax}
                      onChange={(event) => setPretax(event.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="withholding-date" className="text-xs font-semibold text-[#251605]">
                      Certificate Date *
                    </Label>
                    <Input
                      id="withholding-date"
                      type="date"
                      value={certificateDate}
                      onChange={(event) => setCertificateDate(event.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="withholding-reference" className="text-xs font-semibold text-[#251605]">
                      Certificate / Reference Number
                    </Label>
                    <Input
                      id="withholding-reference"
                      placeholder="e.g. WHT-2026-0042"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="withholding-reason" className="text-xs font-semibold text-[#251605]">
                      Reason / Reference Notes
                    </Label>
                    <Textarea
                      id="withholding-reason"
                      placeholder="Optional remarks regarding this tax deduction certificate..."
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] bg-white px-6 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRecording(false)}
              className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={recordMutation.isPending || !amount || !pretax || !certificateDate}
              onClick={() => recordMutation.mutate()}
              className="h-9 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-4 shadow-xs"
            >
              {recordMutation.isPending ? "Recording…" : "Record Withholding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversing)} onOpenChange={(open) => !open && setReversingId(null)}>
        <DialogContent className="max-h-[90vh] sm:max-w-lg overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 shadow-xs">
                <RotateCcw className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight text-[#251605]">
                  Reverse Withholding Certificate
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                  Void deduction certificate and restore receivable balance.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {board && reversing ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#FAF8F5]">
              {/* Reversal Impact Card */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E8E1D7]/70 pb-2">
                  <span className="font-semibold text-xs text-[#251605]">Certificate to Reverse</span>
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                    {reversing.reference || reversing.certificateId}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7A6B58]">
                  <div>Certificate Amount: <span className="font-semibold text-[#251605]">{money(reversing.amount)}</span></div>
                  <div>Invoice Number: <span className="font-semibold text-[#251605]">{board.invoiceNumber ?? "—"}</span></div>
                  <div className="col-span-2 pt-1 border-t border-[#E8E1D7]/60">
                    Restored Outstanding:{" "}
                    <span className="font-bold text-amber-900 tabular-nums">
                      {money(board.outstanding + reversing.amount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reason Input */}
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs space-y-2">
                <Label htmlFor="withholding-reverse-reason" className="text-xs font-semibold text-[#251605]">
                  Reason for Reversal *
                </Label>
                <Textarea
                  id="withholding-reverse-reason"
                  placeholder="Specify why this withholding certificate is being voided or corrected..."
                  rows={3}
                  value={reverseReason}
                  onChange={(event) => setReverseReason(event.target.value)}
                  className="text-xs resize-none"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 border-t border-[#E8E1D7] bg-white px-6 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReversingId(null)}
              className="h-9 border-[#DDD4C5] text-xs hover:bg-[#FAF8F5]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reverseMutation.isPending || reverseReason.trim().length === 0}
              onClick={() => reverseMutation.mutate()}
              className="h-9 bg-rose-700 text-white hover:bg-rose-800 text-xs font-semibold px-4 shadow-xs"
            >
              {reverseMutation.isPending ? "Reversing…" : "Confirm Reversal"}
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
