import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { COMMON_CURRENCIES, COMMON_TIMEZONES } from "@/shared/lib/property-time";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  PropertySetupField,
  PropertySetupFormGrid,
  PropertySetupFormItem,
  PropertySetupPanel,
  PropertySetupPhoneField,
  PropertySetupRemoveButton,
  PropertySetupSettingRow,
  SocialPlatformSelect,
} from "@/packages/pms/components/settings/setup-kit";
import type { PropertySetupFieldIconKey } from "@/packages/pms/lib/pms-property-setup-field-icons";
import {
  PROPERTY_SETUP_COMPACT_TEXTAREA_CLASS,
  PROPERTY_SETUP_CONTROL_CLASS,
  PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX,
  PROPERTY_SETUP_TEXTAREA_CLASS,
  acceptShortDescriptionInput,
  isShortDescriptionOverLimit,
} from "@/packages/pms/lib/pms-property-setup-ui";
import {
  deleteStructureNode,
  saveHotelBuilding,
  saveHotelFloor,
  saveHotelWing,
} from "@/packages/pms/lib/pms-set2-structure.functions";
import type { Set2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import {
  createPropertyBrandImageUpload,
  createPropertyComplianceDocumentUpload,
  deleteCard1PropertyArea,
  saveCard1PropertyArea,
} from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_ADDRESS_ADAPT_COPY,
  CARD1_ADDRESS_SUBTITLE,
  CARD1_AGREEMENT_OUT,
  CARD1_BLOCKER_LABELS,
  CARD1_BRAND_AFFILIATION_LABELS,
  CARD1_BRAND_AFFILIATIONS,
  CARD1_BRAND_IMAGE_HELPER,
  CARD1_BRAND_IMAGE_UPLOAD_ERROR,
  CARD1_BRANDING_HELPER,
  CARD1_BUSINESS_DATE_CURRENT_COPY,
  CARD1_BUSINESS_TYPE_LABELS,
  CARD1_BUSINESS_TYPES,
  CARD1_CALENDAR_DISPLAY_LABELS,
  CARD1_CALENDAR_DISPLAYS,
  CARD1_CAPACITY_COPY,
  CARD1_DEFAULT_BLOCKERS,
  CARD1_FULL_ADDRESS_COPY,
  CARD1_IDENTITY_HELPER,
  CARD1_INDEPENDENT_HELPER,
  CARD1_MANUAL_ROLLOVER_ROLES,
  CARD1_OPENING_DATE_IN,
  CARD1_PROPERTY_AREA_OPTIONS,
  CARD1_PROPERTY_CODE_TOOLTIP,
  CARD1_PROPERTY_TYPE_LABELS,
  CARD1_PROPERTY_TYPES,
  CARD1_PUBLIC_HELPER,
  CARD1_ROOMS_HREF,
  CARD1_SOCIAL_PLATFORM_LABELS,
  CARD1_SOCIAL_PLATFORMS,
  CARD1_STRUCTURE_CRUD_COPY,
  CARD1_VAT_GATE_COPY,
  LEGAL_ENTITY_TYPE_LABELS,
  LEGAL_ENTITY_TYPES,
  STAR_RATINGS,
  card1LanguageOptions,
  validateBrandImageFile,
  liveBlockPreview,
  structureRoomCodeExample,
  vatCertificateRequired,
  type Card1AddressFieldErrors,
  type Card1DepartmentOption,
  type Card1Draft,
  type Card1IdentityFieldErrors,
  type Card1PropertyArea,
  type Card1Snapshot,
  type Card1StayPolicy,
  type Card1CurrentState,
  type Card1UploadRef,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  ISO_COUNTRIES,
  addressLayoutForCountry,
  clearDependentGeography,
  countryCodeFromInput,
  countryNameFromInput,
  regionsForCountry,
  type AddressFieldKey,
} from "@/packages/pms/lib/pms-geography";

const SELECT_TRIGGER_CLASS = `${PROPERTY_SETUP_CONTROL_CLASS} justify-between`;

export function Field({
  id,
  label,
  value,
  disabled,
  onChange,
  placeholder,
  required,
  readOnly,
  type = "text",
  helper,
  error,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  type?: string;
  helper?: string | undefined;
  error?: string | undefined;
  icon?: PropertySetupFieldIconKey;
}) {
  return (
    <PropertySetupField
      id={id}
      label={label}
      icon={icon}
      required={required}
      helper={helper}
      error={error}
      disabled={disabled}
      readOnly={readOnly}
    >
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled || readOnly}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        className={PROPERTY_SETUP_CONTROL_CLASS}
      />
    </PropertySetupField>
  );
}

function Panel({
  title,
  helper,
  children,
  testId,
  icon = "property",
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
  testId?: string;
  icon?: PropertySetupFieldIconKey;
}) {
  return (
    <PropertySetupPanel title={title} helper={helper} icon={icon} testId={testId}>
      {children}
    </PropertySetupPanel>
  );
}

function SelectField({
  id,
  label,
  required,
  error,
  icon,
  children,
}: {
  id: string;
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  icon?: PropertySetupFieldIconKey;
  children: React.ReactNode;
}) {
  return (
    <PropertySetupField id={id} label={label} icon={icon} required={required} error={error}>
      {children}
    </PropertySetupField>
  );
}

