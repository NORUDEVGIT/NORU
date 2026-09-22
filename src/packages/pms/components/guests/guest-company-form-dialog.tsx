import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { createGuestAccount, getGuestAccount, listGuestAccounts, updateGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  createCompanyLogoUpload,
  findCompanyDuplicates,
  getCompanyBusinessWorkspace,
  saveCompanyLogo,
} from "@/packages/pms/lib/guest-companies.functions";
import { defaultBusinessTypeId, validateCompanyAgainstType } from "@/packages/pms/lib/guest-companies-workspace";
import { supabase } from "@/integrations/supabase/client";
import { ISO_COUNTRIES, countryCodeFromInput } from "@/packages/pms/lib/pms-geography";
import { accountListItems } from "@/packages/pms/lib/guest-profile-wave4";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import {
  COMPANY_DEFAULT_TA_COPY,
  COMPANY_RATE_REFERENCE_COPY,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  validateCompanyType,
  type CompanyType,
} from "@/packages/pms/lib/guest-profile-company";
import { PAYMENT_TERMS_REFERENCE_COPY } from "@/packages/pms/lib/guest-profile-travel-agency";
import {
  type GuestAccountProfile,
  type GuestAccountStatus,
} from "@/packages/pms/lib/guest-profile-wave4";
import { Button } from "@/shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type CompanyFormValues = {
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
  acknowledgeNameDuplicate: boolean;
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
  notes: string;
};

const EMPTY: CompanyFormValues = {
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
  acknowledgeNameDuplicate: false,
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
  notes: "",
};

function fromProfile(account: GuestAccountProfile): CompanyFormValues {
  return {
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
    acknowledgeNameDuplicate: false,
    addressLine1: account.addressLine1 ?? "",
    addressLine2: account.addressLine2 ?? "",
    city: account.city ?? "",
    region: account.region ?? "",
    country: account.country ? countryCodeFromInput(account.country) : "",
    postalCode: account.postalCode ?? "",
    corporateAccountReference: account.corporateAccountReference ?? "",
    negotiatedRateReference: account.negotiatedRateReference ?? "",
    defaultTravelAgentMasterId: account.defaultTravelAgentMasterId ?? "",
    sourceOfBusiness: account.sourceOfBusiness ?? "",
    paymentTerms: account.paymentTerms ?? "",
    creditLimitNote: account.creditLimitNote ?? "",
    billingInstruction: account.billingInstruction ?? "",
    notes: account.notes ?? "",
  };
}

