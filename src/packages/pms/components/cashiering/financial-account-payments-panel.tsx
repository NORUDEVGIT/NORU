import * as React from "react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Landmark, Scale, Search } from "lucide-react";
import { toast } from "sonner";

import {
  AllocatePaymentDialog,
  ReverseAllocationDialog,
} from "@/packages/pms/components/cashiering/financial-account-allocation-drawer";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  ACCOUNT_TENDER_METHODS,
  accountBalancePresentation,
  accountMethodLabel,
  accountPaymentCapabilities,
  accountPaymentDescription,
  moneyInputValue,
  overpaymentCredit,
  parsePositiveAmount,
  projectedAccountBalance,
  tenderStateLabel,
  tenderTypeLabel,
  writeOffAllowed,
  type AccountPaymentRow,
  type AccountTenderMethod,
} from "@/packages/pms/lib/cashiering-account-payments";
import {
  getFinancialAccountPaymentDetail,
  listFinancialAccountPayments,
} from "@/packages/pms/lib/cashiering-account-payments.functions";
import type { AccountWorkspaceKind } from "@/packages/pms/lib/cashiering-account-workspace";
import {
  postFinancialAccountEntry,
  postSettlementWriteOff,
} from "@/packages/pms/lib/cashiering-phases.functions";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DepositReceiptModal,
  TenderReceiptPrint,
  type TenderReceipt,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { getCashieringDocumentProperty } from "@/packages/pms/lib/cashiering-invoices.functions";
