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
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <table className="min-w-max w-full border-collapse text-sm">
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
                className={[
                  "whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#5A4833]",
                  label === "Actions" ? "text-right" : "text-left",
                ].join(" ")}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {rows.map((row) => {
            const fields = restrictionHistoryChangedFields(row);
            const beforeText = restrictionHistoryBeforeLabel(row);
            const afterText = restrictionHistoryAfterLabel(row);
            const reasonText = restrictionHistoryReasonLabel(row.reason);

            return (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onViewDetails(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onViewDetails(row);
                  }
                }}
                className="cursor-pointer border-t border-[#E8E1D7] transition-colors hover:bg-[#FAF6F0]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]/50"
              >
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {formatChangedAt(row.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3">
                  <span className="inline-flex items-center rounded-md border border-[#E8E1D7] bg-[#FAF6F0] px-2 py-0.5 text-xs font-semibold text-[#251605]">
                    {restrictionHistoryActionLabel(row.actionType)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-[13px] text-[#251605]">
                  {row.roomTypeName ?? "Room type"}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-[13px] font-semibold text-[#251605]">
                  {row.ratePlanCode ?? row.ratePlanName ?? "Plan"}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {formatStayDate(row.stayDate)}
                </td>
                <td className="px-3.5 py-3">
                  {fields.length === 0 ? (
                    <span className="text-xs text-[#756A5B]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {fields.map((field) => (
                        <span
                          key={field}
                          className="rounded-md border border-[#DED7CD] bg-[#F7F4EE] px-2 py-0.5 text-xs font-medium text-[#251605]"
                        >
                          {restrictionHistoryFieldLabel(field)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td
                  title={beforeText}
                  className="max-w-56 truncate px-3.5 py-3 text-xs text-[#5A4833]"
                >
                  {beforeText}
                </td>
                <td
                  title={afterText}
                  className="max-w-56 truncate px-3.5 py-3 text-xs font-semibold text-[#251605]"
                >
                  {afterText}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {restrictionHistoryActorLabel(row)}
                </td>
                <td
                  title={reasonText}
                  className="max-w-48 truncate px-3.5 py-3 text-xs text-[#756A5B]"
                >
                  {reasonText}
                </td>
                <td
                  className="px-3.5 py-3 text-right"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.ratePlanCode ?? "restriction change"}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onViewDetails(row)}>
                        View Details
                      </DropdownMenuItem>
                      {row.actionType === "bulk_restriction_change" ? (
                        <DropdownMenuItem onSelect={() => onViewDetails(row)}>
                          View Operation
                        </DropdownMenuItem>
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
