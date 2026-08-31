import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PurchaseOrderFormDialog,
  type PoFormValues,
} from "@/components/inventory/purchase-order-dialogs";
import { listPurchaseOrders, savePurchaseOrder } from "@/lib/purchasing.functions";
import { listSuppliers } from "@/lib/suppliers.functions";
import { listInventoryItems } from "@/lib/inventory.functions";
import { PO_STATUS_LABEL, PO_STATUSES, type PoStatus } from "@/lib/purchasing.server";
import { RANGE_PRESETS, type RangePreset } from "@/lib/inventory-reporting.server";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import { cn } from "@/lib/utils";

export const PO_STATUS_STYLE: Record<PoStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ordered: "bg-primary/10 text-primary",
  partially_received: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  received: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const PRESET_LABEL: Record<RangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom",
};

export function PurchasingTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const { date } = useRestaurantTime();

  const fetchOrders = useServerFn(listPurchaseOrders);
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchItems = useServerFn(listInventoryItems);
  const savePo = useServerFn(savePurchaseOrder);

  const [status, setStatus] = useState<PoStatus | "all">("all");
  const [supplierId, setSupplierId] = useState<string>("all");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", restaurantId, status, supplierId, preset, search],
    queryFn: () =>
      fetchOrders({
        data: {
          restaurantId,
          ...(status === "all" ? {} : { status }),
          ...(supplierId === "all" ? {} : { supplierId }),
          preset: preset === "custom" ? "30d" : preset,
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", restaurantId, false],
    queryFn: () => fetchSuppliers({ data: { restaurantId } }),
  });
  const itemsQuery = useQuery({
    queryKey: ["inventory-items", restaurantId, false],
    queryFn: () => fetchItems({ data: { restaurantId } }),
  });

  const permissions = ordersQuery.data?.permissions;
  const canManage = !!permissions?.canManage;

  const createMutation = useMutation({
    mutationFn: (values: PoFormValues) =>
      savePo({
        data: {
          restaurantId,
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
      toast.success("Draft purchase order created.");
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", restaurantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kpis = ordersQuery.data?.kpis;
  const orders = ordersQuery.data?.orders ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open purchase orders" value={kpis?.open ?? 0} />
        <Kpi label="Awaiting delivery" value={kpis?.awaitingDelivery ?? 0} />
        <Kpi label="Partially received" value={kpis?.partiallyReceived ?? 0} />
        <Kpi
          label="Received this period"
          value={kpis?.receivedInPeriod ?? 0}
          {...(kpis ? { hint: money(kpis.valueInPeriod) } : {})}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search PO number or supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as PoStatus | "all")}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {(suppliersQuery.data?.suppliers ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">New purchase order</span>
          </Button>
        ) : null}
      </div>

      {ordersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading purchase orders…</p>
      ) : ordersQuery.isError ? (
        <p className="text-sm text-destructive">
          {(ordersQuery.error as Error)?.message ?? "We couldn't load purchase orders."}
        </p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No purchase orders in this period.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">PO number</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Order date</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Created by</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">{o.poNumber}</td>
                    <td className="px-4 py-3">{o.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date(o.orderDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {o.expectedDeliveryDate ? date(o.expectedDeliveryDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PO_STATUS_STYLE[o.status])}>
                        {PO_STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{money(o.total)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.createdBy ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/restaurant/inventory/purchasing/$purchaseOrderId" params={{ purchaseOrderId: o.id }}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {orders.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{o.poNumber}</p>
                    <p className="truncate text-sm text-muted-foreground">{o.supplierName}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PO_STATUS_STYLE[o.status])}>
                    {PO_STATUS_LABEL[o.status]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{date(o.orderDate)}</span>
                  <span>{o.lineCount} lines</span>
                  <span className="font-medium text-foreground tabular-nums">{money(o.total)}</span>
                  <Button asChild variant="outline" size="sm" className="ml-auto">
                    <Link to="/restaurant/inventory/purchasing/$purchaseOrderId" params={{ purchaseOrderId: o.id }}>
                      View
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <PurchaseOrderFormDialog
        open={formOpen}
        order={null}
        suppliers={suppliersQuery.data?.suppliers ?? []}
        items={itemsQuery.data?.items ?? []}
        submitting={createMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
      />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
