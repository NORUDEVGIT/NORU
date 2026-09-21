import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";

import { GuestAccountFormDialog } from "@/packages/pms/components/guests/guest-account-form-dialog";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { companyDirectorySecondary } from "@/packages/pms/lib/guest-profile-company";
import { taDirectorySecondary } from "@/packages/pms/lib/guest-profile-travel-agency";
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
  displayProfileNumber,
} from "@/packages/pms/lib/guest-profile-listing";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
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
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

const ALL = "all";

export function GuestAccountDirectory({
  membership,
  accountType,
  returnCard,
  search,
  onSearchChange,
}: {
  membership: RestaurantMembership;
  accountType: GuestAccountType;
  returnCard?: GuestProfileCardId | undefined;
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { date } = useRestaurantTime();
  const title = GUEST_ACCOUNT_TYPE_LABELS[accountType];
  const profileType = accountTypeToProfileType(accountType);

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchAccounts = useServerFn(listGuestAccounts);

  const [localSearch, setLocalSearch] = useState("");
  const searchValue = search ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;
  const [status, setStatus] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof LISTING_PAGE_SIZES)[number]>(
    LISTING_DEFAULT_PAGE_SIZE,
  );

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

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, accountType, searchValue, status, offset, pageSize],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          offset,
          limit: pageSize,
          ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
          ...(status !== ALL ? { status: status as "active" | "inactive" } : {}),
        },
      }),
    enabled: canManage,
    retry: false,
  });

  function openAccount(id: string) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: id },
      search: guestProfileSearch({ card: returnCard, type: profileType }),
    });
  }

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading accounts…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-xl">{title} directory</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access guest profiles for this property.
        </p>
      </div>
    );
  }

  const pageData = accountsQuery.data;
  const accounts = accountListItems(pageData);
  const total = pageData && !Array.isArray(pageData) ? pageData.total : accounts.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const unavailable =
    accountsQuery.isError &&
    accountsQuery.error instanceof Error &&
    accountsQuery.error.message === WAVE4_MIGRATION_UNAVAILABLE;

  return (
    <div className="space-y-6" data-testid="guest-account-directory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{title} directory</h2>
          <p className="text-sm text-muted-foreground">
            Search and open {title.toLowerCase()} masters for {membership.restaurant.name}.
            {accountType === "group" ? ` ${WAVE4_GROUP_ACCOUNT_COPY}` : ""}
          </p>
        </div>
        <Button data-testid="guest-account-new" onClick={() => setFormOpen(true)}>
          <Plus className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">New {title}</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {onSearchChange ? null : (
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              data-testid="guest-account-search"
              placeholder="Search name, code, phone, email or profile number"
              value={searchValue}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      ) : accountsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} masters match this view yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm" data-testid="guest-account-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Profile No.</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  data-testid="guest-account-row"
                  onClick={() => openAccount(row.id)}
                  onKeyDown={(e) => e.key === "Enter" && openAccount(row.id)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {displayProfileNumber(row.id, row.code)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <div>{row.name}</div>
                    {accountType === "company" && companyDirectorySecondary(row.tradeName, row.companyType) ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {companyDirectorySecondary(row.tradeName, row.companyType)}
                      </div>
                    ) : null}
                    {accountType === "travel_agent" && taDirectorySecondary(row.tradeName, row.agencyType) ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {taDirectorySecondary(row.tradeName, row.agencyType)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.code ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.accountStatus} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{date(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total} profile{total === 1 ? "" : "s"} · page {Math.min(page + 1, pageCount)} of {pageCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value) as (typeof LISTING_PAGE_SIZES)[number]);
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
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
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

      <GuestAccountFormDialog
        restaurantId={restaurantId}
        accountType={accountType}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={openAccount}
      />
    </div>
  );
}
