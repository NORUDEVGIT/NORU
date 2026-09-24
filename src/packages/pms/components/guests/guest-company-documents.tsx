import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
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
  const selected = items.find((row) => row.id === selectedId) ?? items[0] ?? null;
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
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  if (query.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6">
        <p className="font-display text-lg">Documents unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{(query.error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="company-documents">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Documents</h2>
          <p className="text-sm text-muted-foreground">{COMPANY_DOCUMENTS_COPY}</p>
          {query.data?.available === false ? (
            <p className="mt-1 text-sm text-muted-foreground">Apply migration 0094 to store company files.</p>
          ) : null}
        </div>
        <Button type="button" onClick={() => setOpen(true)}>Upload document</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Total" value={String(query.data?.kpis.total ?? 0)} />
        <Kpi label="Verified" value={String(query.data?.kpis.verified ?? 0)} />
        <Kpi label="Pending" value={String(query.data?.kpis.pending ?? 0)} />
        <Kpi label="Expiring" value={String(query.data?.kpis.expiring ?? 0)} />
        <Kpi label="Expired" value={String(query.data?.kpis.expired ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No company documents uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.typeName}</TableCell>
                    <TableCell>{row.referenceNumber ?? "—"}</TableCell>
                    <TableCell>{row.expiryDate ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
        <aside className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {selected ? (
            <>
              <p className="font-display text-lg">{selected.name}</p>
              <p className="text-sm">{selected.typeName} · {selected.status}</p>
              <p className="text-sm">Issued {selected.issueDate ?? "—"} · Expires {selected.expiryDate ?? "—"}</p>
              {selected.previewUrl ? (
                selected.previewUrl.toLowerCase().includes(".pdf") ? (
                  <a href={selected.previewUrl} className="text-sm underline" target="_blank" rel="noreferrer">Open file</a>
                ) : (
                  <img src={selected.previewUrl} alt="" className="max-h-48 rounded-xl object-contain" />
                )
              ) : (
                <p className="text-sm text-muted-foreground">No file attached.</p>
              )}
              <Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Review note" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => reviewMutation.mutate("verified")}>Verify</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => reviewMutation.mutate("rejected")}>Reject</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => deleteMutation.mutate(selected.id)}>Delete</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a document to preview or review it.</p>
          )}
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload company document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Issue date</Label>
                <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
              </div>
            </div>
            <div>
              <Label>File</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={persist.isPending} onClick={() => persist.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
