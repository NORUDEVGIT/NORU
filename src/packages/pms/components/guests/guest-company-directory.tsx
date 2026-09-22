import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Download, MoreHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";

import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  COMPANIES_COPY,
  COMPANIES_DISABLED,
  COMPANIES_EMPTY,
  COMPANIES_NO_TYPES,
  COMPANIES_TITLE,
  COMPANY_DEFAULT_PAGE_SIZE,
  COMPANY_PAGE_SIZES,
  companyCreateAllowed,
  defaultBusinessTypeId,
} from "@/packages/pms/lib/guest-companies-workspace";
import {
  confirmCompanyImport,
  exportCompaniesCsv,
  getCompanyBusinessWorkspace,
  listCompanyWorkspace,
  previewCompanyImport,
  setCompanyStatus,
  type CompanyWorkspaceRow,
} from "@/packages/pms/lib/guest-companies.functions";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";

export function GuestCompanyDirectory({
  membership,
  returnCard,
}: {
  membership: RestaurantMembership;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchConfig = useServerFn(getCompanyBusinessWorkspace);
  const fetchList = useServerFn(listCompanyWorkspace);
  const exportCsv = useServerFn(exportCompaniesCsv);
  const previewImport = useServerFn(previewCompanyImport);
  const confirmImport = useServerFn(confirmCompanyImport);
  const changeCompanyStatus = useServerFn(setCompanyStatus);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | (typeof GUEST_ACCOUNT_STATUSES)[number]>("all");
  const [typeId, setTypeId] = useState("all");
  const [country, setCountry] = useState("");
  const [credit, setCredit] = useState<"all" | "yes" | "no">("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof COMPANY_PAGE_SIZES)[number]>(COMPANY_DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [creditFocus, setCreditFocus] = useState(false);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    csv: string;
    valid: number;
    invalid: number;
  } | null>(null);

  useEffect(() => {
    setPage(0);
    setSelected([]);
  }, [search, status, typeId, country, credit, createdFrom, createdTo, pageSize]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;
  const configQuery = useQuery({
    queryKey: ["company-business-workspace", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const offset = page * pageSize;
  const filters = {
    restaurantId,
    search: search.trim() || undefined,
    status,
    businessTypeId: typeId === "all" ? null : typeId,
    country: country || undefined,
    credit,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    limit: pageSize,
    offset,
  };
  const listQuery = useQuery({
    queryKey: ["company-workspace", filters],
    queryFn: () => fetchList({ data: filters }),
    enabled: canManage,
    retry: false,
  });

  const createGate = companyCreateAllowed(
    configQuery.data?.settings ?? { enabled: true },
    configQuery.data?.listingCreateAllowed ?? true,
    (configQuery.data?.types ?? []).filter((type) => type.active).length,
  );
  const types = configQuery.data?.types ?? [];
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const kpis = listQuery.data?.kpis ?? { total: 0, active: 0, inactive: 0, credit: 0 };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const defaultType = defaultBusinessTypeId(
    configQuery.data?.settings ?? { defaultBusinessTypeId: null },
    types,
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["company-workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["guest-workspace-stats", restaurantId] });
  }

  function openCompany(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ card: returnCard, type: "company" }),
    });
  }

  const statusMutation = useMutation({
    mutationFn: (input: { ids: string[]; status: "active" | "inactive" }) =>
      changeCompanyStatus({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Company status updated.");
      setSelected([]);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Status could not be changed."),
  });

  async function runExport(ids?: string[]) {
    try {
      const result = await exportCsv({ data: { ...filters, ids, offset: 0, limit: 200 } });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "companies.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    }
  }

  async function onImportFile(file: File) {
    try {
      const csv = await file.text();
      const preview = await previewImport({ data: { restaurantId, filename: file.name, csv } });
      setPendingImport({
        filename: file.name,
        csv,
        valid: preview.valid.length,
        invalid: preview.invalid.length,
      });
      setImportPreview(
        `${preview.valid.length} valid row(s), ${preview.invalid.length} invalid. Confirm to persist.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function confirmPendingImport() {
    if (!pendingImport) return;
    try {
      const confirmed = await confirmImport({
        data: { restaurantId, filename: pendingImport.filename, csv: pendingImport.csv },
      });
      setImportPreview(
        `Imported ${confirmed.created}. Skipped ${confirmed.skipped}. Invalid ${confirmed.invalid}.`,
      );
      setPendingImport(null);
      toast.success(`Imported ${confirmed.created} companies.`);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    }
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading companies…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="guest-companies-page">
        <h2 className="font-display text-xl">{COMPANIES_TITLE}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view companies for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-companies-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{COMPANIES_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{COMPANIES_COPY}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImportFile(file);
              event.target.value = "";
            }}
          />
          <Button variant="outline" disabled={!createGate.ok} onClick={() => fileRef.current?.click()} data-testid="companies-import">
            <Upload className="mr-2 size-4" />
            Import
          </Button>
          <Button variant="outline" onClick={() => void runExport()} data-testid="companies-export">
            <Download className="mr-2 size-4" />
            Export
          </Button>
          <Button
            disabled={!createGate.ok}
            title={createGate.ok ? undefined : createGate.message}
            onClick={() => {
              setEditId(undefined);
              setCreditFocus(false);
              setFormOpen(true);
            }}
            data-testid="companies-register"
          >
            <Building2 className="mr-2 size-4" />
            Register New Company
          </Button>
        </div>
      </div>

      {!createGate.ok ? (
        <p className="text-sm text-muted-foreground">
          {createGate.message === COMPANIES_DISABLED ? COMPANIES_DISABLED : createGate.message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: "all" as const, label: "Total Companies", value: kpis.total },
          { key: "active" as const, label: "Active Companies", value: kpis.active },
          { key: "inactive" as const, label: "Inactive Companies", value: kpis.inactive },
          { key: "credit" as const, label: "Credit Accounts", value: kpis.credit },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            className={cn(
              "rounded-2xl border border-border bg-card p-4 text-left",
              (card.key === "credit" ? credit === "yes" : status === card.key) && "ring-2 ring-primary/40",
            )}
            onClick={() => {
              if (card.key === "credit") {
                setCredit("yes");
                setStatus("all");
              } else {
                setStatus(card.key);
                setCredit("all");
              }
            }}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-1 font-display text-2xl">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, contact, email, phone, tax ID…" data-testid="companies-search" />
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger data-testid="companies-type"><SelectValue placeholder="Company type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}{type.active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger data-testid="companies-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {GUEST_ACCOUNT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={country || "all"} onValueChange={(value) => setCountry(value === "all" ? "" : value)}>
          <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {ISO_COUNTRIES.map((item) => (
              <SelectItem key={item.code} value={item.name}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={credit} onValueChange={(value) => setCredit(value as typeof credit)}>
          <SelectTrigger><SelectValue placeholder="Credit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Credit: all</SelectItem>
            <SelectItem value="yes">Credit account</SelectItem>
            <SelectItem value="no">No credit account</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
          <Input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ ids: selected, status: "active" })}>Activate</Button>
          <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ ids: selected, status: "inactive" })}>Deactivate</Button>
          <Button size="sm" variant="outline" onClick={() => void runExport(selected)}>Export Selected</Button>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      ) : listQuery.isError ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{listQuery.error instanceof Error ? listQuery.error.message : "Companies could not be loaded."}</p>
          <Button className="mt-3" variant="outline" onClick={() => void listQuery.refetch()}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{types.filter((type) => type.active).length === 0 ? COMPANIES_NO_TYPES : COMPANIES_EMPTY}</p>
          {createGate.ok ? <Button className="mt-3" onClick={() => setFormOpen(true)}>Register New Company</Button> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={items.every((row) => selected.includes(row.id))} onChange={(event) => setSelected(event.target.checked ? items.map((row) => row.id) : [])} /></th>
                <th className="px-3 py-3">Logo</th>
                <th className="px-3 py-3">Company Name</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Contact Person</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Country</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <CompanyRow
                  key={row.id}
                  row={row}
                  checked={selected.includes(row.id)}
                  onCheck={(checked) => setSelected((current) => (checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                  onView={() => openCompany(row.id)}
                  onEdit={() => { setEditId(row.id); setCreditFocus(false); setFormOpen(true); }}
                  onCredit={() => { setEditId(row.id); setCreditFocus(true); setFormOpen(true); }}
                  onStatus={(next) => statusMutation.mutate({ ids: [row.id], status: next })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of {total} companies</p>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as typeof pageSize)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANY_PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      </div>
      {importPreview ? <p className="text-sm text-muted-foreground">{importPreview}</p> : null}
      {pendingImport ? (
        <Button size="sm" onClick={() => void confirmPendingImport()} data-testid="companies-import-confirm">
          Confirm import
        </Button>
      ) : null}
      <GuestCompanyFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        accountId={editId}
        defaultBusinessTypeId={defaultType}
        focusCredit={creditFocus}
        onOpenChange={setFormOpen}
        onSaved={(id) => openCompany(id)}
      />
    </div>
  );
}

function CompanyRow({
  row, checked, onCheck, onView, onEdit, onCredit, onStatus,
}: {
  row: CompanyWorkspaceRow;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onCredit: () => void;
  onStatus: (status: "active" | "inactive") => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-3"><input type="checkbox" checked={checked} onChange={(event) => onCheck(event.target.checked)} /></td>
      <td className="px-3 py-3">
        {row.logoUrl ? <img src={row.logoUrl} alt="" className="size-8 rounded object-cover" /> : (
          <span className="inline-flex size-8 items-center justify-center rounded bg-muted text-xs">{row.name.slice(0, 2).toUpperCase()}</span>
        )}
      </td>
      <td className="px-3 py-3 font-medium"><button type="button" className="text-left hover:underline" onClick={onView}>{row.name}</button></td>
      <td className="px-3 py-3">
        {row.businessProfileTypeName ?? "—"}
        {row.businessProfileTypeId && !row.businessProfileTypeActive ? <Badge variant="secondary" className="ml-2">Inactive</Badge> : null}
      </td>
      <td className="px-3 py-3 text-muted-foreground">{row.primaryContactName ?? "—"}</td>
      <td className="px-3 py-3 text-muted-foreground">{row.phone ?? "—"}</td>
      <td className="px-3 py-3 text-muted-foreground">{row.email ?? "—"}</td>
      <td className="px-3 py-3 text-muted-foreground">{row.country ?? "—"}</td>
      <td className="px-3 py-3">
        <StatusBadge status={row.accountStatus === "pending" ? "inactive" : row.accountStatus} />
        {row.accountStatus === "pending" ? <span className="ml-2 text-xs">Pending</span> : null}
      </td>
      <td className="relative px-3 py-3">
        <Button size="sm" variant="ghost" onClick={() => setMenu((open) => !open)} aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
        {menu ? (
          <div className="absolute right-3 z-10 mt-1 w-44 rounded-xl border border-border bg-card p-1 shadow">
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={onView}>View</button>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={onEdit}>Edit</button>
            {row.accountStatus !== "active" ? (
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onStatus("active")}>Activate</button>
            ) : (
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onStatus("inactive")}>Deactivate</button>
            )}
            {row.creditAccountAllowed ? (
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={onCredit}>Manage Credit Account</button>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
