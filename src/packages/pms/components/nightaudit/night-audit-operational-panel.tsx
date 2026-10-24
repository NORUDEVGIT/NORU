import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import {
  matchesOperationalFilter,
  NIGHT_AUDIT_OPERATIONAL_CATEGORIES,
  operationalEmptyCopy,
  operationalFocusFilter,
  operationalSectionLabel,
  type NightAuditOperationalCategory,
  type NightAuditOperationalFilter,
  type NightAuditOperationalIssue,
  type NightAuditOperationalReconciliation,
  type OperationalRowStatus,
  type OperationalSectionState,
} from "@/packages/pms/lib/night-audit-operational";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import { NIGHT_AUDIT_PAGE_SIZE, paginateRows } from "@/packages/pms/lib/night-audit-shell";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";

const CATEGORY_LABEL: Record<NightAuditOperationalCategory, string> = {
  arrivals: "Arrivals",
  departures: "Departures",
  rooms: "Rooms",
  housekeeping: "Housekeeping",
  overbooking: "Overbooking",
  distribution: "Distribution",
  revenue: "Revenue",
  services: "Services",
};

function issueStatus(issue: NightAuditOperationalIssue): OperationalRowStatus {
  return issue.severity === "blocking" ? "blocker" : issue.severity;
}

function badge(status: OperationalRowStatus | OperationalSectionState | string): string {
  if (status === "blocker" || status === "blocked") return "bg-red-50 text-red-800";
  if (status === "warning") return "bg-amber-50 text-amber-900";
  if (status === "info") return "bg-stone-100 text-stone-700";
  if (status === "unavailable") return "bg-stone-200 text-stone-800";
  if (status === "not_configured" || status === "na") return "bg-stone-100 text-stone-600";
  return "bg-emerald-50 text-emerald-900";
}

function statusLabel(status: OperationalRowStatus): string {
  if (status === "blocker") return "Blocker";
  if (status === "warning") return "Warning";
  if (status === "info") return "Info";
  return "Pass";
}

function Chip({ status }: { status: OperationalRowStatus }) {
  return <span className={`rounded px-1.5 py-0.5 ${badge(status)}`}>{statusLabel(status)}</span>;
}

function prioritize<T extends { status: OperationalRowStatus }>(rows: readonly T[]): T[] {
  const rank = (status: OperationalRowStatus) =>
    status === "blocker" ? 0 : status === "warning" ? 1 : status === "info" ? 2 : 3;
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status)).slice(0, NIGHT_AUDIT_PAGE_SIZE);
}

