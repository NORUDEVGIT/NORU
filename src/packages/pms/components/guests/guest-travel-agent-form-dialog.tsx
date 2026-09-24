import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { GuestFormStagedGuestLinks } from "@/packages/pms/components/guests/guest-form-staged-guest-links";
import { supabase } from "@/integrations/supabase/client";
import { createGuestAccount, linkGuestAccount, updateGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import {
  AGENCY_TYPE_LABELS,
  AGENCY_TYPES,
  TA_LICENSE_COPY,
  TA_MULTI_LINK_COPY,
  TA_PARTIAL_CREATE_COPY,
  TA_STAGED_CREATE_COPY,
  validateAgencyType,
  type AgencyType,
  type CommissionType,
  type ContractStatus,
  type StagedGuestLink,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import { TA_FORM_OPERATIONAL_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";
import {
  createTravelAgentLogoUpload,
  saveTravelAgentLogo,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
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

type TaFormValues = {
  name: string;
  tradeName: string;
  code: string;
  agencyType: AgencyType | "";
  agencyTypeOther: string;
  accountStatus: GuestAccountStatus;
  website: string;
  phone: string;
  phoneAlt: string;
  email: string;
  emailAlt: string;
  primaryContactName: string;
  billingContactName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  iataLicenseNumber: string;
  businessRegistrationNumber: string;
  taxId: string;
  licenseExpiryDate: string;
  commissionLabel: string;
  commissionType: CommissionType | "";
  commissionCurrencyNote: string;
  contractReference: string;
  contractStartDate: string;
  contractEndDate: string;
  contractStatus: ContractStatus | "";
  contractSignedWith: string;
  negotiatedRateReference: string;
  paymentTerms: string;
  creditLimitNote: string;
  billingInstruction: string;
  notes: string;
};

const EMPTY: TaFormValues = {
  name: "",
  tradeName: "",
  code: "",
  agencyType: "",
  agencyTypeOther: "",
  accountStatus: "active",
  website: "",
  phone: "",
  phoneAlt: "",
  email: "",
  emailAlt: "",
  primaryContactName: "",
  billingContactName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  country: "",
  postalCode: "",
  iataLicenseNumber: "",
  businessRegistrationNumber: "",
  taxId: "",
  licenseExpiryDate: "",
  commissionLabel: "",
  commissionType: "",
  commissionCurrencyNote: "",
  contractReference: "",
  contractStartDate: "",
  contractEndDate: "",
  contractStatus: "",
  contractSignedWith: "",
  negotiatedRateReference: "",
  paymentTerms: "",
  creditLimitNote: "",
  billingInstruction: "",
  notes: "",
};

function fromProfile(account: GuestAccountProfile): TaFormValues {
  return {
    name: account.name,
    tradeName: account.tradeName ?? "",
    code: account.code ?? "",
    agencyType: (account.agencyType as AgencyType | null) ?? "",
    agencyTypeOther: account.agencyTypeOther ?? "",
    accountStatus: account.accountStatus,
    website: account.website ?? "",
    phone: account.phone ?? "",
    phoneAlt: account.phoneAlt ?? "",
    email: account.email ?? "",
    emailAlt: account.emailAlt ?? "",
    primaryContactName: account.primaryContactName ?? "",
    billingContactName: account.billingContactName ?? "",
    addressLine1: account.addressLine1 ?? "",
    addressLine2: account.addressLine2 ?? "",
    city: account.city ?? "",
    region: account.region ?? "",
    country: account.country ?? "",
    postalCode: account.postalCode ?? "",
    iataLicenseNumber: account.iataLicenseNumber ?? "",
    businessRegistrationNumber: account.businessRegistrationNumber ?? "",
    taxId: account.taxId ?? "",
    licenseExpiryDate: account.licenseExpiryDate ?? "",
    commissionLabel: account.commissionLabel ?? "",
    commissionType: (account.commissionType as CommissionType | null) ?? "",
    commissionCurrencyNote: account.commissionCurrencyNote ?? "",
    contractReference: account.contractReference ?? "",
    contractStartDate: account.contractStartDate ?? "",
    contractEndDate: account.contractEndDate ?? "",
    contractStatus: (account.contractStatus as ContractStatus | null) ?? "",
    contractSignedWith: account.contractSignedWith ?? "",
    negotiatedRateReference: account.negotiatedRateReference ?? "",
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
      data-testid={`ta-section-${id}`}
      data-open={open ? "true" : "false"}
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
        data-testid={`ta-section-${id}-toggle`}
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

export function GuestTravelAgentFormDialog({
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
  const submitLink = useServerFn(linkGuestAccount);
  const startLogoUpload = useServerFn(createTravelAgentLogoUpload);
  const persistLogo = useServerFn(saveTravelAgentLogo);
  const [form, setForm] = useState<TaFormValues>(EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [stagedLinks, setStagedLinks] = useState<StagedGuestLink[]>([]);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [followupErrors, setFollowupErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setForm(account ? fromProfile(account) : EMPTY);
      setLogoFile(null);
      setStagedLinks([]);
      setCreatedAccountId(null);
      setFollowupErrors([]);
    }
  }, [open, account]);

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
    agencyType: form.agencyType,
    agencyTypeOther: form.agencyTypeOther,
    website: form.website,
    phoneAlt: form.phoneAlt,
    emailAlt: form.emailAlt,
    primaryContactName: form.primaryContactName,
    billingContactName: form.billingContactName,
    addressLine2: form.addressLine2,
    region: form.region,
    postalCode: form.postalCode,
    iataLicenseNumber: form.iataLicenseNumber,
    businessRegistrationNumber: form.businessRegistrationNumber,
    taxId: form.taxId,
    licenseExpiryDate: form.licenseExpiryDate,
    commissionLabel: form.commissionLabel,
    commissionType: form.commissionType || null,
    commissionCurrencyNote: form.commissionCurrencyNote,
    contractReference: form.contractReference,
    contractStartDate: form.contractStartDate,
    contractEndDate: form.contractEndDate,
    contractStatus: form.contractStatus || null,
    contractSignedWith: form.contractSignedWith,
    negotiatedRateReference: form.negotiatedRateReference,
    paymentTerms: form.paymentTerms,
    creditLimitNote: form.creditLimitNote,
    billingInstruction: form.billingInstruction,
  };

  async function applyStagedFollowups(accountId: string) {
    const remaining: StagedGuestLink[] = [];
    const errors: string[] = [];
    for (const item of stagedLinks) {
      try {
        await submitLink({
          data: { restaurantId, guestId: item.guestId, accountId, role: item.role },
        });
      } catch (error) {
        remaining.push(item);
        errors.push(error instanceof Error ? error.message : "Link failed.");
      }
    }
    setStagedLinks(remaining);
    setFollowupErrors(errors);
    return errors.length === 0;
  }

  async function uploadLogoIfNeeded(agencyId: string) {
    if (!logoFile) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"] as const;
    if (!(allowed as readonly string[]).includes(logoFile.type)) {
      throw new Error("Logo must be JPG, PNG, or WebP.");
    }
    const ticket = await startLogoUpload({
      data: {
        restaurantId,
        agencyId,
        contentType: logoFile.type as (typeof allowed)[number],
        size: logoFile.size,
      },
    });
    const uploaded = await supabase.storage
      .from("property-images")
      .uploadToSignedUrl(ticket.path, ticket.token, logoFile);
    if (uploaded.error) throw new Error("Logo upload failed.");
    await persistLogo({ data: { restaurantId, agencyId, path: ticket.path } });
    setLogoFile(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim() === "") throw new Error("Legal / agency name is required.");
      const typeError = validateAgencyType(form.agencyType || null, form.agencyTypeOther);
      if (typeError) throw new Error(typeError);
      if (account) {
        await update({ data: { restaurantId, accountId: account.id, account: payload } });
        await uploadLogoIfNeeded(account.id);
        return { id: account.id, complete: true as const };
      }
      const accountId = createdAccountId
        ? createdAccountId
        : (await create({ data: { restaurantId, accountType: "travel_agent", account: payload } })).id;
      setCreatedAccountId(accountId);
      if (!createdAccountId) await uploadLogoIfNeeded(accountId);
      const complete = await applyStagedFollowups(accountId);
      return { id: accountId, complete };
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-account-links", restaurantId] });
      if (!result.complete) {
        toast.error(TA_PARTIAL_CREATE_COPY);
        return;
      }
      toast.success(account ? "Travel Agent updated." : "Travel Agent created.");
      onOpenChange(false);
      onSaved?.(result.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="guest-account-form">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Travel Agent" : "New Travel Agent"}</DialogTitle>
          <DialogDescription>
            Sectioned Travel Agent master. Create once in Guest. Reservations and Front Office
            consume this Travel Agent master. {TA_STAGED_CREATE_COPY}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3" data-testid="ta-form-sections">
          <Section id="agency" title="Agency Information" defaultOpen>
            <div>
              <Label htmlFor="guest-account-name">Legal / agency name</Label>
              <Input
                id="guest-account-name"
                data-testid="guest-account-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ta-trade-name">Trade / display name</Label>
              <Input
                id="ta-trade-name"
                data-testid="ta-trade-name"
                value={form.tradeName}
                onChange={(e) => setForm((prev) => ({ ...prev, tradeName: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-code">Code</Label>
                <Input
                  id="guest-account-code"
                  data-testid="ta-code"
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
                  <SelectTrigger data-testid="ta-status">
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
              <Label>Agency type</Label>
              <Select
                value={form.agencyType || "__none"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    agencyType: value === "__none" ? "" : (value as AgencyType),
                    agencyTypeOther: value === "other" ? prev.agencyTypeOther : "",
                  }))
                }
              >
                <SelectTrigger data-testid="ta-agency-type">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Choose type</SelectItem>
                  {AGENCY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {AGENCY_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.agencyType === "other" ? (
              <div>
                <Label htmlFor="ta-agency-type-other">Other type</Label>
                <Input
                  id="ta-agency-type-other"
                  data-testid="ta-agency-type-other"
                  value={form.agencyTypeOther}
                  onChange={(e) => setForm((prev) => ({ ...prev, agencyTypeOther: e.target.value }))}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="ta-website">Website</Label>
              <Input
                id="ta-website"
                data-testid="ta-website"
                value={form.website}
                onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ta-logo">Logo</Label>
              <Input
                id="ta-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                data-testid="ta-logo"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </Section>

          <Section id="contacts" title="Contacts">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-phone">Primary phone</Label>
                <Input
                  id="guest-account-phone"
                  data-testid="ta-phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ta-phone-alt">Alternate phone</Label>
                <Input
                  id="ta-phone-alt"
                  data-testid="ta-phone-alt"
                  value={form.phoneAlt}
                  onChange={(e) => setForm((prev) => ({ ...prev, phoneAlt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-email">Primary email</Label>
                <Input
                  id="guest-account-email"
                  data-testid="ta-email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ta-email-alt">Alternate email</Label>
                <Input
                  id="ta-email-alt"
                  data-testid="ta-email-alt"
                  value={form.emailAlt}
                  onChange={(e) => setForm((prev) => ({ ...prev, emailAlt: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ta-contact-name">Primary contact person</Label>
              <Input
                id="ta-contact-name"
                data-testid="ta-contact-name"
                value={form.primaryContactName}
                onChange={(e) => setForm((prev) => ({ ...prev, primaryContactName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ta-billing-contact">Billing contact</Label>
              <Input
                id="ta-billing-contact"
                data-testid="ta-billing-contact"
                value={form.billingContactName}
                onChange={(e) => setForm((prev) => ({ ...prev, billingContactName: e.target.value }))}
              />
            </div>
          </Section>

          <Section id="address" title="Address">
            <div>
              <Label htmlFor="guest-account-address">Address line 1</Label>
              <Input
                id="guest-account-address"
                data-testid="ta-address-line1"
                value={form.addressLine1}
                onChange={(e) => setForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ta-address-line2">Address line 2</Label>
              <Input
                id="ta-address-line2"
                data-testid="ta-address-line2"
                value={form.addressLine2}
                onChange={(e) => setForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-account-city">City</Label>
                <Input
                  id="guest-account-city"
                  data-testid="ta-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ta-region">Region / state</Label>
                <Input
                  id="ta-region"
                  data-testid="ta-region"
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
                  data-testid="ta-country"
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ta-postal">Postal code</Label>
                <Input
                  id="ta-postal"
                  data-testid="ta-postal"
                  value={form.postalCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                />
              </div>
            </div>
          </Section>

          <Section id="license" title="License / Registration">
            <p className="text-xs text-muted-foreground">{TA_LICENSE_COPY}</p>
            <div>
              <Label htmlFor="ta-iata">IATA / license number</Label>
              <Input
                id="ta-iata"
                data-testid="ta-iata"
                value={form.iataLicenseNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, iataLicenseNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ta-business-reg">Business registration number</Label>
              <Input
                id="ta-business-reg"
                data-testid="ta-business-reg"
                value={form.businessRegistrationNumber}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, businessRegistrationNumber: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ta-tax-id">Tax ID / TIN</Label>
                <Input
                  id="ta-tax-id"
                  data-testid="ta-tax-id"
                  value={form.taxId}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ta-license-expiry">License expiry</Label>
                <Input
                  id="ta-license-expiry"
                  data-testid="ta-license-expiry"
                  type="date"
                  value={form.licenseExpiryDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, licenseExpiryDate: e.target.value }))}
                />
              </div>
            </div>
          </Section>

          <Section id="operations" title="Operational settings">
            <p className="text-xs text-muted-foreground" data-testid="ta-form-operational-copy">
              {TA_FORM_OPERATIONAL_COPY}
            </p>
          </Section>

          <Section id="notes" title="Notes">
            <div>
              <Label htmlFor="guest-account-notes">Notes</Label>
              <Textarea
                id="guest-account-notes"
                data-testid="ta-notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </Section>

          {!account ? (
            <Section id="linking" title="Linking">
              <p className="text-xs text-muted-foreground">{TA_MULTI_LINK_COPY}</p>
              <GuestFormStagedGuestLinks
                restaurantId={restaurantId}
                links={stagedLinks}
                onChange={setStagedLinks}
              />
            </Section>
          ) : null}
        </div>

        {createdAccountId && followupErrors.length > 0 ? (
          <div
            className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
            data-testid="ta-create-partial-failure"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" /> Travel Agent created — remaining work failed
            </p>
            <p className="text-sm text-muted-foreground">{TA_PARTIAL_CREATE_COPY}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {followupErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <Button
              size="sm"
              data-testid="ta-create-retry"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              Retry remaining
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-testid="guest-account-save" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : account ? "Save" : createdAccountId ? "Retry remaining" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
