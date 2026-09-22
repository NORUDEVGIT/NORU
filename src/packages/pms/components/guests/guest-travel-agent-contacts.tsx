import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
import { GuestTravelAgentGuestLinks } from "@/packages/pms/components/guests/guest-travel-agent-guest-links";
import {
  listTravelAgentContacts,
  saveTravelAgentContact,
  setTravelAgentContactPrimary,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { TA_CONTACTS_COPY, TA_TRAVELERS_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import type { CompanyContactRow } from "@/packages/pms/lib/guest-company-detail.functions";

export function GuestTravelAgentContacts({
  restaurantId,
  agencyId,
}: {
  restaurantId: string;
  agencyId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentContacts);
  const save = useServerFn(saveTravelAgentContact);
  const changePrimary = useServerFn(setTravelAgentContactPrimary);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyContactRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    position: "",
    phone: "",
    email: "",
    whatsapp: "",
    notes: "",
    isPrimary: false,
    status: "active" as "active" | "inactive",
  });

  const query = useQuery({
    queryKey: ["travel-agent-contacts", restaurantId, agencyId, q, status],
    queryFn: () => load({ data: { restaurantId, agencyId, q, status: status as "all" | "active" | "inactive" } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-contacts", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          id: editing?.id,
          name: form.name,
          position: form.position || null,
          phone: form.phone || null,
          email: form.email || null,
          whatsapp: form.whatsapp || null,
          notes: form.notes || null,
          isPrimary: form.isPrimary,
          status: form.status,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      toast.success(editing ? "Contact updated." : "Contact added.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const primaryMutation = useMutation({
    mutationFn: (contactId: string) => changePrimary({ data: { restaurantId, agencyId, contactId } }),
    onSuccess: () => {
      toast.success("Primary contact updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startCreate() {
    setEditing(null);
    setForm({
      name: "",
      position: "",
      phone: "",
      email: "",
      whatsapp: "",
      notes: "",
      isPrimary: false,
      status: "active",
    });
    setOpen(true);
  }

  function startEdit(row: CompanyContactRow) {
    setEditing(row);
    setForm({
      name: row.name,
      position: row.position ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      whatsapp: row.whatsapp ?? "",
      notes: row.notes ?? "",
      isPrimary: row.isPrimary,
      status: row.status,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6" data-testid="travel-agent-contacts">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Contacts</h2>
          <p className="text-sm text-muted-foreground">{TA_CONTACTS_COPY}</p>
        </div>
        <Button type="button" onClick={startCreate}>Add Contact</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search contacts" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Primary</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data?.items ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.position ?? "—"}</TableCell>
              <TableCell>{row.phone ?? "—"}</TableCell>
              <TableCell>{row.email ?? "—"}</TableCell>
              <TableCell>{row.isPrimary ? <Badge>Primary</Badge> : "—"}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell className="space-x-2">
                <Button type="button" size="sm" variant="outline" onClick={() => startEdit(row)}>Edit</Button>
                {!row.isPrimary && row.status === "active" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => primaryMutation.mutate(row.id)}>
                    Set primary
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!query.data?.items.length ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-lg">Linked Guests</h3>
        <p className="mb-3 text-sm text-muted-foreground">{TA_TRAVELERS_COPY}</p>
        <GuestTravelAgentGuestLinks restaurantId={restaurantId} accountId={agencyId} />
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isPrimary}
                onCheckedChange={(value) => setForm((current) => ({ ...current, isPrimary: value === true }))}
              />
              Primary contact
            </label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "inactive" }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
