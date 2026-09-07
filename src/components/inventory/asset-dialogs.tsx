import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import type { AssetHistoryEntry, RestaurantAsset } from "@/lib/assets.functions";
import type { AssetCondition, AssetEvent, AssetStatus, AssetType } from "@/lib/assets.server";
import { useRestaurantTime } from "@/state/restaurant-context";

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: "Active",
  under_maintenance: "Under Maintenance",
  out_of_service: "Out of Service",
  disposed: "Disposed",
};

export const ASSET_CONDITION_LABEL: Record<AssetCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  damaged: "Damaged",
};

export const ASSET_EVENT_LABEL: Record<AssetEvent, string> = {
  asset_created: "Asset created",
  asset_updated: "Asset updated",
  condition_changed: "Condition changed",
  status_changed: "Status changed",
  location_changed: "Location changed",
  quantity_changed: "Quantity changed",
  disposed: "Disposed",
};

export interface AssetFormValues {
  name: string;
  assetCode: string | null;
  quantity: number;
  condition: AssetCondition;
  status: AssetStatus;
  location: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  serialNumber: string | null;
  warrantyExpiry: string | null;
  notes: string | null;
}

/** One form for both asset types; equipment adds serial + warranty. */
export function AssetFormDialog({
  open,
  asset,
  assetType,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset: RestaurantAsset | null;
  assetType: AssetType;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: AssetFormValues) => void;
}) {
  const editing = !!asset;
  const type = asset?.assetType ?? assetType;
  const isEquipment = type === "equipment";

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<AssetCondition>("good");
  const [status, setStatus] = useState<AssetStatus>("active");
  const [location, setLocation] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [serial, setSerial] = useState("");
  const [warranty, setWarranty] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(asset?.name ?? "");
    setCode(asset?.assetCode ?? "");
    setQuantity(asset ? String(asset.quantity) : "1");
    setCondition(asset?.condition ?? "good");
    setStatus(asset?.status ?? "active");
    setLocation(asset?.location ?? "");
    setPurchaseDate(asset?.purchaseDate ?? "");
    setPurchaseCost(asset?.purchaseCost !== null && asset?.purchaseCost !== undefined ? String(asset.purchaseCost) : "");
    setSerial(asset?.serialNumber ?? "");
    setWarranty(asset?.warrantyExpiry ?? "");
    setNotes(asset?.notes ?? "");
  }, [open, asset?.id, assetType]);

  const amount = Number(quantity);
  const valid = name.trim().length >= 2 && Number.isFinite(amount) && amount >= 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${asset?.name}` : isEquipment ? "New equipment" : "New operating asset"}
          </DialogTitle>
          <DialogDescription>
            Condition describes wear; status describes availability. Both are tracked separately.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit({
              name: name.trim(),
              assetCode: code.trim() || null,
              quantity: amount,
              condition,
              status,
              location: location.trim() || null,
              purchaseDate: purchaseDate || null,
              purchaseCost: purchaseCost.trim() ? Number(purchaseCost) : null,
              serialNumber: isEquipment ? serial.trim() || null : null,
              warrantyExpiry: isEquipment ? warranty || null : null,
              notes: notes.trim() || null,
            });
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asset-name">Name</Label>
              <Input
                id="asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEquipment ? "Coffee Machine" : "Dining Chair"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-code">Asset code (optional)</Label>
              <Input id="asset-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EQ-001" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="asset-qty">Quantity</Label>
              <Input
                id="asset-qty"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as AssetCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_CONDITION_LABEL) as AssetCondition[]).map((c) => (
                    <SelectItem key={c} value={c}>{ASSET_CONDITION_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_maintenance">Under Maintenance</SelectItem>
                  <SelectItem value="out_of_service">Out of Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="asset-location">Location (optional)</Label>
              <Input
                id="asset-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Dining Area"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-purchase-date">Purchase date (optional)</Label>
              <Input
                id="asset-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-cost">Purchase cost (optional)</Label>
              <Input
                id="asset-cost"
                type="number"
                min="0"
                step="0.01"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          {isEquipment ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="asset-serial">Serial number (optional)</Label>
                <Input
                  id="asset-serial"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="TEST-CM-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-warranty">Warranty expiry (optional)</Label>
                <Input
                  id="asset-warranty"
                  type="date"
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="asset-notes">Notes (optional)</Label>
            <Textarea id="asset-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Create asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type QuickField = "condition" | "status" | "location" | "quantity";

const QUICK_TITLE: Record<QuickField, string> = {
  condition: "Change condition",
  status: "Change status",
  location: "Change location",
  quantity: "Update quantity",
};

/** Small single-field editor for the common asset actions. */
export function AssetQuickChangeDialog({
  open,
  asset,
  field,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset: RestaurantAsset | null;
  field: QuickField;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: Partial<AssetFormValues> & { changeNote: string | null }) => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !asset) return;
    setNote("");
    setValue(
      field === "condition"
        ? asset.condition
        : field === "status"
          ? asset.status
          : field === "location"
            ? asset.location ?? ""
            : String(asset.quantity),
    );
  }, [open, asset?.id, field]);

  if (!asset) return null;

  const amount = Number(value);
  const valid = field === "quantity" ? Number.isFinite(amount) && amount >= 0 : value.length > 0 || field === "location";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {QUICK_TITLE[field]} — {asset.name}
          </DialogTitle>
          <DialogDescription>
            Condition {ASSET_CONDITION_LABEL[asset.condition]} · Status {ASSET_STATUS_LABEL[asset.status]}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            const changeNote = note.trim() || null;
            if (field === "condition") return onSubmit({ condition: value as AssetCondition, changeNote });
            if (field === "status") return onSubmit({ status: value as AssetStatus, changeNote });
            if (field === "location") return onSubmit({ location: value.trim() || null, changeNote });
            return onSubmit({ quantity: amount, changeNote });
          }}
        >
          {field === "condition" ? (
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_CONDITION_LABEL) as AssetCondition[]).map((c) => (
                    <SelectItem key={c} value={c}>{ASSET_CONDITION_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : field === "status" ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_maintenance">Under Maintenance</SelectItem>
                  <SelectItem value="out_of_service">Out of Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : field === "location" ? (
            <div className="space-y-2">
              <Label htmlFor="quick-location">Location</Label>
              <Input id="quick-location" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="quick-quantity">Quantity</Label>
              <Input
                id="quick-quantity"
                type="number"
                min="0"
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="quick-note">Note (optional)</Label>
            <Textarea id="quick-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssetDisposeDialog({
  open,
  asset,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset: RestaurantAsset | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open, asset?.id]);

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {asset.name} as disposed</DialogTitle>
          <DialogDescription>
            Disposed assets stay in the register and their history is preserved. They can't be edited afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reason.trim() || null);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="dispose-reason">Reason (optional)</Label>
            <Textarea id="dispose-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? "Saving…" : "Mark disposed"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  asset_code: "Asset code",
  quantity: "Quantity",
  condition: "Condition",
  status: "Status",
  location: "Location",
  purchase_date: "Purchase date",
  purchase_cost: "Purchase cost",
  serial_number: "Serial number",
  warranty_expiry: "Warranty expiry",
  notes: "Notes",
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  return ASSET_STATUS_LABEL[text as AssetStatus] ?? ASSET_CONDITION_LABEL[text as AssetCondition] ?? text;
}

export function AssetHistoryDialog({
  open,
  asset,
  entries,
  loading,
  onClose,
}: {
  open: boolean;
  asset: RestaurantAsset | null;
  entries: AssetHistoryEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  const { dateTime } = useRestaurantTime();
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Asset history — {asset?.name}</DialogTitle>
          <DialogDescription>Newest first. History is a permanent record and cannot be edited.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => {
              const fields = Object.keys(e.newValues ?? {}).filter((k) => k in FIELD_LABEL);
              return (
                <li key={e.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{ASSET_EVENT_LABEL[e.eventType]}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(e.createdAt)}</p>
                  </div>
                  {e.eventType !== "asset_created" && fields.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {fields.map((f) => (
                        <li key={f}>
                          {FIELD_LABEL[f]}: {renderValue(e.previousValues?.[f])} → {renderValue(e.newValues?.[f])}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {e.notes ? <p className="mt-2 text-sm">{e.notes}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">By {e.recordedBy ?? "Unknown"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
