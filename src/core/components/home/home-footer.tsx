import { HomeBrandMark } from "@/core/components/home/home-brand-mark";
import { MarketingHref } from "@/core/components/home/marketing-href";
import { getMarketingContent, sortByOrder } from "@/core/lib/marketing";

export function HomeFooter() {
  const { brand, footer } = getMarketingContent();
  const groups = sortByOrder(footer.linkGroups);
  const socials = sortByOrder(footer.socials);

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <HomeBrandMark brand={brand} />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{footer.blurb}</p>
          </div>

          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {sortByOrder(group.links).map((link) => (
                  <li key={link.id}>
                    <MarketingHref href={link.href} className="hover:text-foreground">
                      {link.label}
                    </MarketingHref>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {socials.length > 0 ? (
          <ul className="mt-8 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {socials.map((social) => (
              <li key={social.id}>
                <MarketingHref href={social.href} className="hover:text-foreground">
                  {social.label}
                </MarketingHref>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">{footer.copyright}</p>
      </div>
    </footer>
  );
}
