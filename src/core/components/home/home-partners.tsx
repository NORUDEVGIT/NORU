import { MarketingHref } from "@/core/components/home/marketing-href";
import { getMarketingContent, publishedOf } from "@/core/lib/marketing";

export function HomePartners() {
  const partners = publishedOf(getMarketingContent().partners);
  if (partners.length === 0) return null;

  return (
    <section id="partners" className="bg-background" aria-labelledby="partners-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 id="partners-heading" className="font-display text-3xl sm:text-4xl">
          Partners
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {partners.map((partner) => {
            const body = (
              <span className="flex h-full items-center justify-center rounded-3xl border border-border bg-card px-4 py-8 text-center">
                {partner.logoUrl ? (
                  <img src={partner.logoUrl} alt={partner.name} className="max-h-12 object-contain" />
                ) : (
                  <span className="font-display text-lg">{partner.name}</span>
                )}
              </span>
            );
            return (
              <li key={partner.id}>
                {partner.href ? <MarketingHref href={partner.href}>{body}</MarketingHref> : body}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
