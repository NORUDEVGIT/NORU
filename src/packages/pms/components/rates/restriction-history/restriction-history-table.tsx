import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RestrictionHistoryRow } from "@/packages/pms/lib/revenue/restriction-change";
import {
  restrictionHistoryActionLabel,
  restrictionHistoryActorLabel,
  restrictionHistoryAfterLabel,
  restrictionHistoryBeforeLabel,
  restrictionHistoryChangedFields,
  restrictionHistoryFieldLabel,
  restrictionHistoryReasonLabel,
} from "@/packages/pms/lib/revenue/restriction-history";

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function RestrictionHistoryTable({
  rows,
  onViewDetails,
}: {
  rows: RestrictionHistoryRow[];
  onViewDetails: (row: RestrictionHistoryRow) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#E8E1D7] bg-card">
      <table className="min-w-max w-full border-collapse">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {[
              "Changed At",
              "Action",
              "Room Type",
              "Rate Plan",
              "Stay Date",
              "Changed Fields",
              "Before",
              "After",
              "Changed By",
              "Reason",
              "Actions",
            ].map((label) => (
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
          {rows.map((row) => {
            const fields = restrictionHistoryChangedFields(row);
            return (
              <tr key={row.id} className="border-t border-[#E8E1D7]">
                <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                  {formatChangedAt(row.createdAt)}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  {restrictionHistoryActionLabel(row.actionType)}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.roomTypeName ?? "Room type"}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  {row.ratePlanCode ?? row.ratePlanName ?? "Plan"}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{formatStayDate(row.stayDate)}</td>
                <td className="px-2 py-1.5">
                  {fields.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {fields.map((field) => (
                        <span
                          key={field}
                          className="rounded-md border border-[#DED7CD] bg-[#F7F4EE] px-1.5 py-0.5 text-[9px] font-medium text-[#251605]"
                        >
                          {restrictionHistoryFieldLabel(field)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="max-w-52 px-2 py-1.5 text-[10px] text-[#251605]">{restrictionHistoryBeforeLabel(row)}</td>
                <td className="max-w-52 px-2 py-1.5 text-[10px] text-[#251605]">{restrictionHistoryAfterLabel(row)}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{restrictionHistoryActorLabel(row)}</td>
                <td className="max-w-40 truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                  {restrictionHistoryReasonLabel(row.reason)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.ratePlanCode ?? "restriction change"}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onViewDetails(row)}>View Details</DropdownMenuItem>
                      {row.actionType === "bulk_restriction_change" ? (
                        <DropdownMenuItem onSelect={() => onViewDetails(row)}>View Operation</DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
