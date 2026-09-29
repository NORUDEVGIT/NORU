const ITEMS = [
  { label: "Override", swatch: "bg-[#C89933]" },
  { label: "CTA / CTD / Stop Sell / Min / Max", swatch: "bg-[#6B4A0A]" },
  { label: "Selected", swatch: "ring-2 ring-[#C89933] bg-white" },
  { label: "Available", swatch: "bg-emerald-100" },
  { label: "Limited", swatch: "bg-amber-100" },
  { label: "Low Remaining", swatch: "bg-rose-100" },
];

export function RateCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs font-medium text-[#5A4833] shadow-sm">
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded border border-[#DDD4C5] ${item.swatch}`} />
          {item.label}
        </span>
      ))}
      <span className="ml-auto text-xs text-[#756A5B]">Inventory bands, not demand.</span>
    </div>
  );
}
