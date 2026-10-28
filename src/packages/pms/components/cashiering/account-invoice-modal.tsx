import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  Percent,
  Printer,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AccountInvoicePrint } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { AllocatePaymentDialog } from "@/packages/pms/components/cashiering/financial-account-allocation-drawer";
import { CompanyInvoiceFiscalSection } from "@/packages/pms/components/cashiering/company-invoice-fiscal-section";
import { CompanySalesReceiptSection } from "@/packages/pms/components/cashiering/company-sales-receipt-section";
import { CompanyWithholdingSection } from "@/packages/pms/components/cashiering/company-withholding-section";
import { InvoiceReceivePaymentDialog } from "@/packages/pms/components/cashiering/invoice-receive-payment-dialog";
import {
  InvoiceSettlementStrip,
  type InvoiceSettlementStatus,
} from "@/packages/pms/components/cashiering/invoice-settlement-strip";
import { CreditNoteSection } from "@/packages/pms/components/cashiering/credit-note-panel";
import { DebitNoteSection } from "@/packages/pms/components/cashiering/debit-note-panel";
import { settlementStateLabel } from "@/packages/pms/lib/cashiering-account-allocation";
import { accountMethodLabel } from "@/packages/pms/lib/cashiering-account-payments";
import { listFinancialAccountPayments } from "@/packages/pms/lib/cashiering-account-payments.functions";
import { getFinancialAccountInvoiceSettlement } from "@/packages/pms/lib/cashiering-account-allocation.functions";
import type { IssuedAccountInvoice } from "@/packages/pms/lib/cashiering-account-invoices";
import type { CashieringDocumentProperty } from "@/packages/pms/lib/cashiering-document-property";
import { getCompanyInvoiceFiscal } from "@/packages/pms/lib/fiscal/fiscal.functions";
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

export type AccountInvoiceModalTabId =
  "preview" | "fiscal" | "settlement" | "withholding" | "credit-notes" | "debit-notes";

