/**
 * Honest seed / last-good fallback matching the post-#7 landing.
 *
 * Empty social-proof and promo collections on purpose — no fictional partners,
 * testimonials, case studies, blog posts, or banners.
 */

import type { MarketingContent } from "./types.ts";

export const MARKETING_SEED: MarketingContent = {
  brand: {
    siteName: "NORU",
    tagline: "Hospitality management platform",
    seoTitle: "NORU — Hospitality management platform",
    seoDescription:
      "NORU is a hospitality management platform for Restaurant Management, PMS, Standalone POS and Back Office Management.",
    ogDescription:
      "Four commercial packages for hotels and restaurants: Restaurant Management, PMS, Standalone POS and Back Office Management.",
  },
  hero: {
    eyebrow: "Hospitality management platform",
    headline: "Run hotels and restaurants on NORU",
    description:
      "Restaurant Management, PMS, Standalone POS and Back Office Management — one platform for the floor, the stay and the office.",
    primaryCta: { label: "Register Your Company", target: "/restaurant/register" },
    secondaryCta: { label: "See packages", target: "#packages" },
  },
  nav: [
    { id: "home", label: "Home", href: "#top", order: 10, visible: true, placement: "page" },
    { id: "packages", label: "Packages", href: "#packages", order: 20, visible: true, placement: "page" },
    {
      id: "how-it-works",
      label: "How It Works",
      href: "#how-it-works",
      order: 30,
      visible: true,
      placement: "page",
    },
    { id: "pricing", label: "Pricing", href: "#pricing", order: 40, visible: true, placement: "page" },
    { id: "contact", label: "Contact", href: "#contact", order: 50, visible: true, placement: "page" },
    {
      id: "sign-in",
      label: "Sign In",
      href: "/restaurant/login",
      order: 60,
      visible: true,
      placement: "auth",
      protectedRole: "sign_in",
    },
    {
      id: "sign-up",
      label: "Sign Up",
      href: "/restaurant/register",
      order: 70,
      visible: true,
      placement: "auth",
      protectedRole: "sign_up",
    },
    {
      id: "register",
      label: "Register Your Company",
      href: "/restaurant/register",
      order: 80,
      visible: true,
      placement: "utility",
      protectedRole: "register",
    },
    { id: "account", label: "My Account", href: "/account", order: 90, visible: true, placement: "utility" },
    { id: "scan", label: "Scan QR Code", href: "/scan", order: 100, visible: true, placement: "utility" },
  ],
  packagesSection: {
    eyebrow: "Commercial packages",
    heading: "Four packages. One hospitality platform.",
    description:
      "NORU is sold as Restaurant Management, PMS, Standalone POS and Back Office Management. Properties receive the packages they need — not a single restaurant-only product.",
  },
  packages: [
    {
      id: "restaurant-management",
      title: "Restaurant Management",
      blurb: "Menus, QR and waiter ordering, kitchen display, and restaurant till for F&B operations.",
      status: "available_now",
      icon: "restaurant",
      order: 10,
      features: [
        { id: "rm-menus", label: "Menus", status: "available_now", order: 10 },
        { id: "rm-qr", label: "QR ordering", status: "available_now", order: 20 },
        { id: "rm-waiter", label: "Waiter ordering", status: "available_now", order: 30 },
        { id: "rm-kitchen", label: "Kitchen display", status: "available_now", order: 40 },
        { id: "rm-till", label: "Restaurant till", status: "available_now", order: 50 },
      ],
    },
    {
      id: "pms",
      title: "PMS",
      blurb: "Reservations, front desk, housekeeping, folios, night audit, and direct online booking.",
      status: "available_now",
      icon: "pms",
      order: 20,
      features: [
        { id: "pms-reservations", label: "Reservations", status: "available_now", order: 10 },
        { id: "pms-front-desk", label: "Front desk", status: "available_now", order: 20 },
        { id: "pms-housekeeping", label: "Housekeeping", status: "available_now", order: 30 },
        { id: "pms-folios", label: "Folios", status: "available_now", order: 40 },
        { id: "pms-night-audit", label: "Night audit", status: "available_now", order: 50 },
        { id: "pms-direct-booking", label: "Direct online booking", status: "available_now", order: 60 },
        { id: "pms-ota-sync", label: "Live OTA channel sync", status: "coming_soon", order: 70 },
      ],
    },
    {
      id: "standalone-pos",
      title: "Standalone POS",
      blurb:
        "Catalog, sell, pay, shifts, refunds, and reports for cafés and counters — without full restaurant ops.",
      status: "available_now",
      icon: "pos",
      order: 30,
      features: [
        { id: "pos-catalog", label: "Catalog", status: "available_now", order: 10 },
        { id: "pos-sell", label: "Sell", status: "available_now", order: 20 },
        { id: "pos-pay", label: "Pay", status: "available_now", order: 30 },
        { id: "pos-shifts", label: "Shifts", status: "available_now", order: 40 },
        { id: "pos-refunds", label: "Refunds", status: "available_now", order: 50 },
        { id: "pos-reports", label: "Reports", status: "available_now", order: 60 },
      ],
    },
    {
      id: "back-office",
      title: "Back Office Management",
      blurb:
        "Evolving stock and purchasing tools toward centralized management reporting — not a full finance/HR suite yet.",
      status: "evolving",
      icon: "back_office",
      order: 40,
      features: [
        { id: "bo-stock", label: "Stock tools", status: "evolving", order: 10 },
        { id: "bo-purchasing", label: "Purchasing tools", status: "evolving", order: 20 },
        { id: "bo-reporting", label: "Centralized management reporting", status: "evolving", order: 30 },
      ],
    },
  ],
  pricing: {
    eyebrow: "Pricing",
    heading: "Packages assigned to your property",
    description:
      "NORU is licensed by commercial package, not a one-size public price list. After you register your company, packages are assigned to the property. Contact us if you need a tailored mix.",
    displayNote: "Assigned per property",
    contactNote: "Contact us if you need a tailored mix.",
  },
  partners: [],
  testimonials: [],
  caseStudies: [],
  blogPosts: [],
  footer: {
    blurb:
      "Hospitality management platform for Restaurant Management, PMS, Standalone POS and Back Office Management.",
    copyright: "© 2026 NORU. All rights reserved.",
    linkGroups: [
      {
        id: "product",
        title: "Product",
        order: 10,
        links: [
          { id: "ft-packages", label: "Packages", href: "#packages", order: 10 },
          { id: "ft-pricing", label: "Pricing", href: "#pricing", order: 20 },
          { id: "ft-contact", label: "Contact Us", href: "#contact", order: 30 },
        ],
      },
      {
        id: "restaurants",
        title: "Restaurants",
        order: 20,
        links: [
          { id: "ft-rest-signin", label: "Sign In", href: "/restaurant/login", order: 10 },
          { id: "ft-rest-register", label: "Register Your Company", href: "/restaurant/register", order: 20 },
        ],
      },
      {
        id: "customers",
        title: "Customers",
        order: 30,
        links: [
          { id: "ft-scan", label: "Scan QR Code", href: "/scan", order: 10 },
          { id: "ft-cust-signin", label: "Sign In", href: "/login", order: 20 },
          { id: "ft-cust-register", label: "Create Account", href: "/register", order: 30 },
        ],
      },
    ],
    socials: [],
  },
  faq: [],
  promoBanners: [],
  contact: {
    heading: "Contact Us",
    description: "Register your company to get started, or sign in if you already operate on NORU.",
    primaryCta: { label: "Register Your Company", target: "/restaurant/register" },
    secondaryCta: { label: "Sign In", target: "/restaurant/login" },
  },
};
