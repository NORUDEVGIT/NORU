import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";

import {
  FilterChips,
  FilterGroup,
  FilterOption,
  GuestRowActions,
  MoreFiltersMenu,
  PILL,
  exportProfilesToPdf,
  guestRowClass,
  useGuestExportPdf,
  type GuestRowKind,
} from "@/packages/pms/components/workspaces/guest-directory-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { companyDirectorySecondary } from "@/packages/pms/lib/guest-profile-company";
import {
  AGENCY_TYPE_LABELS,
  AGENCY_TYPES,
  taDirectorySecondary,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  accountListItems,
  accountTypeToProfileType,
  type GuestAccountType,
} from "@/packages/pms/lib/guest-profile-wave4";
import {
  LISTING_DEFAULT_PAGE_SIZE,
  LISTING_PAGE_SIZES,
  PROFILE_TYPE_CREATE_BLOCKED,
  PROFILE_TYPE_INACTIVE_SECTION_COPY,
  accountTypeToListingSection,
  displayProfileNumber,
  listingCreateAllowed,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
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
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

const ALL = "all";

type AccountFilterDraft = {
  status: string;
  agencyType: string;
  country: string;
};

const DEFAULT_DRAFT: AccountFilterDraft = {
  status: ALL,
  agencyType: ALL,
  country: "",
};

/**
 * Company, Travel agent and Group directories.
 */
export function GuestAccountDirectory({
  membership,
  accountType,
  returnCard,
  search,
  onSearchChange,
  compact = false,
}: {
  membership: RestaurantMembership;
  accountType: GuestAccountType;
  returnCard?: GuestProfileCardId | undefined;
  search?: string;
  onSearchChange?: (value: string) => void;
  compact?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { date } = useRestaurantTime();
  const title = GUEST_ACCOUNT_TYPE_LABELS[accountType];
  const profileType = accountTypeToProfileType(accountType);

  // The action menu receives the corresponding profile kind.
  const rowKind: GuestRowKind =
    accountType === "travel_agent"
      ? "travel-agency"
      : accountType === "group"
        ? "group"
        : "company";

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchConfig = useServerFn(getGuestWorkspaceConfig);

  const [localSearch, setLocalSearch] = useState("");
  const searchValue = search ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;

  const [status, setStatus] = useState<string>(ALL);
  const [agencyType, setAgencyType] = useState<string>(ALL);
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<
    (typeof LISTING_PAGE_SIZES)[number]
  >(LISTING_DEFAULT_PAGE_SIZE);

  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] =
    useState<AccountFilterDraft>(DEFAULT_DRAFT);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    setPage(0);
  }, [searchValue]);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });

  const canManage = accessQuery.data?.canManage ?? false;
  const offset = page * pageSize;

  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  const accountsQuery = useQuery({
    queryKey: [
      "guest-accounts",
      restaurantId,
      accountType,
      searchValue,
      status,
      agencyType,
      country,
      offset,
      pageSize,
    ],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          offset,
          limit: pageSize,
          ...(searchValue.trim()
            ? { search: searchValue.trim() }
            : {}),
          ...(status !== ALL
            ? { status: status as "active" | "inactive" }
            : {}),
          ...(accountType === "travel_agent" && agencyType !== ALL
            ? {
                agencyType: agencyType as (typeof AGENCY_TYPES)[number],
              }
            : {}),
          ...(accountType === "travel_agent" && country.trim()
            ? { country: country.trim() }
            : {}),
        },
      }),
    enabled: canManage,
    retry: false,
  });

  // "More > Export to PDF" (next to the New Guest button) exports the
  // profiles on this page.
  useGuestExportPdf(() =>
    exportProfilesToPdf({
      title: `${title} Profiles`,
      restaurantName: membership.restaurant.name,
      rows: accountListItems(accountsQuery.data).map((row) => ({
        profileNo: displayProfileNumber(row.id, row.code),
        name: row.name,
        type: title,
        phone: row.phone,
        email: row.email,
        vip: false,
        status: row.accountStatus,
      })),
    }),
  );

  function openAccount(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({
        card: returnCard,
        type: profileType,
      }),
    });
  }

  function patchDraft(patch: Partial<AccountFilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleGroup(id: string) {
    setOpenGroups((current) =>
      current.includes(id)
        ? current.filter((group) => group !== id)
        : [...current, id],
    );
  }

  function applyFilters(next: AccountFilterDraft) {
    setStatus(next.status);
    setAgencyType(next.agencyType);
    setCountry(next.country.trim());
    setPage(0);
    setFilterOpen(false);
  }

  function handleFilterOpenChange(open: boolean) {
    setFilterOpen(open);
    if (open) {
      setDraft({ status, agencyType, country });
    }
  }

  if (accessQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading accounts…
      </p>
    );
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-xl">{title} directory</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this
          property.
        </p>
      </div>
    );
  }

  const pageData = accountsQuery.data;
  const accounts = accountListItems(pageData);
  const total =
    pageData && !Array.isArray(pageData)
      ? pageData.total
      : accounts.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const unavailable =
    accountsQuery.isError &&
    accountsQuery.error instanceof Error &&
    accountsQuery.error.message === WAVE4_MIGRATION_UNAVAILABLE;

  const canCreate = listingCreateAllowed(
    accountTypeToListingSection(accountType),
    configQuery.data,
  );

  const isAgency = accountType === "travel_agent";

  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (status !== ALL) {
    chips.push({
      key: "status",
      label: `Status: ${status === "active" ? "Active" : "Inactive"}`,
      clear: () => {
        setStatus(ALL);
        setPage(0);
      },
    });
  }

  if (isAgency && agencyType !== ALL) {
    chips.push({
      key: "agency-type",
      label: `Type: ${
        AGENCY_TYPE_LABELS[
          agencyType as (typeof AGENCY_TYPES)[number]
        ] ?? agencyType
      }`,
      clear: () => {
        setAgencyType(ALL);
        setPage(0);
      },
    });
  }

  if (isAgency && country) {
    chips.push({
      key: "country",
      label: `Country: ${country}`,
      clear: () => {
        setCountry("");
        setPage(0);
      },
    });
  }

  return (
    <div
      className="space-y-4"
      data-testid="guest-account-directory"
    >
      {compact ? null : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">
              {title} directory
            </h2>
            <p className="text-sm text-muted-foreground">
              Search and open {title.toLowerCase()} masters for{" "}
              {membership.restaurant.name}.
              {accountType === "group"
                ? ` ${WAVE4_GROUP_ACCOUNT_COPY}`
                : ""}
              {!canCreate
                ? ` ${PROFILE_TYPE_INACTIVE_SECTION_COPY}`
                : ""}
            </p>
          </div>

          <Button
            data-testid="guest-account-new"
            disabled={!canCreate}
            title={
              !canCreate ? PROFILE_TYPE_CREATE_BLOCKED : undefined
            }
            onClick={() => {
              if (accountType === "group") {
                void navigate({
                  to: GUEST_PROFILE_DIRECTORY_PATH,
                  search: guestProfileSearch({
                    type: "group",
                    create: "group",
                  }),
                });
                return;
              }

              if (accountType === "travel_agent") {
                void navigate({
                  to: GUEST_PROFILE_DIRECTORY_PATH,
                  search: guestProfileSearch({
                    type: "travel-agent",
                    create: "travel-agent",
                  }),
                });
              }
            }}
          >
            <Plus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">New {title}</span>
          </Button>
        </div>
      )}

      {/* Search and More filters */}
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="guest-directory-filters"
      >
        {onSearchChange ? null : (
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#c9a24a]" />
            <Input
              className={cn(PILL, "w-full pl-10")}
              data-testid="guest-account-search"
              placeholder="Search name, code, phone, email or profile number"
              value={searchValue}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        )}

        <MoreFiltersMenu
          open={filterOpen}
          onOpenChange={handleFilterOpenChange}
          activeCount={chips.length}
          title={`Filter ${title.toLowerCase()}`}
          onApply={() => applyFilters(draft)}
          onClear={() => applyFilters(DEFAULT_DRAFT)}
        >
          <FilterGroup
            id="status"
            title="Status"
            count={draft.status !== ALL ? 1 : 0}
            open={openGroups.includes("status")}
            onToggle={toggleGroup}
          >
            <FilterOption
              type="radio"
              name="account-filter-status"
              label="All statuses"
              checked={draft.status === ALL}
              onChange={() => patchDraft({ status: ALL })}
            />
            <FilterOption
              type="radio"
              name="account-filter-status"
              label="Active"
              checked={draft.status === "active"}
              onChange={() => patchDraft({ status: "active" })}
            />
            <FilterOption
              type="radio"
              name="account-filter-status"
              label="Inactive"
              checked={draft.status === "inactive"}
              onChange={() => patchDraft({ status: "inactive" })}
            />
          </FilterGroup>

          {isAgency ? (
            <>
              <FilterGroup
                id="agency-type"
                title="Agency type"
                count={draft.agencyType !== ALL ? 1 : 0}
                open={openGroups.includes("agency-type")}
                onToggle={toggleGroup}
              >
                <FilterOption
                  type="radio"
                  name="account-filter-agency-type"
                  label="All agency types"
                  checked={draft.agencyType === ALL}
                  onChange={() => patchDraft({ agencyType: ALL })}
                />

                {AGENCY_TYPES.map((type) => (
                  <FilterOption
                    key={type}
                    type="radio"
                    name="account-filter-agency-type"
                    label={AGENCY_TYPE_LABELS[type]}
                    checked={draft.agencyType === type}
                    onChange={() => patchDraft({ agencyType: type })}
                  />
                ))}
              </FilterGroup>

              <FilterGroup
                id="country"
                title="Country"
                count={draft.country.trim() ? 1 : 0}
                open={openGroups.includes("country")}
                onToggle={toggleGroup}
              >
                <Input
                  className="my-1 h-9"
                  data-testid="guest-account-country"
                  placeholder="Type a country"
                  value={draft.country}
                  onChange={(e) =>
                    patchDraft({ country: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </FilterGroup>
            </>
          ) : null}
        </MoreFiltersMenu>
      </div>

      <FilterChips chips={chips} />

      {unavailable ? (
        <p className="text-sm text-muted-foreground">
          {WAVE4_MIGRATION_UNAVAILABLE}
        </p>
      ) : accountsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading accounts…
        </p>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} masters match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table
            className="w-full min-w-[820px] text-sm"
            data-testid="guest-account-table"
          >
            <thead className="border-b-2 border-white bg-[#fbfbfb] text-left text-[11px] font-semibold uppercase tracking-wider text-[#4a2c1a]">
              <tr>
                <th className="px-4 py-3">Profile No.</th>
                <th className="px-3 py-3">{title}</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Last updated</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((row) => {
                const isActive = row.accountStatus === "active";

                const secondary =
                  accountType === "company"
                    ? companyDirectorySecondary(
                        row.tradeName,
                        row.companyType,
                      )
                    : isAgency
                      ? taDirectorySecondary(
                          row.tradeName,
                          row.agencyType,
                        )
                      : null;

                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    data-testid="guest-account-row"
                    onClick={() => openAccount(row.id)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && openAccount(row.id)
                    }
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors",
                      guestRowClass(profileType),
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {displayProfileNumber(row.id, row.code)}
                    </td>

                    <td className="px-3 py-3">
                      <span className="block min-w-0">
                        <span className="block font-bold">
                          {row.name}
                        </span>
                        {secondary ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {secondary}
                          </span>
                        ) : null}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      {row.phone || row.email ? (
                        <span className="block leading-snug">
                          <span className="block font-medium text-foreground">
                            {row.phone ?? "—"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {row.email ?? ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 rounded-full",
                            isActive
                              ? "bg-[#436436]"
                              : "bg-muted-foreground",
                          )}
                        />
                        {row.accountStatus}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-muted-foreground">
                      {date(row.updatedAt)}
                    </td>

                    <td
                      className="px-3 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GuestRowActions
                        kind={rowKind}
                        id={row.id}
                        label={row.name}
                        active={isActive}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total} profile{total === 1 ? "" : "s"} · page{" "}
          {Math.min(page + 1, pageCount)} of {pageCount}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(
                Number(value) as (typeof LISTING_PAGE_SIZES)[number],
              );
              setPage(0);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() =>
              setPage((value) => Math.max(0, value - 1))
            }
          >
            Previous
          </Button>

          <Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}