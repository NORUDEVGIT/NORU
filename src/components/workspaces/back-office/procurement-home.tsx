/**
 * Phase 8G2B — Back Office Procurement landing page.
 *
 * Back Office is the canonical owner of procurement. This page only presents
 * what already exists: the supplier register, purchase orders and goods
 * receiving, all served by the existing procurement server functions with
 * their existing role and module checks. No new data model, no new engine.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Boxes, PackageCheck, ShoppingCart, Truck } from "lucide-react";

import { listSuppliers } from "@/lib/suppliers.functions";
import { listPurchaseOrders } from "@/lib/purchasing.functions";

export function BackOfficeProcurementHome({ restaurantId }: { restaurantId: string }) {
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchOrders = useServerFn(listPurchaseOrders);

  const suppliers = useQuery({
    queryKey: ["bo-procurement-suppliers", restaurantId],
    queryFn: () => fetchSuppliers({ data: { restaurantId } }),
    retry: false,
  });
  const orders = useQuery({
    queryKey: ["bo-procurement-orders", restaurantId],
    queryFn: () => fetchOrders({ data: { restaurantId, preset: "30d" as const } }),
    retry: false,
  });

  const denied = suppliers.isError && orders.isError;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Back Office · Procurement
        </p>
        <h1 className="font-display text-2xl sm:text-3xl">Procurement</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Suppliers, purchase orders and goods receiving for the whole property. Received goods post
          to the stock ledger, which Inventory continues to own.
        </p>
      </header>

      {denied ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          You don't have purchasing access for this property. Ask an owner or manager to give you
          Procurement access.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Active suppliers" value={suppliers.data?.suppliers.length} />
            <Figure label="Open purchase orders" value={orders.data?.kpis.open} />
            <Figure label="Awaiting delivery" value={orders.data?.kpis.awaitingDelivery} />
            <Figure label="Partially received" value={orders.data?.kpis.partiallyReceived} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card
              icon={Truck}
              title="Suppliers"
              body="The property supplier register: contacts, tax details, purchase history and which suppliers are still active."
              to="/restaurant/back-office/procurement/suppliers"
              cta="Open suppliers"
            />
            <Card
              icon={ShoppingCart}
              title="Purchase orders"
              body="Raise, edit and track purchase orders through draft, ordered, partially received and received."
              to="/restaurant/back-office/procurement/purchase-orders"
              cta="Open purchase orders"
            />
            <Card
              icon={PackageCheck}
              title="Goods receiving"
              body="Receiving happens on an open purchase order: enter what arrived and the delivery posts to stock."
              to="/restaurant/back-office/procurement/purchase-orders"
              cta="Find an order to receive"
            />
            <Card
              icon={Boxes}
              title="Purchasing history"
              body="Every order keeps its own event timeline, and each supplier shows what has been bought from them."
              to="/restaurant/back-office/procurement/suppliers"
              cta="View supplier history"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Procurement records the purchase; Inventory records the stock. Receiving a delivery
            writes one stock movement through the existing inventory ledger — nothing is duplicated
            here.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value ?? "—"}</p>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  to,
  cta,
}: {
  icon: typeof Truck;
  title: string;
  body: string;
  to: "/restaurant/back-office/procurement/suppliers" | "/restaurant/back-office/procurement/purchase-orders";
  cta: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {cta}
        <ArrowUpRight className="size-4" />
      </Link>
    </section>
  );
}
