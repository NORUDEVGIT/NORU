/**
 * Marketing CMS document rules (Milestone C).
 *
 * Draft/published pair matches MarketingContent JSONB. Concurrent edits are
 * last-write-wins (no optimistic locking). Media uploads are deferred —
 * logoUrl / imageUrl remain URL strings in JSONB.
 *
 * This module never imports package entitlements or tenant approval APIs.
 */

import { isRejectedAdminHref } from "./allowlist.ts";
import { validateMarketingEditorContent, type MarketingEditorReport } from "./editor.ts";
import { MARKETING_SEED } from "./seed.ts";
import type { MarketingContent } from "./types.ts";

export const MARKETING_CMS_CONCURRENCY = "last-write-wins" as const;

export const MARKETING_REVISION_STATUSES = ["draft", "published"] as const;
export type MarketingRevisionStatus = (typeof MARKETING_REVISION_STATUSES)[number];

export interface MarketingCmsSnapshot {
  draft: MarketingContent;
  published: MarketingContent;
  draftUpdatedAt: string;
  publishedAt: string | null;
}

export interface MarketingCmsPublishResult {
  ok: boolean;
  report: MarketingEditorReport;
  snapshot: MarketingCmsSnapshot;
}

export function cloneMarketingContent(content: MarketingContent): MarketingContent {
  return structuredClone(content);
}

export function nowIso(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

export function isMarketingContent(value: unknown): value is MarketingContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MarketingContent>;
  return (
    typeof record.brand === "object" &&
    record.brand != null &&
    Array.isArray(record.nav) &&
    Array.isArray(record.packages) &&
    Array.isArray(record.partners) &&
    Array.isArray(record.testimonials) &&
    Array.isArray(record.caseStudies) &&
    Array.isArray(record.blogPosts)
  );
}

export function createSeedMarketingSnapshot(clock?: () => Date): MarketingCmsSnapshot {
  const seed = cloneMarketingContent(MARKETING_SEED);
  return {
    draft: seed,
    published: cloneMarketingContent(MARKETING_SEED),
    draftUpdatedAt: nowIso(clock),
    publishedAt: null,
  };
}

export function assertMarketingAdmin(isAdmin: boolean): void {
  if (!isAdmin) {
    throw new Error("Administrator access required.");
  }
}

export function collectAdminHrefs(content: MarketingContent): string[] {
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
  return hrefs.filter((href) => isRejectedAdminHref(href));
}

export function evaluateMarketingDocument(content: MarketingContent): MarketingEditorReport {
  return validateMarketingEditorContent(content);
}

export function evaluateSaveDraft(content: MarketingContent): {
  persist: boolean;
  report: MarketingEditorReport;
} {
  const report = evaluateMarketingDocument(content);
  const blocked =
    collectAdminHrefs(content).length > 0 ||
    report.errors.some((error) => error.code === "admin_href" || error.code === "slug_duplicate");
  return { persist: !blocked, report };
}

/**
 * Publish copies draft → published only when the document is valid.
 * On failure the last-good published document is retained.
 */
export function evaluatePublish(
  draft: MarketingContent,
  current: MarketingCmsSnapshot,
  clock?: () => Date,
): MarketingCmsPublishResult {
  const report = evaluateMarketingDocument(draft);
  if (!report.ok) {
    return { ok: false, report, snapshot: structuredClone(current) };
  }
  const publishedAt = nowIso(clock);
  return {
    ok: true,
    report,
    snapshot: {
      draft: cloneMarketingContent(draft),
      published: cloneMarketingContent(draft),
      draftUpdatedAt: current.draftUpdatedAt,
      publishedAt,
    },
  };
}

/**
 * In-memory CMS mutation used by tests and by server functions after authz.
 * Non-admins never persist. Publish never touches entitlements.
 */
export function applyMarketingMutation(input: {
  isAdmin: boolean;
  action: "saveDraft" | "publish" | "resetToSeed";
  draft?: MarketingContent;
  current: MarketingCmsSnapshot;
  clock?: () => Date;
}): MarketingCmsPublishResult {
  assertMarketingAdmin(input.isAdmin);

  if (input.action === "resetToSeed") {
    const snapshot = createSeedMarketingSnapshot(input.clock);
    return {
      ok: true,
      report: evaluateMarketingDocument(snapshot.draft),
      snapshot,
    };
  }

  if (input.action === "saveDraft") {
    if (!input.draft || !isMarketingContent(input.draft)) {
      throw new Error("Invalid marketing content.");
    }
    const { persist, report } = evaluateSaveDraft(input.draft);
    if (!persist) {
      return { ok: false, report, snapshot: structuredClone(input.current) };
    }
    return {
      ok: report.ok,
      report,
      snapshot: {
        ...input.current,
        draft: cloneMarketingContent(input.draft),
        draftUpdatedAt: nowIso(input.clock),
      },
    };
  }

  const draft = input.draft ?? input.current.draft;
  return evaluatePublish(draft, input.current, input.clock);
}
