import type { ReactNode } from "react";
import { Calendar } from "lucide-react";

import { ReportExportMenu } from "@/packages/pms/components/reports/report-export-menu";
import { ReportPagination } from "@/packages/pms/components/reports/report-pagination";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
  ReportNoAccessState,
} from "@/packages/pms/components/reports/report-states";
import {
  reportGroup,
  rowReportCapability,
  type ReportCapability,
  type ReportDefinition,
  type ReportExportAudit,
  type ReportPageSize,
} from "@/packages/pms/lib/reports-shell";

export type ReportPhase = "loading" | "empty" | "error" | "no-access" | "placeholder" | "ready";

/**
 * Row-report frame. Analytics dashboards do not use this shell.
 * businessDate and timezone come from the property house date, never the browser clock.
 */
export function ReportPageShell({
  definition,
  phase,
  businessDate,
  timezone,
  kpis,
  filters,
  page,
  pageSize,
  totalRows = 0,
  onPageChange,
  capability,
  onPrint,
  onPdf,
  onExcel,
  onAudit,
  onRetry,
  errorMessage,
  children,
}: {
  definition: ReportDefinition;
  phase: ReportPhase;
  businessDate?: string | null;
  timezone?: string | null;
  kpis?: ReactNode;
  filters?: ReactNode;
  page: number;
  pageSize: ReportPageSize;
  totalRows?: number;
  onPageChange: (page: number, pageSize: ReportPageSize) => void;
  capability?: Partial<ReportCapability>;
  onPrint?: () => void;
  onPdf?: () => void;
  onExcel?: () => void;
  onAudit?: (event: ReportExportAudit) => void;
  onRetry?: () => void;
  errorMessage?: string;
  children?: ReactNode;
}) {
  const access = rowReportCapability(definition, capability);
  const group = reportGroup(definition.group);
  const showPagination = phase === "placeholder" || phase === "empty" || phase === "ready";
  const blocked = !access.canView || phase === "no-access";

  return (
    <section
      className="report-print-root space-y-4"
      data-testid={`reports-row-${definition.id}`}
    >
      <header className="report-print-hide flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-2xs">
        <div className="min-w-0">
          {group ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A6A24]">
              {group.label}
            </p>
          ) : null}
          <h2 className="mt-0.5 font-display text-xl font-bold tracking-tight text-[#251605]">
            {definition.title}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#7A7167]">
            {definition.description}
          </p>
          {businessDate ? (
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] px-2.5 py-1 text-xs text-[#7A7167]"
              data-testid="reports-house-date"
            >
              <Calendar className="size-3.5 text-[#8A6A24]" />
              <span>
                Property house date <strong className="font-semibold text-[#251605]">{businessDate}</strong>
              </span>
              {timezone ? <span className="text-[#A89F91]">· {timezone}</span> : null}
            </div>
          ) : null}
        </div>
        {blocked ? null : (
          <ReportExportMenu
            definition={definition}
            capability={access}
            {...(onPrint ? { onPrint } : {})}
            {...(onPdf ? { onPdf } : {})}
            {...(onExcel ? { onExcel } : {})}
            {...(onAudit ? { onAudit } : {})}
          />
        )}
      </header>
      {blocked ? (
        <ReportNoAccessState />
      ) : (
        <>
          {kpis ? <div className="report-print-hide">{kpis}</div> : null}
          {filters}
          {phase === "loading" ? <ReportLoadingState /> : null}
          {phase === "error" ? (
            <ReportErrorState
              {...(errorMessage ? { message: errorMessage } : {})}
              {...(onRetry ? { onRetry } : {})}
            />
          ) : null}
          {phase === "empty" ? <ReportEmptyState /> : null}
          {phase === "placeholder" || phase === "ready" ? children : null}
          {showPagination ? (
            <ReportPagination
              page={page}
              pageSize={pageSize}
              totalRows={totalRows}
              onPageChange={onPageChange}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
