import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
  expireTravelAgentAgreement,
  listTravelAgentAgreements,
  saveTravelAgentAgreement,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { cn } from "@/shared/lib/utils";

export function GuestTravelAgentAgreements({
  restaurantId,
  agencyId,
  canWrite = true,
}: {
  restaurantId: string;
  agencyId: string;
  canWrite?: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listTravelAgentAgreements);
  const save = useServerFn(saveTravelAgentAgreement);
  const expire = useServerFn(expireTravelAgentAgreement);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [drawerAgreement, setDrawerAgreement] = useState<any | null>(null);

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
    queryKey: ["travel-agent-agreements", restaurantId, agencyId, q, status],
    queryFn: () => load({ data: { restaurantId, agencyId, q, status } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-agreements", restaurantId, agencyId] });
    void queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agencyId] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          agencyId,
          id: editingId,
          name: form.name.trim(),
          contractNumber: form.contractNumber.trim(),
          validFrom: form.validFrom,
          validTo: form.validTo,
          currencyCode: form.currencyCode,
          description: form.description.trim() || null,
          signedBy: form.signedBy.trim() || null,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      toast.success(editingId ? "Agreement updated." : "Agreement created.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const expireMutation = useMutation({
    mutationFn: (agreementId: string) => expire({ data: { restaurantId, agencyId, agreementId } }),
    onSuccess: () => {
      toast.success("Agreement expired.");
      if (drawerAgreement) setDrawerAgreement(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = query.data?.items ?? [];
  const kpis = query.data?.kpis ?? { total: 0, active: 0, expiring: 0, expired: 0 };

  function startCreate() {
    setEditingId(undefined);
    setForm({
      name: "",
      contractNumber: `AGMT-${Date.now().toString().slice(-4)}`,
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      currencyCode: "ETB",
      description: "",
      signedBy: "",
    });
    setOpen(true);
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      contractNumber: item.contractNumber,
      validFrom: item.validFrom,
      validTo: item.validTo,
      currencyCode: item.currencyCode || "ETB",
      description: item.description || "",
      signedBy: item.signedBy || "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4" data-testid="travel-agent-agreements">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#251605]">Agreements</h2>
          <p className="text-xs text-[#756A5B]">
            Commercial contracts, terms, and validity periods established with this travel agency.
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            size="sm"
            onClick={startCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-medium"
            data-testid="travel-agent-add-agreement"
          >
            <Plus className="mr-1.5 size-3.5" />
            Add Agreement
          </Button>
        )}
      </div>

      {/* Summary Band */}
      <div className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm">
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Active</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#2E7D32]">{kpis.active}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Expiring Soon</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">{kpis.expiring}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Expired</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#C62828]">{kpis.expired}</span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Total Agreements</span>
          <span className="mt-1 font-mono text-sm font-bold text-[#251605]">{kpis.total}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agreement name or reference…"
            className="h-8 pl-8 text-xs border-[#DDD4C5] bg-[#FAF8F5]"
            data-testid="travel-agent-agreements-search"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 border-[#DDD4C5] text-xs bg-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            <SelectItem value="active" className="text-xs">Active</SelectItem>
            <SelectItem value="expiring" className="text-xs">Expiring Soon</SelectItem>
            <SelectItem value="expired" className="text-xs">Expired</SelectItem>
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

      {/* Dense Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-agreements-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                <th className="px-3.5 py-2.5">Agreement</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Valid From</th>
                <th className="px-3 py-2.5">Valid To</th>
                <th className="px-3 py-2.5">Currency</th>
                <th className="px-3 py-2.5">Signed With</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EAE1]">
              {query.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#756A5B]">
                    Loading agreements…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8C827A] italic">
                    {q || status !== "all" ? "No agreements match these filters." : "No agreements yet."}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDrawerAgreement(row)}
                    className="cursor-pointer transition-colors hover:bg-[#FAF8F5]/80"
                    data-testid={`travel-agent-agreement-row-${row.id}`}
                  >
                    <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                      {row.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#8A641A]">
                      {row.contractNumber}
                    </td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.validFrom}</td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.validTo}</td>
                    <td className="px-3 py-2.5 font-mono text-[#251605]">{row.currencyCode}</td>
                    <td className="px-3 py-2.5 text-[#756A5B]">{row.signedBy ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          row.status === "active" && "bg-emerald-50 text-emerald-700",
                          row.status === "expiring" && "bg-amber-50 text-amber-700",
                          row.status === "expired" && "bg-rose-50 text-rose-700",
                          row.status === "inactive" && "bg-stone-100 text-stone-600",
                        )}
                      >
                        {row.status}
                      </span>
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
                            className="h-7 w-7 p-0 text-[#756A5B]"
                            data-testid={`travel-agent-agreement-actions-${row.id}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => setDrawerAgreement(row)}>
                            View Details
                          </DropdownMenuItem>
                          {canWrite && (
                            <>
                              <DropdownMenuItem onClick={() => startEdit(row)}>
                                <Pencil className="mr-2 size-3.5" />
                                Edit Agreement
                              </DropdownMenuItem>
                              {row.active && row.status !== "expired" && (
                                <DropdownMenuItem
                                  onClick={() => expireMutation.mutate(row.id)}
                                  className="text-rose-600"
                                >
                                  Expire Agreement
                                </DropdownMenuItem>
                              )}
                            </>
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

      {/* Right-Side Agreement Detail Drawer */}
      <Sheet open={Boolean(drawerAgreement)} onOpenChange={(open) => { if (!open) setDrawerAgreement(null); }}>
        <SheetContent side="right" className="border-l border-[#DDD4C5] bg-[#FCFBF9] p-5 sm:max-w-md">
          <SheetHeader className="border-b border-[#DDD4C5] pb-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                {drawerAgreement?.name ?? "Agreement Details"}
              </SheetTitle>
              {canWrite && drawerAgreement && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a = drawerAgreement;
                    setDrawerAgreement(null);
                    startEdit(a);
                  }}
                  className="h-7 border-[#DDD4C5] text-xs"
                >
                  <Pencil className="mr-1 size-3" />
                  Edit
                </Button>
              )}
            </div>
            <p className="font-mono text-xs text-[#8A641A]">{drawerAgreement?.contractNumber}</p>
          </SheetHeader>

          {drawerAgreement && (
            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Status:</span>
                  <span className="capitalize font-semibold text-[#251605]">{drawerAgreement.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Validity:</span>
                  <span className="font-mono text-[#251605]">{drawerAgreement.validFrom} → {drawerAgreement.validTo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#756A5B]">Currency:</span>
                  <span className="font-mono text-[#251605]">{drawerAgreement.currencyCode}</span>
                </div>
                {drawerAgreement.signedBy && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Signed With:</span>
                    <span className="font-medium text-[#251605]">{drawerAgreement.signedBy}</span>
                  </div>
                )}
              </div>

              {drawerAgreement.description && (
                <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                  <p className="font-semibold text-[#251605] mb-1">Contract Description</p>
                  <p className="whitespace-pre-wrap text-[#756A5B]">{drawerAgreement.description}</p>
                </div>
              )}

              {canWrite && drawerAgreement.active && drawerAgreement.status !== "expired" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => expireMutation.mutate(drawerAgreement.id)}
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 text-xs"
                >
                  Expire this Agreement
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add / Edit Agreement Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {editingId ? "Edit Agreement" : "Add Travel Agency Agreement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Agreement Title *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Annual Wholesale Contract 2026"
                className="mt-1 h-8 text-xs border-[#DDD4C5]"
              />
            </div>
            <div>
              <Label className="text-xs">Contract / Reference Number *</Label>
              <Input
                value={form.contractNumber}
                onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
                placeholder="e.g. TA-2026-WHOLESALE"
                className="mt-1 h-8 text-xs border-[#DDD4C5] font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Valid From *</Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                  className="mt-1 h-8 text-xs border-[#DDD4C5]"
                />
              </div>
              <div>
                <Label className="text-xs">Valid To *</Label>
                <Input
                  type="date"
                  value={form.validTo}
                  onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                  className="mt-1 h-8 text-xs border-[#DDD4C5]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Currency</Label>
                <Input
                  value={form.currencyCode}
                  onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
                  maxLength={3}
                  className="mt-1 h-8 text-xs border-[#DDD4C5] font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Signed With</Label>
                <Input
                  value={form.signedBy}
                  onChange={(e) => setForm((f) => ({ ...f, signedBy: e.target.value }))}
                  placeholder="e.g. Agency Director"
                  className="mt-1 h-8 text-xs border-[#DDD4C5]"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Terms overview, allotment clauses, commission references…"
                rows={3}
                className="mt-1 text-xs border-[#DDD4C5]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!form.name.trim() || !form.contractNumber.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
            >
              {editingId ? "Save Agreement" : "Create Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const GuestTravelAgentAgreementsView = GuestTravelAgentAgreements;