export function NightAuditOperationalPanel({
  loading,
  error,
  result,
  focus,
  onRefresh,
}: {
  loading: boolean;
  error: string | null;
  result: NightAuditOperationalReconciliation | null;
  focus?: string | undefined;
  onRefresh: () => void;
}) {
  const [severity, setSeverity] = useState<NightAuditOperationalFilter["severity"]>("all");
  const [category, setCategory] = useState<NightAuditOperationalFilter["category"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const preset = operationalFocusFilter(focus);
    setSeverity(preset.severity ?? "all");
    setCategory(preset.category ?? "all");
  }, [focus]);

  useEffect(() => {
    setPage(1);
  }, [severity, category, search, result?.checkedAt]);

  const filter = useMemo(() => ({ severity, category, search }), [category, search, severity]);
  const selected = result?.issues.find((row) => row.id === selectedId) ?? null;

  const visibleIssues = useMemo(() => {
    if (!result) return [];
    return result.issues.filter((row) =>
      matchesOperationalFilter(
        {
          status: issueStatus(row),
          category: row.category,
          text: `${row.title} ${row.description} ${row.code} ${row.roomNumber ?? ""} ${row.confirmationNumber ?? ""} ${row.guestName ?? ""}`,
        },
        filter,
      ),
    );
  }, [filter, result]);

  if (loading || (!result && !error)) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-operations-loading">
        <p className="text-sm text-muted-foreground">{operationalEmptyCopy("loading")}</p>
      </section>
    );
  }

  if (error) {
    const denied = /don't have access|not allowed|no access/i.test(error);
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5"
        data-testid={denied ? "night-audit-operations-no-access" : "night-audit-operations-unavailable"}
      >
        <h2 className="font-display text-lg text-[#251605]">{denied ? "No access" : "Operational Status: UNAVAILABLE"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {denied ? operationalEmptyCopy("access") : operationalEmptyCopy("failed")}
        </p>
        {denied ? null : (
          <Button type="button" variant="outline" className="mt-3" onClick={onRefresh}>
            Refresh / Recheck Operations
          </Button>
        )}
      </section>
    );
  }

  if (!result) return null;
  const issuePage = paginateRows(visibleIssues, page);
  const show = (key: NightAuditOperationalCategory) => category === "all" || category === key;
  const rowFilter = (status: OperationalRowStatus, key: NightAuditOperationalCategory, text: string) =>
    matchesOperationalFilter({ status, category: key, text }, filter);
  const s = result.summary;

  return (
    <div className="space-y-4" data-testid="night-audit-operations">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7" data-testid="night-audit-operations-kpis">
        <Kpi label="Operational Status" value={result.status.toUpperCase()} tone={result.status} />
        <Kpi label="Hard Blockers" value={String(s.blockerCount)} tone={s.blockerCount ? "blocked" : "ready"} />
        <Kpi label="Warnings" value={String(s.warningCount)} tone={s.warningCount ? "warning" : "ready"} />
        <Kpi label="Unresolved Arrivals" value={String(s.unresolvedArrivalCount)} tone={s.unresolvedArrivalCount ? "blocked" : "ready"} />
        <Kpi label="Overstays" value={String(s.overstayCount)} tone={s.overstayCount ? "blocked" : "ready"} />
        <Kpi label="Room Conflicts" value={String(s.roomConflictCount)} tone={s.roomConflictCount ? "blocked" : "ready"} />
        <Kpi
          label="Overbooking Issues"
          value={result.sections.overbooking === "not_configured" ? "N/A" : String(s.overbookingIssueCount)}
          tone={s.overbookingIssueCount ? "warning" : "ready"}
        />
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search room, reservation, or issue"
            aria-label="Search operational issues"
            data-testid="night-audit-operations-search"
            className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
          />
          <select
            aria-label="Severity"
            data-testid="night-audit-operations-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All severities</option>
            <option value="blocker">Blocker</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            aria-label="Category"
            data-testid="night-audit-operations-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All categories</option>
            {NIGHT_AUDIT_OPERATIONAL_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_LABEL[item]}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" data-testid="night-audit-operations-refresh" onClick={onRefresh}>
            <RefreshCw className="mr-1 size-3.5" />
            Refresh / Recheck Operations
          </Button>
        </div>
        {result.access !== "detail" ? (
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground" data-testid="night-audit-operations-redacted">
            {operationalEmptyCopy(result.access === "rooms" ? "rooms" : "summary")}
          </p>
        ) : null}
        {visibleIssues.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{operationalEmptyCopy("issues")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {issuePage.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-medium text-[#251605]" onClick={() => setSelectedId(row.id)}>
                        {row.title}
                      </button>
                      <p className="text-muted-foreground">{row.description}</p>
                    </td>
                    <td className="px-3 py-2">{CATEGORY_LABEL[row.category]}</td>
                    <td className="px-3 py-2">{row.roomNumber ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Chip status={issueStatus(row)} />
                    </td>
                    <td className="px-3 py-2">{link("Open owner module", row.route, row.search)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {issuePage.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <span>
              Page {issuePage.page} of {issuePage.pages}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <Button type="button" variant="outline" disabled={page >= issuePage.pages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {show("arrivals") ? (
        <Section title="Arrivals & No-Shows" state={result.sections.arrivals}>
          <SimpleTable
            headers={["Reservation", "Unit", "Guest", "Room", "Room Type", "Due", "Source Status", "State", "Action"]}
            rows={prioritize(
              result.arrivals.filter((row) =>
                rowFilter(row.status, "arrivals", `${row.confirmationNumber} ${row.guest} ${row.roomNumber ?? ""}`),
              ),
            ).map((row) => [
              row.confirmationNumber,
              row.unit ?? "—",
              row.guest,
              row.roomNumber ?? "Unassigned",
              row.roomType ?? "—",
              formatNa1Date(row.arrivalDate),
              row.sourceStatus,
              <Chip key="s" status={row.status} />,
              link("Open Front Office", row.route, row.search),
            ])}
            empty={
              result.access === "detail"
                ? "No unresolved arrivals for this business date."
                : `${s.unresolvedArrivalCount} unresolved arrival(s).`
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            No-show is never automatic. There is no persisted pending no-show workflow, so no no-show rows are shown.
          </p>
        </Section>
      ) : null}

      {show("departures") ? (
        <Section title="Departures & In-House" state={result.sections.departures}>
          <SimpleTable
            headers={["Reservation", "Unit", "Guest", "Room", "Departure", "Late Checkout", "State", "Issue", "Action"]}
            rows={prioritize(
              result.departures.filter((row) =>
                rowFilter(row.status, "departures", `${row.confirmationNumber} ${row.guest} ${row.roomNumber ?? ""}`),
              ),
            ).map((row) => [
              row.confirmationNumber,
              row.unit ?? "—",
              row.guest,
              row.roomNumber ?? "Unassigned",
              formatNa1Date(row.departureDate),
              row.lateCheckoutUntil ?? "—",
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open Front Office", row.route, row.search),
            ])}
            empty={
              result.access === "detail"
                ? "No overstays or departures due today."
                : `${s.overstayCount} overstay(s) · ${s.dueTodayCount} due out today.`
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            In-house: {s.inHouseCount} checked-in room unit(s).
          </p>
        </Section>
      ) : null}

      {show("rooms") ? (
        <Section title="Room Assignment & Occupancy" state={result.sections.rooms}>
          <SimpleTable
            headers={["Room", "Room Type", "Occupied", "Operational", "Housekeeping", "Maintenance", "Sellable", "State", "Issue", "Action"]}
            rows={prioritize(
              result.rooms
                .filter((row) => row.status !== "pass")
                .filter((row) => rowFilter(row.status, "rooms", `${row.roomNumber} ${row.roomType ?? ""} ${row.issue}`)),
            ).map((row) => [
              row.roomNumber,
              row.roomType ?? "—",
              row.occupied ? `Yes (${row.occupants})` : "No",
              row.operationalStatus,
              row.housekeepingStatus,
              row.maintenanceStatus ?? "—",
              row.sellable == null ? "—" : row.sellable ? "Yes" : "No",
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open owner module", row.route, row.search),
            ])}
            empty="No room assignment or occupancy conflicts."
          />
          <IssueList
            issues={result.issues.filter(
              (issue) => issue.category === "rooms" && !issue.roomId && rowFilter(issueStatus(issue), "rooms", issue.description),
            )}
            onSelect={setSelectedId}
          />
        </Section>
      ) : null}

      {show("housekeeping") ? (
        <Section title="Housekeeping & Room State" state={result.sections.housekeeping}>
          <SimpleTable
            headers={["Room", "Room Type", "Occupied", "Housekeeping", "Readiness", "State", "Issue", "Action"]}
            rows={prioritize(
              result.housekeeping.filter((row) =>
                rowFilter(row.status, "housekeeping", `${row.roomNumber} ${row.housekeepingStatus} ${row.issue}`),
              ),
            ).map((row) => [
              row.roomNumber,
              row.roomType ?? "—",
              row.occupied ? "Yes" : "No",
              row.housekeepingStatus,
              row.readiness,
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open Housekeeping", row.route, row.search),
            ])}
            empty="No housekeeping items need attention."
          />
        </Section>
      ) : null}

      {show("overbooking") ? (
        <Section title="Overbooking" state={result.sections.overbooking}>
          {result.sections.overbooking === "not_configured" ? (
            <p className="text-sm text-muted-foreground">Overbooking is not configured for this property.</p>
          ) : (
            <SimpleTable
              headers={["Date", "Room Type", "Capacity", "Effective Allowance", "Committed", "Excess", "Approval", "State", "Action"]}
              rows={prioritize(
                result.overbooking.filter((row) => rowFilter(row.status, "overbooking", `${row.roomType} ${row.date}`)),
              ).map((row) => [
                formatNa1Date(row.date),
                row.roomType,
                String(row.capacity),
                String(row.effectiveAllowance),
                String(row.committed),
                String(row.excess),
                row.approval === "approved" ? "Approved" : row.approval === "partial" ? `Partial (${row.approvedShortage})` : "None",
                <Chip key="s" status={row.status} />,
                link("Open Room & Inventory Overbooking", row.route, row.search),
              ])}
              empty="No room type is short tonight or tomorrow."
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Waitlist: {result.waitlist.state === "not_configured" ? "N/A" : `${result.waitlist.pendingCount} pending`}
            {result.waitlist.anomalyCount > 0 ? ` · ${result.waitlist.anomalyCount} conversion anomaly(ies)` : ""}. Waitlist
            never blocks close and does not consume inventory.
          </p>
        </Section>
      ) : null}

      {show("distribution") ? (
        <Section title="Distribution / Channels" state={result.sections.distribution}>
          {result.sections.distribution === "na" ? (
            <p className="text-sm text-muted-foreground">N/A — no channel connection.</p>
          ) : result.sections.distribution === "not_configured" ? (
            <p className="text-sm text-muted-foreground">Distribution is not configured for this property.</p>
          ) : result.sections.distribution === "unavailable" ? (
            <p className="text-sm text-muted-foreground">Distribution status is unavailable. It never blocks close.</p>
          ) : (
            <SimpleTable
              headers={["Source", "Detail", "When", "State", "Action"]}
              rows={prioritize(
                result.distribution.filter((row) => rowFilter(row.status, "distribution", `${row.label} ${row.detail}`)),
              ).map((row) => [row.label, row.detail, row.occurredAt ?? "—", <Chip key="s" status={row.status} />, link("Open Distribution", row.route)])}
              empty="No known failures."
            />
          )}
        </Section>
      ) : null}

      {show("revenue") ? (
        <Section title="Revenue Readiness" state={result.sections.revenue}>
          <SimpleTable
            headers={["Item", "Type", "Date", "Detail", "State", "Action"]}
            rows={prioritize(
              result.revenueReadiness.filter((row) => rowFilter(row.status, "revenue", `${row.label} ${row.detail}`)),
            ).map((row) => [
              row.label,
              row.kind === "approval" ? "Pending approval" : row.kind === "restriction" ? "Next-date restriction" : "Frozen nightly rate",
              row.date ? formatNa1Date(row.date) : "—",
              row.detail,
              <Chip key="s" status={row.status} />,
              link(row.kind === "snapshot" ? "Open Front Office" : "Open Rate & Revenue", row.route, row.search),
            ])}
            empty={
              result.sections.revenue === "not_configured"
                ? "Rate & Revenue approvals are not configured."
                : "No pending approvals, next-date restrictions, or missing frozen rates."
            }
          />
        </Section>
      ) : null}

      {show("services") ? (
        <Section title="Service Operations" state={result.sections.services}>
          {result.sections.services === "not_configured" ? (
            <p className="text-sm text-muted-foreground">Service entitlements are not configured.</p>
          ) : (
            <SimpleTable
              headers={["Room", "Service", "Kind", "Date", "Source Status", "State"]}
              rows={prioritize(
                result.serviceOperations.rows.filter((row) => rowFilter(row.status, "services", `${row.roomNumber} ${row.service}`)),
              ).map((row) => [
                row.roomNumber || "—",
                row.service,
                row.kind,
                formatNa1Date(row.serviceDate),
                row.sourceStatus,
                <Chip key="s" status={row.status} />,
              ])}
              empty={
                result.access === "detail"
                  ? "No pending service entitlements for this business date."
                  : `${result.serviceOperations.pendingCount} pending service entitlement(s).`
              }
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Services never block close. Missing service charges are not inferred — there is no canonical service-to-charge link.
          </p>
        </Section>
      ) : null}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="night-audit-operations-detail">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
              </SheetHeader>
              <dl className="mt-4 space-y-3 text-sm">
                <Field label="Severity" value={statusLabel(issueStatus(selected))} />
                <Field label="Issue" value={selected.description} />
                <Field
                  label="Reservation / room / guest"
                  value={[selected.confirmationNumber, selected.roomNumber ? `Room ${selected.roomNumber}` : null, selected.guestName]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                />
                <Field label="Audit date" value={formatNa1Date(result.businessDate)} />
                <Field label="Detected" value={selected.dueDate ? formatNa1Date(selected.dueDate) : formatNa1Date(result.businessDate)} />
                <Field label="Source status" value={selected.sourceStatus ?? "—"} />
                <Field label="Owner module" value={selected.ownerModule} />
                <Field label="Recommended action" value={selected.recommendedAction} />
                <Field label="Last checked" value={result.checkedAt} />
              </dl>
              <Button asChild className="mt-4" variant="outline">
                <Link to={selected.route as never} search={selected.search as never}>
                  Open {selected.ownerModule}
                </Link>
              </Button>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function IssueList({
  issues,
  onSelect,
}: {
  issues: NightAuditOperationalIssue[];
  onSelect: (id: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {issues.slice(0, NIGHT_AUDIT_PAGE_SIZE).map((issue) => (
        <li key={issue.id} className="rounded-lg border border-border px-3 py-2 text-xs">
          <button type="button" className="font-medium text-[#251605]" onClick={() => onSelect(issue.id)}>
            {issue.title}
          </button>
          <span className="ml-2">
            <Chip status={issueStatus(issue)} />
          </span>
          <p className="text-muted-foreground">{issue.description}</p>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3" data-testid="night-audit-operations-status">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-xl ${tone === "blocked" ? "text-red-800" : tone === "warning" ? "text-amber-900" : "text-[#251605]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Section({ title, state, children }: { title: string; state: OperationalSectionState; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">{title}</h2>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge(state)}`}>{operationalSectionLabel(state)}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function link(label: string, route: string, search?: Record<string, string>) {
  return (
    <Link to={route as never} search={search as never} className="text-[#8A5A12] underline">
      {label}
    </Link>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string | ReactNode>>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-2 py-1.5 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
