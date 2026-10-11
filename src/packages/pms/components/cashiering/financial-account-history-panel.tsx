import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";

import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import { listFinancialAccountHistory } from "@/packages/pms/lib/cashiering-account-history.functions";
import type {
  AccountHistoryEvent,
  AccountHistoryFilter,
} from "@/packages/pms/lib/cashiering-account-history";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";
const FILTERS: Array<[AccountHistoryFilter, string]> = [
  ["all", "All events"],
  ["charges", "Charges"],
  ["transfers", "Transfers"],
  ["payments", "Payments"],
  ["refunds", "Refunds"],
  ["write_offs", "Write-offs"],
  ["corrections", "Corrections"],
  ["documents", "Invoices/Documents"],
  ["account", "Account events"],
];

type DateTime = (iso: string | null | undefined) => string;

export function FinancialAccountHistory({
  restaurantId,
  accountId,
  money,
  dateTime,
  onViewDocuments,
  onViewPayments,
}: {
  restaurantId: string;
  accountId: string;
  money: (value: number) => string;
  dateTime: DateTime;
  onViewDocuments: () => void;
  onViewPayments: () => void;
}) {
  const fetchHistory = useServerFn(listFinancialAccountHistory);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState<AccountHistoryFilter>("all");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [selected, setSelected] = useState<AccountHistoryEvent | null>(null);
  const query = useQuery({
    queryKey: [
      "financial-account-history",
      restaurantId,
      accountId,
      search,
      eventType,
      actorId,
      from,
      to,
      sort,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          accountId,
          search,
          eventType,
          actorId: actorId || null,
          from: from || null,
          to: to || null,
          sort,
          page,
          pageSize,
        },
      }),
  });
  const result = query.data;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <section className="space-y-4" data-testid="account-tab-history">
      <div>
        <h2 className="font-display text-xl text-[#251605]">History</h2>
        <p className="text-sm text-muted-foreground">
          Financial events and account activity. Dates use the property&apos;s local time.
        </p>
      </div>
      {result && !result.hasBalanceActivity ? (
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Financial account opened. No financial activity has been posted yet.
          </p>
        </div>
      ) : null}
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
              placeholder="Search folio, guest, document, description, or actor"
              className="h-9 pl-8 text-sm border-[#E8E1D7] bg-white focus-visible:ring-1 focus-visible:ring-[#C89933]"
              aria-label="Search history"
            />
          </div>
          <Select
            value={eventType}
            label="Event type"
            onChange={(value) => {
              setEventType(value as AccountHistoryFilter);
              setPage(1);
            }}
            options={FILTERS}
          />
          <Select
            value={actorId}
            label="Actor"
            onChange={(value) => {
              setActorId(value);
              setPage(1);
            }}
            options={[
              ["", "All actors"],
              ...(result?.actors ?? []).map((actor) => [actor.id, actor.name] as [string, string]),
            ]}
          />
          <Select
            value={sort}
            label="Order"
            onChange={(value) => setSort(value as "newest" | "oldest")}
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
            ]}
          />
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              aria-label="From date"
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              aria-label="To date"
              className="h-9 w-36 text-xs border-[#E8E1D7] bg-white"
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-[#E8E1D7] overflow-hidden">
          {query.isLoading ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">Loading history…</p>
          ) : !result || result.rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FAF8F4] text-muted-foreground">
                <History className="size-6 text-[#C89933]" />
              </div>
              <p className="mt-3 font-medium text-[#251605]">No events match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-[#FAF8F4] border-b border-[#E8E1D7] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">
                  <tr>
                    <th className="px-3.5 py-2.5">Date & time</th>
                    <th className="px-3.5 py-2.5">Event</th>
                    <th className="px-3.5 py-2.5">Source / description</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Actor</th>
                    <th className="px-3.5 py-2.5">Related</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]">
                  {(result?.rows ?? []).map((event) => (
                    <tr
                      key={event.eventId}
                      className="cursor-pointer hover:bg-[#FAF8F4]/70 transition-colors"
                      onClick={() => setSelected(event)}
                    >
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {dateTime(event.occurredAt)}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">{event.title}</td>
                      <td className="px-3.5 py-2.5">
                        <p className="text-[#251605]">{event.description}</p>
                        {event.folio ? (
                          <p className="text-xs text-muted-foreground">
                            {event.folio.number}
                            {event.folio.guestName ? ` · ${event.folio.guestName}` : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-[#251605]">
                        <Amount
                          money={money}
                          amount={event.amount}
                          informational={
                            event.eventType === "payment_allocated" ||
                            event.eventType === "allocation_reversed"
                          }
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-xs whitespace-nowrap">
                        <span className="font-medium text-[#251605]">{event.actor.name}</span>
                        {event.actor.role ? (
                          <span className="block capitalize text-muted-foreground">
                            {event.actor.role}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-[#C89933] font-medium whitespace-nowrap">
                        {event.document?.number ?? event.folio?.number ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#736B5E]">
          <span>
            {result?.total ?? 0} events · page {result?.page ?? page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              label="Page size"
              onChange={(value) => {
                setPageSize(Number(value) as 10 | 25 | 50);
                setPage(1);
              }}
              options={[
                ["10", "10"],
                ["25", "25"],
                ["50", "50"],
              ]}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-3.5 mr-1" /> Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
      <Sheet open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <HistoryDetail
              event={selected}
              money={money}
              dateTime={dateTime}
              onViewDocuments={() => {
                setSelected(null);
                onViewDocuments();
              }}
              onViewPayments={() => {
                setSelected(null);
                onViewPayments();
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function HistoryDetail({
  event,
  money,
  dateTime,
  onViewDocuments,
  onViewPayments,
}: {
  event: AccountHistoryEvent;
  money: (value: number) => string;
  dateTime: DateTime;
  onViewDocuments: () => void;
  onViewPayments: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{event.title}</SheetTitle>
        <SheetDescription>{dateTime(event.occurredAt)}</SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-3 text-sm">
        <p>{event.description}</p>
        <p>
          Actor: {event.actor.name}
          {event.actor.role ? ` · ${event.actor.role}` : ""}
        </p>
        {event.amount != null ? (
          <p>
            Amount:{" "}
            <Amount
              money={money}
              amount={event.amount}
              informational={
                event.eventType === "payment_allocated" || event.eventType === "allocation_reversed"
              }
            />
          </p>
        ) : null}
        {event.eventType === "payment_allocated" || event.eventType === "allocation_reversed" ? (
          <p className="text-muted-foreground">
            This does not change the account balance or statement.
          </p>
        ) : null}
        {event.currencyMismatch ? (
          <p className="text-amber-800">
            A component currency does not match this account. No conversion was applied.
          </p>
        ) : null}
        {event.breakdown.length > 1 ? (
          <ul className="space-y-1">
            {event.breakdown.map((part, index) => (
              <li key={`${part.label}-${index}`} className="flex justify-between gap-3">
                <span>{part.label}</span>
                <span className="tabular-nums">{money(part.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {event.folio ? (
          <p>
            Folio:{" "}
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: event.folio.id }}
              className="font-medium text-[#8A6A2F] hover:underline"
            >
              {event.folio.number}
              {event.folio.guestName ? ` · ${event.folio.guestName}` : ""}
            </Link>
          </p>
        ) : null}
        {event.payment ? (
          <p>
            Method: {event.payment.method ?? "—"}
            {event.payment.cashierShiftId ? " · Included in a cashier shift" : ""}
          </p>
        ) : null}
        {event.payment?.originalEventId ? <p>Linked to the original payment.</p> : null}
        {event.document ? (
          <Button type="button" variant="outline" onClick={onViewDocuments}>
            View document
          </Button>
        ) : null}
        {event.eventType === "payment" || event.eventType === "refund" ? (
          <Button type="button" variant="outline" onClick={onViewPayments}>
            View payments
          </Button>
        ) : null}
      </div>
    </>
  );
}

function Amount({
  money,
  amount,
  informational = false,
}: {
  money: (value: number) => string;
  amount: number | null;
  informational?: boolean;
}) {
  if (amount == null) return <span>—</span>;
  if (informational) {
    return (
      <span title="Settlement classification. This does not change the account balance.">
        {money(Math.abs(amount))}
      </span>
    );
  }
  const label =
    amount > 0.009
      ? `+ ${money(amount)}`
      : amount < -0.009
        ? formatBalance(money, amount)
        : money(0);
  return (
    <span title="Account ledger amount. A charge or refund increases what is owed. A payment or write-off decreases it.">
      {label}
    </span>
  );
}

function Select({
  value,
  label,
  options,
  onChange,
}: {
  value: string | undefined;
  label: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-[#E8E1D7] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-xs hover:border-[#C89933] focus:border-[#C89933] focus:outline-hidden focus:ring-1 focus:ring-[#C89933]"
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue || "all"} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}
