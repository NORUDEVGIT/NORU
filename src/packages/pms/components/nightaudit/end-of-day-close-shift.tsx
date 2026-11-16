import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CloseShiftForm } from "@/packages/pms/components/cashiering/cashier-control-panel";
import { listCashierShifts } from "@/packages/pms/lib/cashiering.functions";
import { Dialog, DialogContent } from "@/shared/components/ui/dialog";

export function EndOfDayCloseShiftDialog({
  open,
  restaurantId,
  shiftId,
  businessDate,
  money,
  dateTime,
  onClose,
}: {
  open: boolean;
  restaurantId: string;
  shiftId: string;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchShifts = useServerFn(listCashierShifts);
  const shiftsQuery = useQuery({
    queryKey: ["cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });
  const shift = shiftsQuery.data?.find((row) => row.id === shiftId && row.status === "open") ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-xl border border-[#E8E1D7] bg-white p-0 shadow-lg"
        data-testid="end-of-day-close-shift-dialog"
      >
        {shiftsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading the cashier shift…</p>
        ) : null}
        {shiftsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">{(shiftsQuery.error as Error).message}</p>
        ) : null}
        {!shiftsQuery.isLoading && !shiftsQuery.isError ? (
          <CloseShiftForm
            restaurantId={restaurantId}
            shift={shift}
            businessDate={businessDate}
            money={money}
            dateTime={dateTime}
            now={Date.now()}
            onCancel={onClose}
            onClosed={() => {
              void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
              void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
