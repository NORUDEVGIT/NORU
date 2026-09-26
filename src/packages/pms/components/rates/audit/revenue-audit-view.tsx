import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Filter, Info, Search, ShieldCheck } from "lucide-react";

import { getUnifiedRevenueAudit } from "@/packages/pms/lib/revenue/revenue-audit.functions";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import {
  serializeRevenueSearch,
  type RevenueAuditTab,
  type RevenueContext,
} from "@/packages/pms/lib/revenue/revenue-context";
import type {
  UnifiedRevenueAuditDomain,
  UnifiedRevenueAuditEntry,
} from "@/packages/pms/lib/revenue/revenue-audit";
import { RevenueAuditDetailDrawer } from "./revenue-audit-detail-drawer";

const VALID_AUDIT_TABS: RevenueAuditTab[] = ["history", "rates", "restrictions", "overrides"];

function parseAuditTab(tab?: string): RevenueAuditTab {
  if (tab && VALID_AUDIT_TABS.includes(tab as RevenueAuditTab)) {
    return tab as RevenueAuditTab;
  }
  return "history";
}

function formatAuditTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function DomainChip({ domain }: { domain: UnifiedRevenueAuditDomain }) {
  const styles: Record<UnifiedRevenueAuditDomain, string> = {
    rates: "border-blue-200 bg-blue-50 text-blue-800",
    restrictions: "border-amber-200 bg-amber-50 text-amber-800",
    commercial: "border-emerald-200 bg-emerald-50 text-emerald-800",
    approvals: "border-purple-200 bg-purple-50 text-purple-800",
  };

  const labels: Record<UnifiedRevenueAuditDomain, string> = {
    rates: "Rates",
    restrictions: "Restrictions",
    commercial: "Commercial",
    approvals: "Approvals",
  };

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        styles[domain] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {labels[domain] ?? domain}
    </span>
  );
}

export function RevenueAuditView({
  restaurantId,
  context,
  access,
  auditTab,
  auditEvent,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  auditTab?: string;
  auditEvent?: string;
}) {
  const navigate = useNavigate();
  const fetchAudit = useServerFn(getUnifiedRevenueAudit);

  const activeTab = parseAuditTab(auditTab);

  // Pagination & filter local state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<UnifiedRevenueAuditEntry | null>(null);

  // Map activeTab to domain parameter for server query
  // P8-STEP-03 Amendment 1: "overrides" domain is passed directly to server for UI-39
  const queryDomain: UnifiedRevenueAuditDomain | "all" | "overrides" =
    activeTab === "rates"
      ? "rates"
      : activeTab === "restrictions"
        ? "restrictions"
        : activeTab === "overrides"
          ? "overrides"
          : "all";

  const setTab = useCallback(
    (tab: RevenueAuditTab) => {
      setPage(1);
      navigate({
        to: "/restaurant/pms/rates-revenue",
        search: serializeRevenueSearch("audit-control", context, {
          auditTab: tab,
        }),
      });
    },
    [navigate, context],
  );

  const openDetail = useCallback(
    (entry: UnifiedRevenueAuditEntry) => {
      setSelectedEntry(entry);
      navigate({
        to: "/restaurant/pms/rates-revenue",
        search: serializeRevenueSearch("audit-control", context, {
          auditTab: activeTab,
          auditEvent: entry.id,
        }),
      });
    },
    [navigate, context, activeTab],
  );

  const closeDetail = useCallback(() => {
    setSelectedEntry(null);
    navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("audit-control", context, {
        auditTab: activeTab,
      }),
    });
  }, [navigate, context, activeTab]);

  const query = useQuery({
    queryKey: [
      "unified-revenue-audit",
      restaurantId,
      context.fromDate,
      context.toDate,
      queryDomain,
      search,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchAudit({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          domain: queryDomain,
          search: search.trim() || null,
          page,
          pageSize,
        },
      }),
  });

  return (
    <div className="space-y-4">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Audit & Control
          </h2>
          <p className="text-xs text-muted-foreground">
            Authoritative operational audit logging across Rates, Restrictions, Commercial changes,
            and Approvals.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap rounded-md border border-[#E8E1D7] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "history"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Control History (UI-36)
          </button>
          <button
            type="button"
            onClick={() => setTab("rates")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "rates"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Rate Audit (UI-37)
          </button>
          <button
            type="button"
            onClick={() => setTab("restrictions")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "restrictions"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Restriction Audit (UI-38)
          </button>
          <button
            type="button"
            onClick={() => setTab("overrides")}
            className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
              activeTab === "overrides"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Override Audit (UI-39)
          </button>
        </div>
      </div>

      {/* Override Audit Note for UI-39 */}
      {activeTab === "overrides" && (
        <div className="flex items-start gap-2 rounded-lg border border-[#E8E1D7] bg-card px-3.5 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Only override types recorded by current operational event history are shown. Approvals
            are included only when they structurally represent rate overrides or commercial
            exceptions.
          </span>
        </div>
      )}

      {/* Server Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 min-w-[200px] max-w-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by action, reason, or actor..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-[#E8E1D7] bg-white px-2 py-1 text-xs text-foreground"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div>
            Total:{" "}
            <span className="font-mono font-medium text-foreground">{query.data?.total ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Master Audit Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        {query.isLoading ? (
          <div className="p-8 space-y-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-8 text-center text-xs text-destructive">
            Unable to load audit trail. Please check your permissions or filters.
          </div>
        ) : query.data?.entries.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            No revenue-control history matches the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Timestamp</th>
                  <th className="px-3 py-2.5">Domain</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Entity / Scope</th>
                  <th className="px-3 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Reason / Note</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {query.data?.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => openDetail(entry)}
                    className="cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatAuditTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <DomainChip domain={entry.domain} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-medium text-foreground whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs truncate">
                      <div className="font-medium text-foreground truncate">
                        {entry.entityLabel}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {entry.scopeLabel}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                      {entry.actorLabel}
                    </td>
                    <td className="px-3 py-2.5 max-w-sm truncate text-muted-foreground italic">
                      {entry.reason || "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      {entry.operationId
                        ? entry.operationId.substring(0, 8)
                        : entry.id.substring(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server Pagination */}
        {query.data && query.data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E8E1D7] px-4 py-2.5 text-xs text-muted-foreground">
            <div>
              Page {query.data.page} of {query.data.totalPages} ({query.data.total} records)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={query.data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-7 items-center rounded border border-[#E8E1D7] px-2 text-xs font-medium hover:bg-muted/30 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <button
                type="button"
                disabled={query.data.page >= query.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex h-7 items-center rounded border border-[#E8E1D7] px-2 text-xs font-medium hover:bg-muted/30 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contextual Detail Drawer */}
      <RevenueAuditDetailDrawer
        restaurantId={restaurantId}
        entry={selectedEntry}
        open={Boolean(selectedEntry || auditEvent)}
        onClose={closeDetail}
      />
    </div>
  );
}
