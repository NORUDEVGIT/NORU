import { Link } from "@tanstack/react-router";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/components/bookings/reservation-bits";
import type {
  AuditException,
  NightAuditRunRow,
  NightAuditState,
} from "@/lib/nightaudit.functions";
import type { AreaCheck } from "@/lib/nightaudit.server";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import { formatStayDate } from "@/lib/reservation-dates";

export function CheckBadge({ status }: { status: AreaCheck["status"] }) {
  if (status === "blocking") return <Badge variant="destructive">Blocking</Badge>;
  if (status === "warning") return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Pass</Badge>;
}

export function RunStatusBadge({ status }: { status: NightAuditRunRow["status"] }) {
  const variant =
    status === "closed" ? "secondary" : status === "ready" ? "default" : status === "failed" ? "destructive" : "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function ChecklistPanel({ checks }: { checks: AreaCheck[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Checklist</h2>
      <ul className="mt-3 divide-y divide-border">
        {checks.map((c) => (
          <li key={c.area} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{c.area}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
            <CheckBadge status={c.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExceptionsPanel({
  exceptions,
  onUpdate,
  busy,
  readOnly = false,
}: {
  exceptions: AuditException[];
  onUpdate: (id: string, action: "resolve" | "ignore") => void;
  busy: boolean;
  readOnly?: boolean;
}) {
  const open = exceptions.filter((e) => e.status === "open");
  const handled = exceptions.filter((e) => e.status !== "open");

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Exceptions</h2>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open exceptions for this business date.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((e) => (
            <li key={e.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={e.severity === "blocking" ? "destructive" : "secondary"}>
                      {e.severity === "blocking" ? "Blocking" : "Warning"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{e.exceptionType.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-1 text-sm">{e.message}</p>
                </div>
                <div className="flex gap-2">
                  {readOnly ? null : e.canIgnore ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onUpdate(e.id, "ignore")}>
                      Ignore
                    </Button>
                  ) : null}
                  {!readOnly && e.severity === "warning" ? (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onUpdate(e.id, "resolve")}>
                      Resolve
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {handled.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {handled.length} resolved or ignored
          </summary>
          <ul className="mt-2 space-y-1.5">
            {handled.map((e) => (
              <li key={e.id} className="text-xs text-muted-foreground">
                <span className="capitalize">{e.status}</span> — {e.message}
                {e.resolutionNote ? ` (${e.resolutionNote})` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function NoShowPanel({
  state,
  onNoShow,
  busy,
  readOnly = false,
}: {
  state: NightAuditState;
  onNoShow: (reservationId: string) => void;
  busy: boolean;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Unprocessed arrivals</h2>
      {state.noShows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Every arrival for this business date is processed.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {state.noShows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">
                  {r.confirmationNumber} — {r.guestName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Arrival {formatStayDate(r.arrivalDate)}
                  {r.roomNumber ? ` · Room ${r.roomNumber}` : ""}
                </p>
              </div>
              {readOnly ? null : (
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/restaurant/rooms/arrivals">Front Office</Link>
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => onNoShow(r.id)}>
                    Mark no-show
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.overstays.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium">Overstays</h3>
          <ul className="mt-2 space-y-2">
            {state.overstays.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {s.confirmationNumber} — {s.guestName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due to depart {formatStayDate(s.departureDate)}
                    {s.roomNumber ? ` · Room ${s.roomNumber}` : ""}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/restaurant/rooms/in-house">Open in Front Office</Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ShiftsPanel({ state }: { state: NightAuditState }) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Cashier shifts</h2>
        <Button asChild size="sm" variant="outline">
          <Link to="/restaurant/cashiering" search={{ tab: "shifts" }}>
            Open shifts
          </Link>
        </Button>
      </div>
      {state.shifts.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No cashier shifts for this business date.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Cashier</th>
                <th>Opened</th>
                <th>Status</th>
                <th className="text-right">Payments</th>
                <th className="text-right">Cash</th>
                <th className="text-right">Refunds</th>
                <th className="text-right">Deposits</th>
                <th className="text-right">Expected cash</th>
              </tr>
            </thead>
            <tbody>
              {state.shifts.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2">{s.cashier}</td>
                  <td>{dateTime(s.openedAt)}</td>
                  <td className="capitalize">{s.status}</td>
                  <td className="text-right">{money(s.payments)}</td>
                  <td className="text-right">{money(s.cashPayments)}</td>
                  <td className="text-right">{money(s.refunds)}</td>
                  <td className="text-right">{money(s.deposits)}</td>
                  <td className="text-right">{money(s.expectedCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RevenuePanel({ state }: { state: NightAuditState }) {
  const money = useMoney();
  const f = state.finance;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg">Revenue &amp; payments</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Room revenue" value={money(f.roomRevenue)} />
        <StatCard label="Other hotel charges" value={money(f.otherCharges)} />
        <StatCard label="Payments" value={money(f.payments)} />
        <StatCard label="Deposits" value={money(f.deposits)} />
        <StatCard label="Refunds" value={money(f.refunds)} />
        <StatCard label="Discounts" value={money(f.discounts)} />
        <StatCard label="Adjustments" value={money(f.adjustments)} />
        <StatCard label="Total charges" value={money(f.charges)} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium">Payments by method</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-5">
          {(
            [
              ["cash", "Cash"],
              ["card", "Card"],
              ["bank_transfer", "Bank transfer"],
              ["mobile_money", "Mobile money"],
              ["other", "Other"],
            ] as const
          ).map(([key, label]) => (
            <li key={key} className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{money(f.paymentsByMethod[key])}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
