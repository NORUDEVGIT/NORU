import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  NA1_ALL_CLEAR,
  NA1_CHROME,
  NA1_CONFIRM_GOLD,
  NA1_CONFIRM_LABEL,
  NA1_NOTE_HINT,
  NA1_PASS_COLOR,
  NA1_PHONE_CLOSE_COPY,
  canConfirmNightAudit,
  formatNa1Date,
  liveCountFromSnapshot,
  nextBusinessDate,
  remainingBlockerCount,
  remainingBlockersCopy,
  type NaBlockerRow,
  type NaBlockerState,
  type NaLastClosed,
  type NaWorkspaceStatus,
} from "@/packages/pms/lib/na1";
import type { NightAuditRunRow } from "@/packages/pms/lib/nightaudit.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const STATE_LABEL: Record<NaBlockerState, string> = {
  pass: "Pass",
  block: "Block",
  na: "N/A",
  unavailable: "Unavailable",
};

function stateChipClass(state: NaBlockerState): string {
  if (state === "pass") return "border-transparent text-white";
  if (state === "block") return "border-[#C89933]/50 bg-[#C89933]/10 text-[#251605]";
  return "border-border bg-muted/50 text-muted-foreground";
}

export function NaStatusChip({ status }: { status: NaWorkspaceStatus }) {
  const label =
    status === "in_progress" ? "In progress" : status === "closed" ? "Closed" : status === "blocked" ? "Blocked" : "Open";
  const closed = status === "closed";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize"
      style={
        closed
          ? { backgroundColor: NA1_PASS_COLOR, color: "#fff", borderColor: NA1_PASS_COLOR }
          : status === "blocked"
            ? { backgroundColor: "rgba(200,153,51,0.12)", color: NA1_CHROME, borderColor: "rgba(200,153,51,0.45)" }
            : undefined
      }
    >
      {label}
    </span>
  );
}

