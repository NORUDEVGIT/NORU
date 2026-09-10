import { Briefcase, Building2, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { MarketingHref } from "@/core/components/home/marketing-href";
import {
  MARKETING_STATUS_LABELS,
  getMarketingContent,
  roadmapFeatures,
  visiblePackages,
  type MarketingItemStatus,
  type MarketingPackageIconKey,
} from "@/core/lib/marketing";

const PACKAGE_ICONS: Record<MarketingPackageIconKey, LucideIcon> = {
  restaurant: UtensilsCrossed,
  pms: Building2,
  pos: ShoppingBag,
  back_office: Briefcase,
};

function StatusBadge({
  status,
}: {
  status: Exclude<MarketingItemStatus, "hidden">;
}) {
  const tone = status === "available_now" ? "now" : status === "coming_soon" ? "soon" : "evolving";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tone === "now" && "border-success/30 bg-success/15 text-success",
        tone === "soon" && "border-border bg-muted text-muted-foreground",
        tone === "evolving" && "border-accent/30 bg-accent/15 text-accent",
      )}
    >
      {MARKETING_STATUS_LABELS[status]}
    </span>
  );
}

export function HomePackages() {
  const marketing = getMarketingContent();
  const packages = visiblePackages(marketing);

  return (
    <section id="packages" className="bg-background" aria-labelledby="packages-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {marketing.packagesSection.eyebrow}
          </span>
          <h2 id="packages-heading" className="mt-3 font-display text-3xl sm:text-4xl">
            {marketing.packagesSection.heading}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">{marketing.packagesSection.description}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((pkg) => {
            const Icon = PACKAGE_ICONS[pkg.icon];
            const soon = roadmapFeatures(pkg);
            return (
              <article
                key={pkg.id}
                className="flex flex-col rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {pkg.status !== "hidden" ? <StatusBadge status={pkg.status} /> : null}
                </div>
                <h3 className="mt-4 font-display text-xl">{pkg.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{pkg.blurb}</p>
                {soon.length > 0
                  ? soon.map((feature) => (
                      <p
                        key={feature.id}
                        className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                      >
                        <StatusBadge status="coming_soon" />
                        <span>{feature.label}</span>
                      </p>
                    ))
                  : null}
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
            <MarketingHref href={marketing.hero.primaryCta.target}>
              {marketing.hero.primaryCta.label}
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
