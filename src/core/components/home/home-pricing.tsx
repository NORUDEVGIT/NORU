import { Button } from "@/shared/components/ui/button";
import { MarketingHref } from "@/core/components/home/marketing-href";
import { getMarketingContent, pricingSummary, visiblePackages } from "@/core/lib/marketing";

export function HomePricing() {
  const marketing = getMarketingContent();
  const packages = visiblePackages(marketing);

  return (
    <section id="pricing" className="bg-muted/50" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {marketing.pricing.eyebrow}
          </span>
          <h2 id="pricing-heading" className="mt-3 font-display text-3xl sm:text-4xl">
            {marketing.pricing.heading}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">{marketing.pricing.description}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((pkg) => (
            <article key={pkg.id} className="rounded-3xl border border-border bg-card p-6">
              <h3 className="font-display text-xl">{pkg.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{pricingSummary(pkg)}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                {marketing.pricing.displayNote}
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
            <MarketingHref href={marketing.contact.primaryCta.target}>
              {marketing.contact.primaryCta.label}
            </MarketingHref>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7">
            <MarketingHref href="#contact">Contact Us</MarketingHref>
          </Button>
        </div>
      </div>
    </section>
  );
}
