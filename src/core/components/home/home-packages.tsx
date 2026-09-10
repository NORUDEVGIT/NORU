import { Link } from "@tanstack/react-router";
import { Briefcase, Building2, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function StatusBadge({
  children,
  tone,
}: {
  children: string;
  tone: "now" | "soon";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tone === "now"
          ? "border-success/30 bg-success/15 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

const PACKAGES: {
  icon: typeof UtensilsCrossed;
  title: string;
  body: string;
  status: "available" | "evolving";
  roadmap?: string;
}[] = [
  {
    icon: UtensilsCrossed,
    title: "Restaurant Management",
    body: "Menus, QR and waiter ordering, kitchen display, and restaurant till for F&B operations.",
    status: "available",
  },
  {
    icon: Building2,
    title: "PMS",
    body: "Reservations, front desk, housekeeping, folios, night audit, and direct online booking.",
    status: "available",
    roadmap: "Live OTA channel sync",
  },
  {
    icon: ShoppingBag,
    title: "Standalone POS",
    body: "Catalog, sell, pay, shifts, refunds, and reports for cafés and counters — without full restaurant ops.",
    status: "available",
  },
  {
    icon: Briefcase,
    title: "Back Office Management",
    body: "Evolving stock and purchasing tools toward centralized management reporting — not a full finance/HR suite yet.",
    status: "evolving",
  },
];

export function HomePackages() {
  return (
    <section id="packages" className="bg-background" aria-labelledby="packages-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Commercial packages
          </span>
          <h2 id="packages-heading" className="mt-3 font-display text-3xl sm:text-4xl">
            Four packages. One hospitality platform.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            NORU is sold as Restaurant Management, PMS, Standalone POS and Back Office Management.
            Properties receive the packages they need — not a single restaurant-only product.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map(({ icon: Icon, title, body, status, roadmap }) => {
            return (
              <article
                key={title}
                className="flex flex-col rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {status === "available" ? (
                    <StatusBadge tone="now">Available now</StatusBadge>
                  ) : null}
                </div>
                <h3 className="mt-4 font-display text-xl">{title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
                {roadmap ? (
                  <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <StatusBadge tone="soon">Coming soon</StatusBadge>
                    <span>{roadmap}</span>
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-accent px-7 font-semibold text-accent-foreground hover:bg-accent/90"
          >
            <Link to="/restaurant/register">Register Your Company</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7">
            <a href="#contact">Contact Us</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
