/**
 * Public marketing consumer. Prefers a published CMS document, then the
 * honest seed. This module never reads or writes package entitlements.
 */

import {
  assertAllowedMarketingHref,
  isAllowedSocialHref,
  isRejectedAdminHref,
} from "./allowlist.ts";
import { MARKETING_SEED } from "./seed.ts";
import { PROTECTED_NAV_ROLES, type MarketingContent, type MarketingItemStatus } from "./types.ts";

export const MARKETING_STATUS_LABELS: Record<Exclude<MarketingItemStatus, "hidden">, string> = {
  available_now: "Available now",
  coming_soon: "Coming soon",
  evolving: "Evolving",
};

export function sortByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function validateMarketingContent(content: MarketingContent): void {
  const hrefs: string[] = [
    content.hero.primaryCta.target,
    content.contact.primaryCta.target,
  ];
  if (content.hero.secondaryCta) hrefs.push(content.hero.secondaryCta.target);
  if (content.contact.secondaryCta) hrefs.push(content.contact.secondaryCta.target);

  for (const item of content.nav) hrefs.push(item.href);
  for (const group of content.footer.linkGroups) {
    for (const link of group.links) hrefs.push(link.href);
  }
  for (const banner of content.promoBanners) {
    if (banner.cta) hrefs.push(banner.cta.target);
  }

  for (const href of hrefs) {
    if (isRejectedAdminHref(href)) {
      throw new Error(`Marketing content must not target Admin: ${href}`);
    }
    assertAllowedMarketingHref(href);
  }

  for (const social of content.footer.socials) {
    if (!isAllowedSocialHref(social.href)) {
      throw new Error(`Footer social href must be https and non-admin: ${social.href}`);
    }
  }

  for (const role of PROTECTED_NAV_ROLES) {
    const found = content.nav.some((item) => item.protectedRole === role);
    if (!found) {
      throw new Error(`Marketing nav must include protected role: ${role}`);
    }
  }
}

/**
 * Public consumer: use a published MarketingContent document when it is
 * structurally valid, otherwise the honest seed. Callers that load from the
 * CMS pass the published row; omitting it is the seed fallback.
 */
export function getMarketingContent(published?: MarketingContent | null): MarketingContent {
  if (published && typeof published === "object" && published.hero && published.brand && Array.isArray(published.nav)) {
    try {
      validateMarketingContent(published);
      return published;
    } catch (error) {
      console.error("[getMarketingContent] published document failed validation; using seed", error);
    }
  }
  validateMarketingContent(MARKETING_SEED);
  return MARKETING_SEED;
}

export function visibleNav(
  content: MarketingContent,
  placement: MarketingContent["nav"][number]["placement"],
) {
  return sortByOrder(content.nav.filter((item) => item.visible && item.placement === placement));
}

export function visiblePackages(content: MarketingContent) {
  return sortByOrder(content.packages.filter((item) => item.status !== "hidden"));
}

export function publishedOf<T extends { published: boolean; order: number }>(items: readonly T[]): T[] {
  return sortByOrder(items.filter((item) => item.published));
}

export function activeOf<T extends { active: boolean; order: number }>(items: readonly T[]): T[] {
  return sortByOrder(items.filter((item) => item.active));
}

export function roadmapFeatures(pkg: MarketingContent["packages"][number]) {
  return sortByOrder(pkg.features.filter((feature) => feature.status === "coming_soon"));
}

export function pricingSummary(pkg: MarketingContent["packages"][number]): string {
  const soon = roadmapFeatures(pkg).map((feature) => `${feature.label}: coming soon`);
  if (soon.length === 0) return pkg.blurb;
  return `${pkg.blurb} ${soon.join(" ")}`;
}

export function collectAvailableNowText(content: MarketingContent): string {
  const parts: string[] = [];
  for (const pkg of content.packages) {
    if (pkg.status === "available_now") {
      parts.push(pkg.title, pkg.blurb);
    }
    for (const feature of pkg.features) {
      if (feature.status === "available_now") parts.push(feature.label);
    }
  }
  return parts.join("\n");
}
