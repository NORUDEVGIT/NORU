import { isAllowedSocialHref } from "./allowlist.ts";
import {
  NORU_SITE_ICONS,
  type NoruSiteContent,
  type NoruSiteIcon,
  type SitePost,
} from "./types.ts";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIcon(value: unknown): value is NoruSiteIcon {
  return typeof value === "string" && (NORU_SITE_ICONS as readonly string[]).includes(value);
}

function isOffering(value: unknown): boolean {
  if (!isRecord(value) || !isIcon(value.icon)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.blurb === "string" &&
    typeof value.lead === "string" &&
    Array.isArray(value.points) &&
    typeof value.order === "number" &&
    typeof value.visible === "boolean"
  );
}

function isPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const price = value.priceEtb;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.modules === "string" &&
    typeof value.order === "number" &&
    typeof value.featured === "boolean" &&
    (price === null || (typeof price === "number" && Number.isFinite(price) && price >= 0))
  );
}

function isOrdered(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.order === "number";
}

export function isNoruSiteContent(value: unknown): value is NoruSiteContent {
  if (!isRecord(value)) return false;
  const about = value.about;
  const footer = value.footerContact;
  const hero = value.hero;
  return (
    Array.isArray(value.products) &&
    value.products.every(isOffering) &&
    Array.isArray(value.solutions) &&
    value.solutions.every(isOffering) &&
    Array.isArray(value.hotelPlans) &&
    value.hotelPlans.every(isPlan) &&
    Array.isArray(value.restaurantPlans) &&
    value.restaurantPlans.every(isPlan) &&
    Array.isArray(value.faq) &&
    value.faq.every(isOrdered) &&
    Array.isArray(value.partners) &&
    value.partners.every(isOrdered) &&
    Array.isArray(value.events) &&
    value.events.every(isOrdered) &&
    Array.isArray(value.posts) &&
    value.posts.every(isOrdered) &&
    Array.isArray(value.quotes) &&
    value.quotes.every(isOrdered) &&
    isRecord(about) &&
    typeof about.title === "string" &&
    typeof about.intro === "string" &&
    typeof about.body === "string" &&
    isRecord(footer) &&
    typeof footer.email === "string" &&
    typeof footer.phone === "string" &&
    typeof footer.address === "string" &&
    isRecord(hero) &&
    typeof hero.tagline === "string" &&
    typeof hero.amharic === "string"
  );
}

export interface SiteContentIssue {
  code: string;
  message: string;
  path?: string;
}

export function siteContentIssues(site: NoruSiteContent): SiteContentIssue[] {
  const errors: SiteContentIssue[] = [];
  for (const offering of [...site.products, ...site.solutions]) {
    if (!offering.title.trim()) {
      errors.push({
        code: "site_title",
        message: "Each product and solution needs a title.",
        path: offering.id,
      });
    }
    if (offering.imageUrl && !isAllowedSocialHref(offering.imageUrl)) {
      errors.push({
        code: "site_image",
        message: "Solution images must be https URLs.",
        path: offering.id,
      });
    }
  }
  for (const plan of [...site.hotelPlans, ...site.restaurantPlans]) {
    if (!plan.name.trim()) {
      errors.push({ code: "site_plan", message: "Each pricing plan needs a name.", path: plan.id });
    }
  }
  for (const partner of site.partners) {
    if (partner.href && !isAllowedSocialHref(partner.href)) {
      errors.push({
        code: "site_partner_href",
        message: "Partner links must be https and must not point at Admin.",
        path: partner.id,
      });
    }
    if (partner.logoUrl && !isAllowedSocialHref(partner.logoUrl)) {
      errors.push({
        code: "site_partner_logo",
        message: "Partner logos must be https URLs.",
        path: partner.id,
      });
    }
  }
  errors.push(...postSlugIssues(site.posts));
  if (!site.about.title.trim()) {
    errors.push({ code: "site_about", message: "About Us needs a title.", path: "about.title" });
  }
  return errors;
}

function postSlugIssues(posts: readonly SitePost[]): SiteContentIssue[] {
  const errors: SiteContentIssue[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const slug = post.slug.trim().toLowerCase();
    if (!post.published) continue;
    if (!slug || !SLUG_PATTERN.test(slug)) {
      errors.push({
        code: "slug_format",
        message: `Published article “${post.title || post.id}” needs a lowercase slug.`,
        path: post.id,
      });
      continue;
    }
    if (seen.has(slug)) {
      errors.push({
        code: "slug_duplicate",
        message: `Article slug “${slug}” is already used.`,
        path: post.id,
      });
    }
    seen.add(slug);
  }
  return errors;
}
