const ITEMS = [
  {
    label: "Override (OVR)",
    swatch: "border-[#C89933] border-l-4 border-l-[#C89933] bg-[#FFFDF7]",
  },
  { label: "CTA / CTD / Stop Sell / Min / Max", swatch: "bg-[#251605]" },
  { label: "Selected / Checked", swatch: "border-[#C89933] bg-[#FDF5E2] ring-2 ring-[#C89933]" },
  { label: "Available", swatch: "border-emerald-300 bg-emerald-100" },
  { label: "Limited", swatch: "border-amber-300 bg-amber-100" },
  { label: "Low Remaining", swatch: "border-rose-300 bg-rose-100" },
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
