import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  GUEST_DOCUMENT_KIND_LABELS,
  GUEST_DOCUMENT_KINDS,
  GUEST_DOCUMENT_STATUS_LABELS,
  STAFF_VERIFY_COPY,
  type GuestDocumentKind,
} from "@/packages/pms/lib/guest-profile-wave2";
import { INDIVIDUAL_IDENTITY_UPLOAD_COPY } from "@/packages/pms/lib/guest-profile-individual";
import {
  createGuestDocumentUpload,
  listGuestDocuments,
  registerGuestDocument,
} from "@/packages/pms/lib/guests.functions";
import { supabase } from "@/integrations/supabase/client";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

export function GuestFormIdentityUpload({
  restaurantId,
  guestId,
}: {
  restaurantId: string;
  guestId: string;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<GuestDocumentKind>("passport");
  const [uploading, setUploading] = useState(false);
  const startUpload = useServerFn(createGuestDocumentUpload);
  const register = useServerFn(registerGuestDocument);
  const fetchDocuments = useServerFn(listGuestDocuments);

  const documentsQuery = useQuery({
    queryKey: ["guest-documents", restaurantId, guestId],
    queryFn: () => fetchDocuments({ data: { restaurantId, guestId } }),
    retry: false,
  });

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!(ACCEPTED as readonly string[]).includes(file.type)) {
          toast.error(`${file.name}: only JPG, PNG, WebP or PDF.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: files must be 8 MB or smaller.`);
          continue;
        }
        const ticket = await startUpload({
          data: {
            restaurantId,
            guestId,
            contentType: file.type as (typeof ACCEPTED)[number],
            size: file.size,
          },
        });
        if (!ticket.ok) {
          toast.error(ticket.message);
          continue;
        }
        const { error } = await supabase.storage
          .from("property-images")
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (error) {
          toast.error(`${file.name}: upload failed.`);
          continue;
        }
        const saved = await register({
          data: {
            restaurantId,
            guestId,
            storagePath: ticket.path,
            kind,
            mimeType: file.type as (typeof ACCEPTED)[number],
            size: file.size,
          },
        });
        if (!saved.ok) toast.error(saved.message);
      }
      toast.success("Document attached.");
      void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId, guestId] });
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guestId] });
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const documents = documentsQuery.data?.documents ?? [];

  return (
    <div className="space-y-3" data-testid="individual-identity-upload">
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_IDENTITY_UPLOAD_COPY}</p>
      <p className="text-xs text-muted-foreground">{STAFF_VERIFY_COPY}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor="individual-doc-kind">Document kind</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as GuestDocumentKind)}>
            <SelectTrigger id="individual-doc-kind" data-testid="individual-doc-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUEST_DOCUMENT_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {GUEST_DOCUMENT_KIND_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          data-testid="individual-identity-upload-button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Upload document"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(event) => void onFiles(event.target.files)}
        />
      </div>
      {documents.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {documents.map((doc) => (
            <li key={doc.id}>
              {GUEST_DOCUMENT_KIND_LABELS[doc.kind]} · {GUEST_DOCUMENT_STATUS_LABELS[doc.verificationStatus]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
