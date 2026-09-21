import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { GuestRestrictionBadges } from "@/packages/pms/components/guests/guest-bits";
import { IDENTITY_UPLOAD_ACCEPT, IDENTITY_UPLOAD_MAX_BYTES } from "@/packages/pms/components/guests/guest-form-identity-upload";
import {
  DOCUMENT_EXPIRY_STATUS_LABELS,
  IDENTITY_DOCUMENTS_COPY,
  IDENTITY_DOCUMENTS_EMPTY,
  IDENTITY_DOCUMENTS_NO_ACTIVE_TYPES,
  IDENTITY_DOCUMENTS_NO_IMAGE,
  documentExpiryStatus,
  nextSelectedDocumentId,
  typeAllowedForNewDocument,
} from "@/packages/pms/lib/guest-identity-documents";
import {
  GUEST_DOCUMENT_STATUS_LABELS,
  PREFERENCE_SETUP_HREF,
  STAFF_VERIFY_COPY,
  WAVE2_MIGRATION_UNAVAILABLE,
} from "@/packages/pms/lib/guest-profile-wave2";
import {
  clearGuestDocumentImage,
  createGuestDocumentUpload,
  deleteGuestDocument,
  getGuestDocument,
  listGuestDocuments,
  listGuestIdentityDocumentTypes,
  reviewGuestDocument,
  saveGuestDocument,
  saveGuestDocumentImage,
  type GuestDocument,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import { ISO_COUNTRIES, countryNameFromInput } from "@/packages/pms/lib/pms-geography";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";

type FormState = {
  idTypeId: string;
  documentNumber: string;
  issuingCountry: string;
  issueDate: string;
  expiryDate: string;
  issuingAuthority: string;
  notes: string;
  pendingFront: File | null;
  pendingBack: File | null;
};

const emptyForm: FormState = {
  idTypeId: "",
  documentNumber: "",
  issuingCountry: "",
  issueDate: "",
  expiryDate: "",
  issuingAuthority: "",
  notes: "",
  pendingFront: null,
  pendingBack: null,
};

function expiryClass(status: ReturnType<typeof documentExpiryStatus>) {
  if (status === "expired") return "text-destructive";
  if (status === "expiring_soon") return "text-amber-800";
  return "text-muted-foreground";
}

async function uploadDocumentFile(params: {
  restaurantId: string;
  guestId: string;
  file: File;
  startUpload: (input: {
    data: {
      restaurantId: string;
      guestId: string;
      contentType: (typeof IDENTITY_UPLOAD_ACCEPT)[number];
      size: number;
    };
  }) => Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }>;
}): Promise<{ ok: true; path: string; mimeType: string; size: number } | { ok: false; message: string }> {
  const { restaurantId, guestId, file, startUpload } = params;
  if (!(IDENTITY_UPLOAD_ACCEPT as readonly string[]).includes(file.type)) {
    return { ok: false, message: `${file.name}: only JPG, PNG, WebP or PDF.` };
  }
  if (file.size > IDENTITY_UPLOAD_MAX_BYTES) {
    return { ok: false, message: `${file.name}: files must be 8 MB or smaller.` };
  }
  const ticket = await startUpload({
    data: {
      restaurantId,
      guestId,
      contentType: file.type as (typeof IDENTITY_UPLOAD_ACCEPT)[number],
      size: file.size,
    },
  });
  if (!ticket.ok) return { ok: false, message: ticket.message };
  const { error } = await supabase.storage
    .from("property-images")
    .uploadToSignedUrl(ticket.path, ticket.token, file);
  if (error) return { ok: false, message: error.message };
  return { ok: true, path: ticket.path, mimeType: file.type, size: file.size };
}

