import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Banknote, Clock3 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { StatCard } from "@/packages/pms/components/bookings/reservation-bits";
import {
  closeCashierShift,
  getCashieringDashboard,
  listCashierShifts,
  listFolios,
  listLedgerEntries,
  openCashierShift,
  type FolioRow,
  type LedgerEntryRow,
} from "@/packages/pms/lib/cashiering.functions";
import {
  useMoney,
  useRestaurantTime,
} from "@/core/state/property-format";
import { FolioStatusBadge } from "./folio-bits";

/* -------------------------------------------------------------- dashboard */

export function CashieringDashboardTab({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const money = useMoney();
  const fetchDashboard = useServerFn(getCashieringDashboard);
  const query = useQuery({
    queryKey: ["cashiering-dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading cashiering…</p>;
  if (query.isError)
    return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  const d = query.data;
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Open folios" value={d.openFolios} />
        <StatCard
          label="Outstanding balance"
          value={money(d.outstandingBalance)}
          hint="Across open folios"
        />
        <StatCard
          label="Payments today"
          value={money(d.todayPayments)}
          hint="Payments and deposits"
        />
        <StatCard label="Charges today" value={money(d.todayCharges)} />
        <StatCard label="Open cashier shifts" value={d.openShifts} />
        <StatCard label="My shift" value={d.myOpenShiftId ? "Open" : "Closed"} />
      </div>
      <p className="text-xs text-muted-foreground">
        Folios open automatically at check-in for priced reservations, with the room charge posted
        once.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ folios */

export function FoliosTab({
  restaurantId,
  status,
  initialSearch,
}: {
  restaurantId: string;
  status: "all" | "open" | "closed";
  initialSearch?: string;
}) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState(status);

  const fetchFolios = useServerFn(listFolios);
  const query = useQuery({
    queryKey: ["folios", restaurantId, statusFilter, search],
    queryFn: () => fetchFolios({ data: { restaurantId, status: statusFilter, search } }),
    retry: false,
  });

  const folios = (query.data ?? []) as FolioRow[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-52 flex-1">
          <Label htmlFor="folio-search">Search</Label>
          <Input
            id="folio-search"
            placeholder="Folio number, guest or confirmation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="folio-status">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger id="folio-status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading folios…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : folios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No folios yet. Check a guest in to open one.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Folio</th>
                <th className="p-3">Guest</th>
                <th className="p-3">Reservation</th>
                <th className="p-3">Opened</th>
                <th className="p-3 text-right">Charges</th>
                <th className="p-3 text-right">Credits</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {folios.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="p-3 font-medium">{f.folioNumber}</td>
                  <td className="p-3">{f.guestName}</td>
                  <td className="p-3 text-muted-foreground">{f.confirmationNumber ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{dateTime(f.openedAt)}</td>
                  <td className="p-3 text-right">{money(f.charges)}</td>
                  <td className="p-3 text-right">{money(f.credits)}</td>
                  <td className="p-3 text-right font-medium">{money(f.balance)}</td>
                  <td className="p-3">
                    <FolioStatusBadge status={f.status} />
                    {f.unsettledCheckout ? (
                      <p className="mt-1 text-xs text-destructive">Unsettled checkout</p>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/restaurant/pms/cashiering" search={{ tab: "folios", folio: f.id }}>
                        Open
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- cashier shifts */

export function CashierShiftsTab({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeTarget, setCloseTarget] = useState<string | null>(null);

  const fetchShifts = useServerFn(listCashierShifts);
  const shiftsQuery = useQuery({
    queryKey: ["cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
    retry: false,
  });

  const shifts = shiftsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenDialog(true)}>Open cashier shift</Button>
      </div>

      {shiftsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading shifts…</p>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cashier shifts recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Cashier</th>
                <th className="p-3">Opened</th>
                <th className="p-3">Closed</th>
                <th className="p-3 text-right">Opening cash</th>
                <th className="p-3 text-right">Closing cash</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3">{s.staffName}</td>
                  <td className="p-3 text-muted-foreground">{dateTime(s.openedAt)}</td>
                  <td className="p-3 text-muted-foreground">
                    {s.closedAt ? dateTime(s.closedAt) : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {s.openingCash === null ? "—" : money(s.openingCash)}
                  </td>
                  <td className="p-3 text-right">
                    {s.closingCash === null ? "—" : money(s.closingCash)}
                  </td>
                  <td className="p-3 capitalize">{s.status}</td>
                  <td className="p-3 text-right">
                    {s.status === "open" ? (
                      <Button size="sm" variant="outline" onClick={() => setCloseTarget(s.id)}>
                        Close
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ShiftDialog
        restaurantId={restaurantId}
        mode="open"
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
          void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
        }}
      />
      <ShiftDialog
        restaurantId={restaurantId}
        mode="close"
        shiftId={closeTarget}
        open={closeTarget !== null}
        onClose={() => setCloseTarget(null)}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
          void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
        }}
      />
    </div>
  );
}

export function ShiftDialog({
  restaurantId,
  mode,
  shiftId,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  mode: "open" | "close";
  shiftId?: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cash, setCash] = useState("0");
  const [notes, setNotes] = useState("");

  const openFn = useServerFn(openCashierShift);
  const closeFn = useServerFn(closeCashierShift);

  const mutation = useMutation({
    mutationFn: async () => {
      const amount = Number(cash);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid cash amount.");
      if (mode === "open") return openFn({ data: { restaurantId, openingCash: amount, notes } });
      if (!shiftId) throw new Error("No shift selected.");
      return closeFn({ data: { restaurantId, shiftId, closingCash: amount, notes } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(mode === "open" ? "Cashier shift opened" : "Cashier shift closed");
      setCash("0");
      setNotes("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-card p-0 shadow-2xl sm:max-w-[480px]">
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            {mode === "open" ? <Clock3 className="size-5" /> : <Banknote className="size-5" />}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
              {mode === "open" ? "Open Cashier Shift" : "Close Cashier Shift"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              {mode === "open"
                ? "Record the hotel drawer cash float you are starting with. Restaurant sales are tracked separately."
                : "Count and record the hotel drawer cash balance at shift close. Restaurant sales are tracked separately."}
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="shift-cash" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {mode === "open" ? "Opening Cash Float" : "Closing Cash Counted"}
            </Label>
            <Input
              id="shift-cash"
              type="number"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0.00"
              className="h-10 border-[#E8E1D7] bg-background text-base font-semibold tabular-nums focus-visible:ring-[#C89933]"
            />
            <p className="text-[11px] text-muted-foreground">
              {mode === "open"
                ? "Enter physical cash in drawer at start of shift."
                : "Total physical cash counted in drawer at end of shift."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Shift Notes (optional)
            </Label>
            <Textarea
              id="shift-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === "open"
                  ? "e.g. Verified $200 float with morning supervisor"
                  : "e.g. Cash counted and handed over to night auditor"
              }
              className="min-h-[80px] border-[#E8E1D7] bg-background focus-visible:ring-[#C89933]"
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 px-6 py-3.5">
          <Button variant="outline" onClick={onClose} className="border-[#E8E1D7] hover:bg-[#F7F4EE]">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-[#C89933] text-[#251605] font-semibold hover:bg-[#b88928] shadow-sm disabled:opacity-50"
          >
            {mutation.isPending ? "Saving..." : mode === "open" ? "Open Shift" : "Close Shift"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ ledger */

/**
 * Phase 7D.2F1 — read-only ledger view. Deposits and refunds are the same
 * folio transactions the folio detail already shows, filtered by type.
 */
export function LedgerTab({
  restaurantId,
  types,
  emptyText,
}: {
  restaurantId: string;
  types: LedgerEntryRow["type"][];
  emptyText: string;
}) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const fetchEntries = useServerFn(listLedgerEntries);

  const query = useQuery({
    queryKey: ["cashiering-ledger", restaurantId, types.join(","), search],
    queryFn: () =>
      fetchEntries({
        data: { restaurantId, types, ...(search.trim() ? { search: search.trim() } : {}) },
      }),
    retry: false,
  });

  const rows = query.data ?? [];

  return (
    <div className="space-y-4">
      <Input
        className="max-w-sm"
        placeholder="Search folio, guest or confirmation"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading entries…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/restaurant/pms/cashiering"
                      search={{ tab: "folios", folio: row.folioId }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.folioNumber}
                    </Link>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                      {row.type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    {row.guestName}
                    {row.confirmationNumber ? ` · ${row.confirmationNumber}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg">{money(row.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.paymentMethod ? `${row.paymentMethod.replace(/_/g, " ")} · ` : ""}
                    {new Date(row.postedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
