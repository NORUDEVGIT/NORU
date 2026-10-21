import type { ReactNode } from "react";

import {
  reportCellClass,
  type ReportCellKind,
} from "@/packages/pms/components/reports/report-columns";
import { cn } from "@/shared/lib/utils";

export function ReportCell({ kind, children }: { kind: ReportCellKind; children: ReactNode }) {
  return <span className={reportCellClass[kind]}>{children}</span>;
}

export function ReportStatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#E8E1D7] bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-medium text-[#251605]">
      {children}
    </span>
  );
}

/**
 * Composition wrapper. Callers render their own rows and row keys.
 * Sticky headers are left to the caller so this does not fight existing tables.
 */
export function ReportTableShell({
  children,
  footer,
  busy = false,
  label = "Report",
}: {
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  label?: string;
}) {
  return (
    <div
      className="report-print-table overflow-x-auto rounded-xl border border-[#E8E1D7] bg-white shadow-sm"
      data-testid="reports-table-shell"
      aria-busy={busy}
    >
      <table className="w-full min-w-[40rem] border-collapse text-sm text-[#251605]">
        {children}
      </table>
      {footer ? (
        <div
          className="border-t border-[#E8E1D7] px-4 py-3 text-sm"
          data-testid="reports-table-footer"
        >
          {footer}
        </div>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ReportTableHeaderCell({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-[#F7F4EE] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#7A7167]",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}
