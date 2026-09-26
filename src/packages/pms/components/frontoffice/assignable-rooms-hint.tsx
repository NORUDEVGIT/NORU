import { Button } from "@/shared/components/ui/button";
import {
  UNABLE_TO_LOAD_ELIGIBLE_ROOMS,
  noEligibleRoomsCopy,
  type AssignableListUiStatus,
} from "@/packages/pms/lib/fo-room-assignment";

export function AssignableRoomsHint({
  status,
  roomTypeLabel,
  onRetry,
  detail,
}: {
  status: AssignableListUiStatus;
  roomTypeLabel: string;
  onRetry: () => void;
  detail?: string | null;
}) {
  if (status === "loading") {
    return (
      <p className="text-xs text-muted-foreground" data-testid="fo-assignable-rooms-loading">
        Loading eligible rooms…
      </p>
    );
  }
  if (status === "error") {
    return (
      <div className="space-y-2" data-testid="fo-assignable-rooms-error">
        <p className="text-xs text-destructive">{UNABLE_TO_LOAD_ELIGIBLE_ROOMS}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (status === "empty") {
    return (
      <p className="text-xs text-destructive" data-testid="fo-assignable-rooms-empty">
        {noEligibleRoomsCopy(roomTypeLabel)}
      </p>
    );
  }
  return null;
}
