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
  "/login",
  "/register",
  "/account",
  "/scan",
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

export function isHashHref(href: string): boolean {
  return href.startsWith("#");
}

export function isExternalHttpHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}
