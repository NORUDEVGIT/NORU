import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  formatRestrictionBeforeAfter,
  humanizeRestrictionField,
  humanizeRestrictionMessages,
  type RestrictionReviewRow,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";

export function RestrictionReviewTable({ rows }: { rows: RestrictionReviewRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-[#756A5B]">No preview results yet.</p>;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-[#DDD4C5] bg-white">
      <table className="min-w-max w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {[
              "Date",
              "Room Type",
              "Rate Plan",
              "Changed Fields",
              "Before → After",
              "Occ.",
              "Sold",
              "Avail.",
              "Validation",
            ].map((label) => (
              <th
                key={label}
                className="sticky top-0 z-10 whitespace-nowrap px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#5A4833]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {rows.map((row) => (
            <tr key={`${row.ratePlanId}|${row.date}`} className="border-t border-[#E8E1D7]">
              <td className="sticky left-0 bg-white px-2.5 py-2 text-xs font-medium text-[#251605]">
                {formatStayDate(row.date)}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#251605]">{row.roomTypeName || "—"}</td>
              <td className="px-2.5 py-2 text-xs font-medium text-[#251605]">
                {row.ratePlanCode || row.ratePlanName || "—"}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#251605]">
                {row.changedFields.length === 0
                  ? "—"
                  : row.changedFields.map(humanizeRestrictionField).join(", ")}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#251605]">
                {formatRestrictionBeforeAfter(row)}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#756A5B]">
                {row.occupancyPercent == null ? "—" : `${row.occupancyPercent}%`}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#756A5B]">
                {row.roomsSold == null ? "—" : row.roomsSold}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#756A5B]">
                {row.roomsAvailable == null ? "—" : row.roomsAvailable}
              </td>
              <td
                className={[
                  "px-2.5 py-2 text-xs font-medium",
                  row.validationStatus === "valid" ? "text-emerald-800" : "text-[#6B4A0A]",
                ].join(" ")}
              >
                {row.validationStatus === "valid"
                  ? "Valid"
                  : humanizeRestrictionMessages(row.validationMessages).join(" ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
