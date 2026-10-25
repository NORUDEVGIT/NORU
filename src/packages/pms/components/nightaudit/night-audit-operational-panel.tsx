import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  Coins,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Layers,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type OperationalSubTab =
  | "triage"
  | "arrivals"
  | "departures"
  | "rooms"
  | "housekeeping"
  | "overbooking"
  | "distribution"
  | "revenue"
  | "services";

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
  if (status === "blocker" || status === "blocked") return "bg-red-50 text-red-700 border border-red-200/80";
  if (status === "warning") return "bg-amber-50 text-amber-800 border border-amber-200/80";
  if (status === "info") return "bg-blue-50 text-blue-700 border border-blue-200/80";
  if (status === "unavailable") return "bg-stone-100 text-stone-700 border border-stone-200";
  if (status === "not_configured" || status === "na") return "bg-stone-100 text-stone-600 border border-stone-200/70";
  return "bg-emerald-50 text-emerald-800 border border-emerald-200/80";
}

function statusLabel(status: OperationalRowStatus): string {
  if (status === "blocker") return "Blocker";
  if (status === "warning") return "Warning";
  if (status === "info") return "Info";
  return "Pass";
}

function statusIcon(status: OperationalRowStatus | string) {
  if (status === "blocker" || status === "blocked") {
    return <AlertTriangle className="size-3.5 text-red-600 shrink-0" />;
  }
  if (status === "warning") {
    return <AlertCircle className="size-3.5 text-amber-600 shrink-0" />;
  }
  if (status === "info") {
    return <Info className="size-3.5 text-blue-600 shrink-0" />;
  }
  return <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />;
}

function Chip({ status }: { status: OperationalRowStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize", badge(status))}>
      {statusIcon(status)}
      {statusLabel(status)}
    </span>
  );
}

function prioritize<T extends { status: OperationalRowStatus }>(rows: readonly T[]): T[] {
  const rank = (status: OperationalRowStatus) =>
    status === "blocker" ? 0 : status === "warning" ? 1 : status === "info" ? 2 : 3;
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status));
}

