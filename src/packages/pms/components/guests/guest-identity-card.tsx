import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Printer,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GuestRestrictionBadges } from "@/packages/pms/components/guests/guest-bits";
import {
  IDENTITY_UPLOAD_ACCEPT,
  IDENTITY_UPLOAD_MAX_BYTES,
} from "@/packages/pms/components/guests/guest-form-identity-upload";
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
import { isDocumentTypeAllowedForProfileType } from "@/packages/pms/lib/guest-field-rules";
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
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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

const MODAL_CONTROL_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#FAF8F5]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

const MODAL_TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

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
}): Promise<
  { ok: true; path: string; mimeType: string; size: number } | { ok: false; message: string }
> {
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
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
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
  const creatableTypes = types.filter((type) =>
    isDocumentTypeAllowedForProfileType(
      type,
      guest.profileType ?? (profileTypeId ? { id: profileTypeId } : null),
    ),
  );

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
    setViewDialogOpen(false);
    setMode("create");
    setConfirmDelete(false);
    setRejectOpen(false);
    setForm({
      ...emptyForm,
      idTypeId: creatableTypes[0]?.id ?? "",
    });
  }

  async function startEdit(document: GuestDocument) {
    setViewDialogOpen(false);
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
      const uploaded = await uploadDocumentFile({
        restaurantId,
        guestId: guest.id,
        file,
        startUpload,
      });
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
    if (selectedType) {
      if (
        selectedType.documentNumberActive !== false &&
        selectedType.documentNumberRequired &&
        !form.documentNumber.trim()
      ) {
        toast.error("Document number is required.");
        return;
      }
      if (
        selectedType.issuingCountryActive !== false &&
        selectedType.issuingCountryRequired &&
        !form.issuingCountry.trim()
      ) {
        toast.error("Issuing country is required.");
        return;
      }
      if (
        selectedType.issueDateActive !== false &&
        selectedType.issueDateRequired &&
        !form.issueDate.trim()
      ) {
        toast.error("Issue date is required.");
        return;
      }
      if (
        selectedType.expiryDateActive !== false &&
        selectedType.expiryDateRequired &&
        !form.expiryDate.trim()
      ) {
        toast.error("Expiry date is required.");
        return;
      }
      if (
        selectedType.issuingAuthorityActive !== false &&
        selectedType.issuingAuthorityRequired &&
        !form.issuingAuthority.trim()
      ) {
        toast.error("Issuing authority is required.");
        return;
      }
      if (selectedType.scanImageAllowed && selectedType.scanImageRequired) {
        const hasFront =
          mode === "create" ? Boolean(form.pendingFront) : Boolean(selected?.url || form.pendingFront);
        if (!hasFront) {
          toast.error("Front document scan/image is required.");
          return;
        }
      }
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
    const uploaded = await uploadDocumentFile({
      restaurantId,
      guestId: guest.id,
      file,
      startUpload,
    });
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
    setViewDialogOpen(false);
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
    mode === "create" ? (previewSide === "back" ? form.pendingBack : form.pendingFront) : null;
  const expiry = selected ? documentExpiryStatus(selected.expiryDate, today) : "none";
  const imagesAllowed = selectedType?.scanImageAllowed !== false;
  const available = documentsQuery.data?.available !== false;

  if (documentsQuery.isLoading || typesQuery.isLoading) {
    return (
      <section
        className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="guest-identity"
      >
        <p className="text-xs text-[#756A5B]">Loading identity documents…</p>
      </section>
    );
  }

  if (documentsQuery.isError || typesQuery.isError) {
    return (
      <section
        className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="guest-identity"
      >
        <p className="text-xs text-destructive">Could not load identity documents.</p>
      </section>
    );
  }

  if (!available) {
    return (
      <section
        className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="guest-identity"
      >
        <h3 className="font-display text-base font-semibold text-[#251605]">Identity Documents</h3>
        <p className="mt-2 text-xs text-[#756A5B]">{WAVE2_MIGRATION_UNAVAILABLE}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-identity">
      {/* Top Header Card */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#251605]">Identity Documents</h3>
            <p className="mt-1 text-xs text-[#756A5B]">{IDENTITY_DOCUMENTS_COPY}</p>
          </div>
          <GuestRestrictionBadges guest={guest} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" data-testid="guest-identity-quick-actions">
          <Button
            type="button"
            size="sm"
            onClick={startCreate}
            disabled={creatableTypes.length === 0}
            className="h-9 rounded-[6px] bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium text-xs px-3.5"
          >
            <Upload className="mr-1.5 size-3.5" /> Upload New Document
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-[6px] border border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium text-xs px-3.5"
            onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <FileText className="mr-1.5 size-3.5 text-[#8A641A]" /> View All Documents
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-[6px] border border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm font-medium text-xs px-3.5"
            onClick={printSelected}
            disabled={!selected}
          >
            <Printer className="mr-1.5 size-3.5 text-[#8A641A]" /> Print Selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-[6px] border border-[#DDD4C5] bg-white text-destructive hover:bg-rose-50 shadow-sm font-medium text-xs px-3.5"
            onClick={() => setConfirmDelete(true)}
            disabled={!selected || mode === "create"}
          >
            <Trash2 className="mr-1.5 size-3.5" /> Delete Document
          </Button>
        </div>
        {creatableTypes.length === 0 ? (
          <p className="mt-3 text-xs text-[#756A5B]">
            {IDENTITY_DOCUMENTS_NO_ACTIVE_TYPES}{" "}
            <a className="underline text-[#8A641A] font-medium" href={PREFERENCE_SETUP_HREF}>
              Open Property Setup
            </a>
          </p>
        ) : null}
      </section>

      {/* Main Two-Column Layout */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {/* Left: Documents Table */}
        <section ref={tableRef} className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDD4C5]/60 mb-3">
            <h4 className="font-display text-base font-semibold text-[#251605]">Documents</h4>
            <span className="text-xs text-[#756A5B] font-medium">
              {documents.length} recorded
            </span>
          </div>

          {documents.length === 0 ? (
            <p className="py-4 text-xs text-[#756A5B]" data-testid="guest-identity-empty">
              {IDENTITY_DOCUMENTS_EMPTY}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Number</th>
                    <th className="py-2.5 px-3">Country</th>
                    <th className="py-2.5 px-3">Expiry</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE9DF]/80">
                  {documents.map((doc) => {
                    const status = documentExpiryStatus(doc.expiryDate, today);
                    const active = doc.id === selectedId;
                    return (
                      <tr
                        key={doc.id}
                        data-testid={`guest-identity-row-${doc.id}`}
                        className={cn(
                          "cursor-pointer transition-colors",
                          active
                            ? "bg-[#F4E9D0]/30 font-medium border-l-2 border-l-[#8A641A]"
                            : "hover:bg-[#FAF8F5]/60",
                        )}
                        onClick={() => {
                          setSelectedId(doc.id);
                          setMode("view");
                          setPreviewSide("front");
                          setConfirmDelete(false);
                        }}
                      >
                        <td className="py-2.5 px-3 font-medium text-[#251605]">
                          <button
                            type="button"
                            className="text-left font-medium hover:underline text-[#251605]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(doc.id);
                              setMode("view");
                              setViewDialogOpen(true);
                            }}
                          >
                            {doc.typeName}
                          </button>
                          {!doc.typeActive ? (
                            <span className="ml-1.5 text-[10px] text-[#756A5B]">(Inactive)</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-[#251605]">
                          {doc.documentNumberMasked ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-[#251605]">
                          {doc.issuingCountry ? countryNameFromInput(doc.issuingCountry) : "—"}
                        </td>
                        <td className={cn("py-2.5 px-3", expiryClass(status))}>
                          {doc.expiryDate ? formatStayDate(doc.expiryDate) : "—"}
                          <span className="ml-1 text-[10px]">
                            ({DOCUMENT_EXPIRY_STATUS_LABELS[status]})
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={cn(
                              "inline-block rounded-[4px] px-2 py-0.5 text-[11px] font-semibold capitalize",
                              doc.verificationStatus === "verified" &&
                                "border border-emerald-200 bg-emerald-50 text-emerald-800",
                              doc.verificationStatus === "pending" &&
                                "border border-amber-200 bg-amber-50 text-amber-800",
                              doc.verificationStatus === "rejected" &&
                                "border border-rose-200 bg-rose-50 text-rose-800",
                            )}
                          >
                            {GUEST_DOCUMENT_STATUS_LABELS[doc.verificationStatus]}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-3 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-[#8A641A] hover:bg-[#FAF8F5] hover:text-[#725215]"
                              onClick={() => {
                                setSelectedId(doc.id);
                                setMode("view");
                                setPreviewSide("front");
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="mr-1 size-3" /> View
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-[#756A5B] hover:text-[#251605]"
                                  aria-label="Document actions"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setSelectedId(doc.id);
                                    setMode("view");
                                    setPreviewSide("front");
                                    setViewDialogOpen(true);
                                  }}
                                >
                                  <Eye className="mr-2 size-3.5 text-[#8A641A]" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void startEdit(doc)}>
                                  <Pencil className="mr-2 size-3.5 text-[#8A641A]" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setSelectedId(doc.id);
                                    setMode("view");
                                    reviewMutation.mutate({
                                      documentId: doc.id,
                                      status: "verified",
                                    });
                                  }}
                                >
                                  <ShieldCheck className="mr-2 size-3.5 text-emerald-700" />
                                  {doc.verificationStatus === "verified" ? "Re-verify" : "Staff verify"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setSelectedId(doc.id);
                                    setMode("view");
                                    setRejectOpen(true);
                                  }}
                                >
                                  <AlertTriangle className="mr-2 size-3.5 text-rose-700" /> Reject
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    setSelectedId(doc.id);
                                    setConfirmDelete(true);
                                  }}
                                >
                                  <Trash2 className="mr-2 size-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Column: Preview & Verification */}
        <div className="space-y-4">
          {/* Preview Panel */}
          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm"
            data-testid="guest-identity-preview"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#DDD4C5]/60 pb-3 mb-3">
              <h4 className="font-display text-sm font-semibold text-[#251605]">Document Preview</h4>
              {selected ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs rounded-[4px]"
                    variant={previewSide === "front" ? "default" : "outline"}
                    onClick={() => setPreviewSide("front")}
                  >
                    Front
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs rounded-[4px]"
                    variant={previewSide === "back" ? "default" : "outline"}
                    onClick={() => setPreviewSide("back")}
                  >
                    Back
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-h-40 rounded-[6px] border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-3 flex items-center justify-center">
              {previewPending ? (
                <p className="text-xs text-[#251605]">{previewPending.name} (pending save)</p>
              ) : previewUrl ? (
                selected?.mimeType === "application/pdf" && previewSide === "front" ? (
                  <a
                    className="text-xs text-[#8A641A] font-semibold underline"
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PDF in New Window
                  </a>
                ) : (
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-64 w-full rounded object-contain"
                  />
                )
              ) : (
                <p className="text-xs text-[#756A5B]">{IDENTITY_DOCUMENTS_NO_IMAGE}</p>
              )}
            </div>
          </section>

          {/* Verification Details Panel */}
          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm"
            data-testid="guest-identity-verification"
          >
            <h4 className="font-display text-sm font-semibold text-[#251605] border-b border-[#DDD4C5]/60 pb-3 mb-3">
              Verification Details
            </h4>
            {selected && mode !== "create" ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Status:</span>
                  <span
                    className={cn(
                      "rounded-[4px] px-2 py-0.5 text-[11px] font-semibold capitalize",
                      selected.verificationStatus === "verified" &&
                        "border border-emerald-200 bg-emerald-50 text-emerald-800",
                      selected.verificationStatus === "pending" &&
                        "border border-amber-200 bg-amber-50 text-amber-800",
                      selected.verificationStatus === "rejected" &&
                        "border border-rose-200 bg-rose-50 text-rose-800",
                    )}
                  >
                    {GUEST_DOCUMENT_STATUS_LABELS[selected.verificationStatus]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Verified by:</span>
                  <span className="font-medium text-[#251605]">
                    {selected.verifiedByName ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Verified at:</span>
                  <span className="text-[#251605]">
                    {selected.verifiedAt ? dateTime(selected.verifiedAt) : "—"}
                  </span>
                </div>
                {selected.rejectionReason ? (
                  <div className="rounded-[4px] bg-rose-50 border border-rose-200 p-2 text-rose-800">
                    <span className="font-semibold">Reason: </span>
                    {selected.rejectionReason}
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1 border-t border-[#DDD4C5]/60">
                  <span className="text-[#756A5B]">Expiry:</span>
                  <span className={cn("font-medium", expiryClass(expiry))}>
                    {DOCUMENT_EXPIRY_STATUS_LABELS[expiry]}
                    {selected.expiryDate ? ` · ${formatStayDate(selected.expiryDate)}` : ""}
                  </span>
                </div>
                <p className="pt-2 text-[11px] text-[#756A5B] leading-relaxed">
                  {STAFF_VERIFY_COPY}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-[6px] bg-[#8A641A] hover:bg-[#725215] text-white text-xs font-medium shadow-sm"
                    onClick={() =>
                      reviewMutation.mutate({
                        documentId: selected.id,
                        status: "verified",
                      })
                    }
                  >
                    {selected.verificationStatus === "verified" ? "Re-verify" : "Staff verify"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-[6px] border border-[#DDD4C5] bg-white text-rose-700 hover:bg-rose-50 text-xs font-medium"
                    onClick={() => setRejectOpen(true)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#756A5B]">Select a document to review verification.</p>
            )}
          </section>
        </div>
      </div>

      {/* View Document Modal */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl border-[#DDD4C5] bg-white p-6 shadow-xl rounded-xl">
          <DialogHeader className="border-b border-[#DDD4C5]/80 pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display text-lg font-bold text-[#251605]">
                {selected?.typeName ?? "Identity Document"}
              </DialogTitle>
              {selected && (
                <span
                  className={cn(
                    "rounded-[4px] px-2.5 py-0.5 text-xs font-semibold capitalize",
                    selected.verificationStatus === "verified" &&
                      "border border-emerald-200 bg-emerald-50 text-emerald-800",
                    selected.verificationStatus === "pending" &&
                      "border border-amber-200 bg-amber-50 text-amber-800",
                    selected.verificationStatus === "rejected" &&
                      "border border-rose-200 bg-rose-50 text-rose-800",
                  )}
                >
                  {GUEST_DOCUMENT_STATUS_LABELS[selected.verificationStatus]}
                </span>
              )}
            </div>
            <DialogDescription className="text-xs text-[#756A5B]">
              Verified legal document records and stored scans for {guest.fullName}.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 pt-2">
              {/* Document metadata cards */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs">
                <div>
                  <span className="text-[#756A5B] block text-[11px]">Document Number</span>
                  <span className="font-mono font-medium text-[#251605] text-sm">
                    {selected.documentNumberMasked ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[#756A5B] block text-[11px]">Issuing Country</span>
                  <span className="font-medium text-[#251605]">
                    {selected.issuingCountry ? countryNameFromInput(selected.issuingCountry) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[#756A5B] block text-[11px]">Issue Date</span>
                  <span className="font-medium text-[#251605]">
                    {selected.issueDate ? formatStayDate(selected.issueDate) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[#756A5B] block text-[11px]">Expiry Date</span>
                  <span className={cn("font-medium", expiryClass(expiry))}>
                    {selected.expiryDate ? formatStayDate(selected.expiryDate) : "—"}
                    <span className="ml-1 text-[11px]">({DOCUMENT_EXPIRY_STATUS_LABELS[expiry]})</span>
                  </span>
                </div>
                {selected.issuingAuthority && (
                  <div className="col-span-2">
                    <span className="text-[#756A5B] block text-[11px]">Issuing Authority</span>
                    <span className="font-medium text-[#251605]">{selected.issuingAuthority}</span>
                  </div>
                )}
                {selected.notes && (
                  <div className="col-span-2">
                    <span className="text-[#756A5B] block text-[11px]">Notes</span>
                    <span className="text-[#251605]">{selected.notes}</span>
                  </div>
                )}
              </div>

              {/* Scans preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#251605]">Document Images</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs rounded-[4px]"
                      variant={previewSide === "front" ? "default" : "outline"}
                      onClick={() => setPreviewSide("front")}
                    >
                      Front Image
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs rounded-[4px]"
                      variant={previewSide === "back" ? "default" : "outline"}
                      onClick={() => setPreviewSide("back")}
                    >
                      Back Image
                    </Button>
                  </div>
                </div>
                <div className="min-h-48 rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 flex items-center justify-center">
                  {previewUrl ? (
                    selected.mimeType === "application/pdf" && previewSide === "front" ? (
                      <a
                        className="text-xs text-[#8A641A] font-semibold underline"
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open PDF Document
                      </a>
                    ) : (
                      <img
                        src={previewUrl}
                        alt={selected.typeName}
                        className="max-h-64 w-full rounded object-contain"
                      />
                    )
                  ) : (
                    <p className="text-xs text-[#756A5B]">{IDENTITY_DOCUMENTS_NO_IMAGE}</p>
                  )}
                </div>
              </div>

              {/* Verification Info */}
              <div className="rounded-lg border border-[#DDD4C5]/70 bg-white p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#251605]">Staff Verification</span>
                  <span className="text-[11px] text-[#756A5B]">
                    {selected.verifiedAt ? `Verified: ${dateTime(selected.verifiedAt)}` : "Pending verification"}
                  </span>
                </div>
                {selected.verifiedByName && (
                  <p className="text-[11px] text-[#756A5B]">
                    Staff member: <span className="font-medium text-[#251605]">{selected.verifiedByName}</span>
                  </p>
                )}
                {selected.rejectionReason && (
                  <p className="text-[11px] text-rose-700 font-medium">
                    Rejection reason: {selected.rejectionReason}
                  </p>
                )}
                <p className="text-[10px] text-[#756A5B] pt-1">{STAFF_VERIFY_COPY}</p>
              </div>

              {/* Footer Actions */}
              <DialogFooter className="flex items-center justify-between border-t border-[#DDD4C5]/80 pt-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] rounded-[6px] text-xs shadow-sm font-medium"
                    onClick={() => {
                      setViewDialogOpen(false);
                      void startEdit(selected);
                    }}
                  >
                    <Pencil className="mr-1.5 size-3.5 text-[#8A641A]" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] rounded-[6px] text-xs shadow-sm font-medium"
                    onClick={printSelected}
                  >
                    <Printer className="mr-1.5 size-3.5 text-[#8A641A]" /> Print
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-[6px] bg-[#8A641A] hover:bg-[#725215] text-white text-xs shadow-sm font-medium"
                    onClick={() => {
                      reviewMutation.mutate({
                        documentId: selected.id,
                        status: "verified",
                      });
                    }}
                  >
                    {selected.verificationStatus === "verified" ? "Re-verify" : "Staff verify"}
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[#DDD4C5] text-[#251605] rounded-[6px] text-xs font-medium"
                  onClick={() => setViewDialogOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit / Add Document Modal */}
      <Dialog
        open={mode !== "view"}
        onOpenChange={(openState) => {
          if (!openState) {
            setMode("view");
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent
          className="max-w-2xl border-[#DDD4C5] bg-white p-6 shadow-xl rounded-xl max-h-[90vh] overflow-y-auto"
          data-testid="guest-identity-form"
        >
          <DialogHeader className="border-b border-[#DDD4C5]/80 pb-3">
            <DialogTitle className="font-display text-lg font-bold text-[#251605]">
              {mode === "create" ? "Add Document" : "Edit Document"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              {mode === "create"
                ? "Register a new identity document for this guest."
                : `Update identity record details for ${selected?.typeName ?? "document"}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="identity-type" className="text-xs font-medium text-[#251605]">
                  Document type
                </Label>
                <Select
                  value={form.idTypeId}
                  onValueChange={(value) => setForm((current) => ({ ...current, idTypeId: value }))}
                >
                  <SelectTrigger id="identity-type" className={cn(MODAL_SELECT_TRIGGER_CLASS, "mt-1")}>
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

              {selectedType?.documentNumberActive !== false ? (
                <div>
                  <Label htmlFor="identity-number" className="text-xs font-medium text-[#251605]">
                    Document number{selectedType?.documentNumberRequired ? " *" : ""}
                  </Label>
                  <Input
                    id="identity-number"
                    className={cn(MODAL_CONTROL_CLASS, "mt-1")}
                    value={form.documentNumber}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, documentNumber: event.target.value }))
                    }
                  />
                </div>
              ) : null}

              {selectedType?.issuingCountryActive !== false ? (
                <div>
                  <Label htmlFor="identity-country" className="text-xs font-medium text-[#251605]">
                    Issuing country{selectedType?.issuingCountryRequired ? " *" : ""}
                  </Label>
                  <Select
                    value={form.issuingCountry || "__none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        issuingCountry: value === "__none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="identity-country" className={cn(MODAL_SELECT_TRIGGER_CLASS, "mt-1")}>
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
              ) : null}

              {selectedType?.issueDateActive !== false ? (
                <div>
                  <Label htmlFor="identity-issue" className="text-xs font-medium text-[#251605]">
                    Issue date{selectedType?.issueDateRequired ? " *" : ""}
                  </Label>
                  <Input
                    id="identity-issue"
                    type="date"
                    className={cn(MODAL_CONTROL_CLASS, "mt-1")}
                    value={form.issueDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, issueDate: event.target.value }))
                    }
                  />
                </div>
              ) : null}

              {selectedType?.expiryDateActive !== false ? (
                <div>
                  <Label htmlFor="identity-expiry" className="text-xs font-medium text-[#251605]">
                    Expiry date{selectedType?.expiryDateRequired ? " *" : ""}
                  </Label>
                  <Input
                    id="identity-expiry"
                    type="date"
                    className={cn(MODAL_CONTROL_CLASS, "mt-1")}
                    value={form.expiryDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, expiryDate: event.target.value }))
                    }
                  />
                </div>
              ) : null}

              {selectedType?.issuingAuthorityActive !== false ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="identity-authority" className="text-xs font-medium text-[#251605]">
                    Issuing authority{selectedType?.issuingAuthorityRequired ? " *" : ""}
                  </Label>
                  <Input
                    id="identity-authority"
                    className={cn(MODAL_CONTROL_CLASS, "mt-1")}
                    value={form.issuingAuthority}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, issuingAuthority: event.target.value }))
                    }
                  />
                </div>
              ) : null}

              <div className="sm:col-span-2">
                <Label htmlFor="identity-notes" className="text-xs font-medium text-[#251605]">
                  Notes
                </Label>
                <Textarea
                  id="identity-notes"
                  className={cn(MODAL_TEXTAREA_CLASS, "mt-1")}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </div>
            </div>

            {imagesAllowed ? (
              <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[#DDD4C5]/80">
                <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-3 space-y-2">
                  <Label className="text-xs font-semibold text-[#251605]">
                    Front image{selectedType?.scanImageRequired ? " *" : ""}
                  </Label>
                  <input
                    ref={frontRef}
                    type="file"
                    className="hidden"
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
                  <div className="flex items-center justify-between text-xs text-[#756A5B]">
                    <span>
                      {form.pendingFront
                        ? form.pendingFront.name
                        : selected?.url
                          ? "Image uploaded"
                          : "No image"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-[6px] border-[#DDD4C5] bg-white text-xs font-medium text-[#251605]"
                        onClick={() => frontRef.current?.click()}
                      >
                        {selected?.url || form.pendingFront ? "Replace front" : "Upload front"}
                      </Button>
                      {(selected?.url || form.pendingFront) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-rose-700 hover:text-rose-800"
                          onClick={() => void onClearImage("front")}
                        >
                          Clear front
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-3 space-y-2">
                  <Label className="text-xs font-semibold text-[#251605]">Back image</Label>
                  <input
                    ref={backRef}
                    type="file"
                    className="hidden"
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
                  <div className="flex items-center justify-between text-xs text-[#756A5B]">
                    <span>
                      {form.pendingBack
                        ? form.pendingBack.name
                        : selected?.backUrl
                          ? "Image uploaded"
                          : "No image"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-[6px] border-[#DDD4C5] bg-white text-xs font-medium text-[#251605]"
                        onClick={() => backRef.current?.click()}
                      >
                        {selected?.backUrl || form.pendingBack ? "Replace back" : "Upload back"}
                      </Button>
                      {(selected?.backUrl || form.pendingBack) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-rose-700 hover:text-rose-800"
                          onClick={() => void onClearImage("back")}
                        >
                          Clear back
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#756A5B]">
                Images are not allowed for this document type.
              </p>
            )}

            <DialogFooter className="flex items-center justify-end gap-2 border-t border-[#DDD4C5]/80 pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-[6px] border border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] font-medium text-xs px-4 shadow-sm"
                onClick={() => {
                  setMode("view");
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-[6px] bg-[#8A641A] hover:bg-[#725215] text-white font-medium text-xs px-5 shadow-sm"
                onClick={() => void onSave()}
                disabled={saving || !form.idTypeId}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Verification Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md border-[#DDD4C5] bg-white p-6 shadow-xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-[#251605]">
              Reject Document Verification
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              State the reason this identity document could not be verified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <Label htmlFor="identity-reject" className="text-xs font-medium text-[#251605]">
              Rejection reason
            </Label>
            <Textarea
              id="identity-reject"
              className={cn(MODAL_TEXTAREA_CLASS, "mt-1")}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="e.g. Expired document, illegible photo, mismatching name"
            />
            <DialogFooter className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-[6px] border-[#DDD4C5] text-xs font-medium"
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 rounded-[6px] bg-destructive hover:bg-destructive/90 text-white text-xs font-medium"
                onClick={() =>
                  reviewMutation.mutate({
                    documentId: selected?.id ?? "",
                    status: "rejected",
                    reason: rejectReason,
                  })
                }
              >
                Reject document
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          className="max-w-md border-rose-200 bg-white p-6 shadow-xl rounded-xl"
          data-testid="guest-identity-delete"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-rose-800">
              Delete Document
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Delete {selected?.typeName ?? "this document"}? The file is removed from storage.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-[6px] border-[#DDD4C5] text-xs font-medium"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-[6px] bg-destructive hover:bg-destructive/90 text-white text-xs font-medium"
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print View Container */}
      {selected ? (
        <>
          <article
            className="guest-identity-print hidden print:block"
            data-testid="guest-identity-print"
          >
            <h1>
              {guest.fullName} — {selected.typeName}
            </h1>
            <dl>
              <dt>Document number</dt>
              <dd>{selected.documentNumberMasked ?? "—"}</dd>
              <dt>Issuing country</dt>
              <dd>
                {selected.issuingCountry ? countryNameFromInput(selected.issuingCountry) : "—"}
              </dd>
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
