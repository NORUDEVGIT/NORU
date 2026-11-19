import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRateRevenueExtras } from "../rate-revenue-shell-slots";

import {
  getUnifiedAuditEventById,
  getUnifiedRevenueAudit,
} from "@/packages/pms/lib/revenue/revenue-audit.functions";
import { listRevenueApprovalActorsFn } from "@/packages/pms/lib/revenue/revenue-approval.functions";
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

const AUDIT_TAB_OPTIONS: ReadonlyArray<readonly [RevenueAuditTab, string]> = [
  ["history", "Control History"],
  ["rates", "Rate Audit"],
  ["restrictions", "Restriction Audit"],
  ["overrides", "Override Audit"],
];

const AUDIT_ACTION_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["all", "All Actions"],
  ["rate_change", "Rate Change"],
  ["manual_override", "Manual Override"],
  ["revert_override", "Revert Override"],
  ["single_restriction_change", "Restriction Change"],
  ["bulk_restriction_change", "Bulk Restriction"],
  ["activated", "Commercial Activated"],
  ["deactivated", "Commercial Deactivated"],
  ["approved", "Approval Approved"],
  ["rejected", "Approval Rejected"],
  ["applied", "Approval Applied"],
];

const AUDIT_SEARCH_PLACEHOLDER = "Search action, entity, scope, reason, or reference...";

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
    rates: "border-[#D3C7B5] bg-[#F7F4EE] text-[#4A3B2C]",
    restrictions: "border-[#E5C98F] bg-[#FAF4E6] text-[#7A5418]",
    commercial: "border-[#C2D8C7] bg-[#F0F6F2] text-[#2D5A3A]",
    approvals: "border-[#D8CFE5] bg-[#F6F4FA] text-[#523F73]",
  };

  const labels: Record<UnifiedRevenueAuditDomain, string> = {
    rates: "Rates",
    restrictions: "Restrictions",
    commercial: "Commercial",
    approvals: "Approvals",
  };

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${styles[domain] ?? "border-border bg-muted text-muted-foreground"
        }`}
    >
      {labels[domain] ?? domain}
    </span>
  );
}

export function RevenueAuditView({
  restaurantId,
  context,
  access: _access,
  auditTab,
  auditEvent,
  auditAction,
  auditActor,
  auditSearch,
  searchQuery = "",
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  auditTab?: string | undefined;
  auditEvent?: string | undefined;
  auditAction?: string | undefined;
  auditActor?: string | undefined;
  auditSearch?: string | undefined;
  searchQuery?: string;
}) {
  const navigate = useNavigate();
  const fetchAudit = useServerFn(getUnifiedRevenueAudit);
  const fetchEventById = useServerFn(getUnifiedAuditEventById);
  const fetchActors = useServerFn(listRevenueApprovalActorsFn);

  const activeTab = parseAuditTab(auditTab);

  // Pagination & filter state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedEntry, setSelectedEntry] = useState<UnifiedRevenueAuditEntry | null>(null);

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

  useEffect(() => {
    const next = searchQuery.trim();
    if (next === (auditSearch || "")) return;
    const timer = window.setTimeout(() => handleSearchSubmit(searchQuery), 300);
    return () => window.clearTimeout(timer);
    // The toolbar search is owned by the workspace; this only publishes it to the audit URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, auditSearch]);

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

  useRateRevenueExtras({
    searchPlaceholder: AUDIT_SEARCH_PLACEHOLDER,
    filters: [
      {
        id: "audit-view",
        label: "Audit",
        value: activeTab,
        current: AUDIT_TAB_OPTIONS.find(([id]) => id === activeTab)?.[1] ?? "",
        options: AUDIT_TAB_OPTIONS,
        onChange: (value) => setTab(value as RevenueAuditTab),
      },
      {
        id: "audit-action",
        label: "Action",
        value: auditAction || "all",
        current: AUDIT_ACTION_OPTIONS.find(([id]) => id === auditAction)?.[1] ?? "",
        options: AUDIT_ACTION_OPTIONS,
        onChange: (value) => handleActionChange(value === "all" ? "" : value),
      },
      {
        id: "audit-actor",
        label: "Actor",
        value: auditActor || "all",
        current: actors.find((actor) => actor.id === auditActor)?.label ?? "",
        options: [
          ["all", "All Actors"] as const,
          ...actors.map((actor) => [actor.id, actor.label] as const),
        ],
        onChange: (value) => handleActorChange(value === "all" ? "" : value),
      },
    ],
    actions: [],
    onClear: () => {
      setPage(1);
      void navigate({
        to: "/restaurant/pms/rates-revenue",
        search: serializeRevenueSearch("audit-control", context, { auditTab: "history" }),
      });
    },
  });

  return (
    <div className="space-y-3">
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
        {query.data ? (
          <div className="flex items-center justify-between border-t border-[#E8E1D7] px-4 py-2.5 text-xs text-muted-foreground">
            <div>
              Page {query.data.page} of {query.data.totalPages} ({query.data.total} records)
            </div>
            <div className="flex items-center gap-1">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="mr-2 h-7 rounded border border-[#E8E1D7] bg-white px-2 text-xs text-foreground"
                aria-label="Rows per page"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
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
        ) : null}
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
