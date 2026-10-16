import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createMarketingUploadUrl,
  MARKETING_IMAGE_TYPES,
} from "@/core/lib/marketing-upload.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { TextField } from "@/core/components/admin/marketing-form-fields";

export function MarketingImageField({
  id,
  label,
  url,
  alt,
  onUrl,
  onAlt,
}: {
  id: string;
  label: string;
  url: string;
  alt: string;
  onUrl: (url: string) => void;
  onAlt: (alt: string) => void;
}) {
  const startUpload = useServerFn(createMarketingUploadUrl);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (
      !(MARKETING_IMAGE_TYPES as readonly string[]).includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Use a JPEG, PNG, WebP, or GIF under 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const ticket = await startUpload({
        data: { contentType: file.type as (typeof MARKETING_IMAGE_TYPES)[number], size: file.size },
      });
      const uploaded = await supabase.storage
        .from("marketing-media")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      onUrl(ticket.publicUrl);
      toast.success("Image uploaded. Publish to show it on the public site.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <TextField
        id={`${id}-url`}
        label={`${label} URL`}
        value={url}
        onChange={onUrl}
        hint="https URL, or upload a file below."
      />
      <TextField id={`${id}-alt`} label={`${label} alt text`} value={alt} onChange={onAlt} />
      <label className="block text-sm">
        Upload
        <input
          className="mt-1 block text-sm"
          type="file"
          accept={MARKETING_IMAGE_TYPES.join(",")}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
      </label>
      {url ? (
        <img src={url} alt={alt || ""} className="h-16 w-auto rounded border border-border" />
      ) : null}
      {url ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onUrl("")}>
          Remove image
        </Button>
      ) : null}
    </div>
  );
}
