import { useEffect, useState } from "react";
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
import type { Supplier, SupplierPurchase } from "@/lib/suppliers.functions";
import { PO_STATUS_LABEL } from "@/lib/purchasing.server";

export interface SupplierFormValues {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  notes: string;
}

const EMPTY: SupplierFormValues = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
  notes: "",
};

export function SupplierFormDialog({
  open,
  supplier,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  supplier: Supplier | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: SupplierFormValues) => void;
}) {
  const [values, setValues] = useState<SupplierFormValues>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setValues(
      supplier
        ? {
            name: supplier.name,
            contactName: supplier.contactName ?? "",
            email: supplier.email ?? "",
            phone: supplier.phone ?? "",
            address: supplier.address ?? "",
            taxId: supplier.taxId ?? "",
            notes: supplier.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, supplier]);

  function set<K extends keyof SupplierFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle>
          <DialogDescription>Suppliers are kept for history and deactivated rather than deleted.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="supplier-name">Supplier name</Label>
            <Input id="supplier-name" value={values.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="supplier-contact">Contact name</Label>
              <Input id="supplier-contact" value={values.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-tax">Tax ID</Label>
              <Input id="supplier-tax" value={values.taxId} onChange={(e) => set("taxId", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier-address">Address</Label>
            <Textarea id="supplier-address" rows={2} value={values.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea id="supplier-notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(values)} disabled={submitting || values.name.trim().length < 2}>
            {supplier ? "Save supplier" : "Create supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierHistoryDialog({
  open,
  supplier,
  purchases,
  loading,
  money,
  date,
  onClose,
}: {
  open: boolean;
  supplier: Supplier | null;
  purchases: SupplierPurchase[];
  loading: boolean;
  money: (v: number) => string;
  date: (value: string) => string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase history</DialogTitle>
          <DialogDescription>{supplier?.name}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No purchase orders for this supplier yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="font-medium">{p.poNumber}</span>
                <span className="text-muted-foreground">{date(p.orderDate)}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  {PO_STATUS_LABEL[p.status]}
                </span>
                <span className="text-muted-foreground">
                  {p.receivedLines}/{p.lineCount} lines received
                </span>
                <span className="ml-auto font-medium tabular-nums">{money(p.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
