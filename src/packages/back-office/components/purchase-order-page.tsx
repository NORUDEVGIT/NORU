/**
 * Phase 8G2B — shared purchase order detail body.
 *
 * Back Office is the canonical owner of procurement, so this body lives here
 * and is rendered by both the canonical Back Office route and the legacy
 * inventory address. Business logic is unchanged: the same server functions,
 * the same permissions, the same receiving transaction.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Ban, PackageCheck, Pencil, Send } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  PurchaseOrderFormDialog,
  ReceiveGoodsDialog,
} from "@/components/inventory/purchase-order-dialogs";
import { PO_STATUS_STYLE } from "@/components/inventory/purchasing-tab";
import {
  getPurchaseOrder,
  receiveGoods,
  savePurchaseOrder,
  updatePurchaseOrderStatus,
} from "@/lib/purchasing.functions";
import { listSuppliers } from "@/lib/suppliers.functions";
import { listInventoryItems } from "@/lib/inventory.functions";
import { PO_STATUS_LABEL, isEditable, isReceivable } from "@/lib/purchasing.server";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { cn } from "@/shared/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  po_created: "Purchase order created",
  po_updated: "Purchase order updated",
  po_ordered: "Marked as ordered",
  goods_received: "Goods received",
  po_partially_received: "Partially received",
  po_received: "Fully received",
  po_cancelled: "Cancelled",
};

function BackLink({ back }: { back: "back-office" | "inventory" }) {
  if (back === "back-office") {
    return (
      <Link to="/restaurant/back-office/procurement/purchase-orders">
        <ArrowLeft className="size-4 sm:mr-2" />
        <span className="hidden sm:inline">Purchase orders</span>
      </Link>
    );
  }
  return (
    <Link to="/restaurant/inventory">
      <ArrowLeft className="size-4 sm:mr-2" />
      <span className="hidden sm:inline">Inventory</span>
    </Link>
  );
}

export function PurchaseOrderPage({
  membership,
  purchaseOrderId,
  back = "inventory",
}: {
  membership: RestaurantMembership;
  purchaseOrderId: string;
  back?: "back-office" | "inventory";
}) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const { date, dateTime } = useRestaurantTime();

  const fetchOrder = useServerFn(getPurchaseOrder);
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchItems = useServerFn(listInventoryItems);
  const savePo = useServerFn(savePurchaseOrder);
  const changeStatus = useServerFn(updatePurchaseOrderStatus);
  const receive = useServerFn(receiveGoods);

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const orderQuery = useQuery({
    queryKey: ["purchase-order", restaurantId, purchaseOrderId],
    queryFn: () => fetchOrder({ data: { restaurantId, purchaseOrderId } }),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", restaurantId, false],
    queryFn: () => fetchSuppliers({ data: { restaurantId } }),
    enabled: editOpen,
  });
  const itemsQuery = useQuery({
    queryKey: ["inventory-items", restaurantId, false],
    queryFn: () => fetchItems({ data: { restaurantId } }),
    enabled: editOpen,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["purchase-order", restaurantId, purchaseOrderId] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-items", restaurantId] });
    for (const key of ["inventory-dashboard", "inventory-trend", "inventory-activity", "purchasing-summary"]) {
      void queryClient.invalidateQueries({ queryKey: [key, restaurantId] });
    }
  }

  const editMutation = useMutation({
    mutationFn: (values: { supplierId: string; expectedDeliveryDate: string; notes: string; lines: any[] }) =>
      savePo({
        data: {
          restaurantId,
          purchaseOrderId,
          supplierId: values.supplierId,
          expectedDeliveryDate: values.expectedDeliveryDate || null,
          notes: values.notes || null,
          lines: values.lines,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Purchase order updated.");
      setEditOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "order" | "cancel") =>
      changeStatus({ data: { restaurantId, purchaseOrderId, action } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Purchase order updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: (values: { notes: string; lines: { lineId: string; quantity: number }[] }) =>
      receive({
        data: { restaurantId, purchaseOrderId, notes: values.notes || null, lines: values.lines },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.status === "received" ? "All goods received — order complete." : "Goods received.",
      );
      setReceiveOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (orderQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading purchase order…</p>;
  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {(orderQuery.error as Error)?.message ?? "We couldn't load that purchase order."}
        </p>
        <Button asChild variant="outline" size="sm">
          <BackLink back={back} />
        </Button>
      </div>
    );
  }

  const po = orderQuery.data;
  const nothingReceived = po.lines.every((l) => l.receivedQuantity === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <BackLink back={back} />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl">{po.poNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {po.supplierName}
            {po.supplierActive ? "" : " (inactive supplier)"}
          </p>
        </div>
        <span
          className={cn("rounded-full px-3 py-1 text-xs font-semibold", PO_STATUS_STYLE[po.status])}
        >
          {PO_STATUS_LABEL[po.status]}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {po.permissions.canManage && isEditable(po.status) ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button size="sm" onClick={() => statusMutation.mutate("order")} disabled={statusMutation.isPending}>
                <Send className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Mark ordered</span>
              </Button>
            </>
          ) : null}
          {po.permissions.canReceive && isReceivable(po.status) ? (
            <Button size="sm" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Receive goods</span>
            </Button>
          ) : null}
          {po.permissions.canManage && ["draft", "ordered"].includes(po.status) && nothingReceived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate("cancel")}
              disabled={statusMutation.isPending}
            >
              <Ban className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Order date" value={date(po.orderDate)} />
        <Fact label="Expected delivery" value={po.expectedDeliveryDate ? date(po.expectedDeliveryDate) : "—"} />
        <Fact label="Created by" value={po.createdBy ?? "—"} />
        <Fact label="Total" value={money(po.total)} />
      </div>

      {po.notes ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1">{po.notes}</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Ordered</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Remaining</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Unit cost</th>
              <th className="px-4 py-3">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium">{l.itemName}</td>
                <td className="px-4 py-3 tabular-nums">{l.orderedQuantity}</td>
                <td className="px-4 py-3 tabular-nums">{l.receivedQuantity}</td>
                <td className="px-4 py-3 tabular-nums">{l.remainingQuantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.unitCode}</td>
                <td className="px-4 py-3 tabular-nums">{money(l.unitCost)}</td>
                <td className="px-4 py-3 tabular-nums">{money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
        <ul className="mt-3 space-y-2 text-sm">
          {po.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{EVENT_LABEL[h.eventType] ?? h.eventType}</span>
              {h.notes ? <span className="text-muted-foreground">{h.notes}</span> : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {h.createdBy ? `${h.createdBy} · ` : ""}
                {dateTime(h.createdAt)}
              </span>
            </li>
          ))}
          {po.history.length === 0 ? <li className="text-muted-foreground">No events recorded.</li> : null}
        </ul>
      </div>

      <PurchaseOrderFormDialog
        open={editOpen}
        order={po}
        suppliers={suppliersQuery.data?.suppliers ?? []}
        items={itemsQuery.data?.items ?? []}
        submitting={editMutation.isPending}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => editMutation.mutate(values)}
      />

      <ReceiveGoodsDialog
        open={receiveOpen}
        order={po}
        submitting={receiveMutation.isPending}
        onClose={() => setReceiveOpen(false)}
        onSubmit={(values) => receiveMutation.mutate(values)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