export function NaBlockerBoard({ rows, readOnly = false }: { rows: NaBlockerRow[]; readOnly?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg text-[#251605]">Blockers</h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#251605]">{row.label}</p>
              <p className={`text-xs ${row.state === "unavailable" ? "text-muted-foreground" : "text-muted-foreground"}`}>
                {row.state === "pass" || row.state === "block"
                  ? `${row.count ?? 0} · ${row.detail}`
                  : row.detail}
              </p>
              {!readOnly && row.clear.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.clear.map((link) => (
                    <Button key={`${row.id}-${link.to}-${link.label}`} asChild size="sm" variant="outline">
                      <Link to={link.to as never} search={link.search as never}>
                        {link.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${stateChipClass(row.state)}`}
              style={row.state === "pass" ? { backgroundColor: NA1_PASS_COLOR } : undefined}
            >
              {STATE_LABEL[row.state]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NaClosePanel({
  businessDate,
  rows,
  role,
  phone,
  closed,
  busy,
  note,
  onNoteChange,
  onConfirm,
  error,
}: {
  businessDate: string;
  rows: NaBlockerRow[];
  role: string;
  phone: boolean;
  closed: boolean;
  busy: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  error: string | null;
}) {
  const remaining = remainingBlockerCount(rows);
  const enabled = !closed && !busy && !phone && canConfirmNightAudit(role) && remaining === 0;
  const showConfirm = !phone && canConfirmNightAudit(role) && !closed;
  const receptionist = role === "receptionist";

  return (
    <aside className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg text-[#251605]">Close business date</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Before</p>
          <p className="font-medium">{formatNa1Date(businessDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">After</p>
          <p className="font-medium">{formatNa1Date(nextBusinessDate(businessDate))}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-[#251605]">
        {remaining > 0 ? remainingBlockersCopy(remaining) : NA1_ALL_CLEAR}
      </p>

      {phone ? <p className="mt-3 text-sm text-muted-foreground">{NA1_PHONE_CLOSE_COPY}</p> : null}

      {!phone && receptionist ? (
        <PermissionDeniedPanel
          className="mt-4"
          message="Front Office agents cannot confirm Night Audit. Ask an owner or manager to close."
        />
      ) : null}

      {showConfirm ? (
        <>
          <label className="mt-4 block text-xs text-muted-foreground" htmlFor="na1-close-note">
            Audit note
          </label>
          <Textarea
            id="na1-close-note"
            className="mt-1"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={NA1_NOTE_HINT}
          />
          <Button
            className="mt-4 w-full"
            disabled={!enabled}
            style={enabled ? { backgroundColor: NA1_CONFIRM_GOLD, color: NA1_CHROME } : undefined}
            onClick={onConfirm}
          >
            {busy ? "In progress…" : NA1_CONFIRM_LABEL}
          </Button>
        </>
      ) : null}

      {closed ? <p className="mt-3 text-sm text-muted-foreground">This business date is closed.</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </aside>
  );
}

export function NaCloseSummary({
  run,
  lastClosed,
}: {
  run?: NightAuditRunRow | null;
  lastClosed?: NaLastClosed | null;
}) {
  const { dateTime } = useRestaurantTime();
  const previous = run?.summary?.previousBusinessDate ?? lastClosed?.previousBusinessDate;
  const next = run?.summary?.nextBusinessDate ?? lastClosed?.nextBusinessDate;
  const who = run?.closedBy ?? lastClosed?.who;
  const when = run?.closedAt ?? lastClosed?.when;
  const blockers = run?.summary?.blockers;
  if (!previous || !next) {
    return <p className="text-sm text-muted-foreground">No close has been recorded yet.</p>;
  }

  const arrivals = liveCountFromSnapshot(blockers, "arrivals_pending");
  const overstays = liveCountFromSnapshot(blockers, "overstays");
  const unpaid = liveCountFromSnapshot(blockers, "unpaid_folios");

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg text-[#251605]">Latest close</h2>
      <p className="mt-2 text-sm">
        {formatNa1Date(previous)} → {formatNa1Date(next)}
      </p>
      <p className="text-xs text-muted-foreground">
        {who ?? "—"}
        {when ? ` · ${dateTime(when)}` : ""}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Arrivals left</dt>
          <dd className="text-sm font-medium">{arrivals == null ? "—" : arrivals}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Overstays</dt>
          <dd className="text-sm font-medium">{overstays == null ? "—" : overstays}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Unpaid folios</dt>
          <dd className="text-sm font-medium">{unpaid == null ? "—" : unpaid}</dd>
        </div>
      </dl>
    </section>
  );
}

export function NaHistoryList({ runs }: { runs: NightAuditRunRow[] }) {
  const { dateTime } = useRestaurantTime();
  if (runs.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No audit history yet.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Date</th>
            <th>Status</th>
            <th>Who</th>
            <th>When</th>
            <th className="text-right">Arrivals</th>
            <th className="text-right">Overstays</th>
            <th className="text-right">Unpaid</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const blockers = run.summary?.blockers;
            return (
              <tr key={run.id} className="border-t border-border">
                <td className="py-2">{formatNa1Date(run.businessDate)}</td>
                <td className="capitalize">{run.status === "ready" ? "open" : run.status}</td>
                <td>{run.closedBy ?? run.startedBy ?? "—"}</td>
                <td>{run.closedAt ? dateTime(run.closedAt) : dateTime(run.startedAt)}</td>
                <td className="text-right">{formatLiveCount(liveCountFromSnapshot(blockers, "arrivals_pending"))}</td>
                <td className="text-right">{formatLiveCount(liveCountFromSnapshot(blockers, "overstays"))}</td>
                <td className="text-right">{formatLiveCount(liveCountFromSnapshot(blockers, "unpaid_folios"))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatLiveCount(value: number | null): string {
  return value == null ? "—" : String(value);
}
