import { useMemo, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/shared/components/ui/textarea";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import {
  AGENCY_TYPES,
  AGENCY_TYPE_LABELS,
} from "@/packages/pms/lib/guest-profile-travel-agency";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import {
  ISO_COUNTRIES,
  addressLayoutForCountry,
  countryCodeFromInput,
  countryNameFromInput,
  isRegionValidForCountry,
  regionsForCountry,
} from "@/packages/pms/lib/pms-geography";
import {
  ACCOUNT_CREATE_STATUS_LABELS,
  CONTACT_PREFERRED_METHODS,
  emptyAccountCreateContact,
  generateAgencyCode,
  type GuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateStepId,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import type { TravelAgentCreateContext } from "@/packages/pms/lib/guest-travel-agent-create.functions";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import { cn } from "@/shared/lib/utils";

const CONTROL_CLASS = "h-8 text-xs bg-[#FAF8F5] border-[#DDD4C5] focus:bg-white rounded-[6px]";
const SELECT_TRIGGER_CLASS = "h-8 text-xs bg-[#FAF8F5] border-[#DDD4C5] focus:bg-white rounded-[6px]";
const TEXTAREA_CLASS = "text-xs bg-[#FAF8F5] border-[#DDD4C5] focus:bg-white resize-none rounded-[6px]";

function StepField({
  label,
  required: isRequired,
  error,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className={cn("text-xs font-medium text-[#251605]", error && "!text-destructive font-semibold")}>
          {label}
          {isRequired ? <span className="text-destructive font-bold"> *</span> : null}
        </Label>
        {hint ? <span className="text-[10px] text-[#A89F91]">{hint}</span> : null}
      </div>
      <div
        className={
          error
            ? "[&_input]:!border-destructive [&_input]:ring-1 [&_input]:!ring-destructive/30 [&_button]:!border-destructive [&_button]:ring-1 [&_button]:!ring-destructive/30 [&_textarea]:!border-destructive [&_textarea]:ring-1 [&_textarea]:!ring-destructive/30"
            : undefined
        }
      >
        {children}
      </div>
      {error ? <p className="text-[11px] font-medium text-destructive mt-0.5">{error}</p> : null}
    </div>
  );
}

function StepSelect({
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string | null; active?: boolean }>;
  placeholder: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(next) => onChange(next === "none" ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, error && "border-destructive")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {options
          .filter((row) => row.active !== false || row.id === value)
          .map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.code && row.code !== row.name ? `${row.code} — ${row.name}` : row.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

export function BasicInfoStep({
  draft,
  set,
  catalogues,
  fieldError,
  step,
  isRuleRequired,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  catalogues?: TravelAgentCreateContext["catalogues"];
  fieldError: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
  step?: "basic_info" | "contacts";
  isRuleRequired?: (code: string) => boolean;
}) {
  const req = (code: string, fallback = false) => (isRuleRequired ? isRuleRequired(code) : fallback);

  const countryOptions = useMemo(
    () => ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name })),
    [],
  );
  const selectedCountryCode = useMemo(() => countryCodeFromInput(draft.country), [draft.country]);
  const countryCode = selectedCountryCode || (draft.country ? draft.country : "");
  const availableRegions = useMemo(() => regionsForCountry(selectedCountryCode), [selectedCountryCode]);
  const regionOptions = useMemo(
    () => availableRegions.map((region) => ({ value: region, label: region })),
    [availableRegions],
  );
  const layout = useMemo(() => addressLayoutForCountry(selectedCountryCode), [selectedCountryCode]);

  const agencyTypeOptions = catalogues?.agencyTypes ?? [];

  const showBasicInfo = !step || step === "basic_info";
  const showContacts = !step || step === "contacts";
  const contactsError = fieldError("contacts", "contacts") || fieldError("contacts", "basic_info") || fieldError("contacts");

  return (
    <div className="space-y-4" data-testid="travel-agency-basic-info-step">
      {/* Profile Type Read-only Context */}
      {showBasicInfo && (
        <div className="rounded-xl border border-[#EDE6D8] bg-white p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#756A5B]">Profile Type:</span>
            <span className="rounded-[4px] bg-[#FAF8F5] border border-[#EDE6D8] px-2 py-0.5 text-xs font-semibold text-[#8A641A]">
              Travel Agency (TRA)
            </span>
          </div>
          <span className="text-[11px] text-[#A89F91]">Canonical Guest & Services Master</span>
        </div>
      )}

      {/* 1. Agency Details Section */}
      {showBasicInfo && (
        <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Agency Details</h2>
          <p className="text-xs text-[#756A5B]">
            Legal identity, industry classification, licence, TIN number, and website.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StepField label="Agency name" required={req("TA_NAME", true)} error={fieldError("name", "basic_info")}>
            <Input
              data-testid="travel-agent-create-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="e.g. Blue Nile Travel & Tours"
            />
          </StepField>

          <StepField label="Agency type" required={req("TA_AGENCY_TYPE", true)} error={fieldError("agencyType", "basic_info")}>
            <Select
              value={draft.agencyType}
              onValueChange={(val) => {
                const opt = agencyTypeOptions.find((t) => t.id === val || t.code === val);
                const codePrefix = opt?.code || val;
                set("agencyType", val);
                set("code", generateAgencyCode(codePrefix));
              }}
            >
              <SelectTrigger
                data-testid="travel-agent-create-type"
                className={cn(SELECT_TRIGGER_CLASS, fieldError("agencyType", "basic_info") && "border-destructive")}
              >
                <SelectValue placeholder="Select agency type" />
              </SelectTrigger>
              <SelectContent>
                {agencyTypeOptions.length > 0
                  ? agencyTypeOptions
                      .filter(
                        (type) =>
                          type.active !== false ||
                          (draft.agencyType &&
                            (type.code === draft.agencyType || type.id === draft.agencyType)),
                      )
                      .map((type) => (
                        <SelectItem key={type.id} value={type.code || type.id}>
                          {type.name}
                        </SelectItem>
                      ))
                  : AGENCY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {AGENCY_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </StepField>

          {(draft.agencyType.toLowerCase() === "other" || draft.agencyType.toUpperCase() === "OTHR") ? (
            <StepField label="Agency type description" required error={fieldError("agencyTypeOther", "basic_info")}>
              <Input
                value={draft.agencyTypeOther}
                onChange={(e) => set("agencyTypeOther", e.target.value)}
                className={CONTROL_CLASS}
                placeholder="Specify agency type"
              />
            </StepField>
          ) : null}

          <StepField label="Trade name" required={req("TA_TRADE_NAME")} error={fieldError("tradeName", "basic_info")}>
            <Input
              value={draft.tradeName}
              onChange={(e) => set("tradeName", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="Commercial or trading name"
            />
          </StepField>

          <StepField label="Agency code" required={req("TA_CODE")} error={fieldError("code", "basic_info")} hint="Automatically generated from agency type">
            <Input
              data-testid="travel-agent-create-code"
              value={draft.code}
              onChange={(e) => set("code", e.target.value)}
              className={cn(CONTROL_CLASS, "font-mono font-medium")}
              placeholder="e.g. TA-001"
            />
          </StepField>

          <StepField label="Status" required={req("TA_ACCOUNT_STATUS")} error={fieldError("accountStatus", "basic_info")}>
            <Select
              value={draft.accountStatus === "inactive" ? "inactive" : "active"}
              onValueChange={(val) => set("accountStatus", val as GuestTravelAgentCreateDraft["accountStatus"])}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS} data-testid="travel-agent-create-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </StepField>

          <StepField label="Licence number" required={req("TA_IATA_NUMBER")} error={fieldError("iataLicenseNumber", "basic_info")}>
            <Input
              value={draft.iataLicenseNumber}
              onChange={(e) => set("iataLicenseNumber", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="e.g. 12-34567 8 / Licence #"
            />
          </StepField>

          <StepField label="TIN number" required={req("TA_TAX_ID")} error={fieldError("taxId", "basic_info")}>
            <Input
              value={draft.taxId}
              onChange={(e) => set("taxId", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="Tax Identification Number"
            />
          </StepField>

          <StepField label="Website" required={req("TA_WEBSITE")} error={fieldError("website", "basic_info")}>
            <Input
              value={draft.website}
              onChange={(e) => set("website", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="https://agency.com"
            />
          </StepField>
        </div>

        <StepField label="Notes" required={req("TA_NOTES")} error={fieldError("notes", "basic_info")}>
          <Textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={TEXTAREA_CLASS}
            rows={2}
            placeholder="Operational notes, special handling, or background..."
          />
        </StepField>
        </div>
      )}

      {/* 2. Contacts Section */}
      {showContacts && (
        <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
          <div>
            <h2 className={cn("text-sm font-semibold text-[#251605]", contactsError && "text-destructive")}>
              Agency Contacts
            </h2>
            <p className="text-xs text-[#756A5B]">
              Add agency coordinators, reservation desks, and key account managers.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set("contacts", [...draft.contacts, emptyAccountCreateContact()])}
            className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
          >
            <Plus className="mr-1 size-3.5" /> Add contact
          </Button>
        </div>

        {contactsError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {contactsError}
          </div>
        ) : null}

        <div className="space-y-3">
          {draft.contacts.map((contact, index) => (
            <div
              key={contact.key}
              className="rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#8A641A]">
                  Contact #{index + 1} {contact.isPrimary ? "(Primary)" : ""}
                </span>
                {draft.contacts.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => set("contacts", draft.contacts.filter((_, i) => i !== index))}
                    className="size-7 text-[#756A5B] hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StepField
                  label="Name"
                  required={req("TA_CONTACT_NAME")}
                  error={!contact.name && req("TA_CONTACT_NAME") ? (fieldError("contactName", "contacts") || "Contact name is required") : undefined}
                >
                  <Input
                    value={contact.name}
                    onChange={(e) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)),
                      )
                    }
                    className={CONTROL_CLASS}
                    placeholder="Full name"
                  />
                </StepField>

                <StepField
                  label="Contact role"
                  required={req("TA_CONTACT_ROLE")}
                  error={!contact.roleId && req("TA_CONTACT_ROLE") ? (fieldError("contactRole", "contacts") || "Contact role is required") : undefined}
                >
                  <Select
                    value={contact.roleId || "none"}
                    onValueChange={(val) => {
                      const selectedRole = catalogues?.contactRoles?.find((r) => r.id === val);
                      set(
                        "contacts",
                        draft.contacts.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                roleId: val === "none" ? null : val,
                                position: selectedRole && !row.position ? selectedRole.name : row.position,
                              }
                            : row,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, !contact.roleId && req("TA_CONTACT_ROLE") && fieldError("contactRole", "contacts") && "border-destructive")}>
                      <SelectValue placeholder="Select contact role from Settings" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None / Custom</SelectItem>
                      {(catalogues?.contactRoles ?? []).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </StepField>

                <StepField
                  label="Position / Title"
                  required={req("TA_CONTACT_POSITION")}
                  error={!contact.position && req("TA_CONTACT_POSITION") ? (fieldError("contactPosition", "contacts") || "Position is required") : undefined}
                >
                  <Input
                    value={contact.position}
                    onChange={(e) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, position: e.target.value } : row)),
                      )
                    }
                    className={CONTROL_CLASS}
                    placeholder="e.g. Contracting Manager"
                  />
                </StepField>

                <StepField
                  label="Email"
                  required={req("TA_CONTACT_EMAIL")}
                  error={!contact.email && req("TA_CONTACT_EMAIL") ? (fieldError("contactEmail", "contacts") || "Email is required") : undefined}
                >
                  <Input
                    value={contact.email}
                    onChange={(e) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, email: e.target.value } : row)),
                      )
                    }
                    className={CONTROL_CLASS}
                    placeholder="contact@agency.com"
                  />
                </StepField>

                <StepField
                  label="Phone"
                  required={req("TA_CONTACT_PHONE")}
                  error={!contact.phone && req("TA_CONTACT_PHONE") ? (fieldError("contactPhone", "contacts") || "Phone is required") : undefined}
                >
                  <CanonicalPhoneInput
                    value={contact.phone}
                    onChange={(phone) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, phone } : row)),
                      )
                    }
                    error={Boolean(!contact.phone && req("TA_CONTACT_PHONE"))}
                    placeholder="e.g. 911 234 567"
                    size="sm"
                  />
                </StepField>

                <StepField
                  label="WhatsApp"
                  required={req("TA_CONTACT_WHATSAPP")}
                  error={!contact.whatsapp && req("TA_CONTACT_WHATSAPP") ? (fieldError("contactWhatsapp", "contacts") || "WhatsApp is required") : undefined}
                >
                  <CanonicalPhoneInput
                    value={contact.whatsapp}
                    onChange={(whatsapp) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, whatsapp } : row)),
                      )
                    }
                    error={Boolean(!contact.whatsapp && req("TA_CONTACT_WHATSAPP"))}
                    placeholder="e.g. 911 234 567"
                    size="sm"
                  />
                </StepField>

                <StepField
                  label="Preferred method"
                  required={req("TA_CONTACT_PREFERRED_METHOD")}
                  error={!contact.preferredMethod && req("TA_CONTACT_PREFERRED_METHOD") ? (fieldError("contactPreferredMethod", "contacts") || "Preferred method is required") : undefined}
                >
                  <StepSelect
                    value={contact.preferredMethod}
                    onChange={(val) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, preferredMethod: val } : row)),
                      )
                    }
                    options={CONTACT_PREFERRED_METHODS.map((row) => ({ id: row.id, name: row.label }))}
                    placeholder="Optional"
                    error={!contact.preferredMethod && req("TA_CONTACT_PREFERRED_METHOD") ? "Preferred method is required" : undefined}
                  />
                </StepField>

                <StepField
                  label="Contact notes"
                  required={req("TA_CONTACT_NOTES")}
                  error={!contact.notes && req("TA_CONTACT_NOTES") ? (fieldError("contactNotes", "contacts") || "Contact notes are required") : undefined}
                >
                  <Input
                    value={contact.notes}
                    onChange={(e) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)),
                      )
                    }
                    className={CONTROL_CLASS}
                    placeholder="Contact notes..."
                  />
                </StepField>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-[#251605] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contact.isPrimary}
                    onChange={(e) =>
                      set(
                        "contacts",
                        draft.contacts.map((row, i) => ({
                          ...row,
                          isPrimary: e.target.checked ? i === index : i === index ? false : row.isPrimary,
                        })),
                      )
                    }
                    className="size-3.5 rounded border-[#CCCCCC] text-[#C89933] focus:ring-[#C89933]"
                  />
                  Designate as Primary Contact
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* 3. Address & Market Section */}
      {showBasicInfo && (
        <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Address & Market</h2>
          <p className="text-xs text-[#756A5B]">Agency physical location, fiscal registration, and market segmentation.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StepField label="Country" required={req("TA_COUNTRY")} error={fieldError("country", "basic_info")}>
            <SearchableSelect
              id="travel-agency-country"
              value={countryCode}
              options={countryOptions}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              className={SELECT_TRIGGER_CLASS}
              onChange={(code) => {
                const name = countryNameFromInput(code);
                set("country", name);
                if (!isRegionValidForCountry(name, draft.region)) {
                  set("region", "");
                }
              }}
            />
          </StepField>

          <StepField label={layout.regionLabel || "Regional state / Province"} required={req("TA_REGION")} error={fieldError("region", "basic_info")}>
            {availableRegions.length > 0 ? (
              <SearchableSelect
                id="travel-agency-region"
                value={draft.region}
                options={regionOptions}
                placeholder={`Select ${(layout.regionLabel || "region").toLowerCase()}`}
                searchPlaceholder={`Search ${(layout.regionLabel || "regions").toLowerCase()}...`}
                className={SELECT_TRIGGER_CLASS}
                onChange={(val) => set("region", val)}
              />
            ) : (
              <Input
                id="travel-agency-region"
                value={draft.region}
                placeholder={layout.regionLabel || "Regional state / Province"}
                onChange={(e) => set("region", e.target.value)}
                className={CONTROL_CLASS}
              />
            )}
          </StepField>

          <StepField label="City" required={req("TA_CITY")} error={fieldError("city", "basic_info")}>
            <Input
              value={draft.city}
              onChange={(e) => set("city", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="City or locality"
            />
          </StepField>

          <StepField label="Postal / ZIP code" required={req("TA_POSTAL_CODE")} error={fieldError("postalCode", "basic_info")}>
            <Input
              value={draft.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="ZIP or postal code"
            />
          </StepField>

          <StepField label="Address line 1" required={req("TA_ADDRESS_LINE1")} error={fieldError("addressLine1", "basic_info")}>
            <Input
              value={draft.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="Street address or P.O. Box"
            />
          </StepField>

          <StepField label="Address line 2" required={req("TA_ADDRESS_LINE2")} error={fieldError("addressLine2", "basic_info")}>
            <Input
              value={draft.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="Suite, unit, floor"
            />
          </StepField>

          <StepField label="Registration number" required={req("TA_REGISTRATION_NUMBER")} error={fieldError("registrationNumber", "basic_info")}>
            <Input
              value={draft.registrationNumber}
              onChange={(e) => set("registrationNumber", e.target.value)}
              className={CONTROL_CLASS}
              placeholder="Commercial business register #"
            />
          </StepField>

          <StepField label="Market segment" required={req("TA_MARKET_SEGMENT")} error={fieldError("marketSegmentId", "basic_info")}>
            <StepSelect
              value={draft.marketSegmentId}
              onChange={(val) => set("marketSegmentId", val)}
              options={catalogues?.marketSegments ?? []}
              placeholder="Select market segment"
              error={fieldError("marketSegmentId", "basic_info")}
            />
          </StepField>

          <StepField label="Source" required={req("TA_SOURCE")} error={fieldError("sourceCodeId", "basic_info")}>
            <StepSelect
              value={draft.sourceCodeId}
              onChange={(val) => set("sourceCodeId", val)}
              options={catalogues?.sourceCodes ?? []}
              placeholder="Select source code"
              error={fieldError("sourceCodeId", "basic_info")}
            />
          </StepField>

          <StepField label="Account manager" required={req("TA_ACCOUNT_MANAGER")} error={fieldError("accountManagerId", "basic_info")}>
            <StepSelect
              value={draft.accountManagerId}
              onChange={(val) => set("accountManagerId", val)}
              options={catalogues?.staff ?? []}
              placeholder="Select account manager"
              error={fieldError("accountManagerId", "basic_info")}
            />
          </StepField>
        </div>
      </div>
      )}
    </div>
  );
}

export function ContactsStep(props: Parameters<typeof BasicInfoStep>[0]) {
  return <BasicInfoStep {...props} step="contacts" />;
}
