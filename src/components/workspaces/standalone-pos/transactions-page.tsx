/**
 * Phase 8H6 — Standalone POS transaction history.
 *
 * Operational, not report-heavy: find a receipt, see its state, open it.
 * Reads this till's own sales only (`pos_sales`) — never Restaurant
 * Management orders or PMS folios.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
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
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import {
  getPosTransactionFilterOptions,
  listPosTransactions,
} from "@/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PosHeader } from "./pos-shared";
import { tenderLabel } from "./receipt-view";

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  voided: "Voided",
};

const ANY = "any";

export function StandalonePosTransactions({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const listFn = useServerFn(listPosTransactions);
  const optionsFn = useServerFn(getPosTransactionFilterOptions);

  const [reference, setReference] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState<string>(ANY);
  const [registerId, setRegisterId] = useState<string>(ANY);
  const [cashierId, setCashierId] = useState<string>(ANY);
  const [method, setMethod] = useState<string>(ANY);

  const options = useQuery({
    queryKey: ["pos-transaction-options", restaurantId],
    queryFn: () => optionsFn({ data: { restaurantId } }),
  });

  const filters = {
    restaurantId,
    reference: search || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
    status: status === ANY ? null : (status as never),
    registerId: registerId === ANY ? null : registerId,
    cashierMembershipId: cashierId === ANY ? null : cashierId,
    method: method === ANY ? null : (method as never),
    limit: 100,
  };

  const list = useQuery({
    queryKey: ["pos-transactions", filters],
    queryFn: () => listFn({ data: filters }),
  });

  const rows = list.data ?? [];

  return (
    <div className="space-y-6">
      <PosHeader
        title="Transactions"
        crumb="Transactions"
        propertyName={membership.restaurant.name}
        description="Completed sales for this till, with receipts and refund state. A completed sale is never edited or deleted — corrections are refunds."
      />

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="pos-tx-ref">Receipt number</Label>
            <div className="flex gap-2">
              <Input
                id="pos-tx-ref"
                value={reference}
                placeholder="POS-000123"
                onChange={(e) => setReference(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSearch(reference.trim());
                }}
              />
              <Button variant="outline" onClick={() => setSearch(reference.trim())} aria-label="Search receipts">
                <Search className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pos-tx-from">From business date</Label>
            <Input id="pos-tx-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pos-tx-to">To business date</Label>
            <Input id="pos-tx-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Register</Label>
            <Select value={registerId} onValueChange={setRegisterId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any register</SelectItem>
                {(options.data?.registers ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cashier</Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                {(options.data?.cashiers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any payment</SelectItem>
                {["cash", "card", "voucher", "other"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {tenderLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setReference("");
                setSearch("");
                setFromDate("");
                setToDate("");
                setStatus(ANY);
                setRegisterId(ANY);
                setCashierId(ANY);
                setMethod(ANY);
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card">
        {list.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading sales…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No sales match this search yet.</p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Business date</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Register</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Refunded</th>
                <th className="px-4 py-3 text-right">Refundable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      to="/restaurant/pos/transactions/$saleId"
                      params={{ saleId: t.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.reference ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{t.businessDate}</td>
                  <td className="px-4 py-3">{t.completedAt ? dateTime(t.completedAt) : "—"}</td>
                  <td className="px-4 py-3">{t.registerName}</td>
                  <td className="px-4 py-3">{t.cashier}</td>
                  <td className="px-4 py-3">
                    {t.tenders.length
                      ? t.tenders.map((x) => `${tenderLabel(x.method)} ${money(x.amount)}`).join(" · ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABEL[t.status] ?? t.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(t.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.refundedAmount ? money(t.refundedAmount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(t.refundable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
