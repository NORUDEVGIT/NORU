import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  FileCheck,
  FileText,
  Plus,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  createGroupDocumentUpload,
  listGroupDocuments,
  saveGroupDocument,
} from "@/packages/pms/lib/guest-group-detail.functions";

export function GuestGroupDocumentsView({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupDocuments);
  const startUpload = useServerFn(createGroupDocumentUpload);
  const save = useServerFn(saveGroupDocument);

  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const query = useQuery({
    queryKey: ["group-documents", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
    retry: false,
  });

  const persistMutation = useMutation({
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
            groupId,
            contentType: file.type as (typeof allowed)[number],
            size: file.size,
          },
        });
        const uploaded = await supabase.storage
          .from("property-images")
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (uploaded.error) throw new Error("Document upload failed.");
        path = ticket.path;
      }
      await save({
        data: {
          restaurantId,
          groupId,
          typeId,
          name,
          referenceNumber: reference || null,
          path,
        },
      });
    },
    onSuccess: () => {
      toast.success("Group document saved.");
      setOpen(false);
      setName("");
      setReference("");
      setFile(null);
      setTypeId("");
      void queryClient.invalidateQueries({ queryKey: ["group-documents", restaurantId, groupId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, groupId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  }

  if (query.error) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="font-display text-base font-semibold text-foreground">Documents Unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{(query.error as Error).message}</p>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  const activeTypes = (query.data?.types ?? []).filter((t) => t.active);

  return (
    <div className="space-y-6" data-testid="group-documents-view">
      {/* Header Info */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">Group Documents</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Contracts, rooming agreements, tax exemption certificates, and group authorizations.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5 bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Documents Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-xs">Document Name</TableHead>
              <TableHead className="font-semibold text-xs">Type</TableHead>
              <TableHead className="font-semibold text-xs">Reference Number</TableHead>
              <TableHead className="font-semibold text-xs">Uploaded Date</TableHead>
              <TableHead className="font-semibold text-xs text-right">File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((doc) => (
              <TableRow key={doc.id} className="hover:bg-muted/20">
                <TableCell className="font-medium text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{doc.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">
                    {doc.typeName}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {doc.referenceNumber || "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {doc.uploadedAt ? doc.uploadedAt.slice(0, 10) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {doc.previewUrl ? (
                    <a
                      href={doc.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      View File
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Metadata only</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  <p className="text-sm font-medium">No documents attached to this group.</p>
                  <p className="text-xs text-muted-foreground">
                    Upload signed contracts, banquet agreements, or tax exemption forms.
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Group Document</DialogTitle>
            <DialogDescription>
              Attach a document to this group account record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Document Name
              </label>
              <Input
                placeholder="e.g. Master Contract 2026, Tax Exemption Form…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Document Type
              </label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose document type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {activeTypes.length === 0 && (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      No document types configured.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Reference Number (Optional)
              </label>
              <Input
                placeholder="e.g. CONTRACT-9821"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                File (PDF, PNG, JPG, WebP)
              </label>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || !typeId || persistMutation.isPending}
              onClick={() => persistMutation.mutate()}
              className="bg-[#251605] text-[#F7F4EE] hover:bg-[#3D260D]"
            >
              {persistMutation.isPending ? "Uploading…" : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
