/**
 * POS architecture freeze — Restaurant Management · Payments & Cashiering.
 *
 * This page used to render the till itself, which made two different tiles
 * look like the same screen. It is now an honest foundation page: it states
 * what restaurant payments already do today, links to the surfaces that
 * really exist, and names what is NOT built rather than implying it is.
 *
 * Nothing here posts money. The till settles sales; PMS Cashiering keeps hotel
 * folios and guest billing.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CreditCard, Receipt, Wallet } from "lucide-react";

const TODAY: { title: string; body: string }[] = [
  {
    title: "Cash and card settlement",
    body: "The till records a payment against the sale and the cashier's open drawer. The amount always comes from the order total, never from the screen.",
  },
  {
    title: "Cashier shifts",
    body: "A sale can only be taken and settled while the cashier has an open drawer, so every payment belongs to a named shift.",
  },
  {
    title: "Charge to Room",
    body: "A served restaurant order can be posted onto a guest folio instead of being paid at the till. This needs both Restaurant Management and the hotel system to be switched on.",
  },
  {
    title: "Permissioned refunds",
    body: "Managers can refund a paid restaurant sale from the till Recent list or the order detail. Cashiers need an explicit refund grant. Room charges still use the existing reverse only.",
  },
];

const NOT_BUILT: string[] = [
  "Tax / VAT and service charge — order totals today are simply price × quantity",
  "Discounts, comps and tips",
  "Held sales that survive closing the till screen",
  "Printed receipt layouts and reprinting an earlier receipt",
  "End-of-day cash-up and reconciliation reporting",
];

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Wallet;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function RestaurantPaymentsFoundation() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Restaurant Management · Payments &amp; Cashiering
        </p>
        <h1 className="font-display text-2xl sm:text-3xl">Payments &amp; Cashiering</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How restaurant money is taken today, and what is honestly still missing. Hotel folios
          and guest billing stay in the hotel system.
        </p>
      </header>

      <Card icon={Wallet} title="What works today">
        <ul className="space-y-3">
          {TODAY.map((item) => (
            <li key={item.title}>
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card icon={CreditCard} title="Where to go">
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/restaurant/restaurant-management/pos-sales"
            className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold hover:bg-muted"
          >
            Open the till <ArrowUpRight className="size-4" />
          </Link>
          <Link
            to="/restaurant/restaurant-management/orders"
            search={{ status: "all", period: "today", sort: "newest", page: 1 }}
            className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold hover:bg-muted"
          >
            Restaurant orders <ArrowUpRight className="size-4" />
          </Link>
          <Link
            to="/restaurant/restaurant-management/reports"
            className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold hover:bg-muted"
          >
            Restaurant reports <ArrowUpRight className="size-4" />
          </Link>
          <Link
            to="/restaurant/back-office/accounting"
            className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold hover:bg-muted"
          >
            Back Office finance <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </Card>

      <Card icon={Receipt} title="Not built yet">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {NOT_BUILT.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
