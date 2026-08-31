import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, MoreHorizontal, Pencil, Plus, Power, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SupplierFormDialog,
  SupplierHistoryDialog,
  type SupplierFormValues,
} from "@/components/inventory/supplier-dialogs";
import {
  createSupplier,
  getSupplierPurchaseHistory,
  listSuppliers,
  updateSupplier,
  type Supplier,
} from "@/lib/suppliers.functions";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import { cn } from "@/lib/utils";

export function SuppliersTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const { date } = useRestaurantTime();

  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchHistory = useServerFn(getSupplierPurchaseHistory);
  const addSupplier = useServerFn(createSupplier);
  const editSupplier = useServerFn(updateSupplier);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", restaurantId, showInactive],
    queryFn: () => fetchSuppliers({ data: { restaurantId, includeInactive: showInactive } }),
  });
  const historyQuery = useQuery({
    queryKey: ["supplier-history", restaurantId, historyFor?.id],
    queryFn: () => fetchHistory({ data: { restaurantId, supplierId: historyFor!.id } }),
    enabled: !!historyFor,
  });

  const canManage = !!suppliersQuery.data?.permissions.canManage;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["suppliers", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders", restaurantId] });
  }

  const createMutation = useMutation({
    mutationFn: (values: SupplierFormValues) => addSupplier({ data: { restaurantId, ...values } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Supplier created.");
      setFormOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { supplierId: string } & Partial<SupplierFormValues> & { active?: boolean }) =>
      editSupplier({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Supplier updated.");
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suppliers = (suppliersQuery.data?.suppliers ?? []).filter((s) =>
    search.trim() ? s.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search suppliers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canManage ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Hide inactive" : "Show inactive"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Add supplier</span>
            </Button>
          </>
        ) : null}
      </div>

      {suppliersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading suppliers…</p>
      ) : suppliersQuery.isError ? (
        <p className="text-sm text-destructive">
          {(suppliersQuery.error as Error)?.message ?? "We couldn't load suppliers."}
        </p>
      ) : suppliers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No suppliers yet.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">POs</th>
                  <th className="px-4 py-3">Last purchase</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {suppliers.map((s) => (
                  <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.contactName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.poCount}
                      {s.poCount > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">{money(s.totalOrderedValue)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.lastOrderDate ? date(s.lastOrderDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SupplierActions
                        supplier={s}
                        canManage={canManage}
                        onEdit={() => {
                          setEditing(s);
                          setFormOpen(true);
                        }}
                        onHistory={() => setHistoryFor(s)}
                        onToggleActive={() =>
                          updateMutation.mutate({ supplierId: s.id, active: !s.active })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {suppliers.map((s) => (
              <li
                key={s.id}
                className={cn("rounded-2xl border border-border bg-card p-4", !s.active && "opacity-60")}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.contactName ?? s.email ?? s.phone ?? "—"}</p>
                  </div>
                  <SupplierActions
                    supplier={s}
                    canManage={canManage}
                    onEdit={() => {
                      setEditing(s);
                      setFormOpen(true);
                    }}
                    onHistory={() => setHistoryFor(s)}
                    onToggleActive={() => updateMutation.mutate({ supplierId: s.id, active: !s.active })}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.poCount} purchase orders</span>
                  <span>{s.lastOrderDate ? `Last ${date(s.lastOrderDate)}` : "No purchases"}</span>
                  <span>{money(s.totalOrderedValue)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <SupplierFormDialog
        open={formOpen}
        supplier={editing}
        submitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) =>
          editing
            ? updateMutation.mutate({ supplierId: editing.id, ...values })
            : createMutation.mutate(values)
        }
      />

      <SupplierHistoryDialog
        open={!!historyFor}
        supplier={historyFor}
        purchases={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
        money={money}
        date={date}
        onClose={() => setHistoryFor(null)}
      />
    </div>
  );
}

function SupplierActions({
  supplier,
  canManage,
  onEdit,
  onHistory,
  onToggleActive,
}: {
  supplier: Supplier;
  canManage: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onToggleActive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${supplier.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onHistory}>
          <History className="mr-2 size-4" /> Purchase history
        </DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="mr-2 size-4" /> Edit supplier
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleActive}>
              <Power className="mr-2 size-4" /> {supplier.active ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
