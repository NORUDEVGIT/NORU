import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Check,
  ChevronDown,
  Crown,
  Globe,
  List,
  RefreshCw,
  Repeat,
  UserCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import {
  GuestAllDirectory,
  GuestDirectoryWorkspace,
  GuestListingNewGuestMenu,
} from "@/packages/pms/components/workspaces/guest-directory-workspace";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  CONTACT_PROFILE_UNAVAILABLE,
  GUEST_IMPORT_UNAVAILABLE,
  PROFILE_TYPE_INACTIVE_SECTION_COPY,
  TOUR_OPERATOR_UNAVAILABLE,
  guestListingSection,
  invalidateGuestWorkspaceQueries,
  listingCreateAllowed,
  listingNavSections,
  listingTypeInactive,
  sectionToAccountType,
  type GuestListingSectionId,
} from "@/packages/pms/lib/guest-profile-listing";
import {
  getGuestWorkspaceStats,
  getGuestsAccess,
} from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

/** Light, almost-white page background used by the whole Guest Profiles section. */
const PAGE_BG = "bg-[#fbfbfb]";

/** Card surface shared by the KPI panel and the list panel. */
const PANEL =
  "rounded-[22px] border border-[#e9dfd0] bg-white p-5 shadow-[0_6px_20px_rgba(74,44,26,0.12)] sm:p-6";

/** Colour options for the "List of Guests" button (chosen in its dropdown). */
type ButtonTheme = "brown" | "gold" | "green";
const BUTTON_THEMES: Record<ButtonTheme, { label: string; bg: string; fg: string }> = {
  brown: { label: "Brown", bg: "#4a2c1a", fg: "#f5ead0" },
  gold: { label: "Gold", bg: "#c9a24a", fg: "#2b1a10" },
  green: { label: "Green", bg: "#436436", fg: "#ffffff" },
};

