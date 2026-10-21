import { ChevronLeft, ChevronRight } from "lucide-react";

import { REPORT_PAGE_SIZES, type ReportPageSize } from "@/packages/pms/lib/reports-shell";
import { Button } from "@/shared/components/ui/button";

export function ReportPagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
}: {
  page: number;
  pageSize: ReportPageSize;
  totalRows: number;
  onPageChange: (page: number, pageSize: ReportPageSize) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const from = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = totalRows === 0 ? 0 : Math.min(safePage * pageSize, totalRows);

  return (
    <div
      className="report-print-hide flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs text-[#7A7167] shadow-2xs"
      data-testid="reports-pagination"
    >
      <span className="font-medium">
        Showing <strong className="text-[#251605]">{from}–{to}</strong> of{" "}
        <strong className="text-[#251605]">{totalRows}</strong> records
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933] hover:bg-[#FAF8F4]"
          disabled={safePage <= 1 || totalRows === 0}
          onClick={() => onPageChange(safePage - 1, pageSize)}
          data-testid="reports-page-prev"
        >
          <ChevronLeft className="mr-1 size-3.5" />
          Previous
        </Button>
        <span className="tabular-nums font-semibold text-[#251605]">
          Page {safePage} of {pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933] hover:bg-[#FAF8F4]"
          disabled={safePage >= pageCount || totalRows === 0}
          onClick={() => onPageChange(safePage + 1, pageSize)}
          data-testid="reports-page-next"
        >
          Next
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
        <select
          aria-label="Rows per page"
          data-testid="reports-page-size"
          value={pageSize}
          onChange={(event) => onPageChange(1, Number(event.target.value) as ReportPageSize)}
          className="h-8 rounded-lg border border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] focus:border-[#C89933] focus:outline-hidden"
        >
          {REPORT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
