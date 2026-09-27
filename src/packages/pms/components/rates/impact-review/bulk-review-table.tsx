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
    return <p className="text-[11px] text-muted-foreground">No preview results yet.</p>;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-md border border-[#E8E1D7] bg-white">
      <table className="min-w-max w-full border-collapse">
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
                className="sticky top-0 z-10 whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const deltaClass =
              row.absoluteDelta == null
                ? "text-[#251605]"
                : row.absoluteDelta > 0
                  ? "text-emerald-800"
                  : row.absoluteDelta < 0
                    ? "text-rose-800"
                    : "text-[#251605]";
            return (
              <tr key={`${row.ratePlanId}|${row.date}`} className="border-t border-[#E8E1D7]">
                <td className="sticky left-0 bg-white px-2 py-1 text-[10px] text-[#251605]">
                  {formatStayDate(row.date)}
                </td>
                <td className="px-2 py-1 text-[10px] text-[#251605]">{row.roomTypeName ?? "—"}</td>
                <td className="px-2 py-1 text-[10px] text-[#251605]">{row.ratePlanCode ?? row.ratePlanName ?? "—"}</td>
                <td className="px-2 py-1 text-[10px] text-[#251605]">
                  {row.currentEffectiveRate == null ? "—" : money(row.currentEffectiveRate)}
                </td>
                <td className="px-2 py-1 text-[10px] text-[#251605]">
                  {row.proposedEffectiveRate == null ? "—" : money(row.proposedEffectiveRate)}
                </td>
                <td className={["px-2 py-1 text-[10px]", deltaClass].join(" ")}>
                  {row.absoluteDelta == null ? "—" : money(row.absoluteDelta)}
                </td>
                <td className={["px-2 py-1 text-[10px]", deltaClass].join(" ")}>
                  {row.percentageDelta == null ? "—" : `${row.percentageDelta}%`}
                </td>
                <td className="px-2 py-1 text-[10px] text-muted-foreground">
                  {row.occupancyPercent == null ? "—" : `${row.occupancyPercent}%`}
                </td>
                <td className="px-2 py-1 text-[10px] text-muted-foreground">
                  {row.roomsAvailable == null ? "—" : `${row.roomsSold ?? 0}/${row.roomsAvailable}`}
                </td>
                <td className="px-2 py-1 text-[10px] text-muted-foreground">
                  {restrictionMarks(row).join(" · ") || "—"}
                </td>
                <td
                  className={[
                    "px-2 py-1 text-[10px]",
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
