import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestPaymentAllocationDrawer } from "@/packages/pms/components/cashiering/guest-payment-allocation-drawer";
import {
  EndOfDayFiscalSheet,
  type EndOfDayFiscalTarget,
} from "@/packages/pms/components/nightaudit/end-of-day-fiscal-sheet";
import { FoCheckInV2Workspace } from "@/packages/pms/components/frontoffice/fo-checkin-v2-workspace";
import { FoCheckOutWorkspace } from "@/packages/pms/components/frontoffice/fo-check-out-workspace";
import { getFolioWorkspace } from "@/packages/pms/lib/cashiering.functions";
import { getFrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

export type EndOfDayInlineAction =
  | { kind: "check-in"; reservationId: string; reservationRoomId?: string }
  | { kind: "check-out"; reservationId: string; reservationRoomId?: string }
  | { kind: "allocate"; folioId: string; paymentId?: string }
  | ({ kind: "fiscal" } & EndOfDayFiscalTarget);

export function EndOfDayInlineHost({
  action,
  restaurantId,
  businessDate,
  money,
  dateTime,
  onClose,
  onRefresh,
}: {
  action: EndOfDayInlineAction;
  restaurantId: string;
  businessDate: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  if (action.kind === "check-in") {
    return (
      <FoCheckInV2Workspace
        restaurantId={restaurantId}
        reservationId={action.reservationId}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        {...(action.reservationRoomId ? { reservationRoomId: action.reservationRoomId } : {})}
      />
    );
  }
  if (action.kind === "check-out") {
    return (
      <CheckOutHost
        restaurantId={restaurantId}
        businessDate={businessDate}
        reservationId={action.reservationId}
        {...(action.reservationRoomId ? { reservationRoomId: action.reservationRoomId } : {})}
        onClose={onClose}
      />
    );
  }
  if (action.kind === "fiscal") {
    return (
      <EndOfDayFiscalSheet
        restaurantId={restaurantId}
        target={action}
        onClose={onClose}
        onRefresh={onRefresh ?? (() => undefined)}
      />
    );
  }
  return (
    <AllocateHost
      restaurantId={restaurantId}
      folioId={action.folioId}
      paymentId={action.paymentId ?? null}
      money={money}
      dateTime={dateTime}
      onClose={onClose}
    />
  );
}

function CheckOutHost({
  restaurantId,
  businessDate,
  reservationId,
  reservationRoomId,
  onClose,
}: {
  restaurantId: string;
  businessDate: string;
  reservationId: string;
  reservationRoomId?: string;
  onClose: () => void;
}) {
  const fetchStay = useServerFn(getFrontOfficeStay);
  const stayQuery = useQuery({
    queryKey: ["end-of-day-stay", restaurantId, reservationId, businessDate],
    queryFn: () => fetchStay({ data: { restaurantId, reservationId, today: businessDate } }),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(businessDate),
    retry: false,
  });

  if (stayQuery.data) {
    return (
      <FoCheckOutWorkspace
        restaurantId={restaurantId}
        stay={stayQuery.data}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        {...(reservationRoomId ? { initialReservationRoomId: reservationRoomId } : {})}
      />
    );
  }

  const message = stayQuery.isError
    ? (stayQuery.error as Error).message
    : stayQuery.isFetched
      ? "This stay could not be opened for check-out."
      : "Opening check-out…";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="z-[70]">
        <DialogHeader>
          <DialogTitle>Check Out</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocateHost({
  restaurantId,
  folioId,
  paymentId,
  money,
  dateTime,
  onClose,
}: {
  restaurantId: string;
  folioId: string;
  paymentId: string | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onClose: () => void;
}) {
  const fetchWorkspace = useServerFn(getFolioWorkspace);
  const folioQuery = useQuery({
    queryKey: ["end-of-day-folio", restaurantId, folioId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, folioId } }),
    retry: false,
  });
  const workspace = folioQuery.data ?? null;
  const payments = workspace
    ? workspace.folio.transactions
        .filter((row) => row.type === "payment" || row.type === "deposit")
        .map((row) => {
          const refunded = workspace.folio.transactions
            .filter((line) => line.type === "refund" && line.originalTransactionId === row.id)
            .reduce((sum, line) => sum + line.amount, 0);
          const available =
            Math.round(
              (-row.amount - refunded - (workspace.paymentAllocationNets[row.id] ?? 0)) * 100,
            ) / 100;
          return {
            id: row.id,
            label: `${row.type === "deposit" ? "Deposit" : "Payment"} · ${row.description || row.type}`,
            available,
            kind: row.type === "deposit" ? ("deposit" as const) : ("payment" as const),
          };
        })
        .filter((row) => row.available > 0.009)
    : [];

  if (!workspace) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="z-[70]">
          <DialogHeader>
            <DialogTitle>Allocate</DialogTitle>
            <DialogDescription>
              {folioQuery.isError
                ? (folioQuery.error as Error).message
                : folioQuery.isFetched
                  ? "This folio could not be opened for allocation."
                  : "Opening allocation…"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <GuestPaymentAllocationDrawer
      open
      restaurantId={restaurantId}
      folioId={folioId}
      paymentId={paymentId}
      payments={payments}
      focusInvoiceId={null}
      money={money}
      dateTime={dateTime}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}
