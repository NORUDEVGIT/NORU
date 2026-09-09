import { Link } from "@tanstack/react-router";
import { Button } from "@/shared/components/ui/button";

const TIERS = [
  {
    name: "Restaurant Management",
    summary: "Floor, kitchen and guest ordering for restaurants and F&B outlets.",
  },
  {
    name: "PMS",
    summary: "Stay operations: rooms, reservations, guests and housekeeping.",
  },
  {
    name: "Standalone POS",
    summary: "A dedicated till package for counter and retail-style selling.",
  },
  {
    name: "Back Office Management",
    summary: "Procurement, stock, people and finance tools for the property.",
  },
] as const;

export function HomePricing() {
  return (
    <section id="pricing" className="bg-muted/50" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Pricing</span>
          <h2 id="pricing-heading" className="mt-3 font-display text-3xl sm:text-4xl">
            Packages assigned to your property
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            NORU is licensed by commercial package, not a one-size public price list. After you
            register your company, packages are assigned to the property. Contact us if you need a
            tailored mix.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <article key={tier.name} className="rounded-3xl border border-border bg-card p-6">
              <h3 className="font-display text-xl">{tier.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{tier.summary}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Assigned per property
              </p>
            </article>
          ))}
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
