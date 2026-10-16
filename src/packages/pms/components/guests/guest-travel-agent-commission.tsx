import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import {
  listTravelAgentCommissionEntries,
  listTravelAgentCommissionPlans,
  updateTravelAgentCommissionStatus,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  TA_COMMISSION_EMPTY_COPY,
  type TravelAgentCommissionEntryStatus,
  type TravelAgentDetailNavId,
} from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

export function GuestTravelAgentCommission({
  restaurantId,
  agencyId,
  onOpenSettings,
}: {
  restaurantId: string;
  agencyId: string;
  onOpenSettings: (nav: TravelAgentDetailNavId) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentCommissionEntries);
  const loadPlans = useServerFn(listTravelAgentCommissionPlans);
  const updateStatus = useServerFn(updateTravelAgentCommissionStatus);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useQuery({
    queryKey: ["travel-agent-commission", restaurantId, agencyId, status, from, to],
    queryFn: () => load({ data: { restaurantId, agencyId, status, from: from || undefined, to: to || undefined } }),
  });
  const plans = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
    queryFn: () => loadPlans({ data: { restaurantId, agencyId } }),
  });
  const mutation = useMutation({
    mutationFn: (input: { entryId: string; status: TravelAgentCommissionEntryStatus }) =>
      updateStatus({ data: { restaurantId, agencyId, ...input } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-commission", restaurantId, agencyId] });
      toast.success("Commission status updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!plans.data?.items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="travel-agent-commission-empty">
        <p className="font-display text-lg">Commission</p>
        <p className="mt-2 text-sm text-muted-foreground">{TA_COMMISSION_EMPTY_COPY}</p>
        <Button type="button" className="mt-4" onClick={() => onOpenSettings("settings")}>
          Open Commission & Rates
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="travel-agent-commission">
      <div>
        <h2 className="font-display text-xl">Commission</h2>
        <p className="text-sm text-muted-foreground">
          Calculated from reservation room subtotals. Settlement requires cashiering access.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Earned" value={query.data?.totals.earned ?? 0} />
        <Kpi label="Approved" value={query.data?.totals.approved ?? 0} />
        <Kpi label="Settled" value={query.data?.totals.settled ?? 0} />
        <Kpi label="Outstanding" value={query.data?.totals.outstanding ?? 0} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="calculated">Calculated</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="settled">Settled</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reservation</TableHead>
            <TableHead>Guest</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data?.items ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.confirmationNumber}</TableCell>
              <TableCell>{row.guestName}</TableCell>
              <TableCell>{row.basisAmount == null ? "—" : row.basisAmount.toFixed(2)}</TableCell>
              <TableCell>{row.amount == null ? "—" : `${row.currency} ${row.amount.toFixed(2)}`}</TableCell>
              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              <TableCell className="space-x-2">
                {row.status === "calculated" || row.status === "pending" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate({ entryId: row.id, status: "approved" })}>
                    Approve
                  </Button>
                ) : null}
                {row.status !== "void" && row.status !== "settled" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate({ entryId: row.id, status: "void" })}>
                    Void
                  </Button>
                ) : null}
                {query.data?.canSettle && row.status === "approved" ? (
                  <Button type="button" size="sm" onClick={() => mutation.mutate({ entryId: row.id, status: "settled" })}>
                    Mark settled
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