function Section({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border"
      data-testid={`company-section-${id}`}
      data-open={open ? "true" : "false"}
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
        data-testid={`company-section-${id}-toggle`}
      >
        {title}
        <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t border-border px-3 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GuestCompanyFormDialog({
  restaurantId,
  open,
  onOpenChange,
  account,
  accountId,
  defaultBusinessTypeId: defaultTypeProp,
  focusCredit = false,
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: GuestAccountProfile | null | undefined;
  accountId?: string | undefined;
  defaultBusinessTypeId?: string | null;
  focusCredit?: boolean;
  onSaved?: ((accountId: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createGuestAccount);
  const update = useServerFn(updateGuestAccount);
  const fetchAgents = useServerFn(listGuestAccounts);
  const fetchAccount = useServerFn(getGuestAccount);
  const fetchConfig = useServerFn(getCompanyBusinessWorkspace);
  const fetchDuplicates = useServerFn(findCompanyDuplicates);
  const startLogoUpload = useServerFn(createCompanyLogoUpload);
  const persistLogo = useServerFn(saveCompanyLogo);
  const [form, setForm] = useState<CompanyFormValues>(EMPTY);
  const [nameWarning, setNameWarning] = useState<{ id: string; name: string } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const loadedAccountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, accountId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: accountId! } }),
    enabled: open && Boolean(accountId) && !account,
    retry: false,
  });
  const editing = account ?? loadedAccountQuery.data ?? null;

  const configQuery = useQuery({
    queryKey: ["company-business-workspace", restaurantId],
    queryFn: () => fetchConfig({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });
  const types = configQuery.data?.types ?? [];
  const activeTypes = types.filter((type) => type.active);
  const selectedType =
    types.find((type) => type.id === form.businessProfileTypeId) ??
    activeTypes.find((type) => type.id === form.businessProfileTypeId);
  const creditAllowed = selectedType?.creditAccountAllowed ?? false;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm(fromProfile(editing));
      setNameWarning(null);
      setLogoFile(null);
      return;
    }
    const preset =
      defaultTypeProp ??
      defaultBusinessTypeId(configQuery.data?.settings ?? { defaultBusinessTypeId: null }, types);
    setForm({ ...EMPTY, businessProfileTypeId: preset ?? "" });
    setNameWarning(null);
    setLogoFile(null);
  }, [open, editing, defaultTypeProp, configQuery.data?.settings, types]);

  const agentsQuery = useQuery({
    queryKey: ["guest-accounts", restaurantId, "travel_agent", "company-default-ta"],
    queryFn: () =>
      fetchAgents({
        data: { restaurantId, accountType: "travel_agent", status: "active", limit: 100 },
      }),
    enabled: open,
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim() === "") throw new Error("Legal / company name is required.");
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
          editing ? "update" : "create",
        );
        if (settingsError) throw new Error(settingsError);
      }
      if (!editing && !form.acknowledgeNameDuplicate) {
        const duplicates = await fetchDuplicates({
          data: {
            restaurantId,
            name: form.name,
            taxId: form.taxId,
            businessRegistrationNumber: form.businessRegistrationNumber,
            email: form.email,
            phone: form.phone,
          },
        });
        const nameHit = duplicates.find((row) => !row.blocking);
        if (nameHit) {
          setNameWarning({ id: nameHit.id, name: nameHit.name });
          throw new Error("A company with a similar name already exists. Open it or confirm to continue.");
        }
      }
      const payload = {
        name: form.name,
        code: form.code,
        email: form.email,
        phone: form.phone,
        addressLine1: form.addressLine1,
        city: form.city,
        country: form.country,
        notes: form.notes,
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
        creditAccountEnabled: form.creditAccountEnabled,
        acknowledgeNameDuplicate: form.acknowledgeNameDuplicate,
        addressLine2: form.addressLine2,
        region: form.region,
        postalCode: form.postalCode,
        corporateAccountReference: form.corporateAccountReference,
        negotiatedRateReference: form.negotiatedRateReference,
        defaultTravelAgentMasterId: form.defaultTravelAgentMasterId || null,
        sourceOfBusiness: form.sourceOfBusiness,
        paymentTerms: creditAllowed ? form.paymentTerms : "",
        creditLimitNote: creditAllowed ? form.creditLimitNote : "",
        billingInstruction: form.billingInstruction,
      };
      let id: string;
      if (editing) {
        await update({ data: { restaurantId, accountId: editing.id, account: payload } });
        id = editing.id;
      } else {
        const res = await create({ data: { restaurantId, accountType: "company", account: payload } });
        id = res.id;
      }
      if (logoFile) {
        const allowed = ["image/jpeg", "image/png", "image/webp"] as const;
        if (!(allowed as readonly string[]).includes(logoFile.type)) {
          throw new Error("Logo must be JPG, PNG, or WebP.");
        }
        const ticket = await startLogoUpload({
          data: {
            restaurantId,
            companyId: id,
            contentType: logoFile.type as (typeof allowed)[number],
            size: logoFile.size,
          },
        });
        const uploaded = await supabase.storage
          .from("property-images")
          .uploadToSignedUrl(ticket.path, ticket.token, logoFile);
        if (uploaded.error) throw new Error("Logo upload failed.");
        await persistLogo({ data: { restaurantId, companyId: id, path: ticket.path } });
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success(editing ? "Company updated." : "Company created.");
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["company-workspace"] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="guest-account-form">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Company" : "Register New Company"}</DialogTitle>
          <DialogDescription>
            Sectioned Company registration. Create once in Guest. Reservations and Front Office
            consume this Company master.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3" data-testid="company-form-sections">
          <Section id="basic" title="Basic" defaultOpen>
            <div>
              <Label htmlFor="guest-account-name">Legal / company name</Label>
              <Input
                id="guest-account-name"
                data-testid="guest-account-name"
                value={form.name}
                onChange={(e) => {
                  setNameWarning(null);
                  setForm((prev) => ({ ...prev, name: e.target.value, acknowledgeNameDuplicate: false }));
                }}
              />
              {nameWarning ? (
                <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="company-name-duplicate">
                  <p>A similar company already exists: {nameWarning.name}.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onSaved?.(nameWarning.id);
                        onOpenChange(false);
                      }}
                    >
                      Open Existing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, acknowledgeNameDuplicate: true }));
                        setNameWarning(null);
                        save.mutate();
                      }}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <Label htmlFor="company-trade-name">Trade / display name</Label>
              <Input
                id="company-trade-name"
                data-testid="company-trade-name"
                value={form.tradeName}
                onChange={(e) => setForm((prev) => ({ ...prev, tradeName: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-code">Code</Label>
                <Input
                  id="guest-account-code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.accountStatus}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, accountStatus: value as GuestAccountStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Company type</Label>
              <Select
                value={form.businessProfileTypeId || "__none"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    businessProfileTypeId: value === "__none" ? "" : value,
                    creditAccountEnabled:
                      types.find((type) => type.id === value)?.creditAccountAllowed
                        ? prev.creditAccountEnabled
                        : false,
                  }))
                }
              >
                <SelectTrigger data-testid="company-type">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Choose type</SelectItem>
                  {(editing ? types.filter((type) => type.active || type.id === form.businessProfileTypeId) : activeTypes).map(
                    (type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                        {type.active ? "" : " (inactive)"}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Legal form</Label>
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
                <SelectTrigger data-testid="company-legal-form">
                    <SelectItem key={type} value={type}>
                      {COMPANY_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="company-logo">Logo</Label>
              <Input
                id="company-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                data-testid="company-logo"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {form.companyType === "other" ? (
              <div>
                <Label htmlFor="company-type-other">Other legal form</Label>
                <Input
                  id="company-type-other"
                  data-testid="company-type-other"
                  value={form.companyTypeOther}
                  onChange={(e) => setForm((prev) => ({ ...prev, companyTypeOther: e.target.value }))}
                />
              </div>
            ) : null}
          </Section>

          <Section id="tax" title="Tax & registration">
            <div>
              <Label htmlFor="company-tax-id">Tax ID / TIN</Label>
              <Input
                id="company-tax-id"
                data-testid="company-tax-id"
                value={form.taxId}
                onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="company-business-reg">Business registration number</Label>
              <Input
                id="company-business-reg"
                data-testid="company-business-reg"
                value={form.businessRegistrationNumber}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, businessRegistrationNumber: e.target.value }))
                }
              />
            </div>
          </Section>

          <Section id="contact" title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-phone">Primary phone</Label>
                <Input
                  id="guest-account-phone"
                  data-testid="company-phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="company-phone-alt">Alternate phone</Label>
                <Input
                  id="company-phone-alt"
                  data-testid="company-phone-alt"
                  value={form.phoneAlt}
                  onChange={(e) => setForm((prev) => ({ ...prev, phoneAlt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-email">Business / primary email</Label>
                <Input
                  id="guest-account-email"
                  data-testid="company-email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="company-email-alt">Alternate email</Label>
                <Input
                  id="company-email-alt"
                  data-testid="company-email-alt"
                  value={form.emailAlt}
                  onChange={(e) => setForm((prev) => ({ ...prev, emailAlt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="company-contact-name">Primary contact person</Label>
                <Input
                  id="company-contact-name"
                  data-testid="company-contact-name"
                  value={form.primaryContactName}
                  onChange={(e) => setForm((prev) => ({ ...prev, primaryContactName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="company-job-title">Job title</Label>
                <Input
                  id="company-job-title"
                  data-testid="company-job-title"
                  value={form.primaryContactTitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, primaryContactTitle: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="company-website">Website</Label>
              <Input
                id="company-website"
                data-testid="company-website"
                value={form.website}
                onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              />
            </div>
          </Section>

          <Section id="address" title="Address">
            <div>
              <Label htmlFor="guest-account-address">Address line 1</Label>
              <Input
                id="guest-account-address"
                data-testid="company-address-line1"
                value={form.addressLine1}
                onChange={(e) => setForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="company-address-line2">Address line 2</Label>
              <Input
                id="company-address-line2"
                data-testid="company-address-line2"
                value={form.addressLine2}
                onChange={(e) => setForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-city">City</Label>
                <Input
                  id="guest-account-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="company-region">Region / state</Label>
                <Input
                  id="company-region"
                  data-testid="company-region"
                  value={form.region}
                  onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-country">Country</Label>
                <Select
                  value={form.country || "__none"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, country: value === "__none" ? "" : value }))
                  }
                >
                  <SelectTrigger id="guest-account-country" data-testid="company-country">
                    <SelectValue placeholder="Choose country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Choose country</SelectItem>
                    {ISO_COUNTRIES.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="company-postal">Postal code</Label>
                <Input
                  id="company-postal"
                  data-testid="company-postal"
                  value={form.postalCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                />
              </div>
            </div>
          </Section>

          <Section id="commercial" title="Commercial">
            <div>
              <Label htmlFor="company-corporate-ref">Corporate account reference</Label>
              <Input
                id="company-corporate-ref"
                data-testid="company-corporate-ref"
                value={form.corporateAccountReference}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, corporateAccountReference: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="company-negotiated-rate-ref">Negotiated rate reference</Label>
              <Input
                id="company-negotiated-rate-ref"
                data-testid="company-negotiated-rate-ref"
                value={form.negotiatedRateReference}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, negotiatedRateReference: e.target.value }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">{COMPANY_RATE_REFERENCE_COPY}</p>
            </div>
            <div>
              <Label>Default travel agent</Label>
              <Select
                value={form.defaultTravelAgentMasterId || "__none"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultTravelAgentMasterId: value === "__none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger data-testid="company-default-ta">
                  <SelectValue placeholder="Choose a Travel Agent master" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {accountListItems(agentsQuery.data).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{COMPANY_DEFAULT_TA_COPY}</p>
            </div>
            <div>
              <Label htmlFor="company-source-of-business">Source of business</Label>
              <Input
                id="company-source-of-business"
                data-testid="company-source-of-business"
                value={form.sourceOfBusiness}
                onChange={(e) => setForm((prev) => ({ ...prev, sourceOfBusiness: e.target.value }))}
              />
            </div>
          </Section>

          {creditAllowed ? (
          <Section id="payment-terms" title="Credit account" defaultOpen={focusCredit}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="company-credit-enabled"
                checked={form.creditAccountEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, creditAccountEnabled: e.target.checked }))}
              />
              Enable credit account
            </label>
            <p className="text-xs text-muted-foreground">{PAYMENT_TERMS_REFERENCE_COPY}</p>
            <div>
              <Label htmlFor="company-payment-terms">Terms code / label</Label>
              <Input
                id="company-payment-terms"
                data-testid="company-payment-terms"
                value={form.paymentTerms}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                disabled={!form.creditAccountEnabled}
              />
            </div>
            <div>
              <Label htmlFor="company-credit-limit">Credit limit note</Label>
              <Input
                id="company-credit-limit"
                data-testid="company-credit-limit"
                value={form.creditLimitNote}
                onChange={(e) => setForm((prev) => ({ ...prev, creditLimitNote: e.target.value }))}
                disabled={!form.creditAccountEnabled}
              />
            </div>
            <div>
              <Label htmlFor="company-billing-instruction">Billing instruction</Label>
              <Textarea
                id="company-billing-instruction"
                data-testid="company-billing-instruction"
                value={form.billingInstruction}
                onChange={(e) => setForm((prev) => ({ ...prev, billingInstruction: e.target.value }))}
              />
            </div>
          </Section>
          ) : null}

          <Section id="notes" title="Notes">
            <div>
              <Label htmlFor="guest-account-notes">Notes</Label>
              <Textarea
                id="guest-account-notes"
                data-testid="company-notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </Section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-testid="guest-account-save" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
