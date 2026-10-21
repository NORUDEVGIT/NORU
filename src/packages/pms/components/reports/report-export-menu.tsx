import { ChevronDown } from "lucide-react";

import {
  bindReportExport,
  type ReportCapability,
  type ReportDefinition,
  type ReportExportAudit,
  type ReportExportKind,
} from "@/packages/pms/lib/reports-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/**
 * Shared print / PDF / Excel surface. Items stay inactive until a later phase
 * passes an enabled handler. This menu does not create a file.
 */
export function ReportExportMenu({
  definition,
  capability,
  onPrint,
  onPdf,
  onExcel,
  onAudit,
}: {
  definition: ReportDefinition;
  capability: ReportCapability;
  onPrint?: () => void;
  onPdf?: () => void;
  onExcel?: () => void;
  onAudit?: (event: ReportExportAudit) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        data-testid="reports-export-menu"
        className="report-print-hide inline-flex h-9 items-center gap-1 rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-[#251605]"
      >
        Export
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="report-print-hide">
        <ExportItem
          testId="reports-export-print"
          label="Print"
          kind="print"
          definition={definition}
          enabled={capability.canPrint && definition.supportsPrint}
          run={onPrint}
          onAudit={onAudit}
        />
        <ExportItem
          testId="reports-export-pdf"
          label="Print / Save as PDF"
          kind="pdf"
          definition={definition}
          enabled={capability.canExport && definition.supportsPdf}
          run={onPdf}
          onAudit={onAudit}
        />
        <ExportItem
          testId="reports-export-excel"
          label="Excel"
          kind="excel"
          definition={definition}
          enabled={capability.canExport && definition.supportsExcel}
          run={onExcel}
          onAudit={onAudit}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExportItem({
  testId,
  label,
  kind,
  definition,
  enabled,
  run,
  onAudit,
}: {
  testId: string;
  label: string;
  kind: ReportExportKind;
  definition: ReportDefinition;
  enabled: boolean;
  run?: () => void;
  onAudit?: (event: ReportExportAudit) => void;
}) {
  const action = bindReportExport({
    reportId: definition.id,
    kind,
    enabled: enabled && Boolean(run),
    run,
    audit: onAudit,
  });
  const reason = action
    ? undefined
    : kind === "excel"
      ? "Coming in next phase"
      : `${label} is not available for this report yet.`;
  return (
    <DropdownMenuItem
      data-testid={testId}
      aria-disabled={action ? undefined : true}
      title={reason}
      className={action ? undefined : "opacity-60"}
      onSelect={(event) => {
        if (!action) {
          event.preventDefault();
          return;
        }
        action();
      }}
    >
      <span>{label}</span>
      {reason ? (
        <span className="ml-3 text-[11px] text-muted-foreground">Not available yet</span>
      ) : null}
    </DropdownMenuItem>
  );
}
