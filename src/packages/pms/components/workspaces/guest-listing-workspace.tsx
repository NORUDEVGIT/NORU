import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CreditCard,
  Crown,
  DoorOpen,
  Layers,
  Menu,
  Percent,
  Plane,
  RefreshCw,
  RotateCcw,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import {
  GuestProfileShellProvider,
  type GuestProfileShellSlots,
} from "@/packages/pms/components/guests/guest-profile-shell-slots";
import { GuestDirectoryWorkspace } from "@/packages/pms/components/workspaces/guest-directory-workspace";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { GUEST_WORKSPACE_SECTIONS, type GuestWorkspaceSectionId } from "@/packages/pms/lib/guest-profile-domains";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileSearch,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  CONTACT_PROFILE_UNAVAILABLE,
  PROFILE_TYPE_INACTIVE_SECTION_COPY,
  TOUR_OPERATOR_UNAVAILABLE,
  guestListingSection,
  listingTypeInactive,
  sectionToAccountType,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestDirectoryStats } from "@/packages/pms/lib/guests.functions";
import { listCompanyWorkspace } from "@/packages/pms/lib/guest-companies.functions";
import { getTravelAgentWorkspaceSummary } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import type { GuestAccountStatus } from "@/packages/pms/lib/guest-profile-wave4";
import { getGuestWorkspaceAccess } from "@/packages/pms/lib/guest-workspace-access.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { pmsPropertyOwnerRole } from "@/packages/pms/lib/pms-client-access";