export function AccountInvoiceModal({
  open,
  invoice,
  restaurantId,
  accountId,
  accountOpen,
  canManage,
  canOperate,
  canAllocate,
  money,
  dateTime,
  documentProperty,
  onClose,
  onChanged,
  onReprint,
  reprinting = false,
  onAllocate,
  initialTab,
}: {
  open: boolean;
  invoice: IssuedAccountInvoice | null;
  restaurantId: string;
  accountId: string;
  accountOpen: boolean;
  canManage: boolean;
  canOperate: boolean;
  canAllocate: boolean;
  money: Money;
  dateTime: DateTimeFormat;
  documentProperty: CashieringDocumentProperty | null;
  onClose: () => void;
  onChanged: () => void;
  onReprint?: ((invoiceId: string) => void) | undefined;
  reprinting?: boolean | undefined;
  onAllocate?: ((invoiceId: string) => void) | undefined;
  initialTab?: string | undefined;
}) {
  const [activeTab, setActiveTab] = useState<AccountInvoiceModalTabId>(() => {
    if (initialTab && ["preview", "fiscal", "settlement", "withholding", "credit-notes", "debit-notes"].includes(initialTab)) {
      return initialTab as AccountInvoiceModalTabId;
    }
    return "preview";
  });

  React.useEffect(() => {
    if (open && initialTab && ["preview", "fiscal", "settlement", "withholding", "credit-notes", "debit-notes"].includes(initialTab)) {
      setActiveTab(initialTab as AccountInvoiceModalTabId);
    }
  }, [open, initialTab]);
  const [allocatePaymentId, setAllocatePaymentId] = useState<string | null>(null);
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const queryClient = useQueryClient();

  const fetchSettlement = useServerFn(getFinancialAccountInvoiceSettlement);
  const settlementQuery = useQuery({
    queryKey: ["account-invoice-settlement", restaurantId, accountId, invoice?.id],
    queryFn: () =>
      fetchSettlement({
        data: { restaurantId, accountId, invoiceId: invoice!.id },
      }),
    enabled: open && Boolean(invoice?.id),
  });

  const listPayments = useServerFn(listFinancialAccountPayments);
  const paymentsQuery = useQuery({
    queryKey: ["financial-account-payments", restaurantId, accountId],
    queryFn: () => listPayments({ data: { restaurantId, accountId } }),
    enabled: open && Boolean(accountId),
  });

  const availablePayments = useMemo(() => {
    return (paymentsQuery.data?.payments ?? []).filter(
      (p) => p.transactionType === "payment" && p.remainingRefundable > 0.009,
    );
  }, [paymentsQuery.data?.payments]);

  const fetchFiscal = useServerFn(getCompanyInvoiceFiscal);
  const fiscalQuery = useQuery({
    queryKey: ["company-invoice-fiscal", restaurantId, invoice?.id],
    queryFn: () => fetchFiscal({ data: { restaurantId, invoiceId: invoice!.id } }),
    enabled: open && Boolean(invoice?.id) && invoice?.snapshot.account.accountKind === "company",
  });

  if (!invoice) return null;

  const isCompany = invoice.snapshot.account.accountKind === "company";
  const settlement = settlementQuery.data;
  const total = settlement?.effectiveNet ?? invoice.snapshot.totals.invoiceTotal;
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
  const availableUnallocated = availablePayments.reduce(
    (sum, payment) => sum + payment.remainingRefundable,
    0,
  );
  const refreshSettlement = async () => {
    await Promise.all([
      settlementQuery.refetch(),
      paymentsQuery.refetch(),
      fiscalQuery.refetch(),
      queryClient.invalidateQueries({
        queryKey: ["financial-account-allocation", restaurantId, accountId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["account-invoice-settlements", restaurantId, accountId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["company-sales-receipts", restaurantId, invoice.id],
      }),
    ]);
    onChanged();
  };
  const openAllocation = (paymentId?: string) => {
    if (onAllocate && !paymentId) {
      onAllocate(invoice.id);
      return;
    }
    if (paymentId) {
      setAllocatePaymentId(paymentId);
    } else if (availablePayments.length === 0) {
      toast.error(
        "No unallocated payments are available on this account. Post a general payment first.",
      );
    } else if (availablePayments.length === 1) {
      setAllocatePaymentId(availablePayments[0].id);
    } else {
      setPaymentPickerOpen(true);
    }
  };

  const tabs: Array<{
    id: AccountInvoiceModalTabId;
    label: string;
    icon: typeof FileText;
    badge?: string | number | null;
    hidden?: boolean;
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
      hidden: !isCompany,
    },
    {
      id: "settlement",
      label: "Settlement & Receipts",
      icon: ReceiptText,
      badge: settlement ? settlementStateLabel(settlement.settlementState) : null,
    },
    {
      id: "withholding",
      label: "Withholding Tax",
      icon: Percent,
      hidden: !isCompany,
      badge: settlement && settlement.withholding > 0 ? money(settlement.withholding) : null,
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

  const visibleTabs = tabs.filter((tab) => !tab.hidden);

  return (
    <>
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
                  {isCompany ? <Building2 className="size-5" /> : <Landmark className="size-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="font-display text-xl font-bold tracking-tight text-[#251605]">
                      Invoice {invoice.issuedNumber}
                    </DialogTitle>
                    <span className="rounded-md border border-[#E5DECE] bg-[#F7F4EE] px-2 py-0.5 text-xs font-medium text-[#7A6B58] capitalize">
                      {invoice.snapshot.account.accountKind} Account
                    </span>
                    {settlement ? (
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-semibold",
                          settlement.settlementState === "settled"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : settlement.settlementState === "partially_settled"
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-amber-200 bg-amber-50 text-amber-900",
                        )}
                      >
                        {settlementStateLabel(settlement.settlementState)}
                      </span>
                    ) : null}
                  </div>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#7A6B58]">
                    <span>Issued on {dateTime(invoice.issuedAt)}</span>
                    <span>·</span>
                    <span>Account: {invoice.snapshot.account.name}</span>
                    {invoice.snapshot.account.code ? (
                      <>
                        <span>·</span>
                        <span>Code: {invoice.snapshot.account.code}</span>
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
                    Outstanding
                  </p>
                  <p className="font-display text-base font-bold tabular-nums text-[#251605]">
                    {money(settlement?.outstanding ?? invoice.snapshot.totals.invoiceTotal)}
                  </p>
                </div>

                {canManage && onReprint ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reprinting}
                    onClick={() => onReprint(invoice.id)}
                    className="h-9 gap-1.5 border-[#DDD4C5] bg-white text-xs font-medium text-[#251605] shadow-xs hover:bg-[#F7F4EE]"
                  >
                    <Printer className="size-3.5 text-[#7A6B58]" />
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
              withholding={settlement?.withholding ?? 0}
              cashDebitCovered={settlement?.cashDebitCovered ?? 0}
              availableUnallocated={availableUnallocated}
              expectedMode={isCompany ? fiscalMode : null}
              fiscalReason={isCompany ? fiscalReason : null}
              registered={fiscalRegistered}
              canReceive={canOperate && accountOpen}
              canAllocate={canAllocate && accountOpen}
              canFiscalRegister={canManage}
              money={money}
              onReceive={() => setReceiveOpen(true)}
              onAllocate={() => openAllocation()}
            />

            {/* Clean Segmented Tab Navigation */}
            <nav
              aria-label="Company invoice inspection tabs"
              className="mt-4 -mb-1 flex w-full gap-1 overflow-x-auto border-b border-[#E8E1D7] pb-px"
            >
              {visibleTabs.map((tab) => {
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
                          isActive
                            ? "bg-[#C89933]/20 text-[#765719]"
                            : "bg-[#EFE9DF] text-[#7A6B58]",
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
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-white px-4 py-2.5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs text-[#7A6B58]">
                    <FileText className="size-4 text-[#8a6a1f]" />
                    <span>
                      Official printable view of Corporate Invoice{" "}
                      <strong>{invoice.issuedNumber}</strong>
                    </span>
                  </div>
                  {canManage && onReprint ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reprinting}
                      onClick={() => onReprint(invoice.id)}
                      className="h-7 gap-1 border-[#DDD4C5] bg-[#FAF8F5] text-xs hover:bg-[#F2ECE1]"
                    >
                      <Printer className="size-3 text-[#7A6B58]" /> Quick Print
                    </Button>
                  ) : null}
                </div>
                <AccountInvoicePrint
                  invoice={invoice}
                  money={money}
                  dateTime={dateTime}
                  screen
                  liveProperty={documentProperty}
                />
              </div>
            ) : null}

            {activeTab === "fiscal" && isCompany ? (
              <div className="space-y-4 max-w-4xl mx-auto">
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2.5 text-xs text-[#7A6B58] mb-2">
                    <ShieldCheck className="size-4 text-[#8a6a1f]" />
                    <span className="font-semibold uppercase tracking-wider text-[#251605]">
                      Corporate Fiscal Registration
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B58]">
                    Manage electronic fiscal signing, tax classification, and fiscal device
                    integration for company invoice {invoice.issuedNumber}.
                  </p>
                </div>

                <CompanyInvoiceFiscalSection
                  restaurantId={restaurantId}
                  invoiceId={invoice.id}
                  canRegister={canManage}
                  canInspect={canManage}
                  money={money}
                />
              </div>
            ) : null}

            {activeTab === "settlement" ? (
              <div className="space-y-4 max-w-4xl mx-auto">
                {settlement ? (
                  <section
                    className="rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-xs space-y-4"
                    data-testid="invoice-settlement"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E1D7] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-[#251605]">
                            Settlement Breakdown
                          </h4>
                          <span
                            className={cn(
                              "rounded-md border px-2.5 py-0.5 text-xs font-semibold",
                              settlement.settlementState === "settled"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : settlement.settlementState === "partially_settled"
                                  ? "border-blue-200 bg-blue-50 text-blue-800"
                                  : "border-amber-200 bg-amber-50 text-amber-900",
                            )}
                          >
                            {settlementStateLabel(settlement.settlementState)}
                          </span>
                        </div>
                        <p className="text-xs text-[#7A6B58] mt-0.5">
                          Document state remains Issued. Settlement status is computed from payments
                          and credit notes.
                        </p>
                      </div>

                      {canAllocate &&
                      availablePayments.length > 0 &&
                      settlement.outstanding > 0.01 ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openAllocation()}
                          className="h-8 gap-1.5 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-3 shadow-xs"
                        >
                          <ArrowRightLeft className="size-3.5" />
                          <span>Allocate Payment</span>
                          {availablePayments.length > 0 ? (
                            <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-semibold">
                              {availablePayments.length}
                            </span>
                          ) : null}
                        </Button>
                      ) : null}
                    </div>

                    {/* 4-KPI Grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                        <p className="text-[11px] font-medium text-[#7A6B58]">Original Amount</p>
                        <p className="font-display text-base font-bold tabular-nums text-[#251605]">
                          {money(settlement.originalAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                        <p className="text-[11px] font-medium text-[#7A6B58]">Effective Net</p>
                        <p className="font-display text-base font-bold tabular-nums text-[#251605]">
                          {money(settlement.effectiveNet)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                        <p className="text-[11px] font-medium text-[#7A6B58]">Allocated Paid</p>
                        <p className="font-display text-base font-bold tabular-nums text-emerald-700">
                          {money(settlement.allocated)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                        <p className="text-[11px] font-medium text-amber-900">
                          Outstanding Balance
                        </p>
                        <p className="font-display text-base font-bold tabular-nums text-amber-950">
                          {money(settlement.outstanding)}
                        </p>
                      </div>
                    </div>

                    {/* Summary Rows */}
                    <div className="divide-y divide-[#E8E1D7]/60 text-xs">
                      <div className="flex justify-between py-2 text-[#7A6B58]">
                        <span>Credit Notes Applied</span>
                        <span className="tabular-nums font-medium text-[#251605]">
                          {money(settlement.creditNoteTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 text-[#7A6B58]">
                        <span>Debit Notes Applied</span>
                        <span className="tabular-nums font-medium text-[#251605]">
                          {money(settlement.debitNoteTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 text-[#7A6B58]">
                        <span>Withholding Deductions</span>
                        <span className="tabular-nums font-medium text-[#251605]">
                          {money(settlement.withholding)}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Allocations Table */}
                    {settlement.allocations.length > 0 ? (
                      <div className="pt-2">
                        <h5 className="mb-2 text-xs font-semibold text-[#251605]">
                          Payment Allocations
                        </h5>
                        <div className="rounded-lg border border-[#E8E1D7] overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium text-[#7A6B58]">
                              <tr>
                                <th className="px-3 py-2">Date</th>
                                <th className="px-3 py-2">Payment Method</th>
                                <th className="px-3 py-2">Processed By</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E1D7]/70 bg-white">
                              {settlement.allocations.map((line) => (
                                <tr key={line.id}>
                                  <td className="px-3 py-2 text-[#7A6B58]">
                                    {dateTime(line.paymentDate)}
                                  </td>
                                  <td className="px-3 py-2 font-medium text-[#251605]">
                                    {accountMethodLabel(line.method)}
                                  </td>
                                  <td className="px-3 py-2 text-[#7A6B58]">{line.actorName}</td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums text-[#251605]">
                                    {money(line.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : settlementQuery.isError ? (
                  <div className="p-8 text-center text-sm text-destructive">
                    {settlementQuery.error instanceof Error
                      ? settlementQuery.error.message
                      : "Settlement could not be loaded."}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-[#7A6B58]">
                    Loading settlement detail…
                  </div>
                )}

                {/* Integrated Company Sales Receipts */}
                {isCompany ? (
                  <div className="mt-4">
                    <CompanySalesReceiptSection
                      restaurantId={restaurantId}
                      invoiceId={invoice.id}
                      canRegister={canManage}
                      canInspect={canManage}
                      canAllocate={canAllocate}
                      money={money}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "withholding" && isCompany ? (
              <div className="space-y-4 max-w-4xl mx-auto">
                <CompanyWithholdingSection
                  restaurantId={restaurantId}
                  invoiceId={invoice.id}
                  accountOpen={accountOpen}
                  money={money}
                />
              </div>
            ) : null}

            {activeTab === "credit-notes" ? (
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-4 text-xs text-blue-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <ArrowDownLeft className="size-4 text-blue-700" />
                    <span>Credit Notes for Corporate Invoice {invoice.issuedNumber}</span>
                  </div>
                  <p className="mt-1 text-blue-800">
                    Credit notes reduce the accounts receivable on this company invoice (e.g. for
                    billing adjustments or discounts).
                  </p>
                </div>
                <CreditNoteSection
                  restaurantId={restaurantId}
                  accountInvoiceId={invoice.id}
                  canManage={canManage}
                  money={money}
                  dateTime={dateTime}
                  onIssued={() => {
                    void settlementQuery.refetch();
                    onChanged();
                  }}
                />
              </div>
            ) : null}

            {activeTab === "debit-notes" ? (
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <ArrowUpRight className="size-4 text-amber-700" />
                    <span>Debit Notes for Corporate Invoice {invoice.issuedNumber}</span>
                  </div>
                  <p className="mt-1 text-amber-800">
                    Debit notes add supplementary charges or adjustments to this issued corporate
                    invoice.
                  </p>
                </div>
                <DebitNoteSection
                  restaurantId={restaurantId}
                  accountInvoiceId={invoice.id}
                  canManage={canManage}
                  money={money}
                  dateTime={dateTime}
                  onIssued={() => {
                    void settlementQuery.refetch();
                    onChanged();
                  }}
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceReceivePaymentDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        target={{ lane: "company", restaurantId, accountId, invoiceId: invoice.id }}
        outstanding={outstanding}
        currency={settlement?.currency ?? invoice.snapshot.account.currency}
        receivedFrom={invoice.snapshot.account.name}
        canAllocateExisting={canAllocate}
        onSettled={refreshSettlement}
        onAllocateExisting={(paymentId) => openAllocation(paymentId)}
      />

      <AllocatePaymentDialog
        open={Boolean(allocatePaymentId)}
        restaurantId={restaurantId}
        accountId={accountId}
        paymentId={allocatePaymentId}
        focusInvoiceId={invoice.id}
        money={money}
        dateTime={dateTime}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAllocatePaymentId(null);
          if (!isOpen) void refreshSettlement();
        }}
      />

      <Dialog open={paymentPickerOpen} onOpenChange={setPaymentPickerOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] p-6 shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#E5DECE] bg-[#F4E9D0] text-[#765719]">
                <ArrowRightLeft className="size-4" />
              </div>
              <div>
                <DialogTitle className="font-display text-base font-bold text-[#251605]">
                  Select Payment to Allocate
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7A6B58]">
                  Choose which payment to apply toward invoice {invoice.issuedNumber}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
            {availablePayments.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPaymentPickerOpen(false);
                  setAllocatePaymentId(p.id);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[#E8E1D7] bg-white p-3 text-left transition hover:border-[#C89933] hover:bg-[#FDFBF7] shadow-2xs"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium text-xs text-[#251605]">
                    <CreditCard className="size-3.5 text-[#8A641A]" />
                    <span>{accountMethodLabel(p.paymentMethod)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#7A6B58]">
                    {dateTime(p.postedAt)} {p.description ? `· ${p.description}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-[#7A6B58] block">
                    Available
                  </span>
                  <span className="text-xs font-bold text-emerald-700 tabular-nums">
                    {money(p.remainingRefundable)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
