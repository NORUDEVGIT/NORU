import type { ReactNode } from "react";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

import { ReportExportMenu } from "@/packages/pms/components/reports/report-export-menu";
import { ReportPagination } from "@/packages/pms/components/reports/report-pagination";
import { ReportsShellSlot } from "@/packages/pms/components/reports/reports-shell-slots";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
  ReportNoAccessState,
} from "@/packages/pms/components/reports/report-states";
import {
  rowReportCapability,
  type ReportCapability,
  type ReportDefinition,
  type ReportExportAudit,
  type ReportPageSize,
} from "@/packages/pms/lib/reports-shell";

export type ReportPhase = "loading" | "empty" | "error" | "no-access" | "placeholder" | "ready";

/**
 * Row-report frame. The shared toolbar holds the filters and the export action.
 * The page itself is the table.
 */
export function ReportPageShell({
  restaurantId,
  definition,
  phase,
  search,
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
  restaurantId?: string;
  definition: ReportDefinition;
  phase: ReportPhase;
  search?: ReactNode;
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
  const permissions = usePmsPermissions(restaurantId);
  const baseAccess = rowReportCapability(definition, capability);
  const access = {
    ...baseAccess,
    canExport:
      baseAccess.canExport &&
      (!restaurantId ||
        (!permissions.isLoading &&
          !permissions.isError &&
          permissions.can(PMS_PERMISSIONS.REPORTS_EXPORT))),
  };
  const showPagination = phase === "placeholder" || phase === "empty" || phase === "ready";
  const blocked = !access.canView || phase === "no-access";
  const exportMenu =
    blocked || !access.canExport ? null : (
      <ReportExportMenu
        definition={definition}
        capability={access}
        {...(onPrint ? { onPrint } : {})}
        {...(onPdf ? { onPdf } : {})}
        {...(onExcel ? { onExcel } : {})}
        {...(onAudit ? { onAudit } : {})}
      />
    );

  return (
    <section className="report-print-root space-y-3" data-testid={`reports-row-${definition.id}`}>
      <ReportsShellSlot name="search">{search}</ReportsShellSlot>
      <ReportsShellSlot name="filter">{filters}</ReportsShellSlot>
      <ReportsShellSlot name="export">{exportMenu}</ReportsShellSlot>
      {blocked ? (
        <ReportNoAccessState />
      ) : (
        <>
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
