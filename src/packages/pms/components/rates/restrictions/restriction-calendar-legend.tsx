const ITEMS = [
  { label: "Stop Sell", swatch: "bg-rose-600" },
  { label: "CTA / CTD", swatch: "bg-amber-500" },
  { label: "Min / Max stay", swatch: "bg-[#251605]" },
  { label: "Open", swatch: "bg-[#F7F4EE]" },
  { label: "Selected", swatch: "ring-2 ring-[#C89933] bg-white" },
];

export function RestrictionCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm border border-[#E8E1D7] ${item.swatch}`} />
          {item.label}
        </span>
      ))}
      <span>Operational restrictions, not demand.</span>
    </div>
  );
}
