import { MarketingHref } from "@/core/components/home/marketing-href";
import { Button } from "@/shared/components/ui/button";
import { activeOf, getMarketingContent } from "@/core/lib/marketing";

export function HomePromoBanners() {
  const banners = activeOf(getMarketingContent().promoBanners);
  if (banners.length === 0) return null;

  return (
    <section aria-label="Promotions" className="bg-accent/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
        {banners.map((banner) => (
          <article
            key={banner.id}
            className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center"
          >
            {banner.imageUrl ? (
              <img
                src={banner.imageUrl}
                alt=""
                className="h-24 w-full rounded-2xl object-cover sm:h-20 sm:w-36"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl">{banner.headline}</h2>
              {banner.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{banner.description}</p>
              ) : null}
            </div>
            {banner.cta ? (
              <Button asChild className="rounded-full bg-accent font-semibold text-accent-foreground hover:bg-accent/90">
                <MarketingHref href={banner.cta.target}>{banner.cta.label}</MarketingHref>
              </Button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
