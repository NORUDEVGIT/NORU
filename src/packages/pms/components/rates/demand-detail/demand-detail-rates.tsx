import type { DemandCalendarCell } from "@/packages/pms/lib/revenue/demand-calendar";
import { restrictionMarks } from "@/packages/pms/lib/revenue/restriction-calendar";

export function DemandDetailRates({
  cell,
  money,
}: {
  cell: DemandCalendarCell;
  money: (value: number) => string;
}) {
  const marks = cell.marks.length > 0 ? cell.marks : restrictionMarks(cell.restriction);
  const overrideCount = cell.rates.filter((row) => row.overrideActive).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <p>
          <span className="text-muted-foreground">Overrides</span>
          <br />
          {overrideCount}
        </p>
        <p>
          <span className="text-muted-foreground">Restrictions</span>
          <br />
          {marks.length > 0 ? marks.map((mark) => mark.label).join(" · ") : "None"}
        </p>
      </div>

      {cell.rates.length === 0 ? (
        <p className="text-xs text-muted-foreground">No rate plans are configured for this room type.</p>
      ) : (
        <table className="w-full text-left text-[11px]">
          <thead className="border-b border-[#E8E1D7] text-[9px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 font-semibold">Plan</th>
              <th className="py-1.5 font-semibold">Effective rate</th>
              <th className="py-1.5 font-semibold">Override</th>
            </tr>
          </thead>
          <tbody>
            {cell.rates.map((row) => (
              <tr key={row.ratePlanId} className="border-b border-[#E8E1D7]/70">
                <td className="py-1.5">
                  <div className="font-medium text-[#251605]">{row.code}</div>
                  <div className="text-[10px] text-muted-foreground">{row.name}</div>
                </td>
                <td className="py-1.5">{money(row.effectiveRate)}</td>
                <td className="py-1.5">{row.overrideActive ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