function AffiliationSelect({
  id,
  draft,
  setDraft,
  canEdit,
}: {
  id: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <Select
      value={draft.brandAffiliation || "unset"}
      onValueChange={(value) =>
        setDraft((p) => ({ ...p, brandAffiliation: value === "unset" ? "" : value }))
      }
      disabled={!canEdit}
    >
      <SelectTrigger id={id} className={SELECT_TRIGGER_CLASS}>
        <SelectValue placeholder="Independent / No Chain" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unset">Not set</SelectItem>
        {CARD1_BRAND_AFFILIATIONS.map((item) => (
          <SelectItem key={item} value={item}>
            {CARD1_BRAND_AFFILIATION_LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function IdentityStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  logoPreviewUrl,
  coverPreviewUrl,
  errors,
  onClearError,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  logoPreviewUrl: string;
  coverPreviewUrl: string;
  errors: Card1IdentityFieldErrors;
  onClearError: (key: keyof Card1IdentityFieldErrors) => void;
}) {
  const languages = card1LanguageOptions(draft.defaultLanguage);
  return (
    <div className="space-y-4" data-testid="pms-card1-step-identity">
      <Panel
        title="Property Identity"
        helper={CARD1_IDENTITY_HELPER}
        testId="card1-identity-panel"
        icon="property"
      >
        <span className="sr-only">{CARD1_OPENING_DATE_IN}</span>
        <PropertySetupFormGrid>
          <PropertySetupField
            id="card1-property-code"
            label="Property Code"
            icon="hash"
            readOnly
            helper={CARD1_PROPERTY_CODE_TOOLTIP}
          >
            <div className="relative">
              <Input
                id="card1-property-code"
                value={draft.propertyCode || "NRC————"}
                readOnly
                disabled
                title={CARD1_PROPERTY_CODE_TOOLTIP}
                className={`${PROPERTY_SETUP_CONTROL_CLASS} pr-10`}
                data-testid="card1-property-code"
              />
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
            </div>
          </PropertySetupField>
          <Field
            id="card1-name"
            label="Property / Business Name"
            required
            value={draft.name}
            disabled={!canEdit}
            error={errors.name}
            onChange={(name) => {
              onClearError("name");
              setDraft((p) => ({ ...p, name }));
            }}
          />
          <Field
            id="card1-trading-name"
            label="Trading Name"
            value={draft.tradingName}
            disabled={!canEdit}
            onChange={(tradingName) => setDraft((p) => ({ ...p, tradingName }))}
          />
          <SelectField
            id="card1-property-type"
            label="Property Type"
            required
            error={errors.propertyType}
          >
            <Select
              value={draft.propertyType || "unset"}
              onValueChange={(value) => {
                onClearError("propertyType");
                setDraft((p) => ({ ...p, propertyType: value === "unset" ? "" : value }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger
                id="card1-property-type"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(errors.propertyType)}
              >
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {CARD1_PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CARD1_PROPERTY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField
            id="card1-business-type"
            label="Business Type"
            required
            error={errors.businessType}
          >
            <Select
              value={draft.businessType || "unset"}
              onValueChange={(value) => {
                onClearError("businessType");
                setDraft((p) => ({ ...p, businessType: value === "unset" ? "" : value }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger
                id="card1-business-type"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(errors.businessType)}
              >
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {CARD1_BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CARD1_BUSINESS_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField id="card1-star" label="Star Rating">
            <Select
              value={draft.starRating === "" ? "unset" : String(draft.starRating)}
              onValueChange={(value) =>
                setDraft((p) => ({
                  ...p,
                  starRating: value === "unset" ? "" : (Number(value) as 1 | 2 | 3 | 4 | 5),
                }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-star" className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {STAR_RATINGS.map((rating) => (
                  <SelectItem key={rating} value={String(rating)}>
                    {rating} Star
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <Field
            id="card1-opening-date"
            label="Opening Date"
            required
            type="date"
            value={draft.openingDate}
            disabled={!canEdit}
            error={errors.openingDate}
            onChange={(openingDate) => {
              onClearError("openingDate");
              setDraft((p) => ({ ...p, openingDate }));
            }}
          />
          <SelectField
            id="card1-currency"
            label="Primary Currency"
            required
            error={errors.currencyCode}
          >
            <Select
              value={draft.currencyCode}
              onValueChange={(currencyCode) => {
                onClearError("currencyCode");
                setDraft((p) => ({ ...p, currencyCode }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-currency" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code} — {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField id="card1-timezone" label="Time Zone" required error={errors.timezone}>
            <Select
              value={draft.timezone}
              onValueChange={(timezone) => {
                onClearError("timezone");
                setDraft((p) => ({ ...p, timezone }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-timezone" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField id="card1-language" label="Language" required error={errors.defaultLanguage}>
            <Select
              value={draft.defaultLanguage || "en"}
              onValueChange={(defaultLanguage) => {
                onClearError("defaultLanguage");
                setDraft((p) => ({ ...p, defaultLanguage }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-language" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.id} value={language.id}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectField>
          <SelectField id="card1-affiliation" label="Brand / Chain Affiliation" icon="badge">
            <AffiliationSelect
              id="card1-affiliation"
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
            />
          </SelectField>
          <PropertySetupFormItem span={3}>
            <PropertySetupFormGrid>
              <PropertySetupField
                id="card1-short-description"
                label="Short Description"
                icon="document"
                error={
                  isShortDescriptionOverLimit(draft.shortDescription)
                    ? "Reduce to 80 characters before saving."
                    : undefined
                }
              >
                <Textarea
                  id="card1-short-description"
                  rows={2}
                  value={draft.shortDescription}
                  disabled={!canEdit}
                  aria-invalid={isShortDescriptionOverLimit(draft.shortDescription)}
                  className={PROPERTY_SETUP_COMPACT_TEXTAREA_CLASS}
                  onChange={(event) =>
                    setDraft((p) => ({
                      ...p,
                      shortDescription: acceptShortDescriptionInput(
                        p.shortDescription,
                        event.target.value,
                      ),
                    }))
                  }
                />
                <p
                  className="mt-1 text-right text-xs text-muted-foreground"
                  data-testid="card1-short-description-counter"
                >
                  {draft.shortDescription.length} / {PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX}
                </p>
              </PropertySetupField>
              <ToggleRow
                id="card1-independent"
                label="Independent Property"
                helper={CARD1_INDEPENDENT_HELPER}
                checked={draft.identityToggles.independentProperty}
                disabled={!canEdit}
                onChange={(independentProperty) =>
                  setDraft((p) => ({
                    ...p,
                    identityToggles: { ...p.identityToggles, independentProperty },
                  }))
                }
              />
              <ToggleRow
                id="card1-public"
                label="Display Property Publicly"
                helper={CARD1_PUBLIC_HELPER}
                checked={draft.identityToggles.displayPublicly}
                disabled={!canEdit}
                onChange={(displayPublicly) =>
                  setDraft((p) => ({
                    ...p,
                    identityToggles: { ...p.identityToggles, displayPublicly },
                  }))
                }
              />
            </PropertySetupFormGrid>
          </PropertySetupFormItem>
        </PropertySetupFormGrid>
      </Panel>
      <Panel
        title="Branding & Visual Identity"
        helper={CARD1_BRANDING_HELPER}
        testId="card1-branding-panel"
        icon="image"
      >
        <p className="sr-only">
          Hotel brand colours are accents only — they do not recolour PMS chrome.
        </p>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <BrandImageField
            id="card1-logo"
            label="Property Logo"
            kind="logo"
            restaurantId={restaurantId}
            value={draft.logoUrl}
            previewUrl={logoPreviewUrl}
            disabled={!canEdit}
            error={errors.logoUrl}
            onChange={(logoUrl) => {
              onClearError("logoUrl");
              setDraft((p) => ({ ...p, logoUrl }));
            }}
          />
          <BrandImageField
            id="card1-cover"
            label="Cover Image"
            kind="cover"
            restaurantId={restaurantId}
            value={draft.coverImageUrl}
            previewUrl={coverPreviewUrl}
            disabled={!canEdit}
            error={errors.coverImageUrl}
            onChange={(coverImageUrl) => {
              onClearError("coverImageUrl");
              setDraft((p) => ({ ...p, coverImageUrl }));
            }}
          />
          <ColourField
            id="card1-primary-colour"
            label="Primary Colour"
            value={draft.primaryBrandColour}
            disabled={!canEdit}
            error={errors.primaryBrandColour}
            onChange={(primaryBrandColour) => {
              onClearError("primaryBrandColour");
              setDraft((p) => ({ ...p, primaryBrandColour }));
            }}
          />
          <ColourField
            id="card1-secondary-colour"
            label="Secondary Colour"
            value={draft.secondaryBrandColour}
            disabled={!canEdit}
            error={errors.secondaryBrandColour}
            onChange={(secondaryBrandColour) => {
              onClearError("secondaryBrandColour");
              setDraft((p) => ({ ...p, secondaryBrandColour }));
            }}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="card1-website"
            label="Company Website"
            icon="website"
            type="url"
            value={draft.websiteUrl}
            disabled={!canEdit}
            placeholder="https://"
            error={errors.websiteUrl}
            onChange={(websiteUrl) => {
              onClearError("websiteUrl");
              setDraft((p) => ({ ...p, websiteUrl }));
            }}
          />
          <SelectField
            id="card1-affiliation-branding"
            label="Brand / Chain Affiliation"
            icon="badge"
          >
            <AffiliationSelect
              id="card1-affiliation-branding"
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
            />
          </SelectField>
        </div>
      </Panel>
    </div>
  );
}

export function AddressStep({
  draft,
  setDraft,
  canEdit,
  composedAddress,
  errors,
  onClearError,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  composedAddress: string;
  errors: Card1AddressFieldErrors;
  onClearError: (key: keyof Card1AddressFieldErrors) => void;
}) {
  const layout = addressLayoutForCountry(draft.country);
  const countryCode = countryCodeFromInput(draft.country);
  const regionOptions = regionsForCountry(draft.country).map((region) => ({
    value: region,
    label: region,
  }));
  const countryOptions = ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }));

  function extraValue(key: AddressFieldKey): string {
    if (key === "nearbyLandmark") return draft.locationExtras.nearbyLandmark;
    return draft[key];
  }

  function setExtra(key: AddressFieldKey, value: string) {
    if (key === "nearbyLandmark") {
      setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, nearbyLandmark: value } }));
      return;
    }
    setDraft((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="space-y-4" data-testid="pms-card1-step-address">
      <Panel
        title="Address & Location"
        helper={CARD1_ADDRESS_SUBTITLE}
        testId="card1-address-panel"
        icon="address"
      >
        <p className="text-sm text-muted-foreground">{CARD1_ADDRESS_ADAPT_COPY}</p>
        <p className="text-sm text-muted-foreground">{CARD1_FULL_ADDRESS_COPY}</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="card1-country">
              Country <span className="text-red-600"> *</span>
            </Label>
            <SearchableSelect
              id="card1-country"
              value={countryCode}
              options={countryOptions}
              disabled={!canEdit}
              placeholder="Select a country"
              searchPlaceholder="Search countries"
              error={errors.country}
              onChange={(code) => {
                onClearError("country");
                onClearError("addressRegion");
                const name = countryNameFromInput(code);
                setDraft((p) => clearDependentGeography({ ...p, country: name }));
              }}
            />
            {errors.country ? (
              <p id="card1-country-error" className="text-xs text-red-600" role="alert">
                {errors.country}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card1-region">
              {layout.regionLabel} <span className="text-red-600"> *</span>
            </Label>
            {layout.regionMode === "select" ? (
              <>
                <SearchableSelect
                  id="card1-region"
                  value={draft.addressRegion}
                  options={regionOptions}
                  disabled={!canEdit}
                  placeholder={`Select ${layout.regionLabel.toLowerCase()}`}
                  searchPlaceholder={`Search ${layout.regionLabel.toLowerCase()}`}
                  error={errors.addressRegion}
                  onChange={(addressRegion) => {
                    onClearError("addressRegion");
                    setDraft((p) => ({ ...p, addressRegion }));
                  }}
                />
                {errors.addressRegion ? (
                  <p id="card1-region-error" className="text-xs text-red-600" role="alert">
                    {errors.addressRegion}
                  </p>
                ) : null}
              </>
            ) : (
              <Input
                id="card1-region"
                value={draft.addressRegion}
                disabled={!canEdit}
                aria-invalid={Boolean(errors.addressRegion)}
                className={`h-11 ${errors.addressRegion ? "border-red-500" : ""}`}
                onChange={(event) => {
                  onClearError("addressRegion");
                  setDraft((p) => ({ ...p, addressRegion: event.target.value }));
                }}
              />
            )}
            {layout.regionMode === "text" && errors.addressRegion ? (
              <p id="card1-region-error" className="text-xs text-red-600" role="alert">
                {errors.addressRegion}
              </p>
            ) : null}
          </div>
          <Field
            id="card1-city"
            label="City / Town"
            required
            value={draft.city}
            disabled={!canEdit}
            error={errors.city}
            onChange={(city) => {
              onClearError("city");
              setDraft((p) => ({ ...p, city }));
            }}
          />
          {layout.extras.map((extra) => (
            <Field
              key={extra.key}
              id={`card1-${extra.key}`}
              label={extra.label}
              helper={extra.helper}
              value={extraValue(extra.key)}
              disabled={!canEdit}
              onChange={(value) => setExtra(extra.key, value)}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card1-full-address">Physical / Full Address</Label>
          <Input
            id="card1-full-address"
            value={composedAddress}
            readOnly
            disabled
            data-testid="card1-full-address"
            className={PROPERTY_SETUP_CONTROL_CLASS}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            id="card1-lat"
            label="Latitude"
            value={draft.latitude}
            disabled={!canEdit}
            error={errors.latitude}
            onChange={(latitude) => {
              onClearError("latitude");
              setDraft((p) => ({ ...p, latitude }));
            }}
          />
          <Field
            id="card1-lng"
            label="Longitude"
            value={draft.longitude}
            disabled={!canEdit}
            error={errors.longitude}
            onChange={(longitude) => {
              onClearError("longitude");
              setDraft((p) => ({ ...p, longitude }));
            }}
          />
          <Field
            id="card1-maps"
            label="Google Maps Link"
            type="url"
            value={draft.locationExtras.googleMapsLink}
            disabled={!canEdit}
            error={errors.googleMapsLink}
            onChange={(googleMapsLink) => {
              onClearError("googleMapsLink");
              setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, googleMapsLink } }));
            }}
          />
          <Field
            id="card1-landmark"
            label="Nearby Landmark"
            value={draft.locationExtras.nearbyLandmark}
            disabled={!canEdit}
            onChange={(nearbyLandmark) =>
              setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, nearbyLandmark } }))
            }
          />
        </div>
        <ToggleRow
          id="card1-pin"
          label="Show property location on NORU and guest platforms"
          checked={draft.locationExtras.pinVisible}
          disabled={!canEdit}
          onChange={(pinVisible) =>
            setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, pinVisible } }))
          }
        />
      </Panel>
    </div>
  );
}

export function ContactsStep({
  draft,
  setDraft,
  canEdit,
  departmentOptions,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  departmentOptions: Card1DepartmentOption[];
}) {
  const defaultIso = countryCodeFromInput(draft.country) || null;
  const socialOptions = CARD1_SOCIAL_PLATFORMS.map((platform) => ({
    id: platform,
    label: CARD1_SOCIAL_PLATFORM_LABELS[platform],
  }));
  return (
    <div className="space-y-4" data-testid="pms-card1-step-contacts">
      <Panel title="Contacts" helper="General contact details" icon="contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <PropertySetupPhoneField
            id="card1-phone"
            label="Primary phone"
            required
            value={draft.phone}
            disabled={!canEdit}
            defaultIso={defaultIso}
            onChange={(phone) => setDraft((p) => ({ ...p, phone }))}
          />
          <Field
            id="card1-email"
            label="Company email"
            icon="email"
            required
            value={draft.email}
            disabled={!canEdit}
            onChange={(email) => setDraft((p) => ({ ...p, email }))}
          />
          <PropertySetupPhoneField
            id="card1-whatsapp"
            label="WhatsApp / Messaging contact"
            value={draft.whatsapp}
            disabled={!canEdit}
            defaultIso={defaultIso}
            onChange={(whatsapp) => setDraft((p) => ({ ...p, whatsapp }))}
          />
        </div>
      </Panel>
      <Panel title="Social media links" icon="network">
        <div className="space-y-3">
          {draft.social.links.map((row, index) => (
            <div
              key={`${row.platform}-${index}`}
              className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
            >
              <SocialPlatformSelect
                value={row.platform}
                disabled={!canEdit}
                options={socialOptions}
                onChange={(platform) =>
                  setDraft((p) => {
                    const links = [...p.social.links];
                    links[index] = { ...row, platform };
                    return { ...p, social: { ...p.social, links } };
                  })
                }
              />
              <Input
                placeholder="https://"
                value={row.url}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((p) => {
                    const links = [...p.social.links];
                    links[index] = { ...row, url: event.target.value };
                    return { ...p, social: { ...p.social, links } };
                  })
                }
                className={PROPERTY_SETUP_CONTROL_CLASS}
              />
              {canEdit ? (
                <PropertySetupRemoveButton
                  label="Remove social link"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      social: { ...p.social, links: p.social.links.filter((_, i) => i !== index) },
                    }))
                  }
                />
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDraft((p) => ({
                  ...p,
                  social: {
                    ...p.social,
                    links: [...p.social.links, { platform: "facebook", url: "" }],
                  },
                }))
              }
            >
              + Add social link
            </Button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Department contacts" icon="department">
        <div className="space-y-3">
          {draft.departmentContacts.map((row, index) => (
            <div
              key={row.id ?? `${row.departmentId ?? row.department}-${index}`}
              className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_1fr_1fr_1fr_auto]"
            >
              <Select
                value={row.departmentId || (row.department ? `legacy:${index}` : "unset")}
                disabled={!canEdit}
                onValueChange={(departmentId) =>
                  setDraft((p) => {
                    const next = [...p.departmentContacts];
                    const department = departmentOptions.find(
                      (option) => option.id === departmentId,
                    );
                    next[index] = {
                      ...row,
                      departmentId: departmentId === "unset" ? undefined : departmentId,
                      department: department?.name ?? "",
                    };
                    return { ...p, departmentContacts: next };
                  })
                }
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Select department</SelectItem>
                  {!row.departmentId && row.department ? (
                    <SelectItem value={`legacy:${index}`} disabled>
                      Legacy: {row.department}
                    </SelectItem>
                  ) : null}
                  {departmentOptions
                    .filter((option) => option.active || option.id === row.departmentId)
                    .map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {!option.active ? " (Inactive)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Contact name"
                value={row.name}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((p) => {
                    const next = [...p.departmentContacts];
                    next[index] = { ...row, name: event.target.value };
                    return { ...p, departmentContacts: next };
                  })
                }
                className={PROPERTY_SETUP_CONTROL_CLASS}
              />
              <Input
                placeholder="Department email *"
                value={row.email}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((p) => {
                    const next = [...p.departmentContacts];
                    next[index] = { ...row, email: event.target.value };
                    return { ...p, departmentContacts: next };
                  })
                }
                className={PROPERTY_SETUP_CONTROL_CLASS}
              />
              <PropertySetupPhoneField
                id={`card1-dept-phone-${index}`}
                label="Department phone"
                value={row.phone}
                disabled={!canEdit}
                defaultIso={defaultIso}
                onChange={(phone) =>
                  setDraft((p) => {
                    const next = [...p.departmentContacts];
                    next[index] = { ...row, phone };
                    return { ...p, departmentContacts: next };
                  })
                }
              />
              {canEdit ? (
                <PropertySetupRemoveButton
                  label="Remove department"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      departmentContacts: p.departmentContacts.filter((_, i) => i !== index),
                    }))
                  }
                />
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDraft((p) => ({
                  ...p,
                  departmentContacts: [
                    ...p.departmentContacts,
                    {
                      departmentId: undefined,
                      department: "",
                      name: "",
                      phone: "",
                      email: "",
                      active: true,
                      sortOrder: p.departmentContacts.length,
                    },
                  ],
                }))
              }
            >
              + Add department
            </Button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Emergency / alternate contact" testId="card1-emergency" icon="contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="card1-emergency-name"
            label="Emergency contact name"
            icon="person"
            required
            value={draft.emergency.name}
            disabled={!canEdit}
            onChange={(name) => setDraft((p) => ({ ...p, emergency: { ...p.emergency, name } }))}
          />
          <PropertySetupPhoneField
            id="card1-emergency-phone"
            label="Emergency contact phone"
            required
            value={draft.emergency.phone}
            disabled={!canEdit}
            defaultIso={defaultIso}
            onChange={(phone) => setDraft((p) => ({ ...p, emergency: { ...p.emergency, phone } }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card1-emergency-notes">Notes or availability</Label>
          <Textarea
            id="card1-emergency-notes"
            maxLength={500}
            value={draft.emergency.notes}
            disabled={!canEdit}
            className={PROPERTY_SETUP_TEXTAREA_CLASS}
            onChange={(event) =>
              setDraft((p) => ({
                ...p,
                emergency: { ...p.emergency, notes: event.target.value.slice(0, 500) },
              }))
            }
          />
          <p className="text-xs text-muted-foreground">{draft.emergency.notes.length}/500</p>
        </div>
      </Panel>
    </div>
  );
}

export function CheckinStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-checkin">
      <Panel
        title="Check-In & Check-Out"
        helper="Operating times, stay rules, and guest arrival/departure policies."
        icon="time"
      >
        <PropertySetupFormGrid>
          <TimeSelect
            id="card1-ci"
            label="Standard Check-in Time"
            required
            value={draft.checkInTime}
            disabled={!canEdit}
            onChange={(checkInTime) => setDraft((p) => ({ ...p, checkInTime }))}
          />
          <TimeSelect
            id="card1-co"
            label="Standard Check-out Time"
            required
            value={draft.checkOutTime}
            disabled={!canEdit}
            onChange={(checkOutTime) => setDraft((p) => ({ ...p, checkOutTime }))}
          />
          <ControlledSelectField
            id="card1-lead"
            label="Minimum Lead Time"
            value={String(draft.checkinOps.minLeadTimeHours ?? "")}
            disabled={!canEdit}
            options={Array.from({ length: 24 }, (_, index) => ({
              value: String(index + 1),
              label: `${index + 1} hr`,
            }))}
            onChange={(value) =>
              setDraft((p) => ({
                ...p,
                checkinOps: {
                  ...p.checkinOps,
                  minLeadTimeHours: value,
                  minLeadTime: `${value} hour${value === "1" ? "" : "s"}`,
                },
              }))
            }
          />
          <TimeSelect
            id="card1-cutoff"
            label="Same-day Booking Cut-off Time"
            value={draft.checkinOps.sameDayCutoff}
            disabled={!canEdit}
            onChange={(sameDayCutoff) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, sameDayCutoff } }))
            }
          />
          <ControlledSelectField
            id="card1-grace"
            label="Over Grace Period"
            value={String(draft.checkinOps.overstayGraceMinutes ?? "")}
            disabled={!canEdit}
            options={[0, 15, 30, 45, 60, 90, 120, 180, 240].map((minutes) => ({
              value: String(minutes),
              label: minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`,
            }))}
            onChange={(value) =>
              setDraft((p) => ({
                ...p,
                checkinOps: {
                  ...p.checkinOps,
                  overstayGraceMinutes: value,
                  overstayGrace: `${value} minutes`,
                },
              }))
            }
          />
        </PropertySetupFormGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <StayPolicyFields
            label="Early Check-In"
            value={draft.checkinOps.earlyCheckin}
            disabled={!canEdit}
            onChange={(earlyCheckin) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, earlyCheckin } }))
            }
          />
          <StayPolicyFields
            label="Late Check-Out"
            value={draft.checkinOps.lateCheckout}
            disabled={!canEdit}
            onChange={(lateCheckout) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, lateCheckout } }))
            }
          />
        </div>
        <PropertySetupFormGrid>
          <PropertySetupFormItem span={3}>
            <Field
              id="card1-child-summary"
              label="Child Policy Summary"
              value={draft.checkinOps.childPolicyConfig.summary}
              disabled={!canEdit}
              onChange={(summary) =>
                setDraft((p) => ({
                  ...p,
                  checkinOps: {
                    ...p.checkinOps,
                    childPolicy: summary,
                    childPolicyConfig: { ...p.checkinOps.childPolicyConfig, summary },
                  },
                }))
              }
            />
          </PropertySetupFormItem>
          {(["minAge", "maxAge", "freeUntilAge", "chargeFromAge"] as const).map((key) => (
            <ControlledSelectField
              key={key}
              id={`card1-child-${key}`}
              label={
                {
                  minAge: "Minimum Child Age",
                  maxAge: "Maximum Child Age",
                  freeUntilAge: "Free Until Age",
                  chargeFromAge: "Charge From Age",
                }[key]
              }
              value={String(draft.checkinOps.childPolicyConfig[key] ?? "")}
              disabled={!canEdit}
              allowUnset
              options={Array.from({ length: 22 }, (_, age) => ({
                value: String(age),
                label: `${age} years`,
              }))}
              onChange={(value) =>
                setDraft((p) => ({
                  ...p,
                  checkinOps: {
                    ...p.checkinOps,
                    childPolicyConfig: {
                      ...p.checkinOps.childPolicyConfig,
                      [key]: value || null,
                    },
                  },
                }))
              }
            />
          ))}
        </PropertySetupFormGrid>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow
            id="card1-day-use"
            label="Day Use Allowed"
            checked={draft.checkinOps.dayUseAllowed}
            disabled={!canEdit}
            onChange={(dayUseAllowed) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, dayUseAllowed } }))
            }
          />
          <ToggleRow
            id="card1-24h"
            label="24-hour Front Desk"
            checked={draft.checkinOps.frontDesk24h}
            disabled={!canEdit}
            onChange={(frontDesk24h) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, frontDesk24h } }))
            }
          />
          <ToggleRow
            id="card1-extra-bed"
            label="Extra Bed Availability"
            checked={draft.checkinOps.extraBedAvailable}
            disabled={!canEdit}
            onChange={(extraBedAvailable) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, extraBedAvailable } }))
            }
          />
          <ToggleRow
            id="card1-id"
            label="ID Required at Check-in"
            checked={draft.checkinOps.idRequiredAtCheckin}
            disabled={!canEdit}
            onChange={(idRequiredAtCheckin) =>
              setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, idRequiredAtCheckin } }))
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="card1-ci-policy">Check-in Instructions</Label>
            <Textarea
              id="card1-ci-policy"
              maxLength={1000}
              value={draft.checkinPolicyText}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((p) => ({ ...p, checkinPolicyText: event.target.value.slice(0, 1000) }))
              }
            />
            <p className="text-xs text-muted-foreground">{draft.checkinPolicyText.length}/1000</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card1-co-policy">Check-out Notes</Label>
            <Textarea
              id="card1-co-policy"
              maxLength={1000}
              value={draft.checkoutPolicyText}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((p) => ({ ...p, checkoutPolicyText: event.target.value.slice(0, 1000) }))
              }
            />
            <p className="text-xs text-muted-foreground">{draft.checkoutPolicyText.length}/1000</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

const HOURLY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: `${String(hour).padStart(2, "0")}:00`,
  label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? "AM" : "PM"}`,
}));

function ControlledSelectField({
  id,
  label,
  value,
  options,
  disabled,
  allowUnset,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  allowUnset?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <PropertySetupField id={id} label={label}>
      <Select
        value={value || "__unset"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "__unset" ? "" : next)}
      >
        <SelectTrigger id={id} className={SELECT_TRIGGER_CLASS}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {allowUnset || !value ? <SelectItem value="__unset">Not set</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </PropertySetupField>
  );
}

function TimeSelect({
  id,
  label,
  value,
  disabled,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const options =
    value && !HOURLY_TIME_OPTIONS.some((option) => option.value === value)
      ? [{ value, label: `${value} (legacy)` }, ...HOURLY_TIME_OPTIONS]
      : HOURLY_TIME_OPTIONS;
  return (
    <PropertySetupField id={id} label={label} required={required}>
      <Select value={value || "__unset"} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className={SELECT_TRIGGER_CLASS}>
          <SelectValue placeholder="Select time" />
        </SelectTrigger>
        <SelectContent>
          {!value ? <SelectItem value="__unset">Select time</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </PropertySetupField>
  );
}

function StayPolicyFields({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: Card1StayPolicy;
  disabled?: boolean;
  onChange: (value: Card1StayPolicy) => void;
}) {
  return (
    <PropertySetupPanel title={label} icon="time">
      <PropertySetupSettingRow
        id={`card1-${label.toLowerCase().replaceAll(" ", "-")}-allowed`}
        label="Allowed"
        checked={value.allowed}
        disabled={disabled}
        onChange={(allowed) => onChange({ ...value, allowed })}
      />
      <PropertySetupFormGrid>
        <ControlledSelectField
          id={`card1-${label}-basis`}
          label="Fee Basis"
          value={value.feeBasis}
          disabled={disabled || !value.allowed}
          options={[
            { value: "percent_stay", label: "Percentage of stay" },
            { value: "fixed", label: "Fixed amount" },
            { value: "first_night", label: "First night" },
          ]}
          onChange={(feeBasis) =>
            onChange({ ...value, feeBasis: feeBasis as Card1StayPolicy["feeBasis"] })
          }
        />
        <PropertySetupField id={`card1-${label}-fee`} label="Base Fee Value">
          <Input
            id={`card1-${label}-fee`}
            type="number"
            min={0}
            step="0.01"
            value={value.feeValue ?? ""}
            disabled={disabled || !value.allowed}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => onChange({ ...value, feeValue: event.target.value || null })}
          />
        </PropertySetupField>
      </PropertySetupFormGrid>
    </PropertySetupPanel>
  );
}

export function BusinessDateStep({
  draft,
  setDraft,
  canEdit,
  currentState,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  currentState: Card1CurrentState;
}) {
  const preview = liveBlockPreview(draft.businessDateBlockers);
  return (
    <div className="space-y-4" data-testid="pms-card1-step-business-date">
      <Panel title="CURRENT STATE" helper={CARD1_BUSINESS_DATE_CURRENT_COPY} icon="date">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="card1-business-date-current">Business Date</Label>
            <Input
              id="card1-business-date-current"
              value={currentState.businessDate ?? "—"}
              readOnly
              disabled
              data-testid="card1-business-date-current"
              className="h-11 bg-muted/40"
            />
          </div>
          <Field
            id="card1-system-date"
            label="System Date"
            value={currentState.systemDate || "—"}
            readOnly
          />
          <Field
            id="card1-local-time"
            label="Property Local Time"
            value={currentState.propertyLocalTime || "—"}
            readOnly
          />
          <Field id="card1-bd-status" label="Status" value={currentState.status} readOnly />
          <Field
            id="card1-last-na"
            label="Last Successful Night Audit"
            value={currentState.lastSuccessfulNightAudit || "Never"}
            readOnly
          />
        </div>
      </Panel>
      <Panel title="CONFIGURATION" icon="time">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Business date time zone</Label>
            <Input value={draft.timezone || "—"} readOnly disabled className="h-11 bg-muted/40" />
            <a
              href={`${SET1_HUB_HREF}#property-business`}
              className="text-xs font-medium text-[#C89933]"
              onClick={() => {
                window.location.hash = "property-business";
              }}
            >
              Edit in Property Identity
            </a>
          </div>
          <TimeSelect
            id="card1-boundary"
            label="Business day boundary"
            required
            value={draft.businessDateConfig.dayBoundary}
            disabled={!canEdit}
            onChange={(dayBoundary) =>
              setDraft((p) => ({
                ...p,
                businessDateConfig: { ...p.businessDateConfig, dayBoundary },
              }))
            }
          />
          <TimeSelect
            id="card1-na-start"
            label="Expected Night Audit window start"
            required
            value={draft.businessDateConfig.nightAuditWindowStart}
            disabled={!canEdit}
            onChange={(nightAuditWindowStart) =>
              setDraft((p) => ({
                ...p,
                businessDateConfig: { ...p.businessDateConfig, nightAuditWindowStart },
              }))
            }
          />
          <TimeSelect
            id="card1-na-end"
            label="Expected Night Audit window end"
            required
            value={draft.businessDateConfig.nightAuditWindowEnd}
            disabled={!canEdit}
            onChange={(nightAuditWindowEnd) =>
              setDraft((p) => ({
                ...p,
                businessDateConfig: { ...p.businessDateConfig, nightAuditWindowEnd },
              }))
            }
          />
        </div>
        <ToggleRow
          id="card1-auto-roll"
          label="Automatic date rollover — Only after successful Night Audit"
          checked={draft.businessDateConfig.automaticRollover}
          disabled={!canEdit}
          onChange={(automaticRollover) =>
            setDraft((p) => ({
              ...p,
              businessDateConfig: { ...p.businessDateConfig, automaticRollover },
            }))
          }
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#251605]">
            Manual rollover (permissions) <span className="text-red-600">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {CARD1_MANUAL_ROLLOVER_ROLES.map((role) => {
              const on = draft.businessDateConfig.manualRolloverRoles.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    setDraft((p) => {
                      const roles = on
                        ? p.businessDateConfig.manualRolloverRoles.filter((id) => id !== role.id)
                        : [...p.businessDateConfig.manualRolloverRoles, role.id];
                      return {
                        ...p,
                        businessDateConfig: {
                          ...p.businessDateConfig,
                          manualRolloverRoles: roles,
                        },
                      };
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]" : "border-[#CCCCCC] text-muted-foreground"}`}
                >
                  {role.label}
                </button>
              );
            })}
          </div>
        </div>
        <ToggleRow
          id="card1-approval"
          label="Approval required"
          checked={draft.businessDateConfig.approvalRequired}
          disabled={!canEdit}
          onChange={(approvalRequired) =>
            setDraft((p) => ({
              ...p,
              businessDateConfig: { ...p.businessDateConfig, approvalRequired },
            }))
          }
        />
        <ToggleRow
          id="card1-lock"
          label="Business date lock during audit"
          checked={draft.businessDateConfig.lockDuringAudit}
          disabled={!canEdit}
          onChange={(lockDuringAudit) =>
            setDraft((p) => ({
              ...p,
              businessDateConfig: { ...p.businessDateConfig, lockDuringAudit },
            }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="card1-sell-date"
            label="Reservation sell date rule"
            value={`Uses business date: ${currentState.businessDate ?? "—"}`}
            readOnly
          />
          <Field
            id="card1-hk-date"
            label="Housekeeping board date"
            value={currentState.businessDate ?? "—"}
            readOnly
          />
          <Field
            id="card1-fo-date"
            label="Front Office desk date"
            value={currentState.businessDate ?? "—"}
            readOnly
          />
          <div className="space-y-1.5">
            <Label htmlFor="card1-calendar">Calendar display</Label>
            <Select
              value={draft.businessDateConfig.calendarDisplay}
              onValueChange={(calendarDisplay) =>
                setDraft((p) => ({
                  ...p,
                  businessDateConfig: {
                    ...p.businessDateConfig,
                    calendarDisplay: calendarDisplay as typeof p.businessDateConfig.calendarDisplay,
                  },
                }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-calendar" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD1_CALENDAR_DISPLAYS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CARD1_CALENDAR_DISPLAY_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>
      <Panel title="Block Date Advance When" icon="security">
        <div className="space-y-2">
          {CARD1_DEFAULT_BLOCKERS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.businessDateBlockers.includes(id)}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((p) => ({
                    ...p,
                    businessDateBlockers:
                      checked === true
                        ? [...new Set([...p.businessDateBlockers, id])]
                        : p.businessDateBlockers.filter((row) => row !== id),
                  }))
                }
              />
              {CARD1_BLOCKER_LABELS[id]}
            </label>
          ))}
        </div>
        <div
          className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          data-testid="card1-live-block-preview"
        >
          <p className="font-medium">Live Block Preview</p>
          <p className="mt-1">{preview}</p>
        </div>
      </Panel>
      <Panel title="Recommended Defaults" icon="document">
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>Rollover only after successful Night Audit</li>
          <li>FO / HK / Reservations follow business date</li>
          <li>Time zone managed in Property Identity</li>
        </ul>
      </Panel>
    </div>
  );
}

export function LegalStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-legal">
      <Panel title="Legal Identity" helper={CARD1_AGREEMENT_OUT} icon="briefcase">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            id="card1-legal-name"
            label="Registered Company Name"
            required
            value={draft.legalName}
            disabled={!canEdit}
            onChange={(legalName) => setDraft((p) => ({ ...p, legalName }))}
          />
          <Field
            id="card1-legal-entity"
            label="Legal entity name"
            value={draft.legalEntityName}
            disabled={!canEdit}
            onChange={(legalEntityName) => setDraft((p) => ({ ...p, legalEntityName }))}
          />
          <Field
            id="card1-ownership"
            label="Ownership Type"
            value={draft.legalExtras.ownershipType}
            disabled={!canEdit}
            onChange={(ownershipType) =>
              setDraft((p) => ({ ...p, legalExtras: { ...p.legalExtras, ownershipType } }))
            }
          />
          <Field
            id="card1-incorp"
            label="Date of Incorporation"
            type="date"
            value={draft.legalExtras.incorporationDate}
            disabled={!canEdit}
            onChange={(incorporationDate) =>
              setDraft((p) => ({ ...p, legalExtras: { ...p.legalExtras, incorporationDate } }))
            }
          />
          <div className="space-y-1.5">
            <Label htmlFor="card1-entity-type">Entity type</Label>
            <Select
              value={draft.legalEntityType || "unset"}
              onValueChange={(value) =>
                setDraft((p) => ({
                  ...p,
                  legalEntityType: value === "unset" ? "" : (value as typeof draft.legalEntityType),
                }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-entity-type" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {LEGAL_ENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {LEGAL_ENTITY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            id="card1-reg"
            label="Registration number"
            value={draft.registrationNumber}
            disabled={!canEdit}
            onChange={(registrationNumber) => setDraft((p) => ({ ...p, registrationNumber }))}
          />
        </div>
        <UploadRefs
          restaurantId={restaurantId}
          label="Certificate of Incorporation"
          kind="certificate_of_incorporation"
          refs={draft.legalUploadRefs}
          canEdit={canEdit}
          onChange={(legalUploadRefs) => setDraft((p) => ({ ...p, legalUploadRefs }))}
        />
        <UploadRefs
          restaurantId={restaurantId}
          label="Trade License Copy"
          kind="trade_license"
          refs={draft.legalUploadRefs}
          canEdit={canEdit}
          onChange={(legalUploadRefs) => setDraft((p) => ({ ...p, legalUploadRefs }))}
        />
      </Panel>
    </div>
  );
}

export function TaxStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  warnings,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings: string[];
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-tax">
      <Panel title="Tax & Documents" helper={CARD1_VAT_GATE_COPY} icon="tax">
        <div className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 p-3 text-sm text-[#251605]">
          Tax identity is used for property setup and compliance. VAT certificate is required only
          when VAT Registered is On.
        </div>
        <ToggleRow
          id="card1-vat-registered"
          label="VAT Registered"
          checked={draft.vatRegistered}
          disabled={!canEdit}
          onChange={(vatRegistered) => setDraft((p) => ({ ...p, vatRegistered }))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="card1-vat-number"
            label="VAT number"
            value={draft.vatNumber}
            disabled={!canEdit}
            onChange={(vatNumber) => setDraft((p) => ({ ...p, vatNumber }))}
          />
          <Field
            id="card1-tin"
            label="TIN"
            value={draft.tinNumber}
            disabled={!canEdit}
            onChange={(tinNumber) => setDraft((p) => ({ ...p, tinNumber }))}
          />
          <Field
            id="card1-licence"
            label="Licence number"
            value={draft.licenceNumber}
            disabled={!canEdit}
            onChange={(licenceNumber) => setDraft((p) => ({ ...p, licenceNumber }))}
          />
        </div>
        <UploadRefs
          restaurantId={restaurantId}
          label="Trade License"
          kind="trade_license"
          required
          refs={draft.taxUploadRefs}
          canEdit={canEdit}
          onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))}
        />
        <UploadRefs
          restaurantId={restaurantId}
          label="TIN Certificate"
          kind="tin_certificate"
          required
          refs={draft.taxUploadRefs}
          canEdit={canEdit}
          onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))}
        />
        {vatCertificateRequired(draft.vatRegistered) ? (
          <UploadRefs
            restaurantId={restaurantId}
            label="VAT certificate"
            kind="vat_certificate"
            required
            refs={draft.taxUploadRefs}
            canEdit={canEdit}
            onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))}
          />
        ) : null}
        {warnings.map((warning) => (
          <p key={warning} className="text-sm text-[#C89933]" data-testid="card1-vat-warning">
            {warning}
          </p>
        ))}
      </Panel>
    </div>
  );
}

type StructureNode = { kind: "building" | "wing" | "floor"; id: string };

export function StructureStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  set2,
  snapshot,
  warnings,
  propertyAreas,
  functionalHardeningAvailable,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  set2: Set2Snapshot;
  snapshot: Card1Snapshot;
  warnings: string[];
  propertyAreas: Card1PropertyArea[];
  functionalHardeningAvailable: boolean;
}) {
  const queryClient = useQueryClient();
  const saveBuilding = useServerFn(saveHotelBuilding);
  const saveFloor = useServerFn(saveHotelFloor);
  const saveWing = useServerFn(saveHotelWing);
  const removeStructure = useServerFn(deleteStructureNode);
  const saveArea = useServerFn(saveCard1PropertyArea);
  const removeArea = useServerFn(deleteCard1PropertyArea);
  const [selected, setSelected] = useState<StructureNode | null>(null);
  const [editingArea, setEditingArea] = useState<Card1PropertyArea | null>(null);
  const [areaName, setAreaName] = useState("");
  const [areaDescription, setAreaDescription] = useState("");

  const building =
    selected?.kind === "building"
      ? (set2.buildings.find((row) => row.id === selected.id) ?? null)
      : null;
  const wing =
    selected?.kind === "wing" ? (set2.wings.find((row) => row.id === selected.id) ?? null) : null;
  const floor =
    selected?.kind === "floor" ? (set2.floors.find((row) => row.id === selected.id) ?? null) : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
  };

  const buildingMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      active: boolean;
      floorCount?: number | null;
      buildingType?: string;
      description?: string;
      location?: string;
      status?: string;
    }) => saveBuilding({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Building saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const floorMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      buildingId: string;
      code: string;
      name: string;
      active: boolean;
      floorNumber?: number | null;
      description?: string;
      status?: string;
      wingId?: string | null;
    }) => saveFloor({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Floor saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const wingMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      active: boolean;
      parentBuildingId?: string | null;
      parentFloorId?: string | null;
      code?: string;
      description?: string;
      status?: string;
    }) => saveWing({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Wing saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteStructureMutation = useMutation({
    mutationFn: (node: StructureNode) =>
      removeStructure({
        data: { restaurantId, kind: node.kind, id: node.id, reassignToId: null },
      }),
    onSuccess: () => {
      toast.success("Structure item deleted.");
      setSelected(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const areaMutation = useMutation({
    mutationFn: () =>
      saveArea({
        data: {
          restaurantId,
          id: editingArea?.id,
          name: areaName,
          description: areaDescription,
          active: editingArea?.active ?? true,
          sortOrder: editingArea?.sortOrder ?? propertyAreas.length,
        },
      }),
    onSuccess: () => {
      toast.success("Property area saved.");
      setEditingArea(null);
      setAreaName("");
      setAreaDescription("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteAreaMutation = useMutation({
    mutationFn: (id: string) => removeArea({ data: { restaurantId, id } }),
    onSuccess: () => {
      toast.success("Property area deleted.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tree = useMemo(
    () =>
      set2.buildings.map((row) => ({
        building: row,
        wings: set2.wings.filter((item) => item.parentBuildingId === row.id),
        floors: set2.floors.filter((item) => item.buildingId === row.id),
      })),
    [set2.buildings, set2.floors, set2.wings],
  );

  return (
    <div
      className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]"
      data-testid="pms-card1-step-structure"
    >
      <Panel
        title="Property Structure"
        helper={CARD1_STRUCTURE_CRUD_COPY}
        testId="card1-structure-tree"
        icon="facility"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit}
            onClick={() =>
              buildingMutation.mutate({
                code: `B${set2.buildings.length + 1}`,
                name: `Building ${set2.buildings.length + 1}`,
                active: true,
              })
            }
          >
            + Add Building
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || set2.buildings.length === 0}
            onClick={() =>
              wingMutation.mutate({
                name: `Wing ${set2.wings.length + 1}`,
                active: true,
                parentBuildingId:
                  selected?.kind === "building" ? selected.id : (set2.buildings[0]?.id ?? null),
                parentFloorId: null,
                code: `W${set2.wings.length + 1}`,
              })
            }
          >
            + Add Wing
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || set2.buildings.length === 0}
            onClick={() =>
              floorMutation.mutate({
                buildingId:
                  selected?.kind === "building" ? selected.id : (set2.buildings[0]?.id ?? ""),
                code: `${set2.floors.length + 1}`,
                name: `Floor ${set2.floors.length + 1}`,
                active: true,
                floorNumber: set2.floors.length + 1,
                wingId: selected?.kind === "wing" ? selected.id : null,
              })
            }
          >
            + Add Floor
          </Button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {tree.map((node) => (
            <li key={node.building.id}>
              <button
                type="button"
                onClick={() => setSelected({ kind: "building", id: node.building.id })}
                className={`w-full rounded-lg border px-2 py-1.5 text-left ${selected?.id === node.building.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}
              >
                {node.building.name} · {node.building.code}
              </button>
              <ul className="ml-4 mt-1 space-y-1">
                {node.wings.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: "wing", id: item.id })}
                      className={`w-full rounded-lg border px-2 py-1 text-left ${selected?.id === item.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}
                    >
                      Wing · {item.name}
                    </button>
                  </li>
                ))}
                {node.floors.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: "floor", id: item.id })}
                      className={`w-full rounded-lg border px-2 py-1 text-left ${selected?.id === item.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}
                    >
                      Floor · {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="space-y-4">
        {building ? (
          <Panel title="Building Details">
            <BuildingForm
              key={building.id}
              building={building}
              canEdit={canEdit}
              pending={buildingMutation.isPending}
              onSave={(input) => buildingMutation.mutate(input)}
              onDeactivate={() =>
                buildingMutation.mutate({
                  id: building.id,
                  code: building.code,
                  name: building.name,
                  active: false,
                  status: "inactive",
                })
              }
            />
          </Panel>
        ) : wing ? (
          <Panel title="Wing Details">
            <WingForm
              key={wing.id}
              wing={wing}
              buildings={set2.buildings}
              canEdit={canEdit}
              pending={wingMutation.isPending}
              onSave={(input) => wingMutation.mutate(input)}
              onDeactivate={() =>
                wingMutation.mutate({
                  id: wing.id,
                  name: wing.name,
                  active: false,
                  parentBuildingId: wing.parentBuildingId,
                  parentFloorId: wing.parentFloorId,
                  status: "inactive",
                })
              }
            />
          </Panel>
        ) : floor ? (
          <Panel title="Floor Details">
            <FloorForm
              key={floor.id}
              floor={floor}
              buildings={set2.buildings}
              wings={set2.wings}
              canEdit={canEdit}
              pending={floorMutation.isPending}
              onSave={(input) => floorMutation.mutate(input)}
              onDeactivate={() =>
                floorMutation.mutate({
                  id: floor.id,
                  buildingId: floor.buildingId,
                  code: floor.code,
                  name: floor.name,
                  active: false,
                  status: "inactive",
                })
              }
            />
          </Panel>
        ) : (
          <Panel title="Details">
            <p className="text-sm text-muted-foreground">
              Select a building, wing or floor — or add one. Full hierarchy CRUD is live.
            </p>
          </Panel>
        )}
        {selected && canEdit ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              disabled={deleteStructureMutation.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this structure item? Dependencies will block unsafe deletion.",
                  )
                )
                  return;
                deleteStructureMutation.mutate(selected);
              }}
            >
              Delete {selected.kind}
            </Button>
          </div>
        ) : null}
        <Panel title="Property Areas">
          {functionalHardeningAvailable ? (
            <div className="space-y-3">
              {propertyAreas.map((area) => (
                <div key={area.id} className="flex items-center gap-2 rounded-[6px] border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#251605]">{area.name}</p>
                    {area.description ? (
                      <p className="text-xs text-muted-foreground">{area.description}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingArea(area);
                          setAreaName(area.name);
                          setAreaDescription(area.description);
                        }}
                      >
                        Edit
                      </Button>
                      <PropertySetupRemoveButton
                        label={`Delete ${area.name}`}
                        disabled={deleteAreaMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete property area “${area.name}”?`)) {
                            deleteAreaMutation.mutate(area.id);
                          }
                        }}
                      />
                    </>
                  ) : null}
                </div>
              ))}
              {canEdit ? (
                <PropertySetupFormGrid>
                  <Field
                    id="card1-area-name"
                    label="Area Name"
                    value={areaName}
                    onChange={setAreaName}
                  />
                  <Field
                    id="card1-area-description"
                    label="Description"
                    value={areaDescription}
                    onChange={setAreaDescription}
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      disabled={!areaName.trim() || areaMutation.isPending}
                      onClick={() => areaMutation.mutate()}
                    >
                      {editingArea ? "Save Area" : "Add Area"}
                    </Button>
                    {editingArea ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingArea(null);
                          setAreaName("");
                          setAreaDescription("");
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </PropertySetupFormGrid>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {CARD1_PROPERTY_AREA_OPTIONS.map((area) => {
                const on = draft.propertyAreas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        propertyAreas: on
                          ? p.propertyAreas.filter((row) => row !== area)
                          : [...p.propertyAreas, area],
                      }))
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]" : "border-[#CCCCCC] text-muted-foreground"}`}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Capacity" helper={CARD1_CAPACITY_COPY}>
          <div className="grid gap-2 sm:grid-cols-2 text-sm" data-testid="card1-derived-capacity">
            <p>Buildings: {snapshot.derivedCapacity.buildings}</p>
            <p>Floors: {snapshot.derivedCapacity.floors}</p>
            <p>Rooms: {snapshot.derivedCapacity.rooms}</p>
            <p>Active: {snapshot.derivedCapacity.active}</p>
            <p>Inactive: {snapshot.derivedCapacity.inactive}</p>
            <p>Sellable: {snapshot.derivedCapacity.sellable}</p>
            <p>Non-sellable: {snapshot.derivedCapacity.nonSellable}</p>
          </div>
          <a href={CARD1_ROOMS_HREF} className="inline-flex text-sm font-medium text-[#C89933]">
            Open room inventory
          </a>
        </Panel>
        <Panel title="Structure Rules">
          <div className="grid gap-3 sm:grid-cols-3">
            <RuleChip label="Building required" on={draft.structureRules.buildingRequired} />
            <RuleChip label="Wing optional" on={draft.structureRules.wingOptional} />
            <RuleChip label="Floor required" on={draft.structureRules.floorRequired} />
          </div>
          <Field
            id="card1-code-format"
            label="Room # / Code Format"
            value={draft.structureRules.roomCodeFormat}
            disabled={!canEdit}
            onChange={(roomCodeFormat) =>
              setDraft((p) => ({ ...p, structureRules: { ...p.structureRules, roomCodeFormat } }))
            }
            helper={`Example: ${structureRoomCodeExample(draft.structureRules.roomCodeFormat)}`}
          />
          <ToggleRow
            id="card1-auto-number"
            label="Auto Numbering"
            checked={draft.structureRules.autoNumbering}
            disabled={!canEdit}
            onChange={(autoNumbering) =>
              setDraft((p) => ({ ...p, structureRules: { ...p.structureRules, autoNumbering } }))
            }
          />
          <ToggleRow
            id="card1-dup"
            label="Duplicate Code Prevention"
            checked={draft.structureRules.duplicateCodePrevention}
            disabled={!canEdit}
            onChange={(duplicateCodePrevention) =>
              setDraft((p) => ({
                ...p,
                structureRules: { ...p.structureRules, duplicateCodePrevention },
              }))
            }
          />
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-[#C89933]">
              {warning}
            </p>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function BuildingForm({
  building,
  canEdit,
  pending,
  onSave,
  onDeactivate,
}: {
  building: Set2Snapshot["buildings"][number];
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    floorCount: number | null;
    buildingType: string;
    description: string;
    location: string;
    status: string;
  }) => void;
  onDeactivate: () => void;
}) {
  const [name, setName] = useState(building.name);
  const [code, setCode] = useState(building.code);
  const [type, setType] = useState(building.buildingType);
  const [floors, setFloors] = useState(
    building.floorCount == null ? "" : String(building.floorCount),
  );
  const [description, setDescription] = useState(building.description);
  const [location, setLocation] = useState(building.location);
  const [status, setStatus] = useState(
    building.status || (building.active ? "active" : "inactive"),
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="b-name"
          label="Name"
          required
          value={name}
          disabled={!canEdit}
          onChange={setName}
        />
        <Field
          id="b-code"
          label="Code"
          required
          value={code}
          disabled={!canEdit}
          onChange={setCode}
        />
        <Field id="b-type" label="Type" value={type} disabled={!canEdit} onChange={setType} />
        <Field
          id="b-floors"
          label="Number of Floors"
          value={floors}
          disabled={!canEdit}
          onChange={setFloors}
        />
        <Field
          id="b-status"
          label="Status"
          value={status}
          disabled={!canEdit}
          onChange={setStatus}
        />
        <Field
          id="b-location"
          label="Location"
          value={location}
          disabled={!canEdit}
          onChange={setLocation}
        />
      </div>
      <Field
        id="b-desc"
        label="Description"
        value={description}
        disabled={!canEdit}
        onChange={setDescription}
      />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              onSave({
                id: building.id,
                code,
                name,
                active: status !== "inactive",
                floorCount: floors ? Number(floors) : null,
                buildingType: type,
                description,
                location,
                status,
              })
            }
          >
            Edit / Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !building.active}
            onClick={onDeactivate}
          >
            Deactivate
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WingForm({
  wing,
  buildings,
  canEdit,
  pending,
  onSave,
  onDeactivate,
}: {
  wing: Set2Snapshot["wings"][number];
  buildings: Set2Snapshot["buildings"];
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    id: string;
    name: string;
    active: boolean;
    parentBuildingId: string | null;
    parentFloorId: string | null;
    code: string;
    description: string;
    status: string;
  }) => void;
  onDeactivate: () => void;
}) {
  const [name, setName] = useState(wing.name);
  const [code, setCode] = useState(wing.code);
  const [description, setDescription] = useState(wing.description);
  const [status, setStatus] = useState(wing.status || (wing.active ? "active" : "inactive"));
  const [buildingId, setBuildingId] = useState(wing.parentBuildingId ?? buildings[0]?.id ?? "");
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="w-name"
          label="Name"
          required
          value={name}
          disabled={!canEdit}
          onChange={setName}
        />
        <Field
          id="w-code"
          label="Code"
          required
          value={code}
          disabled={!canEdit}
          onChange={setCode}
        />
        <Field
          id="w-status"
          label="Status"
          value={status}
          disabled={!canEdit}
          onChange={setStatus}
        />
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Select value={buildingId} onValueChange={setBuildingId} disabled={!canEdit}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field
        id="w-desc"
        label="Description"
        value={description}
        disabled={!canEdit}
        onChange={setDescription}
      />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              onSave({
                id: wing.id,
                name,
                active: status !== "inactive",
                parentBuildingId: buildingId || null,
                parentFloorId: null,
                code,
                description,
                status,
              })
            }
          >
            Edit / Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !wing.active}
            onClick={onDeactivate}
          >
            Deactivate
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FloorForm({
  floor,
  buildings,
  wings,
  canEdit,
  pending,
  onSave,
  onDeactivate,
}: {
  floor: Set2Snapshot["floors"][number];
  buildings: Set2Snapshot["buildings"];
  wings: Set2Snapshot["wings"];
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    id: string;
    buildingId: string;
    code: string;
    name: string;
    active: boolean;
    floorNumber: number | null;
    description: string;
    status: string;
    wingId: string | null;
  }) => void;
  onDeactivate: () => void;
}) {
  const [name, setName] = useState(floor.name);
  const [code, setCode] = useState(floor.code);
  const [number, setNumber] = useState(floor.floorNumber == null ? "" : String(floor.floorNumber));
  const [description, setDescription] = useState(floor.description);
  const [status, setStatus] = useState(floor.status || (floor.active ? "active" : "inactive"));
  const [buildingId, setBuildingId] = useState(floor.buildingId);
  const [wingId, setWingId] = useState(floor.wingId ?? "none");
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="f-name"
          label="Name"
          required
          value={name}
          disabled={!canEdit}
          onChange={setName}
        />
        <Field
          id="f-number"
          label="Number"
          required
          value={number}
          disabled={!canEdit}
          onChange={setNumber}
        />
        <Field
          id="f-code"
          label="Code"
          required
          value={code}
          disabled={!canEdit}
          onChange={setCode}
        />
        <Field
          id="f-status"
          label="Status"
          value={status}
          disabled={!canEdit}
          onChange={setStatus}
        />
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Select value={buildingId} onValueChange={setBuildingId} disabled={!canEdit}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Wing</Label>
          <Select value={wingId} onValueChange={setWingId} disabled={!canEdit}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {wings.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field
        id="f-desc"
        label="Description"
        value={description}
        disabled={!canEdit}
        onChange={setDescription}
      />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              onSave({
                id: floor.id,
                buildingId,
                code,
                name,
                active: status !== "inactive",
                floorNumber: number ? Number(number) : null,
                description,
                status,
                wingId: wingId === "none" ? null : wingId,
              })
            }
          >
            Edit / Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !floor.active}
            onClick={onDeactivate}
          >
            Deactivate
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  helper,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <PropertySetupSettingRow
      id={id}
      label={label}
      helper={helper}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function RuleChip({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className="rounded-xl border border-[#CCCCCC] px-3 py-2 text-sm"
      data-testid={`card1-rule-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="font-medium text-[#251605]">{label}</p>
      <p className="text-muted-foreground">{on ? "On" : "Off"}</p>
    </div>
  );
}

function ColourField({
  id,
  label,
  value,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const hex = value.startsWith("#") ? value : value ? `#${value}` : "#C9A227";
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#C9A227";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <label className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#CCCCCC]">
          <span className="sr-only">{label} swatch</span>
          <Input
            type="color"
            aria-label={`${label} picker`}
            value={pickerValue}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0"
          />
        </label>
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder="#C9A227"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={PROPERTY_SETUP_CONTROL_CLASS}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BrandImageField({
  id,
  label,
  kind,
  restaurantId,
  value,
  previewUrl,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  kind: "logo" | "cover";
  restaurantId: string;
  value: string;
  previewUrl: string;
  disabled?: boolean | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const startUpload = useServerFn(createPropertyBrandImageUpload);
  const [localPreview, setLocalPreview] = useState("");
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const shown = localPreview || (value ? previewUrl : "");
  const message = localError || error;
  const landscape = kind === "cover";

  async function onFile(file: File | undefined) {
    if (!file) return;
    const invalid = validateBrandImageFile(file);
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    setLocalError("");
    setUploading(true);
    try {
      const ticket = await startUpload({
        data: {
          restaurantId,
          kind,
          contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
          size: file.size,
        },
      });
      if (!ticket.ok) {
        setLocalError(ticket.message ?? CARD1_BRAND_IMAGE_UPLOAD_ERROR);
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploadError) {
        setLocalError(CARD1_BRAND_IMAGE_UPLOAD_ERROR);
        return;
      }
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      onChange(ticket.path);
    } catch {
      setLocalError(CARD1_BRAND_IMAGE_UPLOAD_ERROR);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-file`}>{label}</Label>
      <div className={`flex items-center gap-3 ${landscape ? "sm:items-stretch" : ""}`}>
        <div
          className={`overflow-hidden rounded-xl border border-[#E8E2D6] bg-[#F7F4EE] ${
            landscape ? "h-20 w-36" : "h-16 w-16"
          }`}
        >
          {shown ? (
            <img src={shown} alt={`${label} preview`} className="h-full w-full object-cover" />
          ) : (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="flex h-full w-full items-center justify-center text-center text-[11px] text-muted-foreground"
            >
              Upload image
            </button>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          {shown && !disabled ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Change Image"}
              </Button>
              <PropertySetupRemoveButton
                label="Remove Image"
                disabled={uploading}
                onClick={() => {
                  if (localPreview) URL.revokeObjectURL(localPreview);
                  setLocalPreview("");
                  setLocalError("");
                  onChange("");
                }}
              />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{CARD1_BRAND_IMAGE_HELPER}</p>
        </div>
      </div>
      {message ? (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {message}
        </p>
      ) : null}
      <input
        id={`${id}-file`}
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
    </div>
  );
}

function UploadRefs({
  restaurantId,
  label,
  kind,
  refs,
  canEdit,
  required,
  onChange,
}: {
  restaurantId: string;
  label: string;
  kind: string;
  refs: Card1UploadRef[];
  canEdit: boolean;
  required?: boolean;
  onChange: (refs: Card1UploadRef[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const createUpload = useServerFn(createPropertyComplianceDocumentUpload);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const rows = refs.filter((row) => row.kind === kind);

  async function remove(row: Card1UploadRef) {
    onChange(refs.filter((item) => item !== row));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      setError("Only PDF, PNG, JPG and JPEG files are allowed.");
      return;
    }
    if (file.size >= 1024 * 1024) {
      setError("File must be smaller than 1 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const ticket = await createUpload({
        data: {
          restaurantId,
          kind: kind as
            | "certificate_of_incorporation"
            | "trade_license"
            | "tin_certificate"
            | "vat_certificate",
          contentType: file.type as "application/pdf" | "image/png" | "image/jpeg",
          size: file.size,
        },
      });
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploadError) throw uploadError;
      const next: Card1UploadRef = {
        name: file.name,
        kind,
        storagePath: ticket.path,
        mimeType: file.type,
        sizeBytes: file.size,
        viewUrl: URL.createObjectURL(file),
      };
      onChange([...refs.filter((row) => row.kind !== kind), next]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? " (required)" : ""}
      </Label>
      {rows.map((row, index) => (
        <div
          key={`${row.storagePath ?? row.name}-${index}`}
          className="flex min-w-0 items-center gap-2 rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-[#251605]">{row.name}</span>
          {row.viewUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open(row.viewUrl, "_blank", "noopener,noreferrer")}
            >
              View
            </Button>
          ) : null}
          {canEdit ? (
            <PropertySetupRemoveButton
              label={`Remove ${label}`}
              disabled={uploading}
              onClick={() => void remove(row)}
            />
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : rows.length > 0 ? `Replace ${label}` : `Upload ${label}`}
        </Button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="sr-only"
        disabled={!canEdit || uploading}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <p className="text-xs text-muted-foreground">PDF, PNG or JPEG. Smaller than 1 MB.</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
