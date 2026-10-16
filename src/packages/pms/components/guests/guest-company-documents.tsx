import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCircle2, Download, ExternalLink, FileText, MoreHorizontal, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  createCompanyDocumentUpload,
  deleteCompanyDocument,
  listCompanyDocuments,
  reviewCompanyDocument,
  saveCompanyDocument,
} from "@/packages/pms/lib/guest-company-detail.functions";
import { COMPANY_DOCUMENTS_COPY } from "@/packages/pms/lib/guest-company-detail-workspace";

export function GuestCompanyDocuments({
  restaurantId,
  companyId,
}: {
  restaurantId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listCompanyDocuments);
  const startUpload = useServerFn(createCompanyDocumentUpload);
  const save = useServerFn(saveCompanyDocument);
  const review = useServerFn(reviewCompanyDocument);
  const remove = useServerFn(deleteCompanyDocument);

  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState("");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const query = useQuery({
    queryKey: ["company-documents", restaurantId, companyId],
    queryFn: () => load({ data: { restaurantId, companyId } }),
    retry: false,
  });
  const items = query.data?.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? (items.length > 0 ? items[0] : null);
  const activeTypes = (query.data?.types ?? []).filter((type) => type.active);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["company-documents", restaurantId, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
  }

  const persist = useMutation({
    mutationFn: async () => {
      if (!typeId) throw new Error("Select a document type.");
      if (!name.trim()) throw new Error("Document name is required.");
      let path: string | undefined;
      if (file) {
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
        if (!(allowed as readonly string[]).includes(file.type)) {
          throw new Error("Upload a JPG, PNG, WebP, or PDF file.");
        }
        const ticket = await startUpload({
          data: {
            restaurantId,
            companyId,
            contentType: file.type as (typeof allowed)[number],
            size: file.size,
          },
        });
        const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(ticket.path, ticket.token, file);
        if (uploaded.error) throw new Error("Document upload failed.");
        path = ticket.path;
      }
      await save({
        data: {
          restaurantId,
          companyId,
          typeId,
          name,
          referenceNumber: reference || null,
          issueDate: issueDate || null,
          expiryDate: expiryDate || null,
          path,
        },
      });
    },
    onSuccess: () => {
      toast.success("Document saved.");
      setOpen(false);
      setName("");
      setReference("");
      setFile(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewMutation = useMutation({
    mutationFn: (reviewStatus: "verified" | "rejected") =>
      review({
        data: {
          restaurantId,
          companyId,
          documentId: selected!.id,
          reviewStatus,
          reviewNote,
        },
      }),
    onSuccess: () => {
      toast.success("Document review saved.");
      setReviewNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => remove({ data: { restaurantId, companyId, documentId } }),
    onSuccess: () => {
      toast.success("Document removed.");
      setDrawerOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return <p className="p-6 text-center text-xs text-[#756A5B]">Loading company documents…</p>;
  }
  if (query.error) {
    return (
      <div className="rounded-xl border border-dashed border-[#DDD4C5] p-6 text-center">
        <p className="font-display text-base font-bold text-[#251605]">Documents unavailable</p>
        <p className="mt-1 text-xs text-[#756A5B]">{(query.error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="company-documents">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Documents</h2>
          <p className="text-xs text-[#756A5B]">{COMPANY_DOCUMENTS_COPY}</p>
          {query.data?.available === false ? (
            <p className="mt-1 text-xs text-amber-700">Apply migration 0094 to store company files.</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1.5 size-3.5" />
          Upload Document
        </Button>
      </div>

      {/* Compact Summary Band */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-5 sm:divide-y-0 sm:divide-x shadow-sm"
        data-testid="company-documents-kpis"
      >
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
            {query.data?.kpis.total ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Verified
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-emerald-700">
            {query.data?.kpis.verified ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Pending
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-amber-700">
            {query.data?.kpis.pending ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Expiring
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
            {query.data?.kpis.expiring ?? 0}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Expired
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-red-700">
            {query.data?.kpis.expired ?? 0}
          </span>
        </div>
      </div>

      {/* Dense Full-Width Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">No company documents uploaded yet.</p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="text-xs font-semibold text-[#251605]">Name</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Type</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Reference</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Issue Date</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Expiry</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-[#251605]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
              {items.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                  onClick={() => {
                    setSelectedId(row.id);
                    setDrawerOpen(true);
                  }}
                >
                  <TableCell className="py-2.5 font-medium text-[#251605]">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-[#8A641A] shrink-0" />
                      <span>{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.typeName}</TableCell>
                  <TableCell className="py-2.5 font-mono text-[#756A5B]">{row.referenceNumber ?? "—"}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.issueDate ?? "—"}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.expiryDate ?? "—"}</TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        row.status === "verified"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : row.status === "pending"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : row.status === "expired"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-[#756A5B] hover:text-[#251605]">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setSelectedId(row.id); setDrawerOpen(true); }}>
                          Review Document
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => deleteMutation.mutate(row.id)} className="text-red-700">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Right-Side Document Review Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="border-b border-[#DDD4C5] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                  {selected?.name ?? "Document Review"}
                </SheetTitle>
                <p className="text-xs text-[#756A5B]">{selected?.typeName}</p>
              </div>
              {selected && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                    selected.status === "verified"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : selected.status === "pending"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {selected.status}
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {selected ? (
              <>
                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Reference Number</span>
                    <span className="font-mono font-medium text-[#251605]">{selected.referenceNumber ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Issue Date</span>
                    <span className="text-[#251605]">{selected.issueDate ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Expiry Date</span>
                    <span className="text-[#251605]">{selected.expiryDate ?? "—"}</span>
                  </div>
                </div>

                {/* File Preview */}
                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">File Attachment</h4>
                  {selected.previewUrl ? (
                    selected.previewUrl.toLowerCase().includes(".pdf") ? (
                      <a
                        href={selected.previewUrl}
                        className="inline-flex items-center gap-1.5 text-xs text-[#8A641A] font-semibold underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-3" /> Open PDF Document
                      </a>
                    ) : (
                      <img src={selected.previewUrl} alt="" className="max-h-48 rounded-lg object-contain ring-1 ring-[#DDD4C5]" />
                    )
                  ) : (
                    <p className="text-[#756A5B] italic">No preview file attached.</p>
                  )}
                </div>

                {/* Review Note & Actions */}
                <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">Review & Governance</h4>
                  <Textarea
                    className="min-h-[60px] text-xs border-[#DDD4C5]"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Enter review note or verification details…"
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-700 text-white hover:bg-emerald-800 text-xs h-7"
                      onClick={() => reviewMutation.mutate("verified")}
                      disabled={reviewMutation.isPending}
                    >
                      <Check className="mr-1 size-3" /> Verify
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50 text-xs h-7"
                      onClick={() => reviewMutation.mutate("rejected")}
                      disabled={reviewMutation.isPending}
                    >
                      <XCircle className="mr-1 size-3" /> Reject
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-stone-500 hover:text-red-700 text-xs h-7 ml-auto"
                      onClick={() => deleteMutation.mutate(selected.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-1 size-3" /> Delete
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-[#756A5B] italic">No document selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Upload Document Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Company Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Document Type *</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Document Name *</Label>
              <Input
                className="h-8 text-xs border-[#DDD4C5]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Commercial Registry Certificate"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference Number</Label>
              <Input
                className="h-8 text-xs border-[#DDD4C5]"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. REG-2026-09"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Issue Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">File (PDF, JPG, PNG, WebP)</Label>
              <Input
                type="file"
                className="h-8 text-xs border-[#DDD4C5]"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!typeId || !name.trim() || persist.isPending}
              onClick={() => persist.mutate()}
            >
              {persist.isPending ? "Uploading…" : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
