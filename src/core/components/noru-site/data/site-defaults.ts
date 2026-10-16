import { sortByOrder } from "../../../lib/marketing/resolve.ts";
import type {
  MarketingContent,
  NoruSiteContent,
  SiteOffering,
  SitePlan,
} from "../../../lib/marketing/types.ts";
import {
  EVENTS,
  FAQ,
  HOTEL_PLANS,
  PARTNERS,
  PRODUCTS,
  RESTAURANT_PLANS,
  SOLUTIONS,
  type Offering,
  type Plan,
} from "./content.ts";

function mapOffering(item: Offering, order: number): SiteOffering {
  return {
    id: item.id,
    icon: item.icon,
    title: item.title,
    blurb: item.blurb,
    lead: item.lead,
    points: item.points.map((point) => ({ ...point })),
    order,
    visible: true,
  };
}

function mapPlan(item: Plan, id: string, order: number): SitePlan {
  return {
    id,
    name: item.name,
    modules: item.modules,
    priceEtb: item.priceEtb,
    featured: item.featured === true,
    order,
  };
}

/** The Beti site as it ships in code. Used only when a published document has no site block. */
export function currentNoruSiteContent(): NoruSiteContent {
  return {
    products: PRODUCTS.map((item, index) => mapOffering(item, (index + 1) * 10)),
    solutions: SOLUTIONS.map((item, index) => mapOffering(item, (index + 1) * 10)),
    hotelPlans: HOTEL_PLANS.map((item, index) =>
      mapPlan(item, item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), (index + 1) * 10),
    ),
    restaurantPlans: RESTAURANT_PLANS.map((item, index) =>
      mapPlan(item, item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), (index + 1) * 10),
    ),
    faq: FAQ.map((item, index) => ({
      id: `faq-${index + 1}`,
      question: item.question,
      answer: item.answer,
      order: (index + 1) * 10,
      active: true,
    })),
    partners: PARTNERS.map((item, index) => ({
      id: item.id,
      name: item.name,
      ...(item.logoUrl ? { logoUrl: item.logoUrl } : {}),
      order: (index + 1) * 10,
      published: true,
    })),
    events: EVENTS.map((item, index) => ({
      id: item.id,
      date: item.date,
      title: item.title,
      place: item.place,
      note: item.note,
      order: (index + 1) * 10,
      published: true,
    })),
    about: {
      title: "About Us",
      intro: "Noru Digital Solutions is an all-in-one hospitality technology provider.",
      body: "Company background, mission and vision statement go here.",
    },
    posts: [1, 2, 3].map((n) => ({
      id: `article-${n}`,
      slug: `article-${n}`,
      title: "Article",
      excerpt: "",
      body: "",
      published: true,
      order: n * 10,
    })),
    quotes: [
      { id: "quote-hotel", quote: "", authorName: "Hotel quote", order: 10, published: true },
      {
        id: "quote-restaurant",
        quote: "",
        authorName: "Restaurant quote",
        order: 20,
        published: true,
      },
      { id: "quote-resort", quote: "", authorName: "Resort quote", order: 30, published: true },
    ],
    footerContact: {
      email: "Company email",
      phone: "Phone number",
      address: "Office address",
    },
    hero: {
      tagline: "Hospitality Digital Solutions",
      amharic: "ኖሩ - በእግዜር",
    },
  };
}

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
