import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getGuestAccount, updateGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { getCompanyBusinessWorkspace } from "@/packages/pms/lib/guest-companies.functions";
import { validateCompanyAgainstType } from "@/packages/pms/lib/guest-companies-workspace";
import { ISO_COUNTRIES, countryCodeFromInput } from "@/packages/pms/lib/pms-geography";
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
    sourceOfBusiness: "",
    paymentTerms: "",
    creditLimitNote: "",
    billingInstruction: "",
  };
}

export function GuestCompanyCorporate({
  restaurantId,
  companyId,
  onOpenEditDialog,
}: {
  restaurantId: string;
  companyId: string;
  onOpenEditDialog: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getGuestAccount);
  const fetchConfig = useServerFn(getCompanyBusinessWorkspace);
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
      country: account.country ? countryCodeFromInput(account.country) : "",
      postalCode: account.postalCode ?? "",
      corporateAccountReference: account.corporateAccountReference ?? "",
      negotiatedRateReference: account.negotiatedRateReference ?? "",
      sourceOfBusiness: account.sourceOfBusiness ?? "",
      paymentTerms: account.paymentTerms ?? "",
      creditLimitNote: account.creditLimitNote ?? "",
      billingInstruction: account.billingInstruction ?? "",
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
  }, [accountQuery.data]);

  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const types = configQuery.data?.types ?? [];
  const activeTypes = types.filter((type) => type.active);
  const selectedType =
    types.find((type) => type.id === form.businessProfileTypeId) ??
    activeTypes.find((type) => type.id === form.businessProfileTypeId);
  const creditAllowed = selectedType?.creditAccountAllowed ?? false;
  const typeOptions = types.filter((type) => type.active || type.id === form.businessProfileTypeId);

  const rules = useMemo(
    () => [
      selectedType?.taxIdRequired ? "Tax ID is required for this business type." : null,
      selectedType?.contactRequired ? "A primary contact and phone or email are required." : null,
      creditAllowed ? "Credit accounts are allowed for this type." : "Credit accounts are not allowed for this type.",
    ].filter(Boolean),
    [selectedType, creditAllowed],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Legal / company name is required.");
      if (!form.businessProfileTypeId) throw new Error("Select a company type.");
      const typeError = validateCompanyType(form.companyType || null, form.companyTypeOther);
      if (typeError) throw new Error(typeError);
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
        if (settingsError) throw new Error(settingsError);
      }
      await update({
        data: {
          restaurantId,
          accountId: companyId,
          account: {
            name: form.name,
            code: form.code,
            email: form.email,
            phone: form.phone,
            addressLine1: form.addressLine1,
            city: form.city,
            country: form.country,
            accountStatus: form.accountStatus,
            tradeName: form.tradeName,
            companyType: form.companyType || null,
            companyTypeOther: form.companyTypeOther,
            taxId: form.taxId,
            businessRegistrationNumber: form.businessRegistrationNumber,
            phoneAlt: form.phoneAlt,
            emailAlt: form.emailAlt,
            primaryContactName: form.primaryContactName,
            primaryContactTitle: form.primaryContactTitle,
            website: form.website,
            businessProfileTypeId: form.businessProfileTypeId,
            creditAccountEnabled: creditAllowed ? form.creditAccountEnabled : false,
            addressLine2: form.addressLine2,
            region: form.region,
            postalCode: form.postalCode,
            corporateAccountReference: form.corporateAccountReference,
            negotiatedRateReference: form.negotiatedRateReference,
            sourceOfBusiness: form.sourceOfBusiness,
            paymentTerms: creditAllowed ? form.paymentTerms : "",
            creditLimitNote: creditAllowed ? form.creditLimitNote : "",
            billingInstruction: form.billingInstruction,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Corporate details saved.");
      setBaseline(JSON.stringify(form));
      await queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accountQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading corporate details…</p>;
  if (accountQuery.error || !accountQuery.data) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="company-corporate-error">
        <p className="font-display text-lg">Corporate details unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(accountQuery.error as Error | undefined)?.message ?? "This company could not be loaded."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="company-corporate">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Corporate Details</h2>
          <p className="text-sm text-muted-foreground">
            Company identity stays on this Guest Profile. Card 4 rules control tax, contact, and credit fields.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onOpenEditDialog}>
            Edit in dialog
          </Button>
          <Button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </div>
      </div>
      {dirty ? <p className="text-sm text-amber-700">You have unsaved changes.</p> : null}
      {rules.length ? (
        <ul className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Company Information">
        <Field label="Legal / company name">
          <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        </Field>
        <Field label="Trade / display name">
          <Input value={form.tradeName} onChange={(event) => setForm((prev) => ({ ...prev, tradeName: event.target.value }))} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code">
            <Input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} />
          </Field>
          <Field label="Status">
            <Select
              value={form.accountStatus}
              onValueChange={(value) => setForm((prev) => ({ ...prev, accountStatus: value as GuestAccountStatus }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GUEST_ACCOUNT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Business type">
          <Select
            value={form.businessProfileTypeId || "__none"}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                businessProfileTypeId: value === "__none" ? "" : value,
                creditAccountEnabled: types.find((type) => type.id === value)?.creditAccountAllowed
                  ? prev.creditAccountEnabled
                  : false,
              }))
            }
          >
            <SelectTrigger data-testid="company-corporate-type"><SelectValue placeholder="Choose type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Choose type</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}{type.active ? "" : " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Legal form">
          <Select
            value={form.companyType || "__none"}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                companyType: value === "__none" ? "" : (value as CompanyType),
                companyTypeOther: value === "other" ? prev.companyTypeOther : "",
              }))
            }
          >
            <SelectTrigger><SelectValue placeholder="Choose form" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Choose form</SelectItem>
              {COMPANY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{COMPANY_TYPE_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {form.companyType === "other" ? (
          <Field label="Other legal form">
            <Input value={form.companyTypeOther} onChange={(event) => setForm((prev) => ({ ...prev, companyTypeOther: event.target.value }))} />
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tax ID / TIN">
            <Input value={form.taxId} onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))} />
          </Field>
          <Field label="Business registration number">
            <Input value={form.businessRegistrationNumber} onChange={(event) => setForm((prev) => ({ ...prev, businessRegistrationNumber: event.target.value }))} />
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary phone">
            <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
          </Field>
          <Field label="Alternate phone">
            <Input value={form.phoneAlt} onChange={(event) => setForm((prev) => ({ ...prev, phoneAlt: event.target.value }))} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business email">
            <Input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
          </Field>
          <Field label="Alternate email">
            <Input value={form.emailAlt} onChange={(event) => setForm((prev) => ({ ...prev, emailAlt: event.target.value }))} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary contact">
            <Input value={form.primaryContactName} onChange={(event) => setForm((prev) => ({ ...prev, primaryContactName: event.target.value }))} />
          </Field>
          <Field label="Job title">
            <Input value={form.primaryContactTitle} onChange={(event) => setForm((prev) => ({ ...prev, primaryContactTitle: event.target.value }))} />
          </Field>
        </div>
        <Field label="Website">
          <Input value={form.website} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} />
        </Field>
      </Section>

      <Section title="Address">
        <Field label="Address line 1">
          <Input value={form.addressLine1} onChange={(event) => setForm((prev) => ({ ...prev, addressLine1: event.target.value }))} />
        </Field>
        <Field label="District / line 2">
          <Input value={form.addressLine2} onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value }))} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City">
            <Input value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
          </Field>
          <Field label="Region / state">
            <Input value={form.region} onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Country">
            <Select
              value={form.country || "__none"}
              onValueChange={(value) => setForm((prev) => ({ ...prev, country: value === "__none" ? "" : value }))}
            >
              <SelectTrigger><SelectValue placeholder="Choose country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Choose country</SelectItem>
                {ISO_COUNTRIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Postal code">
            <Input value={form.postalCode} onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))} />
          </Field>
        </div>
      </Section>

      <Section title="Business Information">
        <Field label="Market segment / source of business">
          <Input value={form.sourceOfBusiness} onChange={(event) => setForm((prev) => ({ ...prev, sourceOfBusiness: event.target.value }))} />
        </Field>
        <Field label="Corporate account reference">
          <Input value={form.corporateAccountReference} onChange={(event) => setForm((prev) => ({ ...prev, corporateAccountReference: event.target.value }))} />
        </Field>
        <Field label="Negotiated rate reference">
          <Input value={form.negotiatedRateReference} onChange={(event) => setForm((prev) => ({ ...prev, negotiatedRateReference: event.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.creditAccountEnabled}
            disabled={!creditAllowed}
            onChange={(event) => setForm((prev) => ({ ...prev, creditAccountEnabled: event.target.checked }))}
          />
          Credit account enabled
        </label>
        <Field label="Payment terms">
          <Input
            value={form.paymentTerms}
            disabled={!creditAllowed}
            onChange={(event) => setForm((prev) => ({ ...prev, paymentTerms: event.target.value }))}
          />
        </Field>
        <Field label="Credit limit note">
          <Input
            value={form.creditLimitNote}
            disabled={!creditAllowed}
            onChange={(event) => setForm((prev) => ({ ...prev, creditLimitNote: event.target.value }))}
          />
        </Field>
        {!creditAllowed ? (
          <p className="text-sm text-muted-foreground">
            These credit fields stay visible. Card 4 does not allow a credit account for this business type, so they cannot be saved on.
          </p>
        ) : null}
        <Field label="Billing instruction">
          <Input value={form.billingInstruction} onChange={(event) => setForm((prev) => ({ ...prev, billingInstruction: event.target.value }))} />
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-lg">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