export function GuestListingWorkspace({
  membership,
  listingType,
  returnCard,
  directorySearch,
  canCreate = true,
  isTypeInactive = false,
  onRefresh,
  isRefreshing = false,
  primaryAction,
}: {
  membership: RestaurantMembership;
  listingType?: GuestProfileTypeId | GuestListingPlaceholderType;
  returnCard?: GuestProfileCardId | undefined;
  directorySearch?: GuestProfileSearch | undefined;
  canCreate?: boolean;
  isTypeInactive?: boolean;
  onRefresh?: (() => void) | undefined;
  isRefreshing?: boolean | undefined;
  primaryAction?: ReactNode | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const section = guestListingSection(listingType);
  const accountType = sectionToAccountType(section);
  const fetchAccess = useServerFn(getGuestWorkspaceAccess);
  const fetchDirectoryStats = useServerFn(getGuestDirectoryStats);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);
  const fetchCompanies = useServerFn(listCompanyWorkspace);
  const fetchAgencySummary = useServerFn(getTravelAgentWorkspaceSummary);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const [companyStatus, setCompanyStatus] = useState<"all" | GuestAccountStatus>("all");
  const [companyCredit, setCompanyCredit] = useState<"all" | "yes" | "no">("all");
  const [agencyStatus, setAgencyStatus] = useState<"all" | GuestAccountStatus>("all");
  const [groupStatus, setGroupStatus] = useState<"all" | GuestAccountStatus>("all");
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [shellSlots, setShellSlots] = useState<GuestProfileShellSlots>({
    search: null,
    filter: null,
    export: null,
  });
  const setSearchSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.search === node ? current : { ...current, search: node }));
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setExportSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.export === node ? current : { ...current, export: node }));
  }, []);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const ownerBypass =
    pmsPropertyOwnerRole(membership.role) || Boolean(accessQuery.data?.isOwner);
  const canView = ownerBypass || (accessQuery.data?.canView ?? false);
  const canViewProfiles = ownerBypass || (accessQuery.data?.canViewProfiles ?? false);
  const canViewAccounts = ownerBypass || (accessQuery.data?.canViewAccounts ?? false);
  const commercialSection = Boolean(accountType);
  const canViewSection = commercialSection ? canViewAccounts : canViewProfiles;
  const navSections = GUEST_WORKSPACE_SECTIONS.filter((item) =>
    item.accountType ? canViewAccounts : canViewProfiles,
  );
  const directoryStatsQuery = useQuery({
    queryKey: ["guest-directory-stats", restaurantId],
    queryFn: () => fetchDirectoryStats({ data: { restaurantId } }),
    enabled: canViewProfiles,
    staleTime: 60_000,
  });
  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canView,
    retry: false,
  });
  const companyKpiQuery = useQuery({
    queryKey: ["company-workspace-kpis", restaurantId],
    queryFn: () => fetchCompanies({ data: { restaurantId, status: "all", credit: "all", limit: 1, offset: 0 } }),
    enabled: canViewAccounts && accountType === "company",
    staleTime: 60_000,
  });
  const agencySummaryQuery = useQuery({
    queryKey: ["travel-agent-workspace-summary", restaurantId],
    queryFn: () => fetchAgencySummary({ data: { restaurantId } }),
    enabled: canViewAccounts && accountType === "travel_agent",
    staleTime: 60_000,
  });
  const groupKpiQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, "group", "section-kpis"],
    queryFn: async () => {
      const [allRes, pendingRes, activeRes, inactiveRes] = await Promise.all([
        fetchAccounts({ data: { restaurantId, accountType: "group", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "pending", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "active", limit: 1, offset: 0 } }),
        fetchAccounts({ data: { restaurantId, accountType: "group", status: "inactive", limit: 1, offset: 0 } }),
      ]);
      return {
        total: allRes.total,
        pending: pendingRes.total,
        active: activeRes.total,
        inactive: inactiveRes.total,
      };
    },
    enabled: canViewAccounts && accountType === "group",
    staleTime: 30_000,
  });
  const groupMembersQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, "group", "member-total"],
    queryFn: () =>
      fetchAccounts({ data: { restaurantId, accountType: "group", limit: 200, offset: 0 } }),
    enabled: canViewAccounts && accountType === "group",
    staleTime: 30_000,
  });

  function selectSection(nextSection: "guests" | "companies" | "travel-agencies" | "groups") {
    const domain =
      nextSection === "guests"
        ? "individual"
        : nextSection === "companies"
          ? "company"
          : nextSection === "travel-agencies"
            ? "travel-agent"
            : "group";
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({
        section: nextSection,
        type: domain,
      }),
    });
  }

  function openGuestFilter(filters: {
    status?: "active" | "inactive";
    vip?: "vip" | "non-vip";
    sort?: "last_stay";
  }) {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({
        section: "guests",
        type: "individual",
        status: filters.status,
        vip: filters.vip,
        sort: filters.sort,
      }),
    });
  }

  if (accessQuery.isLoading && !ownerBypass)
    return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (accessQuery.isError && !ownerBypass) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="guest-profile-shell">
        <h2 className="font-display text-xl">Access could not be checked</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Guest permissions did not load. Refresh the page and try again.
        </p>
      </div>
    );
  }
  if (!canView) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6"
        data-testid="guest-profile-shell"
      >
        <h2 className="font-display text-xl">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to open the guest workspace for this property.
        </p>
      </div>
    );
  }

  if (!canViewSection) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6"
        data-testid="guest-profile-shell"
      >
        <h2 className="font-display text-xl">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {commercialSection
            ? "You don't have permission to view commercial accounts for this property."
            : "You don't have permission to view guest profiles for this property."}
        </p>
      </div>
    );
  }

  const guestStats = directoryStatsQuery.data;
  const config = configQuery.data;
  const sectionInactive = listingTypeInactive(section, config);
  const activeSection = workspaceSectionForListing(section);
  const companyKpis = companyKpiQuery.data?.kpis;
  const agencySummary = agencySummaryQuery.data;
  const groupKpis = groupKpiQuery.data;
  const memberPage = groupMembersQuery.data;
  const totalMembers =
    memberPage && memberPage.total <= memberPage.items.length
      ? memberPage.items.reduce((sum, row) => sum + (row.memberCount ?? 0), 0)
      : null;
  const kpiLoading =
    activeSection === "guests"
      ? directoryStatsQuery.isLoading
      : activeSection === "companies"
        ? companyKpiQuery.isLoading
        : activeSection === "travel-agencies"
          ? agencySummaryQuery.isLoading
          : groupKpiQuery.isLoading || groupMembersQuery.isLoading || configQuery.isLoading;

  return (
    <GuestProfileShellProvider value={shellSlots}>
      <div className="space-y-3" data-testid="guest-profile-shell">
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Guest profile KPIs"
          data-testid="guest-workspace-kpis"
        >
          {activeSection === "companies" ? (
            <>
              <GuestKpiCard label="Total Companies" value={companyKpis?.total} loading={kpiLoading} icon={<Building2 className="size-4" />} tone="bg-[#F4E9D0] text-[#8A641A]" active={companyStatus === "all" && companyCredit === "all"} onClick={() => { setCompanyStatus("all"); setCompanyCredit("all"); }} />
              <GuestKpiCard label="Active Companies" value={companyKpis?.active} loading={kpiLoading} icon={<UserCheck className="size-4" />} tone="bg-emerald-50 text-emerald-700" active={companyStatus === "active"} onClick={() => setCompanyStatus(companyStatus === "active" ? "all" : "active")} />
              <GuestKpiCard label="Inactive Companies" value={companyKpis?.inactive} loading={kpiLoading} icon={<UserMinus className="size-4" />} tone="bg-stone-100 text-stone-600" active={companyStatus === "inactive"} onClick={() => setCompanyStatus(companyStatus === "inactive" ? "all" : "inactive")} />
              <GuestKpiCard label="Credit Accounts" value={companyKpis?.credit} loading={kpiLoading} icon={<CreditCard className="size-4" />} tone="bg-amber-50 text-amber-700" active={companyCredit === "yes"} onClick={() => setCompanyCredit(companyCredit === "yes" ? "all" : "yes")} />
              <GuestKpiCard label="Pending Companies" value={companyKpis ? Math.max(0, companyKpis.total - companyKpis.active - companyKpis.inactive) : undefined} loading={kpiLoading} icon={<RotateCcw className="size-4" />} tone="bg-amber-50 text-amber-700" active={companyStatus === "pending"} onClick={() => setCompanyStatus(companyStatus === "pending" ? "all" : "pending")} />
              <GuestKpiCard label="Direct Pay" value={companyKpis ? Math.max(0, companyKpis.total - companyKpis.credit) : undefined} loading={kpiLoading} icon={<Building2 className="size-4" />} tone="bg-stone-100 text-stone-700" active={companyCredit === "no"} onClick={() => setCompanyCredit(companyCredit === "no" ? "all" : "no")} />
            </>
          ) : activeSection === "travel-agencies" ? (
            <>
              <GuestKpiCard label="Total Agencies" value={agencySummary?.total} loading={kpiLoading} icon={<Plane className="size-4" />} tone="bg-[#F4E9D0] text-[#8A641A]" active={agencyStatus === "all"} onClick={() => setAgencyStatus("all")} />
              <GuestKpiCard label="Active Agencies" value={agencySummary?.active} loading={kpiLoading} icon={<UserCheck className="size-4" />} tone="bg-emerald-50 text-emerald-700" active={agencyStatus === "active"} onClick={() => setAgencyStatus(agencyStatus === "active" ? "all" : "active")} />
              <GuestKpiCard label="Inactive Agencies" value={agencySummary?.inactive} loading={kpiLoading} icon={<UserMinus className="size-4" />} tone="bg-stone-100 text-stone-600" active={agencyStatus === "inactive"} onClick={() => setAgencyStatus(agencyStatus === "inactive" ? "all" : "inactive")} />
              <GuestKpiCard label="Commission Configured" value={agencySummary?.commissionConfigured} loading={kpiLoading} icon={<Percent className="size-4" />} tone="bg-amber-50 text-amber-700" />
              <GuestKpiCard label="Pending Agencies" value={agencySummary ? Math.max(0, agencySummary.total - agencySummary.active - agencySummary.inactive) : undefined} loading={kpiLoading} icon={<RotateCcw className="size-4" />} tone="bg-amber-50 text-amber-700" active={agencyStatus === "pending"} onClick={() => setAgencyStatus(agencyStatus === "pending" ? "all" : "pending")} />
              <GuestKpiCard label="Commission Not Set" value={agencySummary ? Math.max(0, agencySummary.total - agencySummary.commissionConfigured) : undefined} loading={kpiLoading} icon={<Percent className="size-4" />} tone="bg-stone-100 text-stone-600" />
            </>
          ) : activeSection === "groups" ? (
            <>
              <GuestKpiCard label="Total Groups" value={groupKpis?.total} loading={kpiLoading} icon={<Users className="size-4" />} tone="bg-[#F4E9D0] text-[#8A641A]" active={groupStatus === "all"} onClick={() => setGroupStatus("all")} />
              <GuestKpiCard label="Active Groups" value={groupKpis?.active} loading={kpiLoading} icon={<UserCheck className="size-4" />} tone="bg-emerald-50 text-emerald-700" active={groupStatus === "active"} onClick={() => setGroupStatus(groupStatus === "active" ? "all" : "active")} />
              <GuestKpiCard label="Pending Groups" value={groupKpis?.pending} loading={kpiLoading} icon={<RotateCcw className="size-4" />} tone="bg-amber-50 text-amber-700" active={groupStatus === "pending"} onClick={() => setGroupStatus(groupStatus === "pending" ? "all" : "pending")} />
              <GuestKpiCard label="Inactive Groups" value={groupKpis?.inactive} loading={kpiLoading} icon={<UserMinus className="size-4" />} tone="bg-stone-100 text-stone-600" active={groupStatus === "inactive"} onClick={() => setGroupStatus(groupStatus === "inactive" ? "all" : "inactive")} />
              <GuestKpiCard label="Total Members" value={totalMembers} loading={groupMembersQuery.isLoading} icon={<Users className="size-4" />} tone="bg-[#F7F4EE] text-[#8A641A]" />
              <GuestKpiCard label="Group Types" value={configQuery.data?.groupTypes.length} loading={configQuery.isLoading} icon={<Layers className="size-4" />} tone="bg-stone-100 text-stone-700" />
            </>
          ) : (
            <>
              <GuestKpiCard label="Total Guests" value={guestStats?.totalGuests} loading={kpiLoading} icon={<Users className="size-4" />} tone="bg-[#F4E9D0] text-[#8A641A]" active={!directorySearch?.status && !directorySearch?.vip} onClick={() => openGuestFilter({})} />
              <GuestKpiCard label="Active Guests" value={guestStats?.activeGuests} loading={kpiLoading} icon={<UserCheck className="size-4" />} tone="bg-emerald-50 text-emerald-700" active={directorySearch?.status === "active"} onClick={() => openGuestFilter({ status: "active" })} />
              <GuestKpiCard label="VIP Guests" value={guestStats?.vipGuests} loading={kpiLoading} icon={<Crown className="size-4" />} tone="bg-amber-50 text-amber-700" active={directorySearch?.vip === "vip"} onClick={() => openGuestFilter({ vip: "vip" })} />
              <GuestKpiCard label="Returning Guests" value={guestStats?.returningGuests} loading={kpiLoading} icon={<RotateCcw className="size-4" />} tone="bg-blue-50 text-blue-700" />
              <GuestKpiCard label="In-House Guests" value={guestStats?.inHouseGuests} loading={kpiLoading} icon={<DoorOpen className="size-4" />} tone="bg-emerald-50 text-emerald-700" />
              <GuestKpiCard label="Inactive Guests" value={guestStats ? Math.max(0, guestStats.totalGuests - guestStats.activeGuests) : undefined} loading={kpiLoading} icon={<UserMinus className="size-4" />} tone="bg-stone-100 text-stone-600" active={directorySearch?.status === "inactive"} onClick={() => openGuestFilter({ status: "inactive" })} />
            </>
          )}
        </section>

        <section
          ref={setToolbarSlot}
          className="relative flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white py-1.5 pl-12 pr-2 shadow-sm"
          data-testid="guest-profile-toolbar"
        >
          <GuestProfileBurger
            active={activeSection}
            toolbarSlot={toolbarSlot}
            onSelect={selectSection}
            sections={navSections}
          />
          <div ref={setSearchSlot} className="min-w-0 flex-1 overflow-hidden" />
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            <div ref={setFilterSlot} className="shrink-0" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={SHELL_ICON_BUTTON}
              onClick={() => onRefresh?.()}
              disabled={!onRefresh || isRefreshing}
              aria-label="Refresh"
              title="Refresh"
              data-testid="guest-profile-refresh"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            </Button>
            <div ref={setExportSlot} className="shrink-0 empty:hidden" />
            {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
          </div>
        </section>

        <div className="min-w-0">
          {sectionInactive ? (
            <p
              className="mb-4 text-sm text-muted-foreground"
              data-testid="guest-listing-inactive-copy"
            >
              {PROFILE_TYPE_INACTIVE_SECTION_COPY}
            </p>
          ) : null}
          {accountType ? (
            <GuestAccountDirectory
              membership={membership}
              accountType={accountType}
              returnCard={returnCard}
              embedded
              companyStatus={companyStatus}
              companyCredit={companyCredit}
              onCompanyStatus={setCompanyStatus}
              onCompanyCredit={setCompanyCredit}
              agencyStatus={agencyStatus}
              onAgencyStatus={setAgencyStatus}
              groupStatus={groupStatus}
              onGroupStatus={setGroupStatus}
            />
          ) : section === "tour-operator" ? (
            <PlaceholderCard title="Tour Operators" copy={TOUR_OPERATOR_UNAVAILABLE} />
          ) : section === "contact" ? (
            <PlaceholderCard title="Contacts" copy={CONTACT_PROFILE_UNAVAILABLE} />
          ) : (
            <GuestDirectoryWorkspace
              membership={membership}
              compact
              embedded
              returnCard={returnCard}
              searchParams={directorySearch}
              canCreate={canCreate}
              isTypeInactive={isTypeInactive}
            />
          )}
        </div>
      </div>
    </GuestProfileShellProvider>
  );
}

