import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Upload } from "lucide-react";

import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import { GuestAccountFormDialog } from "@/packages/pms/components/guests/guest-account-form-dialog";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import {
  GuestDirectoryWorkspace,
  GuestListingNewGuestMenu,
} from "@/packages/pms/components/workspaces/guest-directory-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  AGENCIES_STAT_COPY,
  CONTACTS_STAT_COPY,
  CONTACT_PROFILE_UNAVAILABLE,
  GUEST_IMPORT_UNAVAILABLE,
  GUEST_LISTING_CHIPS,
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
import {
  getGuestWorkspaceStats,
  getGuestsAccess,
  listGuestWorkspaceActivity,
} from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

export function GuestListingWorkspace({
  membership,
  listingType,
  returnCard,
}: {
  membership: RestaurantMembership;
  listingType?: GuestProfileTypeId | GuestListingPlaceholderType;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { dateTime } = useRestaurantTime();
  const section = guestListingSection(listingType);
  const accountType = sectionToAccountType(section);
  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchStats = useServerFn(getGuestWorkspaceStats);
  const fetchActivity = useServerFn(listGuestWorkspaceActivity);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

  const [search, setSearch] = useState("");
  const [individualOpen, setIndividualOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [agencyOpen, setAgencyOpen] = useState(false);

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
  const activityQuery = useQuery({
    queryKey: ["guest-workspace-activity", restaurantId],
    queryFn: () => fetchActivity({ data: { restaurantId } }),
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

  function openCreated(id: string, type: GuestProfileTypeId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ type }),
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
  const allSelected = section === "individual" && !listingType;
  const canCreateIndividual = listingCreateAllowed("individual", config);
  const canCreateCompany = listingCreateAllowed("company", config);
  const canCreateAgency = listingCreateAllowed("travel-agent", config);
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search guest, company, phone, email, passport or profile number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="guest-listing-search"
            />
          </div>
          <Button variant="outline" disabled title={GUEST_IMPORT_UNAVAILABLE} data-testid="import-guests">
            <Upload className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Import Guests</span>
          </Button>
          <GuestListingNewGuestMenu
            onIndividual={() => setIndividualOpen(true)}
            onCompany={() => setCompanyOpen(true)}
            onAgency={() => setAgencyOpen(true)}
            canCreateIndividual={canCreateIndividual}
            canCreateCompany={canCreateCompany}
            canCreateAgency={canCreateAgency}
          />
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

      <div
        className="flex w-full gap-2 overflow-x-auto"
        data-testid="guest-listing-chips"
        role="tablist"
        aria-label="Profile category"
      >
        {GUEST_LISTING_CHIPS.map((chip) => {
          const selected =
            chip.id === "all"
              ? allSelected
              : chip.section === section && (chip.id !== "individual" || !allSelected);
          const inactive = listingTypeInactive(chip.section, config);
          return (
            <button
              key={chip.id}
              type="button"
              data-testid={`guest-listing-chip-${chip.id}`}
              title={inactive ? PROFILE_TYPE_INACTIVE_SECTION_COPY : undefined}
              onClick={() => selectSection(chip.section)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : inactive
                    ? "border-dashed border-border text-muted-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {chip.title}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {sectionInactive ? (
            <p className="mb-4 text-sm text-muted-foreground" data-testid="guest-listing-inactive-copy">
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
              search={search}
              onSearchChange={setSearch}
            />
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4" data-testid="guest-quick-actions">
            <h2 className="font-display text-lg">Quick Actions</h2>
            <div className="mt-3 grid gap-2">
              <Button
                variant="outline"
                disabled={!canCreateIndividual}
                title={!canCreateIndividual ? PROFILE_TYPE_CREATE_BLOCKED : undefined}
                onClick={() => setIndividualOpen(true)}
              >
                New Individual
              </Button>
              <Button
                variant="outline"
                disabled={!canCreateCompany}
                title={!canCreateCompany ? PROFILE_TYPE_CREATE_BLOCKED : undefined}
                onClick={() => setCompanyOpen(true)}
              >
                New Company
              </Button>
              <Button
                variant="outline"
                disabled={!canCreateAgency}
                title={!canCreateAgency ? PROFILE_TYPE_CREATE_BLOCKED : undefined}
                onClick={() => setAgencyOpen(true)}
              >
                New Agency
              </Button>
              <Button variant="outline" disabled title={CONTACT_PROFILE_UNAVAILABLE}>
                New Contact
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4" data-testid="guest-workspace-stats">
            <h2 className="font-display text-lg">Guest Statistics</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <StatRow label="Total Profiles" value={stats?.totalProfiles} />
              <StatRow label="Individuals" value={stats?.individuals} />
              <StatRow label="Companies" value={stats?.companies} />
              <StatRow label="Groups" value={stats?.groups} />
              <div>
                <StatRow label="Agencies / Tour Operators" value={stats?.travelAgents} />
                <p className="text-[11px] text-muted-foreground">{AGENCIES_STAT_COPY}</p>
              </div>
              <div>
                <StatRow label="Contacts" value={stats?.contacts} />
                <p className="text-[11px] text-muted-foreground">{CONTACTS_STAT_COPY}</p>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4" data-testid="guest-workspace-activity">
            <h2 className="font-display text-lg">Recent Guest Activity</h2>
            {activityQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading activity…</p>
            ) : (activityQuery.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No recent profile activity for this property.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(activityQuery.data ?? []).map((item) => (
                  <li key={item.id} className="text-sm">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.partyName} · {dateTime(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <GuestFormDialog
        restaurantId={restaurantId}
        open={individualOpen}
        onOpenChange={setIndividualOpen}
        onSaved={(id) => openCreated(id, "individual")}
        onOpenExisting={(id) => openCreated(id, "individual")}
      />
      <GuestAccountFormDialog
        restaurantId={restaurantId}
        accountType="company"
        open={companyOpen}
        onOpenChange={setCompanyOpen}
        onSaved={(id) => openCreated(id, "company")}
      />
      <GuestAccountFormDialog
        restaurantId={restaurantId}
        accountType="travel_agent"
        open={agencyOpen}
        onOpenChange={setAgencyOpen}
        onSaved={(id) => openCreated(id, "travel-agent")}
      />
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

function StatRow({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value == null ? "—" : value}</dd>
    </div>
  );
}
