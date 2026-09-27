import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueControlSignal,
  RevenueControlWorkRow,
} from "@/packages/pms/lib/revenue/revenue-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

function signalTone(
  signal: RevenueControlSignal,
): "neutral" | "warning" | "danger" | "info" {
  if (signal === "Restriction Active") return "danger";

  if (
    signal === "Low Remaining Inventory" ||
    signal === "High Occupancy"
  ) {
    return "warning";
  }

  if (signal === "Override Active") return "info";

  return "neutral";
}

export function RateInventoryControl({
  rows,
  context,
  money,
}: {
  rows: RevenueControlWorkRow[];
  context: RevenueContext;
  money: (value: number) => string;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card shadow-sm">
      <div className="border-b border-[#E8E1D7] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[#251605]">
          Rate & Inventory Control
        </h2>

        <p className="text-[10px] text-muted-foreground">
          Nightly booked occupancy with the focused rate plan. No recommended
          percentage changes.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-xs text-muted-foreground">
          No dates in the selected range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Occupancy</th>
                <th className="px-3 py-2 font-semibold">Rooms sold</th>
                <th className="px-3 py-2 font-semibold">Rooms available</th>
                <th className="px-3 py-2 font-semibold">Rate</th>
                <th className="px-3 py-2 font-semibold">Restriction</th>
                <th className="px-3 py-2 font-semibold">Signal</th>

                <th className="w-12 px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const search = serializeRevenueSearch("rate-calendar", {
                  ...context,
                  fromDate: row.date,
                  toDate: row.date,
                  ratePlanId: row.ratePlanId ?? context.ratePlanId,
                });

                const restrictionSearch = serializeRevenueSearch(
                  "restrictions",
                  {
                    ...context,
                    fromDate: row.date,
                    toDate: row.date,
                    ratePlanId: row.ratePlanId ?? context.ratePlanId,
                  },
                );

                return (
                  <tr
                    key={row.date}
                    className="border-b border-[#E8E1D7]/80 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2 font-medium text-[#251605]">
                      {row.date}
                    </td>

                    <td className="px-3 py-2">
                      {row.occupancyPercent}%
                    </td>

                    <td className="px-3 py-2">
                      {row.soldRoomNights}
                    </td>

                    <td className="px-3 py-2">
                      {row.availableRoomNights}
                    </td>

                    <td className="px-3 py-2">
                      {row.effectiveRate == null
                        ? "—"
                        : `${row.ratePlanCode ?? "Rate"} ${money(
                            row.effectiveRate,
                          )}${
                            row.overrideActive ? " · override" : ""
                          }`}
                    </td>

                    <td className="px-3 py-2">
                      {row.restrictionLabel ?? "—"}
                    </td>

                    <td className="px-3 py-2">
                      <InventoryStatusBadge tone={signalTone(row.signal)}>
                        {row.signal}
                      </InventoryStatusBadge>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${row.date}`}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#F3ECE2] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/40"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent
                          align="end"
                          className="min-w-44"
                        >
                          <DropdownMenuItem asChild>
                            <Link
                              to="/restaurant/pms/rates-revenue"
                              search={search}
                            >
                              Review Rate
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild>
                            <Link
                              to="/restaurant/pms/rates-revenue"
                              search={search}
                            >
                              View Calendar
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild>
                            <Link
                              to="/restaurant/pms/rates-revenue"
                              search={restrictionSearch}
                            >
                              Review Restriction
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}