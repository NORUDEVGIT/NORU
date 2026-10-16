import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Printer,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react";

import { FolioInvoicePreview } from "@/packages/pms/components/cashiering/folio-invoice-panel";
import { GuestInvoiceFiscalSection } from "@/packages/pms/components/cashiering/guest-invoice-fiscal-section";
import { GuestInvoiceSettlementDetail } from "@/packages/pms/components/cashiering/guest-payment-allocation-drawer";
import { InvoiceReceivePaymentDialog } from "@/packages/pms/components/cashiering/invoice-receive-payment-dialog";
import {
  InvoiceSettlementStrip,
  type InvoiceSettlementStatus,
} from "@/packages/pms/components/cashiering/invoice-settlement-strip";
import { CreditNoteSection } from "@/packages/pms/components/cashiering/credit-note-panel";
import { DebitNoteSection } from "@/packages/pms/components/cashiering/debit-note-panel";
import type { IssuedFolioInvoiceRow } from "@/packages/pms/lib/cashiering-invoices.server";
import type { CashieringDocumentProperty } from "@/packages/pms/lib/cashiering-document-property";
import type { FolioDetail, FolioWorkspace } from "@/packages/pms/lib/cashiering.functions";
import {
  GUEST_SETTLEMENT_STATES,
  guestSettlementLabel,
  type GuestSettlementState,
} from "@/packages/pms/lib/cashiering-guest-allocation";
import { getGuestInvoiceSettlement } from "@/packages/pms/lib/cashiering-guest-allocation.functions";
import { getGuestInvoiceFiscal } from "@/packages/pms/lib/fiscal/fiscal.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

type Money = (value: number) => string;
type DateTimeFormat = (iso: string | null | undefined) => string;

export type InvoiceModalTabId =
  "preview" | "fiscal" | "settlement" | "credit-notes" | "debit-notes";

