import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { commercialHistoryActorLabel, commercialHistoryReasonLabel } from "@/packages/pms/lib/revenue/commercial-history";
import type { CommercialHistoryWorkspaceRow } from "@/packages/pms/lib/revenue/commercial-history-ui";

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CommercialHistoryTable({
  rows,
  onViewDetails,
}: {
  rows: CommercialHistoryWorkspaceRow[];
  onViewDetails: (row: CommercialHistoryWorkspaceRow) => void;
}) {
  return (
    <>
      <div className="hidden overflow-auto rounded-xl border border-[#E8E1D7] bg-card md:block">
        <table className="min-w-max w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
              {["Changed At", "Entity", "Type", "Action", "Changed By", "Reason", "Changes", "Actions"].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.operationId}
                className="cursor-pointer border-t border-[#E8E1D7] hover:bg-[#F7F4EE]"
                onClick={() => onViewDetails(row)}
              >
                <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">{formatChangedAt(row.createdAt)}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  <p className="font-medium">{row.entityName}</p>
                  {row.entityCode ? <p className="text-[9px] text-muted-foreground">{row.entityCode}</p> : null}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.entityTypeLabel}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.actionLabel}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{commercialHistoryActorLabel(row)}</td>
                <td className="max-w-40 truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                  {commercialHistoryReasonLabel(row.reason)}
                </td>
                <td className="max-w-48 px-2 py-1.5 text-[10px] text-[#251605]">{row.changesSummary}</td>
                <td className="px-2 py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.entityName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onViewDetails(row)}>View Details</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <button
            key={row.operationId}
            type="button"
            onClick={() => onViewDetails(row)}
            className="w-full rounded-xl border border-[#E8E1D7] bg-card px-3 py-2 text-left"
          >
            <p className="text-[11px] font-medium text-[#251605]">{row.entityName}</p>
            {row.entityCode ? <p className="text-[9px] text-muted-foreground">{row.entityCode}</p> : null}
            <p className="mt-1 text-[10px] text-[#251605]">
              {row.actionLabel} · {row.entityTypeLabel}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatChangedAt(row.createdAt)} · {commercialHistoryActorLabel(row)}
            </p>
            <p className="mt-1 text-[10px] text-[#251605]">{row.changesSummary}</p>
          </button>
        ))}
      </div>
    </>
  );
}
