const ITEMS = [
  { label: "Stop Sell", swatch: "bg-rose-600" },
  { label: "CTA / CTD", swatch: "bg-amber-500" },
  { label: "Min / Max stay", swatch: "bg-[#251605]" },
  { label: "Open", swatch: "bg-[#F7F4EE]" },
  { label: "Selected", swatch: "ring-2 ring-[#C89933] bg-white" },
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

      <span className="ml-auto text-xs text-[#756A5B]">
        Operational restrictions, not demand
      </span>
    </div>
  );
}
