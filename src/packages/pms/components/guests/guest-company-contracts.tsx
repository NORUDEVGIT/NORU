import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
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
  const selected = items.find((row) => row.id === selectedId) ?? items[0] ?? null;
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
      await saveAgreement({
        data: {
          restaurantId,
          id: next.id,
          companyId,
          code: next.code,
          name: next.name,
          contractNumber: next.contractNumber,
          validFrom: next.validFrom,
          validTo: next.validTo,
          currencyCode: next.currencyCode,
          description: next.description,
          active: next.active,
          autoRenew: next.autoRenew,
          noticePeriodDays: next.noticePeriodDays ? Number(next.noticePeriodDays) : null,
          signedAt: next.signedAt || null,
          signedBy: next.signedBy || null,
          fileStoragePath,
        },
      });
    },
    onSuccess: () => {
      toast.success("Contract saved.");
      setOpen(false);
      setFile(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const persistRate = useMutation({
    mutationFn: () =>
      saveRate({
        data: {
          restaurantId,
          agreementId: selected!.id,
          roomTypeId,
          rateKind,
          amount: Number(amount),
          validFrom: rateFrom,
          validTo: rateTo,
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success("Contract rate saved.");
      setRateOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startAdd() {
    setForm({
      ...EMPTY_FORM,
      currencyCode: currencies.find((row) => row.isBase)?.code ?? currencies[0]?.code ?? "ETB",
    });
    setOpen(true);
  }
  function startEdit() {
    if (!selected) return;
    setForm({
      id: selected.id,
      code: selected.code,
      name: selected.name,
      contractNumber: selected.contractNumber,
      validFrom: selected.validFrom,
      validTo: selected.validTo,
      currencyCode: selected.currencyCode,
      description: selected.description,
      active: selected.active,
      autoRenew: selected.autoRenew,
      noticePeriodDays: selected.noticePeriodDays == null ? "" : String(selected.noticePeriodDays),
      signedAt: selected.signedAt ?? "",
      signedBy: selected.signedBy ?? "",
      fileStoragePath: selected.fileStoragePath,
    });
    setOpen(true);
  }
  function startRenew() {
    if (!selected) return;
    setForm({
      ...EMPTY_FORM,
      code: `${selected.code}_R`,
      name: selected.name,
      contractNumber: `${selected.contractNumber}-R`,
      currencyCode: selected.currencyCode,
      description: selected.description,
      autoRenew: selected.autoRenew,
    });
    setOpen(true);
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading contracts…</p>;
  if (query.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6">
        <p className="font-display text-lg">Contracts unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{(query.error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="company-contracts">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Contracts & Agreements</h2>
          <p className="text-sm text-muted-foreground">
            Writes use Card 3 corporate agreements. Coverage stays on existing room types and rate kinds.
          </p>
        </div>
        {canWrite ? <Button type="button" onClick={startAdd}>Add contract</Button> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Total" value={String(query.data?.kpis.total ?? 0)} />
        <Kpi label="Active" value={String(query.data?.kpis.active ?? 0)} />
        <Kpi label="Expiring" value={String(query.data?.kpis.expiring ?? 0)} />
        <Kpi label="Expired" value={String(query.data?.kpis.expired ?? 0)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, code, number" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts for this company yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                    <TableCell>{row.contractNumber}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.validFrom} – {row.validTo}</TableCell>
                    <TableCell>{row.currencyCode || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
        <aside className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {selected ? (
            <>
              <p className="font-display text-lg">{selected.name}</p>
              <p className="text-sm">{selected.contractNumber} · {selected.status}</p>
              <p className="text-sm">{selected.validFrom} – {selected.validTo} · {selected.currencyCode || "—"}</p>
              <p className="text-sm">{selected.description || "No terms recorded."}</p>
              <p className="text-sm">Auto-renew: {selected.autoRenew ? "Yes" : "No"}</p>
              <p className="text-sm">Notice: {selected.noticePeriodDays == null ? "—" : `${selected.noticePeriodDays} days`}</p>
              <p className="text-sm">Signed: {selected.signedBy || "—"} {selected.signedAt ? `on ${selected.signedAt}` : ""}</p>
              <div>
                <p className="text-sm font-medium">Coverage</p>
                {rates.length ? (
                  <ul className="mt-1 space-y-1 text-sm">
                    {rates.map((row) => (
                      <li key={row.id}>{row.rateKind} · {row.amount} · {row.validFrom} – {row.validTo}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No contract rates yet.</p>
                )}
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={startEdit}>Edit</Button>
                  <Button type="button" size="sm" variant="outline" onClick={startRenew}>Renew</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRateOpen(true)}>Add rate</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      persist.mutate({
                        id: selected.id,
                        code: selected.code,
                        name: selected.name,
                        contractNumber: selected.contractNumber,
                        validFrom: selected.validFrom,
                        validTo: selected.validTo,
                        currencyCode: selected.currencyCode || "ETB",
                        description: selected.description,
                        active: false,
                        autoRenew: selected.autoRenew,
                        noticePeriodDays: selected.noticePeriodDays == null ? "" : String(selected.noticePeriodDays),
                        signedAt: selected.signedAt ?? "",
                        signedBy: selected.signedBy ?? "",
                        fileStoragePath: selected.fileStoragePath,
                      })
                    }
                  >
                    Archive
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Contract writes need room-manager access.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a contract to see terms and coverage.</p>
          )}
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit contract" : "Add contract"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Code"><Input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} /></Field>
            <Field label="Name"><Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Field>
            <Field label="Contract number"><Input value={form.contractNumber} onChange={(event) => setForm((prev) => ({ ...prev, contractNumber: event.target.value }))} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valid from"><Input type="date" value={form.validFrom} onChange={(event) => setForm((prev) => ({ ...prev, validFrom: event.target.value }))} /></Field>
              <Field label="Valid to"><Input type="date" value={form.validTo} onChange={(event) => setForm((prev) => ({ ...prev, validTo: event.target.value }))} /></Field>
            </div>
            <Field label="Currency">
              <Select value={form.currencyCode} onValueChange={(value) => setForm((prev) => ({ ...prev, currencyCode: value }))}>
                <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>
                  {currencies.map((row) => (
                    <SelectItem key={row.code} value={row.code}>{row.code}{row.isBase ? " (base)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Terms"><Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.autoRenew} onChange={(event) => setForm((prev) => ({ ...prev, autoRenew: event.target.checked }))} />
              Auto-renew
            </label>
            <Field label="Notice period (days)">
              <Input value={form.noticePeriodDays} onChange={(event) => setForm((prev) => ({ ...prev, noticePeriodDays: event.target.value }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Signed at"><Input type="date" value={form.signedAt} onChange={(event) => setForm((prev) => ({ ...prev, signedAt: event.target.value }))} /></Field>
              <Field label="Signed by"><Input value={form.signedBy} onChange={(event) => setForm((prev) => ({ ...prev, signedBy: event.target.value }))} /></Field>
            </div>
            <Field label="Upload version">
              <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" disabled={persist.isPending} onClick={() => persist.mutate(form)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add contract rate</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Room type">
              <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                <SelectTrigger><SelectValue placeholder="Room type" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rate kind">
              <Select value={rateKind} onValueChange={(value) => setRateKind(value as typeof rateKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_RATE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>{CONTRACT_RATE_KIND_LABELS[kind]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Amount"><Input value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valid from"><Input type="date" value={rateFrom} onChange={(event) => setRateFrom(event.target.value)} /></Field>
              <Field label="Valid to"><Input type="date" value={rateTo} onChange={(event) => setRateTo(event.target.value)} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={!selected || persistRate.isPending} onClick={() => persistRate.mutate()}>
              Save rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
