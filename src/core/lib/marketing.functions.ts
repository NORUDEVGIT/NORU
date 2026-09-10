/**
 * Marketing CMS server functions (Milestone C).
 *
 * Public reads published JSONB (seed fallback). Admin mutations require
 * requirePlatformAdmin. This module never imports package entitlements.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "./admin-authz";
import { isMarketingContent } from "./marketing/document.ts";
import { getMarketingContent } from "./marketing/resolve.ts";
import type { MarketingContent } from "./marketing/types.ts";

const marketingContentSchema = z.custom<MarketingContent>((value) => isMarketingContent(value), {
  message: "Invalid marketing content.",
});

const saveDraftInputSchema = z.object({ content: marketingContentSchema });
const publishInputSchema = z.object({ content: marketingContentSchema.optional() });

/** Public — published document, or the honest seed if missing/invalid/unavailable. */
export const getPublishedMarketingContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketingContent> => {
    try {
      const { readPublishedMarketingContent } = await import("./marketing.server");
      return await readPublishedMarketingContent();
    } catch (error) {
      console.error("[getPublishedMarketingContent]", error instanceof Error ? error.message : error);
      return getMarketingContent();
    }
  },
);

export const getDraftMarketingContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { loadMarketingSnapshot } = await import("./marketing.server");
    return loadMarketingSnapshot();
  });

export const saveDraftMarketingContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveDraftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { saveDraftDocument } = await import("./marketing.server");
    return saveDraftDocument(context.userId, data.content);
  });

export const publishMarketingContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => publishInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { publishDocument } = await import("./marketing.server");
    return publishDocument(context.userId, data.content);
  });

export const revertDraftMarketingContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { revertDraftDocument } = await import("./marketing.server");
    return revertDraftDocument(context.userId);
  });

export const resetMarketingContentToSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context);
    const { resetDocumentToSeed } = await import("./marketing.server");
    return resetDocumentToSeed(context.userId);
  });
