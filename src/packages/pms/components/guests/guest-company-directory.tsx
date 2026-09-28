import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import { GuestCompanyQuickViewDrawer } from "@/packages/pms/components/guests/guest-company-quick-view-drawer";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";

function CompanyKpiCard({
  label,
  value,
  hint,
  loading,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value?: number | null | undefined;
  hint?: string | undefined;
  loading?: boolean | undefined;
  icon: React.ReactNode;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm text-left transition-all hover:border-[#8A641A]/50",
        active && "ring-2 ring-[#8A641A] border-[#8A641A]/60 shadow-md",
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-14" />
        ) : (
          <p className="font-display text-xl font-bold leading-tight tracking-tight text-[#251605]">
            {value != null ? value.toLocaleString() : "—"}
          </p>
        )}
        {hint ? <p className="truncate text-[9px] text-[#8C827A]">{hint}</p> : null}
      </div>
    </button>
  );
}

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
  const [pageSize, setPageSize] = useState<(typeof COMPANY_PAGE_SIZES)[number]>(
    COMPANY_DEFAULT_PAGE_SIZE,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [creditFocus, setCreditFocus] = useState(false);
  const [previewCompanyId, setPreviewCompanyId] = useState<string | null>(null);
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
      search: guestProfileSearch({
        card: returnCard,
        section: "companies",
        type: "company",
        nav: "overview",
      }),
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
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Status could not be changed."),
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

  // Active filter chips calculation
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (search.trim()) {
    activeChips.push({
      key: "search",
      label: `Search: "${search}"`,
      onRemove: () => setSearch(""),
    });
  }
  if (status !== "all") {
    activeChips.push({
      key: "status",
      label: `Status: ${status}`,
      onRemove: () => setStatus("all"),
    });
  }
  if (typeId !== "all") {
    const selectedType = types.find((t) => t.id === typeId);
    activeChips.push({
      key: "type",
      label: `Type: ${selectedType?.name ?? typeId}`,
      onRemove: () => setTypeId("all"),
    });
  }
  if (country) {
    activeChips.push({
      key: "country",
      label: `Country: ${country}`,
      onRemove: () => setCountry(""),
    });
  }
  if (credit !== "all") {
    activeChips.push({
      key: "credit",
      label: credit === "yes" ? "Credit: Eligible" : "Credit: No",
      onRemove: () => setCredit("all"),
    });
  }
  if (createdFrom) {
    activeChips.push({
      key: "createdFrom",
      label: `From: ${createdFrom}`,
      onRemove: () => setCreatedFrom(""),
    });
  }
  if (createdTo) {
    activeChips.push({
      key: "createdTo",
      label: `To: ${createdTo}`,
      onRemove: () => setCreatedTo(""),
    });
  }

  function handleClearAllFilters() {
    setSearch("");
    setStatus("all");
    setTypeId("all");
    setCountry("");
    setCredit("all");
    setCreatedFrom("");
    setCreatedTo("");
  }

  if (accessQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-companies-page">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6"
        data-testid="guest-companies-page"
      >
        <h2 className="font-display text-xl font-bold text-[#251605]">{COMPANIES_TITLE}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view companies for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-companies-page">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#251605]">{COMPANIES_TITLE}</h2>
          <p className="mt-0.5 text-xs text-[#756A5B]">{COMPANIES_COPY}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            disabled={!createGate.ok}
            onClick={() => fileRef.current?.click()}
            className="h-8 gap-1.5 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm text-xs font-medium"
            data-testid="companies-import"
          >
            <Upload className="size-3.5 text-[#8A641A]" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runExport()}
            className="h-8 gap-1.5 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE] shadow-sm text-xs font-medium"
            data-testid="companies-export"
          >
            <Download className="size-3.5 text-[#8A641A]" />
            Export
          </Button>
          <Button
            size="sm"
            disabled={!createGate.ok}
            title={createGate.ok ? undefined : createGate.message}
            onClick={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({ type: "company", create: "company" }),
              })
            }
            className="h-8 gap-1.5 bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm text-xs font-medium"
            data-testid="companies-register"
          >
            <Plus className="size-3.5" />
            Register New Company
          </Button>
        </div>
      </div>

      {!createGate.ok ? (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          {createGate.message === COMPANIES_DISABLED ? COMPANIES_DISABLED : createGate.message}
        </p>
      ) : null}

      {/* KPI Summary Strip (Interactive Band matching Individual Guest Workspace) */}
      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Company directory KPIs"
        data-testid="guest-directory-summary-band"
      >
        <CompanyKpiCard
          label="Total Companies"
          value={kpis.total}
          hint="All corporate profiles"
          loading={listQuery.isLoading}
          icon={<Building2 className="size-4" />}
          tone="bg-[#F4E9D0] text-[#8A641A]"
          active={status === "all" && credit === "all"}
          onClick={() => {
            setStatus("all");
            setCredit("all");
          }}
        />
        <CompanyKpiCard
          label="Active Companies"
          value={kpis.active}
          hint="Operational accounts"
          loading={listQuery.isLoading}
          icon={<CheckCircle2 className="size-4" />}
          tone="bg-emerald-50 text-emerald-700"
          active={status === "active" && credit === "all"}
          onClick={() => {
            setStatus("active");
            setCredit("all");
          }}
        />
        <CompanyKpiCard
          label="Inactive Companies"
          value={kpis.inactive}
          hint="Suspended or inactive"
          loading={listQuery.isLoading}
          icon={<Building2 className="size-4" />}
          tone="bg-stone-100 text-stone-600"
          active={status === "inactive" && credit === "all"}
          onClick={() => {
            setStatus("inactive");
            setCredit("all");
          }}
        />
        <CompanyKpiCard
          label="Credit Accounts"
          value={kpis.credit}
          hint="Direct ledger enabled"
          loading={listQuery.isLoading}
          icon={<CreditCard className="size-4" />}
          tone="bg-amber-50 text-amber-700"
          active={credit === "yes"}
          onClick={() => {
            setCredit("yes");
            setStatus("all");
          }}
        />
      </section>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1 sm:min-w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#756A5B]" />
          <Input
            className="pl-9 pr-8 border-[#DDD4C5] bg-white text-xs text-[#251605] h-9"
            placeholder="Search name, contact, email, phone, tax ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="companies-search"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Company Type Filter */}
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="w-40 border-[#DDD4C5] bg-white text-xs h-9" data-testid="companies-type">
            <SelectValue placeholder="Company Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
                {type.active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={status} onValueChange={(val) => setStatus(val as typeof status)}>
          <SelectTrigger className="w-32 border-[#DDD4C5] bg-white text-xs h-9" data-testid="companies-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {GUEST_ACCOUNT_STATUSES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Country Filter */}
        <Select
          value={country || "all"}
          onValueChange={(val) => setCountry(val === "all" ? "" : val)}
        >
          <SelectTrigger className="w-40 border-[#DDD4C5] bg-white text-xs h-9">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {ISO_COUNTRIES.map((item) => (
              <SelectItem key={item.code} value={item.name}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Credit Filter */}
        <Select value={credit} onValueChange={(val) => setCredit(val as typeof credit)}>
          <SelectTrigger className="w-36 border-[#DDD4C5] bg-white text-xs h-9">
            <SelectValue placeholder="Credit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Credit: All</SelectItem>
            <SelectItem value="yes">Credit Account</SelectItem>
            <SelectItem value="no">No Credit</SelectItem>
          </SelectContent>
        </Select>

        {/* Date Filters */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="w-32 border-[#DDD4C5] bg-white text-xs h-9 px-2"
            title="Created From"
          />
          <span className="text-xs text-[#756A5B]">→</span>
          <Input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="w-32 border-[#DDD4C5] bg-white text-xs h-9 px-2"
            title="Created To"
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs"
          data-testid="company-filter-chips"
        >
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-[#FAF8F5] px-2 py-0.5 font-medium text-[#251605]"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-[#7A6B58] hover:text-[#251605]"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="ml-1 text-xs font-semibold text-[#8A641A] hover:underline"
          >
            Clear All
          </button>
        </div>
      ) : null}

      {/* Batch Action Toolbar when rows are selected */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] px-3.5 py-2 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#251605]">
              {selected.length} {selected.length === 1 ? "company" : "companies"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-[#756A5B] hover:text-[#251605] underline font-medium"
            >
              Deselect all
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => statusMutation.mutate({ ids: selected, status: "active" })}
            >
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => statusMutation.mutate({ ids: selected, status: "inactive" })}
            >
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
              onClick={() => void runExport(selected)}
            >
              <Download className="mr-1 size-3 text-[#8A641A]" />
              Export Selected
            </Button>
          </div>
        </div>
      ) : null}

      {/* Directory Table View */}
      {listQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : listQuery.isError ? (
        <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-8 text-center">
          <p className="text-sm text-rose-700">
            {listQuery.error instanceof Error
              ? listQuery.error.message
              : "Companies could not be loaded."}
          </p>
          <Button
            className="mt-3 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
            variant="outline"
            size="sm"
            onClick={() => void listQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-10 text-center text-sm text-[#756A5B]">
          {search ? (
            <div>
              <p className="font-semibold text-[#251605]">
                No companies match &ldquo;{search}&rdquo;
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch("")}
                className="mt-3 border-[#DDD4C5] text-[#251605] bg-white hover:bg-[#F7F4EE]"
              >
                Clear search
              </Button>
            </div>
          ) : activeChips.length > 0 ? (
            <div>
              <p className="font-semibold text-[#251605]">No companies match active filters</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllFilters}
                className="mt-3 border-[#DDD4C5] text-[#251605] bg-white hover:bg-[#F7F4EE]"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-[#251605]">
                {types.filter((t) => t.active).length === 0 ? COMPANIES_NO_TYPES : COMPANIES_EMPTY}
              </p>
              {createGate.ok ? (
                <Button
                  size="sm"
                  className="mt-3 bg-[#8A641A] text-white hover:bg-[#725215]"
                  onClick={() =>
                    void navigate({
                      to: GUEST_PROFILE_DIRECTORY_PATH,
                      search: guestProfileSearch({ type: "company", create: "company" }),
                    })
                  }
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Register New Company
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          <table className="w-full min-w-[950px] text-xs text-left" data-testid="companies-table">
            <thead className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-left text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={items.length > 0 && items.every((row) => selected.includes(row.id))}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? items.map((row) => row.id) : [])
                    }
                    aria-label="Select all"
                  />
                </th>
                <th className="w-12 px-3 py-2.5">Logo</th>
                <th className="px-3 py-2.5">Company Name</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Primary Contact</th>
                <th className="px-3 py-2.5">Contact Details</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">Billing Terms</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-12 px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE9DF]/60">
              {items.map((row) => (
                <CompanyRow
                  key={row.id}
                  row={row}
                  checked={selected.includes(row.id)}
                  onCheck={(checked) =>
                    setSelected((current) =>
                      checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                    )
                  }
                  onView={() => openCompany(row.id)}
                  onQuickView={() => setPreviewCompanyId(row.id)}
                  onEdit={() => {
                    setEditId(row.id);
                    setCreditFocus(false);
                    setFormOpen(true);
                  }}
                  onCredit={() => {
                    setEditId(row.id);
                    setCreditFocus(true);
                    setFormOpen(true);
                  }}
                  onStatus={(next) => statusMutation.mutate({ ids: [row.id], status: next })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer matching Individual Guest Directory */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5]/60 pt-3 text-xs text-[#756A5B]">
        <p>
          Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of {total}{" "}
          companies
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(val) => setPageSize(Number(val) as typeof pageSize)}
          >
            <SelectTrigger className="w-24 h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {importPreview ? (
        <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-[#251605]">
          <p>{importPreview}</p>
        </div>
      ) : null}

      {pendingImport ? (
        <Button
          size="sm"
          className="bg-[#8A641A] text-white hover:bg-[#725215]"
          onClick={() => void confirmPendingImport()}
          data-testid="companies-import-confirm"
        >
          Confirm Import
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

      <GuestCompanyQuickViewDrawer
        restaurantId={restaurantId}
        companyId={previewCompanyId}
        onClose={() => setPreviewCompanyId(null)}
        onEditCompany={(id) => {
          setPreviewCompanyId(null);
          setEditId(id);
          setCreditFocus(false);
          setFormOpen(true);
        }}
      />
    </div>
  );
}

function CompanyRow({
  row,
  checked,
  onCheck,
  onView,
  onQuickView,
  onEdit,
  onCredit,
  onStatus,
}: {
  row: CompanyWorkspaceRow;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onView: () => void;
  onQuickView: () => void;
  onEdit: () => void;
  onCredit: () => void;
  onStatus: (status: "active" | "inactive") => void;
}) {
  return (
    <tr
      onClick={onQuickView}
      className={cn(
        "cursor-pointer transition-colors hover:bg-[#FAF8F5]/80",
        checked && "bg-[#F5EFE6]/60",
      )}
      data-testid={`company-row-${row.id}`}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(val) => onCheck(Boolean(val))}
          aria-label={`Select ${row.name}`}
        />
      </td>
      <td className="px-3 py-2.5">
        {row.logoUrl ? (
          <img
            src={row.logoUrl}
            alt=""
            className="size-8 rounded-lg object-cover border border-[#DDD4C5]"
          />
        ) : (
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#F4E9D0] text-xs font-semibold text-[#8A641A]">
            {row.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span
          className="font-semibold text-[#251605] hover:text-[#8A641A] hover:underline block truncate max-w-[200px]"
        >
          {row.name}
        </span>
        {row.code ? (
          <span className="font-mono text-[10px] text-[#756A5B] block">{row.code}</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center rounded-md border border-[#DDD4C5] bg-[#FAF8F5] px-2 py-0.5 text-[11px] font-medium text-[#251605]">
          {row.businessProfileTypeName ?? "Corporate"}
        </span>
        {row.businessProfileTypeId && !row.businessProfileTypeActive ? (
          <Badge variant="secondary" className="ml-1.5 text-[10px]">
            Inactive
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-[#251605] block">
          {row.primaryContactName || "—"}
        </span>
        {row.primaryContactTitle ? (
          <span className="text-[10px] text-[#756A5B] block">{row.primaryContactTitle}</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <div className="space-y-0.5">
          {row.phone ? <span className="block text-[#251605] font-mono text-[11px]">{row.phone}</span> : null}
          {row.email ? (
            <span className="block text-[#756A5B] truncate max-w-[150px]">{row.email}</span>
          ) : null}
          {!row.phone && !row.email ? <span className="text-[#8C827A]">—</span> : null}
        </div>
      </td>
      <td className="px-3 py-2.5 text-[#251605]">{row.country ?? "—"}</td>
      <td className="px-3 py-2.5">
        {row.creditAccountAllowed ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Credit Eligible
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">
            Direct Pay
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={row.accountStatus === "pending" ? "inactive" : row.accountStatus} />
        {row.accountStatus === "pending" ? (
          <span className="ml-1.5 text-[10px] text-amber-700 font-medium">Pending</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0 text-[#756A5B] hover:text-[#251605] hover:bg-[#F7F4EE]"
              aria-label="Actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 text-xs">
            <DropdownMenuItem onClick={onQuickView} className="cursor-pointer">
              Quick View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onView} className="cursor-pointer">
              <ExternalLink className="mr-1.5 size-3.5 text-[#8A641A]" />
              View Full Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
              <Pencil className="mr-1.5 size-3.5 text-[#8A641A]" />
              Edit Company
            </DropdownMenuItem>
            {row.creditAccountAllowed ? (
              <DropdownMenuItem onClick={onCredit} className="cursor-pointer">
                <CreditCard className="mr-1.5 size-3.5 text-[#8A641A]" />
                Manage Credit Account
              </DropdownMenuItem>
            ) : null}
            {row.accountStatus !== "active" ? (
              <DropdownMenuItem
                onClick={() => onStatus("active")}
                className="cursor-pointer text-emerald-700"
              >
                Activate Account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => onStatus("inactive")}
                className="cursor-pointer text-rose-700"
              >
                Deactivate Account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
