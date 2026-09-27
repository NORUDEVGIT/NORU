import {
  BULK_RESTRICTION_CTA_CTD_COPY,
  BULK_RESTRICTION_EXISTING_RESERVATION_COPY,
  BULK_RESTRICTION_IMPACT_COPY,
  BULK_RESTRICTION_STOP_SELL_COPY,
  BULK_RESTRICTION_STOP_SELL_OCCUPIED_COPY,
  humanizeRestrictionField,
  type RestrictionPreviewSummary,
  type RestrictionReviewRow,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import { RestrictionReviewTable } from "./restriction-review-table";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#E8E1D7] bg-white px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#251605]">{value}</p>
    </div>
  );
}

export function RestrictionReviewPanel({
  rows,
  summary,
  loading,
  error,
  showCtaCtdWarning,
  showStopSellWarning,
}: {
  rows: RestrictionReviewRow[];
  summary: RestrictionPreviewSummary | null;
  loading: boolean;
  error: string | null;
  showCtaCtdWarning: boolean;
  showStopSellWarning: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[12px] font-semibold text-[#251605]">Restriction impact</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">{BULK_RESTRICTION_IMPACT_COPY}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{BULK_RESTRICTION_EXISTING_RESERVATION_COPY}</p>
      </div>

      {loading ? <p className="text-[11px] text-muted-foreground">Building preview…</p> : null}
      {error ? <p className="text-[11px] text-[#6B4A0A]">{error}</p> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Card label="Affected dates" value={String(summary.affectedDates)} />
          <Card label="Rate plans" value={String(summary.affectedRatePlans)} />
          <Card label="Room types" value={String(summary.affectedRoomTypes)} />
          <Card
            label="Changed fields"
            value={
              summary.changedFields.length === 0
                ? "—"
                : summary.changedFields.map(humanizeRestrictionField).join(", ")
            }
          />
          <Card label="Valid targets" value={String(summary.validTargets)} />
          <Card label="Invalid targets" value={String(summary.invalidTargets)} />
        </div>
      ) : null}

      {showCtaCtdWarning ? (
        <p className="text-[10px] text-[#6B4A0A]">{BULK_RESTRICTION_CTA_CTD_COPY}</p>
      ) : null}
      {showStopSellWarning ? (
        <p className="text-[10px] text-[#6B4A0A]">{BULK_RESTRICTION_STOP_SELL_COPY}</p>
      ) : null}
      {summary && summary.occupiedStopSellCount > 0 ? (
        <p className="text-[10px] text-[#6B4A0A]">{BULK_RESTRICTION_STOP_SELL_OCCUPIED_COPY}</p>
      ) : null}

      <RestrictionReviewTable rows={rows} />
    </div>
  );
}
