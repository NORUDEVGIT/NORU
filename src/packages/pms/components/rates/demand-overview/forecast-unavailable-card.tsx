import {
  DEMAND_FORECAST_UNAVAILABLE_COPY,
  DEMAND_FORECAST_UNAVAILABLE_TITLE,
} from "@/packages/pms/lib/revenue/demand-overview";

export function ForecastUnavailableCard() {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-[#F8F1E5] p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B651D]">Information</p>
      <h2 className="mt-1 text-sm font-semibold text-[#251605]">{DEMAND_FORECAST_UNAVAILABLE_TITLE}</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">{DEMAND_FORECAST_UNAVAILABLE_COPY}</p>
    </section>
  );
}
