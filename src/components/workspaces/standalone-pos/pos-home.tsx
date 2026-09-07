/**
 * Standalone POS package home (8H3, current as of 8H9).
 *
 * Launcher for the live till: selling, catalog, transactions, registers and
 * shifts, reports and settings. Selling still requires an active register and
 * an open shift held by the signed-in person.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { POS_MODULES } from "@/lib/standalone-pos-modules";
import { getPosOverview } from "@/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PosHeader, StatusPill, canSetupPos } from "./pos-shared";

export function StandalonePosHome({ membership }: { membership: RestaurantMembership }) {
  const overviewFn = useServerFn(getPosOverview);
  const restaurantId = membership.restaurant.id;
  const overview = useQuery({
    queryKey: ["pos-overview", restaurantId],
    queryFn: () => overviewFn({ data: { restaurantId } }),
  });
  const o = overview.data;

  const stats: { label: string; value: string }[] = [
    { label: "Categories", value: o ? String(o.categories) : "—" },
    { label: "Products", value: o ? `${o.activeProducts} active / ${o.products}` : "—" },
    { label: "Registers", value: o ? `${o.activeRegisters} active / ${o.registers}` : "—" },
    { label: "Open shifts", value: o ? String(o.openShifts) : "—" },
  ];

  return (
    <div className="space-y-8">
      <PosHeader
        title="Standalone POS"
        propertyName={membership.restaurant.name}
        description="An independent point of sale for this property, with its own products, prices, tills and receipts. It does not use the restaurant menu and works even when the other packages are switched off."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl">{s.value}</p>
          </div>
        ))}
      </section>

      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {o && o.openShifts > 0 ? (
          <>
            Ready to sell —{" "}
            <Link to="/restaurant/pos/sell" className="underline underline-offset-4">
              go to the sell screen
            </Link>
            .
          </>
        ) : (
          <>
            Open a shift to start selling. Add a{" "}
            <Link to="/restaurant/pos/registers" className="underline underline-offset-4">
              register
            </Link>{" "}
            and{" "}
            <Link to="/restaurant/pos/shifts" className="underline underline-offset-4">
              open a cashier shift
            </Link>
            , then ring up sales with your{" "}
            <Link to="/restaurant/pos/catalog" className="underline underline-offset-4">
              catalog
            </Link>
            .
          </>
        )}
        {canSetupPos(membership)
          ? null
          : " Your role can view this section but not change the setup."}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Sections</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {POS_MODULES.map((m) => {
            const body = (
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  <StatusPill status={m.status} />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{m.description}</span>
                {m.note ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{m.note}</span>
                ) : null}
              </span>
            );
            const icon = (
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <m.icon className="size-5" />
              </span>
            );
            return m.canonicalRoute ? (
              <Link
                key={m.key}
                to={m.canonicalRoute}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {icon}
                {body}
              </Link>
            ) : (
              <div
                key={m.key}
                aria-disabled="true"
                className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4 opacity-70"
              >
                {icon}
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
