import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
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
  createTravelAgentDocumentUpload,
  deleteTravelAgentDocument,
  listTravelAgentDocuments,
  reviewTravelAgentDocument,
  saveTravelAgentDocument,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { TA_DOCUMENTS_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

export function GuestTravelAgentDocuments({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentDocuments);
  const startUpload = useServerFn(createTravelAgentDocumentUpload);
  const save = useServerFn(saveTravelAgentDocument);
  const review = useServerFn(reviewTravelAgentDocument);
  const remove = useServerFn(deleteTravelAgentDocument);
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const query = useQuery({
    queryKey: ["travel-agent-documents", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
  });

  const persist = useMutation({
    mutationFn: async () => {
      if (!typeId) throw new Error("Select a document type.");
      if (!name.trim()) throw new Error("Document name is required.");
      let path: string | undefined;
      if (file) {
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
        if (!(allowed as readonly string[]).includes(file.type)) throw new Error("Upload a JPG, PNG, WebP, or PDF file.");
        const ticket = await startUpload({
          data: { restaurantId, agencyId, contentType: file.type as (typeof allowed)[number], size: file.size },
        });
        const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(ticket.path, ticket.token, file);
        if (uploaded.error) throw new Error("Document upload failed.");
        path = ticket.path;
      }
      return save({
        data: {
          restaurantId,
          agencyId,
          typeId,
          name,
          referenceNumber: reference || null,
          issueDate: issueDate || null,
          expiryDate: expiryDate || null,
          path,
        },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-documents", restaurantId, agencyId] });
      toast.success("Document saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="travel-agent-documents">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Documents</h2>
          <p className="text-sm text-muted-foreground">{TA_DOCUMENTS_COPY}</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>Add Document</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Number</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data?.items ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {row.previewUrl ? <a href={row.previewUrl} target="_blank" rel="noreferrer">{row.name}</a> : row.name}
              </TableCell>
              <TableCell>{row.typeName}</TableCell>
              <TableCell>{row.referenceNumber ?? "—"}</TableCell>
              <TableCell>{row.expiryDate ?? "—"}</TableCell>
              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              <TableCell className="space-x-2">
                {row.reviewStatus === "pending" ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => review({ data: { restaurantId, agencyId, documentId: row.id, reviewStatus: "verified" } }).then(() => query.refetch())}>
                      Verify
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => review({ data: { restaurantId, agencyId, documentId: row.id, reviewStatus: "rejected" } }).then(() => query.refetch())}>
                      Reject
                    </Button>
                  </>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => remove({ data: { restaurantId, agencyId, documentId: row.id } }).then(() => query.refetch())}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add document</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
                <SelectContent>
                  {(query.data?.types ?? []).map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>Number</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} /></div>
            <div><Label>Issue date</Label><Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></div>
            <div><Label>Expiry date</Label><Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></div>
            <div><Label>File</Label><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => persist.mutate()} disabled={persist.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
