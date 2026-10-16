import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import { listOwnerActivity } from "@/packages/pms/lib/cashiering-transaction-history.functions";
import {
  buildFinancialHistory,
  filterHistoryEvents,
  historyEventDetail,
  historyMethodLabel,
  mergeDocumentActivity,
  pageHistoryEvents,
  type ActivityEvent,
  type HistoryAccess,
  type HistoryAllocation,
  type HistoryCounterparty,
  type HistoryCoverageInput,
  type HistoryEvent,
  type HistoryLedgerRow,
  type HistoryQuickFilter,
} from "@/packages/pms/lib/cashiering-transaction-history";
import type {
  DateTimeFormat,
  Money,
} from "@/packages/pms/components/cashiering/folio-workspace-panels";

const QUICK: Array<{ id: HistoryQuickFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "charges", label: "Charges" },
  { id: "payments", label: "Payments" },
  { id: "deposits", label: "Deposits" },
  { id: "refunds", label: "Refunds" },
  { id: "adjustments", label: "Adjustments" },
  { id: "transfers", label: "Transfers" },
];

const METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;

function signed(money: Money, value: number): string {
  if (value < -0.009) return `− ${money(Math.abs(value))}`;
  if (value > 0.009) return money(value);
  return money(0);
}

function DetailLine({ line, money }: { line: string; money: Money }) {
  const split = line.split("|");
  if (split.length === 2 && Number.isFinite(Number(split[1]))) {
    return (
      <div className="flex justify-between gap-3">
        <span>{split[0]}</span>
        <span className="tabular-nums">{signed(money, Number(split[1]))}</span>
      </div>
    );
  }
  return <p>{line}</p>;
}