import {
  cashieringPropertyHotelName,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";

type Money = (value: number) => string;
type DateTime = (iso: string | null | undefined) => string;
type PageSize = 10 | 25 | 50;
type Compose = "payment" | "writeoff" | null;

function postingKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function FinancialAccountPayments({
  restaurantId,
  accountId,
  accountName,
  accountNumber,
  accountKind,
  currency,
  status,
  balance,
  role,
  money,
  dateTime,
  compose,
  onComposeHandled,
  onPosted,
  initialPaymentId,
}: {
  restaurantId: string;
  accountId: string;
  accountName: string;
  accountNumber: string;
  accountKind: AccountWorkspaceKind;
  currency: string;
  status: "open" | "closed";
  balance: number;
  role: string;
  money: Money;
  dateTime: DateTime;
  compose: Compose;
  onComposeHandled: () => void;
  onPosted: () => void;
  initialPaymentId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const fetchPayments = useServerFn(listFinancialAccountPayments);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "payment" | "refund" | "write_off">("all");
  const [method, setMethod] = useState<"all" | AccountTenderMethod>("all");
  const [postedBy, setPostedBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentKey, setPaymentKey] = useState("");
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffKey, setWriteOffKey] = useState("");
  const [refundRow, setRefundRow] = useState<AccountPaymentRow | null>(null);
  const [refundKey, setRefundKey] = useState("");
  const [allocatePaymentId, setAllocatePaymentId] = useState<string | null>(() => initialPaymentId ?? null);

  useEffect(() => {
    if (initialPaymentId) {
      setAllocatePaymentId(initialPaymentId);
    }
  }, [initialPaymentId]);
  const [reverseAllocation, setReverseAllocation] = useState<{
    id: string;
    invoiceNumber: string;
    amount: number;
    activeAmount: number;
  } | null>(null);
  const [receipt, setReceipt] = useState<TenderReceipt | null>(null);
  const fetchProperty = useServerFn(getCashieringDocumentProperty);
  const propertyQuery = useQuery({
    queryKey: ["cashiering-document-property", restaurantId],
    queryFn: () => fetchProperty({ data: { restaurantId } }),
  });
  const documentProperty: CashieringDocumentProperty | null = propertyQuery.data ?? null;

  const paymentsQuery = useQuery({
    queryKey: [
      "financial-account-payments",
      restaurantId,
      accountId,
      search,
      type,
      method,
      postedBy,
      from,
      to,
      sort,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchPayments({
        data: {
          restaurantId,
          accountId,
          search,
          type,
          method,
          postedBy: postedBy || null,
          from: from || null,
          to: to || null,
          sort,
          page,
          pageSize,
        },
      }),
  });
  const result = paymentsQuery.data;
  const shownBalance = result?.balance ?? balance;
  const shownStatus = result?.status ?? status;
  const caps = useMemo(
    () =>
      result?.capabilities ??
      accountPaymentCapabilities({
        role,
        status: shownStatus,
        balance: shownBalance,
        accountKind,
      }),
    [accountKind, result?.capabilities, role, shownBalance, shownStatus],
  );
  const presentation = accountBalancePresentation(shownBalance);
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  function refreshMoney() {
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-payments", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-payment", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashier-shift-activity", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-business-date", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
    onPosted();
  }

  function openPayment() {
    setPaymentKey(postingKey("pay"));
    setPaymentOpen(true);
  }

  function openWriteOff() {
    setWriteOffKey(postingKey("woff"));
    setWriteOffOpen(true);
  }

  function openRefund(row: AccountPaymentRow) {
    setRefundKey(postingKey("refund"));
    setRefundRow(row);
  }

  useEffect(() => {
    if (!compose) return;
    if (compose === "payment" && caps.canReceivePayment) openPayment();
    if (compose === "writeoff" && caps.canWriteOff) openWriteOff();
    onComposeHandled();
  }, [compose, caps.canReceivePayment, caps.canWriteOff, onComposeHandled]);

  return (
    <section className="space-y-4" data-testid="account-payments">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[#251605]">Payments</h2>
          <p className="text-sm text-muted-foreground">
            Payments, refunds, and write-offs posted to this financial account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.canReceivePayment ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
              data-testid="receive-payment"
              onClick={openPayment}
            >
              <Landmark className="size-4" /> Receive Payment
            </Button>
          ) : null}
          {caps.canWriteOff ? (
            <Button variant="outline" data-testid="write-off" onClick={openWriteOff}>
              <Scale className="size-4" /> Write Off
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Current Balance"
          value={formatBalance(money, shownBalance)}
          hint={presentation.label}
        />
        <Summary
          label="Payments"
          value={money(result?.totals.payments ?? 0)}
          hint={result?.scopeLabel ?? "Account lifetime"}
        />
        <Summary
          label="Refunds"
          value={money(result?.totals.refunds ?? 0)}
          hint={result?.scopeLabel ?? "Account lifetime"}
        />
        <Summary
          label="Write-Offs"
          value={money(result?.totals.writeOffs ?? 0)}
          hint={result?.scopeLabel ?? "Account lifetime"}
        />
        {(result?.totals.deposits ?? 0) > 0 ? (
          <Summary label="Deposits" value={money(result?.totals.deposits ?? 0)} hint="Historical" />
        ) : null}
      </div>

      <div className={cn(CARD, "space-y-3 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search description, method, or amount"
              className="h-9 pl-8 text-sm border-[#E8E1D7] bg-white focus-visible:ring-1 focus-visible:ring-[#C89933]"
            />
          </div>
          <Filter
            value={type}
            onChange={(value) => {
              setType(value as typeof type);
              setPage(1);
            }}
            options={[
              ["all", "All types"],
              ["payment", "Payments"],
              ["refund", "Refunds"],
              ["write_off", "Write-Offs"],
            ]}
          />
          <Filter
            value={method}
            onChange={(value) => {
              setMethod(value as typeof method);
              setPage(1);
            }}
            options={[
              ["all", "All methods"],
              ...ACCOUNT_TENDER_METHODS.map((item) => [item, accountMethodLabel(item)] as const),
            ]}
          />
          <Filter
            value={postedBy}
            onChange={(value) => {
              setPostedBy(value);
              setPage(1);
            }}
            options={[
              ["", "Posted by"],
              ...(result?.actors ?? []).map((actor) => [actor.id, actor.name] as const),
            ]}
          />
          <Filter
            value={sort}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
              ["amount", "Amount"],
            ]}
          />
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              aria-label="To date"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#E8E1D7] overflow-hidden">
          {paymentsQuery.isLoading ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">Loading payments…</p>
          ) : (result?.accountTotal ?? 0) === 0 ? (
            <div className="px-4 py-12 text-center" data-testid="payment-empty">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FAF8F4] text-muted-foreground">
                <Landmark className="size-6 text-[#C89933]" />
              </div>
              <p className="mt-3 font-medium text-[#251605]">No payments have been posted to this financial account.</p>
              {caps.canReceivePayment ? (
                <Button className="mt-4 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]" onClick={openPayment}>
                  Receive Payment
                </Button>
              ) : null}
            </div>
          ) : result?.total === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">
              No payments match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm" data-testid="payment-table">
                <thead className="bg-[#FAF8F4] border-b border-[#E8E1D7] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">
                  <tr>
                    <th className="px-3.5 py-2.5">Date & time</th>
                    <th className="px-3.5 py-2.5">Type</th>
                    <th className="px-3.5 py-2.5">Method</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Received from / description</th>
                    <th className="px-3.5 py-2.5">Posted by</th>
                    <th className="px-3.5 py-2.5 text-right">Refunded</th>
                    <th className="px-3.5 py-2.5 text-right">Available</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]">
                  {(result?.rows ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-[#FAF8F4]/70 transition-colors"
                      data-testid="payment-row"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {dateTime(row.postedAt)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <TypeBadge type={row.transactionType} />
                        {row.paymentState ? (
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {tenderStateLabel(row.paymentState)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#F7F4EE] border border-[#E8E1D7] text-[#251605]">
                          {accountMethodLabel(row.paymentMethod)}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-[#251605]">
                        {money(row.displayAmount)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="block font-medium text-[#251605]">{row.description}</span>
                        {row.transactionType === "refund" && row.sourcePostedAt ? (
                          <span className="text-xs text-muted-foreground">
                            Payment on {dateTime(row.sourcePostedAt)} ·{" "}
                            {accountMethodLabel(row.sourceMethod)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {row.actorName ?? "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.transactionType === "payment" || row.transactionType === "deposit"
                          ? money(row.refundedTotal)
                          : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-medium text-[#251605]">
                        {row.transactionType === "payment" || row.transactionType === "deposit"
                          ? money(row.remainingRefundable)
                          : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="text-xs font-medium text-[#C89933] hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(row.id);
                          }}
                        >
                          View details
                        </button>
                        {row.canRefund ? (
                          <button
                            type="button"
                            className="ml-3 text-xs font-medium text-rose-600 hover:underline"
                            data-testid="refund-payment"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRefund(row);
                            }}
                          >
                            Refund
                          </button>
                        ) : null}
                        {row.canViewSource && row.sourcePaymentId ? (
                          <button
                            type="button"
                            className="ml-3 text-xs font-medium text-[#C89933] hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(row.sourcePaymentId);
                            }}
                          >
                            View original payment
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pager
          page={result?.page ?? page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <PaymentDialog
        open={paymentOpen}
        postingKey={paymentKey}
        restaurantId={restaurantId}
        accountId={accountId}
        accountName={accountName}
        accountNumber={accountNumber}
        currency={currency}
        balance={shownBalance}
        actorOpenCashShift={result?.actorOpenCashShift ?? false}
        money={money}
        documentProperty={documentProperty}
        onOpenChange={setPaymentOpen}
        onPosted={refreshMoney}
        onReceipt={(r) => setReceipt(r)}
      />
      <WriteOffDialog
        open={writeOffOpen}
        postingKey={writeOffKey}
        restaurantId={restaurantId}
        accountId={accountId}
        balance={shownBalance}
        money={money}
        onOpenChange={setWriteOffOpen}
        onPosted={refreshMoney}
      />
      <RefundDialog
        row={refundRow}
        postingKey={refundKey}
        restaurantId={restaurantId}
        accountId={accountId}
        balance={shownBalance}
        actorOpenCashShift={result?.actorOpenCashShift ?? false}
        money={money}
        dateTime={dateTime}
        onOpenChange={(open) => {
          if (!open) setRefundRow(null);
        }}
        onPosted={refreshMoney}
      />
      <PaymentDetail
        restaurantId={restaurantId}
        accountId={accountId}
        transactionId={selectedId}
        money={money}
        dateTime={dateTime}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onRefund={(row) => {
          setSelectedId(null);
          openRefund(row);
        }}
        onAllocate={(id) => setAllocatePaymentId(id)}
        onReverse={(allocation) => setReverseAllocation(allocation)}
        onViewSource={(id) => setSelectedId(id)}
      />
      <AllocatePaymentDialog
        open={Boolean(allocatePaymentId)}
        restaurantId={restaurantId}
        accountId={accountId}
        paymentId={allocatePaymentId}
        money={money}
        dateTime={dateTime}
        onOpenChange={(open) => {
          if (!open) setAllocatePaymentId(null);
        }}
      />
      <ReverseAllocationDialog
        restaurantId={restaurantId}
        allocation={reverseAllocation}
        money={money}
        onOpenChange={(open) => {
          if (!open) setReverseAllocation(null);
        }}
      />
      {receipt ? (
        <>
          <DepositReceiptModal
            receipt={receipt}
            open={Boolean(receipt)}
            money={money}
            dateTime={dateTime}
            onClose={() => setReceipt(null)}
          />
          <TenderReceiptPrint receipt={receipt} money={money} dateTime={dateTime} />
        </>
      ) : null}
    </section>
  );
}

function PaymentDialog({
  open,
  postingKey,
  restaurantId,
  accountId,
  accountName,
  accountNumber,
  currency,
  balance,
  actorOpenCashShift,
  money,
  documentProperty,
  onOpenChange,
  onPosted,
  onReceipt,
}: {
  open: boolean;
  postingKey: string;
  restaurantId: string;
  accountId: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  balance: number;
  actorOpenCashShift: boolean;
  money: Money;
  documentProperty: CashieringDocumentProperty | null;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
  onReceipt?: (receipt: TenderReceipt) => void;
}) {
  const post = useServerFn(postFinancialAccountEntry);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [notes, setNotes] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const parsed = parsePositiveAmount(amount);
  const credit = parsed == null ? null : overpaymentCredit(balance, parsed);
  const projected = parsed == null ? null : projectedAccountBalance(balance, "payment", parsed);
  const description = accountPaymentDescription(receivedFrom, notes);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMethod("");
    setReceivedFrom("");
    setNotes("");
    setPrintReceipt(true);
  }, [open, postingKey]);

  const mutation = useMutation({
    mutationFn: () => {
      if (parsed == null || !method || !receivedFrom.trim() || description.length > 200) {
        throw new Error("Enter the amount, method, and who the payment was received from.");
      }
      return post({
        data: {
          restaurantId,
          accountId,
          type: "payment",
          amount: parsed,
          method,
          description,
          idempotencyKey: postingKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (printReceipt) {
        const receiptData: TenderReceipt = {
          kind: "payment",
          transactionId: result.id || postingKey,
          postedAt: new Date().toISOString(),
          receivedFrom: receivedFrom.trim(),
          amount: parsed ?? 0,
          method: accountMethodLabel(method as AccountTenderMethod),
          notes: notes.trim(),
          folioNumber: accountNumber,
          guestName: accountName,
          propertyName: cashieringPropertyHotelName(documentProperty) || "Property",
          property: documentProperty,
          currencyCode: currency,
          folioBalance: projected ?? balance,
        };
        onReceipt?.(receiptData);
        window.setTimeout(() => {
          window.print();
        }, 120);
      }
      toast.success("Payment posted.");
      onOpenChange(false);
      onPosted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
          <DialogDescription>
            {accountName} · {accountNumber} · {currency}. This payment is posted to the financial
            account. It is not applied to an invoice, source folio, or charge.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Info
            label="Current balance"
            value={`${accountBalancePresentation(balance).label} ${formatBalance(money, balance)}`}
          />
          <Info label="Currency" value={currency} />
          <Info label="Posting time" value="Assigned by the server when the payment posts." />
          <Field label="Amount *">
            <Input
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Payment method *">
            <Filter
              value={method}
              onChange={setMethod}
              options={[
                ["", "Choose method"],
                ...ACCOUNT_TENDER_METHODS.map((item) => [item, accountMethodLabel(item)] as const),
              ]}
            />
          </Field>
          <Field label="Received from *">
            <Input
              value={receivedFrom}
              maxLength={80}
              onChange={(event) => setReceivedFrom(event.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              maxLength={100}
              rows={2}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-[#251605] cursor-pointer">
            <Checkbox
              checked={printReceipt}
              onCheckedChange={(checked) => setPrintReceipt(checked === true)}
            />
            <span>Print receipt</span>
          </label>
          {parsed != null && projected != null ? (
            <div className="space-y-1 rounded-lg bg-[#F7F4EE] px-3 py-2">
              <Info label="Current balance" value={formatBalance(money, balance)} />
              <Info label="Payment" value={money(parsed)} />
              <Info
                label="Projected balance"
                value={`${accountBalancePresentation(projected).label} ${formatBalance(money, projected)}`}
              />
            </div>
          ) : null}
          {credit != null ? (
            <p className="text-[#8A6A2F]">
              This payment will leave a credit balance of {money(credit)}.
            </p>
          ) : null}
          {method === "cash" ? (
            <p className="text-xs text-muted-foreground">
              {actorOpenCashShift
                ? "This cash payment will be included in your open cashier shift."
                : "No open cashier shift. Payment can still be posted but will not be part of a drawer."}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={mutation.isPending || parsed == null || !method || !receivedFrom.trim()}
            onClick={() => mutation.mutate()}
          >
            {credit != null ? "Post payment and leave credit" : "Receive payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  row,
  postingKey,
  restaurantId,
  accountId,
  balance,
  actorOpenCashShift,
  money,
  dateTime,
  onOpenChange,
  onPosted,
}: {
  row: AccountPaymentRow | null;
  postingKey: string;
  restaurantId: string;
  accountId: string;
  balance: number;
  actorOpenCashShift: boolean;
  money: Money;
  dateTime: DateTime;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
}) {
  const post = useServerFn(postFinancialAccountEntry);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const parsed = parsePositiveAmount(amount);
  const tooMuch = parsed != null && row != null && parsed > row.remainingRefundable + 0.001;
  const projected = parsed == null ? null : projectedAccountBalance(balance, "refund", parsed);

  useEffect(() => {
    if (!row) return;
    setAmount("");
    setReason("");
  }, [row, postingKey]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!row || parsed == null || tooMuch || !reason.trim()) {
        throw new Error("Enter a refund amount within the remaining refundable balance.");
      }
      return post({
        data: {
          restaurantId,
          accountId,
          type: "refund",
          amount: parsed,
          method: row.paymentMethod ?? undefined,
          description: reason.trim(),
          originalTransactionId: row.id,
          idempotencyKey: postingKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Refund posted.");
      onOpenChange(false);
      onPosted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            The refund uses the original payment method and cannot exceed what that payment still
            has left.
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <div className="space-y-3 text-sm">
            <Info label="Original payment" value={dateTime(row.postedAt)} />
            <Info label="Method" value={accountMethodLabel(row.paymentMethod)} />
            <Info label="Original amount" value={money(row.displayAmount)} />
            <Info label="Already refunded" value={money(row.refundedTotal)} />
            <Info label="Allocated" value={money(row.allocatedTotal)} />
            <Info label="Available to refund" value={money(row.remainingRefundable)} />
            {row.allocatedTotal > 0.01 ? (
              <p className="text-xs text-muted-foreground">
                Allocated amounts must be reversed before they can be refunded.
              </p>
            ) : null}
            <Field label="Refund amount *">
              <Input
                value={amount}
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="Reason *">
              <Textarea
                value={reason}
                maxLength={200}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {tooMuch ? (
              <p className="text-destructive">
                Refund cannot exceed the remaining refundable amount.
              </p>
            ) : null}
            {parsed != null && projected != null && !tooMuch ? (
              <div className="space-y-1 rounded-lg bg-[#F7F4EE] px-3 py-2">
                <Info
                  label="Projected balance"
                  value={`${accountBalancePresentation(projected).label} ${formatBalance(money, projected)}`}
                />
              </div>
            ) : null}
            {row.paymentMethod === "cash" ? (
              <p className="text-xs text-muted-foreground">
                {actorOpenCashShift
                  ? "This cash refund will be included in your open cashier shift."
                  : "No open cashier shift. The refund can still be posted but will not be part of a drawer."}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || parsed == null || tooMuch || !reason.trim()}
            onClick={() => mutation.mutate()}
          >
            Post refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WriteOffDialog({
  open,
  postingKey,
  restaurantId,
  accountId,
  balance,
  money,
  onOpenChange,
  onPosted,
}: {
  open: boolean;
  postingKey: string;
  restaurantId: string;
  accountId: string;
  balance: number;
  money: Money;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
}) {
  const writeOff = useServerFn(postSettlementWriteOff);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const parsed = parsePositiveAmount(amount);
  const allowed = parsed != null && writeOffAllowed(balance, parsed);
  const projected = parsed == null ? null : projectedAccountBalance(balance, "write_off", parsed);

  useEffect(() => {
    if (!open) return;
    setAmount(moneyInputValue(balance));
    setReason("");
  }, [open, postingKey, balance]);

  const mutation = useMutation({
    mutationFn: () => {
      if (parsed == null || !allowed || !reason.trim()) {
        throw new Error("Enter a write-off no greater than the amount due.");
      }
      return writeOff({
        data: {
          restaurantId,
          accountId,
          amount: parsed,
          reason: reason.trim(),
          idempotencyKey: postingKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Write-off posted. The account stays open.");
      onOpenChange(false);
      onPosted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write Off</DialogTitle>
          <DialogDescription>
            Write-off removes an uncollectible balance. It is not cash and does not close the
            account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Info label="Current balance" value={formatBalance(money, balance)} />
          <Field label="Write-off amount *">
            <Input
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Reason *">
            <Textarea
              value={reason}
              maxLength={300}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {parsed != null && !allowed ? (
            <p className="text-destructive">Write-off cannot exceed the amount due.</p>
          ) : null}
          {parsed != null && projected != null && allowed ? (
            <div className="space-y-1 rounded-lg bg-[#F7F4EE] px-3 py-2">
              <Info
                label="Projected balance"
                value={`${accountBalancePresentation(projected).label} ${formatBalance(money, projected)}`}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !allowed || !reason.trim()}
            onClick={() => mutation.mutate()}
          >
            Post write-off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetail({
  restaurantId,
  accountId,
  transactionId,
  money,
  dateTime,
  onOpenChange,
  onRefund,
  onAllocate,
  onReverse,
  onViewSource,
}: {
  restaurantId: string;
  accountId: string;
  transactionId: string | null;
  money: Money;
  dateTime: DateTime;
  onOpenChange: (open: boolean) => void;
  onRefund: (row: AccountPaymentRow) => void;
  onAllocate: (id: string) => void;
  onReverse: (allocation: {
    id: string;
    invoiceNumber: string;
    amount: number;
    activeAmount: number;
  }) => void;
  onViewSource: (id: string) => void;
}) {
  const fetchDetail = useServerFn(getFinancialAccountPaymentDetail);
  const detailQuery = useQuery({
    queryKey: ["financial-account-payment", restaurantId, accountId, transactionId],
    queryFn: () =>
      fetchDetail({
        data: { restaurantId, accountId, transactionId: transactionId! },
      }),
    enabled: Boolean(transactionId),
  });
  const detail = detailQuery.data;
  const payment = detail?.payment;

  return (
    <Sheet open={Boolean(transactionId)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="payment-detail"
      >
        <SheetHeader>
          <SheetTitle>Payment details</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.accountName} · ${detail.accountNumber}`
              : "Loading this account payment."}
          </SheetDescription>
        </SheetHeader>
        {!payment || !detail ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading payment…</p>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <Block title="Payment">
              <Info label="Type" value={tenderTypeLabel(payment.transactionType)} />
              <Info label="Amount" value={money(payment.displayAmount)} />
              <Info label="Method" value={accountMethodLabel(payment.paymentMethod)} />
              <Info label="Posted at" value={dateTime(payment.postedAt)} />
              <Info label="Posted by" value={payment.actorName ?? "—"} />
              <Info label="Description" value={payment.description} />
              <Info label="Currency" value={detail.currency} />
              {payment.paymentState ? (
                <Info label="Payment state" value={tenderStateLabel(payment.paymentState)} />
              ) : null}
            </Block>
            {payment.transactionType === "payment" || payment.transactionType === "deposit" ? (
              <Block title="Refund information">
                <Info label="Original amount" value={money(payment.displayAmount)} />
                <Info label="Refunded" value={money(payment.refundedTotal)} />
                {payment.transactionType === "payment" ? (
                  <Info label="Allocated" value={money(payment.allocatedTotal)} />
                ) : null}
                <Info label="Available to refund" value={money(payment.remainingRefundable)} />
                {payment.transactionType === "payment" && payment.allocatedTotal > 0.01 ? (
                  <p className="text-xs text-muted-foreground">
                    Allocated amounts must be reversed before they can be refunded.
                  </p>
                ) : null}
              </Block>
            ) : null}
            {payment.transactionType === "refund" && detail.source ? (
              <Block title="Source payment">
                <Info label="Posted" value={dateTime(detail.source.postedAt)} />
                <Info label="Method" value={accountMethodLabel(detail.source.paymentMethod)} />
                <Info label="Amount" value={money(detail.source.displayAmount)} />
                <Button variant="outline" onClick={() => onViewSource(detail.source!.id)}>
                  View original payment
                </Button>
              </Block>
            ) : null}
            {detail.shift ? (
              <Block title="Cashier shift">
                <Info label="Opened at" value={dateTime(detail.shift.openedAt)} />
                <Info label="Cashier" value={detail.shift.cashierName} />
              </Block>
            ) : null}
            {detail.linkedRefunds.length > 0 ? (
              <Block title="Linked refunds">
                {detail.linkedRefunds.map((refund) => (
                  <Info
                    key={refund.id}
                    label={dateTime(refund.postedAt)}
                    value={money(refund.displayAmount)}
                  />
                ))}
              </Block>
            ) : null}
            {payment.transactionType === "payment" ? (
              <Block title="Allocation summary">
                <Info label="Original payment" value={money(payment.displayAmount)} />
                <Info label="Refunded" value={money(payment.refundedTotal)} />
                <Info label="Allocated" value={money(payment.allocatedTotal)} />
                <Info label="Available" value={money(payment.remainingRefundable)} />
                {detail.allocations.filter((row) => row.amount > 0).length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {detail.allocations
                      .filter((row) => row.amount > 0)
                      .map((row) => (
                        <div key={row.id} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{row.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {dateTime(row.createdAt)} · {row.actorName} ·{" "}
                              {row.activeAmount > 0.01 ? "Allocated" : "Reversed"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular-nums">
                              {money(row.activeAmount > 0.01 ? row.activeAmount : row.amount)}
                            </p>
                            {detail.canReverse && row.activeAmount > 0.01 ? (
                              <button
                                type="button"
                                className="text-xs font-medium text-[#8a6a1f]"
                                onClick={() =>
                                  onReverse({
                                    id: row.id,
                                    invoiceNumber: row.invoiceNumber,
                                    amount: row.amount,
                                    activeAmount: row.activeAmount,
                                  })
                                }
                              >
                                Reverse allocation
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">This payment is unallocated.</p>
                )}
                {detail.canAllocate ? (
                  <Button className="mt-2" onClick={() => onAllocate(payment.id)}>
                    Allocate payment
                  </Button>
                ) : null}
              </Block>
            ) : null}
            {payment.canRefund ? (
              <Button variant="outline" onClick={() => onRefund(payment)}>
                Refund
              </Button>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={cn(CARD, "p-3.5 transition-shadow hover:shadow-md")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-[#251605] tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: AccountPaymentRow["transactionType"] }) {
  if (type === "payment") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
        Payment
      </span>
    );
  }
  if (type === "refund") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
        Refund
      </span>
    );
  }
  if (type === "write_off") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
        Write-off
      </span>
    );
  }
  if (type === "deposit") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-dashed border-[#C89933]">
        Historical Deposit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
      {tenderTypeLabel(type)}
    </span>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="block space-y-1">
      <span className="text-xs font-medium text-[#251605]">{label}</span>
      {children}
    </Label>
  );
}

function Filter({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <select
      value={value ?? ""}
      className="h-9 rounded-md border border-[#E8E1D7] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-xs hover:border-[#C89933] focus:border-[#C89933] focus:outline-hidden focus:ring-1 focus:ring-[#C89933]"
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([id, label]) => (
        <option key={id || "empty"} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Pager({
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#736B5E]">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          className="h-8 rounded-md border border-[#E8E1D7] bg-white px-2 text-xs font-medium text-[#251605]"
          onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-3.5 mr-1" /> Previous
        </Button>
        <span className="tabular-nums font-medium text-[#251605]">
          {page} of {pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight className="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
