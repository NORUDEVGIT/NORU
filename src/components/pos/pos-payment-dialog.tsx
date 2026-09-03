import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Delete, Hotel } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PosPaymentChoice =
  | { method: "cash"; tendered: number }
  | { method: "card"; reference: string }
  | { method: "room" };

/**
 * Touch payment flow. Cash quick-tender buttons are derived from the amount
 * due, so they work in whatever currency the property is configured with.
 */
export function PosPaymentDialog({
  open,
  total,
  busy,
  canChargeRoom,
  onClose,
  onConfirm,
  money,
}: {
  open: boolean;
  total: number;
  busy: boolean;
  canChargeRoom: boolean;
  onClose: () => void;
  onConfirm: (choice: PosPaymentChoice) => void;
  money: (value: number) => string;
}) {
  const [method, setMethod] = useState<"choose" | "cash" | "card">("choose");
  const [entry, setEntry] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (open) {
      setMethod("choose");
      setEntry("");
      setReference("");
    }
  }, [open]);

  const tendered = entry === "" ? 0 : Number(entry) / 100;
  const change = Math.max(0, Number((tendered - total).toFixed(2)));

  const quickTenders = useMemo(() => {
    const steps = [5, 10, 20, 50, 100];
    const values = new Set<number>();
    for (const step of steps) {
      const up = Math.ceil(total / step) * step;
      if (up > total) values.add(up);
    }
    return [...values].sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  function press(key: string) {
    if (key === "back") {
      setEntry((prev) => prev.slice(0, -1));
      return;
    }
    setEntry((prev) => (prev + key).replace(/^0+(?=\d)/, "").slice(0, 9));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Take payment</DialogTitle>
          <DialogDescription>
            Amount due <span className="font-semibold text-foreground">{money(total)}</span>
          </DialogDescription>
        </DialogHeader>

        {method === "choose" ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="h-16 w-full justify-start rounded-2xl text-lg font-bold"
              onClick={() => setMethod("cash")}
              disabled={busy}
            >
              <Banknote className="mr-3 size-6" /> CASH
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-16 w-full justify-start rounded-2xl text-lg font-bold"
              onClick={() => setMethod("card")}
              disabled={busy}
            >
              <CreditCard className="mr-3 size-6" /> CARD
            </Button>
            {canChargeRoom ? (
              <Button
                type="button"
                variant="outline"
                className="h-16 w-full justify-start rounded-2xl text-lg font-bold"
                onClick={() => onConfirm({ method: "room" })}
                disabled={busy}
              >
                <Hotel className="mr-3 size-6" /> CHARGE TO ROOM
              </Button>
            ) : null}
          </div>
        ) : null}

        {method === "cash" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Tendered</span>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {money(tendered)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>Change due</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {money(change)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setEntry(String(Math.round(total * 100)))}
                className="h-12 rounded-2xl border border-primary bg-primary/10 text-sm font-bold"
              >
                Exact
              </button>
              {quickTenders.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEntry(String(Math.round(value * 100)))}
                  className="h-12 rounded-2xl border border-border bg-card text-sm font-bold tabular-nums"
                >
                  {money(value)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key === "back" ? "Delete last digit" : key}
                  onClick={() => press(key)}
                  className={cn(
                    "grid h-14 place-items-center rounded-2xl border border-border bg-card text-xl font-bold active:scale-[0.97]",
                    key === "back" && "text-muted-foreground",
                  )}
                >
                  {key === "back" ? <Delete className="size-6" /> : key}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-14 rounded-2xl"
                onClick={() => setMethod("choose")}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                type="button"
                className="h-14 rounded-2xl text-base font-bold"
                disabled={busy || tendered < total}
                onClick={() => onConfirm({ method: "cash", tendered })}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}

        {method === "card" ? (
          <div className="space-y-4">
            <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Take {money(total)} on the card terminal, then confirm here. NORU records the sale as
              paid by card; it does not process the card itself.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pos-card-reference">Terminal reference (optional)</Label>
              <Input
                id="pos-card-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. last 4 digits or auth code"
                className="h-14 rounded-2xl text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-14 rounded-2xl"
                onClick={() => setMethod("choose")}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                type="button"
                className="h-14 rounded-2xl text-base font-bold"
                disabled={busy}
                onClick={() => onConfirm({ method: "card", reference })}
              >
                Payment taken
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
