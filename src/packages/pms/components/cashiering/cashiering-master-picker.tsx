import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Search, Users } from "lucide-react";

import { CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS } from "@/packages/pms/lib/create-reservation-phase1";
import { getGuestAccount, listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  accountListItems,
  type GuestAccountSummary,
} from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";

export type CashieringMasterKind = "company" | "group";

const KIND_COPY: Record<
  CashieringMasterKind,
  {
    label: string;
    searchPlaceholder: string;
    empty: string;
    createSection: "companies" | "groups";
    icon: typeof Building2;
  }
> = {
  company: {
    label: "Company",
    searchPlaceholder: "Search companies by name or code",
    empty: "No matching companies. Create one in Guest Profile first.",
    createSection: "companies",
    icon: Building2,
  },
  group: {
    label: "Group",
    searchPlaceholder: "Search groups by name or code",
    empty: "No matching groups. Create one in Guest Profile first.",
    createSection: "groups",
    icon: Users,
  },
};

export function CashieringMasterPicker({
  restaurantId,
  masterKind,
  onMasterKindChange,
  selected,
  onSelectedChange,
  disabled = false,
}: {
  restaurantId: string;
  masterKind: CashieringMasterKind;
  onMasterKindChange: (kind: CashieringMasterKind) => void;
  selected: GuestAccountSummary | null;
  onSelectedChange: (master: GuestAccountSummary | null) => void;
  disabled?: boolean;
}) {
  const copy = KIND_COPY[masterKind];
  const Icon = copy.icon;
  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchAccount = useServerFn(getGuestAccount);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(search),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [search]);

  const accountsQuery = useQuery({
    queryKey: ["cashiering-master-picker", restaurantId, masterKind, debouncedSearch],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: masterKind,
          status: "active",
          limit: 8,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
      }),
    enabled: !selected,
  });

  async function selectById(accountId: string) {
    try {
      const profile = await fetchAccount({ data: { restaurantId, accountId } });
      onSelectedChange(profile);
    } catch {
      const match = accountListItems(accountsQuery.data).find((row) => row.id === accountId) ?? null;
      onSelectedChange(match);
    }
  }

  return (
    <div
      className={cn("space-y-3", disabled && "pointer-events-none opacity-60")}
      data-testid="cashiering-master-picker"
    >
      <div>
        <Label>Master type</Label>
        <div className="mt-1 flex gap-2">
          {(["company", "group"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant={masterKind === kind ? "default" : "outline"}
              className="min-h-11 flex-1"
              disabled={disabled || Boolean(selected)}
              onClick={() => {
                onMasterKindChange(kind);
                onSelectedChange(null);
                setSearch("");
              }}
            >
              {KIND_COPY[kind].label}
            </Button>
          ))}
        </div>
      </div>

      {selected ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3"
          data-testid="cashiering-master-selected"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{selected.name}</p>
            {selected.code ? (
              <p className="text-xs text-muted-foreground">{selected.code}</p>
            ) : null}
            <p className="text-xs capitalize text-muted-foreground">{selected.accountType}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-8"
            disabled={disabled}
            onClick={() => {
              onSelectedChange(null);
              setSearch("");
            }}
          >
            Change
          </Button>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="cashiering-master-search">{copy.label}</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cashiering-master-search"
                className="min-h-11 pl-9"
                data-testid="cashiering-master-search"
                placeholder={copy.searchPlaceholder}
                value={search}
                disabled={disabled}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ul className="space-y-2" data-testid="cashiering-master-search-results">
            {accountListItems(accountsQuery.data).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void selectById(row.id)}
                  className="min-h-11 w-full rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                >
                  <span className="font-medium">{row.name}</span>
                  {row.code ? (
                    <span className="ml-2 text-xs text-muted-foreground">{row.code}</span>
                  ) : null}
                </button>
              </li>
            ))}
            {!accountsQuery.isLoading && accountListItems(accountsQuery.data).length === 0 ? (
              <li className="text-sm text-muted-foreground">{copy.empty}</li>
            ) : null}
          </ul>
          <p className="text-xs text-muted-foreground">
            Masters are created in{" "}
            <Link
              to={GUEST_PROFILE_DIRECTORY_PATH}
              search={guestProfileSearch({ section: copy.createSection })}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Guest Profile
            </Link>
            . This opens a billing account, not a stay summary.
          </p>
        </>
      )}
    </div>
  );
}

export function financialAccountKindFromMaster(
  master: GuestAccountSummary,
): "company" | "group" {
  return master.accountType === "group" ? "group" : "company";
}
