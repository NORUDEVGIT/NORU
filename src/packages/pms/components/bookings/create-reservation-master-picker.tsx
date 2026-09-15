import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Briefcase, Search } from "lucide-react";

import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import { GuestTravelAgentFormDialog } from "@/packages/pms/components/guests/guest-travel-agent-form-dialog";
import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_MASTER_CONFIRM_COPY,
  CREATE_RESERVATION_PAYMENT_TERMS_COPY,
  toPickedReservationMaster,
  type CreateReservationMasterKind,
  type PickedReservationMaster,
} from "@/packages/pms/lib/create-reservation-phase1";
import { getGuestAccount, listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

const KIND_COPY: Record<
  CreateReservationMasterKind,
  {
    label: string;
    searchPlaceholder: string;
    createLabel: string;
    changeLabel: string;
    empty: string;
    testId: string;
    searchTestId: string;
    resultsTestId: string;
    selectedTestId: string;
    changeTestId: string;
    createTestId: string;
    termsTestId: string;
  }
> = {
  company: {
    label: "Company",
    searchPlaceholder: "Search companies by name or code",
    createLabel: "Create Company",
    changeLabel: "Change Company",
    empty: "No matching companies — create one without leaving this page.",
    testId: "company-picker",
    searchTestId: "company-search",
    resultsTestId: "company-search-results",
    selectedTestId: "selected-company-card",
    changeTestId: "change-company",
    createTestId: "create-company-inline",
    termsTestId: "company-payment-terms",
  },
  travel_agent: {
    label: "Travel Agency",
    searchPlaceholder: "Search travel agencies by name or code",
    createLabel: "Create Travel Agency",
    changeLabel: "Change Travel Agency",
    empty: "No matching travel agencies — create one without leaving this page.",
    testId: "ta-picker",
    searchTestId: "ta-search",
    resultsTestId: "ta-search-results",
    selectedTestId: "selected-ta-card",
    changeTestId: "change-ta",
    createTestId: "create-ta-inline",
    termsTestId: "ta-payment-terms",
  },
};

export function CreateReservationMasterPicker({
  restaurantId,
  kind,
  canCreate,
  master,
  onMasterChange,
}: {
  restaurantId: string;
  kind: CreateReservationMasterKind;
  canCreate: boolean;
  master: PickedReservationMaster | null;
  onMasterChange: (master: PickedReservationMaster | null) => void;
}) {
  const copy = KIND_COPY[kind];
  const fetchAccounts = useServerFn(listGuestAccounts);
  const fetchAccount = useServerFn(getGuestAccount);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const Icon = kind === "company" ? Building2 : Briefcase;

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(search),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [search]);

  const accountsQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, kind, debouncedSearch, "create-reservation-picker"],
    queryFn: () =>
      fetchAccounts({
        data: {
          restaurantId,
          accountType: kind,
          status: "active",
          limit: 8,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
      }),
  });

  async function selectById(accountId: string) {
    try {
      const profile = await fetchAccount({ data: { restaurantId, accountId } });
      onMasterChange(toPickedReservationMaster(profile));
    } catch {
      const match = (accountsQuery.data ?? []).find((row) => row.id === accountId) ?? null;
      onMasterChange(match ? toPickedReservationMaster(match) : null);
    }
  }

  return (
    <div className="mt-3 space-y-2" data-testid={copy.testId}>
      <Label>{copy.label}</Label>
      {master ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
          data-testid={copy.selectedTestId}
        >
          <div className="min-w-0">
            <p className="font-medium">
              {master.name}
              {master.code ? <span className="ml-2 text-xs text-muted-foreground">{master.code}</span> : null}
            </p>
            {master.paymentTerms ? (
              <p className="mt-1 text-xs text-muted-foreground" data-testid={copy.termsTestId}>
                Payment terms: {master.paymentTerms}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground" data-testid={copy.termsTestId}>
                No payment terms on this master.
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_PAYMENT_TERMS_COPY}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            data-testid={copy.changeTestId}
            onClick={() => {
              onMasterChange(null);
              setSearch("");
            }}
          >
            {copy.changeLabel}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                data-testid={copy.searchTestId}
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canCreate ? (
              <Button type="button" variant="outline" data-testid={copy.createTestId} onClick={() => setFormOpen(true)}>
                <Icon className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">{copy.createLabel}</span>
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2" data-testid={copy.resultsTestId}>
            {(accountsQuery.data ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void selectById(row.id)}
                  className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                >
                  <span className="font-medium">{row.name}</span>
                  {row.code ? <span className="ml-2 text-xs text-muted-foreground">{row.code}</span> : null}
                </button>
              </li>
            ))}
            {accountsQuery.data?.length === 0 ? (
              <li className="text-sm text-muted-foreground">{copy.empty}</li>
            ) : null}
          </ul>
          <p className="text-xs text-muted-foreground">{CREATE_RESERVATION_MASTER_CONFIRM_COPY}</p>
        </div>
      )}

      {kind === "company" ? (
        <GuestCompanyFormDialog
          restaurantId={restaurantId}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={(accountId) => void selectById(accountId)}
        />
      ) : (
        <GuestTravelAgentFormDialog
          restaurantId={restaurantId}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={(accountId) => void selectById(accountId)}
        />
      )}
    </div>
  );
}
