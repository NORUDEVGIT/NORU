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
  up: "text-emerald-800",
  down: "text-rose-800",
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
                className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = TONE[deltaTone(row.absoluteDelta)];
            return (
              <tr key={row.id} className="border-t border-[#E8E1D7]">
                <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-[#251605]">
                  {formatChangedAt(row.createdAt)}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{rateHistoryActionLabel(row.actionType)}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.roomTypeName ?? "Room type"}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{row.ratePlanCode ?? row.ratePlanName ?? "Plan"}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{formatStayDate(row.stayDate)}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  {formatHistoryMoney(row.previousEffectiveRate, row.currency)}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">
                  {formatHistoryMoney(row.newEffectiveRate, row.currency)}
                </td>
                <td className={["px-2 py-1.5 text-[10px]", tone].join(" ")}>
                  {formatHistoryMoney(row.absoluteDelta, row.currency)}
                  {row.percentageDelta == null ? "" : ` · ${row.percentageDelta}%`}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#251605]">{rateHistoryActorLabel(row)}</td>
                <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{rateHistorySourceLabel(row.source)}</td>
                <td className="max-w-40 truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                  {rateHistoryReasonLabel(row.reason)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${row.ratePlanCode ?? "rate change"}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem onSelect={() => onViewDetails(row)}>View Details</DropdownMenuItem>
                      {row.actionType === "bulk_rate_change" ? (
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
