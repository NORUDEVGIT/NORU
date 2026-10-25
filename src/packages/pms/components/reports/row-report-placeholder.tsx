import { ReportFilterBar } from "@/packages/pms/components/reports/report-filter-bar";
import { ReportPageShell } from "@/packages/pms/components/reports/report-page-shell";
import type { ReportPageSize, RowReportDefinition } from "@/packages/pms/lib/reports-shell";

/**
 * Shell destination only. No guest, invoice, or service query.
 */
export function RowReportPlaceholder({
  definition,
  businessDate,
  timezone,
  page,
  pageSize,
  onPageChange,
}: {
  definition: RowReportDefinition;
  businessDate: string;
  timezone: string;
  page: number;
  pageSize: ReportPageSize;
  onPageChange: (page: number, pageSize: ReportPageSize) => void;
}) {
  return (
    <ReportPageShell
      definition={definition}
      phase="placeholder"
      businessDate={businessDate}
      timezone={timezone}
      page={page}
      pageSize={pageSize}
      totalRows={0}
      onPageChange={onPageChange}
      filters={
        <ReportFilterBar>
          <p className="py-1 text-xs text-[#7A7167]">
            Filters will be added with this report&apos;s data.
          </p>
        </ReportFilterBar>
      }
    >
      <div
        className="rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
        data-testid="reports-placeholder-note"
      >
        <p className="text-sm text-[#251605]">{definition.placeholderNote}</p>
      </div>
    </ReportPageShell>
  );
}
