/**
 * Phase 8H5 — Standalone POS sell screen.
 *
 * Ring up a sale, take one or more tenders, finish. Every price, tax figure
 * and total on this screen is produced by the server from the POS catalog:
 * the browser only sends product ids, quantities and tender amounts. Uses
 * `pos_*` tables only — never the restaurant menu, orders or PMS cashiering.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, CreditCard, Minus, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import {
  addPosSaleItem,
  completePosSale,
  getPosSellContext,
  listPosCategories,
  listPosProducts,
  recordPosPayment,
  removePosPayment,
  removePosSaleItem,
  updatePosSaleItem,
  voidPosSale,
} from "@/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { ErrorNotice, PosHeader } from "./pos-shared";
import { ReceiptView } from "./receipt-view";

type Tender = "cash" | "card" | "other";

const TENDER_LABEL: Record<Tender, string> = { cash: "Cash", card: "Card", other: "Other" };
const TENDER_ICON: Record<Tender, typeof Banknote> = { cash: Banknote, card: CreditCard, other: Wallet };

export function StandalonePosSell({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const qc = useQueryClient();

  const contextFn = useServerFn(getPosSellContext);
  const categoriesFn = useServerFn(listPosCategories);
  const productsFn = useServerFn(listPosProducts);
  const addFn = useServerFn(addPosSaleItem);
  const updateFn = useServerFn(updatePosSaleItem);
  const removeFn = useServerFn(removePosSaleItem);
  const payFn = useServerFn(recordPosPayment);
  const unpayFn = useServerFn(removePosPayment);
  const completeFn = useServerFn(completePosSale);
  const voidFn = useServerFn(voidPosSale);

  const [saleId, setSaleId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [tender, setTender] = useState<Tender>("cash");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    reference: string;
    total: number;
    completedAt: string;
    businessDate: string;
    register: string;
    cashier: string;
    lines: { name: string; quantity: number; lineTotal: number }[];
    taxAmount: number;
    payments: { method: string; amount: number; change: number }[];
  } | null>(null);

  const ctx = useQuery({
    queryKey: ["pos-sell-context", restaurantId, saleId],
    queryFn: () => contextFn({ data: { restaurantId, saleId } }),
  });
  const categories = useQuery({
    queryKey: ["pos-categories", restaurantId],
    queryFn: () => categoriesFn({ data: { restaurantId } }),
  });
  const products = useQuery({
    queryKey: ["pos-products", restaurantId, "active"],
    queryFn: () => productsFn({ data: { restaurantId } }),
  });

  const data = ctx.data;
  const ready = data?.ready === true;
  const shift = data && data.ready ? data.shift : null;
  const sale = data && data.ready ? data.sale : null;
  const parked = data && data.ready ? data.parked : [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["pos-sell-context", restaurantId] });
    await qc.invalidateQueries({ queryKey: ["pos-shift-state", restaurantId] });
  }

  function onError(e: unknown) {
    setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
  }

  const addItem = useMutation({
    mutationFn: (productId: string) =>
      addFn({ data: { restaurantId, saleId: sale!.id, productId, quantity: 1 } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError,
  });
  const setQuantity = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      updateFn({ data: { restaurantId, saleId: sale!.id, ...input } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeFn({ data: { restaurantId, saleId: sale!.id, itemId } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError,
  });
  const addPayment = useMutation({
    mutationFn: (input: { method: Tender; amount: number; tendered: number | null; reference: string | null }) =>
      payFn({ data: { restaurantId, saleId: sale!.id, ...input } }),
    onSuccess: async () => {
      setError(null);
      setAmount("");
      setReference("");
      await refresh();
    },
    onError,
  });
  const dropPayment = useMutation({
    mutationFn: (paymentId: string) => unpayFn({ data: { restaurantId, saleId: sale!.id, paymentId } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError,
  });
  const finish = useMutation({
    mutationFn: () => completeFn({ data: { restaurantId, saleId: sale!.id } }),
    onSuccess: async (res) => {
      setError(null);
      if (sale && shift) {
        setReceipt({
          reference: res.reference,
          total: res.total,
          completedAt: new Date().toISOString(),
          businessDate: sale.businessDate,
          register: shift.registerName,
          cashier: shift.cashier,
          lines: sale.items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotal: i.lineTotal })),
          taxAmount: sale.taxAmount,
          payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount, change: p.change })),
        });
      }
      setSaleId(null);
      await refresh();
    },
    onError,
  });
  const discard = useMutation({
    mutationFn: () => voidFn({ data: { restaurantId, saleId: sale!.id, reason: "Cleared at the till" } }),
    onSuccess: async () => {
      setError(null);
      setSaleId(null);
      await refresh();
    },
    onError,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      if (categoryId !== "all" && p.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.sku ?? "").toLowerCase().includes(term) ||
        (p.barcode ?? "").toLowerCase().includes(term)
      );
    });
  }, [products.data, search, categoryId]);

  const remaining = sale?.remaining ?? 0;
  const busy =
    addItem.isPending ||
    setQuantity.isPending ||
    removeItem.isPending ||
    addPayment.isPending ||
    dropPayment.isPending ||
    finish.isPending ||
    discard.isPending;

  const entered = Number(amount);
  const tenderAmount = amount.trim() === "" ? remaining : Number.isFinite(entered) ? entered : 0;
  const cashChange = tender === "cash" && tenderAmount > remaining ? tenderAmount - remaining : 0;

  return (
    <div className="space-y-6">
      <PosHeader
        title="Sell"
        crumb="Sell"
        propertyName={membership.restaurant.name}
        description="Ring up a sale on this till. Prices and tax come from the POS catalog."
        actions={
          <Button variant="outline" asChild>
            <Link to="/restaurant/pos/shifts">Shifts</Link>
          </Button>
        }
      />

      <ErrorNotice message={error} />

      {ctx.isLoading ? (
        <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Loading…</div>
      ) : !ready ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl">Not ready to sell</h2>
          <p className="text-sm text-muted-foreground">{ctx.data?.reason}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/restaurant/pos/shifts">Open a shift</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/restaurant/pos/registers">Registers</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
            <span className="font-medium">{shift!.registerName}</span>
            <span className="text-muted-foreground">Cashier: {shift!.cashier}</span>
            <span className="text-muted-foreground">Opened {dateTime(shift!.openedAt)}</span>
            <span className="text-muted-foreground">Business date {shift!.businessDate}</span>
          </section>

          {receipt ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
                <div>
                  <h2 className="font-display text-xl">Sale completed</h2>
                  <p className="text-sm text-muted-foreground">Receipt {receipt.reference}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="mr-2 size-4" /> Print
                  </Button>
                  <Button onClick={() => setReceipt(null)}>New sale</Button>
                </div>
              </div>
              {/* Phase 8H6: same renderer the transaction reprint uses. */}
              <ReceiptView receipt={receipt} />
            </section>
          ) : null}

          {parked.length > 0 ? (
            <section className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Other open sales on this register</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {parked.map((p) => (
                  <Button key={p.id} variant="outline" size="sm" onClick={() => setSaleId(p.id)}>
                    {money(p.total)} · {dateTime(p.createdAt)}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {/* Catalog */}
            <section className="space-y-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, SKU or barcode"
                aria-label="Search products"
                className="h-12 rounded-2xl"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryId("all")}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium",
                    categoryId === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  All
                </button>
                {(categories.data ?? [])
                  .filter((c) => c.active)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium",
                        categoryId === c.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
              {filtered.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  No products match. Add products in the{" "}
                  <Link to="/restaurant/pos/catalog" className="underline underline-offset-4">
                    catalog
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!sale || busy}
                      onClick={() => addItem.mutate(p.id)}
                      className="flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 disabled:opacity-60"
                    >
                      <span className="text-sm font-medium leading-tight">{p.name}</span>
                      <span className="mt-2 text-sm font-semibold tabular-nums">{money(p.unitPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Cart + payment */}
            <aside className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-lg">Current sale</h2>
              {!sale || sale.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Tap a product to start the sale.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sale.items.map((line) => (
                    <li key={line.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{line.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {money(line.unitPrice)} each · tax {line.taxRate}%
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {money(line.lineTotal)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            aria-label={`Decrease ${line.name}`}
                            disabled={busy}
                            onClick={() =>
                              line.quantity <= 1
                                ? removeItem.mutate(line.id)
                                : setQuantity.mutate({ itemId: line.id, quantity: line.quantity - 1 })
                            }
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            aria-label={`Increase ${line.name}`}
                            disabled={busy}
                            onClick={() => setQuantity.mutate({ itemId: line.id, quantity: line.quantity + 1 })}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground"
                          aria-label={`Remove ${line.name}`}
                          disabled={busy}
                          onClick={() => removeItem.mutate(line.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{money(sale?.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{money(sale?.taxAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(sale?.total ?? 0)}</span>
                </div>
              </div>

              {sale && sale.payments.length > 0 ? (
                <ul className="space-y-1 border-t border-border pt-3 text-sm">
                  {sale.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {TENDER_LABEL[(p.method as Tender) ?? "other"] ?? p.method}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{money(p.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          aria-label="Remove tender"
                          disabled={busy}
                          onClick={() => dropPayment.mutate(p.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between font-medium">
                    <span>Remaining</span>
                    <span className="tabular-nums">{money(remaining)}</span>
                  </li>
                </ul>
              ) : null}

              <div className="space-y-2 border-t border-border pt-3">
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "card", "other"] as const).map((value) => {
                    const Icon = TENDER_ICON[value];
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTender(value)}
                        className={cn(
                          "flex h-11 items-center justify-center gap-1 rounded-xl border text-sm font-semibold",
                          tender === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        <Icon className="size-4" /> {TENDER_LABEL[value]}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pos-tender-amount">
                    {tender === "cash" ? "Cash received" : "Amount"} (blank = remaining)
                  </Label>
                  <Input
                    id="pos-tender-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={String(remaining.toFixed(2))}
                    className="h-11 rounded-xl"
                  />
                </div>
                {tender !== "cash" ? (
                  <div className="space-y-1">
                    <Label htmlFor="pos-tender-reference">Reference (optional)</Label>
                    <Input
                      id="pos-tender-reference"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                ) : null}
                {cashChange > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Change due <span className="font-semibold text-foreground">{money(cashChange)}</span>
                  </p>
                ) : null}
                <Button
                  className="h-12 w-full rounded-xl"
                  variant="outline"
                  disabled={!sale || sale.items.length === 0 || remaining <= 0 || busy || tenderAmount <= 0}
                  onClick={() =>
                    addPayment.mutate({
                      method: tender,
                      amount: Math.min(tenderAmount, remaining),
                      tendered: tender === "cash" ? tenderAmount : null,
                      reference: tender === "cash" ? null : reference.trim() || null,
                    })
                  }
                >
                  Add {TENDER_LABEL[tender].toLowerCase()} payment
                </Button>
                <Button
                  className="h-14 w-full rounded-xl text-base font-bold"
                  disabled={!sale || sale.items.length === 0 || remaining > 0 || busy}
                  onClick={() => finish.mutate()}
                >
                  Finish sale
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-destructive"
                  disabled={!sale || sale.items.length === 0 || busy}
                  onClick={() => discard.mutate()}
                >
                  Clear sale
                </Button>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
