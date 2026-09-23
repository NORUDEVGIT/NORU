import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  createGroupDocumentUpload,
  listGroupDocuments,
  saveGroupDocument,
} from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_DOCUMENTS_COPY } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupDocuments({
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
            groupId,
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
          groupId,
          typeId,
          name,
          referenceNumber: reference || null,
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
      void queryClient.invalidateQueries({ queryKey: ["group-documents", restaurantId, groupId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, groupId] });
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

  const items = query.data?.items ?? [];
  const activeTypes = (query.data?.types ?? []).filter((type) => type.active);

  return (
    <div className="space-y-4" data-testid="group-documents">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Documents</h2>
          <p className="text-sm text-muted-foreground">{GROUP_DOCUMENTS_COPY}</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          Upload document
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No group documents uploaded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.typeName}</TableCell>
                  <TableCell>{row.referenceNumber ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.previewUrl ? (
                      <a href={row.previewUrl} className="text-sm underline" target="_blank" rel="noreferrer">
                        Download
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload group document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
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
            <div>
              <Label>File</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
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
