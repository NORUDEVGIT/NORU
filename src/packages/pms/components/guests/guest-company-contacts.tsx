import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, MoreHorizontal, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import { supabase } from "@/integrations/supabase/client";
import {
  COMPANY_CONTACT_DEFAULT_PAGE_SIZE,
  COMPANY_CONTACTS_COPY,
  COMPANY_CONTACTS_TITLE,
  contactActivityLabel,
  departmentAssignableForNew,
  roleAssignableForNew,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import {
  createCompanyContactPhotoUpload,
  getCompanyContactCatalogues,
  listCompanyContacts,
  saveCompanyContact,
  setCompanyContactPrimary,
  type CompanyContactRow,
} from "@/packages/pms/lib/guest-company-detail.functions";
import { listGuestAccountHistory } from "@/packages/pms/lib/guest-accounts.functions";

export function GuestCompanyContacts({
  restaurantId,
  companyId,
  companyName,
  contactRequired,
  onEditCompany,
}: {
  restaurantId: string;
  companyId: string;
  companyName: string;
  contactRequired: boolean;
  onEditCompany: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listCompanyContacts);
  const loadCatalogues = useServerFn(getCompanyContactCatalogues);
  const save = useServerFn(saveCompanyContact);
  const changePrimary = useServerFn(setCompanyContactPrimary);
  const startPhoto = useServerFn(createCompanyContactPhotoUpload);
  const loadHistory = useServerFn(listGuestAccountHistory);
  const { dateTime } = useRestaurantTime();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [primary, setPrimary] = useState<"all" | "yes" | "no">("all");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyContactRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    position: "",
    departmentId: "",
    phone: "",
    email: "",
    whatsapp: "",
    status: "active" as "active" | "inactive",
    isPrimary: false,
    notes: "",
    roleIds: [] as string[],
    photoStoragePath: "" as string | null,
  });

  const query = useQuery({
    queryKey: ["company-contacts", restaurantId, companyId, q, status, departmentId, roleId, primary, offset],
    queryFn: () =>
      load({
        data: {
          restaurantId,
          companyId,
          q,
          status,
          departmentId,
          roleId,
          primary,
          offset,
          limit: COMPANY_CONTACT_DEFAULT_PAGE_SIZE,
        },
      }),
  });
  const catalogues = useQuery({
    queryKey: ["company-contact-catalogues", restaurantId],
    queryFn: () => loadCatalogues({ data: { restaurantId } }),
  });
  const history = useQuery({
    queryKey: ["guest-account-history", restaurantId, companyId],
    queryFn: () => loadHistory({ data: { restaurantId, accountId: companyId } }),
  });

  const items = query.data?.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? items[0] ?? null;
  const total = query.data?.total ?? 0;

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      position: "",
      departmentId: "",
      phone: "",
      email: "",
      whatsapp: "",
      status: "active",
      isPrimary: items.length === 0,
      notes: "",
      roleIds: [],
      photoStoragePath: null,
    });
    setFormOpen(true);
  }

  function openEdit(row: CompanyContactRow) {
    setEditing(row);
    setForm({
      name: row.name,
      position: row.position ?? "",
      departmentId: row.departmentId ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      whatsapp: row.whatsapp ?? "",
      status: row.status,
      isPrimary: row.isPrimary,
      notes: row.notes ?? "",
      roleIds: row.roleIds,
      photoStoragePath: row.photoStoragePath,
    });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          companyId,
          ...(editing ? { id: editing.id } : {}),
          name: form.name,
          position: form.position,
          departmentId: form.departmentId || null,
          phone: form.phone,
          email: form.email,
          whatsapp: form.whatsapp,
          status: form.status,
          isPrimary: form.isPrimary,
          notes: form.notes,
          roleIds: form.roleIds,
          photoStoragePath: form.photoStoragePath,
        },
      }),
    onSuccess: async () => {
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      toast.success(editing ? "Contact updated." : "Contact person added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const primaryMutation = useMutation({
    mutationFn: (contactId: string) => changePrimary({ data: { restaurantId, companyId, contactId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      toast.success("Primary contact updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (row: CompanyContactRow) =>
      save({
        data: {
          restaurantId,
          companyId,
          id: row.id,
          name: row.name,
          position: row.position,
          departmentId: row.departmentId,
          phone: row.phone,
          email: row.email,
          whatsapp: row.whatsapp,
          status: row.status === "active" ? "inactive" : "active",
          isPrimary: row.isPrimary,
          notes: row.notes,
          roleIds: row.roleIds,
          photoStoragePath: row.photoStoragePath,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      toast.success("Contact status updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function uploadPhoto(file: File) {
    const started = await startPhoto({
      data: {
        restaurantId,
        companyId,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        size: file.size,
      },
    });
    const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(started.path, started.token, file);
    if (uploaded.error) throw uploaded.error;
    setForm((current) => ({ ...current, photoStoragePath: started.path }));
  }

  const roleOptions = useMemo(
    () =>
      (catalogues.data?.roles ?? []).filter((role) =>
        roleAssignableForNew(role, form.roleIds.includes(role.id)),
      ),
    [catalogues.data?.roles, form.roleIds],
  );
  const departmentOptions = useMemo(
    () =>
      (catalogues.data?.departments ?? []).filter((department) =>
        departmentAssignableForNew(department, form.departmentId || null),
      ),
    [catalogues.data?.departments, form.departmentId],
  );

  return (
    <div className="space-y-4" data-testid="company-contacts">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{COMPANY_CONTACTS_TITLE}</h2>
          <p className="text-sm text-muted-foreground">{COMPANY_CONTACTS_COPY}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onEditCompany}>Edit Company</Button>
          <Button type="button" onClick={openCreate} data-testid="add-contact-person">Add Contact Person</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Input value={q} onChange={(event) => { setQ(event.target.value); setOffset(0); }} placeholder="Search name, email, phone, position" />
        <Select value={status} onValueChange={(value) => { setStatus(value as typeof status); setOffset(0); }}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={departmentId} onValueChange={(value) => { setDepartmentId(value); setOffset(0); }}>
          <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(catalogues.data?.departments ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={(value) => { setRoleId(value); setOffset(0); }}>
          <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(catalogues.data?.roles ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={primary} onValueChange={(value) => { setPrimary(value as typeof primary); setOffset(0); }}>
          <SelectTrigger><SelectValue placeholder="Primary contact" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contacts</SelectItem>
            <SelectItem value="yes">Primary only</SelectItem>
            <SelectItem value="no">Not primary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading contacts…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {q || status !== "all" || departmentId !== "all" || roleId !== "all" || primary !== "all"
                  ? "No contact persons match these filters."
                  : "No contact persons yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id} data-selected={selected?.id === row.id} className="cursor-pointer">
                      <TableCell onClick={() => setSelectedId(row.id)}>
                        <Checkbox checked={selected?.id === row.id} onCheckedChange={() => setSelectedId(row.id)} aria-label={`Select ${row.name}`} />
                      </TableCell>
                      <TableCell onClick={() => setSelectedId(row.id)}>
                        <div className="flex items-center gap-2">
                          {row.photoUrl ? <img src={row.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                          {row.name}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => setSelectedId(row.id)}>{row.code ?? "—"}</TableCell>
                      <TableCell onClick={() => setSelectedId(row.id)}>{row.position ?? "—"}</TableCell>
                      <TableCell onClick={() => setSelectedId(row.id)}>{row.departmentName ?? "—"}</TableCell>
                      <TableCell>{row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : "—"}</TableCell>
                      <TableCell>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "—"}</TableCell>
                      <TableCell>
                        <input
                          type="radio"
                          name="primary-contact"
                          checked={row.isPrimary}
                          onChange={() => primaryMutation.mutate(row.id)}
                          aria-label={`Set ${row.name} as primary`}
                        />
                      </TableCell>
                      <TableCell><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setSelectedId(row.id)}>View</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEdit(row)}>Edit</DropdownMenuItem>
                            {!row.isPrimary ? (
                              <DropdownMenuItem onSelect={() => primaryMutation.mutate(row.id)}>Set Primary</DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onSelect={() => statusMutation.mutate(row)}>
                              {row.status === "active" ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE, total)} of {total} contact persons
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - COMPANY_CONTACT_DEFAULT_PAGE_SIZE))}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE >= total} onClick={() => setOffset(offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE)}>Next</Button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="company-contacts-kpis">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Primary Contact</p>
              {query.data?.kpis.primaryName ? (
                <>
                  <p className="mt-1 font-semibold">{query.data.kpis.primaryName}</p>
                  <p className="text-sm text-muted-foreground">{query.data.kpis.primaryPosition || "No position"}</p>
                  {query.data.kpis.primaryId ? (
                    <Button type="button" variant="link" className="h-auto px-0" onClick={() => setSelectedId(query.data.kpis.primaryId)}>
                      View Details
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 font-semibold">Not assigned</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Contact Persons</p>
              <p className="mt-1 text-2xl font-semibold">{query.data?.kpis.total ?? 0}</p>
              <p className="text-sm text-muted-foreground">
                Active {query.data?.kpis.active ?? 0} · Inactive {query.data?.kpis.inactive ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Contact Methods</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Phone</span>
                  <span className="font-semibold">{query.data?.kpis.methods.phone ?? 0}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                  <span className="font-semibold">{query.data?.kpis.methods.email ?? 0}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</span>
                  <span className="font-semibold">{query.data?.kpis.methods.whatsapp ?? 0}</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Departments</p>
              <p className="mt-1 text-2xl font-semibold">{query.data?.kpis.departments ?? 0}</p>
              <p className="text-sm text-muted-foreground">
                {query.data?.kpis.departmentNames.length
                  ? query.data.kpis.departmentNames.join(", ")
                  : "No departments assigned"}
              </p>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Contact Person Details</h3>
            {selected ? (
              <div className="mt-3 space-y-3 text-sm">
                {selected.photoUrl ? <img src={selected.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-muted" />}
                <div>
                  <p className="font-display text-lg">{selected.name}</p>
                  <Badge variant={selected.status === "active" ? "default" : "secondary"}>{selected.status}</Badge>
                </div>
                <p>{selected.position ?? "No position"}</p>
                <p>{companyName}</p>
                <p>{selected.code ?? "No code"}</p>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p>{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p>{selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : "—"}</p>
                </div>
                {selected.whatsapp ? (
                  <div>
                    <p className="text-xs text-muted-foreground">WhatsApp</p>
                    <p>{selected.whatsapp}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p>{selected.departmentName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contact Roles</p>
                  <p>{selected.roleNames.join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{selected.notes || "No notes."}</p>
                </div>
                <Button type="button" size="sm" onClick={() => openEdit(selected)}>Edit</Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Select a contact person to see details.</p>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Recent Activity</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(history.data ?? [])
                .filter((row) => row.eventType.startsWith("contact") || row.eventType === "primary_contact_changed")
                .slice(0, 6)
                .map((row) => (
                  <li key={row.id}>
                    {row.notes ? `${contactActivityLabel(row.eventType)} · ${row.notes}` : contactActivityLabel(row.eventType)}
                    <div className="text-xs text-muted-foreground">{dateTime(row.createdAt)}</div>
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact person" : "Add contact person"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Photo</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPhoto(file).catch((error: Error) => toast.error(error.message));
              }} />
            </div>
            <div className="space-y-1">
              <Label>Position</Label>
              <Input value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={form.departmentId || "__none"} onValueChange={(value) => setForm((current) => ({ ...current, departmentId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {departmentOptions.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}{row.active ? "" : " (inactive)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} placeholder="+251…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isPrimary} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPrimary: Boolean(checked) }))} />
              Primary contact {contactRequired ? "(required for this business type)" : ""}
            </label>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contact roles</Label>
              <div className="space-y-1">
                {roleOptions.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.roleIds.includes(role.id)}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          roleIds: checked
                            ? [...current.roleIds, role.id]
                            : current.roleIds.filter((id) => id !== role.id),
                        }))
                      }
                    />
                    {role.name}{role.active ? "" : " (inactive)"}
                  </label>
                ))}
                {roleOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Configure contact roles in Company & Business Settings.</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
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

