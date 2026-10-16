import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { createCompanyDocumentUpload, listCompanyContracts } from "@/packages/pms/lib/guest-company-detail.functions";
import { getCorporateCard3, saveContractRateCard3, saveCorporateAgreementCard3 } from "@/packages/pms/lib/corporate-card3.functions";
import { CONTRACT_RATE_KIND_LABELS, CONTRACT_RATE_KINDS } from "@/packages/pms/lib/corporate-card3.server";

type ContractForm = {
  id?: string;
  code: string;
  name: string;
  contractNumber: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  description: string;
  active: boolean;
  autoRenew: boolean;
  noticePeriodDays: string;
  signedAt: string;
  signedBy: string;
  fileStoragePath: string | null;
};

const EMPTY_FORM: ContractForm = {
  code: "",
  name: "",
  contractNumber: "",
  validFrom: "",
  validTo: "",
  currencyCode: "",
  description: "",
  active: true,
  autoRenew: false,
  noticePeriodDays: "",
  signedAt: "",
  signedBy: "",
  fileStoragePath: null,
};

export function GuestCompanyContracts({
  restaurantId,
  companyId,
  canWrite,
}: {
  restaurantId: string;
  companyId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listCompanyContracts);
  const loadCard3 = useServerFn(getCorporateCard3);
  const saveAgreement = useServerFn(saveCorporateAgreementCard3);
  const saveRate = useServerFn(saveContractRateCard3);
  const startUpload = useServerFn(createCompanyDocumentUpload);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractForm>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [rateKind, setRateKind] = useState<(typeof CONTRACT_RATE_KINDS)[number]>("negotiated");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [rateFrom, setRateFrom] = useState("");
  const [rateTo, setRateTo] = useState("");

  const query = useQuery({
    queryKey: ["company-contracts", restaurantId, companyId, q, status],
    queryFn: () => load({ data: { restaurantId, companyId, q, status } }),
    retry: false,
  });
  const card3 = useQuery({
    queryKey: ["pms-card3-corporate", restaurantId],
    queryFn: () => loadCard3({ data: { restaurantId } }),
    enabled: canWrite,
    retry: false,
  });

  const items = query.data?.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? (items.length > 0 ? items[0] : null);
  const rates = (query.data?.rates ?? []).filter((row) => row.agreementId === selected?.id);
  const currencies = card3.data?.snapshot.currencies ?? [];
  const roomTypes = (card3.data?.snapshot.roomTypes ?? []).filter((row) => row.active);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["company-contracts", restaurantId, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-corporate", restaurantId] });
  }

  const persist = useMutation({
    mutationFn: async (next: ContractForm) => {
      let fileStoragePath = next.fileStoragePath;
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
        if (uploaded.error) throw new Error("Contract file upload failed.");
        fileStoragePath = ticket.path;
      }
      return saveAgreement({
        data: {
          restaurantId,
          agreement: {
            id: next.id,
            companyMasterId: companyId,
            code: next.code.trim(),
            name: next.name.trim(),
            contractNumber: next.contractNumber.trim(),
            validFrom: next.validFrom,
            validTo: next.validTo,
            currencyCode: next.currencyCode.trim().toUpperCase(),
            description: next.description.trim() || null,
            active: next.active,
            autoRenew: next.autoRenew,
            noticePeriodDays: next.noticePeriodDays ? Number(next.noticePeriodDays) : null,
            signedAt: next.signedAt || null,
            signedBy: next.signedBy.trim() || null,
            fileStoragePath,
          },
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      refresh();
      toast.success("Contract saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const persistRate = useMutation({
    mutationFn: () =>
      saveRate({
        data: {
          restaurantId,
          rate: {
            agreementId: selected!.id,
            roomTypeId,
            rateKind,
            amount: Number(amount),
            validFrom: rateFrom || selected!.validFrom,
            validTo: rateTo || selected!.validTo,
          },
        },
      }),
    onSuccess: () => {
      setRateOpen(false);
      setAmount("");
      refresh();
      toast.success("Negotiated rate added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startAdd() {
    setForm(EMPTY_FORM);
    setFile(null);
    setOpen(true);
  }
  function startEdit(row: typeof selected) {
    if (!row) return;
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      contractNumber: row.contractNumber,
      validFrom: row.validFrom,
      validTo: row.validTo,
      currencyCode: row.currencyCode,
      description: row.description,
      active: row.active,
      autoRenew: row.autoRenew,
      noticePeriodDays: row.noticePeriodDays == null ? "" : String(row.noticePeriodDays),
      signedAt: row.signedAt ?? "",
      signedBy: row.signedBy ?? "",
      fileStoragePath: row.fileStoragePath,
    });
    setOpen(true);
  }
  function startRenew(row: typeof selected) {
    if (!row) return;
    setForm({
      ...EMPTY_FORM,
      code: `${row.code}_R`,
      name: row.name,
      contractNumber: `${row.contractNumber}-R`,
      currencyCode: row.currencyCode,
      description: row.description,
      autoRenew: row.autoRenew,
    });
    setOpen(true);
  }

  const kpis = query.data?.kpis;
  const activeCount = kpis?.active ?? 0;
  const expiringCount = kpis?.expiring ?? 0;
  const expiredCount = kpis?.expired ?? 0;
  const inactiveCount = Math.max(0, (kpis?.total ?? 0) - activeCount - expiringCount - expiredCount);

  return (
    <div className="space-y-4" data-testid="company-contracts">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Contracts & Agreements</h2>
          <p className="text-xs text-[#756A5B]">
            Corporate negotiated agreements, validity windows, and rate terms.
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
            onClick={startAdd}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add Agreement
          </Button>
        ) : null}
      </div>

      {/* Compact Summary Band */}
      <div
        className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm"
        data-testid="company-contracts-kpis"
      >
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Active
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-emerald-700">
            {activeCount}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Expiring Soon
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
            {expiringCount}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Expired
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-red-700">
            {expiredCount}
          </span>
        </div>
        <div className="flex flex-col px-3 py-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            Inactive
          </span>
          <span className="mt-1 font-mono text-sm font-bold text-[#756A5B]">
            {inactiveCount}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-xs border-[#DDD4C5] bg-white min-w-48 flex-1"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search agreement name, code, contract number…"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(q || status !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#756A5B] hover:text-[#251605]"
            onClick={() => { setQ(""); setStatus("all"); }}
          >
            <RotateCcw className="mr-1 size-3" /> Clear
          </Button>
        )}
      </div>

      {/* Dense Full-Width Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
        {query.isLoading ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">Loading contracts & agreements…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#756A5B]">
            {q || status !== "all" ? "No agreements match these filters." : "No corporate agreements added yet."}
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-[#FAF8F5]">
              <TableRow className="border-b border-[#DDD4C5]">
                <TableHead className="text-xs font-semibold text-[#251605]">Agreement</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Contract No.</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Valid From</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Valid To</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Notice Days</TableHead>
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
                      <FileCheck className="size-4 text-[#8A641A] shrink-0" />
                      <div>
                        <span>{row.name}</span>
                        {row.code && <span className="ml-1 text-[11px] text-[#756A5B]">({row.code})</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 font-mono text-[#8A641A]">{row.contractNumber}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.validFrom}</TableCell>
                  <TableCell className="py-2.5 text-[#251605]">{row.validTo}</TableCell>
                  <TableCell className="py-2.5 text-[#756A5B]">
                    {row.noticePeriodDays == null ? "—" : `${row.noticePeriodDays}d`}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        row.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : row.status === "expiring"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : row.status === "expired"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-stone-100 text-stone-600 border border-stone-200"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-[#756A5B] hover:text-[#251605]">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { setSelectedId(row.id); setDrawerOpen(true); }}>
                          View Details
                        </DropdownMenuItem>
                        {canWrite && (
                          <>
                            <DropdownMenuItem onSelect={() => startEdit(row)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => startRenew(row)}>Renew</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Right-Side Agreement Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="border-b border-[#DDD4C5] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="font-display text-lg font-bold text-[#251605]">
                  {selected?.name ?? "Agreement Details"}
                </SheetTitle>
                <p className="text-xs text-[#756A5B]">Contract #{selected?.contractNumber}</p>
              </div>
              {canWrite && selected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                  onClick={() => startEdit(selected)}
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
                    <span className="text-[#756A5B]">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold capitalize text-[#251605]">{selected.status}</span>
                      {selected.validityState === "expiring_soon" ? (
                        <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Expires in {selected.daysUntilExpiry}d
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Validity</span>
                    <span className="font-medium text-[#251605]">{selected.validFrom} → {selected.validTo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Pricing Method</span>
                    <span className="font-semibold text-[#251605]">
                      {selected.pricingMethod === "rate_plan"
                        ? ((selected as { ratePlanScope?: string }).ratePlanScope === "all" ? "All Active Rate Plans" : "Selected Rate Plan(s)")
                        : selected.pricingMethod === "rate_plan_discount"
                        ? ((selected as { discountApplication?: string; ratePlanScope?: string }).discountApplication === "custom"
                            ? `Plan Discounts (Separate · ${(selected as { ratePlanScope?: string }).ratePlanScope === "all" ? "All Plans" : "Selected Plans"})`
                            : `Rate Plan Discount (${selected.discountValue}${selected.discountType === "percent" ? "%" : " " + (selected.currencyCode || "")} · ${(selected as { ratePlanScope?: string }).ratePlanScope === "all" ? "All Plans" : "Selected Plans"})`)
                        : "Contracted Room Rates"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Currency</span>
                    <span className="font-mono text-[#251605]">{selected.currencyCode || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Auto-Renew</span>
                    <span className="text-[#251605]">{selected.autoRenew ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Notice Period</span>
                    <span className="text-[#251605]">{selected.noticePeriodDays == null ? "—" : `${selected.noticePeriodDays} days`}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#756A5B]">Signed By</span>
                    <span className="text-[#251605]">{selected.signedBy || "—"}</span>
                  </div>
                  {selected.signedAt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[#756A5B]">Signed Date</span>
                      <span className="text-[#251605]">{selected.signedAt}</span>
                    </div>
                  ) : null}
                </div>

                {selected.description ? (
                  <div className="space-y-1 rounded-xl border border-[#DDD4C5] bg-white p-3">
                    <h4 className="font-display text-xs font-semibold text-[#251605]">Description & Terms</h4>
                    <p className="whitespace-pre-wrap text-[#756A5B]">{selected.description}</p>
                  </div>
                ) : null}

                {/* Rate Coverage */}
                <div className="space-y-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-xs font-semibold text-[#251605]">Negotiated Rate Coverage</h4>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-[#8A641A] hover:bg-[#F7F4EE]"
                        onClick={() => {
                          setRoomTypeId(roomTypes[0]?.id ?? "");
                          setRateOpen(true);
                        }}
                      >
                        <Plus className="mr-1 size-3" /> Add Rate
                      </Button>
                    )}
                  </div>
                  {rates.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {rates.map((rate) => (
                        <div key={rate.id} className="flex items-center justify-between border-b border-[#EFE9DF]/60 pb-1 text-[11px] last:border-b-0">
                          <div>
                            <p className="font-medium text-[#251605]">{rate.roomTypeName}</p>
                            <p className="text-[10px] text-[#756A5B]">{CONTRACT_RATE_KIND_LABELS[rate.rateKind] ?? rate.rateKind}</p>
                          </div>
                          <span className="font-mono font-bold text-[#8A641A]">{rate.amount}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#756A5B] italic">No room rates attached yet.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-center text-[#756A5B] italic">No agreement selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add / Edit Agreement Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Corporate Agreement" : "Add Corporate Agreement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contract Number *</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.contractNumber}
                  onChange={(e) => setForm((p) => ({ ...p, contractNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Code *</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Agreement Title *</Label>
              <Input
                className="h-8 text-xs border-[#DDD4C5]"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valid From *</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.validFrom}
                  onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid To *</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.validTo}
                  onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select
                  value={form.currencyCode || (currencies[0]?.code ?? "")}
                  onValueChange={(val) => setForm((p) => ({ ...p, currencyCode: val }))}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notice Days</Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.noticePeriodDays}
                  onChange={(e) => setForm((p) => ({ ...p, noticePeriodDays: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Signed By</Label>
                <Input
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.signedBy}
                  onChange={(e) => setForm((p) => ({ ...p, signedBy: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Signed Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={form.signedAt}
                  onChange={(e) => setForm((p) => ({ ...p, signedAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <Checkbox
                  checked={form.active}
                  onCheckedChange={(checked) => setForm((p) => ({ ...p, active: Boolean(checked) }))}
                />
                <span>Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <Checkbox
                  checked={form.autoRenew}
                  onCheckedChange={(checked) => setForm((p) => ({ ...p, autoRenew: Boolean(checked) }))}
                />
                <span>Auto-renew</span>
              </label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description & Notes</Label>
              <Textarea
                className="min-h-[50px] text-xs border-[#DDD4C5]"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Agreement Document (PDF/JPG/PNG)</Label>
              <Input
                type="file"
                className="h-8 text-xs border-[#DDD4C5]"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!form.contractNumber.trim() || !form.name.trim() || persist.isPending}
              onClick={() => persist.mutate(form)}
            >
              {persist.isPending ? "Saving…" : "Save Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rate Coverage Dialog */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Negotiated Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Room Type *</Label>
              <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Rate Kind</Label>
                <Select value={rateKind} onValueChange={(val) => setRateKind(val as typeof rateKind)}>
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_RATE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>{CONTRACT_RATE_KIND_LABELS[kind]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount ({selected?.currencyCode || ""}) *</Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valid From</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={rateFrom}
                  onChange={(e) => setRateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid To</Label>
                <Input
                  type="date"
                  className="h-8 text-xs border-[#DDD4C5]"
                  value={rateTo}
                  onChange={(e) => setRateTo(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setRateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#8A641A] text-white hover:bg-[#725215]"
              disabled={!roomTypeId || !amount || persistRate.isPending}
              onClick={() => persistRate.mutate()}
            >
              {persistRate.isPending ? "Adding…" : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
