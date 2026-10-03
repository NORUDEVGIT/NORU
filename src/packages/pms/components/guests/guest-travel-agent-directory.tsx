import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Search,
  X,
} from "lucide-react";

import { GuestTravelAgentQuickViewDrawer } from "@/packages/pms/components/guests/guest-travel-agent-quick-view-drawer";
import { GuestTravelAgentFormDialog } from "@/packages/pms/components/guests/guest-travel-agent-form-dialog";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  AGENCY_TYPE_LABELS,
  AGENCY_TYPES,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import {
  GUEST_ACCOUNT_STATUSES,
  accountListItems,
  accountTypeToProfileType,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  listingCreateAllowed,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { getTravelAgentWorkspaceSummary } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
import { Button } from "@/shared/components/ui/button";
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

const ALL = "all";

function TravelAgentKpiCard({
  label,
  value,
  hint,
  loading,
  icon,
  tone,
}: {
  label: string;
  value?: number | null | undefined;
  hint?: string | undefined;
  loading?: boolean | undefined;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 shadow-sm text-left"
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
    </div>
  );
}

export function GuestTravelAgentDirectory({
  membership,
  returnCard,
}: {
  membership: RestaurantMembership;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchSummary = useServerFn(getTravelAgentWorkspaceSummary);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [agencyType, setAgencyType] = useState<string>(ALL);
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof LISTING_PAGE_SIZES)[number]>(
    LISTING_DEFAULT_PAGE_SIZE,
  );

  const [quickViewAgencyId, setQuickViewAgencyId] = useState<string | null>(null);
  const [editAgencyId, setEditAgencyId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status, agencyType, country, pageSize]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  const summaryQuery = useQuery({
    queryKey: ["travel-agent-workspace-summary", restaurantId],
    queryFn: () => fetchSummary({ data: { restaurantId } }),
    enabled: canManage,
    staleTime: 60_000,
  });

  const offset = page * pageSize;
  const accountsQuery = useQuery({
    queryKey: [
      "travel-agent-accounts",
      restaurantId,
      debouncedSearch,
      status,
      agencyType,
      country,
      pageSize,
      offset,
    ],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: "travel_agent",
          search: debouncedSearch.trim() || undefined,
          limit: pageSize,
          offset,
          ...(status !== ALL ? { status: status as (typeof GUEST_ACCOUNT_STATUSES)[number] } : {}),
          ...(agencyType !== ALL ? { agencyType: agencyType as (typeof AGENCY_TYPES)[number] } : {}),
          ...(country.trim() ? { country: country.trim() } : {}),
        },
      }),
    enabled: canManage,
    retry: false,
  });

  function openAgency(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ card: returnCard, type: "travel-agent", nav: "overview" }),
    });
  }

  function handleCreateBooking(id: string) {
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { create: "new", travelAgentId: id },
    });
  }

  function handleRegisterNew() {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: "travel-agent", create: "travel-agent" }),
    });
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus(ALL);
    setAgencyType(ALL);
    setCountry("");
    setPage(0);
  }

  if (accessQuery.isLoading) {
    return <p className="text-sm text-[#756A5B]">Loading travel agencies…</p>;
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-[#DDD4C5] bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold text-[#251605]">Travel Agencies</h2>
        <p className="mt-2 text-sm text-[#756A5B]">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const pageData = accountsQuery.data;
  const accounts = accountListItems(pageData);
  const total = pageData && !Array.isArray(pageData) ? pageData.total : accounts.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canCreate = listingCreateAllowed("travel_agent", configQuery.data);

  const agencyIdsWithActivePlans = new Set(summaryQuery.data?.agencyIdsWithActivePlans ?? []);

  return (
    <div className="space-y-5" data-testid="guest-travel-agent-directory">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#251605]">Travel Agencies</h2>
          <p className="text-xs text-[#756A5B] mt-0.5">
            Operational workspace for travel agencies, OTAs, commercial commission plans and booking channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
            disabled={!canCreate}
            onClick={handleRegisterNew}
            data-testid="travel-agent-register-new"
          >
            <Plus className="mr-1.5 size-4" />
            Register New Travel Agency
          </Button>
        </div>
      </div>

      {/* KPI Summary Band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TravelAgentKpiCard
          label="Total Agencies"
          value={summaryQuery.data?.total}
          loading={summaryQuery.isLoading}
          icon={<Building2 className="size-4" />}
          tone="bg-[#F4E9D0] text-[#8A641A]"
        />
        <TravelAgentKpiCard
          label="Active"
          value={summaryQuery.data?.active}
          loading={summaryQuery.isLoading}
          icon={<CheckCircle2 className="size-4" />}
          tone="bg-emerald-50 text-emerald-700"
        />
        <TravelAgentKpiCard
          label="Inactive"
          value={summaryQuery.data?.inactive}
          loading={summaryQuery.isLoading}
          icon={<Building2 className="size-4" />}
          tone="bg-stone-100 text-stone-600"
        />
        <TravelAgentKpiCard
          label="Commission Configured"
          hint="Active plans"
          value={summaryQuery.data?.commissionConfigured}
          loading={summaryQuery.isLoading}
          icon={<Percent className="size-4" />}
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agency name, code, contact, phone, email, IATA…"
            className="h-9 pl-9 border-[#DDD4C5] text-xs bg-[#FAF8F5]"
            data-testid="travel-agent-search"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select value={agencyType} onValueChange={setAgencyType}>
          <SelectTrigger className="h-9 w-36 border-[#DDD4C5] text-xs bg-white" data-testid="travel-agent-type-filter">
            <SelectValue placeholder="Agency Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">All Types</SelectItem>
            {AGENCY_TYPES.map((type) => (
              <SelectItem key={type} value={type} className="text-xs">
                {AGENCY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-32 border-[#DDD4C5] text-xs bg-white" data-testid="travel-agent-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">All Statuses</SelectItem>
            <SelectItem value="active" className="text-xs">Active</SelectItem>
            <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={country || ALL} onValueChange={(val) => setCountry(val === ALL ? "" : val)}>
          <SelectTrigger className="h-9 w-40 border-[#DDD4C5] text-xs bg-white">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={ALL} className="text-xs">All Countries</SelectItem>
            {ISO_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.name} className="text-xs">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || status !== ALL || agencyType !== ALL || country) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs text-[#756A5B] hover:text-[#251605]"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Dense Table */}
      <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="travel-agent-table">
            <thead>
              <tr className="border-b border-[#DDD4C5] bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] uppercase tracking-wider">
                <th className="px-3.5 py-2.5">Agency</th>
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">Agency Type</th>
                <th className="px-3 py-2.5">Primary Contact</th>
                <th className="px-3 py-2.5">Phone / Email</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">IATA / License</th>
                <th className="px-3 py-2.5">Commission</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EAE1]">
              {accountsQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3.5 py-3" colSpan={10}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-[#8C827A] italic">
                    {debouncedSearch || status !== ALL || agencyType !== ALL || country
                      ? "No travel agencies match these filters."
                      : "No travel agencies registered yet."}
                  </td>
                </tr>
              ) : (
                accounts.map((row) => {
                  const hasCommission = agencyIdsWithActivePlans.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setQuickViewAgencyId(row.id)}
                      className="cursor-pointer transition-colors hover:bg-[#FAF8F5]/80"
                      data-testid={`travel-agent-row-${row.id}`}
                    >
                      <td className="px-3.5 py-2.5 font-medium text-[#251605]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#251605]">{row.name}</span>
                          {row.tradeName && (
                            <span className="text-[11px] text-[#756A5B]">({row.tradeName})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#8A641A]">
                        {row.code ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.agencyType ? (
                          <span className="inline-flex items-center rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-medium text-[#8A641A] uppercase">
                            {row.agencyType}
                          </span>
                        ) : (
                          <span className="text-[#8C827A]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#251605]">
                        {row.primaryContactName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[#756A5B]">
                        <div>{row.phone ?? "—"}</div>
                        {row.email && <div className="text-[11px] text-[#8C827A]">{row.email}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-[#251605]">
                        {row.country ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#52483E]">
                        {row.iataLicenseNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {hasCommission ? (
                          <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2 py-0.5 text-[10px] font-medium text-[#2E7D32]">
                            Configured
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-medium text-[#756A5B]">
                            Not Configured
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.accountStatus} />
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
                              data-testid={`travel-agent-actions-${row.id}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => setQuickViewAgencyId(row.id)}>
                              Quick View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAgency(row.id)}>
                              <ExternalLink className="mr-2 size-3.5" />
                              Full Workspace
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateBooking(row.id)}>
                              <CalendarPlus className="mr-2 size-3.5" />
                              New Booking
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditAgencyId(row.id)}>
                              <Pencil className="mr-2 size-3.5" />
                              Edit Agency
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#DDD4C5] bg-[#FAF8F5] px-4 py-2.5 text-xs text-[#756A5B]">
          <div>
            Showing {accounts.length > 0 ? offset + 1 : 0}–{Math.min(offset + pageSize, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(val) => setPageSize(Number(val) as (typeof LISTING_PAGE_SIZES)[number])}
            >
              <SelectTrigger className="h-7 w-20 border-[#DDD4C5] text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)} className="text-xs">
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-7 border-[#DDD4C5] text-xs px-2.5"
            >
              Previous
            </Button>
            <span className="text-[11px]">
              Page {page + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 border-[#DDD4C5] text-xs px-2.5"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Quick View Drawer */}
      <GuestTravelAgentQuickViewDrawer
        restaurantId={restaurantId}
        agencyId={quickViewAgencyId}
        onClose={() => setQuickViewAgencyId(null)}
        onEditAgency={(id) => {
          setQuickViewAgencyId(null);
          setEditAgencyId(id);
        }}
      />

      {/* Focused Edit Dialog */}
      <GuestTravelAgentFormDialog
        restaurantId={restaurantId}
        agencyId={editAgencyId ?? undefined}
        open={Boolean(editAgencyId)}
        onOpenChange={(open) => {
          if (!open) setEditAgencyId(null);
        }}
        onSaved={() => {
          setEditAgencyId(null);
          void queryClient.invalidateQueries({ queryKey: ["travel-agent-accounts"] });
          void queryClient.invalidateQueries({ queryKey: ["travel-agent-workspace-summary"] });
        }}
      />
    </div>
  );
}
