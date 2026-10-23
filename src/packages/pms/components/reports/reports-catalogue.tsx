import {
  BookUser,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  REPORT_CATALOGUE,
  REPORT_GROUPS,
  reportStatusLabel,
  type ReportDefinition,
  type ReportGroupId,
  type ReportIcon,
  type ReportId,
} from "@/packages/pms/lib/reports-shell";
import { cn } from "@/shared/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  stay: BookUser,
  receipt: Receipt,
  clipboard: ClipboardList,
  bed: UtensilsCrossed,
};

const FUNCTIONAL_REPORT_IDS = new Set<string>([
  "police",
  "cashier-invoice",
  "fiscal-registration",
  "meal-service",
  "service-fulfillment",
]);

const FUNCTIONAL_TAGS: Record<string, string[]> = {
  police: ["Statutory Compliance", "Named Guest Register", "Print & Excel Ready"],
  "cashier-invoice": ["Guest & Account Folios", "Credit / Debit Notes", "Excel Audit Trail"],
  "fiscal-registration": ["Fiscal Signatures", "Invoice & Sales Receipts", "Provider Audit"],
  "meal-service": ["Kitchen Handoff", "Breakfast / Lunch / Dinner", "In-House Filter"],
  "service-fulfillment": ["Package Delivery", "Amenities & Tours", "Status Tracking"],
};

const GROUP_TONES: Record<
  string,
  {
    iconWrap: string;
    badge: string;
    border: string;
    tag: string;
  }