function getSettlementBadgeText(state: string | null | undefined): string | null {
  if (!state) return null;
  if ((GUEST_SETTLEMENT_STATES as readonly string[]).includes(state)) {
    return guestSettlementLabel(state as GuestSettlementState);
  }
  return state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function GuestInvoiceModal({
  open,
  invoice,
  restaurantId,
  folio,
  workspace,
  money,
  dateTime,
  documentProperty,
  settlementState,
  onClose,
  onChanged,
  onReprint,
  reprinting = false,
  onPostCharge,
  onAllocate,
}: {
  open: boolean;
  invoice: IssuedFolioInvoiceRow | null;
  restaurantId: string;
  folio: FolioDetail;
  workspace: FolioWorkspace;
  money: Money;
  dateTime: DateTimeFormat;
  documentProperty: CashieringDocumentProperty | null;
  settlementState?: string | null | undefined;
  onClose: () => void;
  onChanged: () => void;
  onReprint?: ((invoice: IssuedFolioInvoiceRow) => void) | undefined;
  reprinting?: boolean | undefined;
  onPostCharge?: (() => void) | undefined;
  onAllocate?: ((invoiceId: string, paymentId?: string) => void) | undefined;
}) {
  const [activeTab, setActiveTab] = useState<InvoiceModalTabId>("preview");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const queryClient = useQueryClient();
  const loadSettlement = useServerFn(getGuestInvoiceSettlement);
  const loadFiscal = useServerFn(getGuestInvoiceFiscal);
  const settlementQuery = useQuery({
    queryKey: ["guest-invoice-settlement", restaurantId, folio.id, invoice?.id],
    queryFn: () =>
      loadSettlement({ data: { restaurantId, folioId: folio.id, invoiceId: invoice!.id } }),
    enabled: open && Boolean(invoice),
  });
  const fiscalQuery = useQuery({
    queryKey: ["guest-invoice-fiscal", restaurantId, invoice?.id],
    queryFn: () => loadFiscal({ data: { restaurantId, invoiceId: invoice!.id } }),
    enabled: open && Boolean(invoice),
  });
  const availableUnallocated = useMemo(
    () =>
      workspace.folio.transactions
        .filter((row) => row.type === "payment")
        .reduce((sum, payment) => {
          const refunded = workspace.folio.transactions
            .filter((row) => row.type === "refund" && row.originalTransactionId === payment.id)
            .reduce((refundSum, row) => refundSum + row.amount, 0);
          const available =
            Math.round(
              (-payment.amount - refunded - (workspace.paymentAllocationNets[payment.id] ?? 0)) *
                100,
            ) / 100;
          return sum + Math.max(0, available);
        }, 0),
    [workspace.folio.transactions, workspace.paymentAllocationNets],
  );

  if (!invoice) return null;

  const isLegacy = invoice.coverageScope === "legacy_folio";
  const settlement = settlementQuery.data?.settlement;
  const total = settlement?.effectiveNet ?? invoice.snapshot.totals.invoiceTotal ?? 0;
  const allocated = settlement?.allocated ?? 0;
  const outstanding = settlement?.outstanding ?? Math.max(0, total - allocated);
  const status: InvoiceSettlementStatus =
    total <= 0.009
      ? "No Amount Due"
      : outstanding <= 0.009
        ? "Paid"
        : allocated > 0.009
          ? "Partially Paid"
          : "Unpaid";
  const fiscalState = fiscalQuery.data;
  const fiscalRegistered = Boolean(fiscalState?.registration);
  const previewMode = fiscalState?.preview?.mode;
  const fiscalMode =
    previewMode === "CASH" || previewMode === "CREDIT"
      ? previewMode
      : (fiscalState?.settlement?.mode ?? null);
  const fiscalReason = fiscalRegistered
    ? fiscalMode
      ? "Fiscal Mode was frozen when this invoice was first registered."
      : null
    : fiscalMode === "CASH"
      ? "Invoice is fully covered by payments and applied deposits."
      : (fiscalState?.settlement?.eligiblePayments ?? allocated) <= 0.009
        ? "No eligible payment has been allocated."
        : `${money(fiscalState?.settlement?.unpaid ?? outstanding)} remains unpaid by eligible payments.`;
  const refreshSettlement = async () => {
    await Promise.all([
      settlementQuery.refetch(),
      fiscalQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folio.id] }),
      queryClient.invalidateQueries({
        queryKey: ["guest-payment-allocation", restaurantId, folio.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["guest-sales-receipts", restaurantId, invoice.id],
      }),
    ]);
    onChanged();
  };

  const tabs: Array<{
    id: InvoiceModalTabId;
    label: string;
    icon: typeof FileText;
    badge?: string | number | null;
  }> = [
    {
      id: "preview",
      label: "Invoice Document",
      icon: FileText,
    },
    {
      id: "fiscal",
      label: "Fiscal Registration",
      icon: ShieldCheck,
    },
    {
      id: "settlement",
      label: "Settlement & Receipts",
      icon: ReceiptText,
      badge: getSettlementBadgeText(settlementState),
    },
    {
      id: "credit-notes",
      label: "Credit Notes",
      icon: ArrowDownLeft,
    },
    {
      id: "debit-notes",
      label: "Debit Notes",
      icon: ArrowUpRight,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (!isOpen ? onClose() : undefined)}>
      <DialogContent
        className={cn(
          "flex h-[min(92vh,940px)] w-[min(96vw,1260px)] max-w-none flex-col gap-0 overflow-hidden p-0",
          "rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl [&>button]:hidden",
        )}
      >
        {/* Top Header Card */}
        <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="font-display text-xl font-bold tracking-tight text-[#251605]">
                    Invoice {invoice.issuedNumber}
                  </DialogTitle>
                  <span className="rounded-md border border-[#E5DECE] bg-[#F7F4EE] px-2 py-0.5 text-xs font-medium text-[#7A6B58]">
                    {isLegacy ? "Whole Folio" : "Itemized"}
                  </span>
                  {settlementState ? (
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs font-semibold",
                        settlementState === "settled" || settlementState === "PAID"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : settlementState === "partial" || settlementState === "PARTIALLY_PAID"
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                      )}
                    >
                      {getSettlementBadgeText(settlementState)}
                    </span>
                  ) : null}
                </div>
                <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#7A6B58]">
                  <span>Issued on {dateTime(invoice.issuedAt)}</span>
                  <span>·</span>
                  <span>Guest: {folio.guestName}</span>
                  {folio.roomNumber ? (
                    <>
                      <span>·</span>
                      <span>Room {folio.roomNumber}</span>
                    </>
                  ) : null}
                  {invoice.reprintCount > 0 ? (
                    <>
                      <span>·</span>
                      <span className="font-medium text-amber-700">
                        Reprinted {invoice.reprintCount}{" "}
                        {invoice.reprintCount === 1 ? "time" : "times"}
                      </span>
                    </>
                  ) : null}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Action Pill on Header Right */}
            <div className="flex items-center gap-2">
              <div className="mr-2 hidden rounded-xl border border-[#E8E1D7] bg-[#FAF8F5] px-3.5 py-1.5 text-right sm:block">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#8A7968]">
                  Invoice Total
                </p>
                <p className="font-display text-base font-bold tabular-nums text-[#251605]">
                  {money(
                    invoice.snapshot.totals.invoiceTotal ?? invoice.snapshot.totals.balance ?? 0,
                  )}
                </p>
              </div>

              {workspace.capabilities.canReprintInvoice && onReprint ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprinting}
                  onClick={() => onReprint(invoice)}
                  className="h-9 gap-1.5 border-[#DDD4C5] bg-white text-xs font-medium text-[#251605] shadow-xs hover:bg-[#F7F4EE]"
                >
                  <Printer className="size-3.5" />
                  <span>{reprinting ? "Reprinting…" : "Reprint"}</span>
                </Button>
              ) : null}

              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="size-9 rounded-xl text-[#7A6B58] hover:bg-[#F2ECE1] hover:text-[#251605]"
                aria-label="Close invoice details"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <InvoiceSettlementStrip
            total={total}
            allocated={allocated}
            outstanding={outstanding}
            status={status}
            cashDebitCovered={settlement?.cashDebitCovered ?? 0}
            depositApplied={settlement?.depositApplied ?? 0}
            availableUnallocated={availableUnallocated}
            expectedMode={fiscalMode}
            fiscalReason={fiscalReason}
            registered={fiscalRegistered}
            canReceive={workspace.canOperate}
            canAllocate={workspace.canAllocateInvoices}
            canFiscalRegister={workspace.canManage}
            money={money}
            onReceive={() => setReceiveOpen(true)}
            onAllocate={() => onAllocate?.(invoice.id)}
          />

          {/* Clean Segmented Tab Navigation */}
          <nav
            aria-label="Invoice inspection tabs"
            className="mt-4 -mb-1 flex w-full gap-1 overflow-x-auto border-b border-[#E8E1D7] pb-px"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-xs font-medium transition-all",
                    isActive
                      ? "border-[#C89933] font-semibold text-[#8A641A] bg-[#C89933]/5 rounded-t-lg"
                      : "border-transparent text-[#756A5B] hover:border-[#DDD4C5] hover:text-[#251605] hover:bg-[#F7F4EE]/60 rounded-t-lg",
                  )}
                >
                  <Icon
                    className={cn("size-3.5", isActive ? "text-[#8A641A]" : "text-[#8A7968]")}
                  />
                  <span>{tab.label}</span>
                  {tab.badge ? (
                    <span
                      className={cn(
                        "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                        isActive ? "bg-[#C89933]/20 text-[#765719]" : "bg-[#EFE9DF] text-[#7A6B58]",
                      )}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </DialogHeader>

        {/* Tab Content Body with independent scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#FAF8F5]">
          {activeTab === "preview" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-white px-4 py-2.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs text-[#7A6B58]">
                  <FileText className="size-4 text-[#8a6a1f]" />
                  <span>
                    Official printable view of Invoice <strong>{invoice.issuedNumber}</strong>
                  </span>
                </div>
                {workspace.capabilities.canReprintInvoice && onReprint ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reprinting}
                    onClick={() => onReprint(invoice)}
                    className="h-7 gap-1 border-[#DDD4C5] bg-[#FAF8F5] text-xs hover:bg-[#F2ECE1]"
                  >
                    <Printer className="size-3" /> Quick Print
                  </Button>
                ) : null}
              </div>
              <FolioInvoicePreview
                invoice={invoice}
                money={money}
                dateTime={dateTime}
                liveProperty={documentProperty}
              />
            </div>
          ) : null}

          {activeTab === "fiscal" ? (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs">
                <div className="flex items-center gap-2.5 text-xs text-[#7A6B58] mb-3">
                  <ShieldCheck className="size-4 text-[#8a6a1f]" />
                  <span className="font-semibold uppercase tracking-wider text-[#251605]">
                    Fiscal Compliance & Verification
                  </span>
                </div>
                <p className="text-xs text-[#7A6B58]">
                  Manage electronic fiscal registration, tax mapping, B2B/B2C customer types, and
                  legal fiscal device exchanges for this invoice.
                </p>
              </div>

              <GuestInvoiceFiscalSection
                restaurantId={restaurantId}
                invoiceId={invoice.id}
                canRegister={workspace.canManage}
                canInspect={workspace.canManage}
                money={money}
              />
            </div>
          ) : null}

          {activeTab === "settlement" ? (
            <div className="space-y-4 max-w-4xl mx-auto">
              <GuestInvoiceSettlementDetail
                restaurantId={restaurantId}
                folioId={folio.id}
                invoiceId={invoice.id}
                legacy={isLegacy}
                money={money}
                dateTime={dateTime}
                canAllocate={workspace.canAllocateInvoices && availableUnallocated > 0.009}
                canFiscalRegister={workspace.canManage}
                onAllocate={onAllocate}
              />
            </div>
          ) : null}

          {activeTab === "credit-notes" ? (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-4 text-xs text-blue-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ArrowDownLeft className="size-4 text-blue-700" />
                  <span>Credit Notes for Invoice {invoice.issuedNumber}</span>
                </div>
                <p className="mt-1 text-blue-800">
                  Credit notes reduce the amount receivable on this invoice (e.g. for cancellations,
                  refunds, or overbilling).
                </p>
              </div>
              <CreditNoteSection
                restaurantId={restaurantId}
                guestInvoiceId={invoice.id}
                canManage={workspace.canManage}
                money={money}
                dateTime={dateTime}
                onIssued={onChanged}
              />
            </div>
          ) : null}

          {activeTab === "debit-notes" ? (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ArrowUpRight className="size-4 text-amber-700" />
                  <span>Debit Notes for Invoice {invoice.issuedNumber}</span>
                </div>
                <p className="mt-1 text-amber-800">
                  Debit notes add supplementary charges or adjustments to this issued invoice.
                </p>
              </div>
              <DebitNoteSection
                restaurantId={restaurantId}
                guestInvoiceId={invoice.id}
                canManage={workspace.canManage}
                money={money}
                dateTime={dateTime}
                onIssued={onChanged}
                {...(onPostCharge ? { onPostCharge } : {})}
              />
            </div>
          ) : null}
        </div>
        <InvoiceReceivePaymentDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          target={{
            lane: "guest",
            restaurantId,
            folioId: folio.id,
            invoiceId: invoice.id,
          }}
          outstanding={outstanding}
          currency={settlement?.currency ?? folio.currency}
          receivedFrom={folio.guestName}
          canAllocateExisting={workspace.canAllocateInvoices}
          onSettled={refreshSettlement}
          onAllocateExisting={(paymentId) => onAllocate?.(invoice.id, paymentId)}
        />
      </DialogContent>
    </Dialog>
  );
}
