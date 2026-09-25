import { BULK_RATE_CHANGE_IMPACT_COPY, type BulkPreviewSummary } from "@/packages/pms/lib/revenue/bulk-rate-change";
import type { BulkReviewRow } from "@/packages/pms/lib/revenue/bulk-rate-change";
import { BulkReviewTable } from "./bulk-review-table";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#E8E1D7] bg-white px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#251605]">{value}</p>
    </div>
  );
}

export function BulkReviewPanel({
  rows,
  summary,
  loading,
  error,
  money,
}: {
  rows: BulkReviewRow[];
  summary: BulkPreviewSummary | null;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[12px] font-semibold text-[#251605]">Rate change impact</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">{BULK_RATE_CHANGE_IMPACT_COPY}</p>
      </div>

      {loading ? <p className="text-[11px] text-muted-foreground">Building preview…</p> : null}
      {error ? <p className="text-[11px] text-[#6B4A0A]">{error}</p> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Card label="Affected dates" value={String(summary.affectedDates)} />
          <Card label="Rate plans" value={String(summary.affectedRatePlans)} />
          <Card label="Room types" value={String(summary.affectedRoomTypes)} />
          <Card label="Override cells" value={String(summary.targetCount)} />
          <Card label="Valid targets" value={String(summary.validTargets)} />
          <Card label="Invalid targets" value={String(summary.invalidTargets)} />
          {summary.averageAbsoluteDelta != null ? (
            <Card label="Average rate change" value={money(summary.averageAbsoluteDelta)} />
          ) : null}
        </div>
      ) : null}

      <BulkReviewTable rows={rows} money={money} />
    </div>
  );
}
