const ITEMS = [
  { label: "Stop Sell (SS)", swatch: "border-rose-400 bg-rose-600" },
  { label: "CTA / CTD", swatch: "border-amber-400 bg-amber-500" },
  { label: "Min / Max stay", swatch: "border-indigo-400 bg-indigo-600" },
  { label: "Open", swatch: "border-emerald-300 bg-emerald-100" },
  { label: "Selected / Checked", swatch: "border-[#C89933] bg-[#FDF5E2] ring-2 ring-[#C89933]" },
];

export function RestrictionCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs font-medium text-[#5A4833] shadow-sm">
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded border border-[#DDD4C5] ${item.swatch}`} />
          {item.label}
        </span>
      ))}

      <span className="ml-auto text-xs text-[#756A5B]">Operational restrictions, not demand</span>
    </div>
  );
}
