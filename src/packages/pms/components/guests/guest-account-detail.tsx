import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";

import { GuestAccountFormDialog } from "@/packages/pms/components/guests/guest-account-form-dialog";
import { GuestCompanyGuestLinks } from "@/packages/pms/components/guests/guest-company-guest-links";
import { StatusBadge } from "@/packages/pms/components/guests/guest-bits";
import { getGuestAccount, listGuestAccountHistory } from "@/packages/pms/lib/guest-accounts.functions";
import {
  COMPANY_RATE_REFERENCE_COPY,
  COMPANY_TYPE_LABELS,
  companyDirectorySecondary,
  isCompanyType,
} from "@/packages/pms/lib/guest-profile-company";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_MIGRATION_UNAVAILABLE,
  type GuestAccountProfile,
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
            {account.accountType === "company" &&
            companyDirectorySecondary(account.tradeName, account.companyType)
              ? ` — ${companyDirectorySecondary(account.tradeName, account.companyType)}`
              : ""}
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
      {account.accountType === "company" ? (
        <CompanyProfileFields account={account} />
      ) : (
        <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label="Code" value={account.code ?? "—"} />
          <Field label="Phone" value={account.phone ?? "—"} />
          <Field label="Email" value={account.email ?? "—"} />
          <Field label="Address" value={account.addressLine1 ?? "—"} />
          <Field label="City" value={account.city ?? "—"} />
          <Field label="Country" value={account.country ?? "—"} />
          <Field label="Notes" value={account.notes ?? "—"} />
        </dl>
      )}
      {account.accountType === "company" ? (
        <GuestCompanyGuestLinks restaurantId={restaurantId} accountId={account.id} />
      ) : null}
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

function CompanyProfileFields({ account }: { account: GuestAccountProfile }) {
  const typeLabel = account.companyType && isCompanyType(account.companyType)
    ? COMPANY_TYPE_LABELS[account.companyType]
    : account.companyType ?? "—";
  return (
    <div className="space-y-3" data-testid="company-profile-fields">
      <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Legal / company name" value={account.name} />
        <Field label="Trade / display name" value={account.tradeName ?? "—"} />
        <Field label="Code" value={account.code ?? "—"} />
        <Field
          label="Company type"
          value={
            account.companyType === "other"
              ? `Other${account.companyTypeOther ? ` — ${account.companyTypeOther}` : ""}`
              : typeLabel
          }
        />
        <Field label="Tax ID / TIN" value={account.taxId ?? "—"} />
        <Field label="Business registration" value={account.businessRegistrationNumber ?? "—"} />
        <Field label="Primary phone" value={account.phone ?? "—"} />
        <Field label="Alternate phone" value={account.phoneAlt ?? "—"} />
        <Field label="Business email" value={account.email ?? "—"} />
        <Field label="Alternate email" value={account.emailAlt ?? "—"} />
        <Field label="Primary contact" value={account.primaryContactName ?? "—"} />
        <Field label="Address line 1" value={account.addressLine1 ?? "—"} />
        <Field label="Address line 2" value={account.addressLine2 ?? "—"} />
        <Field label="City" value={account.city ?? "—"} />
        <Field label="Region / state" value={account.region ?? "—"} />
        <Field label="Country" value={account.country ?? "—"} />
        <Field label="Postal code" value={account.postalCode ?? "—"} />
        <Field label="Corporate account reference" value={account.corporateAccountReference ?? "—"} />
        <Field label="Negotiated rate reference" value={account.negotiatedRateReference ?? "—"} />
        <Field label="Default travel agent" value={account.defaultTravelAgentMasterName ?? "—"} />
        <Field label="Source of business" value={account.sourceOfBusiness ?? "—"} />
        <Field label="Notes" value={account.notes ?? "—"} />
      </dl>
      <p className="text-xs text-muted-foreground">{COMPANY_RATE_REFERENCE_COPY}</p>
    </div>
  );
}
