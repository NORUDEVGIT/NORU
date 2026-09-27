import type { PickupWorkspace } from "@/packages/pms/lib/revenue/pickup-pace";
import {
  PICKUP_MISSING_PRIOR,
  PICKUP_NO_SNAPSHOTS,
  PICKUP_REQUIRES_TWO_SNAPSHOTS,
  pickupHistoryFromCopy,
  pickupWindowUnavailableCopy,
} from "@/packages/pms/lib/revenue/pickup-pace";

export function PickupHistoryStatus({ data }: { data: PickupWorkspace }) {
  const reasonCopy =
    data.historyReason === "no_snapshots"
      ? PICKUP_NO_SNAPSHOTS
      : data.historyReason === "single_snapshot"
        ? PICKUP_REQUIRES_TWO_SNAPSHOTS
        : data.historyReason === "missing_prior_as_of"
          ? `${PICKUP_MISSING_PRIOR} ${pickupWindowUnavailableCopy(data.windowDays)}`
          : null;

  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[#251605]">
        <p>
          <span className="text-muted-foreground">Current Snapshot:</span> {data.currentAsOf ?? "unavailable"}
        </p>
        <p>
          <span className="text-muted-foreground">Compared With:</span> {data.priorAsOf ?? "unavailable"}
        </p>
      </div>
      {data.snapshotHistoryStartsAt ? (
        <p className="mt-2 text-[10px] text-muted-foreground">{pickupHistoryFromCopy(data.snapshotHistoryStartsAt)}</p>
      ) : (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Pickup history starts after the first completed business-date snapshot.
        </p>
      )}
      {reasonCopy ? <p className="mt-2 text-xs text-muted-foreground">{reasonCopy}</p> : null}
    </section>
  );
}
