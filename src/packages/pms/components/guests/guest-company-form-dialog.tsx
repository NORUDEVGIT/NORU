import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { createGuestAccount, listGuestAccounts, updateGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  COMPANY_DEFAULT_TA_COPY,
  COMPANY_RATE_REFERENCE_COPY,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  validateCompanyType,
  type CompanyType,
} from "@/packages/pms/lib/guest-profile-company";
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
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: GuestAccountProfile | null | undefined;
  onSaved?: ((accountId: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createGuestAccount);
  const update = useServerFn(updateGuestAccount);
  const fetchAgents = useServerFn(listGuestAccounts);
  const [form, setForm] = useState<CompanyFormValues>(EMPTY);

  useEffect(() => {
    if (open) setForm(account ? fromProfile(account) : EMPTY);
  }, [open, account]);

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
      const typeError = validateCompanyType(form.companyType || null, form.companyTypeOther);
      if (typeError) throw new Error(typeError);
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
        companyType: form.companyType,
        companyTypeOther: form.companyTypeOther,
        taxId: form.taxId,
        businessRegistrationNumber: form.businessRegistrationNumber,
        phoneAlt: form.phoneAlt,
        emailAlt: form.emailAlt,
        primaryContactName: form.primaryContactName,
        addressLine2: form.addressLine2,
        region: form.region,
        postalCode: form.postalCode,
        corporateAccountReference: form.corporateAccountReference,
        negotiatedRateReference: form.negotiatedRateReference,
        defaultTravelAgentMasterId: form.defaultTravelAgentMasterId || null,
        sourceOfBusiness: form.sourceOfBusiness,
      };
      if (account) {
        await update({ data: { restaurantId, accountId: account.id, account: payload } });
        return account.id;
      }
      const res = await create({ data: { restaurantId, accountType: "company", account: payload } });
      return res.id;
    },
    onSuccess: (id) => {
      toast.success(account ? "Company updated." : "Company created.");
      void queryClient.invalidateQueries({ queryKey: ["guest-accounts", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="guest-account-form">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Company" : "New Company"}</DialogTitle>
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
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
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
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Company type</Label>
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
                <SelectTrigger data-testid="company-type">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Choose type</SelectItem>
                  {COMPANY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {COMPANY_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.companyType === "other" ? (
              <div>
                <Label htmlFor="company-type-other">Other type</Label>
                <Input
                  id="company-type-other"
                  data-testid="company-type-other"
                  value={form.companyTypeOther}
                  onChange={(e) => setForm((prev) => ({ ...prev, companyTypeOther: e.target.value }))}
                />
              </div>
            ) : null}
          </Section>

          <Section id="tax" title="Tax">
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
            <div>
              <Label htmlFor="company-contact-name">Primary contact person</Label>
              <Input
                id="company-contact-name"
                data-testid="company-contact-name"
                value={form.primaryContactName}
                onChange={(e) => setForm((prev) => ({ ...prev, primaryContactName: e.target.value }))}
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
                <Input
                  id="guest-account-country"
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                />
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
                  {(agentsQuery.data ?? []).map((row) => (
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
            {save.isPending ? "Saving…" : account ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
