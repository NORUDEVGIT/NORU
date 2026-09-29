import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import { GuestDirectoryWorkspace } from "@/packages/pms/components/workspaces/guest-directory-workspace";
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
  listingCreateAllowed,
  listingTypeInactive,
  sectionToAccountType,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestWorkspaceStats, getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestListingWorkspace({
  membership,
  listingType,
  returnCard,
  directorySearch,
  canCreate = true,
  isTypeInactive = false,
}: {
  membership: RestaurantMembership;
  listingType?: GuestProfileTypeId | GuestListingPlaceholderType;
  returnCard?: GuestProfileCardId | undefined;
  directorySearch?: GuestProfileSearch | undefined;
  canCreate?: boolean;
  isTypeInactive?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const section = guestListingSection(listingType);
  const accountType = sectionToAccountType(section);
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchStats = useServerFn(getGuestWorkspaceStats);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

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
  const config = configQuery.data;
  const canCreateCompany = listingCreateAllowed("company", config);
  const sectionInactive = listingTypeInactive(section, config);

  return (
    <div className="space-y-4" data-testid="guest-profile-shell">
      {/* Profile Portfolio (Compact cross-domain master counts strip) */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8E4DC] bg-[#FAF8F5] px-4 py-2.5 text-xs text-[#7A6B58]"
        data-testid="guest-workspace-stats"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-[#251605]">
            Profile Portfolio
          </span>
          <span className="text-[11px] text-[#7A6B58]">
            (Total Profiles:{" "}
            <strong className="font-medium text-[#251605]">{stats?.totalProfiles ?? "—"}</strong>)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-medium">
          <button
            type="button"
            onClick={() => selectSection("guests")}
            className={cn(
              "flex items-center gap-1.5 transition-colors hover:text-[#251605]",
              (section === "individual" || section === "guests") && "font-semibold text-[#251605]",
            )}
            title="Open Guests section"
          >
            <span>Guests</span>
            <span className="rounded-full border border-[#E8E4DC] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#251605]">
              {stats?.individuals ?? 0}
            </span>
          </button>
          <span className="text-[#D6D0C4]">|</span>
          <button
            type="button"
            onClick={() => selectSection("companies")}
            className={cn(
              "flex items-center gap-1.5 transition-colors hover:text-[#251605]",
              section === "company" && "font-semibold text-[#251605]",
            )}
            title="Open Companies section"
          >
            <span>Companies</span>
            <span className="rounded-full border border-[#E8E4DC] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#251605]">
              {stats?.companies ?? 0}
            </span>
          </button>
          <span className="text-[#D6D0C4]">|</span>
          <button
            type="button"
            onClick={() => selectSection("travel-agencies")}
            className={cn(
              "flex items-center gap-1.5 transition-colors hover:text-[#251605]",
              section === "travel-agent" && "font-semibold text-[#251605]",
            )}
            title="Open Travel Agencies section"
          >
            <span>Travel Agencies</span>
            <span className="rounded-full border border-[#E8E4DC] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#251605]">
              {stats?.travelAgents ?? 0}
            </span>
          </button>
          <span className="text-[#D6D0C4]">|</span>
          <button
            type="button"
            onClick={() => selectSection("groups")}
            className={cn(
              "flex items-center gap-1.5 transition-colors hover:text-[#251605]",
              section === "group" && "font-semibold text-[#251605]",
            )}
            title="Open Groups section"
          >
            <span>Groups</span>
            <span className="rounded-full border border-[#E8E4DC] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#251605]">
              {stats?.groups ?? 0}
            </span>
          </button>
        </div>
      </div>

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
            searchParams={directorySearch}
            canCreate={canCreate}
            isTypeInactive={isTypeInactive}
          />
        )}
      </div>
    </div>
  );
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
