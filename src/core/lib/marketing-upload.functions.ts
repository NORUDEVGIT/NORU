import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "./admin-authz";
import {
  MARKETING_IMAGE_MAX_BYTES,
  MARKETING_IMAGE_TYPES,
  MARKETING_MEDIA_BUCKET,
  marketingUploadFailureMessage,
} from "./marketing-media.ts";

export {
  MARKETING_IMAGE_MAX_BYTES,
  MARKETING_IMAGE_TYPES,
  MARKETING_MEDIA_BUCKET,
  marketingUploadFailureMessage,
} from "./marketing-media.ts";

const EXT: Record<(typeof MARKETING_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const createMarketingUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        contentType: z.enum(MARKETING_IMAGE_TYPES),
        size: z.number().int().positive().max(MARKETING_IMAGE_MAX_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `site/${crypto.randomUUID()}.${EXT[data.contentType]}`;
    const signed = await supabaseAdmin.storage
      .from(MARKETING_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      throw new Error(marketingUploadFailureMessage(signed.error?.message ?? ""));
    }
    const publicUrl = supabaseAdmin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(path)
      .data.publicUrl;
    return { path, token: signed.data.token, publicUrl };
  });
