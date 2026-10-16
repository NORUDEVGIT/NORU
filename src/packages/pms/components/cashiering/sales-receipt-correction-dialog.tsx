import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function SalesReceiptCorrectionDialog({
  open,
  currentAmount,
  needsConfirmation = false,
  money,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  currentAmount: number;
  needsConfirmation?: boolean;
  money: (value: number) => string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    amount: number,
    idempotencyKey: string,
    providerUnregisteredConfirmed: boolean,
  ) => void;
}) {
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(currentAmount.toFixed(2));
    setIdempotencyKey(crypto.randomUUID());
    setConfirmed(false);
    setError(null);
  }, [open, currentAmount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct allocation</DialogTitle>
          <DialogDescription>
            Replace the failed sales-receipt allocation with a new amount. The folio balance does
            not change. The invoice outstanding is recalculated, and the new line can be registered.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Current allocation {money(currentAmount)}</p>
          <Label htmlFor="sales-receipt-correction-amount">Corrected amount</Label>
          <Input
            id="sales-receipt-correction-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {needsConfirmation ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>
                The provider returned an error without a clear rejection. If it registered this
                receipt anyway, correcting the allocation registers the payment twice.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <Checkbox
                  id="sales-receipt-provider-unregistered"
                  checked={confirmed}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                <Label htmlFor="sales-receipt-provider-unregistered" className="leading-snug">
                  I checked the provider and this receipt is not registered there.
                </Label>
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || (needsConfirmation && !confirmed)}
            onClick={() => {
              const next = Number(amount);
              if (!Number.isFinite(next) || next <= 0) {
                setError("Enter an amount greater than zero.");
                return;
              }
              setError(null);
              onConfirm(next, idempotencyKey, needsConfirmation && confirmed);
            }}
          >
            {pending ? "Saving…" : "Save corrected allocation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
