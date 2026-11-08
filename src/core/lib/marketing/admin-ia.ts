/**
 * Platform Admin Marketing information architecture for the current NORU landing.
 * Primary tabs only. Legacy JSON keys stay in the document.
 */

import { currentNoruSiteContent } from "./noru-site-defaults.ts";
import {
  NORU_SITE_ANIMATION_DEFAULTS,
  NORU_SITE_CTA_DEFAULTS,
  NORU_SITE_FOOTER_DEFAULTS,
  resolveSiteAnimationConfig,
  resolveSiteCta,
  resolveSiteFooter,
} from "./site-content.ts";
import type {
  MarketingContent,
  NoruSiteAnimationConfig,
  NoruSiteContent,
  NoruSiteCta,
  NoruSiteFooterSocialLink,
} from "./types.ts";

export const MARKETING_ADMIN_SECTIONS = [
  { to: "/admin/marketing", label: "Overview", end: true },
  { to: "/admin/marketing/header", label: "Header & Navigation" },
  { to: "/admin/marketing/hero", label: "Hero & Animation" },
  { to: "/admin/marketing/partners", label: "Partners" },
  { to: "/admin/marketing/events", label: "Events" },
  { to: "/admin/marketing/products", label: "Product Highlights" },
  { to: "/admin/marketing/solutions", label: "Property Solutions" },
  { to: "/admin/marketing/faq", label: "FAQ" },
  { to: "/admin/marketing/cta", label: "Final CTA" },
  { to: "/admin/marketing/footer", label: "Footer" },
  { to: "/admin/marketing/legacy", label: "Advanced / Legacy" },
] as const;

export const RETIRED_PRIMARY_TAB_LABELS = [
  "Brand & hero",
  "Navigation",
  "Packages",
  "Pricing",
  "Products",
  "Solutions",
  "Plans",
  "Resources",
  "Hero & footer",
  "Content",
  "Site chrome",
] as const;

export const MARKETING_ADMIN_TAB_OWNERSHIP = {
  Overview: [],
  "Header & Navigation": ["brand", "nav", "site.cta.buttonLabel", "site.cta.target"],
  "Hero & Animation": ["site.hero", "site.animation"],
  Partners: ["site.partners"],
  Events: ["site.events"],
  "Product Highlights": ["site.products"],
  "Property Solutions": ["site.solutions"],
  FAQ: ["site.faq"],
  "Final CTA": ["site.cta"],
  Footer: ["site.footerContact"],
  "Advanced / Legacy": [
    "hero",
    "packages",
    "pricing",
    "packagesSection",
    "partners",
    "testimonials",
    "caseStudies",
    "blogPosts",
    "footer",
    "faq",
    "promoBanners",
    "contact",
    "site.hotelPlans",
    "site.restaurantPlans",
    "site.about",
    "site.posts",
    "site.quotes",
  ],
} as const;

export const LEGACY_DOCUMENT_KEYS = [
  "hero",
  "packages",
  "pricing",
  "packagesSection",
  "partners",
  "testimonials",
  "caseStudies",
  "blogPosts",
  "footer",
  "faq",
  "promoBanners",
  "contact",
] as const;

export function primaryMarketingTabLabels(): string[] {
  return MARKETING_ADMIN_SECTIONS.map((section) => section.label);
}

export function ensureMarketingSite(content: MarketingContent): NoruSiteContent {
  if (!content.site) content.site = currentNoruSiteContent();
  return content.site;
}

export function patchSiteAnimation(
  content: MarketingContent,
  patch: Partial<NoruSiteAnimationConfig>,
): void {
  const site = ensureMarketingSite(content);
  site.animation = { ...site.animation, ...patch };
}

export function patchSiteCta(content: MarketingContent, patch: Partial<NoruSiteCta>): void {
  const site = ensureMarketingSite(content);
  site.cta = { ...site.cta, ...patch };
}

export function patchFooterContact(
  content: MarketingContent,
  patch: {
    email?: string;
    phone?: string;
    address?: string;
    tagline?: string;
    privacyTarget?: string;
    termsTarget?: string;
    copyrightText?: string;
    socialLinks?: NoruSiteFooterSocialLink[];
  },
): void {
  const site = ensureMarketingSite(content);
  if (patch.email !== undefined) site.footerContact.email = patch.email;
  if (patch.phone !== undefined) site.footerContact.phone = patch.phone;
  if (patch.address !== undefined) site.footerContact.address = patch.address;
  if (patch.tagline !== undefined) site.footerContact.tagline = patch.tagline;
  if (patch.privacyTarget !== undefined) site.footerContact.privacyTarget = patch.privacyTarget;
  if (patch.termsTarget !== undefined) site.footerContact.termsTarget = patch.termsTarget;
  if (patch.copyrightText !== undefined) site.footerContact.copyrightText = patch.copyrightText;
  if (patch.socialLinks !== undefined) site.footerContact.socialLinks = patch.socialLinks;
}

export function landingInventory(content: MarketingContent) {
  const site = content.site ?? currentNoruSiteContent();
  const animation = resolveSiteAnimationConfig(site);
  const cta = resolveSiteCta(site);
  return {
    headerNavItems: content.nav.length,
    partners: site.partners.filter((item) => item.published).length,
    events: site.events.filter((item) => item.published).length,
    productHighlights: site.products.filter((item) => item.visible).length,
    propertySolutions: site.solutions.filter((item) => item.visible).length,
    faqItems: site.faq.filter((item) => item.active).length,
    finalCtaEnabled: cta.enabled,
    heroAnimationEnabled: animation.enabled,
  };
}

export function animationFormValues(content: MarketingContent) {
  const site = content.site ?? currentNoruSiteContent();
  return resolveSiteAnimationConfig(site);
}

export function ctaFormValues(content: MarketingContent) {
  const site = content.site ?? currentNoruSiteContent();
  const stored = site.cta;
  const resolved = resolveSiteCta(site);
  return {
    resolved,
    stored,
    displayTitle: stored?.title ?? "",
    displayDescription: stored?.description ?? "",
    displayButtonLabel: stored?.buttonLabel ?? "",
    displayTarget: stored?.target ?? "",
    placeholders: NORU_SITE_CTA_DEFAULTS,
  };
}

export function footerFormValues(content: MarketingContent) {
  const site = content.site ?? currentNoruSiteContent();
  return {
    stored: site.footerContact,
    resolved: resolveSiteFooter(site),
    placeholders: NORU_SITE_FOOTER_DEFAULTS,
  };
}

/** Read-only preview. Must not mutate the draft merely by opening a tab. */
export function previewMarketingAdmin(content: MarketingContent) {
  return {
    animation: animationFormValues(content),
    cta: ctaFormValues(content),
    footer: footerFormValues(content),
    inventory: landingInventory(content),
    hasSite: Boolean(content.site),
  };
}

export function snapshotLegacyKeys(content: MarketingContent) {
  return Object.fromEntries(
    LEGACY_DOCUMENT_KEYS.map((key) => [key, structuredClone(content[key])]),
  );
}

export const ANIMATION_BEHAVIOUR_DEFAULTS = NORU_SITE_ANIMATION_DEFAULTS;
