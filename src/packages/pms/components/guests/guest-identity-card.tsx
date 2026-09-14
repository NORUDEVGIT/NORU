import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ID_DOCUMENT_LABELS } from "@/packages/pms/lib/fo-check-in";
import {
  GUEST_DOCUMENT_KIND_LABELS,
  GUEST_DOCUMENT_KINDS,
  GUEST_DOCUMENT_STATUS_LABELS,
  STAFF_VERIFY_COPY,
  WAVE2_MIGRATION_UNAVAILABLE,
  type GuestDocumentKind,
} from "@/packages/pms/lib/guest-profile-wave2";
import {
  createGuestDocumentUpload,
  listGuestDocuments,
  registerGuestDocument,
  reviewGuestDocument,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { MaskedIdNumber } from "@/packages/pms/components/guests/guest-id-mask";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

export function GuestIdentityCard({
  restaurantId,
  guest,
}: {
  restaurantId: string;
  guest: GuestProfile;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<GuestDocumentKind>("passport");
  const [uploading, setUploading] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const startUpload = useServerFn(createGuestDocumentUpload);
  const register = useServerFn(registerGuestDocument);
  const fetchDocuments = useServerFn(listGuestDocuments);
  const review = useServerFn(reviewGuestDocument);

  const documentsQuery = useQuery({
    queryKey: ["guest-documents", restaurantId, guest.id],
    queryFn: () => fetchDocuments({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId, guest.id] });
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
  }

  const reviewMutation = useMutation({
    mutationFn: (input: { documentId: string; status: "verified" | "rejected"; reason?: string }) =>
      review({
        data: {
          restaurantId,
          guestId: guest.id,
          documentId: input.documentId,
          status: input.status,
          reason: input.reason,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Document review saved.");
      setRejectId(null);
      setRejectReason("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
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
            guestId: guest.id,
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
            guestId: guest.id,
            storagePath: ticket.path,
            kind,
            mimeType: file.type as (typeof ACCEPTED)[number],
            size: file.size,
          },
        });
        if (!saved.ok) toast.error(saved.message);
      }
      toast.success("Document attached.");
      refresh();
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const payload = documentsQuery.data;
  const documents = payload?.documents ?? [];

  return (
    <div className="space-y-6" data-testid="guest-identity-card">
      <div>
        <h2 className="font-display text-xl">Identity & Documents</h2>
        <p className="text-sm text-muted-foreground">{STAFF_VERIFY_COPY}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-medium">ID text</p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">ID type</span>
            <span>{guest.idDocumentType ? ID_DOCUMENT_LABELS[guest.idDocumentType] : "—"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">ID number</span>
            <MaskedIdNumber value={guest.idDocumentNumber} />
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">ID expiry</span>
            <span>{guest.idDocumentExpiry ?? "—"}</span>
          </div>
        </div>
      </div>

      {payload && !payload.available ? (
        <p className="text-sm text-muted-foreground">{WAVE2_MIGRATION_UNAVAILABLE}</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 space-y-1.5">
              <Label htmlFor="guest-doc-kind">Document kind</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as GuestDocumentKind)}>
                <SelectTrigger id="guest-doc-kind">
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
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
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

          {documentsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents attached yet.</p>
          ) : (
            <ul className="space-y-3">
              {documents.map((doc) => (
                <li key={doc.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{GUEST_DOCUMENT_KIND_LABELS[doc.kind]}</p>
                      <p className="text-xs text-muted-foreground">
                        {GUEST_DOCUMENT_STATUS_LABELS[doc.verificationStatus]}
                        {doc.verifiedAt
                          ? ` · ${dateTime(doc.verifiedAt)}${doc.verifiedByName ? ` by ${doc.verifiedByName}` : ""}`
                          : ""}
                      </p>
                      {doc.rejectionReason ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Reason: {doc.rejectionReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {doc.url ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={doc.url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </Button>
                      ) : null}
                      {doc.verificationStatus !== "verified" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({ documentId: doc.id, status: "verified" })
                          }
                        >
                          Staff verify
                        </Button>
                      ) : null}
                      {doc.verificationStatus !== "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewMutation.isPending}
                          onClick={() => setRejectId(doc.id)}
                        >
                          Reject
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {rejectId === doc.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        rows={2}
                        placeholder="Rejection reason (optional)"
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({
                              documentId: doc.id,
                              status: "rejected",
                              reason: rejectReason,
                            })
                          }
                        >
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