function workspaceSectionForListing(section: string): GuestWorkspaceSectionId {
  if (section === "company") return "companies";
  if (section === "travel-agent") return "travel-agencies";
  if (section === "group") return "groups";
  return "guests";
}

function GuestKpiCard({
  label,
  value,
  loading,
  icon,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value?: number | null | undefined;
  loading: boolean;
  icon: ReactNode;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm",
    onClick && "transition-colors hover:bg-[#FBF7F1]",
    active ? "border-[#C89933]" : "border-[#DDD4C5]",
  );
  const body = (
    <>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-10" />
        ) : (
          <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
            {value != null ? value.toLocaleString() : "—"}
          </p>
        )}
      </div>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {body}
    </button>
  );
}

const GUEST_BURGER_ICONS = {
  guests: Users,
  companies: Building2,
  "travel-agencies": Plane,
  groups: Users,
} as const;

function GuestProfileBurger({
  active,
  toolbarSlot,
  onSelect,
  sections = GUEST_WORKSPACE_SECTIONS,
}: {
  active: GuestWorkspaceSectionId;
  toolbarSlot: HTMLElement | null;
  onSelect: (section: GuestWorkspaceSectionId) => void;
  sections?: typeof GUEST_WORKSPACE_SECTIONS;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <div
      className={cn(
        "pointer-events-none z-30",
        toolbarSlot ? "absolute left-1 top-1/2 -translate-y-1/2" : "absolute top-3 left-3",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Guest Profile navigation"
            title="Guest Profile navigation"
            data-testid="guest-profile-nav-trigger"
            className={cn(
              "pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
              "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
              "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
            )}
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="pointer-events-auto w-64 p-1.5"
          data-testid="guest-profile-workspace-nav"
          aria-label="Guest Profile"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Guest Profile
          </p>
          <div className="flex flex-col gap-0.5">
            {sections.map((item) => {
              const Icon = GUEST_BURGER_ICONS[item.id];
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`guest-nav-section-${item.id}`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.id);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-[#F4E9D0] font-medium text-[#251605]"
                      : "text-foreground hover:bg-[#F7F4EE]",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                  <span className="flex-1">{item.title}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  return toolbarSlot ? createPortal(trigger, toolbarSlot) : trigger;
}

function PlaceholderCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card p-6"
      data-testid="guest-listing-placeholder"
    >
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
