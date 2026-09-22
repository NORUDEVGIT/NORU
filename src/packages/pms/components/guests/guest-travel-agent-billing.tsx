import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
import { listTravelAgentBilling } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { TA_BILLING_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

export function GuestTravelAgentBilling({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
  const load = useServerFn(listTravelAgentBilling);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["travel-agent-billing", restaurantId, agencyId, q, status],
    queryFn: () => load({ data: { restaurantId, agencyId, q, status } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading payment & invoices…</p>;
  if (query.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6">
        <p className="font-display text-lg">Payment & Invoices unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{(query.error as Error).message}</p>
      </div>
    );
  }
  const data = query.data;
  if (!data) return null;
  const money = Boolean(data.summary.moneyAvailable);

  return (
    <div className="space-y-4" data-testid="travel-agent-billing">
      <div>
        <h2 className="font-display text-xl">Payment & Invoices</h2>
        <p className="text-sm text-muted-foreground">{TA_BILLING_COPY}</p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
        <div><dt className="text-muted-foreground">Payment terms</dt><dd>{data.summary.paymentTerms || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Billing instructions</dt><dd>{data.summary.billingInstruction || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Credit limit note</dt><dd>{data.summary.creditLimitNote || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Numeric credit limit</dt><dd>{data.summary.creditLimitAmount == null ? "—" : data.summary.creditLimitAmount.toFixed(2)}</dd></div>
      </dl>
      {money && data.kpis ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Outstanding folios" value={data.kpis.outstanding} />
          <Kpi label="Charges" value={data.kpis.totalRevenue} />
          <Kpi label="Credits" value={data.kpis.paid} />
          <Kpi label="Commission outstanding" value={data.summary.commission?.outstanding ?? 0} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Folio amounts are hidden for roles without folio access. Owners and managers can read reservation folios here.
        </p>
      )}
      <div className="flex gap-2">
        <Input className="max-w-xs" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search folio history" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {money ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.date.slice(0, 10)}</TableCell>
                <TableCell>{row.reference}</TableCell>
                <TableCell>{row.guestName}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>{row.debit.toFixed(2)}</TableCell>
                <TableCell>{row.credit.toFixed(2)}</TableCell>
                <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value.toFixed(2)}</p>
    </div>
  );
}
