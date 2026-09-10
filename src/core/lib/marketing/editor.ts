/**
 * Admin Marketing editor rules. Presentation-only — never calls entitlement APIs.
 */

import {
  assertAllowedMarketingHref,
  isAllowedMarketingHref,
  isAllowedSocialHref,
  isRejectedAdminHref,
  type MarketingNavHref,
} from "./allowlist.ts";
import { findForbiddenAvailableNowClaims, type ForbiddenClaimHit } from "./claims.ts";
import { validateMarketingContent } from "./resolve.ts";
import {
  MARKETING_ITEM_STATUSES,
  PROTECTED_NAV_ROLES,
  type MarketingContent,
  type MarketingItemStatus,
  type MarketingNavItem,
} from "./types.ts";

export const MARKETING_ADMIN_STATUS_LABELS: Record<MarketingItemStatus, string> = {
  available_now: "Available now",
  coming_soon: "Coming soon",
  evolving: "Evolving",
  hidden: "Hidden",
};

export { MARKETING_ITEM_STATUSES };

export const MARKETING_CARD_DISCLAIMER =
  "Marketing card ≠ product entitlement. Saving these cards never enables, disables, or assigns packages to a property.";

export interface MarketingEditorIssue {
  code: string;
  message: string;
  path?: string;
}

export interface MarketingEditorReport {
  ok: boolean;
  errors: MarketingEditorIssue[];
  forbiddenClaims: ForbiddenClaimHit[];
}

export function parseMarketingHref(href: string): MarketingNavHref | MarketingEditorIssue {
  const trimmed = href.trim();
  if (isRejectedAdminHref(trimmed)) {
    return {
      code: "admin_href",
      message: `Admin paths are not allowed on the public site: ${trimmed}`,
      path: trimmed,
    };
  }
  if (!isAllowedMarketingHref(trimmed)) {
    return {
      code: "unknown_href",
      message: `That path is not on the public marketing allowlist: ${trimmed}`,
      path: trimmed,
    };
  }
  return trimmed;
}

export function requireMarketingHref(href: string): MarketingNavHref {
  const parsed = parseMarketingHref(href);
  if (typeof parsed !== "string") {
    throw new Error(parsed.message);
  }
  return parsed;
}

export function isProtectedNavItem(item: Pick<MarketingNavItem, "protectedRole">): boolean {
  return item.protectedRole != null;
}

export function canRemoveNavItem(item: Pick<MarketingNavItem, "protectedRole" | "label">): MarketingEditorIssue | null {
  if (!isProtectedNavItem(item)) return null;
  return {
    code: "protected_nav_remove",
    message: `${item.label} is a protected Sign In / Sign Up / Register link and cannot be removed.`,
  };
}

export function canHideOrUnpublishNavItem(
  item: Pick<MarketingNavItem, "protectedRole" | "label">,
): MarketingEditorIssue | null {
  if (!isProtectedNavItem(item)) return null;
  return {
    code: "protected_nav_hide",
    message: `${item.label} is a protected Sign In / Sign Up / Register link and cannot be unpublished or hidden.`,
  };
}

export function missingProtectedNavRoles(nav: readonly MarketingNavItem[]): MarketingEditorIssue[] {
  const errors: MarketingEditorIssue[] = [];
  for (const role of PROTECTED_NAV_ROLES) {
    const found = nav.find((item) => item.protectedRole === role);
    if (!found) {
      errors.push({
        code: "protected_nav_missing",
        message: `Navigation must keep a ${role.replaceAll("_", " ")} link.`,
        path: role,
      });
      continue;
    }
    if (!found.visible) {
      errors.push({
        code: "protected_nav_hidden",
        message: `${found.label} must stay visible on the public site.`,
        path: role,
      });
    }
  }
  return errors;
}

export function validateMarketingEditorContent(content: MarketingContent): MarketingEditorReport {
  const errors: MarketingEditorIssue[] = [];
  try {
    validateMarketingContent(content);
  } catch (error) {
    errors.push({
      code: "structural",
      message: error instanceof Error ? error.message : "Marketing content is invalid.",
    });
  }

  for (const item of content.nav) {
    if (isRejectedAdminHref(item.href) || !isAllowedMarketingHref(item.href)) {
      errors.push({
        code: isRejectedAdminHref(item.href) ? "admin_href" : "unknown_href",
        message: isRejectedAdminHref(item.href)
          ? `Admin paths are not allowed: ${item.href}`
          : `Unknown nav path: ${item.href}`,
        path: `nav.${item.id}`,
      });
    }
  }

  errors.push(...missingProtectedNavRoles(content.nav));

  for (const social of content.footer.socials) {
    if (!isAllowedSocialHref(social.href)) {
      errors.push({
        code: "social_href",
        message: `Footer social link must be https and must not point at Admin: ${social.href}`,
        path: `footer.socials.${social.id}`,
      });
    }
  }

  const forbiddenClaims = findForbiddenAvailableNowClaims(content);
  for (const hit of forbiddenClaims) {
    errors.push({
      code: "forbidden_available_now",
      message: `Cannot mark “${hit.label}” as Available now.`,
      path: hit.source,
    });
  }

  return { ok: errors.length === 0, errors, forbiddenClaims };
}

/** Re-export for forms that need to assert a CTA target after a select change. */
export function assertEditorHref(href: string): MarketingNavHref {
  if (isRejectedAdminHref(href)) {
    throw new Error(`Admin paths are not allowed on the public site: ${href}`);
  }
  return assertAllowedMarketingHref(href);
}

export function removeNavItem(nav: MarketingNavItem[], id: string): MarketingNavItem[] {
  const item = nav.find((entry) => entry.id === id);
  if (!item) return nav;
  const blocked = canRemoveNavItem(item);
  if (blocked) throw new Error(blocked.message);
  return nav.filter((entry) => entry.id !== id);
}

export function setNavItemVisible(nav: MarketingNavItem[], id: string, visible: boolean): MarketingNavItem[] {
  return nav.map((item) => {
    if (item.id !== id) return item;
    if (!visible) {
      const blocked = canHideOrUnpublishNavItem(item);
      if (blocked) throw new Error(blocked.message);
    }
    return { ...item, visible };
  });
}

export function setNavItemHref(nav: MarketingNavItem[], id: string, href: string): MarketingNavItem[] {
  const parsed = requireMarketingHref(href);
  return nav.map((item) => (item.id === id ? { ...item, href: parsed } : item));
}

export function newMarketingId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
