import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { closeFolio, postFolioEntry } from "@/lib/cashiering.functions";
import type { TransactionType } from "@/lib/cashiering.server";
import { useMoney } from "@/core/state/restaurant-context";

const PAYMENT_METHODS = ["Cash", "Card", "Bank transfer", "Mobile money", "Other"];

const COPY: Record<TransactionType, { title: string; description: string; cta: string }> = {
  charge: {
    title: "Post a charge",
    description: "Add an extra charge to this folio, such as laundry or minibar.",
    cta: "Post charge",
  },
  payment: {
    title: "Receive a payment",
    description: "Record money received from the guest against this folio.",
    cta: "Receive payment",
  },
  deposit: {
    title: "Add a deposit",
    description: "Record a prepayment or security deposit held against this folio.",
    cta: "Add deposit",
  },
  refund: {
    title: "Post a refund",
    description: "Return money to the guest. A refund can't exceed what has been paid.",
    cta: "Post refund",
  },
  adjustment: {
    title: "Post an adjustment",
    description: "Correct the folio. Use a negative amount to reduce the balance.",
    cta: "Post adjustment",
  },
  discount: {
    title: "Apply a discount",
    description: "Reduce what the guest owes on this folio.",
    cta: "Apply discount",
  },
};

export function FolioEntryDialog({
  restaurantId,
  folioId,
  type,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  type: TransactionType | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]!);

  const post = useServerFn(postFolioEntry);
  const copy = type ? COPY[type] : null;
  const needsMethod = type === "payment" || type === "deposit" || type === "refund";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!type) throw new Error("Pick a transaction type.");
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) throw new Error("Enter an amount.");
      if (type !== "adjustment" && value <= 0) throw new Error("Enter an amount greater than zero.");
      if (description.trim() === "") throw new Error("Enter a description.");
      return post({
        data: {
          restaurantId,
          folioId,
          type,
          amount: value,
          description: description.trim(),
          ...(needsMethod ? { method } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Posted to folio");
      setAmount("");
      setDescription("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open && type !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="entry-amount">Amount</Label>
            <Input
              id="entry-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="entry-description">Description</Label>
            <Input
              id="entry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "charge" ? "Laundry service" : "Reference or note"}
            />
          </div>
          {needsMethod ? (
            <div>
              <Label htmlFor="entry-method">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="entry-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {copy?.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseFolioDialog({
  restaurantId,
  folioId,
  balance,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  balance: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const closeFn = useServerFn(closeFolio);
  const settled = Math.abs(balance) < 0.01;

  const mutation = useMutation({
    mutationFn: () => closeFn({ data: { restaurantId, folioId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Folio closed");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close folio</DialogTitle>
          <DialogDescription>
            A folio can only be closed once its balance is settled. Nothing can be posted afterwards.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Current balance: <span className="font-medium">{money(balance)}</span>
        </p>
        {!settled ? (
          <p className="text-sm text-destructive">
            Settle the outstanding balance before closing this folio.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!settled || mutation.isPending}>
            Close folio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
