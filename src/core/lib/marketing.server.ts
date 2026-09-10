/**
 * Server-only marketing CMS persistence.
 *
 * Reads published rows through the anon (RLS-bound) client. Mutations use
 * supabaseAdmin only after requirePlatformAdmin in marketing.functions.ts.
 * This file is never imported from the browser bundle.
 *
 * Concurrent edits: last-write-wins. Media uploads deferred — URLs stay in JSONB.
 * Never reads or writes package entitlement or tenant approval tables.
 */

import { publicServerClient } from "@/core/lib/public-client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  applyMarketingMutation,
  isMarketingContent,
  type MarketingCmsPublishResult,
  type MarketingCmsSnapshot,
} from "./marketing/document.ts";
import { getMarketingContent } from "./marketing/resolve.ts";
import { MARKETING_SEED } from "./marketing/seed.ts";
import type { MarketingContent } from "./marketing/types.ts";

interface RevisionRow {
  status: "draft" | "published";
  content: Json;
  updated_at: string;
  published_at: string | null;
}

function asContent(value: Json | null | undefined): MarketingContent | null {
  return isMarketingContent(value) ? value : null;
}

function toJson(content: MarketingContent): Json {
  return content as unknown as Json;
}

export async function readPublishedMarketingContent(): Promise<MarketingContent> {
  try {
    const { data, error } = await publicServerClient()
      .from("marketing_content_revisions")
      .select("content")
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return getMarketingContent();
    return getMarketingContent(asContent(data.content));
  } catch (error) {
    console.error("[readPublishedMarketingContent]", error instanceof Error ? error.message : error);
    return getMarketingContent();
  }
}

export async function loadMarketingSnapshot(): Promise<MarketingCmsSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("marketing_content_revisions")
    .select("status, content, updated_at, published_at");
  if (error) throw new Error("We couldn't load marketing content right now.");

  const rows = (data ?? []) as RevisionRow[];
  const draftRow = rows.find((row) => row.status === "draft");
  const publishedRow = rows.find((row) => row.status === "published");
  const draft = asContent(draftRow?.content) ?? cloneSeed();
  const published = getMarketingContent(asContent(publishedRow?.content));

  if (!draftRow || !publishedRow) {
    await backfillMissingRevisions(draftRow, publishedRow);
  }

  return {
    draft,
    published,
    draftUpdatedAt: draftRow?.updated_at ?? new Date().toISOString(),
    publishedAt: publishedRow?.published_at ?? null,
  };
}

async function backfillMissingRevisions(
  draftRow: RevisionRow | undefined,
  publishedRow: RevisionRow | undefined,
): Promise<void> {
  const seed = cloneSeed();
  if (!draftRow) {
    await supabaseAdmin.from("marketing_content_revisions").upsert({
      status: "draft",
      content: toJson(seed),
      updated_at: new Date().toISOString(),
      published_at: null,
    });
  }
  if (!publishedRow) {
    await supabaseAdmin.from("marketing_content_revisions").upsert({
      status: "published",
      content: toJson(seed),
      updated_at: new Date().toISOString(),
      published_at: null,
    });
  }
}

function cloneSeed(): MarketingContent {
  return structuredClone(MARKETING_SEED);
}

export async function persistDraft(
  adminId: string,
  snapshot: MarketingCmsSnapshot,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("marketing_content_revisions")
    .upsert({
      status: "draft",
      content: toJson(snapshot.draft),
      updated_at: snapshot.draftUpdatedAt,
      updated_by: adminId,
      published_at: null,
    });
  if (error) {
    console.error("[persistDraft]", error.message);
    throw new Error("We couldn't save the marketing draft. Please try again.");
  }
}

export async function persistPublished(
  adminId: string,
  snapshot: MarketingCmsSnapshot,
): Promise<void> {
  const publishedAt = snapshot.publishedAt ?? new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("marketing_content_revisions")
    .upsert({
      status: "published",
      content: toJson(snapshot.published),
      updated_at: publishedAt,
      updated_by: adminId,
      published_at: publishedAt,
    });
  if (error) {
    console.error("[persistPublished]", error.message);
    throw new Error("We couldn't publish marketing content. The last published document was kept.");
  }
}

export async function persistSnapshot(adminId: string, snapshot: MarketingCmsSnapshot): Promise<void> {
  await persistDraft(adminId, snapshot);
  await persistPublished(adminId, snapshot);
}

export async function auditMarketingAction(
  adminId: string,
  action: "marketing_published" | "marketing_draft_saved" | "marketing_reset_to_seed",
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: adminId,
    action,
    restaurant_id: null,
    reason: null,
    metadata: metadata as Json,
  });
  if (error) {
    console.error("[auditMarketingAction]", error.message);
  }
}

export async function saveDraftDocument(
  adminId: string,
  content: MarketingContent,
): Promise<MarketingCmsPublishResult> {
  const current = await loadMarketingSnapshot();
  const result = applyMarketingMutation({
    isAdmin: true,
    action: "saveDraft",
    draft: content,
    current,
  });
  if (!result.ok && result.report.errors.some((error) => error.code === "admin_href" || error.code === "slug_duplicate")) {
    return result;
  }
  if (result.snapshot.draftUpdatedAt !== current.draftUpdatedAt) {
    await persistDraft(adminId, result.snapshot);
  }
  return result;
}

export async function publishDocument(
  adminId: string,
  draft: MarketingContent | undefined,
): Promise<MarketingCmsPublishResult> {
  const current = await loadMarketingSnapshot();
  const working: MarketingCmsSnapshot = draft
    ? { ...current, draft }
    : current;
  const result = applyMarketingMutation({
    isAdmin: true,
    action: "publish",
    draft: working.draft,
    current: working,
  });
  if (!result.ok) {
    return { ...result, snapshot: current };
  }
  try {
    if (draft) {
      await persistDraft(adminId, { ...result.snapshot, draft, draftUpdatedAt: new Date().toISOString() });
    }
    await persistPublished(adminId, result.snapshot);
    await auditMarketingAction(adminId, "marketing_published", {
      publishedAt: result.snapshot.publishedAt,
      siteName: result.snapshot.published.brand.siteName,
    });
    return result;
  } catch (error) {
    console.error("[publishDocument]", error instanceof Error ? error.message : error);
    return {
      ok: false,
      report: {
        ok: false,
        errors: [
          {
            code: "publish_failed",
            message: "Publish failed. The last published marketing document was kept.",
          },
        ],
        forbiddenClaims: [],
      },
      snapshot: current,
    };
  }
}

export async function revertDraftDocument(adminId: string): Promise<MarketingCmsPublishResult> {
  const current = await loadMarketingSnapshot();
  const result = applyMarketingMutation({
    isAdmin: true,
    action: "saveDraft",
    draft: current.published,
    current,
  });
  if (result.snapshot.draftUpdatedAt !== current.draftUpdatedAt) {
    await persistDraft(adminId, result.snapshot);
  }
  return result;
}

export async function resetDocumentToSeed(adminId: string): Promise<MarketingCmsPublishResult> {
  const current = await loadMarketingSnapshot();
  const result = applyMarketingMutation({
    isAdmin: true,
    action: "resetToSeed",
    current,
  });
  await persistSnapshot(adminId, result.snapshot);
  await auditMarketingAction(adminId, "marketing_reset_to_seed", {
    resetAt: result.snapshot.draftUpdatedAt,
  });
  return result;
}