export function GuestIdentityCard({
  restaurantId,
  guest,
}: {
  restaurantId: string;
  guest: GuestProfile;
}) {
  const queryClient = useQueryClient();
  const { dateTime, timezone } = useRestaurantTime();
  const today = propertyToday(timezone);
  const tableRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchDocuments = useServerFn(listGuestDocuments);
  const fetchTypes = useServerFn(listGuestIdentityDocumentTypes);
  const fetchDocument = useServerFn(getGuestDocument);
  const saveDocument = useServerFn(saveGuestDocument);
  const startUpload = useServerFn(createGuestDocumentUpload);
  const persistImage = useServerFn(saveGuestDocumentImage);
  const clearImage = useServerFn(clearGuestDocumentImage);
  const removeDocument = useServerFn(deleteGuestDocument);
  const review = useServerFn(reviewGuestDocument);

  const documentsQuery = useQuery({
    queryKey: ["guest-documents", restaurantId, guest.id],
    queryFn: () => fetchDocuments({ data: { restaurantId, guestId: guest.id } }),
    retry: false,
  });
  const typesQuery = useQuery({
    queryKey: ["guest-identity-document-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });

  const documents = documentsQuery.data?.documents ?? [];
  const types = typesQuery.data?.types ?? [];
  const selected = documents.find((item) => item.id === selectedId) ?? null;
  const profileTypeId = guest.profileType?.id ?? null;
  const creatableTypes = types.filter((type) => typeAllowedForNewDocument(type, profileTypeId));

  useEffect(() => {
    if (mode === "create") return;
    const next = nextSelectedDocumentId(documents, selectedId);
    if (next !== selectedId) setSelectedId(next);
  }, [documents, selectedId, mode]);

  const selectedType = useMemo(() => {
    const typeId = mode === "view" ? selected?.idTypeId : form.idTypeId;
    return types.find((item) => item.id === typeId) ?? null;
  }, [form.idTypeId, mode, selected?.idTypeId, types]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId, guest.id] });
    void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, guest.id] });
  }

  function startCreate() {
    setMode("create");
    setConfirmDelete(false);
    setRejectOpen(false);
    setForm({
      ...emptyForm,
      idTypeId: creatableTypes[0]?.id ?? "",
    });
  }

  async function startEdit(document: GuestDocument) {
    setMode("edit");
    setConfirmDelete(false);
    setRejectOpen(false);
    setSelectedId(document.id);
    const loaded = await fetchDocument({
      data: { restaurantId, guestId: guest.id, documentId: document.id },
    });
    if (!loaded.ok) {
      toast.error(loaded.message);
      return;
    }
    setForm({
      idTypeId: loaded.document.idTypeId ?? "",
      documentNumber: loaded.document.documentNumber ?? "",
      issuingCountry: loaded.document.issuingCountry ?? "",
      issueDate: loaded.document.issueDate ?? "",
      expiryDate: loaded.document.expiryDate ?? "",
      issuingAuthority: loaded.document.issuingAuthority ?? "",
      notes: loaded.document.notes ?? "",
      pendingFront: null,
      pendingBack: null,
    });
  }

  async function persistPendingImages(documentId: string, pending: FormState) {
    for (const [side, file] of [
      ["front", pending.pendingFront],
      ["back", pending.pendingBack],
    ] as const) {
      if (!file) continue;
      const uploaded = await uploadDocumentFile({ restaurantId, guestId: guest.id, file, startUpload });
      if (!uploaded.ok) return uploaded;
      const saved = await persistImage({
        data: {
          restaurantId,
          guestId: guest.id,
          documentId,
          side,
          storagePath: uploaded.path,
          mimeType: uploaded.mimeType as (typeof IDENTITY_UPLOAD_ACCEPT)[number],
          size: uploaded.size,
        },
      });
      if (!saved.ok) return saved;
    }
    return { ok: true as const };
  }

  async function onSave() {
    if (!form.idTypeId) {
      toast.error("Choose a document type.");
      return;
    }
    setSaving(true);
    const result = await saveDocument({
      data: {
        restaurantId,
        guestId: guest.id,
        documentId: mode === "edit" ? (selectedId ?? undefined) : undefined,
        idTypeId: form.idTypeId,
        documentNumber: form.documentNumber || null,
        issuingCountry: form.issuingCountry || null,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        issuingAuthority: form.issuingAuthority || null,
        notes: form.notes || null,
      },
    });
    if (!result.ok) {
      setSaving(false);
      toast.error(result.message);
      return;
    }
    const images = await persistPendingImages(result.documentId, form);
    setSaving(false);
    if (!images.ok) {
      toast.error(images.message);
      setSelectedId(result.documentId);
      setMode("view");
      refresh();
      return;
    }
    toast.success(mode === "edit" ? "Document saved." : "Document added.");
    setSelectedId(result.documentId);
    setMode("view");
    setForm(emptyForm);
    refresh();
  }

  async function onReplaceImage(side: "front" | "back", file: File | undefined) {
    if (!file || !selected) return;
    if (mode === "create") {
      setForm((current) => ({
        ...current,
        pendingFront: side === "front" ? file : current.pendingFront,
        pendingBack: side === "back" ? file : current.pendingBack,
      }));
      return;
    }
    const uploaded = await uploadDocumentFile({ restaurantId, guestId: guest.id, file, startUpload });
    if (!uploaded.ok) {
      toast.error(uploaded.message);
      return;
    }
    const saved = await persistImage({
      data: {
        restaurantId,
        guestId: guest.id,
        documentId: selected.id,
        side,
        storagePath: uploaded.path,
        mimeType: uploaded.mimeType as (typeof IDENTITY_UPLOAD_ACCEPT)[number],
        size: uploaded.size,
      },
    });
    if (!saved.ok) {
      toast.error(saved.message);
      return;
    }
    toast.success(side === "front" ? "Front image saved." : "Back image saved.");
    refresh();
  }

  async function onClearImage(side: "front" | "back") {
    if (mode === "create") {
      setForm((current) => ({
        ...current,
        pendingFront: side === "front" ? null : current.pendingFront,
        pendingBack: side === "back" ? null : current.pendingBack,
      }));
      return;
    }
    if (!selected) return;
    const result = await clearImage({
      data: { restaurantId, guestId: guest.id, documentId: selected.id, side },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(side === "front" ? "Front image removed." : "Back image removed.");
    refresh();
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
      toast.success("Verification updated.");
      setRejectOpen(false);
      setRejectReason("");
      refresh();
    },
  });

  async function onDelete() {
    if (!selected) return;
    const deletedId = selected.id;
    const next = nextSelectedDocumentId(documents, selectedId, deletedId);
    const result = await removeDocument({
      data: { restaurantId, guestId: guest.id, documentId: deletedId },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Document deleted.");
    setConfirmDelete(false);
    setMode("view");
    setSelectedId(next);
    refresh();
  }

  function printSelected() {
    if (!selected) {
      toast.error("Select a document to print.");
      return;
    }
    window.print();
  }

  const typeOptionsForForm = useMemo(() => {
    const current = types.find((item) => item.id === form.idTypeId);
    const options = [...creatableTypes];
    if (current && !options.some((item) => item.id === current.id)) options.unshift(current);
    return options;
  }, [creatableTypes, form.idTypeId, types]);

  const previewUrl =
    mode === "create" ? null : previewSide === "back" ? selected?.backUrl : selected?.url;
  const previewPending =
    mode === "create"
      ? previewSide === "back"
        ? form.pendingBack
        : form.pendingFront
      : null;
  const expiry = selected ? documentExpiryStatus(selected.expiryDate, today) : "none";
  const imagesAllowed = selectedType?.scanImageAllowed !== false;
  const available = documentsQuery.data?.available !== false;

  if (documentsQuery.isLoading || typesQuery.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity">
        <p className="text-sm text-muted-foreground">Loading identity documents…</p>
      </section>
    );
  }

  if (documentsQuery.isError || typesQuery.isError) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity">
        <p className="text-sm text-destructive">Could not load identity documents.</p>
      </section>
    );
  }

  if (!available) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity">
        <h3 className="font-display text-lg">Identity Documents</h3>
        <p className="mt-2 text-sm text-muted-foreground">{WAVE2_MIGRATION_UNAVAILABLE}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-identity">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">Identity Documents</h3>
            <p className="mt-1 text-sm text-muted-foreground">{IDENTITY_DOCUMENTS_COPY}</p>
          </div>
          <GuestRestrictionBadges guest={guest} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" data-testid="guest-identity-quick-actions">
          <Button type="button" size="sm" onClick={startCreate} disabled={creatableTypes.length === 0}>
            Upload New Document
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            View All Documents
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={printSelected} disabled={!selected}>
            Print Selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={!selected || mode === "create"}
          >
            Delete Document
          </Button>
        </div>
        {creatableTypes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {IDENTITY_DOCUMENTS_NO_ACTIVE_TYPES}{" "}
            <a className="underline" href={PREFERENCE_SETUP_HREF}>
              Open Property Setup
            </a>
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section ref={tableRef} className="rounded-2xl border border-border bg-card p-5">
          <h4 className="font-medium">Documents</h4>
          {documents.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="guest-identity-empty">
              {IDENTITY_DOCUMENTS_EMPTY}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Number</th>
                    <th className="pb-2 pr-3 font-medium">Country</th>
                    <th className="pb-2 pr-3 font-medium">Expiry</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const status = documentExpiryStatus(doc.expiryDate, today);
                    const active = doc.id === selectedId && mode !== "create";
                    return (
                      <tr
                        key={doc.id}
                        data-testid={`guest-identity-row-${doc.id}`}
                        className={active ? "bg-muted/60" : "hover:bg-muted/40"}
                        onClick={() => {
                          setSelectedId(doc.id);
                          setMode("view");
                          setPreviewSide("front");
                          setConfirmDelete(false);
                        }}
                      >
                        <td className="py-2 pr-3">
                          <button type="button" className="text-left font-medium">
                            {doc.typeName}
                          </button>
                          {!doc.typeActive ? (
                            <span className="ml-2 text-xs text-muted-foreground">Inactive type</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{doc.documentNumberMasked ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {doc.issuingCountry ? countryNameFromInput(doc.issuingCountry) : "—"}
                        </td>
                        <td className={`py-2 pr-3 ${expiryClass(status)}`}>
                          {doc.expiryDate ? formatStayDate(doc.expiryDate) : "—"}
                          <span className="ml-1 text-xs">({DOCUMENT_EXPIRY_STATUS_LABELS[status]})</span>
                        </td>
                        <td className="py-2 pr-3">{GUEST_DOCUMENT_STATUS_LABELS[doc.verificationStatus]}</td>
                        <td className="py-2" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="sm" variant="ghost" aria-label="Document actions">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setSelectedId(doc.id);
                                  setMode("view");
                                  setPreviewSide("front");
                                }}
                              >
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void startEdit(doc)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setSelectedId(doc.id);
                                  setMode("view");
                                  if (doc.verificationStatus === "verified") {
                                    reviewMutation.mutate({ documentId: doc.id, status: "verified" });
                                  } else {
                                    reviewMutation.mutate({ documentId: doc.id, status: "verified" });
                                  }
                                }}
                              >
                                {doc.verificationStatus === "verified" ? "Re-verify" : "Staff verify"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setSelectedId(doc.id);
                                  setMode("view");
                                  setRejectOpen(true);
                                }}
                              >
                                Reject
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setSelectedId(doc.id);
                                  setConfirmDelete(true);
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity-preview">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">Preview</h4>
              {selected ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={previewSide === "front" ? "default" : "outline"}
                    onClick={() => setPreviewSide("front")}
                  >
                    Front
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={previewSide === "back" ? "default" : "outline"}
                    onClick={() => setPreviewSide("back")}
                  >
                    Back
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="mt-3 min-h-40 rounded-xl border border-dashed border-border p-3">
              {previewPending ? (
                <p className="text-sm">{previewPending.name} (pending save)</p>
              ) : previewUrl ? (
                selected?.mimeType === "application/pdf" && previewSide === "front" ? (
                  <a className="text-sm underline" href={previewUrl} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                ) : (
                  <img src={previewUrl} alt="" className="max-h-64 w-full rounded-lg object-contain" />
                )
              ) : (
                <p className="text-sm text-muted-foreground">{IDENTITY_DOCUMENTS_NO_IMAGE}</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity-verification">
            <h4 className="font-medium">Verification Details</h4>
            {selected && mode !== "create" ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  {GUEST_DOCUMENT_STATUS_LABELS[selected.verificationStatus]}
                </p>
                <p>
                  <span className="text-muted-foreground">Staff: </span>
                  {selected.verifiedByName ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Verified: </span>
                  {selected.verifiedAt ? dateTime(selected.verifiedAt) : "—"}
                </p>
                {selected.rejectionReason ? (
                  <p>
                    <span className="text-muted-foreground">Reason: </span>
                    {selected.rejectionReason}
                  </p>
                ) : null}
                <p className={`text-xs ${expiryClass(expiry)}`}>
                  {DOCUMENT_EXPIRY_STATUS_LABELS[expiry]}
                  {selected.expiryDate ? ` · ${formatStayDate(selected.expiryDate)}` : ""}
                </p>
                <p className="pt-2 text-xs text-muted-foreground">{STAFF_VERIFY_COPY}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      reviewMutation.mutate({
                        documentId: selected.id,
                        status: "verified",
                      })
                    }
                  >
                    {selected.verificationStatus === "verified" ? "Re-verify" : "Staff verify"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Select a document to review verification.</p>
            )}
          </section>
        </div>
      </div>

      {mode !== "view" ? (
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-identity-form">
          <h4 className="font-medium">{mode === "create" ? "Add Document" : "Edit Document"}</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="identity-type">Document type</Label>
              <Select
                value={form.idTypeId}
                onValueChange={(value) => setForm((current) => ({ ...current, idTypeId: value }))}
              >
                <SelectTrigger id="identity-type" className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptionsForForm.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                      {!type.active ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="identity-number">
                Document number{selectedType?.documentNumberRequired ? " *" : ""}
              </Label>
              <Input
                id="identity-number"
                className="mt-1"
                value={form.documentNumber}
                onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="identity-country">
                Issuing country{selectedType?.issuingCountryRequired ? " *" : ""}
              </Label>
              <Select
                value={form.issuingCountry || "__none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, issuingCountry: value === "__none" ? "" : value }))
                }
              >
                <SelectTrigger id="identity-country" className="mt-1">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not set</SelectItem>
                  {ISO_COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="identity-issue">Issue date</Label>
              <Input
                id="identity-issue"
                type="date"
                className="mt-1"
                value={form.issueDate}
                onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="identity-expiry">
                Expiry date{selectedType?.expiryDateRequired ? " *" : ""}
              </Label>
              <Input
                id="identity-expiry"
                type="date"
                className="mt-1"
                value={form.expiryDate}
                onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="identity-authority">Issuing authority</Label>
              <Input
                id="identity-authority"
                className="mt-1"
                value={form.issuingAuthority}
                onChange={(event) => setForm((current) => ({ ...current, issuingAuthority: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="identity-notes">Notes</Label>
              <Textarea
                id="identity-notes"
                className="mt-1"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>

          {imagesAllowed ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Front image</Label>
                <input
                  ref={frontRef}
                  type="file"
                  className="mt-2 block text-sm"
                  accept={IDENTITY_UPLOAD_ACCEPT.join(",")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (mode === "create") {
                      setForm((current) => ({ ...current, pendingFront: file ?? null }));
                    } else {
                      void onReplaceImage("front", file);
                    }
                  }}
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => frontRef.current?.click()}>
                    {selected?.url || form.pendingFront ? "Replace front" : "Upload front"}
                  </Button>
                  {(selected?.url || form.pendingFront) && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void onClearImage("front")}>
                      Clear front
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label>Back image</Label>
                <input
                  ref={backRef}
                  type="file"
                  className="mt-2 block text-sm"
                  accept={IDENTITY_UPLOAD_ACCEPT.join(",")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (mode === "create") {
                      setForm((current) => ({ ...current, pendingBack: file ?? null }));
                    } else {
                      void onReplaceImage("back", file);
                    }
                  }}
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => backRef.current?.click()}>
                    {selected?.backUrl || form.pendingBack ? "Replace back" : "Upload back"}
                  </Button>
                  {(selected?.backUrl || form.pendingBack) && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void onClearImage("back")}>
                      Clear back
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Images are not allowed for this document type.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSave()} disabled={saving || !form.idTypeId}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("view");
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {rejectOpen && selected ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <Label htmlFor="identity-reject">Rejection reason</Label>
          <Textarea
            id="identity-reject"
            className="mt-1"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={() =>
                reviewMutation.mutate({
                  documentId: selected.id,
                  status: "rejected",
                  reason: rejectReason,
                })
              }
            >
              Reject document
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {confirmDelete && selected ? (
        <section className="rounded-2xl border border-destructive/40 bg-card p-5" data-testid="guest-identity-delete">
          <p className="text-sm">Delete {selected.typeName}? The file is removed from storage.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {selected ? (
        <>
          <article className="guest-identity-print hidden print:block" data-testid="guest-identity-print">
            <h1>
              {guest.fullName} — {selected.typeName}
            </h1>
            <dl>
              <dt>Document number</dt>
              <dd>{selected.documentNumberMasked ?? "—"}</dd>
              <dt>Issuing country</dt>
              <dd>{selected.issuingCountry ? countryNameFromInput(selected.issuingCountry) : "—"}</dd>
              <dt>Issue date</dt>
              <dd>{selected.issueDate ? formatStayDate(selected.issueDate) : "—"}</dd>
              <dt>Expiry date</dt>
              <dd>{selected.expiryDate ? formatStayDate(selected.expiryDate) : "—"}</dd>
              <dt>Status</dt>
              <dd>{GUEST_DOCUMENT_STATUS_LABELS[selected.verificationStatus]}</dd>
            </dl>
          </article>
          <style>{`
            @media print {
              @page { margin: 12mm; }
              body * { visibility: hidden; }
              .guest-identity-print, .guest-identity-print * { visibility: visible; }
              .guest-identity-print {
                display: block !important;
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `}</style>
        </>
      ) : null}
    </div>
  );
}
