import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  postOrderRoomCharge,
  reverseOrderRoomCharge,
  searchChargeableStays,
  type ChargeableStay,
} from "@/integrations/cross-package/room-charge.functions";
import { useMoney } from "@/core/state/restaurant-context";

export function ChargeToRoomDialog({
  restaurantId,
  orderId,
  orderNumber,
  orderTotal,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  orderId: string;
  orderNumber: number;
  orderTotal: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ChargeableStay | null>(null);

  const fetchStays = useServerFn(searchChargeableStays);
  const post = useServerFn(postOrderRoomCharge);

  const stays = useQuery({
    queryKey: ["chargeable-stays", restaurantId, search],
    queryFn: () => fetchStays({ data: { restaurantId, search } }),
    enabled: open,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error("Pick a room first.");
      return post({ data: { restaurantId, orderId, folioId: picked.folioId } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.already ? "This order was already charged to the room." : "Charged to room");
      setPicked(null);
      setSearch("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = stays.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Charge to room</DialogTitle>
          <DialogDescription>
            Post this order to a checked-in guest&apos;s folio. Only stays that are checked in with an
            open folio are listed.
          </DialogDescription>
        </DialogHeader>

        {picked ? (
          <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
            <Line label="Room" value={picked.roomNumber} />
            <Line label="Guest" value={picked.guestName} />
            <Line label="Reservation" value={picked.confirmationNumber} />
            <Line label="Folio" value={picked.folioNumber} />
            <Line label="Folio balance" value={money(picked.folioBalance)} />
            <Line label="Restaurant order" value={`#${orderNumber}`} />
            <div className="border-t border-border pt-2">
              <Line label="Order total" value={money(orderTotal)} strong />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="stay-search">Search</Label>
              <Input
                id="stay-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Room number, guest name or confirmation number"
              />
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {stays.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading stays…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No checked-in stay with an open folio matches.
                </p>
              ) : (
                rows.map((s) => (
                  <button
                    key={s.folioId}
                    type="button"
                    onClick={() => setPicked(s)}
                    className="w-full rounded-xl border border-border p-3 text-left text-sm transition hover:bg-muted/50"
                  >
                    <span className="font-medium">Room {s.roomNumber}</span> · {s.guestName}
                    <span className="block text-xs text-muted-foreground">
                      {s.confirmationNumber} · {s.folioNumber} · Balance {money(s.folioBalance)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => (picked ? setPicked(null) : onClose())}>
            {picked ? "Back" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!picked || mutation.isPending}>
            Confirm charge to room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseRoomChargeDialog({
  restaurantId,
  orderId,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  orderId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const reverse = useServerFn(reverseOrderRoomCharge);

  const mutation = useMutation({
    mutationFn: () => {
      if (reason.trim().length < 3) throw new Error("Give a reason for the reversal.");
      return reverse({ data: { restaurantId, orderId, reason: reason.trim() } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room charge reversed");
      setReason("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse room charge</DialogTitle>
          <DialogDescription>
            The original posting stays on the folio. An opposite entry is added so the ledger balances,
            and the order goes back to direct payment.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="reversal-reason">Reason</Label>
          <Input
            id="reversal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Charged to the wrong room"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            Reverse charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-display text-lg" : "font-medium"}>{value}</span>
    </div>
  );
}
