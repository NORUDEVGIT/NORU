import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Supplier } from "@/lib/suppliers.functions";
import type { InventoryItem } from "@/lib/inventory.functions";
import type { PurchaseOrderDetail } from "@/lib/purchasing.functions";

export interface PoLineDraft {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
}

export interface PoFormValues {
  supplierId: string;
  expectedDeliveryDate: string;
  notes: string;
  lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
}

const emptyLine: PoLineDraft = { inventoryItemId: "", quantity: "", unitCost: "" };

export function PurchaseOrderFormDialog({
  open,
  order,
  suppliers,
  items,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  order: PurchaseOrderDetail | null;
  suppliers: Supplier[];
  items: InventoryItem[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: PoFormValues) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLineDraft[]>([{ ...emptyLine }]);

  useEffect(() => {
    if (!open) return;
    setSupplierId(order?.supplierId ?? "");
    setExpected(order?.expectedDeliveryDate ?? "");
    setNotes(order?.notes ?? "");
    setLines(
      order && order.lines.length
        ? order.lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: String(l.orderedQuantity),
            unitCost: String(l.unitCost),
          }))
        : [{ ...emptyLine }],
    );
  }, [open, order]);

  function setLine(index: number, patch: Partial<PoLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const parsed = lines
    .filter((l) => l.inventoryItemId && Number(l.quantity) > 0)
    .map((l) => ({
      inventoryItemId: l.inventoryItemId,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost || 0),
    }));
  const estimatedTotal = parsed.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const valid = !!supplierId && parsed.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? `Edit ${order.poNumber}` : "New purchase order"}</DialogTitle>
          <DialogDescription>
            Draft orders can be edited freely. Totals are recalculated on the server from these lines.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-expected">Expected delivery</Label>
              <Input id="po-expected" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Line items</Label>
            {lines.map((line, index) => {
              const item = items.find((i) => i.id === line.inventoryItemId);
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_100px_120px_40px] sm:items-end">
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Item</span>
                    <Select
                      value={line.inventoryItemId}
                      onValueChange={(v) => setLine(index, { inventoryItemId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} ({i.unitCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Qty {item ? `(${item.unitCode})` : ""}</span>
                    <Input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => setLine(index, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Unit cost</span>
                    <Input
                      inputMode="decimal"
                      value={line.unitCost}
                      onChange={(e) => setLine(index, { unitCost: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}>
              Add line
            </Button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <p className="text-sm text-muted-foreground">
            Estimated total <span className="font-medium tabular-nums">{estimatedTotal.toFixed(2)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!valid || submitting}
            onClick={() =>
              onSubmit({
                supplierId,
                expectedDeliveryDate: expected,
                notes,
                lines: parsed,
              })
            }
          >
            {order ? "Save changes" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiveGoodsDialog({
  open,
  order,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  order: PurchaseOrderDetail | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { notes: string; lines: { lineId: string; quantity: number }[] }) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setNotes("");
  }, [open, order?.id]);

  const lines = (order?.lines ?? []).filter((l) => l.remainingQuantity > 0);
  const entries = lines
    .map((l) => ({ lineId: l.id, quantity: Number(quantities[l.id] ?? "0") }))
    .filter((l) => l.quantity > 0);
  const overReceive = lines.some(
    (l) => Number(quantities[l.id] ?? "0") > l.remainingQuantity,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive goods</DialogTitle>
          <DialogDescription>
            {order?.poNumber} — received quantities are added to stock through the inventory ledger.
          </DialogDescription>
        </DialogHeader>

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything on this order has already been received.</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_140px] sm:items-center">
                <div>
                  <p className="font-medium">{l.itemName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Ordered {l.orderedQuantity} {l.unitCode} · received {l.receivedQuantity} · remaining{" "}
                    {l.remainingQuantity}
                  </p>
                </div>
                <Input
                  inputMode="decimal"
                  placeholder="Receive now"
                  value={quantities[l.id] ?? ""}
                  onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: e.target.value }))}
                />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="receive-notes">Delivery note</Label>
              <Textarea id="receive-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {overReceive ? (
              <p className="text-sm text-destructive">You can't receive more than the outstanding quantity.</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={submitting || entries.length === 0 || overReceive}
            onClick={() => onSubmit({ notes, lines: entries })}
          >
            Confirm receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
