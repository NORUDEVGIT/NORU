import {
  BULK_RATE_CHANGE_IMPACT_COPY,
  type BulkPreviewSummary,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import type { BulkReviewRow } from "@/packages/pms/lib/revenue/bulk-rate-change";
import { BulkReviewTable } from "./bulk-review-table";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DDD4C5] bg-white px-3 py-2">
      <p className="text-xs font-medium text-[#756A5B]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#251605]">{value}</p>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#251605]">Rate change impact</h3>
        <p className="mt-1 text-xs text-[#756A5B]">{BULK_RATE_CHANGE_IMPACT_COPY}</p>
      </div>

      {loading ? <p className="text-xs text-[#756A5B]">Building preview…</p> : null}
      {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
