/**
 * Phase 8H3 — Standalone POS catalog.
 *
 * This till has its own products and categories (`pos_categories`,
 * `pos_products`). No restaurant menu table is read here and there is no menu
 * fallback. Items are deactivated, never deleted, because past sale lines
 * point at them.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useMoney } from "@/state/restaurant-context";
import {
  getPosSettings,
  listPosCategories,
  listPosProducts,
  savePosCategory,
  savePosProduct,
} from "@/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { ErrorNotice, PosHeader, ReadOnlyNotice, canSetupPos } from "./pos-shared";

type Category = { id: string; name: string; sortOrder: number; active: boolean };
type Product = {
  id: string;
  categoryId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitPrice: number;
  taxRate: number | null;
  active: boolean;
  sortOrder: number;
};

const NO_CATEGORY = "__none__";

export function StandalonePosCatalog({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const canEdit = canSetupPos(membership);
  const money = useMoney();
  const qc = useQueryClient();

  const listCategoriesFn = useServerFn(listPosCategories);
  const listProductsFn = useServerFn(listPosProducts);
  const settingsFn = useServerFn(getPosSettings);

  const categories = useQuery({
    queryKey: ["pos-categories", restaurantId],
    queryFn: () => listCategoriesFn({ data: { restaurantId } }) as Promise<Category[]>,
  });
  const products = useQuery({
    queryKey: ["pos-products", restaurantId, "all"],
    queryFn: () =>
      listProductsFn({ data: { restaurantId, includeInactive: true } }) as Promise<Product[]>,
  });
  const settings = useQuery({
    queryKey: ["pos-settings", restaurantId],
    queryFn: () => settingsFn({ data: { restaurantId } }),
  });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(true);
  const [productOpen, setProductOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categories.data]);

  const visible = (products.data ?? []).filter((p) => {
    if (!showInactive && !p.active) return false;
    if (categoryFilter === NO_CATEGORY && p.categoryId) return false;
    if (categoryFilter !== "all" && categoryFilter !== NO_CATEGORY && p.categoryId !== categoryFilter)
      return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.sku ?? "", p.barcode ?? ""].some((v) => v.toLowerCase().includes(q));
  });

  const defaultTaxRate = settings.data?.defaultTaxRate ?? 0;

  return (
    <div className="space-y-6">
      <PosHeader
        title="Catalog"
        crumb="Catalog"
        propertyName={membership.restaurant.name}
        description="The products this till sells. They belong to the POS package only — separate from any restaurant menu."
        actions={
          canEdit ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryOpen(true);
                }}
              >
                <Plus className="mr-1 size-4" /> Category
              </Button>
              <Button
                onClick={() => {
                  setEditingProduct(null);
                  setProductOpen(true);
                }}
              >
                <Plus className="mr-1 size-4" /> Product
              </Button>
            </>
          ) : null
        }
      />

      {canEdit ? null : (
        <ReadOnlyNotice>
          You can view the catalog. Only an owner or manager can add or change products.
        </ReadOnlyNotice>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, SKU or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search products"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-52" aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
        </div>

        {products.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading catalog…</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {(products.data ?? []).length === 0
              ? "No products yet. Add the first one to start building this till's catalog."
              : "No products match those filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 text-right font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Tax</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {p.categoryId ? categoryName.get(p.categoryId) ?? "—" : "Uncategorised"}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {p.sku ?? p.barcode ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.unitPrice)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {p.taxRate === null
                        ? `POS default (${defaultTaxRate}%)`
                        : `Override ${p.taxRate}%`}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          p.active
                            ? "rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary"
                            : "rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        }
                      >
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingProduct(p);
                            setProductOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Categories</h2>
        {(categories.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No categories yet. Products can be sold without one.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(categories.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setEditingCategory(c);
                    setCategoryOpen(true);
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors enabled:hover:border-primary/60 disabled:cursor-default"
                >
                  {c.name}
                  {c.active ? "" : " · inactive"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Products and categories are deactivated rather than deleted, so past receipts keep making
          sense.
        </p>
      </section>

      <ProductDialog
        key={editingProduct?.id ?? "new-product"}
        open={productOpen}
        onOpenChange={setProductOpen}
        restaurantId={restaurantId}
        product={editingProduct}
        categories={categories.data ?? []}
        defaultTaxRate={defaultTaxRate}
        onSaved={() => qc.invalidateQueries({ queryKey: ["pos-products", restaurantId, "all"] })}
      />
      <CategoryDialog
        key={editingCategory?.id ?? "new-category"}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        restaurantId={restaurantId}
        category={editingCategory}
        onSaved={() => qc.invalidateQueries({ queryKey: ["pos-categories", restaurantId] })}
      />
    </div>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  restaurantId,
  product,
  categories,
  defaultTaxRate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  product: Product | null;
  categories: Category[];
  defaultTaxRate: number;
  onSaved: () => void | Promise<unknown>;
}) {
  const saveFn = useServerFn(savePosProduct);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? NO_CATEGORY);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product ? String(product.unitPrice) : "");
  const [overrideTax, setOverrideTax] = useState(product?.taxRate !== null && product !== null);
  const [taxRate, setTaxRate] = useState(product?.taxRate === null ? "" : String(product?.taxRate ?? ""));
  const [active, setActive] = useState(product?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const unitPrice = Number(price);
      if (!name.trim()) throw new Error("Give the product a name.");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Enter a valid price.");
      let rate: number | null = null;
      if (overrideTax) {
        rate = Number(taxRate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100)
          throw new Error("Enter a tax rate between 0 and 100.");
      }
      return saveFn({
        data: {
          restaurantId,
          ...(product ? { id: product.id } : {}),
          name: name.trim(),
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          sku: sku.trim() || null,
          barcode: barcode.trim() || null,
          unitPrice,
          taxRate: rate,
          active,
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      await onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not save this product."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>Sold by this till only.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="p-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-sku">SKU</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-barcode">Barcode</Label>
              <Input id="p-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Price</Label>
            <Input
              id="p-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-2">
            <div>
              <Label htmlFor="p-tax-override">Own tax rate</Label>
              <p className="text-xs text-muted-foreground">
                Off means the POS default ({defaultTaxRate}%).
              </p>
            </div>
            <Switch id="p-tax-override" checked={overrideTax} onCheckedChange={setOverrideTax} />
          </div>
          {overrideTax ? (
            <div className="space-y-1.5">
              <Label htmlFor="p-tax">Tax rate (%)</Label>
              <Input
                id="p-tax"
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-2">
            <div>
              <Label htmlFor="p-active">Available to sell</Label>
              <p className="text-xs text-muted-foreground">
                Turn off instead of deleting; past receipts stay intact.
              </p>
            </div>
            <Switch id="p-active" checked={active} onCheckedChange={setActive} />
          </div>
          <ErrorNotice message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  restaurantId,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  category: Category | null;
  onSaved: () => void | Promise<unknown>;
}) {
  const saveFn = useServerFn(savePosCategory);
  const [name, setName] = useState(category?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the category a name.");
      const order = Number(sortOrder);
      if (!Number.isInteger(order) || order < 0) throw new Error("Order must be 0 or higher.");
      return saveFn({
        data: {
          restaurantId,
          ...(category ? { id: category.id } : {}),
          name: name.trim(),
          sortOrder: order,
          active,
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      await onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not save this category."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Groups products on the till.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-order">Order</Label>
            <Input
              id="c-order"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-2">
            <Label htmlFor="c-active">Active</Label>
            <Switch id="c-active" checked={active} onCheckedChange={setActive} />
          </div>
          <ErrorNotice message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
