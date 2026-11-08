/**
 * Shared public-nav allowlist for the marketing site and a future Admin editor.
 * `/admin` and `/admin/*` are intentionally omitted and must stay rejected.
 */

export const MARKETING_NAV_HREFS = [
  "/",
  "#top",
  "#packages",
  "#pricing",
  "#contact",
  "#how-it-works",
  "#features",
  "#for-restaurants",
  "/restaurant/login",
  "/restaurant/register",
] as const;

export type MarketingNavHref = (typeof MARKETING_NAV_HREFS)[number];

const ALLOWED_HREF_SET = new Set<string>(MARKETING_NAV_HREFS);

export function isAllowedMarketingHref(href: string): href is MarketingNavHref {
  return ALLOWED_HREF_SET.has(href);
}

export function isRejectedAdminHref(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return path === "/admin" || path.startsWith("/admin/");
}

export function assertAllowedMarketingHref(href: string): MarketingNavHref {
  if (isRejectedAdminHref(href) || !isAllowedMarketingHref(href)) {
    throw new Error(`Marketing href is not on the public allowlist: ${href}`);
  }
  return href;
}

/** Footer socials may be https URLs only — never free-typed admin paths. */
export function isAllowedSocialHref(href: string): boolean {
  if (isRejectedAdminHref(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

const UNSAFE_HREF_SCHEMES = /^(javascript|data|vbscript):/i;

/** Hash pages the current Noru public site actually routes (`/#product/pms`, `/#resources/contact`). */
const NORU_SITE_HASH_PAGES = ["home", "product", "solutions", "pricing", "resources"] as const;

/**
 * Targets for the live Noru site CTA / legal links.
 * Does not treat obsolete landing hashes (`#packages`, `#how-it-works`) as valid.
 */
export function isAllowedNoruSiteHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || isRejectedAdminHref(trimmed) || UNSAFE_HREF_SCHEMES.test(trimmed)) {
    return false;
  }
  if (trimmed === "#" || trimmed === "/") return true;
  if (trimmed === "/restaurant/login" || trimmed === "/restaurant/register") return true;
  if (trimmed.startsWith("https://")) return isAllowedSocialHref(trimmed);
  if (!trimmed.startsWith("#")) return false;
  const [page, ...rest] = trimmed.slice(1).split("/");
  if (!page) return true;
  if (!(NORU_SITE_HASH_PAGES as readonly string[]).includes(page)) return false;
  return rest.every((segment) => /^[\w-]+$/.test(segment));
}

/** Selectable targets for the live NORU header/CTA/legal editors. */
export const NORU_SITE_ADMIN_HREFS = [
  "#",
  "#resources/contact",
  "#pricing",
  "#product",
  "#solutions",
  "#resources",
  "#resources/about",
  "#resources/blogs",
  "#resources/testimonials",
  "/restaurant/login",
  "/restaurant/register",
] as const;

export type NoruSiteAdminHref = (typeof NORU_SITE_ADMIN_HREFS)[number];

export function isHashHref(href: string): boolean {
  return href.startsWith("#");
}

export function isExternalHttpHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}
