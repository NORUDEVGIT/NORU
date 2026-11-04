import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Crown, Menu, Plane, RefreshCw, RotateCcw, UserCheck, Users } from "lucide-react";

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
import { getGuestDirectoryStats, getGuestWorkspaceStats, getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

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
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchStats = useServerFn(getGuestWorkspaceStats);
  const fetchDirectoryStats = useServerFn(getGuestDirectoryStats);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);
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
  const canManage = accessQuery.data?.canManage ?? false;
  const statsQuery = useQuery({
    queryKey: ["guest-workspace-stats", restaurantId],
    queryFn: () => fetchStats({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const directoryStatsQuery = useQuery({
    queryKey: ["guest-directory-stats", restaurantId],
    queryFn: () => fetchDirectoryStats({ data: { restaurantId } }),
    enabled: canManage,
    staleTime: 60_000,
  });
  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
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

  if (accessQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (!canManage) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6"
        data-testid="guest-profile-shell"
      >
        <h2 className="font-display text-xl">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners, managers and receptionists can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const stats = statsQuery.data;
  const guestStats = directoryStatsQuery.data;
  const config = configQuery.data;
  const sectionInactive = listingTypeInactive(section, config);
  const activeSection = workspaceSectionForListing(section);
  const kpiLoading = statsQuery.isLoading || directoryStatsQuery.isLoading;

  return (
    <GuestProfileShellProvider value={shellSlots}>
      <div className="space-y-3" data-testid="guest-profile-shell">
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Guest profile KPIs"
          data-testid="guest-workspace-kpis"
        >
          <GuestKpiCard
            label="Total Guests"
            value={guestStats?.totalGuests}
            loading={kpiLoading}
            icon={<Users className="size-4" />}
            tone="bg-[#F4E9D0] text-[#8A641A]"
          />
          <GuestKpiCard
            label="Active Guests"
            value={guestStats?.activeGuests}
            loading={kpiLoading}
            icon={<UserCheck className="size-4" />}
            tone="bg-emerald-50 text-emerald-700"
          />
          <GuestKpiCard
            label="VIP Guests"
            value={guestStats?.vipGuests}
            loading={kpiLoading}
            icon={<Crown className="size-4" />}
            tone="bg-amber-50 text-amber-700"
          />
          <GuestKpiCard
            label="Returning Guests"
            value={guestStats?.returningGuests}
            loading={kpiLoading}
            icon={<RotateCcw className="size-4" />}
            tone="bg-blue-50 text-blue-700"
          />
          <GuestKpiCard
            label="Companies"
            value={stats?.companies}
            loading={kpiLoading}
            icon={<Building2 className="size-4" />}
            tone="bg-stone-100 text-stone-700"
          />
          <GuestKpiCard
            label="Travel Agencies"
            value={stats?.travelAgents}
            loading={kpiLoading}
            icon={<Plane className="size-4" />}
            tone="bg-indigo-50 text-indigo-700"
          />
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
}: {
  label: string;
  value?: number | null | undefined;
  loading: boolean;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm">
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
    </div>
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
}: {
  active: GuestWorkspaceSectionId;
  toolbarSlot: HTMLElement | null;
  onSelect: (section: GuestWorkspaceSectionId) => void;
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
            {GUEST_WORKSPACE_SECTIONS.map((item) => {
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
