const ITEMS = [
  { label: "Stop Sell", swatch: "bg-rose-600" },
  { label: "CTA / CTD", swatch: "bg-amber-500" },
  { label: "Min / Max stay", swatch: "bg-[#251605]" },
  { label: "Open", swatch: "bg-[#F7F4EE]" },
  { label: "Selected", swatch: "ring-2 ring-[#C89933] bg-white" },
];

export function RestrictionCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E8E1D7] bg-white px-4 py-3 text-[10px] text-muted-foreground shadow-sm">
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded border border-[#E8E1D7] ${item.swatch}`}
          />
          {item.label}
        </span>
      ))}

      <span className="ml-auto text-[9px]">
        Operational restrictions, not demand
      </span>
    </div>
  );
}
