import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

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
import { Button } from "@/shared/components/ui/button";

function SignalBadge({ signal }: { signal: RevenueControlSignal }) {
  if (signal === "Override Active") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full border border-[#F4E9D0] bg-[#FDF6E2] px-2.5 py-0.5 text-xs font-medium text-[#8A641A]">
        {signal}
      </span>
    );
  }

  if (signal === "Restriction Active") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        {signal}
      </span>
    );
  }

  if (signal === "Low Remaining Inventory" || signal === "High Occupancy") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        {signal}
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-[#DDD4C5] bg-[#F7F4EE] px-2.5 py-0.5 text-xs font-medium text-[#5A4833]">
      {signal}
    </span>
  );
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
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const startEntry = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, rows.length);

  return (
    <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] px-4 py-3">
        <h2 className="font-display text-base font-semibold text-[#251605]">
          Rate & Inventory Control
        </h2>
        <span className="rounded-full bg-[#FAF6F0] px-2.5 py-0.5 text-xs font-medium text-[#756A5B]">
          {rows.length} {rows.length === 1 ? "day" : "days"} in range
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-[#756A5B]">
          No dates in the selected range.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[#DDD4C5] bg-[#FAF6F0] text-xs font-semibold text-[#5A4833]">
                <tr>
                  <th className="h-10 px-4">Date</th>
                  <th className="h-10 px-4 text-right">Occupancy</th>
                  <th className="h-10 px-4 text-right">Rooms Sold</th>
                  <th className="h-10 px-4 text-right">Rooms Available</th>
                  <th className="h-10 px-4 text-right">Rate</th>
                  <th className="h-10 px-4">Restriction</th>
                  <th className="h-10 px-4">Signal</th>
                  <th className="h-10 w-12 px-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {paginatedRows.map((row) => {
                  const calendarSearch = serializeRevenueSearch("rate-calendar", {
                    ...context,
                    fromDate: row.date,
                    toDate: row.date,
                    ratePlanId: row.ratePlanId ?? context.ratePlanId,
                  });

                  const restrictionSearch = serializeRevenueSearch("restrictions", {
                    ...context,
                    fromDate: row.date,
                    toDate: row.date,
                    ratePlanId: row.ratePlanId ?? context.ratePlanId,
                  });

                  return (
                    <tr
                      key={row.date}
                      className="border-b border-[#EFECE6] transition-colors hover:bg-[#FAF6F0]/60"
                    >
                      <td className="h-11 px-4 font-medium text-[#251605]">{row.date}</td>
                      <td className="h-11 px-4 text-right font-medium text-[#251605]">
                        {row.occupancyPercent}%
                      </td>
                      <td className="h-11 px-4 text-right text-[#251605]">{row.soldRoomNights}</td>
                      <td className="h-11 px-4 text-right text-[#251605]">
                        {row.availableRoomNights}
                      </td>
                      <td className="h-11 px-4 text-right text-[#251605]">
                        {row.effectiveRate == null ? (
                          "—"
                        ) : (
                          <span>
                            {row.ratePlanCode ? (
                              <span className="text-[#756A5B]">{row.ratePlanCode} </span>
                            ) : null}
                            <span className="font-medium">{money(row.effectiveRate)}</span>
                            {row.overrideActive ? (
                              <span className="ml-1 text-xs text-[#8A641A] font-medium">
                                · override
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="h-11 px-4 text-xs text-[#756A5B]">
                        {row.restrictionLabel ?? "—"}
                      </td>
                      <td className="h-11 px-4">
                        <SignalBadge signal={row.signal} />
                      </td>
                      <td className="h-11 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Actions for ${row.date}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-[#756A5B] transition-colors hover:bg-[#FAF6F0] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A641A]"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-44 rounded-xl border border-[#DDD4C5] bg-white shadow-lg"
                          >
                            <DropdownMenuItem asChild>
                              <Link
                                to="/restaurant/pms/rates-revenue"
                                search={calendarSearch}
                                className="cursor-pointer text-xs text-[#251605]"
                              >
                                Review Rate
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                to="/restaurant/pms/rates-revenue"
                                search={calendarSearch}
                                className="cursor-pointer text-xs text-[#251605]"
                              >
                                View Calendar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                to="/restaurant/pms/rates-revenue"
                                search={restrictionSearch}
                                className="cursor-pointer text-xs text-[#251605]"
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

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-[#FAF8F5]/80 px-4 py-3">
            <div className="flex items-center gap-3 text-xs text-[#756A5B]">
              <span>
                Showing <strong className="font-semibold text-[#251605]">{startEntry}</strong>–
                <strong className="font-semibold text-[#251605]">{endEntry}</strong> of{" "}
                <strong className="font-semibold text-[#251605]">{rows.length}</strong> entries
              </span>
              <div className="flex items-center gap-1.5 pl-3 border-l border-[#DDD4C5]">
                <span className="text-[#756A5B]">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded-md border border-[#DDD4C5] bg-white px-2 text-xs font-medium text-[#251605] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#8A641A]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="h-8 gap-1 rounded-lg border border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-sm disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1];
                    const showEllipsis = prevP && p - prevP > 1;

                    return (
                      <span key={p} className="flex items-center gap-1">
                        {showEllipsis ? (
                          <span className="px-1 text-xs text-[#756A5B]">…</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setPage(p)}
                          className={`size-8 rounded-lg text-xs font-medium transition-colors ${
                            page === p
                              ? "bg-[#251605] text-white"
                              : "border border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#FAF6F0]"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="h-8 gap-1 rounded-lg border border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-sm disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
