/**
 * Public marketing content model (Milestone A).
 *
 * These shapes are presentation-only. Marketing packages are NOT entitlements
 * and must never be written to package entitlement tables or tenant approval.
 * A future Admin Marketing CMS will edit this same inventory.
 */

import type { MarketingNavHref } from "./allowlist.ts";

export const MARKETING_ITEM_STATUSES = [
  "available_now",
  "coming_soon",
  "evolving",
  "hidden",
] as const;

export type MarketingItemStatus = (typeof MARKETING_ITEM_STATUSES)[number];

/** Conceptual roles Admin must not delete from public chrome. */
export const PROTECTED_NAV_ROLES = ["sign_in", "sign_up", "register"] as const;
export type ProtectedNavRole = (typeof PROTECTED_NAV_ROLES)[number];

export const MARKETING_NAV_PLACEMENTS = ["page", "auth", "utility"] as const;
export type MarketingNavPlacement = (typeof MARKETING_NAV_PLACEMENTS)[number];

export const MARKETING_PACKAGE_ICON_KEYS = [
  "restaurant",
  "pms",
  "pos",
  "back_office",
] as const;
export type MarketingPackageIconKey = (typeof MARKETING_PACKAGE_ICON_KEYS)[number];

export interface BrandContent {
  siteName: string;
  tagline: string;
  /** Optional CMS-managed mark. When omitted, the built-in NORU logo is used. */
  logoUrl?: string;
  seoTitle: string;
  seoDescription: string;
  ogDescription: string;
}

export interface MarketingCta {
  label: string;
  target: MarketingNavHref;
}

export interface HeroContent {
  eyebrow: string;
  headline: string;
  description: string;
  primaryCta: MarketingCta;
  secondaryCta?: MarketingCta;
}

export interface MarketingNavItem {
  id: string;
  label: string;
  href: MarketingNavHref;
  order: number;
  visible: boolean;
  placement: MarketingNavPlacement;
  /** When set, Admin editors must keep this item (Sign In / Sign Up / Register). */
  protectedRole?: ProtectedNavRole;
}

export interface MarketingFeatureBullet {
  id: string;
  label: string;
  status: MarketingItemStatus;
  order: number;
}

export interface MarketingPackageCard {
  id: string;
  title: string;
  blurb: string;
  /** Card-level status. Hidden cards are omitted from the public site. */
  status: MarketingItemStatus;
  features: MarketingFeatureBullet[];
  order: number;
  icon: MarketingPackageIconKey;
}

export interface PackagesSectionContent {
  eyebrow: string;
  heading: string;
  description: string;
}

export interface PricingContent {
  eyebrow: string;
  heading: string;
  description: string;
  /** Display-only — not a billed price. */
  displayNote: string;
  contactNote: string;
}

export interface MarketingPartner {
  id: string;
  name: string;
  logoUrl?: string;
  href?: string;
  order: number;
  published: boolean;
}

export interface MarketingTestimonial {
  id: string;
  quote: string;
  authorName: string;
  authorRole?: string;
  propertyName?: string;
  order: number;
  published: boolean;
}

export interface MarketingCaseStudy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  published: boolean;
  order: number;
}

export interface MarketingBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  published: boolean;
  publishedAt?: string;
  order: number;
}

export interface FooterLink {
  id: string;
  label: string;
  href: MarketingNavHref;
  order: number;
}

export interface FooterLinkGroup {
  id: string;
  title: string;
  links: FooterLink[];
  order: number;
}

export interface FooterSocial {
  id: string;
  label: string;
  href: string;
  order: number;
}

export interface FooterContent {
  blurb: string;
  copyright: string;
  linkGroups: FooterLinkGroup[];
  socials: FooterSocial[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  order: number;
  active: boolean;
}

export interface PromoBanner {
  id: string;
  headline: string;
  description?: string;
  imageUrl?: string;
  cta?: MarketingCta;
  order: number;
  active: boolean;
}

export interface ContactContent {
  heading: string;
  description: string;
  primaryCta: MarketingCta;
  secondaryCta?: MarketingCta;
}

export interface MarketingContent {
  brand: BrandContent;
  hero: HeroContent;
  nav: MarketingNavItem[];
  packagesSection: PackagesSectionContent;
  /** Marketing cards only — never package entitlements. */
  packages: MarketingPackageCard[];
  pricing: PricingContent;
  partners: MarketingPartner[];
  testimonials: MarketingTestimonial[];
  caseStudies: MarketingCaseStudy[];
  blogPosts: MarketingBlogPost[];
  footer: FooterContent;
  faq: FaqItem[];
  promoBanners: PromoBanner[];
  contact: ContactContent;
}
