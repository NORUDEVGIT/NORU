import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Upload } from "lucide-react";

import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import { GuestGroupTemplatesDialog } from "@/packages/pms/components/guests/guest-group-templates-dialog";
import {
  GuestDirectoryWorkspace,
  GuestListingNewGuestMenu,
} from "@/packages/pms/components/workspaces/guest-directory-workspace";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileSearch,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  AGENCIES_STAT_COPY,
  CONTACTS_STAT_COPY,
  CONTACT_PROFILE_UNAVAILABLE,
  GUEST_IMPORT_UNAVAILABLE,
  PROFILE_TYPE_CREATE_BLOCKED,
  PROFILE_TYPE_INACTIVE_SECTION_COPY,
  TOUR_OPERATOR_UNAVAILABLE,
  guestListingSection,
  listingCreateAllowed,
  listingNavSections,
  listingTypeInactive,
  sectionToAccountType,
  type GuestListingSectionId,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestWorkspaceStats, getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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

  const [search, setSearch] = useState("");
  const [templateApplyOpen, setTemplateApplyOpen] = useState(false);
  const [templateManageOpen, setTemplateManageOpen] = useState(false);

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

  function selectSection(next: GuestListingSectionId) {
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: next }),
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

  return (
    <div className="space-y-6" data-testid="guest-profile-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Guest Profile</h1>
          <p className="text-sm text-muted-foreground">
            Search, manage and open guest profiles for {membership.restaurant.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="guest-quick-actions">
          {accountType ? (
            <div className="relative min-w-56 flex-1 sm:flex-none sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, code, phone, email or profile number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="guest-listing-search"
              />
            </div>
          ) : null}
          <Button
            variant="outline"
            disabled
            title={GUEST_IMPORT_UNAVAILABLE}
            data-testid="import-guests"
          >
            <Upload className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Import Guests</span>
          </Button>
          {/* disabled title={GUEST_IMPORT_UNAVAILABLE} */}
          {section === "groups" && canCreateGroup ? (
            <>
              <Button variant="outline" onClick={() => setTemplateApplyOpen(true)}>
                From template
              </Button>
              <Button variant="outline" onClick={() => setTemplateManageOpen(true)}>
                Templates
              </Button>
            </>
          ) : null}
          <GuestListingNewGuestMenu
            onIndividual={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({ type: "individual", create: "individual" }),
              })
            }
            onCompany={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({ type: "company", create: "company" }),
              })
            }
            onAgency={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({ type: "travel-agent", create: "travel-agent" }),
              })
            }
            onGroup={() =>
              void navigate({
                to: GUEST_PROFILE_DIRECTORY_PATH,
                search: guestProfileSearch({ type: "group", create: "group" }),
              })
            }
            canCreateIndividual={canCreateIndividual}
            canCreateCompany={canCreateCompany}
            canCreateAgency={canCreateAgency}
            canCreateGroup={canCreateGroup}
          />
          <span className="sr-only">
            <Button variant="outline" disabled title={CONTACT_PROFILE_UNAVAILABLE}>
              New Contact
            </Button>
          </span>
        </div>
      </div>

      <nav
        className="flex w-full gap-2 overflow-x-auto pb-1"
        data-testid="guest-listing-nav"
        role="tablist"
        aria-label="Profile section"
      >
        {listingNavSections().map((item) => {
          const active = item.id === section;
          const inactive = listingTypeInactive(item.id, config);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`guest-listing-nav-${item.id}`}
              title={inactive ? PROFILE_TYPE_INACTIVE_SECTION_COPY : undefined}
              onClick={() => selectSection(item.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : inactive
                    ? "border-dashed border-border text-muted-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {item.title}
            </button>
          );
        })}
      </nav>

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
              section === "guests" && "font-semibold text-[#251605]",
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
              section === "companies" && "font-semibold text-[#251605]",
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
              section === "travel-agencies" && "font-semibold text-[#251605]",
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
              section === "groups" && "font-semibold text-[#251605]",
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
            search={search}
            onSearchChange={setSearch}
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

      <GuestGroupTemplatesDialog
        restaurantId={restaurantId}
        open={templateApplyOpen}
        onOpenChange={setTemplateApplyOpen}
        mode="apply"
      />
      <GuestGroupTemplatesDialog
        restaurantId={restaurantId}
        open={templateManageOpen}
        onOpenChange={setTemplateManageOpen}
        mode="manage"
      />
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

function StatRow({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value == null ? "—" : value}</dd>
    </div>
  );
}
