import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { InventoryItem, InventoryMovement, InventoryUnit } from "@/lib/inventory.functions";
import type { MovementType } from "@/lib/inventory.server";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening_balance: "Opening balance",
  purchase_received: "Stock received",
  usage: "Usage",
  waste: "Waste",
  loss: "Loss",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
  stocktake_adjustment: "Stocktake adjustment",
};

const REASON_SUGGESTIONS: Partial<Record<MovementType, string[]>> = {
  waste: ["Expired", "Spoiled", "Preparation waste", "Damaged", "Other"],
  loss: ["Missing", "Breakage", "Unexplained", "Other"],
};

/** One dialog drives every movement type; the action decides the rules. */
export function MovementDialog({
  open,
  item,
  movementType,
  canSetCost,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: InventoryItem | null;
  movementType: MovementType;
  canSetCost: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: {
    quantity: number;
    unitCost: number | null;
    reason: string | null;
    stocktakeDirection: "in" | "out";
  }) => void;
}) {
  const money = useMoney();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");

  useEffect(() => {
    if (open) {
      setQuantity("");
      setUnitCost("");
      setReason("");
      setDirection("in");
    }
  }, [open, movementType, item?.id]);

  if (!item) return null;

  const requiresReason = ["waste", "loss", "adjustment_in", "adjustment_out", "stocktake_adjustment"].includes(
    movementType,
  );
  const suggestions = REASON_SUGGESTIONS[movementType];
  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && amount > 0 && (!requiresReason || reason.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {MOVEMENT_LABEL[movementType]} — {item.name}
          </DialogTitle>
          <DialogDescription>
            Current balance {item.quantity} {item.unitCode}
            {item.unitCost !== null ? ` · ${money(item.unitCost)} per ${item.unitCode}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit({
              quantity: amount,
              unitCost: canSetCost && unitCost.trim() ? Number(unitCost) : null,
              reason: reason.trim() || null,
              stocktakeDirection: direction,
            });
          }}
        >
          {movementType === "stocktake_adjustment" ? (
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Increase stock</SelectItem>
                  <SelectItem value="out">Decrease stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="movement-qty">Quantity ({item.unitCode})</Label>
            <Input
              id="movement-qty"
              inputMode="decimal"
              type="number"
              step="0.001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>

          {movementType === "purchase_received" && canSetCost ? (
            <div className="space-y-2">
              <Label htmlFor="movement-cost">Unit cost (optional)</Label>
              <Input
                id="movement-cost"
                inputMode="decimal"
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Cost per unit"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="movement-reason">
              Reason {requiresReason ? <span className="text-destructive">*</span> : "(optional)"}
            </Label>
            {suggestions ? (
              <div className="flex flex-wrap gap-2 pb-1">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={reason === s ? "default" : "outline"}
                    className="h-8 rounded-full"
                    onClick={() => setReason(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            ) : null}
            <Textarea
              id="movement-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={requiresReason ? "Explain this movement" : "Reference or note"}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ItemFormValues {
  name: string;
  inventoryType: "ingredient" | "consumable";
  baseUnitId: string;
  openingQuantity: number;
  minimumStockLevel: number;
  unitCost: number | null;
  notes: string | null;
  active: boolean;
}

export function ItemFormDialog({
  open,
  item,
  defaultType,
  units,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: InventoryItem | null;
  defaultType: "ingredient" | "consumable";
  units: InventoryUnit[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: ItemFormValues) => void;
}) {
  const editing = !!item;
  const [name, setName] = useState("");
  const [type, setType] = useState<"ingredient" | "consumable">(defaultType);
  const [unitId, setUnitId] = useState("");
  const [opening, setOpening] = useState("");
  const [minimum, setMinimum] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setType(item?.inventoryType ?? defaultType);
    setUnitId(item?.unitId ?? units[0]?.id ?? "");
    setOpening("");
    setMinimum(item ? String(item.minimumStockLevel) : "");
    setCost(item?.unitCost !== null && item?.unitCost !== undefined ? String(item.unitCost) : "");
    setNotes(item?.notes ?? "");
    setActive(item?.active ?? true);
  }, [open, item?.id, defaultType, units.length]);

  const valid = name.trim().length >= 2 && (editing || unitId);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${item?.name}` : "New inventory item"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Stock quantity can only change through a stock movement."
              : "Opening stock is recorded as an opening balance movement."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit({
              name: name.trim(),
              inventoryType: type,
              baseUnitId: unitId,
              openingQuantity: opening.trim() ? Number(opening) : 0,
              minimumStockLevel: minimum.trim() ? Number(minimum) : 0,
              unitCost: cost.trim() ? Number(cost) : null,
              notes: notes.trim() || null,
              active,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken" />
          </div>

          {!editing ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as "ingredient" | "consumable")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ingredient">Ingredient</SelectItem>
                      <SelectItem value="consumable">Consumable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Base unit</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.code} — {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-opening">Opening quantity</Label>
                <Input
                  id="item-opening"
                  type="number"
                  step="0.001"
                  min="0"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0"
                />
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-min">Minimum stock level</Label>
              <Input
                id="item-min"
                type="number"
                step="0.001"
                min="0"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-cost">Unit cost (optional)</Label>
              <Input
                id="item-cost"
                type="number"
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-notes">Notes (optional)</Label>
            <Textarea id="item-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {editing ? (
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive items are hidden from daily operations.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Create item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MovementHistoryDialog({
  open,
  item,
  movements,
  loading,
  onClose,
}: {
  open: boolean;
  item: InventoryItem | null;
  movements: InventoryMovement[];
  loading: boolean;
  onClose: () => void;
}) {
  const { dateTime } = useRestaurantTime();
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movement history — {item?.name}</DialogTitle>
          <DialogDescription>Newest first. History is a permanent record and cannot be edited.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {movements.map((m) => (
              <li key={m.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{MOVEMENT_LABEL[m.movementType]}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(m.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        m.quantity >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity} {m.unitCode}
                    </p>
                    {m.balanceAfter !== null ? (
                      <p className="text-xs text-muted-foreground">Balance {m.balanceAfter}</p>
                    ) : null}
                  </div>
                </div>
                {m.reason ? <p className="mt-2 text-sm text-muted-foreground">{m.reason}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">By {m.recordedBy ?? "Unknown"}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
