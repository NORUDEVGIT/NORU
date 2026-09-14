import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";

import { GuestAccountFormDialog } from "@/packages/pms/components/guests/guest-account-form-dialog";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import { getGuestAccount, listGuestAccountHistory } from "@/packages/pms/lib/guest-accounts.functions";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  type GuestAccountType,
} from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";

export function GuestAccountDetail({
  restaurantId,
  accountId,
  expectedType,
}: {
  restaurantId: string;
  accountId: string;
  expectedType: GuestAccountType;
}) {
  const fetchAccount = useServerFn(getGuestAccount);
  const fetchHistory = useServerFn(listGuestAccountHistory);
  const [formOpen, setFormOpen] = useState(false);
  const query = useQuery({
    queryKey: ["guest-account", restaurantId, accountId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId } }),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["guest-account-history", restaurantId, accountId],
    queryFn: () => fetchHistory({ data: { restaurantId, accountId } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading account…</p>;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "That account could not be found.";
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6">
        <p className="font-display text-lg">{GUEST_ACCOUNT_TYPE_LABELS[expectedType]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {message === WAVE4_MIGRATION_UNAVAILABLE ? WAVE4_MIGRATION_UNAVAILABLE : message}
        </p>
      </div>
    );
  }
  const account = query.data;
  if (!account) return null;
  if (account.accountType !== expectedType) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6">
        <p className="font-display text-lg">Wrong account type</p>
        <p className="mt-2 text-sm text-muted-foreground">
          That master is a {GUEST_ACCOUNT_TYPE_LABELS[account.accountType]}, not a{" "}
          {GUEST_ACCOUNT_TYPE_LABELS[expectedType]}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-account-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{account.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {GUEST_ACCOUNT_TYPE_LABELS[account.accountType]} master
            {account.accountType === "group" ? ` — ${WAVE4_GROUP_ACCOUNT_COPY}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={account.accountStatus} />
          <Button variant="outline" data-testid="guest-account-edit" onClick={() => setFormOpen(true)}>
            <Pencil className="size-4 sm:mr-2" />
            Edit
          </Button>
        </div>
      </div>
      <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Code" value={account.code ?? "—"} />
        <Field label="Phone" value={account.phone ?? "—"} />
        <Field label="Email" value={account.email ?? "—"} />
        <Field label="Address" value={account.addressLine1 ?? "—"} />
        <Field label="City" value={account.city ?? "—"} />
        <Field label="Country" value={account.country ?? "—"} />
        <Field label="Notes" value={account.notes ?? "—"} />
      </dl>
      <div className="rounded-2xl border border-border bg-card p-4" data-testid="guest-account-history">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Master and relationship events. Operational communications also appear on Notes / Comms /
          Activity.
        </p>
        {(historyQuery.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No master history yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {(historyQuery.data ?? []).map((row) => (
              <li key={row.id}>
                <span className="font-medium">{row.eventType.replaceAll("_", " ")}</span>
                {row.notes ? ` — ${row.notes}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <GuestAccountFormDialog
        restaurantId={restaurantId}
        accountType={account.accountType}
        open={formOpen}
        onOpenChange={setFormOpen}
        account={account}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
