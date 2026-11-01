import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";

import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { COMPANY_TYPE_LABELS, type CompanyType } from "@/packages/pms/lib/guest-profile-company";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function GuestCompanyDetailsView({
  restaurantId,
  companyId,
  onOpenEditDialog,
  onEdit,
}: {
  restaurantId: string;
  companyId: string;
  onOpenEditDialog?: () => void;
  onEdit?: () => void;
}) {
  const fetchAccount = useServerFn(getGuestAccount);
  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, companyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: companyId } }),
    retry: false,
  });

  const handleEdit = onOpenEditDialog || onEdit;
  const a = accountQuery.data;

  if (accountQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading details…</p>;
  }
  if (!a) {
    return <p className="text-sm text-muted-foreground">Company details are not available.</p>;
  }

  const companyType = a.companyType
    ? (COMPANY_TYPE_LABELS[a.companyType as CompanyType] ?? a.companyType)
    : null;
  const primaryContact = a.primaryContactName
    ? `${a.primaryContactName}${a.primaryContactTitle ? ` (${a.primaryContactTitle})` : ""}`
    : null;
  const address = [a.addressLine1, a.addressLine2, a.city, a.region, a.postalCode, a.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4" data-testid="company-details-view">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Company details</h2>
        {handleEdit ? (
          <Button size="sm" variant="outline" onClick={handleEdit} data-testid="company-details-edit-btn">
            <Pencil className="mr-1.5 size-3.5" /> Edit
          </Button>
        ) : null}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card px-5">
        <Section title="Company">
          <Item label="Name" value={a.name} />
          <Item label="Trade name" value={a.tradeName} />
          <Item label="Code" value={a.code} />
          <Item label="Type" value={companyType} />
          <Item label="Status" value={a.accountStatus} capitalize />
        </Section>
        <Section title="Contact">
          <Item label="Primary contact" value={primaryContact} />
          <Item label="Phone" value={a.phone} />
          <Item label="Email" value={a.email} />
          <Item label="Website" value={a.website} />
        </Section>
        <Section title="Address">
          <Item label="Address" value={address} wide />
        </Section>
        <Section title="Business">
          <Item label="Tax ID" value={a.taxId} />
          <Item label="Registration no." value={a.businessRegistrationNumber} />
          <Item label="Payment terms" value={a.paymentTerms} />
          <Item label="Credit account" value={a.creditAccountEnabled ? "Enabled" : "Disabled"} />
        </Section>
      </div>
    </div>
  );
}

export const GuestCompanyCorporate = GuestCompanyDetailsView;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function Item({
  label,
  value,
  wide,
  capitalize,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
  capitalize?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", wide && "col-span-2 sm:col-span-3")}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm",
          wide ? "" : "truncate",
          capitalize && "capitalize",
          empty ? "text-muted-foreground/60" : "font-medium",
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}