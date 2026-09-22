import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  expireTravelAgentAgreement,
  listTravelAgentAgreements,
  saveTravelAgentAgreement,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";

export function GuestTravelAgentAgreements({
  restaurantId,
  agencyId,
  canWrite,
}: {
  restaurantId: string;
  agencyId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentAgreements);
  const save = useServerFn(saveTravelAgentAgreement);
  const expire = useServerFn(expireTravelAgentAgreement);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState({
    name: "",
    contractNumber: "",
    validFrom: "",
    validTo: "",
    currencyCode: "ETB",
    description: "",
    signedBy: "",
  });
  const query = useQuery({
    queryKey: ["travel-agent-agreements", restaurantId, agencyId],
    queryFn: () => load({ data: { restaurantId, agencyId } }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          id: editingId,
          name: form.name,
          contractNumber: form.contractNumber,
          validFrom: form.validFrom,
          validTo: form.validTo,
          currencyCode: form.currencyCode,
          description: form.description || null,
          signedBy: form.signedBy || null,
        },
      }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-agreements", restaurantId, agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
      toast.success(editingId ? "Agreement updated." : "Agreement created.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const expireMutation = useMutation({
    mutationFn: (agreementId: string) => expire({ data: { restaurantId, agencyId, agreementId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-agreements", restaurantId, agencyId] });
      toast.success("Agreement expired.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="travel-agent-agreements">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Agreements</h2>
          <p className="text-sm text-muted-foreground">Reuses the existing corporate agreement store for this travel agency.</p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            onClick={() => {
              setEditingId(undefined);
              setForm({
                name: "",
                contractNumber: "",
                validFrom: "",
                validTo: "",
                currencyCode: "ETB",
                description: "",
                signedBy: "",
              });
              setOpen(true);
            }}
          >
            Add Agreement
          </Button>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Valid From</TableHead>
            <TableHead>Valid To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data?.items ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.contractNumber}</TableCell>
              <TableCell>{row.validFrom || "—"}</TableCell>
              <TableCell>{row.validTo || "—"}</TableCell>
              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              <TableCell className="space-x-2">
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(row.id);
                      setForm({
                        name: row.name,
                        contractNumber: row.contractNumber,
                        validFrom: row.validFrom,
                        validTo: row.validTo,
                        currencyCode: row.currencyCode || "ETB",
                        description: row.description,
                        signedBy: row.signedBy ?? "",
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
                {canWrite && row.active ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => expireMutation.mutate(row.id)}>
                    Expire
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit agreement" : "Add agreement"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div><Label>Reference</Label><Input value={form.contractNumber} onChange={(event) => setForm((current) => ({ ...current, contractNumber: event.target.value }))} /></div>
            <div><Label>Valid from</Label><Input type="date" value={form.validFrom} onChange={(event) => setForm((current) => ({ ...current, validFrom: event.target.value }))} /></div>
            <div><Label>Valid to</Label><Input type="date" value={form.validTo} onChange={(event) => setForm((current) => ({ ...current, validTo: event.target.value }))} /></div>
            <div><Label>Currency</Label><Input value={form.currencyCode} onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))} /></div>
            <div><Label>Signed with</Label><Input value={form.signedBy} onChange={(event) => setForm((current) => ({ ...current, signedBy: event.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
