import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  getReservationGuestMasters,
  listGuestAccounts,
  setReservationGuestMasters,
} from "@/packages/pms/lib/guest-accounts.functions";
import {
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  WAVE4_RESERVATION_MASTER_COPY,
  WAVE4_TYPED_LABEL_COPY,
  accountListItems,
  type GuestAccountType,
} from "@/packages/pms/lib/guest-profile-wave4";

const NONE = "__none";

export function ReservationGuestMastersCard({
  restaurantId,
  reservationId,
}: {
  restaurantId: string;
  reservationId: string;
}) {
  const queryClient = useQueryClient();
  const fetchMasters = useServerFn(getReservationGuestMasters);
  const fetchAccounts = useServerFn(listGuestAccounts);
  const save = useServerFn(setReservationGuestMasters);

  const currentQuery = useQuery({
    queryKey: ["reservation-guest-masters", restaurantId, reservationId],
    queryFn: () => fetchMasters({ data: { restaurantId, reservationId } }),
    retry: false,
  });

  const companies = useQuery({
    queryKey: ["guest-accounts", restaurantId, "company"],
    queryFn: () => fetchAccounts({ data: { restaurantId, accountType: "company" as GuestAccountType, limit: 100 } }),
    retry: false,
  });
  const groups = useQuery({
    queryKey: ["guest-accounts", restaurantId, "group"],
    queryFn: () => fetchAccounts({ data: { restaurantId, accountType: "group" as GuestAccountType, limit: 100 } }),
    retry: false,
  });
  const agents = useQuery({
    queryKey: ["guest-accounts", restaurantId, "travel_agent"],
    queryFn: () =>
      fetchAccounts({ data: { restaurantId, accountType: "travel_agent" as GuestAccountType, limit: 100 } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (patch: {
      companyMasterId?: string | null | undefined;
      groupAccountMasterId?: string | null | undefined;
      travelAgentMasterId?: string | null | undefined;
    }) => save({ data: { restaurantId, reservationId, ...patch } }),
    onSuccess: () => {
      toast.success("Guest master linked to this stay.");
      void queryClient.invalidateQueries({ queryKey: ["reservation-guest-masters", restaurantId, reservationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (currentQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading Guest masters…</p>;
  if (currentQuery.data && !currentQuery.data.available) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4" data-testid="reservation-guest-masters">
        <h2 className="font-display text-lg">Guest masters</h2>
        <p className="mt-2 text-sm text-muted-foreground">{WAVE4_MIGRATION_UNAVAILABLE}</p>
      </section>
    );
  }
  const current = currentQuery.data;
  if (!current) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="reservation-guest-masters">
      <h2 className="font-display text-lg">Guest masters</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {WAVE4_RESERVATION_MASTER_COPY} {WAVE4_TYPED_LABEL_COPY} {WAVE4_GROUP_ACCOUNT_COPY}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MasterSelect
          label="Company master"
          value={current.companyMasterId}
          options={accountListItems(companies.data)}
          disabled={mutation.isPending}
          onChange={(id) => mutation.mutate({ companyMasterId: id })}
        />
        <MasterSelect
          label="Group account master"
          value={current.groupAccountMasterId}
          options={accountListItems(groups.data)}
          disabled={mutation.isPending}
          onChange={(id) => mutation.mutate({ groupAccountMasterId: id })}
        />
        <MasterSelect
          label="Travel Agent master"
          value={current.travelAgentMasterId}
          options={accountListItems(agents.data)}
          disabled={mutation.isPending}
          onChange={(id) => mutation.mutate({ travelAgentMasterId: id })}
        />
      </div>
    </section>
  );
}

function MasterSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ id: string; name: string }>;
  disabled: boolean;
  onChange: (id: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