function getDestinationMeta(row: {
  category: NightAuditOperationalCategory | string;
  code?: string;
  ownerModule?: string;
}) {
  if (row.category === "arrivals") {
    return {
      destination: "Front Office Desk → Arrivals",
      actionText: "Process Arrival",
      icon: LogIn,
    };
  }
  if (row.category === "departures") {
    return {
      destination: "Front Office Desk → Departures",
      actionText: "Review Departure / Overstay",
      icon: LogOut,
    };
  }
  if (row.category === "rooms") {
    return {
      destination: "Room & Inventory → Room Board",
      actionText: "Inspect Room Assignment",
      icon: BedDouble,
    };
  }
  if (row.category === "housekeeping") {
    return {
      destination: "Housekeeping Desk → Room Board",
      actionText: "Update Housekeeping State",
      icon: Sparkles,
    };
  }
  if (row.category === "overbooking") {
    return {
      destination: "Room & Inventory → Overbooking",
      actionText: "Review Overbooking & Allowance",
      icon: Layers,
    };
  }
  if (row.category === "distribution") {
    return {
      destination: "Distribution → Channel Manager",
      actionText: "Check Channel Sync",
      icon: Globe,
    };
  }
  if (row.category === "revenue") {
    return {
      destination: "Rate & Revenue → Restrictions",
      actionText: "Review Rate Approvals",
      icon: Coins,
    };
  }
  if (row.category === "services") {
    return {
      destination: "Guest Services → Entitlements",
      actionText: "Inspect Service Entitlement",
      icon: Utensils,
    };
  }
  return {
    destination: row.ownerModule ? `Module: ${row.ownerModule}` : "Source Module",
    actionText: `Open ${row.ownerModule || "module"}`,
    icon: ExternalLink,
  };
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
  const [activeTab, setActiveTab] = useState<OperationalSubTab>("triage");
  const [severity, setSeverity] = useState<NightAuditOperationalFilter["severity"]>("all");
  const [category, setCategory] = useState<NightAuditOperationalFilter["category"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const preset = operationalFocusFilter(focus);
    setSeverity(preset.severity ?? "all");
    setCategory(preset.category ?? "all");
    if (focus === "blockers") {
      setActiveTab("triage");
      setSeverity("blocker");
    } else if (focus === "warnings") {
      setActiveTab("triage");
      setSeverity("warning");
    } else if (focus === "arrivals") {
      setActiveTab("arrivals");
    } else if (focus === "overstays") {
      setActiveTab("departures");
    } else if (focus === "rooms") {
      setActiveTab("rooms");
    } else if (focus === "overbooking") {
      setActiveTab("overbooking");
    }
  }, [focus]);

  useEffect(() => {
    setPage(1);
  }, [severity, category, search, activeTab, result?.checkedAt]);

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
      <section className="rounded-2xl border border-border bg-card p-8 text-center" data-testid="night-audit-operations-loading">
        <RefreshCw className="mx-auto size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">{operationalEmptyCopy("loading")}</p>
        <p className="mt-1 text-xs text-muted-foreground">Checking arrivals, departures, room occupancy, and housekeeping readiness…</p>
      </section>
    );
  }

  if (error) {
    const denied = /don't have access|not allowed|no access/i.test(error);
    return (
      <section
        className="rounded-2xl border border-border bg-card p-6"
        data-testid={denied ? "night-audit-operations-no-access" : "night-audit-operations-unavailable"}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-lg text-foreground">{denied ? "No access" : "Operational Status: UNAVAILABLE"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {denied ? operationalEmptyCopy("access") : operationalEmptyCopy("failed")}
            </p>
            {denied ? null : (
              <Button type="button" variant="outline" className="mt-4" onClick={onRefresh}>
                <RefreshCw className="mr-2 size-3.5" />
                Refresh / Recheck Operations
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (!result) return null;
  const issuePage = paginateRows(visibleIssues, page);
  const domainFilter = (status: OperationalRowStatus, text: string) => {
    if (severity !== "all" && status !== severity) return false;
    const needle = search.trim().toLowerCase();
    return !needle || text.toLowerCase().includes(needle);
  };
  const rowFilter = (status: OperationalRowStatus, key: NightAuditOperationalCategory, text: string) =>
    matchesOperationalFilter({ status, category: key, text }, filter);
  const s = result.summary;

  const totalActionItems = s.blockerCount + s.warningCount;

  // Domain filtered datasets
  const filteredArrivals = prioritize(
    result.arrivals.filter((row) =>
      domainFilter(row.status, `${row.confirmationNumber} ${row.guest} ${row.roomNumber ?? ""} ${row.roomType ?? ""}`),
    ),
  );
  const arrivalsPage = paginateRows(filteredArrivals, page);

  const filteredDepartures = prioritize(
    result.departures.filter((row) =>
      domainFilter(row.status, `${row.confirmationNumber} ${row.guest} ${row.roomNumber ?? ""} ${row.issue}`),
    ),
  );
  const departuresPage = paginateRows(filteredDepartures, page);

  const filteredRooms = prioritize(
    result.rooms.filter((row) =>
      domainFilter(row.status, `${row.roomNumber} ${row.roomType ?? ""} ${row.issue}`),
    ),
  );
  const roomsPage = paginateRows(filteredRooms, page);

  const filteredHousekeeping = prioritize(
    result.housekeeping.filter((row) =>
      domainFilter(row.status, `${row.roomNumber} ${row.housekeepingStatus} ${row.issue}`),
    ),
  );
  const housekeepingPage = paginateRows(filteredHousekeeping, page);

  const filteredOverbooking = prioritize(
    result.overbooking.filter((row) => domainFilter(row.status, `${row.roomType} ${row.date}`)),
  );
  const overbookingPage = paginateRows(filteredOverbooking, page);

  const filteredDistribution = prioritize(
    result.distribution.filter((row) => domainFilter(row.status, `${row.label} ${row.detail}`)),
  );
  const distributionPage = paginateRows(filteredDistribution, page);

  const filteredRevenue = prioritize(
    result.revenueReadiness.filter((row) => domainFilter(row.status, `${row.label} ${row.detail}`)),
  );
  const revenuePage = paginateRows(filteredRevenue, page);

  const filteredServices = prioritize(
    result.serviceOperations.rows.filter((row) => domainFilter(row.status, `${row.roomNumber} ${row.service}`)),
  );
  const servicesPage = paginateRows(filteredServices, page);

  return (
    <div className="space-y-5" data-testid="night-audit-operations">
      {/* 1. OPERATIONAL HEALTH & READINESS HERO RIBBON */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-muted/20 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm",
                result.status === "ready"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : result.status === "warning"
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200",
              )}
            >
              {result.status === "ready" ? (
                <ShieldCheck className="size-6" />
              ) : result.status === "warning" ? (
                <AlertCircle className="size-6" />
              ) : (
                <ShieldAlert className="size-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Operations Reconciliation
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                    result.status === "ready"
                      ? "bg-emerald-100/90 text-emerald-900"
                      : result.status === "warning"
                        ? "bg-amber-100/90 text-amber-950"
                        : "bg-red-100/90 text-red-950",
                  )}
                >
                  {result.status === "ready"
                    ? "Audit Ready"
                    : result.status === "warning"
                      ? "Ready with Warnings"
                      : "Roll Blocked"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {result.status === "ready"
                  ? "All arrivals, departures, room assignments, and housekeeping states are in order. Ready for close."
                  : result.status === "warning"
                    ? `${s.warningCount} operational warning${s.warningCount === 1 ? "" : "s"} detected. Day close is permitted with sign-off note.`
                    : `${s.blockerCount} operational blocker${s.blockerCount === 1 ? "" : "s"} must be resolved before advancing business date.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-end lg:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="night-audit-operations-refresh"
              onClick={onRefresh}
              className="h-9 gap-1.5 font-medium shadow-2xs hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              Refresh / Recheck Operations
            </Button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/50 pt-4 sm:grid-cols-4 xl:grid-cols-7" data-testid="night-audit-operations-kpis">
          <Kpi
            label="Operational Status"
            value={result.status.toUpperCase()}
            tone={result.status}
            subtext={`Snapshot: ${result.checkedAt ? result.checkedAt.slice(11, 19) : "Just now"}`}
          />
          <Kpi
            label="Hard Blockers"
            value={String(s.blockerCount)}
            tone={s.blockerCount ? "blocked" : "ready"}
            subtext={s.blockerCount ? "Prevents date roll" : "Clean"}
            onClick={() => {
              setActiveTab("triage");
              setSeverity("blocker");
              setCategory("all");
            }}
          />
          <Kpi
            label="Warnings"
            value={String(s.warningCount)}
            tone={s.warningCount ? "warning" : "ready"}
            subtext={s.warningCount ? "Requires review" : "No warnings"}
            onClick={() => {
              setActiveTab("triage");
              setSeverity("warning");
              setCategory("all");
            }}
          />
          <Kpi
            label="Unresolved Arrivals"
            value={String(s.unresolvedArrivalCount)}
            tone={s.unresolvedArrivalCount ? "blocked" : "ready"}
            subtext={s.unresolvedArrivalCount ? `${s.unresolvedArrivalCount} pending check-in` : "All checked in"}
            onClick={() => {
              setActiveTab("arrivals");
              setCategory("arrivals");
            }}
          />
          <Kpi
            label="Overstays"
            value={String(s.overstayCount)}
            tone={s.overstayCount ? "blocked" : "ready"}
            subtext={s.overstayCount ? `${s.overstayCount} overdue departure` : "No overstays"}
            onClick={() => {
              setActiveTab("departures");
              setCategory("departures");
            }}
          />
          <Kpi
            label="Room Conflicts"
            value={String(s.roomConflictCount)}
            tone={s.roomConflictCount ? "blocked" : "ready"}
            subtext={s.roomConflictCount ? `${s.roomConflictCount} discrepant/unassigned` : "Zero conflicts"}
            onClick={() => {
              setActiveTab("rooms");
              setCategory("rooms");
            }}
          />
          <Kpi
            label="Overbooking Issues"
            value={result.sections.overbooking === "not_configured" ? "N/A" : String(s.overbookingIssueCount)}
            tone={s.overbookingIssueCount ? "warning" : "ready"}
            subtext={result.sections.overbooking === "not_configured" ? "Not configured" : s.overbookingIssueCount ? `${s.overbookingIssueCount} short capacity` : "Within limits"}
            onClick={() => {
              setActiveTab("overbooking");
              setCategory("overbooking");
            }}
          />
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS & SEARCH COMMAND BAR */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-1 shadow-2xs">
            <TabButton
              active={activeTab === "triage"}
              onClick={() => setActiveTab("triage")}
              icon={<ShieldAlert className="size-3.5" />}
              label="Action Triage"
              count={totalActionItems}
              badgeTone={s.blockerCount > 0 ? "red" : s.warningCount > 0 ? "amber" : "neutral"}
            />
            <TabButton
              active={activeTab === "arrivals"}
              onClick={() => setActiveTab("arrivals")}
              icon={<CalendarCheck className="size-3.5" />}
              label="Arrivals"
              count={result.arrivals.length}
              badgeTone={s.unresolvedArrivalCount > 0 ? "red" : "neutral"}
            />
            <TabButton
              active={activeTab === "departures"}
              onClick={() => setActiveTab("departures")}
              icon={<LogOut className="size-3.5" />}
              label="Departures"
              count={result.departures.length}
              badgeTone={s.overstayCount > 0 ? "red" : "neutral"}
            />
            <TabButton
              active={activeTab === "rooms"}
              onClick={() => setActiveTab("rooms")}
              icon={<BedDouble className="size-3.5" />}
              label="Rooms"
              count={result.rooms.length}
              badgeTone={s.roomConflictCount > 0 ? "red" : "neutral"}
            />
            <TabButton
              active={activeTab === "housekeeping"}
              onClick={() => setActiveTab("housekeeping")}
              icon={<Sparkles className="size-3.5" />}
              label="Housekeeping"
              count={result.housekeeping.length}
            />
            <TabButton
              active={activeTab === "overbooking"}
              onClick={() => setActiveTab("overbooking")}
              icon={<Layers className="size-3.5" />}
              label="Overbooking"
              count={result.overbooking.length}
              badgeTone={s.overbookingIssueCount > 0 ? "amber" : "neutral"}
            />
            <TabButton
              active={activeTab === "distribution"}
              onClick={() => setActiveTab("distribution")}
              icon={<Globe className="size-3.5" />}
              label="Distribution"
              count={result.distribution.length}
            />
            <TabButton
              active={activeTab === "revenue"}
              onClick={() => setActiveTab("revenue")}
              icon={<Coins className="size-3.5" />}
              label="Revenue"
              count={result.revenueReadiness.length}
            />
            <TabButton
              active={activeTab === "services"}
              onClick={() => setActiveTab("services")}
              icon={<Utensils className="size-3.5" />}
              label="Services"
              count={result.serviceOperations.rows.length}
            />
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-44 flex-1 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search room, reservation, or issue"
                aria-label="Search operational issues"
                data-testid="night-audit-operations-search"
                className="h-8.5 w-full rounded-lg border border-input bg-card pl-8 pr-2.5 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
            <Select value={severity} onValueChange={(val) => setSeverity(val as typeof severity)}>
              <SelectTrigger
                aria-label="Severity"
                data-testid="night-audit-operations-severity"
                className="h-8.5 w-[135px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
              >
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="blocker">Blocker</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            <div className="hidden sm:block">
              <Select value={category} onValueChange={(val) => setCategory(val as typeof category)}>
                <SelectTrigger
                  aria-label="Category"
                  data-testid="night-audit-operations-category"
                  className="h-8.5 w-[150px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All categories</SelectItem>
                  {NIGHT_AUDIT_OPERATIONAL_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {CATEGORY_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {result.access !== "detail" ? (
          <p className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-900" data-testid="night-audit-operations-redacted">
            {operationalEmptyCopy(result.access === "rooms" ? "rooms" : "summary")}
          </p>
        ) : null}
      </div>

      {/* 3. DEDICATED SUBTAB CONTENT VIEWS */}
      {activeTab === "triage" && (
        <section className="rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-foreground">Action Triage & Operational Blockers</h3>
              <p className="text-xs text-muted-foreground">Prioritized operational issues requiring resolution before date close.</p>
            </div>
            {visibleIssues.length > 0 ? (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {visibleIssues.length} active item{visibleIssues.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {visibleIssues.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{operationalEmptyCopy("issues")}</p>
          ) : (
            <div className="divide-y divide-border">
              {issuePage.rows.map((row) => {
                const meta = getDestinationMeta(row);
                const DestinationIcon = meta.icon;
                return (
                  <div key={row.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", badge(row.severity === "blocking" ? "blocker" : row.severity))}>
                          {statusIcon(row.severity === "blocking" ? "blocker" : row.severity)}
                          {row.severity === "blocking" ? "Hard Blocker" : row.severity === "warning" ? "Warning" : "Info"}
                        </span>
                        <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {CATEGORY_LABEL[row.category] ?? row.category}
                        </span>
                        {row.roomNumber ? (
                          <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-mono font-medium text-stone-800 dark:text-stone-200">
                            Room {row.roomNumber}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                          <DestinationIcon className="size-3 text-primary" />
                          <span>{meta.destination}</span>
                        </span>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="text-left font-display text-sm font-semibold text-foreground hover:underline"
                        >
                          {row.title}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:self-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedId(row.id)}
                        className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3.5" />
                        Inspect
                      </Button>

                      {link(
                        meta.actionText,
                        row.route,
                        row.search,
                        {
                          ...(row.confirmationNumber ? { q: row.confirmationNumber } : {}),
                          ...(row.reservationId ? { reservationId: row.reservationId } : {}),
                          ...(row.roomId ? { room: row.roomId } : {}),
                        },
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <TablePagination
            page={issuePage.page}
            pages={issuePage.pages}
            total={visibleIssues.length}
            onPageChange={setPage}
          />
        </section>
      )}

      {activeTab === "arrivals" && (
        <Section title="Arrivals & No-Shows" state={result.sections.arrivals} count={filteredArrivals.length} totalCount={result.arrivals.length}>
          <SimpleTable
            headers={["Reservation", "Unit", "Guest", "Room", "Room Type", "Due", "Source Status", "State", "Action"]}
            rows={arrivalsPage.rows.map((row) => [
              row.confirmationNumber,
              row.unit ?? "—",
              row.guest,
              row.roomNumber ?? "Unassigned",
              row.roomType ?? "—",
              formatNa1Date(row.arrivalDate),
              row.sourceStatus,
              <Chip key="s" status={row.status} />,
              link("Open Front Office", row.route, row.search, {
                ...(row.confirmationNumber ? { q: row.confirmationNumber } : {}),
                ...(row.reservationId ? { reservationId: row.reservationId } : {}),
              }),
            ])}
            empty={
              result.access === "detail"
                ? "No unresolved arrivals for this business date."
                : `${s.unresolvedArrivalCount} unresolved arrival(s).`
            }
          />
          <TablePagination
            page={arrivalsPage.page}
            pages={arrivalsPage.pages}
            total={filteredArrivals.length}
            onPageChange={setPage}
          />
          <p className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            No-show is never automatic. There is no persisted pending no-show workflow, so no no-show rows are shown.
          </p>
        </Section>
      )}

      {activeTab === "departures" && (
        <Section title="Departures & In-House" state={result.sections.departures} count={filteredDepartures.length} totalCount={result.departures.length}>
          <SimpleTable
            headers={["Reservation", "Unit", "Guest", "Room", "Departure", "Late Checkout", "State", "Issue", "Action"]}
            rows={departuresPage.rows.map((row) => [
              row.confirmationNumber,
              row.unit ?? "—",
              row.guest,
              row.roomNumber ?? "Unassigned",
              formatNa1Date(row.departureDate),
              row.lateCheckoutUntil ?? "—",
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open Front Office", row.route, row.search, {
                ...(row.confirmationNumber ? { q: row.confirmationNumber } : {}),
                ...(row.reservationId ? { reservationId: row.reservationId } : {}),
              }),
            ])}
            empty={
              result.access === "detail"
                ? "No overstays or departures due today."
                : `${s.overstayCount} overstay(s) · ${s.dueTodayCount} due out today.`
            }
          />
          <TablePagination
            page={departuresPage.page}
            pages={departuresPage.pages}
            total={filteredDepartures.length}
            onPageChange={setPage}
          />
          <p className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            In-house: {s.inHouseCount} checked-in room unit(s).
          </p>
        </Section>
      )}

      {activeTab === "rooms" && (
        <Section title="Room Assignment & Occupancy" state={result.sections.rooms} count={filteredRooms.length} totalCount={result.rooms.length}>
          <SimpleTable
            headers={["Room", "Room Type", "Occupied", "Operational", "Housekeeping", "Maintenance", "Sellable", "State", "Issue", "Action"]}
            rows={roomsPage.rows.map((row) => [
              row.roomNumber,
              row.roomType ?? "—",
              row.occupied ? `Yes (${row.occupants})` : "No",
              row.operationalStatus,
              row.housekeepingStatus,
              row.maintenanceStatus ?? "—",
              row.sellable == null ? "—" : row.sellable ? "Yes" : "No",
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open owner module", row.route, row.search, {
                ...(row.roomNumber ? { q: row.roomNumber } : {}),
              }),
            ])}
            empty="No room assignment or occupancy conflicts."
          />
          <TablePagination
            page={roomsPage.page}
            pages={roomsPage.pages}
            total={filteredRooms.length}
            onPageChange={setPage}
          />
          <IssueList
            issues={result.issues.filter(
              (issue) => issue.category === "rooms" && !issue.roomId && rowFilter(issueStatus(issue), "rooms", issue.description),
            )}
            onSelect={setSelectedId}
          />
        </Section>
      )}

      {activeTab === "housekeeping" && (
        <Section title="Housekeeping & Room State" state={result.sections.housekeeping} count={filteredHousekeeping.length} totalCount={result.housekeeping.length}>
          <SimpleTable
            headers={["Room", "Room Type", "Occupied", "Housekeeping", "Readiness", "State", "Issue", "Action"]}
            rows={housekeepingPage.rows.map((row) => [
              row.roomNumber,
              row.roomType ?? "—",
              row.occupied ? "Yes" : "No",
              row.housekeepingStatus,
              row.readiness,
              <Chip key="s" status={row.status} />,
              row.issue,
              link("Open Housekeeping", row.route, row.search, {
                ...(row.roomNumber ? { q: row.roomNumber } : {}),
              }),
            ])}
            empty="No housekeeping items need attention."
          />
          <TablePagination
            page={housekeepingPage.page}
            pages={housekeepingPage.pages}
            total={filteredHousekeeping.length}
            onPageChange={setPage}
          />
        </Section>
      )}

      {activeTab === "overbooking" && (
        <Section title="Overbooking" state={result.sections.overbooking} count={filteredOverbooking.length} totalCount={result.overbooking.length}>
          {result.sections.overbooking === "not_configured" ? (
            <p className="p-4 text-sm text-muted-foreground">Overbooking is not configured for this property.</p>
          ) : (
            <>
              <SimpleTable
                headers={["Date", "Room Type", "Capacity", "Effective Allowance", "Committed", "Excess", "Approval", "State", "Action"]}
                rows={overbookingPage.rows.map((row) => [
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
              <TablePagination
                page={overbookingPage.page}
                pages={overbookingPage.pages}
                total={filteredOverbooking.length}
                onPageChange={setPage}
              />
            </>
          )}
          <p className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            Waitlist: {result.waitlist.state === "not_configured" ? "N/A" : `${result.waitlist.pendingCount} pending`}
            {result.waitlist.anomalyCount > 0 ? ` · ${result.waitlist.anomalyCount} conversion anomaly(ies)` : ""}. Waitlist
            never blocks close and does not consume inventory.
          </p>
        </Section>
      )}

      {activeTab === "distribution" && (
        <Section title="Distribution / Channels" state={result.sections.distribution} count={filteredDistribution.length} totalCount={result.distribution.length}>
          {result.sections.distribution === "na" ? (
            <p className="p-4 text-sm text-muted-foreground">N/A — no channel connection.</p>
          ) : result.sections.distribution === "not_configured" ? (
            <p className="p-4 text-sm text-muted-foreground">Distribution is not configured for this property.</p>
          ) : result.sections.distribution === "unavailable" ? (
            <p className="p-4 text-sm text-muted-foreground">Distribution status is unavailable. It never blocks close.</p>
          ) : (
            <>
              <SimpleTable
                headers={["Source", "Detail", "When", "State", "Action"]}
                rows={distributionPage.rows.map((row) => [
                  row.label,
                  row.detail,
                  row.occurredAt ?? "—",
                  <Chip key="s" status={row.status} />,
                  link("Open Distribution", row.route),
                ])}
                empty="No known failures."
              />
              <TablePagination
                page={distributionPage.page}
                pages={distributionPage.pages}
                total={filteredDistribution.length}
                onPageChange={setPage}
              />
            </>
          )}
        </Section>
      )}

      {activeTab === "revenue" && (
        <Section title="Revenue Readiness" state={result.sections.revenue} count={filteredRevenue.length} totalCount={result.revenueReadiness.length}>
          <SimpleTable
            headers={["Item", "Type", "Date", "Detail", "State", "Action"]}
            rows={revenuePage.rows.map((row) => [
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
          <TablePagination
            page={revenuePage.page}
            pages={revenuePage.pages}
            total={filteredRevenue.length}
            onPageChange={setPage}
          />
        </Section>
      )}

      {activeTab === "services" && (
        <Section title="Service Operations" state={result.sections.services} count={filteredServices.length} totalCount={result.serviceOperations.rows.length}>
          {result.sections.services === "not_configured" ? (
            <p className="p-4 text-sm text-muted-foreground">Service entitlements are not configured.</p>
          ) : (
            <>
              <SimpleTable
                headers={["Room", "Service", "Kind", "Date", "Source Status", "State"]}
                rows={servicesPage.rows.map((row) => [
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
              <TablePagination
                page={servicesPage.page}
                pages={servicesPage.pages}
                total={filteredServices.length}
                onPageChange={setPage}
              />
            </>
          )}
          <p className="border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            Services never block close. Missing service charges are not inferred — there is no canonical service-to-charge link.
          </p>
        </Section>
      )}

      {/* DETAIL INSPECTION DRAWER */}
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
              <Button asChild className="mt-4 w-full" variant="outline">
                <Link
                  to={selected.route as never}
                  search={
                    ({
                      ...(selected.search as Record<string, unknown> ?? {}),
                      ...(selected.confirmationNumber ? { q: selected.confirmationNumber } : {}),
                      ...(selected.reservationId ? { reservationId: selected.reservationId } : {}),
                      ...(selected.roomId ? { room: selected.roomId } : {}),
                      returnTo: "/restaurant/pms/night-audit",
                      returnToLabel: "Return to Night Audit",
                    }) as never
                  }
                  className="gap-1.5"
                >
                  <span>Open {selected.ownerModule}</span>
                  <ExternalLink className="size-3.5" />
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
      <dd className="font-medium text-foreground">{value}</dd>
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
    <ul className="mt-3 space-y-2 border-t border-border/60 p-4">
      {issues.slice(0, NIGHT_AUDIT_PAGE_SIZE).map((issue) => (
        <li key={issue.id} className="rounded-lg border border-border px-3 py-2 text-xs">
          <button type="button" className="font-medium text-[#251605] dark:text-stone-200 hover:underline" onClick={() => onSelect(issue.id)}>
            {issue.title}
          </button>
          <span className="ml-2">
            <Chip status={issueStatus(issue)} />
          </span>
          <p className="mt-0.5 text-muted-foreground">{issue.description}</p>
        </li>
      ))}
    </ul>
  );
}

function Kpi({
  label,
  value,
  tone,
  subtext,
  onClick,
}: {
  label: string;
  value: string;
  tone: string;
  subtext?: string;
  onClick?: () => void;
}) {
  const isClickable = Boolean(onClick);
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (isClickable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "rounded-xl border border-border/70 bg-card p-3 shadow-2xs transition-all",
        isClickable && "cursor-pointer hover:border-primary/40 hover:bg-muted/30 focus:outline-hidden",
      )}
      data-testid="night-audit-operations-status"
    >
      <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-bold",
          tone === "blocked" ? "text-red-700" : tone === "warning" ? "text-amber-800" : tone === "ready" ? "text-emerald-700" : "text-foreground",
        )}
      >
        {value}
      </p>
      {subtext ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  badgeTone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
  badgeTone?: "red" | "amber" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus:outline-hidden",
        active
          ? "bg-foreground text-background shadow-xs font-semibold"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
      {count != null && count > 0 ? (
        <span
          className={cn(
            "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold leading-none",
            active
              ? "bg-background/20 text-background"
              : badgeTone === "red"
                ? "bg-red-100 text-red-800"
                : badgeTone === "amber"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Section({
  title,
  state,
  count,
  totalCount,
  children,
}: {
  title: string;
  state: OperationalSectionState;
  count?: number;
  totalCount?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge(state)}`}>
            {operationalSectionLabel(state)}
          </span>
          {count != null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {totalCount != null && totalCount !== count ? `${count} of ${totalCount}` : count}
            </span>
          ) : null}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function link(
  label: string,
  route: string,
  search?: Record<string, string>,
  extra?: Record<string, string | undefined>,
) {
  const filteredExtra: Record<string, string> = {};
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== "") {
        filteredExtra[k] = v;
      }
    }
  }
  const enrichedSearch = {
    ...(search ?? {}),
    ...filteredExtra,
    returnTo: "/restaurant/pms/night-audit",
    returnToLabel: "Return to Night Audit",
  };
  return (
    <Link
      to={route as never}
      search={enrichedSearch as never}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 transition-all"
    >
      <span>{label}</span>
      <ArrowRight className="size-3" />
    </Link>
  );
}

function TablePagination({
  page,
  pages,
  total,
  pageSize = NIGHT_AUDIT_PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageChange: (next: number) => void;
}) {
  if (total === 0) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of <span className="font-semibold text-foreground">{total}</span> records
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 px-2.5 text-xs"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
              className="h-7 px-2.5 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
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
  if (rows.length === 0) return <p className="p-4 text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2.5 align-middle">
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
