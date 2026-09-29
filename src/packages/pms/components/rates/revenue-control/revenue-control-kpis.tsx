import {
  BadgeDollarSign,
  BedDouble,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  DoorOpen,
  Info,
  ShieldAlert,
  Sliders,
  TrendingUp,
} from "lucide-react";
import type { RevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control";

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-xl border border-[#DDD4C5] bg-white px-3.5 py-3.5 shadow-sm">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[#5A4833]">{label}</p>
        <p className="mt-0.5 font-display text-xl font-semibold leading-tight tracking-tight text-[#251605]">
          {value}
        </p>
      </div>
    </div>
  );
}

export function RevenueControlKpis({
  data,
  money,
}: {
  data: RevenueControlWorkspace;
  money: (value: number) => string;
}) {
  const { summary, slotMetrics } = data;

  return (
    <div className="space-y-3">
      {data.rangeClamped ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
          <Info className="size-4 shrink-0 text-amber-600" />
          <span>
            Range clamped to 62 days ({data.fromDate} – {data.toDate}).
          </span>
        </div>
      ) : null}

      {/* Layer 4: Primary KPI Strip (6 Cards) */}
      <section aria-label="Primary Revenue KPIs">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <KpiCard
            icon={CircleDollarSign}
            label="Booked Room Revenue"
            value={money(summary.roomRevenue)}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <KpiCard
            icon={BedDouble}
            label="Sold Room Nights"
            value={summary.soldRoomNights.toLocaleString()}
            tone="bg-[#EFECE6] text-[#423321]"
          />
          <KpiCard
            icon={DoorOpen}
            label="Occupancy"
            value={`${summary.occupancyPercent}%`}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <KpiCard
            icon={BadgeDollarSign}
            label="ADR"
            value={money(summary.adr)}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <KpiCard
            icon={TrendingUp}
            label="RevPAR"
            value={money(summary.revPar)}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <KpiCard
            icon={CalendarDays}
            label="Available Room Nights"
            value={summary.availableRoomNights.toLocaleString()}
            tone="bg-[#EFECE6] text-[#423321]"
          />
        </div>
      </section>

      {/* Layer 5: Secondary KPI Strip (3 Cards) */}
      <section aria-label="Secondary Inventory & Restrictions KPIs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={Boxes}
            label="Remaining Inventory"
            value={slotMetrics.remainingRoomNights.toLocaleString()}
            tone="bg-[#EFECE6] text-[#423321]"
          />
          <KpiCard
            icon={ShieldAlert}
            label="Active Restrictions"
            value={slotMetrics.activeRestrictionCount.toLocaleString()}
            tone={
              slotMetrics.activeRestrictionCount > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-[#EFECE6] text-[#423321]"
            }
          />
          <KpiCard
            icon={Sliders}
            label="Override Count"
            value={slotMetrics.overrideCount.toLocaleString()}
            tone={
              slotMetrics.overrideCount > 0
                ? "bg-[#F4E9D0] text-[#8A641A]"
                : "bg-[#EFECE6] text-[#423321]"
            }
          />
        </div>
      </section>

      {/* Layer 6: Pricing Snapshot Info Strip */}
      <div className="flex items-center gap-2.5 rounded-lg border border-[#F4E9D0] bg-[#FDF9F0] px-4 py-2.5 text-sm text-[#5A4833]">
        <Info className="size-4 shrink-0 text-[#8A641A]" />
        <span>
          Pricing snapshot coverage:{" "}
          <strong className="font-semibold text-[#251605]">{summary.pricedShare}%</strong>.
          {summary.pricedShare < 100
            ? " Unpriced stays affect occupancy but not booked revenue."
            : " All sold room nights carry verified pricing snapshots."}
        </span>
      </div>
    </div>
  );
}