export function GuestListingWorkspace({
  membership,
  listingType,
  returnCard,
}: {
  membership: RestaurantMembership;
  listingType?: GuestProfileTypeId | GuestListingPlaceholderType;
  returnCard?: GuestProfileCardId | undefined;
  // Passed by GuestProfileWorkspace; accepted so the props type-check.
  directorySearch?: unknown;
  canCreate?: boolean;
  isTypeInactive?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const section = guestListingSection(listingType);
  const accountType = sectionToAccountType(section);
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchStats = useServerFn(getGuestWorkspaceStats);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [buttonTheme, setButtonTheme] = useState<ButtonTheme>("gold");
  // "All" shows every profile type on one page (local view, not a route type).
  const [viewAll, setViewAll] = useState(false);

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
  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] }),
        accessQuery.refetch(),
        statsQuery.refetch(),
        configQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  function selectSection(next: GuestListingSectionId) {
    setViewAll(false);
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: next }),
    });
  }

  /**
   * Opens the pop-up create form for a profile type (route search ?create=...).
   * GuestProfileWorkspace shows the matching form in a dialog over this list.
   */
  function startCreate(type: "individual" | "company" | "travel-agent" | "group") {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type, create: type }),
    });
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading guests…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6" data-testid="guest-profile-shell">
        <h1 className="font-display text-2xl">Guest Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners, managers and receptionists can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const stats = statsQuery.data;
  const config = configQuery.data;
  const canCreateIndividual = listingCreateAllowed("individual", config);
  const canCreateCompany = listingCreateAllowed("company", config);
  const canCreateAgency = listingCreateAllowed("travel-agent", config);
  const canCreateGroup = listingCreateAllowed("group", config);
  const sectionInactive = listingTypeInactive(section, config);

  const sectionDesc: Record<string, string> = {
    individual: "Individual guest identity and profile master records.",
    company: "Corporate account masters, billing terms and linked travelers.",
    "travel-agent": "Travel agency masters, IATA numbers and booking records.",
    group: "Group account masters, rooming rosters and event itineraries.",
    "tour-operator": TOUR_OPERATOR_UNAVAILABLE,
    contact: CONTACT_PROFILE_UNAVAILABLE,
  };
  // Extra counts are read defensively; add activeGuests / vipGuests / returningGuests
  // to getGuestWorkspaceStats if they are not returned yet (shows "—" until then).
  const counts = (stats ?? {}) as Record<string, number | null | undefined>;
  const kpis: { label: string; value: number | null | undefined; icon: LucideIcon; hint?: string }[] = [
    { label: "Total Guest Profiles", value: counts.totalProfiles, icon: Users },
    { label: "Active Guests", value: counts.activeGuests ?? counts.active, icon: UserCheck },
    { label: "VIP Guests", value: counts.vipGuests ?? counts.vip, icon: Crown },
    { label: "Returning Guests", value: counts.returningGuests ?? counts.returning, icon: Repeat },
  ];
  const sectionIcon: Record<string, LucideIcon> = {
    individual: User,
    company: Building2,
    "travel-agent": Globe,
    "tour-operator": Crown,
    contact: UserCheck,
    group: Users,
  };

  const navSections = listingNavSections().filter(
    (item) => item.id !== "tour-operator" && item.id !== "contact",
  );
  const currentTitle = viewAll
    ? "All"
    : (navSections.find((item) => item.id === section)?.title ?? "");
  const theme = BUTTON_THEMES[buttonTheme];

  return (
    <div className={cn("min-h-full w-full", PAGE_BG)}>
      <div
        className="mx-auto w-full max-w-[1600px] space-y-5 px-4 pb-8 pt-6 sm:px-6 sm:pt-8 lg:px-10"
        data-testid="guest-profile-shell"
      >
        {/* Page title */}
        <div className="px-1 sm:px-2">
          <h1 className="font-brand text-3xl font-bold tracking-tight">Guest Profiles</h1>
        </div>

        {/* KPI cards: white surface, gold border, brown text */}
        <section className={PANEL}>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="guest-workspace-stats">
            {kpis.map((k) => (
              <div
                key={k.label}
                title={k.hint}
                className="flex min-h-[104px] min-w-0 items-center justify-between gap-2 rounded-2xl bg-white p-4 text-[#4a2c1a] shadow-[0_3px_14px_rgba(74,44,26,0.14)]"
              >
                <div className="min-w-0">
                  <dd className="font-brand text-3xl font-bold leading-none text-[#4a2c1a]">
                    {k.value ?? 0}
                  </dd>
                  <dt className="mt-2 text-xs font-bold leading-tight text-[#4a2c1a]/80">
                    {k.label}
                  </dt>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#c9a24a] text-[#4a2c1a]">
                  <k.icon className="size-4" />
                </span>
              </div>
            ))}
          </dl>
        </section>

        {/* List panel */}
        <section className={PANEL}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {/* "List of Guests" title doubles as the profile-type dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid="guest-listing-nav"
                    aria-label="Choose guest category"
                    className="inline-flex flex-wrap items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a] focus-visible:ring-offset-4"
                  >
                    <span className="font-brand text-2xl font-bold tracking-tight">
                      List of Guests
                    </span>
                    <span
                      className="rounded-full border px-3 py-0.5 text-xs font-bold"
                      style={{ background: theme.bg, borderColor: theme.bg, color: theme.fg }}
                    >
                      {currentTitle}
                    </span>
                    <ChevronDown className="size-5" style={{ color: theme.bg }} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[230px] border-transparent bg-white shadow-[0_8px_28px_rgba(74,44,26,0.18)]"
                  style={{ "--gl-theme": theme.bg } as React.CSSProperties}
                >
                  <DropdownMenuItem
                    data-testid="guest-listing-nav-all"
                    onSelect={() => setViewAll(true)}
                    className="justify-between focus:bg-[color-mix(in_srgb,var(--gl-theme)_14%,transparent)]"
                    style={viewAll ? { background: theme.bg, color: theme.fg } : undefined}
                  >
                    <span className="flex items-center gap-2">
                      <List className="size-4" />
                      All
                    </span>
                    {viewAll ? <Check className="size-4" /> : null}
                  </DropdownMenuItem>
                  {navSections.map((item) => {
                    const active = !viewAll && item.id === section;
                    const inactive = listingTypeInactive(item.id, config);
                    const Icon = sectionIcon[item.id] ?? User;
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        data-testid={`guest-listing-nav-${item.id}`}
                        title={inactive ? PROFILE_TYPE_INACTIVE_SECTION_COPY : undefined}
                        onSelect={() => selectSection(item.id)}
                        className={cn(
                          "justify-between focus:bg-[color-mix(in_srgb,var(--gl-theme)_14%,transparent)]",
                          inactive && "text-muted-foreground",
                        )}
                        style={active ? { background: theme.bg, color: theme.fg } : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {item.title}
                        </span>
                        {active ? <Check className="size-4" /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  {/* Button theme: brown, gold or green */}
                  <div
                    className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"
                    role="group"
                    aria-label="Button theme"
                  >
                    <span className="flex-1">Button theme</span>
                    {(Object.keys(BUTTON_THEMES) as ButtonTheme[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        title={BUTTON_THEMES[key].label}
                        aria-label={BUTTON_THEMES[key].label}
                        aria-pressed={buttonTheme === key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setButtonTheme(key);
                        }}
                        className={cn(
                          "size-6 rounded-full border-2 border-white outline outline-1 outline-border",
                          buttonTheme === key && "outline-2 outline-foreground",
                        )}
                        style={{ background: BUTTON_THEMES[key].bg }}
                      />
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              {viewAll ? null : (
                <p className="mt-1 text-xs text-muted-foreground">{sectionDesc[section]}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Every option opens its create form as a pop-up over this list. */}
              <GuestListingNewGuestMenu
                onIndividual={() => startCreate("individual")}
                onCompany={() => startCreate("company")}
                onAgency={() => startCreate("travel-agent")}
                onGroup={() => startCreate("group")}
                canCreateIndividual={canCreateIndividual}
                canCreateCompany={canCreateCompany}
                canCreateAgency={canCreateAgency}
                canCreateGroup={canCreateGroup}
              />
              
            </div>
          </div>

          <div className="min-w-0">
            {viewAll ? <GuestAllDirectory membership={membership} returnCard={returnCard} /> : null}
            {viewAll ? null : sectionInactive ? (
              <p className="mb-4 text-sm text-muted-foreground" data-testid="guest-listing-inactive-copy">
                {PROFILE_TYPE_INACTIVE_SECTION_COPY}
              </p>
            ) : null}
            {viewAll ? null : accountType ? (
              <GuestAccountDirectory
                membership={membership}
                accountType={accountType}
                returnCard={returnCard}
                compact
              />
            ) : section === "tour-operator" ? (
              <PlaceholderCard title="Tour Operators" copy={TOUR_OPERATOR_UNAVAILABLE} />
            ) : section === "contact" ? (
              <PlaceholderCard title="Contacts" copy={CONTACT_PROFILE_UNAVAILABLE} />
            ) : (
              <GuestDirectoryWorkspace
                membership={membership}
                compact
                returnCard={returnCard}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PlaceholderCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-listing-placeholder">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}