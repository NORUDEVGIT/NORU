import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { listCompanyBilling } from "@/packages/pms/lib/guest-company-detail.functions";
import { COMPANY_BILLING_COPY } from "@/packages/pms/lib/guest-company-detail-workspace";

export function GuestCompanyBilling({
  restaurantId,
  companyId,
}: {
  restaurantId: string;
  companyId: string;
}) {
  const load = useServerFn(listCompanyBilling);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["company-billing", restaurantId, companyId, q, status],
    queryFn: () => load({ data: { restaurantId, companyId, q, status } }),
    retry: false,
  });

  function exportCsv() {
    const rows = query.data?.items ?? [];
    const header = ["Date", "Reference", "Guest", "Reservation", "Description", "Debit", "Credit", "Balance", "Status"];
    const body = rows.map((row) =>
      [
        row.date,
        row.reference,
        row.guestName,
        row.confirmationNumber ?? "",
        row.description,
        row.debit,
        row.credit,
        row.balance,
        row.status,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `company-billing-${companyId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading billing…</p>;
  if (query.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="company-billing-error">
        <p className="font-display text-lg">Billing unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{(query.error as Error).message}</p>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;
  const money = Boolean(data.summary.moneyAvailable);

  return (
    <div className="space-y-4" data-testid="company-billing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Billing</h2>
          <p className="text-sm text-muted-foreground">{COMPANY_BILLING_COPY}</p>
        </div>
        <div className="flex gap-2">
          {money ? (
            <Button type="button" variant="outline" onClick={exportCsv} disabled={!data.items.length}>
              Statement CSV
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
        <Info label="Account status" value={data.summary.accountStatus} />
        <Info label="Payment terms" value={data.summary.paymentTerms ?? "—"} />
        <Info label="Credit account" value={data.summary.creditAccountEnabled ? "Enabled" : "Off"} />
        <Info label="Billing contact" value={data.summary.billingContact ?? "—"} />
        <Info label="Credit limit note" value={data.summary.creditLimitNote ?? "—"} />
        <Info label="Numeric credit ledger" value="—" hint="Not stored. This is not an AR balance." />
      </section>

      {money && data.kpis ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Outstanding (folio charges − credits)" value={data.kpis.outstanding.toFixed(2)} />
          <Kpi label="Total charges" value={data.kpis.totalRevenue.toFixed(2)} />
          <Kpi label="Credits / payments" value={data.kpis.paid.toFixed(2)} />
          <Kpi label="Open folio lines" value={String(data.kpis.pending)} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Folio amounts stay hidden for roles without folio access. Owners and managers can read reservation folios here.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search reference, guest, reservation" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All folio statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        {!money ? (
          <p className="text-sm text-muted-foreground">Transaction rows require cashiering access.</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No folio transactions for this company’s reservations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Reservation</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Debit</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date.slice(0, 10)}</TableCell>
                  <TableCell>{row.reference}</TableCell>
                  <TableCell>{row.guestName}</TableCell>
                  <TableCell>
                    {row.reservationId ? (
                      <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: row.reservationId }} className="underline">
                        {row.confirmationNumber ?? row.reservationId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.debit ? row.debit.toFixed(2) : "—"}</TableCell>
                  <TableCell>{row.credit ? row.credit.toFixed(2) : "—"}</TableCell>
                  <TableCell>{row.balance.toFixed(2)}</TableCell>
                  <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  <TableCell>
                    {data.summary.canOperate ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/restaurant/cashiering/folios/$folioId" params={{ folioId: row.folioId }}>
                          Record payment
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
