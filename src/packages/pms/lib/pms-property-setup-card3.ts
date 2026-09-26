/**
 * PMS Property Setup Card 3 — Financial & Commercial.
 *
 * Phase 0: landing dashboard + shared domain workspace shell only.
 * No persistence, APIs, schema, or financial business logic.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD3_TITLE = "Financial & Commercial";
export const CARD3_WORKSPACE_TITLE = "Financial & Commercial";
export const CARD3_SUBTITLE = "Configure pricing, taxes, payments & billing";
export const CARD3_PURPOSE = "Taxes, Policies & Fees, Rates & Meal Plans, Payment Methods.";
export const CARD3_HASH = "financial-commercial";
export const CARD3_HREF = `${SET1_HUB_HREF}#${CARD3_HASH}`;
export const CARD3_DOMAIN_QUERY = "card3Domain";
export const CARD3_PROGRAMME_ID = "rates-guest-rules";
export const CARD3_SIDEBAR_OUT =
  "Card 3 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";

export const CARD3_PROGRESS_PERCENT = 0;
export const CARD3_PROGRESS_LABEL = "Not Started";
export const CARD3_PROGRESS_DETAIL = "0 of 8 domains configured";

export const CARD3_DOMAIN_PLACEHOLDER = "This workspace will be implemented in Phase 1.";
export const CARD3_BACK_LABEL = "Financial & Commercial";
export const CARD3_AUDIT_HISTORY_LABEL = "Audit History";

export const CARD3_DOMAINS = [
  {
    id: "currency-financial-settings",
    title: "Currency & Financial Settings",
    description: "Manage currencies, exchange rates and financial settings.",
    icon: "banknote",
  },
  {
    id: "taxes-fees",
    title: "Taxes & Fees",
    description: "Configure taxes, fees and additional charges.",
    icon: "receipt",
  },
  {
    id: "rates-pricing",
    title: "Rates & Pricing",
    description: "Manage room rates, rate plans and pricing rules.",
    icon: "tag",
  },
  {
    id: "meal-plans-packages",
    title: "Meal Plans & Packages",
    description: "Create meal plans and commercial packages.",
    icon: "utensils",
  },
  {
    id: "payments-deposits",
    title: "Payments & Deposits",
    description: "Configure payment methods, deposit rules and payment policies.",
    icon: "credit-card",
  },
  {
    id: "billing-invoicing",
    title: "Billing & Invoicing",
    description: "Configure invoices, billing rules and financial documents.",
    icon: "file-text",
  },
  {
    id: "corporate-contract-rates",
    title: "Corporate & Contract Rates",
    description: "Manage corporate agreements and negotiated rates.",
    icon: "building",
  },
  {
    id: "revenue-commercial-rules",
    title: "Revenue & Commercial Rules",
    description: "Configure restrictions, promotions, seasons and commercial controls.",
    icon: "trending-up",
  },
] as const;

export type Card3DomainId = (typeof CARD3_DOMAINS)[number]["id"];
export type Card3Domain = (typeof CARD3_DOMAINS)[number];

export function card3DomainById(id: string): Card3Domain | undefined {
  return CARD3_DOMAINS.find((domain) => domain.id === id);
}

export function card3DomainHref(domainId: Card3DomainId): string {
  return `${SET1_HUB_HREF}?${CARD3_DOMAIN_QUERY}=${encodeURIComponent(domainId)}#${CARD3_HASH}`;
}

export const CARD3_PROMOTIONS_HREF = card3DomainHref("revenue-commercial-rules");
export const CARD3_PACKAGES_HREF = card3DomainHref("meal-plans-packages");

export function card3DomainFromSearch(search: string): Card3DomainId | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get(CARD3_DOMAIN_QUERY);
  if (!value) return null;
  return card3DomainById(value) ? value : null;
}

export function isCard3WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD3_HASH || raw === "card-3" || raw === "card3";
}

export function resolveCard3Hash(hash: string): typeof CARD3_HASH | null {
  return isCard3WorkspaceHash(hash) ? CARD3_HASH : null;
}
