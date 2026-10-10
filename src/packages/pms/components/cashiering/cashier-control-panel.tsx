import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { methodLabel } from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import {
  closeCashierShift,
  listCashierShifts,
  openCashierShift,
  postHotelDrawerMovement,
  type CashierShiftRow,
} from "@/packages/pms/lib/cashiering.functions";
import {
  getCashierShiftActivity,
  getCashieringBusinessDateActivity,
} from "@/packages/pms/lib/cashiering-control.functions";
import {
  formatShiftDuration,
  otherOpenShifts,
  previousClosedShift,
  selectOwnOpenShift,
  variancePresentation,
  visibleShiftHistory,
} from "@/packages/pms/lib/cashiering-control";
import type { CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";

export function CashierControl({
  restaurantId,
  membershipId,
  role,
  canOperate,
  canManage,
  money,
  dateTime,
  onNavigate,
}: {
  restaurantId: string;
  membershipId: string;
  role: string;
  canOperate: boolean;
  canManage: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onNavigate: (tab: CashieringTabId) => void;
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"desk" | "open" | "close">("desk");
  const [closeId, setCloseId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState("");
  const [closedSummary, setClosedSummary] = useState<CashierShiftRow | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchShifts = useServerFn(listCashierShifts);
  const fetchActivity = useServerFn(getCashieringBusinessDateActivity);
  const shiftsQuery = useQuery({
    queryKey: ["cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
    retry: false,
  });
  const activityQuery = useQuery({
    queryKey: ["cashiering-business-date", restaurantId, viewDate],
    queryFn: () =>
      fetchActivity({
        data: { restaurantId, ...(viewDate ? { viewDate } : {}) },
      }),
    retry: false,
  });

  const shifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  useEffect(() => {
    if (!closedSummary) return;
    const fresh = shifts.find(
      (shift) => shift.id === closedSummary.id && shift.status === "closed",
    );
    if (fresh?.closedAt && fresh.closedAt !== closedSummary.closedAt) setClosedSummary(fresh);
  }, [shifts, closedSummary]);
  const mine = selectOwnOpenShift(shifts, membershipId);
  const activity = activityQuery.data;
  const businessDate = activity?.canonicalBusinessDate ?? "—";
  const history = visibleShiftHistory(shifts, membershipId, role);
  const others = canManage ? otherOpenShifts(shifts, membershipId) : [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-business-date", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
  }

  return (
    <div className="space-y-4" data-testid="cashier-control">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A6A24]">
            Cashiering Control
          </p>
          <h2 className="font-display text-2xl text-[#251605]">Cashier shift</h2>
          <p className="mt-1 text-sm text-[#5F554B]" data-testid="business-date">
            Business Date <span className="font-semibold text-[#251605]">{businessDate}</span>
          </p>
        </div>
        <label className="text-xs text-[#7A7167]">
          View business date
          <Input
            type="date"
            value={viewDate || activity?.canonicalBusinessDate || ""}
            onChange={(event) => {
              const next = event.target.value;
              setViewDate(next && next !== activity?.canonicalBusinessDate ? next : "");
            }}
            className="mt-1 min-h-11"
            aria-label="View business date"
          />
          <span className="mt-1 block max-w-xs">
            Read only. Night Audit changes the hotel business date.
          </span>
        </label>
      </header>

      {mode === "open" && canOperate ? (
        <OpenShiftForm
          restaurantId={restaurantId}
          businessDate={activity?.canonicalBusinessDate ?? businessDate}
          previous={previousClosedShift(shifts, membershipId)}
          money={money}
          dateTime={dateTime}
          onCancel={() => setMode("desk")}
          onOpened={() => {
            setClosedSummary(null);
            setMode("desk");
            refresh();
          }}
        />
      ) : null}

      {mode === "close" && closeId ? (
        <CloseShiftForm
          restaurantId={restaurantId}
          shift={shifts.find((shift) => shift.id === closeId) ?? null}
          businessDate={activity?.canonicalBusinessDate ?? businessDate}
          money={money}
          dateTime={dateTime}
          now={now}
          onCancel={() => setMode("desk")}
          onClosed={(shift) => {
            setClosedSummary(shift);
            setMode("desk");
            refresh();
          }}
        />
      ) : null}

      {mode === "desk" ? (
        <>
          {closedSummary ? (
            <ClosedSummary
              shift={closedSummary}
              businessDate={activity?.canonicalBusinessDate ?? businessDate}
              money={money}
              dateTime={dateTime}
              canOperate={canOperate}
              onOpen={() => {
                setClosedSummary(null);
                setMode("open");
              }}
              onDismiss={() => setClosedSummary(null)}
            />
          ) : null}
          <MyShiftCard
            shift={mine}
            businessDate={activity?.canonicalBusinessDate ?? businessDate}
            money={money}
            dateTime={dateTime}
            now={now}
            canOperate={canOperate}
            restaurantId={restaurantId}
            onOpen={() => setMode("open")}
            onClose={() => {
              if (!mine) return;
              setCloseId(mine.id);
              setMode("close");
            }}
            onMoved={refresh}
          />
          <BusinessDateActivity
            activity={activity}
            loading={activityQuery.isLoading}
            error={activityQuery.isError ? (activityQuery.error as Error).message : null}
            money={money}
            onNavigate={onNavigate}
          />
          <DeparturesCard
            rows={activity?.departuresDue ?? []}
            date={activity?.viewedBusinessDate ?? businessDate}
            money={money}
          />
          <RecentCard rows={activity?.recent ?? []} money={money} dateTime={dateTime} />
          {canManage ? (
            <OtherShifts
              rows={others}
              money={money}
              dateTime={dateTime}
              now={now}
              onClose={(id) => {
                setCloseId(id);
                setMode("close");
              }}
            />
          ) : null}
          <HistoryTable
            rows={history}
            money={money}
            dateTime={dateTime}
            ownOnly={role === "cashier"}
          />
        </>
      ) : null}
    </div>
  );
}

function MyShiftCard({
  shift,
  businessDate,
  money,
  dateTime,
  now,
  canOperate,
  restaurantId,
  onOpen,
  onClose,
  onMoved,
}: {
  shift: CashierShiftRow | null;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  canOperate: boolean;
  restaurantId: string;
  onOpen: () => void;
  onClose: () => void;
  onMoved: () => void;
}) {
  return (
    <section className={CARD} data-testid="my-shift">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">My cashier shift</h3>
          <p className="text-xs text-[#7A7167]">
            Physical cash for this cashier. Not another drawer.
          </p>
        </div>
        <span className="rounded-full bg-[#E7F6EE] px-2.5 py-1 text-xs font-semibold text-[#146C43]">
          {shift ? "Shift Open" : "No Open Cashier Shift"}
        </span>
      </div>
      {shift ? (
        <div className="space-y-4 p-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Cashier" value={shift.staffName} />
            <Fact label="Opened" value={dateTime(shift.openedAt)} />
            <Fact label="Duration" value={formatShiftDuration(shift.openedAt, null, now)} />
            <Fact label="Current Business Date" value={businessDate} />
            <Fact label="Opening Cash" value={money(shift.openingCash ?? 0)} />
            <Fact label="Cash In" value={money(shift.cashIn)} />
            <Fact label="Cash Out" value={money(shift.cashOut)} />
            <Fact label="Cash Activity" value={money(shift.hotelCash)} />
            <Fact label="Expected Cash" value={money(shift.expected)} />
          </dl>
          <p className="text-xs text-[#7A7167]">
            Hotel drawer expected is opening cash, plus cash in, minus cash out, plus guest cash
            payments, deposits, and refunds on this drawer. Restaurant sales are not included.
          </p>
          {canOperate ? (
            <div className="flex flex-wrap gap-2">
              <MovementButton
                restaurantId={restaurantId}
                shiftId={shift.id}
                kind="cash_in"
                onMoved={onMoved}
              />
              <MovementButton
                restaurantId={restaurantId}
                shiftId={shift.id}
                kind="cash_out"
                onMoved={onMoved}
              />
              <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
                Close Shift
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-[#5F554B]">
            Current Business Date: <span className="font-semibold">{businessDate}</span>
          </p>
          <p className="mt-1 text-sm text-[#7A7167]">
            You can still view property business date activity. Opening cash and expected cash
            appear after you open your own shift.
          </p>
          {canOperate ? (
            <Button
              type="button"
              className="mt-3 min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
              onClick={onOpen}
            >
              Open Shift
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function MovementButton({
  restaurantId,
  shiftId,
  kind,
  onMoved,
}: {
  restaurantId: string;
  shiftId: string;
  kind: "cash_in" | "cash_out";
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const post = useServerFn(postHotelDrawerMovement);
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Enter an amount greater than zero.");
      return post({
        data: {
          restaurantId,
          shiftId,
          movementType: kind,
          amount: value,
          notes,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(kind === "cash_in" ? "Cash in recorded" : "Cash out recorded");
      setAmount("");
      setNotes("");
      setOpen(false);
      onMoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => setOpen((value) => !value)}
      >
        {kind === "cash_in" ? "Cash In" : "Cash Out"}
      </Button>
      {open ? (
        <form
          className="mt-2 space-y-2 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Label htmlFor={`${kind}-amount`}>Amount</Label>
          <Input
            id={`${kind}-amount`}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="min-h-11"
            required
          />
          <Label htmlFor={`${kind}-notes`}>Notes</Label>
          <Textarea
            id={`${kind}-notes`}
            value={notes}
            maxLength={300}
            onChange={(event) => setNotes(event.target.value)}
          />
          <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
            Record
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function BusinessDateActivity({
  activity,
  loading,
  error,
  money,
  onNavigate,
}: {
  activity:
    | {
        viewedBusinessDate: string;
        payments: { amount: number; count: number };
        deposits: { amount: number; count: number };
        refunds: { amount: number; count: number };
        transactions: number;
        departuresDue: unknown[];
        paymentMethods: Array<{
          method: string;
          paymentAmount: number;
          depositAmount: number;
          refundAmount: number;
          net: number;
          count: number;
        }>;
      }
    | undefined;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
  onNavigate: (tab: CashieringTabId) => void;
}) {
  return (
    <section className={CARD} data-testid="business-date-activity">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">Business Date Activity</h3>
        <p className="text-xs text-[#7A7167]">
          Property activity for {activity?.viewedBusinessDate ?? "the hotel business date"}. This is
          not my shift. Non-cash totals are system amounts only.
        </p>
      </div>
      <div className="space-y-4 p-4">
        {loading ? <p className="text-sm text-[#7A7167]">Loading business date activity…</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {activity ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Fact label="Payments Received" value={money(activity.payments.amount)} />
            <Fact label="Deposits Received" value={money(activity.deposits.amount)} />
            <Fact label="Refunds" value={money(activity.refunds.amount)} />
            <Fact label="Transactions" value={String(activity.transactions)} />
            <Fact label="Departures With Balance" value={String(activity.departuresDue.length)} />
          </dl>
        ) : null}
        {activity && activity.paymentMethods.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-[#E8E1D7]">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-[#7A7167]">
                <tr>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Deposits</th>
                  <th className="px-3 py-2 text-right font-medium">Refunds</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {activity.paymentMethods.map((row) => (
                  <tr key={row.method} className="border-t border-[#E8E1D7]">
                    <td className="px-3 py-2">{methodLabel(row.method)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(row.paymentAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(row.depositAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.refundAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Find Folio
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Receive Payment
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Record Deposit
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Post Charge
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Create Invoice
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("accounts")}
          >
            Company Invoice
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onNavigate("folios")}
          >
            Settlement
          </Button>
        </div>
        <p className="text-xs text-[#7A7167]">
          Payment, deposit, charge, invoice, and settlement start from the folio or company account.
          There is no property-wide posting form.
        </p>
      </div>
    </section>
  );
}

function DeparturesCard({
  rows,
  date,
  money,
}: {
  rows: Array<{
    folioId: string;
    folioNumber: string;
    room: string | null;
    guest: string;
    departure: string;
    balance: number;
  }>;
  date: string;
  money: (value: number) => string;
}) {
  return (
    <section className={CARD} data-testid="departures-due">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">Departures — Business Date {date}</h3>
        <p className="text-xs text-[#7A7167]">
          In-house guests departing on this business date with an open folio balance. Settle does
          not check the guest out.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#7A7167]">
          No departures with a balance on this business date.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-[#7A7167]">
              <tr>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Departure</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.folioId} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2">{row.room ?? "—"}</td>
                  <td className="px-3 py-2">{row.guest}</td>
                  <td className="px-3 py-2">{row.folioNumber}</td>
                  <td className="px-3 py-2">{row.departure}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.balance)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/restaurant/pms/cashiering/folios/$folioId"
                      params={{ folioId: row.folioId }}
                      search={{ tab: "settlement" }}
                      className="text-sm font-semibold text-[#8A6A24]"
                    >
                      Settle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecentCard({
  rows,
  money,
  dateTime,
}: {
  rows: Array<{
    id: string;
    occurredAt: string;
    label: string;
    guestOrAccount: string;
    description: string;
    amount: number;
    method: string | null;
    actor: string | null;
  }>;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  return (
    <section className={CARD} data-testid="recent-business-events">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">Recent transactions</h3>
        <p className="text-xs text-[#7A7167]">
          Grouped business events on the viewed business date.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#7A7167]">No business events on this business date.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-[#7A7167]">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Guest / Account</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2 text-[#5F554B]">{dateTime(row.occurredAt)}</td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2">{row.guestOrAccount}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2">{row.method ? methodLabel(row.method) : "—"}</td>
                  <td className="px-3 py-2">{row.actor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OtherShifts({
  rows,
  money,
  dateTime,
  now,
  onClose,
}: {
  rows: CashierShiftRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  onClose: (id: string) => void;
}) {
  return (
    <section className={CARD} data-testid="other-open-shifts">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">Other open shifts</h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#7A7167]">No other cashier has an open shift.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-[#7A7167]">
              <tr>
                <th className="px-3 py-2 font-medium">Cashier</th>
                <th className="px-3 py-2 font-medium">Opened</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Cash In</th>
                <th className="px-3 py-2 text-right font-medium">Cash Out</th>
                <th className="px-3 py-2 text-right font-medium">Expected</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((shift) => (
                <tr key={shift.id} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2">{shift.staffName}</td>
                  <td className="px-3 py-2">{dateTime(shift.openedAt)}</td>
                  <td className="px-3 py-2">{formatShiftDuration(shift.openedAt, null, now)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(shift.openingCash ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(shift.cashIn)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(shift.cashOut)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(shift.expected)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-9"
                      onClick={() => onClose(shift.id)}
                    >
                      Close
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistoryTable({
  rows,
  money,
  dateTime,
  ownOnly,
}: {
  rows: CashierShiftRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  ownOnly: boolean;
}) {
  return (
    <section className={CARD}>
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#251605]">
          {ownOnly ? "My shifts" : "Property shifts"}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#7A7167]">No cashier shifts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-[#7A7167]">
              <tr>
                <th className="px-3 py-2 font-medium">Cashier</th>
                <th className="px-3 py-2 font-medium">Opened</th>
                <th className="px-3 py-2 font-medium">Closed</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Expected</th>
                <th className="px-3 py-2 text-right font-medium">Counted</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((shift) => (
                <tr key={shift.id} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2">{shift.staffName}</td>
                  <td className="px-3 py-2">{dateTime(shift.openedAt)}</td>
                  <td className="px-3 py-2">{shift.closedAt ? dateTime(shift.closedAt) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.openingCash === null ? "—" : money(shift.openingCash)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(shift.expected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.closingCash === null ? "—" : money(shift.closingCash)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.variance === null ? "—" : money(shift.variance)}
                  </td>
                  <td className="px-3 py-2 capitalize">{shift.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OpenShiftForm({
  restaurantId,
  businessDate,
  previous,
  money,
  dateTime,
  onCancel,
  onOpened,
}: {
  restaurantId: string;
  businessDate: string;
  previous: CashierShiftRow | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onCancel: () => void;
  onOpened: () => void;
}) {
  const [openingCash, setOpeningCash] = useState("0");
  const [notes, setNotes] = useState("");
  const openShift = useServerFn(openCashierShift);
  const mutation = useMutation({
    mutationFn: async () => {
      const amount = Number(openingCash);
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Enter an opening cash amount of zero or more.");
      return openShift({ data: { restaurantId, openingCash: amount, notes } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Cashier shift opened");
      onOpened();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className={`${CARD} grid gap-4 p-4 lg:grid-cols-2`}
      data-testid="open-shift-form"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#251605]">Open cashier shift</h3>
        <p className="text-sm text-[#5F554B]">
          Business Date <span className="font-semibold">{businessDate}</span>
        </p>
        <p className="text-xs text-[#7A7167]">
          The hotel business date is read only. Opening time is set by the server.
        </p>
        <div>
          <Label htmlFor="opening-cash">Opening Cash</Label>
          <Input
            id="opening-cash"
            type="number"
            min="0"
            step="0.01"
            value={openingCash}
            onChange={(event) => setOpeningCash(event.target.value)}
            className="mt-1 min-h-11"
            required
          />
        </div>
        <div>
          <Label htmlFor="opening-note">Opening Note</Label>
          <Textarea
            id="opening-note"
            value={notes}
            maxLength={300}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3">
        <h4 className="text-sm font-semibold text-[#251605]">Previous shift</h4>
        {previous ? (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <Fact label="Cashier" value={previous.staffName} />
            <Fact label="Opened" value={dateTime(previous.openedAt)} />
            <Fact label="Closed" value={dateTime(previous.closedAt)} />
            <Fact label="Opening Cash" value={money(previous.openingCash ?? 0)} />
            <Fact label="Expected Cash" value={money(previous.expected)} />
            <Fact
              label="Counted Cash"
              value={previous.closingCash === null ? "—" : money(previous.closingCash)}
            />
            <Fact
              label="Variance"
              value={previous.variance === null ? "—" : money(previous.variance)}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[#7A7167]">No previous closed shift for this cashier.</p>
        )}
      </div>
      <div className="flex gap-2 lg:col-span-2">
        <Button
          type="submit"
          className="min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
          disabled={mutation.isPending}
        >
          Open Cashier Shift
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CloseShiftForm({
  restaurantId,
  shift,
  businessDate,
  money,
  dateTime,
  now,
  onCancel,
  onClosed,
}: {
  restaurantId: string;
  shift: CashierShiftRow | null;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  now: number;
  onCancel: () => void;
  onClosed: (shift: CashierShiftRow) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const fetchActivity = useServerFn(getCashierShiftActivity);
  const closeShift = useServerFn(closeCashierShift);
  const activityQuery = useQuery({
    queryKey: ["cashier-shift-activity", restaurantId, shift?.id],
    queryFn: () => fetchActivity({ data: { restaurantId, shiftId: shift!.id } }),
    enabled: Boolean(shift?.id),
    retry: false,
  });
  const countedValue = counted.trim() === "" ? null : Number(counted);
  const variance =
    shift && countedValue !== null && Number.isFinite(countedValue)
      ? variancePresentation(countedValue, shift.expected)
      : variancePresentation(null, shift?.expected ?? 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!shift) throw new Error("That shift is no longer open.");
      if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0) {
        throw new Error("Enter the counted cash.");
      }
      return closeShift({
        data: { restaurantId, shiftId: shift.id, closingCash: countedValue, notes },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!shift || countedValue === null) return;
      const closed = variancePresentation(countedValue, shift.expected);
      toast.success("Cashier shift closed");
      onClosed({
        ...shift,
        status: "closed",
        closedAt: new Date().toISOString(),
        closingCash: countedValue,
        variance: closed.difference,
        notes: notes.trim() || shift.notes,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!shift) return <p className="text-sm text-[#7A7167]">That shift is no longer open.</p>;
  const lines = activityQuery.data?.lines ?? [];
  const splits = activityQuery.data;

  return (
    <form
      className="space-y-4"
      data-testid="close-shift"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <section className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold text-[#251605]">Close shift</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Cashier" value={shift.staffName} />
          <Fact label="Opened" value={dateTime(shift.openedAt)} />
          <Fact label="Duration" value={formatShiftDuration(shift.openedAt, null, now)} />
          <Fact label="Current Business Date" value={businessDate} />
        </dl>
        <p className="mt-2 text-xs text-[#7A7167]">
          The business date is the current hotel day. This shift is not split if night audit rolls
          while it is open.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold text-[#251605]">Cash position</h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Opening Cash" value={money(shift.openingCash ?? 0)} />
            <Fact label="Cash In" value={money(shift.cashIn)} />
            <Fact label="Cash Out" value={money(shift.cashOut)} />
            <Fact label="Cash Payments" value={money(splits?.cashPayments ?? 0)} />
            <Fact label="Cash Deposits" value={money(splits?.cashDeposits ?? 0)} />
            <Fact label="Cash Refunds" value={money(splits?.cashRefunds ?? 0)} />
            <Fact label="Expected Cash" value={money(shift.expected)} />
          </dl>
        </section>
        <section className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold text-[#251605]">Count physical cash</h3>
          <Label htmlFor="counted-cash" className="mt-3 block">
            Counted Cash
          </Label>
          <Input
            id="counted-cash"
            type="number"
            min="0"
            step="0.01"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            className="mt-1 min-h-11"
            required
          />
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <Fact label="Expected" value={money(shift.expected)} />
            <Fact label="Counted" value={countedValue === null ? "—" : money(countedValue)} />
            <Fact
              label="Difference"
              value={variance.difference === null ? "—" : money(variance.difference)}
            />
            <Fact label="Status" value={variance.label ?? "—"} />
          </dl>
          {variance.label === "Variance" && variance.difference !== null ? (
            <p className="mt-3 text-sm text-[#8A4B08]">
              A cash variance of {money(variance.difference)} will be recorded with this closing
              count.
            </p>
          ) : null}
          <Label htmlFor="close-note" className="mt-3 block">
            Closing note
          </Label>
          <Textarea
            id="close-note"
            value={notes}
            maxLength={300}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1"
          />
        </section>
      </div>
      <section className={CARD}>
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#251605]">Shift cash activity</h3>
        </div>
        {lines.length === 0 ? (
          <p className="p-4 text-sm text-[#7A7167]">No cash movements on this shift yet.</p>
        ) : (
          <ul className="divide-y divide-[#E8E1D7] text-sm">
            {lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-2">
                <div>
                  <p className="font-medium text-[#251605]">{line.description}</p>
                  <p className="text-xs text-[#7A7167]">
                    {dateTime(line.occurredAt)}
                    {line.guest ? ` · ${line.guest}` : ""}
                    {line.actor ? ` · ${line.actor}` : ""}
                  </p>
                </div>
                <span className="tabular-nums">{money(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex gap-2">
        <Button
          type="submit"
          className="min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
          disabled={mutation.isPending}
        >
          Close Shift
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ClosedSummary({
  shift,
  businessDate,
  money,
  dateTime,
  canOperate,
  onOpen,
  onDismiss,
}: {
  shift: CashierShiftRow;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  canOperate: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const variance = variancePresentation(shift.closingCash, shift.expected);
  return (
    <section className={`${CARD} p-4`} data-testid="shift-closed-summary">
      <h3 className="text-sm font-semibold text-[#251605]">Shift Closed</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Opened" value={dateTime(shift.openedAt)} />
        <Fact label="Closed" value={dateTime(shift.closedAt)} />
        <Fact
          label="Duration"
          value={formatShiftDuration(shift.openedAt, shift.closedAt, Date.now())}
        />
        <Fact label="Current Business Date" value={businessDate} />
        <Fact label="Opening Cash" value={money(shift.openingCash ?? 0)} />
        <Fact label="Expected Cash" value={money(shift.expected)} />
        <Fact
          label="Counted Cash"
          value={shift.closingCash === null ? "—" : money(shift.closingCash)}
        />
        <Fact
          label="Variance"
          value={variance.difference === null ? "—" : money(variance.difference)}
        />
      </dl>
      <p className="mt-2 text-xs text-[#7A7167]">
        The business date shown is the current hotel day, not a date stored on the shift.
      </p>
      <div className="mt-3 flex gap-2">
        {canOperate ? (
          <Button
            type="button"
            className="min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            onClick={onOpen}
          >
            Open New Shift
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="min-h-11" onClick={onDismiss}>
          Back to control
        </Button>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#FAF8F4] px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#7A7167]">{label}</dt>
      <dd className="text-sm font-semibold text-[#251605]">{value}</dd>
    </div>
  );
}
