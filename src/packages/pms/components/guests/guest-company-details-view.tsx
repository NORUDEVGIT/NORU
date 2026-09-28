import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Globe, MapPin, Phone, ShieldCheck, Users } from "lucide-react";

import {
  getGuestAccount,
  listGuestAccounts,
  updateGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { getCompanyBusinessWorkspace } from "@/packages/pms/lib/guest-companies.functions";
import { validateCompanyAgainstType } from "@/packages/pms/lib/guest-companies-workspace";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
import {
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  validateCompanyType,
  type CompanyType,
} from "@/packages/pms/lib/guest-profile-company";
import { GUEST_ACCOUNT_STATUSES, type GuestAccountStatus } from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

type CorporateForm = {
  name: string;
  tradeName: string;
  code: string;
  companyType: CompanyType | "";
  companyTypeOther: string;
  accountStatus: GuestAccountStatus;
  taxId: string;
  businessRegistrationNumber: string;
  phone: string;
  phoneAlt: string;
  email: string;
  emailAlt: string;
  primaryContactName: string;
  primaryContactTitle: string;
  website: string;
  businessProfileTypeId: string;
  creditAccountEnabled: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  corporateAccountReference: string;
  negotiatedRateReference: string;
  defaultTravelAgentMasterId: string;
  sourceOfBusiness: string;
  paymentTerms: string;
  creditLimitNote: string;
  billingInstruction: string;
};

function emptyForm(): CorporateForm {
  return {
    name: "",
    tradeName: "",
    code: "",
    companyType: "",
    companyTypeOther: "",
    accountStatus: "active",
    taxId: "",
    businessRegistrationNumber: "",
    phone: "",
    phoneAlt: "",
    email: "",
    emailAlt: "",
    primaryContactName: "",
    primaryContactTitle: "",
    website: "",
    businessProfileTypeId: "",
    creditAccountEnabled: false,
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    country: "",
    postalCode: "",
    corporateAccountReference: "",
    negotiatedRateReference: "",
    defaultTravelAgentMasterId: "",
    sourceOfBusiness: "",
    paymentTerms: "",
    creditLimitNote: "",
    billingInstruction: "",
  };
}

export function GuestCompanyDetailsView({
  restaurantId,
  companyId,
  onOpenEditDialog,
}: {
  restaurantId: string;
  companyId: string;
  onOpenEditDialog?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getGuestAccount);
  const fetchConfig = useServerFn(getCompanyBusinessWorkspace);
  const fetchTravelAgents = useServerFn(listGuestAccounts);
  const update = useServerFn(updateGuestAccount);
  const [form, setForm] = useState<CorporateForm>(emptyForm);
  const [baseline, setBaseline] = useState("");

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, companyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: companyId } }),
    retry: false,
  });

  const configQuery = useQuery({
    queryKey: ["company-business-workspace", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    retry: false,
  });

  const travelAgentsQuery = useQuery({
    queryKey: ["guest-accounts-travel-agents", restaurantId],
    queryFn: () =>
      fetchTravelAgents({
        data: {
          restaurantId,
          accountType: "travel_agent",
          limit: 100,
        },
      }),
    retry: false,
  });

  useEffect(() => {
    const account = accountQuery.data;
    if (!account) return;
    const next: CorporateForm = {
      name: account.name,
      tradeName: account.tradeName ?? "",
      code: account.code ?? "",
      companyType: (account.companyType as CompanyType | null) ?? "",
      companyTypeOther: account.companyTypeOther ?? "",
      accountStatus: account.accountStatus,
      taxId: account.taxId ?? "",
      businessRegistrationNumber: account.businessRegistrationNumber ?? "",
      phone: account.phone ?? "",
      phoneAlt: account.phoneAlt ?? "",
      email: account.email ?? "",
      emailAlt: account.emailAlt ?? "",
      primaryContactName: account.primaryContactName ?? "",
      primaryContactTitle: account.primaryContactTitle ?? "",
      website: account.website ?? "",
      businessProfileTypeId: account.businessProfileTypeId ?? "",
      creditAccountEnabled: Boolean(account.creditAccountEnabled),
      addressLine1: account.addressLine1 ?? "",
      addressLine2: account.addressLine2 ?? "",
      city: account.city ?? "",
      region: account.region ?? "",
      country: account.country ?? "",
      postalCode: account.postalCode ?? "",
      corporateAccountReference: account.corporateAccountReference ?? "",
      negotiatedRateReference: account.negotiatedRateReference ?? "",
      defaultTravelAgentMasterId: account.defaultTravelAgentMasterId ?? "",
      sourceOfBusiness: account.sourceOfBusiness ?? "",
      paymentTerms: account.paymentTerms ?? "",
      creditLimitNote: account.creditLimitNote ?? "",
      billingInstruction: account.billingInstruction ?? "",
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
  }, [accountQuery.data]);

  const selectedType = useMemo(() => {
    if (!configQuery.data) return null;
    const types = configQuery.data.types ?? [];
    return (
      types.find((type) => type.id === form.businessProfileTypeId) ??
      types.find((type) => type.id === configQuery.data.settings?.defaultBusinessTypeId) ??
      types[0] ??
      null
    );
  }, [configQuery.data, form.businessProfileTypeId]);

  const creditAllowed = Boolean(selectedType?.creditAccountAllowed);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!form.name.trim()) list.push("Company name is required.");
    if (form.companyType) {
      const typeError = validateCompanyType(form.companyType || null, form.companyTypeOther);
      if (typeError) list.push(typeError);
    }
    if (selectedType) {
      const settingsError = validateCompanyAgainstType(
        {
          name: form.name,
          taxId: form.taxId || null,
          primaryContactName: form.primaryContactName || null,
          phone: form.phone || null,
          email: form.email || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country || null,
          businessRegistrationNumber: form.businessRegistrationNumber || null,
          creditAccountEnabled: form.creditAccountEnabled,
          paymentTerms: form.paymentTerms || null,
          creditLimitNote: form.creditLimitNote || null,
        },
        selectedType,
        configQuery.data?.fields ?? [],
        "update",
      );
      if (settingsError) list.push(settingsError);
    }
    return list;
  }, [form, selectedType, configQuery.data?.fields]);

  const isDirty = baseline !== "" && baseline !== JSON.stringify(form);

  const mutation = useMutation({
    mutationFn: async () => {
      if (errors.length) {
        throw new Error(errors[0]);
      }
      return update({
        data: {
          restaurantId,
          accountId: companyId,
          name: form.name.trim(),
          tradeName: form.tradeName.trim() || null,
          code: form.code.trim() || null,
          companyType: form.companyType || null,
          companyTypeOther: form.companyType === "other" ? form.companyTypeOther.trim() || null : null,
          accountStatus: form.accountStatus,
          taxId: form.taxId.trim() || null,
          businessRegistrationNumber: form.businessRegistrationNumber.trim() || null,
          phone: form.phone.trim() || null,
          phoneAlt: form.phoneAlt.trim() || null,
          email: form.email.trim() || null,
          emailAlt: form.emailAlt.trim() || null,
          primaryContactName: form.primaryContactName.trim() || null,
          primaryContactTitle: form.primaryContactTitle.trim() || null,
          website: form.website.trim() || null,
          businessProfileTypeId: form.businessProfileTypeId || null,
          creditAccountEnabled: creditAllowed ? form.creditAccountEnabled : false,
          addressLine1: form.addressLine1.trim() || null,
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          country: form.country || null,
          postalCode: form.postalCode.trim() || null,
          corporateAccountReference: form.corporateAccountReference.trim() || null,
          negotiatedRateReference: form.negotiatedRateReference.trim() || null,
          defaultTravelAgentMasterId: form.defaultTravelAgentMasterId || null,
          sourceOfBusiness: form.sourceOfBusiness.trim() || null,
          paymentTerms: creditAllowed ? form.paymentTerms.trim() || null : null,
          creditLimitNote: creditAllowed ? form.creditLimitNote.trim() || null : null,
          billingInstruction: form.billingInstruction.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
      toast.success("Company details saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Valid Travel Agent options: must be real Travel Agent accounts, not company or group
  const travelAgentOptions = (travelAgentsQuery.data?.items ?? []).filter(
    (ta) => ta.accountType === "travel_agent" && ta.id !== companyId,
  );

  return (
    <div className="space-y-6" data-testid="company-details-view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#251605]">Company Details</h2>
          <p className="text-sm text-[#756A5B]">
            Primary corporate profile, legal registrations, and corporate governance settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenEditDialog ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#DDD4C5] text-[#251605]"
              onClick={onOpenEditDialog}
            >
              Open Full Form
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928]"
            disabled={!isDirty || mutation.isPending || errors.length > 0}
            onClick={() => mutation.mutate()}
            data-testid="company-details-save"
          >
            Save Changes
          </Button>
        </div>
      </div>

      {errors.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Please correct the following before saving:</p>
          <ul className="mt-1 list-inside list-disc">
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Section 1: Core Company Profile */}
      <Section title="Corporate Identification" icon={<Building2 className="size-4 text-[#8A641A]" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal Company Name *">
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Acme Corporation"
            />
          </Field>
          <Field label="Trade Name (DBA)">
            <Input
              value={form.tradeName}
              onChange={(e) => setForm((p) => ({ ...p, tradeName: e.target.value }))}
              placeholder="Trading as"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Corporate Code">
            <Input
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="e.g. ACM001"
            />
          </Field>
          <Field label="Account Status">
            <Select
              value={form.accountStatus}
              onValueChange={(val) => setForm((p) => ({ ...p, accountStatus: val as GuestAccountStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUEST_ACCOUNT_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Business Profile Type">
            <Select
              value={form.businessProfileTypeId || "__none"}
              onValueChange={(val) =>
                setForm((p) => ({ ...p, businessProfileTypeId: val === "__none" ? "" : val }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Default Type</SelectItem>
                {(configQuery.data?.types ?? []).map((pt) => (
                  <SelectItem key={pt.id} value={pt.id}>
                    {pt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal Entity Form">
            <Select
              value={form.companyType || "__none"}
              onValueChange={(val) =>
                setForm((p) => ({
                  ...p,
                  companyType: val === "__none" ? "" : (val as CompanyType),
                  companyTypeOther: val === "other" ? p.companyTypeOther : "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select legal form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not specified</SelectItem>
                {COMPANY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {COMPANY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.companyType === "other" && (
            <Field label="Other Legal Form Description">
              <Input
                value={form.companyTypeOther}
                onChange={(e) => setForm((p) => ({ ...p, companyTypeOther: e.target.value }))}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tax ID / TIN">
            <Input
              value={form.taxId}
              onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))}
              placeholder="e.g. 12-3456789"
            />
          </Field>
          <Field label="Business Registration Number">
            <Input
              value={form.businessRegistrationNumber}
              onChange={(e) => setForm((p) => ({ ...p, businessRegistrationNumber: e.target.value }))}
              placeholder="e.g. REG-987654"
            />
          </Field>
        </div>
      </Section>

      {/* Section 2: Contact Information */}
      <Section title="Communication & Contacts" icon={<Phone className="size-4 text-[#8A641A]" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </Field>
          <Field label="Alternate Phone">
            <Input
              value={form.phoneAlt}
              onChange={(e) => setForm((p) => ({ ...p, phoneAlt: e.target.value }))}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business Email">
            <Input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </Field>
          <Field label="Alternate Email">
            <Input
              value={form.emailAlt}
              onChange={(e) => setForm((p) => ({ ...p, emailAlt: e.target.value }))}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary Contact Person">
            <Input
              value={form.primaryContactName}
              onChange={(e) => setForm((p) => ({ ...p, primaryContactName: e.target.value }))}
            />
          </Field>
          <Field label="Primary Contact Job Title">
            <Input
              value={form.primaryContactTitle}
              onChange={(e) => setForm((p) => ({ ...p, primaryContactTitle: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Official Website">
          <Input
            value={form.website}
            onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
            placeholder="https://..."
          />
        </Field>
      </Section>

      {/* Section 3: Registered Address */}
      <Section title="Registered Address" icon={<MapPin className="size-4 text-[#8A641A]" />}>
        <Field label="Address Line 1">
          <Input
            value={form.addressLine1}
            onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
          />
        </Field>
        <Field label="Address Line 2 / District">
          <Input
            value={form.addressLine2}
            onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            />
          </Field>
          <Field label="Region / State / Province">
            <Input
              value={form.region}
              onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country">
            <Select
              value={form.country || "__none"}
              onValueChange={(val) => setForm((p) => ({ ...p, country: val === "__none" ? "" : val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Choose country</SelectItem>
                {ISO_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Postal / ZIP Code">
            <Input
              value={form.postalCode}
              onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
            />
          </Field>
        </div>
      </Section>

      {/* Section 4: Default Travel Agency Relationship */}
      <Section
        title="Default Travel Agency Relationship"
        icon={<Globe className="size-4 text-[#8A641A]" />}
      >
        <p className="text-xs text-[#756A5B]">
          If this company routes bookings through a specific partner Travel Agency, associate it here.
          Must be a registered Travel Agent master in this property.
        </p>
        <Field label="Default Travel Agent">
          <Select
            value={form.defaultTravelAgentMasterId || "__none"}
            onValueChange={(val) =>
              setForm((p) => ({
                ...p,
                defaultTravelAgentMasterId: val === "__none" ? "" : val,
              }))
            }
          >
            <SelectTrigger className="border-[#DDD4C5]">
              <SelectValue placeholder="No default travel agent linked" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None (Direct Corporate Booking)</SelectItem>
              {travelAgentOptions.map((ta) => (
                <SelectItem key={ta.id} value={ta.id}>
                  {ta.name} {ta.code ? `(${ta.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {accountQuery.data?.defaultTravelAgentMasterName && !form.defaultTravelAgentMasterId ? (
          <p className="text-xs text-muted-foreground">
            Previously linked to: {accountQuery.data.defaultTravelAgentMasterName}
          </p>
        ) : null}
      </Section>

      {/* Section 5: Commercial & References */}
      <Section title="Commercial Governance" icon={<ShieldCheck className="size-4 text-[#8A641A]" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Corporate Account Reference">
            <Input
              value={form.corporateAccountReference}
              onChange={(e) => setForm((p) => ({ ...p, corporateAccountReference: e.target.value }))}
            />
          </Field>
          <Field label="Negotiated Rate Reference">
            <Input
              value={form.negotiatedRateReference}
              onChange={(e) => setForm((p) => ({ ...p, negotiatedRateReference: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Source of Business">
          <Input
            value={form.sourceOfBusiness}
            onChange={(e) => setForm((p) => ({ ...p, sourceOfBusiness: e.target.value }))}
          />
        </Field>
        <Field label="Billing Instruction">
          <Input
            value={form.billingInstruction}
            onChange={(e) => setForm((p) => ({ ...p, billingInstruction: e.target.value }))}
          />
        </Field>
      </Section>
    </div>
  );
}

export const GuestCompanyCorporate = GuestCompanyDetailsView;

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2">
        {icon}
        <h3 className="font-display text-base font-bold text-[#251605]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-[#756A5B]">{label}</Label>
      {children}
    </div>
  );
}
