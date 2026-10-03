import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  humanizeRateChangeMessages,
  restrictionMarks,
  type BulkReviewRow,
} from "@/packages/pms/lib/revenue/bulk-rate-change";

export function BulkReviewTable({
  rows,
  money,
}: {
  rows: BulkReviewRow[];
  money: (value: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-[#756A5B]">No preview results yet.</p>;
  }

  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-[#DDD4C5] bg-white">
      <table className="min-w-max w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {[
              "Date",
              "Room Type",
              "Rate Plan",
              "Current",
              "New",
              "Delta",
              "%",
              "Occ.",
              "Avail.",
              "Restrictions",
              "Validation",
            ].map((label) => (
              <th
                key={label}
                className="sticky top-0 z-10 whitespace-nowrap bg-[#F7F4EE] px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {rows.map((row) => {
            const deltaClass =
              row.absoluteDelta == null
                ? "text-[#251605]"
                : row.absoluteDelta > 0
                  ? "font-semibold text-emerald-800"
                  : row.absoluteDelta < 0
                    ? "font-semibold text-rose-800"
                    : "text-[#251605]";
            return (
              <tr key={`${row.ratePlanId}|${row.date}`} className="border-t border-[#E8E1D7]">
                <td className="sticky left-0 whitespace-nowrap bg-white px-2.5 py-2 text-xs font-medium text-[#251605]">
                  {formatStayDate(row.date)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs text-[#251605]">
                  {row.roomTypeName ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs font-medium text-[#251605]">
                  {row.ratePlanCode ?? row.ratePlanName ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs tabular-nums text-[#251605]">
                  {row.currentEffectiveRate == null ? "—" : money(row.currentEffectiveRate)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs font-semibold tabular-nums text-[#251605]">
                  {row.proposedEffectiveRate == null ? "—" : money(row.proposedEffectiveRate)}
                </td>
                <td
                  className={[
                    "whitespace-nowrap px-2.5 py-2 text-xs tabular-nums",
                    deltaClass,
                  ].join(" ")}
                >
                  {row.absoluteDelta == null ? "—" : money(row.absoluteDelta)}
                </td>
                <td
                  className={[
                    "whitespace-nowrap px-2.5 py-2 text-xs tabular-nums",
                    deltaClass,
                  ].join(" ")}
                >
                  {row.percentageDelta == null ? "—" : `${row.percentageDelta}%`}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs text-[#5A4833]">
                  {row.occupancyPercent == null ? "—" : `${row.occupancyPercent}%`}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs text-[#5A4833]">
                  {row.roomsAvailable == null ? "—" : `${row.roomsSold ?? 0}/${row.roomsAvailable}`}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-xs text-[#5A4833]">
                  {restrictionMarks(row).join(" · ") || "—"}
                </td>
                <td
                  className={[
                    "whitespace-nowrap px-2.5 py-2 text-xs font-medium",
                    row.validationStatus === "valid" ? "text-emerald-800" : "text-[#6B4A0A]",
                  ].join(" ")}
                >
                  {row.validationStatus === "valid"
                    ? "Valid"
                    : humanizeRateChangeMessages(row.validationMessages).join(" ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
