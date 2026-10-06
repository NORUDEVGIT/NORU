import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
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
  listTravelAgentContacts,
  saveTravelAgentContact,
  setTravelAgentContactPrimary,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import type { CompanyContactRow } from "@/packages/pms/lib/guest-company-detail.functions";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import { cn } from "@/shared/lib/utils";

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
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
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
    queryFn: () =>
      load({
        data: {
          restaurantId,
          agencyId,
          q,
          status: status as "all" | "active" | "inactive",
          limit: 100,
          offset: 0,
        },
      }),
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
          name: form.name.trim(),
          position: form.position.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          notes: form.notes.trim() || null,
          isPrimary: form.isPrimary,
          status: form.status,
        },
      }),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
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

  const items = query.data?.items ?? [];
  const selected = items.find((c) => c.id === selectedId) ?? null;

  // Summary Metrics
  const totalContacts = items.length;
  const activeContacts = items.filter((c) => c.status === "active").length;
  const primaryContact = items.find((c) => c.isPrimary);
  const contactsWithPhone = items.filter((c) => Boolean(c.phone || c.whatsapp)).length;

  function startCreate() {
    setEditing(null);
    setForm({
      name: "",
      position: "",
      phone: "",
      email: "",
      whatsapp: "",
      notes: "",
      isPrimary: items.length === 0,
      status: "active",
    });
    setFormOpen(true);
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
    setFormOpen(true);
  }

  return (
    <div className="space-y-4" data-testid="travel-agent-contacts">
      {/* Summary Band */}
      <div className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm">
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Total Contacts</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">{totalContacts}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Active</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#2E7D32]">{activeContacts}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Primary Contact</span>
          <span className="mt-1 text-xs font-semibold text-[#8A641A] truncate">
            {primaryContact?.name ?? "None designated"}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Contact Methods</span>
          <span className="mt-1 text-xs text-[#756A5B]">
            {contactsWithPhone} phone · {items.filter((c) => Boolean(c.email)).length} email
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, role, email, phone…"
              className="h-8 pl-8 border-[#DDD4C5] text-xs bg-[#FAF8F5]"
              data-testid="travel-agent-contacts-search"
            />
          </div>

          <Select value={status} onValueChange={(val) => setStatus(val as "all" | "active" | "inactive")}>
            <SelectTrigger className="h-8 w-32 border-[#DDD4C5] text-xs bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="active" className="text-xs">Active</SelectItem>
              <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {(q || status !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setStatus("all");
              }}
              className="h-8 text-xs text-[#756A5B]"
            >
              Clear
            </Button>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          onClick={startCreate}
          className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
          data-testid="travel-agent-add-contact"
        >
          <Plus className="mr-1 size-3.5" />
          Add Contact
        </Button>
      </div>

      {/* Dense Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-contacts-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                <th className="px-3.5 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Position / Role</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">WhatsApp</th>
                <th className="px-3 py-2.5">Primary</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EAE1]">
              {query.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#756A5B]">
                    Loading contacts…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8C827A] italic">
                    {q || status !== "all"
                      ? "No contacts match these filters."
                      : "No agency contacts yet."}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => {
                      setSelectedId(row.id);
                      setDrawerOpen(true);
                    }}
                    className="cursor-pointer transition-colors hover:bg-[#FAF8F5]/80"
                    data-testid={`travel-agent-contact-row-${row.id}`}
                  >
                    <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                      <div className="flex items-center gap-2">
                        <span>{row.name}</span>
                        {row.isPrimary && (
                          <span className="rounded-full bg-[#E8F5E9] px-1.5 py-0.2 text-[9px] font-semibold text-[#2E7D32]">
                            Primary
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.position ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#251605]">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.email ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#251605]">{row.whatsapp ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {row.isPrimary ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E7D32]">
                          <Star className="size-3 fill-[#2E7D32]" />
                          Primary
                        </span>
                      ) : (
                        <span className="text-[#8C827A]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#756A5B] hover:text-[#251605]"
                            data-testid={`travel-agent-contact-actions-${row.id}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedId(row.id);
                              setDrawerOpen(true);
                            }}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startEdit(row)}>
                            <Pencil className="mr-2 size-3.5" />
                            Edit Contact
                          </DropdownMenuItem>
                          {!row.isPrimary && row.status === "active" && (
                            <DropdownMenuItem onClick={() => primaryMutation.mutate(row.id)}>
                              <Star className="mr-2 size-3.5 text-amber-600" />
                              Set as Primary
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right-Side Contact Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="border-l border-[#DDD4C5] bg-[#FCFBF9] p-5 sm:max-w-md">
          <SheetHeader className="border-b border-[#DDD4C5] pb-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                {selected?.name ?? "Contact Details"}
              </SheetTitle>
              {selected && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDrawerOpen(false);
                    startEdit(selected);
                  }}
                  className="h-7 border-[#DDD4C5] text-xs"
                >
                  <Pencil className="mr-1 size-3" />
                  Edit
                </Button>
              )}
            </div>
            {selected?.position && (
              <p className="text-xs text-[#756A5B]">{selected.position}</p>
            )}
          </SheetHeader>

          {selected && (
            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Status:</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Role:</span>
                  <span className="font-medium text-[#251605]">
                    {selected.isPrimary ? "Primary Representative" : "Representative"}
                  </span>
                </div>
                {selected.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Phone:</span>
                    <span className="font-mono text-[#251605]">{selected.phone}</span>
                  </div>
                )}
                {selected.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Email:</span>
                    <span className="text-[#251605]">{selected.email}</span>
                  </div>
                )}
                {selected.whatsapp && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">WhatsApp:</span>
                    <span className="font-mono text-[#251605]">{selected.whatsapp}</span>
                  </div>
                )}
              </div>

              {selected.notes && (
                <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                  <p className="font-semibold text-[#251605] mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-[#756A5B]">{selected.notes}</p>
                </div>
              )}

              {!selected.isPrimary && selected.status === "active" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    primaryMutation.mutate(selected.id);
                    setDrawerOpen(false);
                  }}
                  className="w-full border-[#DDD4C5] text-xs"
                >
                  <Star className="mr-1.5 size-3.5 text-amber-600" />
                  Designate as Primary Contact
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add / Edit Contact Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {editing ? "Edit Agency Contact" : "Add Agency Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Full Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Abebe Bikila"
                className="mt-1 h-8 text-xs border-[#DDD4C5]"
              />
            </div>
            <div>
              <Label className="text-xs">Position / Title</Label>
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="e.g. Contracting Manager"
                className="mt-1 h-8 text-xs border-[#DDD4C5]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Phone</Label>
                <div className="mt-1">
                  <CanonicalPhoneInput
                    value={form.phone}
                    onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                    placeholder="e.g. 911 234 567"
                    size="sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <div className="mt-1">
                  <CanonicalPhoneInput
                    value={form.whatsapp}
                    onChange={(whatsapp) => setForm((f) => ({ ...f, whatsapp }))}
                    placeholder="e.g. 911 234 567"
                    size="sm"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="contact@agency.com"
                className="mt-1 h-8 text-xs border-[#DDD4C5]"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes regarding this contact…"
                rows={3}
                className="mt-1 text-xs border-[#DDD4C5]"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.isPrimary}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v === true }))}
                />
                <span className="text-xs">Primary contact for this agency</span>
              </label>

              <Select
                value={form.status}
                onValueChange={(val) => setForm((f) => ({ ...f, status: val as "active" | "inactive" }))}
              >
                <SelectTrigger className="h-8 w-28 text-xs border-[#DDD4C5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Active</SelectItem>
                  <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
            >
              {editing ? "Save Changes" : "Create Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { GuestTravelAgentTravelers as GuestTravelAgentGuestLinks } from "./guest-travel-agent-travelers";
