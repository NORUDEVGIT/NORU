import { useState } from "react";
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
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  accountTypeToProfileType,
  type GuestAccountType,
} from "@/packages/pms/lib/guest-profile-wave4";
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
}: {
  membership: RestaurantMembership;
  accountType: GuestAccountType;
  returnCard?: GuestProfileCardId | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const { date } = useRestaurantTime();
  const title = GUEST_ACCOUNT_TYPE_LABELS[accountType];
  const profileType = accountTypeToProfileType(accountType);

  const fetchAccess = useServerFn(getGuestsAccess);
  const fetchAccounts = useServerFn(listGuestAccounts);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, accountType, search, status],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType,
          ...(search.trim() ? { search: search.trim() } : {}),
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

  const accounts = accountsQuery.data ?? [];
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
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            data-testid="guest-account-search"
            placeholder="Search name, code, phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
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
                  <td className="px-4 py-3 font-medium">{row.name}</td>
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
