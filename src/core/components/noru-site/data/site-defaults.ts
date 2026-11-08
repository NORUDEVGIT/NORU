import { sortByOrder } from "../../../lib/marketing/resolve.ts";
import { currentNoruSiteContent } from "../../../lib/marketing/noru-site-defaults.ts";
import type { MarketingContent, NoruSiteContent } from "../../../lib/marketing/types.ts";

export { currentNoruSiteContent };

/** Public view. A stored site block wins, including empty lists. Code defaults apply only when site is absent. */
export function publicNoruSite(content: MarketingContent): NoruSiteContent {
  const site = content.site ?? currentNoruSiteContent();
  return {
    ...site,
    products: sortByOrder(site.products.filter((item) => item.visible)),
    solutions: sortByOrder(site.solutions.filter((item) => item.visible)),
    hotelPlans: sortByOrder(site.hotelPlans),
    restaurantPlans: sortByOrder(site.restaurantPlans),
    faq: sortByOrder(site.faq.filter((item) => item.active)),
    partners: sortByOrder(site.partners.filter((item) => item.published)),
    events: sortByOrder(site.events.filter((item) => item.published)),
    posts: sortByOrder(site.posts.filter((item) => item.published)),
    quotes: sortByOrder(site.quotes.filter((item) => item.published)),
  };
}
