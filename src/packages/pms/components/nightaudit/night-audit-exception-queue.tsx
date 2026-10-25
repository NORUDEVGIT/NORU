import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Filter,
  Globe,
  History,
  Layers,
  LogIn,
  LogOut,
  Receipt,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Utensils,
  Vault,
} from "lucide-react";

import { formatNa1Date } from "@/packages/pms/lib/na1";
import { NIGHT_AUDIT_TAB_COPY, paginateRows } from "@/packages/pms/lib/night-audit-shell";
import {
  DEFAULT_EXCEPTION_FILTER,
  EXCEPTION_CATEGORY_LABEL,
  FINANCIAL_EXCEPTION_CATEGORIES,
  OPERATIONS_EXCEPTION_CATEGORIES,
  exceptionCounts,
  exceptionDefaultSource,
  exceptionFilterForFocus,
  exceptionMeta,
  exceptionStatusLabel,
  filterExceptions,
  FISCAL_OVERRIDE_REASON_CATEGORIES,
  isFiscalOverrideableException,
  type ExceptionFilter,
} from "@/packages/pms/lib/night-audit-workflow";
import type { AuditException } from "@/packages/pms/lib/nightaudit.functions";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

function Kpi({
  label,
  value,
  tone,
  subtext,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "slate" | "green";
  subtext?: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const toneConfig = {
    red: {
      text: "text-red-700",
      bg: "bg-red-50/70 border-red-200/70",
      iconColor: "text-red-600",
    },
    amber: {
      text: "text-amber-800",
      bg: "bg-amber-50/70 border-amber-200/70",
      iconColor: "text-amber-600",
    },
    slate: {
      text: "text-foreground",
      bg: "bg-card border-border/70",
      iconColor: "text-muted-foreground",
    },
    green: {
      text: "text-emerald-700",
      bg: "bg-emerald-50/70 border-emerald-200/70",
      iconColor: "text-emerald-600",
    },
  }[tone];

  const isClickable = Boolean(onClick);

  return (
    <article
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
        "relative rounded-2xl border p-4 shadow-2xs transition-all",
        toneConfig.bg,
        isClickable && "cursor-pointer hover:border-primary/40 hover:shadow-xs focus:outline-hidden",
        active && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">{label}</p>
        {icon ? <span className={cn("size-4 shrink-0", toneConfig.iconColor)}>{icon}</span> : null}
      </div>
      <p className={cn("mt-1.5 font-display text-2xl font-bold tracking-tight", toneConfig.text)}>{value}</p>
      {subtext ? <p className="mt-1 truncate text-xs text-muted-foreground">{subtext}</p> : null}
    </article>
  );
}

export function NightAuditExceptionQueue({
  exceptions,
  businessDate,
  checkedAt,
  runClosed,
  focus,
  moduleSearch,
  dateTime,
  role,
  authorizingFiscalOverride,
  onAuthorizeFiscalOverride,
}: {
  exceptions: AuditException[];
  businessDate: string;
  checkedAt: string | null;
  runClosed: boolean;
  focus?: string | undefined;
  moduleSearch: string;
  dateTime: (value: string) => string;
  role: string;
  authorizingFiscalOverride: boolean;
  onAuthorizeFiscalOverride: (
    exceptionId: string,
    reason: string,
    reasonCategory?: (typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number],
  ) => void;
}) {
  const [filter, setFilter] = useState<ExceptionFilter>(() => exceptionFilterForFocus(focus));
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setFilter(exceptionFilterForFocus(focus)), [focus]);
  useEffect(() => setPage(1), [filter, moduleSearch]);

  const counts = exceptionCounts(exceptions);
  const rows = useMemo(
    () => filterExceptions(exceptions, { ...filter, search: `${filter.search} ${moduleSearch}`.trim() }),
    [exceptions, filter, moduleSearch],
  );
  const current = paginateRows(rows, page);
  const selected = exceptions.find((row) => row.id === selectedId) ?? null;
  const categories =
    filter.domain === "financial"
      ? FINANCIAL_EXCEPTION_CATEGORIES
      : filter.domain === "operations"
        ? OPERATIONS_EXCEPTION_CATEGORIES
        : [...FINANCIAL_EXCEPTION_CATEGORIES, ...OPERATIONS_EXCEPTION_CATEGORIES];
  const set = (patch: Partial<ExceptionFilter>) => setFilter((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4" data-testid="night-audit-exceptions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY.exceptions}</p>
        <span className="text-xs text-muted-foreground">
          Snapshot as of <span className="font-medium text-foreground">{checkedAt ? dateTime(checkedAt) : "today"}</span>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="night-audit-exception-kpis">
        <Kpi
          label="Blocking"
          value={counts.blocking}
          tone={counts.blocking > 0 ? "red" : "green"}
          subtext={counts.blocking > 0 ? "Hard date roll blockers" : "No active blockers"}
          icon={<ShieldAlert className="size-4" />}
          active={filter.severity === "blocking" && filter.status === "open"}
          onClick={() => {
            if (filter.severity === "blocking" && filter.status === "open") {
              setFilter(DEFAULT_EXCEPTION_FILTER);
            } else {
              set({ severity: "blocking", status: "open" });
            }
          }}
        />
        <Kpi
          label="Warnings"
          value={counts.warnings}
          tone={counts.warnings > 0 ? "amber" : "green"}
          subtext={counts.warnings > 0 ? "Review before sign-off" : "No open warnings"}
          icon={<AlertTriangle className="size-4" />}
          active={filter.severity === "warning" && filter.status === "open"}
          onClick={() => {
            if (filter.severity === "warning" && filter.status === "open") {
              setFilter(DEFAULT_EXCEPTION_FILTER);
            } else {
              set({ severity: "warning", status: "open" });
            }
          }}
        />
        <Kpi
          label="Open"
          value={counts.open}
          tone="slate"
          subtext="Requires attention"
          icon={<Clock className="size-4" />}
          active={filter.status === "open" && filter.severity === "all"}
          onClick={() => {
            if (filter.status === "open" && filter.severity === "all") {
              setFilter(DEFAULT_EXCEPTION_FILTER);
            } else {
              set({ status: "open", severity: "all" });
            }
          }}
        />
        <Kpi
          label="Resolved"
          value={counts.resolved}
          tone="green"
          subtext="Auto-cleared this run"
          icon={<CheckCircle2 className="size-4" />}
          active={filter.status === "resolved"}
          onClick={() => {
            if (filter.status === "resolved") {
              setFilter(DEFAULT_EXCEPTION_FILTER);
            } else {
              set({ status: "resolved", severity: "all" });
            }
          }}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border/70 bg-muted/20 p-3 sm:px-4">
          <div className="relative min-w-44 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter.search}
              onChange={(event) => set({ search: event.target.value })}
              placeholder="Search exceptions…"
              aria-label="Search exceptions"
              className="h-8.5 w-full rounded-lg border border-input bg-card pl-8 pr-2.5 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <Select
            value={filter.status}
            onValueChange={(val) => set({ status: val as ExceptionFilter["status"] })}
          >
            <SelectTrigger
              aria-label="Status"
              className="h-8.5 w-[130px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filter.severity}
            onValueChange={(val) => set({ severity: val as ExceptionFilter["severity"] })}
          >
            <SelectTrigger
              aria-label="Severity"
              className="h-8.5 w-[135px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
            >
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="blocking">Blocker</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filter.domain}
            onValueChange={(val) => set({ domain: val as ExceptionFilter["domain"], category: "all" })}
          >
            <SelectTrigger
              aria-label="Domain"
              className="h-8.5 w-[135px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
            >
              <SelectValue placeholder="All domains" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All domains</SelectItem>
              <SelectItem value="financial">Financial</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filter.category}
            onValueChange={(val) => set({ category: val as ExceptionFilter["category"] })}
          >
            <SelectTrigger
              aria-label="Category"
              className="h-8.5 w-[160px] rounded-lg border border-input bg-card px-2.5 text-xs font-medium shadow-2xs hover:bg-muted/40 transition-colors focus:ring-1 focus:ring-primary"
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {EXCEPTION_CATEGORY_LABEL[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFilter(DEFAULT_EXCEPTION_FILTER)}
            className="h-8.5 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Clear
          </Button>
        </div>

        {exceptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center" data-testid="night-audit-exceptions-none">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">Clean Exception Ledger</p>
            <p className="mt-1 text-xs text-muted-foreground">No issues recorded for this business date.</p>
          </div>
        ) : current.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Filter className="size-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">No Matching Exceptions</p>
            <p className="mt-1 text-xs text-muted-foreground">No exceptions match your active search or filter combination.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilter(DEFAULT_EXCEPTION_FILTER)}
              className="mt-3 h-8 text-xs font-medium"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-border/70 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Severity</th>
                  <th className="px-3.5 py-2.5 font-medium">Category</th>
                  <th className="px-3.5 py-2.5 font-medium">Issue</th>
                  <th className="px-3.5 py-2.5 font-medium">Source</th>
                  <th className="px-3.5 py-2.5 font-medium">Reference</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                  <th className="px-3.5 py-2.5 font-medium">Opened</th>
                  <th className="px-3.5 py-2.5 font-medium">Last checked</th>
                  <th className="px-3.5 py-2.5 font-medium">Resolved at</th>
                  <th className="px-3.5 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {current.rows.map((row) => {
                  const meta = exceptionMeta(row.exceptionType);
                  const destMeta = getExceptionDestinationMeta(row, businessDate);
                  const DestIcon = destMeta.icon;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/30",
                        selectedId === row.id && "bg-primary/5 ring-1 ring-inset ring-primary/20",
                      )}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3.5 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                            row.severity === "blocking"
                              ? "border-red-200/80 bg-red-50 text-red-800"
                              : "border-amber-200/80 bg-amber-50 text-amber-900",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              row.severity === "blocking" ? "bg-red-500" : "bg-amber-500",
                            )}
                          />
                          {row.fiscalOverride ? "Fiscal override" : row.severity === "blocking" ? "Blocker" : "Warning"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 align-middle text-muted-foreground">
                        <div className="font-medium text-foreground">{meta.categoryLabel}</div>
                        <div className="text-[11px] capitalize text-muted-foreground">{meta.domain}</div>
                      </td>
                      <td className="max-w-[340px] px-3.5 py-3 align-middle">
                        <span className="font-medium text-foreground">{meta.title}</span>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.message}</p>
                      </td>
                      <td className="px-3.5 py-3 align-middle">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-stone-100/80 dark:bg-stone-800/80 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:text-stone-200">
                          <DestIcon className="size-3 text-primary shrink-0" />
                          <span className="truncate max-w-[200px]">{destMeta.destination}</span>
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-[11px] text-muted-foreground align-middle">
                        {row.referenceType ? `${row.referenceType.replaceAll("_", " ")}` : "—"}
                      </td>
                      <td className="px-3.5 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            row.fiscalOverride
                              ? "bg-amber-100 text-amber-950"
                              : row.status === "open"
                              ? "bg-amber-100/80 text-amber-950"
                              : row.status === "resolved"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.fiscalOverride ? "Overridden" : exceptionStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-muted-foreground align-middle">
                        {row.createdAt ? dateTime(row.createdAt) : "—"}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-muted-foreground align-middle">
                        {checkedAt && !runClosed ? dateTime(checkedAt) : "—"}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-muted-foreground align-middle">
                        {row.resolvedAt ? dateTime(row.resolvedAt) : "—"}
                      </td>
                      <td className="px-3.5 py-3 text-right align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7.5 gap-1 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(row.id);
                          }}
                        >
                          <Eye className="size-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {current.pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              Showing <span className="font-semibold text-foreground">{(current.page - 1) * 25 + 1}–{Math.min(current.page * 25, rows.length)}</span> of{" "}
              <span className="font-semibold text-foreground">{rows.length}</span> exceptions
            </span>
            <div className="flex items-center gap-2">
              <span>
                Page {current.page} of {current.pages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={current.page <= 1}
                  onClick={() => setPage(current.page - 1)}
                  className="h-7 px-2.5 text-xs"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={current.page >= current.pages}
                  onClick={() => setPage(current.page + 1)}
                  className="h-7 px-2.5 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="night-audit-exception-detail">
          <SheetHeader>
            <SheetTitle>Exception Details</SheetTitle>
          </SheetHeader>
          {selected ? (
            <ExceptionDetail
              row={selected}
              businessDate={businessDate}
              checkedAt={runClosed ? null : checkedAt}
              dateTime={dateTime}
              role={role}
              authorizingFiscalOverride={authorizingFiscalOverride}
              onAuthorizeFiscalOverride={onAuthorizeFiscalOverride}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function getExceptionDestinationMeta(
  row: AuditException,
  businessDate: string,
): {
  destination: string;
  actionText: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  const meta = exceptionMeta(row.exceptionType);
  const code = meta.code;
  const category = meta.category;
  const source = getExceptionSource(row, businessDate);
  const route = source?.route ?? "";
  const isFolioRoute = route.includes("/folios/");
  const isAccountRoute = route.includes("/accounts/");

  if (code === "open_cashier_shift") {
    return {
      destination: "Cashier Desk → Shift Reconciliation",
      actionText: "Reconcile & Close Shift",
      icon: Vault,
    };
  }
  if (code === "closed_shift_variance") {
    return {
      destination: "Cashier Desk → Shift Cash Movements",
      actionText: "Inspect Shift Drawer",
      icon: Vault,
    };
  }
  if (category === "drawers") {
    return {
      destination: "Cashier Desk → Cashier Shifts",
      actionText: "Open Shift Drawer",
      icon: Vault,
    };
  }

  if (code === "closed_folio_nonzero_balance") {
    return {
      destination: "Guest Folio → Settlement Tab",
      actionText: "Settle Folio Balance",
      icon: FileSpreadsheet,
    };
  }
  if (code === "closed_folio_post_activity") {
    return {
      destination: "Guest Folio → Transaction History",
      actionText: "Review Post-Close Audit",
      icon: History,
    };
  }
  if (code === "missing_folio") {
    return {
      destination: "Reservation → Folio & Rate Setup",
      actionText: "Open Reservation",
      icon: BedDouble,
    };
  }
  if (code === "folio_invoice_contradiction") {
    return {
      destination: "Guest Folio → Invoices & Documents",
      actionText: "Reconcile Folio Invoices",
      icon: Receipt,
    };
  }
  if (category === "folios") {
    return {
      destination: isFolioRoute ? "Guest Folio → Folio Summary" : "Cashiering → Folios",
      actionText: "Inspect Guest Folio",
      icon: FileSpreadsheet,
    };
  }

  if (code === "unallocated_guest_payment" || code === "unallocated_guest_deposit" || category === "payments") {
    return {
      destination: isFolioRoute ? "Guest Folio → Payment Allocation Drawer" : "Cashiering → Payments",
      actionText: "Open Allocation Drawer",
      icon: Coins,
    };
  }

  if (category === "invoices" || category === "tax") {
    return {
      destination: isFolioRoute ? "Guest Folio → Invoices & Documents" : "Cashiering → Invoices",
      actionText: "Review Folio Invoices",
      icon: Receipt,
    };
  }

  if (category === "accounts") {
    if (code === "unallocated_account_payment" || code === "allocation_exceeds_source") {
      return {
        destination: "Financial Account → Payments Tab",
        actionText: "Allocate Account Payment",
        icon: Building2,
      };
    }
    return {
      destination: isAccountRoute ? "Financial Account → Invoices Tab" : "Financial Accounts → Overview",
      actionText: "Inspect Account Invoices",
      icon: Building2,
    };
  }

  if (category === "fiscal" || code.startsWith("fiscal_")) {
    const modalTab = source?.search?.modalTab;
    const tabName =
      modalTab === "withholding"
        ? "Withholding Tab"
        : modalTab === "settlement"
          ? "Settlement Tab"
          : "Fiscal Registration Tab";
    return {
      destination: isFolioRoute
        ? `Guest Folio → ${tabName}`
        : isAccountRoute
          ? `Financial Account → ${tabName}`
          : "Cashiering → Folios",
      actionText:
        modalTab === "withholding"
          ? "Review Withholding Tax"
          : modalTab === "settlement"
            ? "Review Settlement & Receipts"
            : "Inspect Fiscal Registration",
      icon: FileCheck,
    };
  }

  if (
    category === "arrivals" ||
    code === "arrival_not_processed" ||
    code === "pending_arrival" ||
    code === "invalid_stay_dates"
  ) {
    return {
      destination: "Front Office Desk → Arrivals",
      actionText: "Process Arrival",
      icon: LogIn,
    };
  }

  if (
    category === "departures" ||
    code === "departure_overstay" ||
    code === "pending_departure" ||
    code === "overstay"
  ) {
    return {
      destination: "Front Office Desk → Departures",
      actionText: "Review Departure / Overstay",
      icon: LogOut,
    };
  }

  if (code === "checked_in_without_room") {
    return {
      destination: "Front Office Desk → In-House",
      actionText: "Assign Room to Guest",
      icon: BedDouble,
    };
  }
  if (code === "room_double_occupancy") {
    return {
      destination: "Front Office Desk → In-House",
      actionText: "Resolve Room Conflict",
      icon: BedDouble,
    };
  }
  if (code === "room_out_of_order") {
    return {
      destination: "Room & Inventory → Maintenance",
      actionText: "Inspect Out of Order Room",
      icon: BedDouble,
    };
  }
  if (category === "rooms") {
    return {
      destination: "Room & Inventory → Room Board",
      actionText: "Inspect Room Assignment",
      icon: BedDouble,
    };
  }

  if (code === "dirty_room_departed" || category === "housekeeping") {
    return {
      destination: "Housekeeping Desk → Room Board",
      actionText: "Update Housekeeping State",
      icon: Sparkles,
    };
  }
  if (code === "clean_uninspected_stayover") {
    return {
      destination: "Housekeeping Desk → Room Board",
      actionText: "Inspect Room Cleanliness",
      icon: Sparkles,
    };
  }

  if (category === "overbooking" || code === "overbooking_unapproved") {
    return {
      destination: "Room & Inventory → Overbooking",
      actionText: "Review Overbooking & Allowance",
      icon: Layers,
    };
  }

  if (category === "distribution") {
    return {
      destination: "Distribution → Channel Manager",
      actionText: "Check Channel Sync",
      icon: Globe,
    };
  }

  if (category === "revenue" || code === "next_date_restriction") {
    return {
      destination: "Rate & Revenue → Restrictions",
      actionText: "Review Rate Restrictions",
      icon: Coins,
    };
  }

  if (category === "services") {
    return {
      destination: "Guest Services → Entitlements",
      actionText: "Inspect Service Entitlement",
      icon: Utensils,
    };
  }

  return {
    destination: meta.ownerModule ? `${meta.ownerModule} Desk` : "Source Module",
    actionText: `Open ${meta.ownerModule || "Source"}`,
    icon: ExternalLink,
  };
}

export function getExceptionSource(
  row: AuditException,
  businessDate: string,
): { route: string; search: Record<string, string> } | null {
  const meta = exceptionMeta(row.exceptionType);
  const code = meta.code;
  const category = meta.category;

  if (row.source?.route) {
    const existingSearch = { ...(row.source.search ?? {}) };
    if (row.referenceId) {
      if (
        (code === "open_cashier_shift" || code === "closed_shift_variance" || category === "drawers") &&
        !existingSearch.shift
      ) {
        existingSearch.shift = row.referenceId;
      }
      if (
        (category === "arrivals" ||
          category === "departures" ||
          code === "checked_in_without_room" ||
          code === "room_double_occupancy") &&
        !existingSearch.reservationId &&
        !existingSearch.q
      ) {
        existingSearch.reservationId = row.referenceId;
      }
      if (
        (category === "housekeeping" || code === "dirty_room_departed" || code === "room_out_of_order") &&
        !existingSearch.room
      ) {
        existingSearch.room = row.referenceId;
      }
    }
    return {
      route: row.source.route,
      search: {
        ...existingSearch,
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (code === "open_cashier_shift" || (row.referenceType === "cashier_shift" && code === "open_cashier_shift")) {
    return {
      route: "/restaurant/pms/cashiering",
      search: {
        tab: "cashier-shift",
        ...(row.referenceId ? { shift: row.referenceId, action: "close" } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (
    code === "closed_shift_variance" ||
    row.referenceType === "cashier_shift" ||
    row.referenceType === "shift" ||
    category === "drawers"
  ) {
    return {
      route: "/restaurant/pms/cashiering",
      search: {
        tab: "cashier-shift",
        ...(row.referenceId ? { shift: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (row.referenceType === "folio" && row.referenceId) {
    let tab = "invoices";
    if (code === "closed_folio_nonzero_balance") tab = "settlement";
    else if (code === "closed_folio_post_activity") tab = "history";
    else if (category === "fiscal" || code.startsWith("fiscal_")) tab = "fiscal";
    else if (category === "payments" || code.includes("payment") || code.includes("deposit")) tab = "payments";
    else if (category === "folios") tab = "charges";

    return {
      route: `/restaurant/pms/cashiering/folios/${row.referenceId}`,
      search: {
        tab,
        ...(code.includes("payment") || code.includes("deposit") ? { action: "allocate" } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (row.referenceType === "account" && row.referenceId) {
    const isPayment =
      code === "unallocated_account_payment" ||
      code === "allocation_exceeds_source" ||
      category === "payments";
    return {
      route: `/restaurant/pms/cashiering/accounts/${row.referenceId}`,
      search: {
        tab: isPayment ? "payments" : "invoices",
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (category === "arrivals" || code === "arrival_not_processed" || code === "pending_arrival") {
    return {
      route: "/restaurant/pms/front-office",
      search: {
        tab: "arrivals",
        date: businessDate,
        ...(row.referenceId ? { reservationId: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (
    category === "departures" ||
    code === "departure_overstay" ||
    code === "pending_departure" ||
    code === "overstay"
  ) {
    return {
      route: "/restaurant/pms/front-office",
      search: {
        tab: "departures",
        date: businessDate,
        ...(row.referenceId ? { reservationId: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (code === "checked_in_without_room" || code === "room_double_occupancy") {
    return {
      route: "/restaurant/pms/front-office",
      search: {
        tab: "inhouse",
        date: businessDate,
        ...(row.referenceId ? { reservationId: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (code === "room_out_of_order") {
    return {
      route: "/restaurant/pms/room-inventory",
      search: {
        tab: "maintenance",
        ...(row.referenceId ? { room: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (
    category === "housekeeping" ||
    code === "dirty_room_departed" ||
    code === "clean_uninspected_stayover" ||
    ((row.referenceType === "room" || row.referenceType === "unit") && row.referenceId)
  ) {
    return {
      route: "/restaurant/pms/housekeeping",
      search: {
        tab: "board",
        ...(row.referenceId ? { room: row.referenceId } : {}),
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (category === "overbooking" || code === "overbooking_unapproved") {
    return {
      route: "/restaurant/pms/room-inventory",
      search: {
        tab: "overbooking",
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (category === "revenue" || code === "next_date_restriction") {
    return {
      route: "/restaurant/pms/rates-revenue",
      search: {
        view: "restrictions",
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (category === "distribution") {
    return {
      route: "/restaurant/pms/distribution",
      search: {
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (category === "services") {
    return {
      route: "/restaurant/pms/guest-services",
      search: {
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  if (row.referenceType === "reservation" && row.referenceId) {
    return {
      route: `/restaurant/pms/reservations/${row.referenceId}`,
      search: {
        returnTo: "/restaurant/pms/night-audit?tab=exceptions",
        returnToLabel: "Return to Night Audit",
      },
    };
  }

  const def = exceptionDefaultSource(row.exceptionType, businessDate);
  if (!def) return null;
  return {
    route: def.route,
    search: {
      ...(def.search ?? {}),
      returnTo: "/restaurant/pms/night-audit?tab=exceptions",
      returnToLabel: "Return to Night Audit",
    },
  };
}

function ExceptionDetail({
  row,
  businessDate,
  checkedAt,
  dateTime,
  role,
  authorizingFiscalOverride,
  onAuthorizeFiscalOverride,
}: {
  row: AuditException;
  businessDate: string;
  checkedAt: string | null;
  dateTime: (value: string) => string;
  role: string;
  authorizingFiscalOverride: boolean;
  onAuthorizeFiscalOverride: (
    exceptionId: string,
    reason: string,
    reasonCategory?: (typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number],
  ) => void;
}) {
  const meta = exceptionMeta(row.exceptionType);
  const source = getExceptionSource(row, businessDate);
  const destMeta = getExceptionDestinationMeta(row, businessDate);
  const DestIcon = destMeta.icon;

  return (
    <div className="mt-5 space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
            row.severity === "blocking"
              ? "border-red-200/80 bg-red-50 text-red-800"
              : "border-amber-200/80 bg-amber-50 text-amber-900",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              row.severity === "blocking" ? "bg-red-500" : "bg-amber-500",
            )}
          />
          {row.severity === "blocking" ? "Blocker" : "Warning"}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            row.status === "open"
              ? "bg-amber-100/80 text-amber-950"
              : row.status === "resolved"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-muted text-muted-foreground",
          )}
        >
          {exceptionStatusLabel(row.status)}
        </span>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-2.5">
        <p className="font-display text-base font-semibold text-foreground">{meta.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{row.message}</p>
        <div className="flex items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 dark:bg-stone-800 px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-stone-300">
            <DestIcon className="size-3.5 text-primary" />
            <span>{destMeta.destination}</span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2.5 text-xs">
        <Field label="Business date" value={formatNa1Date(businessDate)} />
        <Field label="Source domain" value={`${meta.domain === "financial" ? "Financial" : "Operations"} · ${meta.categoryLabel}`} />
        <Field label="Destination" value={destMeta.destination} />
        <Field label="Action" value={destMeta.actionText} />
        <Field label="Source reference" value={row.referenceType ? row.referenceType.replaceAll("_", " ") : "—"} />
        <Field label="Detected at" value={row.createdAt ? dateTime(row.createdAt) : "—"} />
        <Field label="Last checked" value={checkedAt ? dateTime(checkedAt) : "—"} />
        <Field label="Resolved at" value={row.resolvedAt ? dateTime(row.resolvedAt) : "—"} />
        <Field label="Owner module" value={meta.ownerModule} />
      </dl>

      {row.severity === "blocking" && row.status === "open" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-950">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <p>
            Blockers clear automatically once resolved in <strong className="font-semibold">{destMeta.destination}</strong> ({meta.ownerModule}) and Night Audit is rechecked.
          </p>
        </div>
      ) : null}

      {source ? (
        <div className="pt-2">
          <Button asChild className="h-9 w-full sm:w-auto gap-2 font-semibold shadow-xs">
            <Link
              to={source.route as never}
              search={source.search as never}
            >
              <DestIcon className="size-4" />
              <span>{destMeta.actionText}</span>
              <span className="sr-only">Open Source</span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}
      {row.fiscalOverride ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs" data-testid="night-audit-fiscal-override">
          <p className="font-semibold text-amber-950">Overridden for close</p>
          <p className="mt-1">Fiscal status remains {row.fiscalOverride.fiscalStatus}.</p>
          <p className="mt-1">Authorized by {row.fiscalOverride.overriddenBy ?? "—"} · {dateTime(row.fiscalOverride.overriddenAt)}</p>
          <p className="mt-1">Reason: {row.fiscalOverride.reason}</p>
        </section>
      ) : null}
      {canAuthorizeFiscalOverride(role, row) ? (
        <FiscalOverrideAction
          row={row}
          businessDate={businessDate}
          busy={authorizingFiscalOverride}
          onAuthorize={onAuthorizeFiscalOverride}
        />
      ) : null}
    </div>
  );
}

function canAuthorizeFiscalOverride(role: string, row: AuditException): boolean {
  return (role === "owner" || role === "manager") && isFiscalOverrideableException(row) && !row.fiscalOverride;
}

function FiscalOverrideAction({
  row,
  businessDate,
  busy,
  onAuthorize,
}: {
  row: AuditException;
  businessDate: string;
  busy: boolean;
  onAuthorize: (
    exceptionId: string,
    reason: string,
    reasonCategory?: (typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number],
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<(typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number] | "">("");
  const meta = exceptionMeta(row.exceptionType);
  const fiscalStatus = meta.code.replace(/^fiscal_/, "").replaceAll("_", " ").toUpperCase();
  const submit = () => {
    if (!reason.trim()) return;
    onAuthorize(row.id, reason.trim(), category || undefined);
    setOpen(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" className="border-amber-300 text-amber-950" onClick={() => setOpen(true)}>
        Authorize Fiscal Close Override
      </Button>
      <AlertDialogContent data-testid="night-audit-fiscal-override-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Authorize fiscal close override?</AlertDialogTitle>
          <AlertDialogDescription>
            This allows this business date to close while the fiscal issue remains unresolved. It does not change fiscal registration.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Fiscal document / reference" value={row.referenceId ?? row.referenceType ?? "—"} />
          <Field label="Fiscal status" value={fiscalStatus} />
          <Field label="Business date" value={formatNa1Date(businessDate)} />
          <Field label="Fiscal error" value={row.message} />
        </dl>
        <label className="block text-sm font-medium">
          Override reason *
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Reason category
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          >
            <option value="">Select a category</option>
            {FISCAL_OVERRIDE_REASON_CATEGORIES.map((value) => (
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy || !reason.trim()} onClick={(event) => { event.preventDefault(); submit(); }}>
            {busy ? "Authorizing…" : "Authorize Fiscal Override"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <dt className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground text-xs">{value}</dd>
    </div>
  );
}
