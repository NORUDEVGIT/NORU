import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
import { getGroupFinancials } from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_FINANCIAL_COPY, GROUP_INVOICE_SERVICE_UNAVAILABLE } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupFinancials({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const load = useServerFn(getGroupFinancials);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const query = useQuery({
    queryKey: ["group-financials", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });
  const data = query.data;
  const rows = useMemo(() => {
    const items = data?.transactions ?? [];
    const term = q.trim().toLowerCase();
    return items.filter((row) => {
      if (type !== "all" && row.category !== type) return false;
      if (!term) return true;
      return [row.description, row.guestName, row.confirmationNumber, row.folioId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [data, q, type]);

  const extras = useMemo(() => {
    const source = data?.transactions ?? [];
    return {
      room: source.filter((row) => row.category === "room").reduce((sum, row) => sum + row.amount, 0),
      payment: source.filter((row) => row.category === "payment").reduce((sum, row) => sum + Math.abs(row.amount), 0),
      other: source.filter((row) => row.category === "other").reduce((sum, row) => sum + row.amount, 0),
    };
  }, [data]);

  function exportCsv() {
    const header = ["Date", "Guest", "Reservation", "Folio", "Description", "Type", "Category", "Amount", "Status"];
    const body = rows.map((row) =>
      [
        row.date.slice(0, 10),
        row.guestName ?? "",
        row.confirmationNumber ?? "",
        row.folioId ?? "",
        row.description,
        row.transactionType,
        row.category,
        row.amount,
        row.folioStatus,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `group-statement-${groupId.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4" data-testid="group-financials">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Financial summary</h2>
          <p className="text-sm text-muted-foreground">{GROUP_FINANCIAL_COPY}</p>
        </div>
        {data?.folioAccess ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              Statement CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        ) : null}
      </div>
      {!data?.folioAccess ? (
        <p className="text-sm text-muted-foreground">Folio amounts are hidden for this role.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Estimated revenue", value: data.summary.estimatedRevenue },
              { label: "Total charges", value: data.summary.totalCharges },
              { label: "Total payments", value: data.summary.totalPayments },
              { label: "Outstanding", value: data.summary.outstandingBalance },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="font-display text-2xl">{item.value.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Room charges" value={extras.room.toFixed(2)} />
            <Kpi label="Other charges" value={extras.other.toFixed(2)} />
            <Kpi label="Payments" value={extras.payment.toFixed(2)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search guest, reservation, folio" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="room">Room</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No folio transactions for this group yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.folioId}-${row.date}-${index}`}>
                      <TableCell>{row.date.slice(0, 10)}</TableCell>
                      <TableCell>
                        <p>{row.guestName ?? "Guest"}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.confirmationNumber ?? "—"}
                          {row.folioId ? ` · Folio ${row.folioId.slice(0, 8)}` : ""}
                        </p>
                      </TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.category}</Badge>
                      </TableCell>
                      <TableCell>{row.amount.toFixed(2)}</TableCell>
                      <TableCell>{row.folioStatus}</TableCell>
                      <TableCell>
                        {row.folioId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to="/restaurant/cashiering/folios/$folioId" params={{ folioId: row.folioId }}>
                              Open folio
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
        </>
      )}
      <div className="rounded-2xl border border-dashed border-border p-4 space-y-2">
        <h3 className="font-medium">Group invoices</h3>
        <p className="text-sm text-muted-foreground">{data?.invoices.reason ?? GROUP_INVOICE_SERVICE_UNAVAILABLE}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled title={GROUP_INVOICE_SERVICE_UNAVAILABLE}>
            Generate invoice
          </Button>
          <Button type="button" variant="outline" disabled title={GROUP_INVOICE_SERVICE_UNAVAILABLE}>
            Draft / finalize / send
          </Button>
        </div>
      </div>
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
