import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Globe, MapPin, Pencil, Phone, ShieldCheck, Users } from "lucide-react";

import {
  getGuestAccount,
  listGuestAccounts,
  updateGuestAccount,
} from "@/packages/pms/lib/guest-accounts.functions";
import { getCompanyBusinessWorkspace } from "@/packages/pms/lib/guest-companies.functions";
import { validateCompanyAgainstType } from "@/packages/pms/lib/guest-companies-workspace";
import {
  COMPANY_TYPE_LABELS,
  validateCompanyType,
  type CompanyType,
} from "@/packages/pms/lib/guest-profile-company";
import { type GuestAccountStatus } from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";

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
  onEdit,
}: {
  restaurantId: string;
  companyId: string;
  onOpenEditDialog?: () => void;
  onEdit?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getGuestAccount);
  const fetchConfig = useServerFn(getCompanyBusinessWorkspace);
  const fetchTravelAgents = useServerFn(listGuestAccounts);
  const update = useServerFn(updateGuestAccount);
  const [form, setForm] = useState<CorporateForm>(emptyForm);

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

  // Property Setup validation preservation
  const validationErrors = useMemo(() => {
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

  const mutation = useMutation({
    mutationFn: async () => {
      if (validationErrors.length) {
        throw new Error(validationErrors[0]);
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

  const defaultTravelAgent = travelAgentOptions.find(
    (ta) => ta.id === form.defaultTravelAgentMasterId,
  );
  const defaultTravelAgentDisplay =
    defaultTravelAgent?.name ??
    accountQuery.data?.defaultTravelAgentMasterName ??
    "None (Direct Corporate Booking)";

  const handleEdit = onOpenEditDialog || onEdit;

  return (
    <div className="space-y-5" data-testid="company-details-view">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Company Details</h2>
          <p className="text-xs text-[#756A5B]">
            Structured company profile, corporate assignment, and commercial reference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
            onClick={handleEdit}
            data-testid="company-details-edit-btn"
          >
            <Pencil className="mr-1.5 size-3.5" />
            Edit Company
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Section 1: Business Identity */}
        <Section title="Business Identity" icon={<Building2 className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Legal Company Name" value={form.name} />
            <InfoRow label="Trade Name" value={form.tradeName} />
            <InfoRow label="Company Code" value={form.code} />
            <InfoRow label="Business Profile Type" value={selectedType?.name ?? "Corporate"} />
            <InfoRow
              label="Legal Entity Form"
              value={form.companyType ? (COMPANY_TYPE_LABELS[form.companyType as CompanyType] ?? form.companyType) : "—"}
            />
            <InfoRow
              label="Account Status"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      form.accountStatus === "active" ? "bg-emerald-600" : "bg-stone-400"
                    }`}
                  />
                  <span className="capitalize font-semibold">{form.accountStatus}</span>
                </span>
              }
            />
          </div>
        </Section>

        {/* Section 2: Registration & Tax */}
        <Section title="Registration & Tax" icon={<ShieldCheck className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Tax ID" value={form.taxId} />
            <InfoRow label="Business Registration Number" value={form.businessRegistrationNumber} />
          </div>
        </Section>

        {/* Section 3: Contact Information */}
        <Section title="Contact Information" icon={<Phone className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Primary Phone" value={form.phone} />
            <InfoRow label="Alternate Phone" value={form.phoneAlt} />
            <InfoRow label="Business Email" value={form.email} />
            <InfoRow label="Alternate Email" value={form.emailAlt} />
            <InfoRow label="Website" value={form.website} />
            <InfoRow
              label="Primary Contact"
              value={
                form.primaryContactName
                  ? `${form.primaryContactName}${form.primaryContactTitle ? ` (${form.primaryContactTitle})` : ""}`
                  : "—"
              }
            />
          </div>
        </Section>

        {/* Section 4: Address */}
        <Section title="Address" icon={<MapPin className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Address Line 1" value={form.addressLine1} />
            <InfoRow label="Address Line 2" value={form.addressLine2} />
            <InfoRow label="City" value={form.city} />
            <InfoRow label="Region" value={form.region} />
            <InfoRow label="Postal Code" value={form.postalCode} />
            <InfoRow label="Country" value={form.country} />
          </div>
        </Section>

        {/* Section 5: Corporate Assignment */}
        <Section title="Corporate Assignment" icon={<Users className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow label="Corporate Account Reference" value={form.corporateAccountReference} />
            <InfoRow label="Source of Business" value={form.sourceOfBusiness} />
            <InfoRow
              label="Default Travel Agency Relationship"
              value={defaultTravelAgentDisplay}
            />
          </div>
        </Section>

        {/* Section 6: Commercial Reference */}
        <Section title="Commercial Reference" icon={<Globe className="size-4 text-[#8A641A]" />}>
          <div className="space-y-1 text-xs">
            <InfoRow
              label="Negotiated Rate Reference"
              value={
                form.negotiatedRateReference ? (
                  <span>
                    {form.negotiatedRateReference}{" "}
                    <span className="text-[10px] text-[#756A5B] font-normal">(Reference only)</span>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow label="Payment Terms" value={form.paymentTerms} />
            <InfoRow
              label="Credit Account"
              value={form.creditAccountEnabled ? "Enabled" : "Disabled"}
            />
            <InfoRow label="Credit Limit Note" value={form.creditLimitNote} />
            <InfoRow label="Billing Instruction" value={form.billingInstruction} />
          </div>
        </Section>
      </div>

      {/* Section 7: Audit */}
      <Section title="Audit Metadata" icon={<Building2 className="size-4 text-[#8A641A]" />}>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <InfoRow label="System ID" value={companyId} truncate />
          <InfoRow label="Created" value={accountQuery.data?.createdAt ? new Date(accountQuery.data.createdAt).toLocaleString() : "—"} />
          <InfoRow label="Last Updated" value={accountQuery.data?.updatedAt ? new Date(accountQuery.data.updatedAt).toLocaleString() : "—"} />
        </div>
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
    <section className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2">
        {icon}
        <h3 className="font-display text-sm font-bold text-[#251605]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-[#EFE9DF]/50 last:border-b-0">
      <span className="shrink-0 text-[#756A5B]">{label}</span>
      <span
        className={`text-right font-medium text-[#251605] ${
          truncate ? "truncate max-w-[200px]" : ""
        }`}
      >
        {value != null && value !== "" ? value : "—"}
      </span>
    </div>
  );
}
