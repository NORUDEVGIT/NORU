/**
 * Forbidden Available-now oversell rules shared by seed tests and the Admin editor.
 * These are presentation-copy checks only — they never read or write entitlements.
 */

import { collectAvailableNowText } from "./resolve.ts";
import type {
  MarketingContent,
  MarketingFeatureBullet,
  MarketingItemStatus,
  MarketingPackageCard,
} from "./types.ts";

export const FORBIDDEN_AVAILABLE_NOW = [
  { id: "rms", pattern: /\bRMS\b/i, label: "RMS (use PMS)" },
  { id: "booking_com", pattern: /booking\.com/i, label: "Booking.com as current" },
  { id: "expedia", pattern: /expedia/i, label: "Expedia as current" },
  { id: "live_ota", pattern: /live ota|\bota (channel )?sync/i, label: "live OTA sync as current" },
  { id: "digital_invoicing", pattern: /digital invoic/i, label: "digital invoicing as current" },
  { id: "payroll", pattern: /\bpayroll\b/i, label: "Back Office payroll as current" },
  { id: "chart_of_accounts", pattern: /chart of accounts/i, label: "chart of accounts as current" },
  { id: "financial_statements", pattern: /financial statements/i, label: "financial statements as current" },
  { id: "finance_suite", pattern: /finance suite/i, label: "full finance suite as current" },
  {
    id: "enterprise_multi_property",
    pattern: /enterprise multi-property/i,
    label: "enterprise multi-property as current",
  },
] as const;

export interface ForbiddenClaimHit {
  id: string;
  label: string;
  excerpt: string;
  source: string;
}

export function findForbiddenClaimsInText(text: string): ForbiddenClaimHit[] {
  const hits: ForbiddenClaimHit[] = [];
  for (const rule of FORBIDDEN_AVAILABLE_NOW) {
    const match = text.match(rule.pattern);
    if (match) {
      hits.push({ id: rule.id, label: rule.label, excerpt: match[0], source: "text" });
    }
  }
  return hits;
}

export function findForbiddenAvailableNowClaims(content: MarketingContent): ForbiddenClaimHit[] {
  const hits: ForbiddenClaimHit[] = [];
  const scanned = collectAvailableNowText(content);
  for (const rule of FORBIDDEN_AVAILABLE_NOW) {
    const match = scanned.match(rule.pattern);
    if (match) {
      hits.push({
        id: rule.id,
        label: rule.label,
        excerpt: match[0],
        source: "available_now",
      });
    }
  }
  return hits;
}

export function forbiddenClaimsForAvailableNowField(
  status: MarketingItemStatus,
  text: string,
  source: string,
): ForbiddenClaimHit[] {
  if (status !== "available_now") return [];
  return findForbiddenClaimsInText(text).map((hit) => ({ ...hit, source }));
}

export function packageAvailableNowIssues(pkg: MarketingPackageCard): ForbiddenClaimHit[] {
  const hits: ForbiddenClaimHit[] = [];
  hits.push(
    ...forbiddenClaimsForAvailableNowField(pkg.status, `${pkg.title}\n${pkg.blurb}`, `package:${pkg.id}`),
  );
  for (const feature of pkg.features) {
    hits.push(...featureAvailableNowIssues(feature, pkg.id));
  }
  return hits;
}

export function featureAvailableNowIssues(
  feature: MarketingFeatureBullet,
  packageId: string,
): ForbiddenClaimHit[] {
  return forbiddenClaimsForAvailableNowField(
    feature.status,
    feature.label,
    `package:${packageId}:feature:${feature.id}`,
  );
}