export function TransactionHistoryPanel({
  restaurantId,
  ownerType,
  ownerId,
  rows,
  allocations,
  counterparts,
  coverage,
  access,
  searchExtras = [],
  documents = [],
  money,
  dateTime,
  onCorrect,
  onTransfer,
  onRefund,
  onApplyDeposit,
  onViewDocuments,
  onOpenFolio,
  onOpenAccount,
}: {
  restaurantId: string;
  ownerType: "guest_folio" | "financial_account";
  ownerId: string;
  rows: HistoryLedgerRow[];
  allocations: HistoryAllocation[];
  counterparts: Record<string, HistoryCounterparty>;
  coverage: HistoryCoverageInput;
  access: HistoryAccess;
  searchExtras?: string[];
  documents?: ActivityEvent[];
  money: Money;
  dateTime: DateTimeFormat;
  onCorrect?: (chargeId: string) => void;
  onTransfer?: (chargeId: string) => void;
  onRefund?: (sourceId: string) => void;
  onApplyDeposit?: (depositId: string) => void;
  onViewDocuments?: () => void;
  onOpenFolio?: (folioId: string) => void;
  onOpenAccount?: (accountId: string) => void;
}) {
  const fetchActivity = useServerFn(listOwnerActivity);
  const activityQuery = useQuery({
    queryKey: ["owner-activity", restaurantId, ownerType, ownerId],
    queryFn: () => fetchActivity({ data: { restaurantId, ownerType, ownerId } }),
  });
  const [mode, setMode] = useState<"financial" | "activity">("financial");
  const [quick, setQuick] = useState<HistoryQuickFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("all");
  const [actor, setActor] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [openId, setOpenId] = useState<string | null>(null);

  const mergedCoverage = useMemo<HistoryCoverageInput>(
    () => ({
      ...coverage,
      debitNotes: activityQuery.data?.debitNotes?.length
        ? activityQuery.data.debitNotes
        : coverage.debitNotes,
      creditNotes: activityQuery.data?.creditNotes?.length
        ? activityQuery.data.creditNotes
        : coverage.creditNotes,
    }),
    [activityQuery.data, coverage],
  );
  const events = useMemo(
    () =>
      buildFinancialHistory({
        rows,
        allocations,
        counterparts,
        coverage: mergedCoverage,
        access,
      }),
    [rows, allocations, counterparts, mergedCoverage, access],
  );
  const actors = useMemo(
    () => [
      ...new Set(
        events.map((event) => event.postedBy).filter((name): name is string => Boolean(name)),
      ),
    ],
    [events],
  );
  const filtered = useMemo(
    () =>
      filterHistoryEvents(
        events,
        { quick, from, to, method: method === "all" ? "" : method, actor, search },
        searchExtras,
      ),
    [events, quick, from, to, method, actor, search, searchExtras],
  );
  const paged = pageHistoryEvents(filtered, { page, pageSize, sort });
  const selected = events.find((event) => event.id === openId) ?? null;
  const detail = selected
    ? historyEventDetail(selected, {
        rows,
        allocations,
        counterparts,
        coverage: mergedCoverage,
        access,
      })
    : null;
  const activity = mergeDocumentActivity(activityQuery.data?.activity ?? [], documents);

  return (
    <section className="space-y-3" data-testid="folio-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "financial" ? "default" : "outline"}
            onClick={() => setMode("financial")}
          >
            Transactions
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "activity" ? "default" : "outline"}
            onClick={() => setMode("activity")}
          >
            Activity
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "financial"
            ? "Balance-affecting events. Tax and service stay inside the charge."
            : "Invoices, notes, allocations, and close. These do not change the balance."}
        </p>
      </div>

      {mode === "activity" ? (
        <ActivityTable events={activity} dateTime={dateTime} onViewDocuments={onViewDocuments} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={quick === item.id ? "default" : "outline"}
                onClick={() => {
                  setQuick(item.id);
                  setPage(1);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Field label="From">
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Method">
              <Select
                value={method}
                onValueChange={(value) => {
                  setMethod(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {METHODS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {historyMethodLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Posted by">
              <Select
                value={actor}
                onValueChange={(value) => {
                  setActor(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {actors.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Search">
              <Input
                value={search}
                placeholder="Description, method, or name"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Order">
              <Select value={sort} onValueChange={(value) => setSort(value as "newest" | "oldest")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date & time</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-left font-medium">Context</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Balance after</th>
                  <th className="px-3 py-2 text-left font-medium">Posted by</th>
                  <th className="px-3 py-2 text-left font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No transactions match.
                    </td>
                  </tr>
                ) : (
                  paged.rows.map((event) => (
                    <tr
                      key={event.id}
                      className="cursor-pointer border-b border-[#E8E1D7]/70 last:border-0 hover:bg-[#F7F4EE]/70"
                      onClick={() => setOpenId(event.id)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {dateTime(event.occurredAt)}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{event.label}</td>
                      <td className="px-3 py-2">{event.description}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {event.context ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {signed(money, event.amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {signed(money, event.balanceAfter)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {event.postedBy ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{event.state}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {paged.total === 0
                ? "0"
                : `${(paged.page - 1) * paged.pageSize + 1}–${Math.min(paged.page * paged.pageSize, paged.total)}`}{" "}
              of {paged.total}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={paged.page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={paged.page * paged.pageSize >= paged.total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => (open ? null : setOpenId(null))}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
          {selected && detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.label}</SheetTitle>
                <SheetDescription>
                  {signed(money, selected.amount)} · {dateTime(selected.occurredAt)} ·{" "}
                  {selected.state}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 px-4 text-sm">
                <p className="text-muted-foreground">Posted by {selected.postedBy ?? "—"}</p>
                {detail.lines.map((line) => (
                  <DetailLine key={line} line={line} money={money} />
                ))}
                {detail.kind === "deposit"
                  ? detail.allocations.map((line) => (
                      <div
                        key={`${line.description}-${line.amount}`}
                        className="flex justify-between gap-3"
                      >
                        <span>Allocated to {line.description}</span>
                        <span className="tabular-nums">{money(line.amount)}</span>
                      </div>
                    ))
                  : null}
                <HistoryActions
                  event={selected}
                  onCorrect={onCorrect}
                  onTransfer={onTransfer}
                  onRefund={onRefund}
                  onApplyDeposit={onApplyDeposit}
                  onViewDocuments={onViewDocuments}
                  onOpenFolio={onOpenFolio}
                  onOpenAccount={onOpenAccount}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function HistoryActions({
  event,
  onCorrect,
  onTransfer,
  onRefund,
  onApplyDeposit,
  onViewDocuments,
  onOpenFolio,
  onOpenAccount,
}: {
  event: HistoryEvent;
  onCorrect?: (chargeId: string) => void;
  onTransfer?: (chargeId: string) => void;
  onRefund?: (sourceId: string) => void;
  onApplyDeposit?: (depositId: string) => void;
  onViewDocuments?: () => void;
  onOpenFolio?: (folioId: string) => void;
  onOpenAccount?: (accountId: string) => void;
}) {
  const buttons: Array<{ key: string; label: string; onClick: () => void }> = [];
  if (event.actions.correct && onCorrect)
    buttons.push({ key: "correct", label: "Correct charge", onClick: () => onCorrect(event.id) });
  if (event.actions.transfer && onTransfer)
    buttons.push({
      key: "transfer",
      label: "Transfer charge",
      onClick: () => onTransfer(event.id),
    });
  if (event.actions.refund && onRefund)
    buttons.push({ key: "refund", label: "Refund", onClick: () => onRefund(event.id) });
  if (event.actions.applyDeposit && onApplyDeposit) {
    buttons.push({ key: "apply", label: "Apply deposit", onClick: () => onApplyDeposit(event.id) });
  }
  if (
    (event.actions.viewInvoice || event.actions.viewCreditNote || event.actions.viewDebitNote) &&
    onViewDocuments
  ) {
    buttons.push({ key: "docs", label: "View documents", onClick: onViewDocuments });
  }
  if (event.actions.viewCounterparty && event.counterparty?.folioId && onOpenFolio) {
    const folioId = event.counterparty.folioId;
    buttons.push({ key: "folio", label: "View folio", onClick: () => onOpenFolio(folioId) });
  }
  if (event.actions.viewCounterparty && event.counterparty?.accountId && onOpenAccount) {
    const accountId = event.counterparty.accountId;
    buttons.push({
      key: "account",
      label: "View account",
      onClick: () => onOpenAccount(accountId),
    });
  }
  if (buttons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {buttons.map((button) => (
        <Button key={button.key} type="button" size="sm" variant="outline" onClick={button.onClick}>
          {button.label}
        </Button>
      ))}
    </div>
  );
}

function ActivityTable({
  events,
  dateTime,
  onViewDocuments,
}: {
  events: ActivityEvent[];
  dateTime: DateTimeFormat;
  onViewDocuments?: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">When</th>
            <th className="px-3 py-2 text-left font-medium">Event</th>
            <th className="px-3 py-2 text-left font-medium">Detail</th>
            <th className="px-3 py-2 text-left font-medium">User</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                No activity yet.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id} className="border-b border-[#E8E1D7]/70 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {dateTime(event.occurredAt)}
                </td>
                <td className="px-3 py-2">{event.label}</td>
                <td className="px-3 py-2">
                  {event.detail || "—"}
                  {onViewDocuments && event.kind.startsWith("invoice") ? (
                    <button
                      type="button"
                      className={cn("ml-2 text-xs font-medium text-[#8a6a1f]")}
                      onClick={onViewDocuments}
                    >
                      Open
                    </button>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{event.actor ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
