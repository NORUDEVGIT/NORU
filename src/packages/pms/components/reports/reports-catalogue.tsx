import {
  BedDouble,
  BookUser,
  CalendarDays,
  ClipboardList,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  filterReports,
  REPORT_GROUPS,
  reportStatusLabel,
  type ReportDefinition,
  type ReportGroupId,
  type ReportIcon,
  type ReportId,
} from "@/packages/pms/lib/reports-shell";

const ICONS: Record<ReportIcon, LucideIcon> = {
  calendar: CalendarDays,
  wallet: Wallet,
  bed: BedDouble,
  trend: TrendingUp,
  clipboard: ClipboardList,
  stay: BookUser,
  receipt: Receipt,
};

export function ReportsCatalogue({
  query,
  scope,
  onOpenReport,
}: {
  query: string;
  scope: string | null;
  onOpenReport: (id: ReportId) => void;
}) {
  const groups = REPORT_GROUPS.filter(
    (group) => !scope || group.id === scope || scopeBelongsToGroup(scope, group.id),
  );
  const anyReport = groups.some(
    (group) =>
      filterReports(query, scope && scopeBelongsToGroup(scope, group.id) ? scope : group.id)
        .length > 0,
  );
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-6" data-testid="reports-center">
      <p className="text-sm text-[#7A7167]">
        Analytics dashboards and row-level reports. Placeholders do not load business data.
      </p>
      {groups.map((group) => {
        const rows = filterReports(
          query,
          scope && scopeBelongsToGroup(scope, group.id) ? scope : group.id,
        );
        if (rows.length === 0) {
          if (group.id !== "operations" || (searching && scope !== "operations")) return null;
          return (
            <section key={group.id} className="space-y-2" data-testid="reports-group-operations">
              <GroupHeading label={group.label} description={group.description} />
              <div className="rounded-xl border border-dashed border-[#E8E1D7] bg-white px-4 py-4 text-sm text-[#7A7167] shadow-sm">
                Reserved for a later release. No operations report is available yet.
              </div>
            </section>
          );
        }
        return (
          <section key={group.id} className="space-y-2" data-testid={`reports-group-${group.id}`}>
            <GroupHeading label={group.label} description={group.description} />
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <CatalogueCard row={row} onOpen={() => onOpenReport(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!anyReport && searching ? (
        <p className="text-sm text-[#7A7167]">No report matches that search.</p>
      ) : null}
    </div>
  );
}

function scopeBelongsToGroup(scope: string, groupId: ReportGroupId): boolean {
  if (groupId !== "analytics") return false;
  return (
    scope === "operational" ||
    scope === "financial" ||
    scope === "rooms" ||
    scope === "revenue" ||
    scope === "management"
  );
}

function GroupHeading({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#251605]">{label}</h2>
      <p className="text-xs text-[#7A7167]">{description}</p>
    </div>
  );
}

function CatalogueCard({ row, onOpen }: { row: ReportDefinition; onOpen: () => void }) {
  const Icon = ICONS[row.icon];
  const status = reportStatusLabel(row.status);
  return (
    <button
      type="button"
      data-testid={`reports-open-${row.id}`}
      data-report-status={row.status}
      onClick={onOpen}
      className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-[#E8E1D7] bg-white px-4 py-3 text-left shadow-sm hover:border-[#C89933]/50"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-[#F7F4EE] text-[#251605]">
          <Icon className="size-4" aria-hidden />
        </span>
        {status ? (
          <span className="rounded-full border border-[#E8E1D7] bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-medium text-[#7A7167]">
            {status}
          </span>
        ) : null}
      </span>
      <span className="text-sm font-medium text-[#251605]">{row.title}</span>
      <span className="text-xs text-[#7A7167]">{row.description}</span>
    </button>
  );
}
