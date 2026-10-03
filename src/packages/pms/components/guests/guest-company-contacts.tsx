import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, User, Users, X } from "lucide-react";
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
import { useRestaurantTime } from "@/core/state/property-format";
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
  onEditCompany?: () => void;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const total = query.data?.total ?? 0;
  const selected = items.find((c) => c.id === selectedId) ?? (items.length > 0 ? items[0] : null);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          companyId,
          contactId: editing?.id,
          name: form.name.trim(),
          position: form.position.trim() || null,
          departmentId: form.departmentId || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          status: form.status,
          isPrimary: form.isPrimary,
          notes: form.notes.trim() || null,
          roleIds: form.roleIds,
          photoStoragePath: form.photoStoragePath,
        },
      }),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      toast.success(editing ? "Contact updated." : "Contact added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const primaryMutation = useMutation({
    mutationFn: (contactId: string) => changePrimary({ data: { restaurantId, companyId, contactId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
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
          contactId: row.id,
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
          photoStoragePath: null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-contacts", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account-history", restaurantId, companyId] });
      toast.success("Status updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
      photoStoragePath: null,
    });
    setFormOpen(true);
  }

  async function uploadPhoto(file: File) {
    const started = await startPhoto({
      data: {
        restaurantId,
        companyId,
        filename: file.name,
        mimeType: file.type,
      },
    });
    const { error } = await supabase.storage
      .from("company-contacts")
      .uploadToSignedUrl(started.path, started.token, file);
    if (error) throw error;
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
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">{COMPANY_CONTACTS_TITLE}</h2>
          <p className="text-xs text-[#756A5B]">{COMPANY_CONTACTS_COPY}</p>
        </div>
        <div className="flex items-center gap-2">
          {onEditCompany && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              onClick={onEditCompany}
            >
              Edit Company
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
            onClick={openCreate}
            data-testid="add-contact-person"
          >
            <Plus className="mr-1.5 size-3.5" />
            Add Contact Person
          </Button>
        </div>
      </div>

      {/* Compact Summary Band */}
      <section
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm"
        data-testid="company-contacts-kpis"
      >
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Primary Contact
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#251605] truncate">
              {query.data?.kpis.primaryName ?? "Not assigned"}
            </span>
            {query.data?.kpis.primaryId ? (
              <button
                type="button"
                className="text-[11px] text-[#8A641A] hover:underline shrink-0 ml-1"
                onClick={() => {
                  setSelectedId(query.data!.kpis.primaryId!);
                  setDrawerOpen(true);
                }}
              >
                View
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Total Contacts
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-[#251605]">
              {query.data?.kpis.total ?? 0}
            </span>
            <span className="text-[10px] text-[#756A5B]">
              ({query.data?.kpis.active ?? 0} active)
            </span>
          </div>
        </div>

        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Departments
          </span>
          <span className="mt-1 text-xs font-semibold text-[#251605] truncate">
            {query.data?.kpis.departments ?? 0} ({query.data?.kpis.departmentNames.length ? query.data.kpis.departmentNames.join(", ") : "None"})
          </span>
        </div>

        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Contact Methods
          </span>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#251605]">
            <span className="flex items-center gap-1">
              <Phone className="size-3 text-[#8A641A]" /> {query.data?.kpis.methods.phone ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="size-3 text-[#8A641A]" /> {query.data?.kpis.methods.email ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3 text-[#8A641A]" /> {query.data?.kpis.methods.whatsapp ?? 0}
            </span>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-xs border-[#DDD4C5] bg-white min-w-48 flex-1"
          value={q}
          onChange={(event) => { setQ(event.target.value); setOffset(0); }}
          placeholder="Search contact, position, email, phone…"
        />
        <Select value={status} onValueChange={(value) => { setStatus(value as typeof status); setOffset(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={departmentId} onValueChange={(value) => { setDepartmentId(value); setOffset(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(catalogues.data?.departments ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={(value) => { setRoleId(value); setOffset(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(catalogues.data?.roles ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={primary} onValueChange={(value) => { setPrimary(value as typeof primary); setOffset(0); }}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-32">
            <SelectValue placeholder="Primary" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contacts</SelectItem>
            <SelectItem value="yes">Primary only</SelectItem>
            <SelectItem value="no">Not primary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dense Full-Width Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {query.isLoading ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">Loading contact persons…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">
            {q || status !== "all" || departmentId !== "all" || roleId !== "all" || primary !== "all"
              ? "No contact persons match these filters."
              : "No contact persons added yet."}
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="text-xs font-semibold text-[#251605]">Contact</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Position</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Department</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Phone</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Email</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Roles</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Primary</TableHead>
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
                      {row.photoUrl ? (
                        <img src={row.photoUrl} alt="" className="size-7 rounded-full object-cover ring-1 ring-[#DDD4C5]" />
                      ) : (
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#F4E9D0] text-[10px] font-bold text-[#8A641A]">
                          {row.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span>{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.position ?? "—"}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">{row.departmentName ?? "—"}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">
                    {row.phone ? <a href={`tel:${row.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline text-[#8A641A]">{row.phone}</a> : "—"}
                  </TableCell>
                  <TableCell className="py-2.5 text-[#251605]">
                    {row.email ? <a href={`mailto:${row.email}`} onClick={(e) => e.stopPropagation()} className="hover:underline text-[#8A641A]">{row.email}</a> : "—"}
                  </TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">
                    {row.roleNames.length > 0 ? (
                      <span className="truncate max-w-[140px] inline-block">{row.roleNames.join(", ")}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      name="primary-contact"
                      className="accent-[#8A641A] cursor-pointer"
                      checked={row.isPrimary}
                      onChange={() => primaryMutation.mutate(row.id)}
                      aria-label={`Set ${row.name} as primary`}
                    />
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-[#756A5B] hover:text-[#251605]" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setSelectedId(row.id); setDrawerOpen(true); }}>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEdit(row)}>
                          Edit
                        </DropdownMenuItem>
                        {!row.isPrimary ? (
                          <DropdownMenuItem onSelect={() => primaryMutation.mutate(row.id)}>
                            Set Primary
                          </DropdownMenuItem>
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

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#DDD4C5] bg-[#FAF8F5] px-4 py-2 text-xs text-[#756A5B]">
          <span>
            Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE, total)} of {total} contacts
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - COMPANY_CONTACT_DEFAULT_PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              disabled={offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE >= total}
              onClick={() => setOffset(offset + COMPANY_CONTACT_DEFAULT_PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Right-Side Contact Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="border-b border-[#DDD4C5] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {selected?.photoUrl ? (
                  <img src={selected.photoUrl} alt="" className="size-12 rounded-xl object-cover ring-2 ring-[#E5DECE]" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-xl bg-[#F4E9D0] text-lg font-bold text-[#8A641A] ring-2 ring-[#E5DECE]">
                    {selected?.name ? selected.name.slice(0, 2).toUpperCase() : <User className="size-6" />}
                  </div>
                )}
                <div>
                  <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                    {selected?.name ?? "Contact"}
                  </SheetTitle>
                  <p className="text-xs text-[#756A5B]">{selected?.position ?? "No position"}</p>
                </div>
              </div>
              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                  onClick={() => openEdit(selected)}
                >
                  <Pencil className="mr-1 size-3" /> Edit
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {selected ? (
              <>
                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Company</span>
                    <span className="font-medium text-[#251605]">{companyName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Status</span>
                    <Badge variant={selected.status === "active" ? "default" : "secondary"}>
                      {selected.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Primary</span>
                    <span className="font-medium text-[#251605]">{selected.isPrimary ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Department</span>
                    <span className="font-medium text-[#251605]">{selected.departmentName ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Roles</span>
                    <span className="font-medium text-[#251605]">{selected.roleNames.join(", ") || "—"}</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">Contact Details</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Phone</span>
                    <span className="font-medium text-[#251605]">{selected.phone || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Email</span>
                    <span className="font-medium text-[#251605]">{selected.email || "—"}</span>
                  </div>
                  {selected.whatsapp ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[#756A5B]">WhatsApp</span>
                      <span className="font-medium text-[#251605]">{selected.whatsapp}</span>
                    </div>
                  ) : null}
                </div>

                {selected.notes ? (
                  <div className="space-y-1 rounded-xl border border-[#DDD4C5] bg-white p-3">
                    <h4 className="font-display text-xs font-semibold text-[#251605]">Notes</h4>
                    <p className="whitespace-pre-wrap text-[#756A5B]">{selected.notes}</p>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <h4 className="font-display text-xs font-semibold text-[#251605]">Recent Contact Activity</h4>
                  <ul className="space-y-1.5 text-[11px]">
                    {(history.data ?? [])
                      .filter((row) => row.eventType.startsWith("contact") || row.eventType === "primary_contact_changed")
                      .slice(0, 5)
                      .map((row) => (
                        <li key={row.id} className="border-b border-[#EFE9DF]/60 pb-1 last:border-b-0">
                          <p className="font-medium text-[#251605]">
                            {row.notes ? `${contactActivityLabel(row.eventType)} · ${row.notes}` : contactActivityLabel(row.eventType)}
                          </p>
                          <span className="text-[10px] text-[#756A5B]">{dateTime(row.createdAt)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-center text-[#756A5B] italic">No contact selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add / Edit Contact Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact Person" : "Add Contact Person"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Full Name *</Label>
              <Input
                className="h-8 text-xs border-[#DDD4C5]"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Photo</Label>
              <Input
                type="file"
                className="h-8 text-xs border-[#DDD4C5]"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file).catch((error: Error) => toast.error(error.message));
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Position</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.position}
                  onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                  placeholder="e.g. Travel Manager"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select
                  value={form.departmentId || "__none"}
                  onValueChange={(val) => setForm((current) => ({ ...current, departmentId: val === "__none" ? "" : val }))}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No department</SelectItem>
                    {departmentOptions.map((dep) => (
                      <SelectItem key={dep.id} value={dep.id}>{dep.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input
                className="h-8 text-xs border-[#DDD4C5]"
                value={form.whatsapp}
                onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Roles</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {roleOptions.map((role) => (
                  <label key={role.id} className="flex items-center gap-1.5 text-xs text-[#251605] cursor-pointer">
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
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <Checkbox
                  checked={form.isPrimary}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isPrimary: Boolean(checked) }))}
                />
                <span>Set as primary contact person</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <Checkbox
                  checked={form.status === "active"}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, status: checked ? "active" : "inactive" }))
                  }
                />
                <span>Active</span>
              </label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="min-h-[60px] text-xs border-[#DDD4C5]"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
