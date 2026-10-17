import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  getUnifiedAuditEventById,
  getUnifiedRevenueAudit,
} from "@/packages/pms/lib/revenue/revenue-audit.functions";
import { listRevenueApprovalActorsFn } from "@/packages/pms/lib/revenue/revenue-approval.functions";
import { exportUnifiedRevenueAuditCsv } from "@/packages/pms/lib/revenue/revenue-export.functions";
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

function downloadCsvBlob(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function DomainChip({ domain }: { domain: UnifiedRevenueAuditDomain }) {
  const styles: Record<UnifiedRevenueAuditDomain, string> = {
    rates: "border-amber-200/70 bg-amber-50/80 text-amber-900",
    restrictions: "border-rose-200/70 bg-rose-50/80 text-rose-900",
    commercial: "border-emerald-200/70 bg-emerald-50/80 text-emerald-900",
    approvals: "border-purple-200/70 bg-purple-50/80 text-purple-900",
  };

  const labels: Record<UnifiedRevenueAuditDomain, string> = {
    rates: "Rates",
    restrictions: "Restrictions",
    commercial: "Commercial",
    approvals: "Approvals",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        styles[domain] ?? "border-[#E8E1D7] bg-[#FAF8F4] text-[#756A5B]"
      }`}
    >
      {labels[domain] ?? domain}
    </span>
  );
}

const ACTION_LABELS: Record<string, string> = {
  rate_change: "Rate Change",
  manual_override: "Manual Override",
  revert_override: "Revert Override",
  single_restriction_change: "Restriction Change",
  bulk_restriction_change: "Bulk Restriction",
  activated: "Activated",
  deactivated: "Deactivated",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
};

export function RevenueAuditView({
  restaurantId,
  context,
  access: _access,
  auditTab,
  auditEvent,
  auditAction,
  auditActor,
  auditSearch,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  auditTab?: string | undefined;
  auditEvent?: string | undefined;
  auditAction?: string | undefined;
  auditActor?: string | undefined;
  auditSearch?: string | undefined;
}) {
  const navigate = useNavigate();
  const fetchAudit = useServerFn(getUnifiedRevenueAudit);
  const fetchEventById = useServerFn(getUnifiedAuditEventById);
  const fetchActors = useServerFn(listRevenueApprovalActorsFn);
  const exportAuditFn = useServerFn(exportUnifiedRevenueAuditCsv);

  const activeTab = parseAuditTab(auditTab);

  // Pagination, filter & export state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState(auditSearch || "");
  const [selectedEntry, setSelectedEntry] = useState<UnifiedRevenueAuditEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Keep search input in sync if URL changes externally
  useEffect(() => {
    setSearchInput(auditSearch || "");
  }, [auditSearch]);

  // Load staff actors for dedicated Authoritative Actor filter (UI-36)
  const actorsQuery = useQuery({
    queryKey: ["revenue-approval-actors", restaurantId],
    queryFn: () => fetchActors({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const actors = actorsQuery.data ?? [];

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
          auditAction: auditAction || undefined,
          auditActor: auditActor || undefined,
          auditSearch: auditSearch || undefined,
        }),
      });
    },
    [navigate, context, auditAction, auditActor, auditSearch],
  );

  const handleActionChange = (newAction: string) => {
    setPage(1);
    navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("audit-control", context, {
        auditTab: activeTab,
        auditAction: newAction || undefined,
        auditActor: auditActor || undefined,
        auditSearch: auditSearch || undefined,
        auditEvent,
      }),
    });
  };

  const handleActorChange = (newActor: string) => {
    setPage(1);
    navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("audit-control", context, {
        auditTab: activeTab,
        auditAction: auditAction || undefined,
        auditActor: newActor || undefined,
        auditSearch: auditSearch || undefined,
        auditEvent,
      }),
    });
  };

  const handleSearchSubmit = (val: string) => {
    setPage(1);
    navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("audit-control", context, {
        auditTab: activeTab,
        auditAction: auditAction || undefined,
        auditActor: auditActor || undefined,
        auditSearch: val.trim() || undefined,
        auditEvent,
      }),
    });
  };

  const openDetail = useCallback(
    (entry: UnifiedRevenueAuditEntry) => {
      setSelectedEntry(entry);
      navigate({
        to: "/restaurant/pms/rates-revenue",
        search: serializeRevenueSearch("audit-control", context, {
          auditTab: activeTab,
          auditAction: auditAction || undefined,
          auditActor: auditActor || undefined,
          auditSearch: auditSearch || undefined,
          auditEvent: entry.id,
        }),
      });
    },
    [navigate, context, activeTab, auditAction, auditActor, auditSearch],
  );

  const closeDetail = useCallback(() => {
    setSelectedEntry(null);
    navigate({
      to: "/restaurant/pms/rates-revenue",
      search: serializeRevenueSearch("audit-control", context, {
        auditTab: activeTab,
        auditAction: auditAction || undefined,
        auditActor: auditActor || undefined,
        auditSearch: auditSearch || undefined,
        // auditEvent is intentionally omitted to clear drawer deep link
      }),
    });
  }, [navigate, context, activeTab, auditAction, auditActor, auditSearch]);

  // Main Audit stream query
  const query = useQuery({
    queryKey: [
      "unified-revenue-audit",
      restaurantId,
      context.fromDate,
      context.toDate,
      queryDomain,
      auditAction,
      auditActor,
      auditSearch,
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
          action: auditAction || null,
          actorMembershipId: auditActor || null,
          search: auditSearch?.trim() || null,
          page,
          pageSize,
        },
      }),
  });

  // Dedicated server-backed audit-event lookup for URL deep link / reload hydration
  const eventLookupQuery = useQuery({
    queryKey: ["unified-revenue-audit-event", restaurantId, auditEvent],
    queryFn: () => fetchEventById({ data: { restaurantId, eventId: auditEvent! } }),
    enabled: Boolean(auditEvent && selectedEntry?.id !== auditEvent),
  });

  // Hydrate selectedEntry when auditEvent URL parameter exists
  useEffect(() => {
    if (!auditEvent) {
      if (selectedEntry) setSelectedEntry(null);
      return;
    }
    if (selectedEntry?.id === auditEvent) return;

    // 1. Locate matching entry from currently loaded audit result if present
    const loadedMatch = query.data?.entries.find((e) => e.id === auditEvent);
    if (loadedMatch) {
      setSelectedEntry(loadedMatch);
      return;
    }

    // 2. Hydrate from dedicated server-backed event lookup
    if (eventLookupQuery.data && eventLookupQuery.data.id === auditEvent) {
      setSelectedEntry(eventLookupQuery.data);
    }
  }, [auditEvent, query.data?.entries, eventLookupQuery.data, selectedEntry]);

  // Export audit CSV handler
  async function handleExportAudit() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const res = await exportAuditFn({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          domain: queryDomain,
          action: auditAction || null,
          actorMembershipId: auditActor || null,
          search: auditSearch?.trim() || null,
        },
      });
      downloadCsvBlob(res.csv, res.filename);
      toast.success(`Exported ${res.filename} (${res.rowCount} records)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#251605]">
            Audit & Control
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportAudit}
            disabled={isExporting}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-semibold text-[#251605] shadow-2xs hover:bg-[#FAF8F4] transition-colors disabled:opacity-50"
            title="Export filtered audit trail to CSV"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C89933]" />
            ) : (
              <Download className="h-3.5 w-3.5 text-[#C89933]" />
            )}
            <span>Export CSV</span>
          </button>

          {/* Sub-Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-1">
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Control History
            </button>
            <button
              type="button"
              onClick={() => setTab("rates")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === "rates"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Rate Audit
            </button>
            <button
              type="button"
              onClick={() => setTab("restrictions")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === "restrictions"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Restriction Audit
            </button>
            <button
              type="button"
              onClick={() => setTab("overrides")}
              className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === "overrides"
                  ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                  : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
              }`}
            >
              Override Audit
            </button>
          </div>
        </div>
      </div>

      {/* Override Audit Note for UI-39 */}
      {activeTab === "overrides" && (
        <div className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3.5 py-2 text-xs text-[#756A5B]">
          <Info className="h-4 w-4 shrink-0 text-[#C89933]" />
          <span>Showing operational rate overrides and commercial exception logs.</span>
        </div>
      )}

      {/* Modern Filter Toolbar: Search | Action | Actor | Page Size & Total */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E1D7] bg-white p-3 shadow-2xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[200px]">
          {/* Search Input */}
          <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-sm rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/50 px-3 py-1.5 focus-within:border-[#C89933] focus-within:bg-white transition-colors">
            <Search className="h-3.5 w-3.5 text-[#756A5B] shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchSubmit(searchInput);
              }}
              onBlur={() => {
                if (searchInput !== (auditSearch || "")) handleSearchSubmit(searchInput);
              }}
              placeholder="Search action, entity, scope, reason, or reference..."
              className="w-full bg-transparent text-xs text-[#251605] placeholder:text-[#756A5B]/70 focus:outline-none"
            />
          </div>

          {/* Action Filter */}
          <div className="flex items-center">
            <select
              value={auditAction || ""}
              onChange={(e) => handleActionChange(e.target.value)}
              className="h-8 rounded-lg border border-[#E8E1D7] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933]/60 focus:outline-none"
            >
              <option value="">All Actions</option>
              <option value="rate_change">Rate Change</option>
              <option value="manual_override">Manual Override</option>
              <option value="revert_override">Revert Override</option>
              <option value="single_restriction_change">Restriction Change</option>
              <option value="bulk_restriction_change">Bulk Restriction</option>
              <option value="activated">Commercial Activated</option>
              <option value="deactivated">Commercial Deactivated</option>
              <option value="approved">Approval Approved</option>
              <option value="rejected">Approval Rejected</option>
              <option value="applied">Approval Applied</option>
            </select>
          </div>

          {/* Actor Filter */}
          <div className="flex items-center">
            <select
              value={auditActor || ""}
              onChange={(e) => handleActorChange(e.target.value)}
              className="h-8 rounded-lg border border-[#E8E1D7] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933]/60 focus:outline-none"
            >
              <option value="">All Actors</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rows & Total Counter */}
        <div className="flex items-center gap-3 text-xs text-[#756A5B]">
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded-lg border border-[#E8E1D7] bg-white px-2 text-xs font-medium text-[#251605] focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span>Total:</span>
            <span className="font-mono font-semibold text-[#251605] bg-[#FAF8F4] border border-[#E8E1D7] px-2 py-0.5 rounded-md">
              {query.data?.total ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Master Audit Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs overflow-hidden">
        {query.isLoading ? (
          <div className="p-8 space-y-2.5" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-[#FAF8F4]" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-8 text-center text-xs text-destructive">
            Unable to load audit trail. Please check your permissions or filters.
          </div>
        ) : query.data?.entries.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#756A5B]">
            No revenue-control history matches the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Timestamp</th>
                  <th className="px-3 py-3">Domain</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Entity / Scope</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Reason / Note</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pl-3 pr-4 text-right">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {query.data?.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => openDetail(entry)}
                    className="cursor-pointer hover:bg-[#FAF8F4]/80 transition-colors"
                  >
                    <td className="py-3 pl-4 pr-3 font-mono text-xs text-[#251605] whitespace-nowrap">
                      {formatAuditTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <DomainChip domain={entry.domain} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-[#251605] whitespace-nowrap">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <div className="font-medium text-sm text-[#251605] truncate">
                        {entry.entityLabel}
                      </div>
                      <div className="text-[11px] text-[#756A5B] truncate mt-0.5">
                        {entry.scopeLabel}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FAF8F4] border border-[#E8E1D7] font-semibold text-[10px] text-[#251605]">
                          {entry.actorLabel.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-sm text-[#251605]">{entry.actorLabel}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-sm truncate text-[#756A5B] italic text-xs">
                      {entry.reason || "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md border border-[#E8E1D7] bg-[#FAF8F4] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#251605]">
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-mono text-xs text-[#756A5B] whitespace-nowrap">
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
          <div className="flex items-center justify-between border-t border-[#E8E1D7] bg-[#FAF8F4]/50 px-4 py-3 text-xs text-[#756A5B]">
            <div>
              Page <span className="font-semibold text-[#251605]">{query.data.page}</span> of{" "}
              <span className="font-semibold text-[#251605]">{query.data.totalPages}</span> (
              {query.data.total} records)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={query.data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E8E1D7] bg-white px-2.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4] disabled:opacity-40 shadow-2xs transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <button
                type="button"
                disabled={query.data.page >= query.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E8E1D7] bg-white px-2.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4] disabled:opacity-40 shadow-2xs transition-colors"
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