> = {
  "guest-stay": {
    iconWrap: "border border-emerald-200/90 bg-emerald-50 text-emerald-800",
    badge: "border-emerald-200/90 bg-emerald-50/80 text-emerald-800",
    border: "hover:border-emerald-400/80",
    tag: "Guest & Compliance",
  },
  "financial-reports": {
    iconWrap: "border border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]",
    badge: "border-[#E5D7B7] bg-[#FAF3E3]/90 text-[#8A6A24]",
    border: "hover:border-[#C89933]",
    tag: "Financial Registers",
  },
  operations: {
    iconWrap: "border border-violet-200/90 bg-violet-50 text-violet-800",
    badge: "border-violet-200/90 bg-violet-50/80 text-violet-800",
    border: "hover:border-violet-400/80",
    tag: "Operations Handoff",
  },
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
  const normalizedQuery = query.trim().toLowerCase();

  // Active functional groups: Guest & Stay, Financial Reports, Operations
  const functionalGroups = REPORT_GROUPS.filter(
    (g) => g.id === "guest-stay" || g.id === "financial-reports" || g.id === "operations",
  ).filter((group) => !scope || group.id === scope);

  return (
    <div className="space-y-6" data-testid="reports-center">
      {/* Top Banner Overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-2xs">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              Statutory Compliance
            </p>
            <p className="font-display text-base font-bold text-[#251605]">Police Stay Report</p>
            <p className="text-[11px] text-[#7A7167]">Guest identity & national registry</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-2xs">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#E5D7B7] bg-[#FAF3E3] text-[#8A6A24]">
            <Receipt className="size-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A6A24]">
              Financial Documents
            </p>
            <p className="font-display text-base font-bold text-[#251605]">Cashier & Fiscal</p>
            <p className="text-[11px] text-[#7A7167]">Issued invoices, credit notes & signatures</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-2xs">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700">
            <UtensilsCrossed className="size-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">
              Operations Handoff
            </p>
            <p className="font-display text-base font-bold text-[#251605]">Meal & Services</p>
            <p className="text-[11px] text-[#7A7167]">Kitchen meal lists & amenity fulfillment</p>
          </div>
        </div>
      </div>

      {/* Group Sections */}
      {functionalGroups.map((group) => {
        const rows = getFunctionalGroupRows(group.id, normalizedQuery);
        const testId =
          group.id === "operations" ? "reports-group-operations" : `reports-group-${group.id}`;

        if (rows.length === 0) {
          if (group.id === "operations") {
            return (
              <section key={group.id} className="space-y-3" data-testid="reports-group-operations">
                <GroupHeading
                  label={group.label}
                  description={group.description}
                  count={0}
                  groupId={group.id}
                />
                <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white px-5 py-4 text-sm text-[#7A7167]">
                  No reports found matching your search.
                </div>
              </section>
            );
          }
          return null;
        }

        return (
          <section key={group.id} className="space-y-3" data-testid={testId}>
            <GroupHeading
              label={group.label}
              description={group.description}
              count={rows.length}
              groupId={group.id}
            />
            <ul className="grid gap-4 sm:grid-cols-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <CatalogueCard row={row} onOpen={() => onOpenReport(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {functionalGroups.every((g) => getFunctionalGroupRows(g.id, normalizedQuery).length === 0) &&
      normalizedQuery ? (
        <div className="rounded-2xl border border-dashed border-[#DDD4C5] bg-white px-6 py-12 text-center shadow-xs">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#FAF3E3] text-[#8A6A24]">
            <Search className="size-6" />
          </div>
          <h3 className="mt-3 font-display text-base font-semibold text-[#251605]">
            No matching functional reports
          </h3>
          <p className="mt-1 text-xs text-[#7A7167]">
            We couldn't find any report matching "{query}". Try checking another keyword.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function getFunctionalGroupRows(groupId: ReportGroupId, normalizedQuery: string) {
  return (REPORT_CATALOGUE as readonly ReportDefinition[])
    .filter((row) => row.group === groupId && FUNCTIONAL_REPORT_IDS.has(row.id))
    .filter((row) => {
      if (!normalizedQuery) return true;
      return (
        row.title.toLowerCase().includes(normalizedQuery) ||
        row.description.toLowerCase().includes(normalizedQuery)
      );
    });
}

function GroupHeading({
  label,
  description,
  count,
  groupId,
}: {
  label: string;
  description: string;
  count: number;
  groupId: ReportGroupId;
}) {
  const tone = GROUP_TONES[groupId] ?? GROUP_TONES["financial-reports"];
  return (
    <div className="flex items-center justify-between border-b border-[#DDD4C5] pb-2">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold text-[#251605]">{label}</h2>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              tone.badge,
            )}
          >
            {count} {count === 1 ? "Report" : "Reports"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#7A7167]">{description}</p>
      </div>
    </div>
  );
}

function CatalogueCard({ row, onOpen }: { row: ReportDefinition; onOpen: () => void }) {
  const Icon = ICONS[row.icon] ?? FileSpreadsheet;
  const status = reportStatusLabel(row.status);
  const tone = GROUP_TONES[row.group] ?? GROUP_TONES["financial-reports"];
  const tags = FUNCTIONAL_TAGS[row.id] ?? ["Operational Register"];

  return (
    <button
      type="button"
      data-testid={`reports-open-${row.id}`}
      data-report-status={row.status}
      onClick={onOpen}
      className={cn(
        "group relative flex h-full w-full flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C89933] hover:shadow-md",
        tone.border,
      )}
    >
      <div className="space-y-3">
        {/* Top Badges & Icons */}
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "grid size-11 place-items-center rounded-xl shadow-2xs transition-transform duration-200 group-hover:scale-105",
              tone.iconWrap,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border border-[#E5D7B7] bg-[#FAF8F4] px-2.5 py-1 text-[11px] font-semibold text-[#8A6A24]">
              Print & Excel
            </span>
          </div>
        </div>

        {/* Title and description */}
        <div>
          <h3 className="font-display text-base font-bold text-[#251605] transition-colors group-hover:text-[#8A6A24]">
            {row.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#7A7167]">
            {row.description}
          </p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-[#DDD4C5]/80 bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-medium text-[#7A7167]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-[#F2ECE3] pt-3 text-xs">
        <span className="text-[11px] font-semibold text-[#8A6A24]">
          Open Official Register
        </span>
        <div className="flex items-center gap-1 text-xs font-semibold text-[#8A6A24]">
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">View</span>
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </div>
    </button>
  );
}
