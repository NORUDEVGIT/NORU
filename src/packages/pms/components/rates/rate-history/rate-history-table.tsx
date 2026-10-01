import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RateChangeHistoryRow } from "@/packages/pms/lib/revenue/rate-change";
import {
  deltaTone,
  formatHistoryMoney,
  rateHistoryActionLabel,
  rateHistoryActorLabel,
  rateHistoryReasonLabel,
  rateHistorySourceLabel,
} from "@/packages/pms/lib/revenue/rate-history";

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  up: "font-semibold text-emerald-800",
  down: "font-semibold text-rose-800",
  flat: "text-[#251605]",
};

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function RateHistoryTable({
  rows,
  onViewDetails,
}: {
  rows: RateChangeHistoryRow[];
  onViewDetails: (row: RateChangeHistoryRow) => void;
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
              "Before",
              "After",
              "Delta",
              "Changed By",
              "Source",
              "Reason",
              "Actions",
            ].map((label) => (
              <th
                key={label}
                className={[
                  "whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#5A4833]",
                  label === "Before" ||
                  label === "After" ||
                  label === "Delta" ||
                  label === "Actions"
                    ? "text-right"
                    : "text-left",
                ].join(" ")}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {rows.map((row) => {
            const tone = TONE[deltaTone(row.absoluteDelta)];
            const reasonText = rateHistoryReasonLabel(row.reason);
            return (
              <tr
                key={row.id}
                onClick={() => onViewDetails(row)}
                className="cursor-pointer transition-colors hover:bg-[#FAF6F0]/70"
              >
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {formatChangedAt(row.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3">
                  <span className="inline-flex items-center rounded-md border border-[#E8E1D7] bg-[#FAF6F0] px-2 py-0.5 text-xs font-semibold text-[#251605]">
                    {rateHistoryActionLabel(row.actionType)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-sm text-[#251605]">
                  {row.roomTypeName ?? "Room type"}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-sm font-medium text-[#251605]">
                  {row.ratePlanCode ?? row.ratePlanName ?? "Plan"}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {formatStayDate(row.stayDate)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-right text-sm tabular-nums text-[#5A4833]">
                  {formatHistoryMoney(row.previousEffectiveRate, row.currency)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-right text-sm font-semibold tabular-nums text-[#251605]">
                  {formatHistoryMoney(row.newEffectiveRate, row.currency)}
                </td>
                <td
                  className={[
                    "whitespace-nowrap px-3.5 py-3 text-right text-xs tabular-nums",
                    tone,
                  ].join(" ")}
                >
                  {formatHistoryMoney(row.absoluteDelta, row.currency)}
                  {row.percentageDelta == null ? "" : ` · ${row.percentageDelta}%`}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-xs font-medium text-[#251605]">
                  {rateHistoryActorLabel(row)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[#756A5B]">
                  {rateHistorySourceLabel(row.source)}
                </td>
                <td
                  title={reasonText}
                  className="max-w-52 truncate px-3.5 py-3 text-xs text-[#5A4833]"
                >
                  {reasonText}
                </td>
                <td className="px-3.5 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.ratePlanCode ?? "rate change"}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onViewDetails(row)}>
                        View Details
                      </DropdownMenuItem>
                      {row.actionType === "bulk_rate_change" ? (
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
