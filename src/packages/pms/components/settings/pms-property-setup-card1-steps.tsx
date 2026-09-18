import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { COMMON_CURRENCIES, COMMON_TIMEZONES } from "@/shared/lib/property-time";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  saveHotelBuilding,
  saveHotelFloor,
  saveHotelWing,
} from "@/packages/pms/lib/pms-set2-structure.functions";
import type { Set2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { createPropertyBrandImageUpload } from "@/packages/pms/lib/pms-property-setup-card1.functions";
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
  type Card1Draft,
  type Card1IdentityFieldErrors,
  type Card1Snapshot,
  type Card1CurrentState,
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
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
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
        className={`h-11 ${readOnly ? "bg-muted/40" : ""} ${error ? "border-red-500" : ""}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ title, helper, children, testId }: { title: string; helper?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-5" data-testid={testId}>
      <div>
        <h3 className="font-display text-lg text-[#251605]">{title}</h3>
        {helper ? <p className="mt-1 text-sm text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SelectField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
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
      onValueChange={(value) => setDraft((p) => ({ ...p, brandAffiliation: value === "unset" ? "" : value }))}
      disabled={!canEdit}
    >
      <SelectTrigger id={id} className="h-11">
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
      <Panel title="Property Identity" helper={CARD1_IDENTITY_HELPER} testId="card1-identity-panel">
        <span className="sr-only">{CARD1_OPENING_DATE_IN}</span>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="card1-property-code">Property Code</Label>
            <div className="relative">
              <Input
                id="card1-property-code"
                value={draft.propertyCode || "NRC————"}
                readOnly
                disabled
                title={CARD1_PROPERTY_CODE_TOOLTIP}
                className="h-11 bg-muted/40 pr-10"
                data-testid="card1-property-code"
              />
              <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-xs text-muted-foreground">{CARD1_PROPERTY_CODE_TOOLTIP}</p>
          </div>
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
          <SelectField id="card1-property-type" label="Property Type" required error={errors.propertyType}>
            <Select
              value={draft.propertyType || "unset"}
              onValueChange={(value) => {
                onClearError("propertyType");
                setDraft((p) => ({ ...p, propertyType: value === "unset" ? "" : value }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-property-type" className="h-11" aria-invalid={Boolean(errors.propertyType)}>
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
          <SelectField id="card1-business-type" label="Business Type" required error={errors.businessType}>
            <Select
              value={draft.businessType || "unset"}
              onValueChange={(value) => {
                onClearError("businessType");
                setDraft((p) => ({ ...p, businessType: value === "unset" ? "" : value }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-business-type" className="h-11" aria-invalid={Boolean(errors.businessType)}>
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
                setDraft((p) => ({ ...p, starRating: value === "unset" ? "" : (Number(value) as 1 | 2 | 3 | 4 | 5) }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-star" className="h-11">
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
          <SelectField id="card1-currency" label="Primary Currency" required error={errors.currencyCode}>
            <Select
              value={draft.currencyCode}
              onValueChange={(currencyCode) => {
                onClearError("currencyCode");
                setDraft((p) => ({ ...p, currencyCode }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-currency" className="h-11">
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
              <SelectTrigger id="card1-timezone" className="h-11">
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
              <SelectTrigger id="card1-language" className="h-11">
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
          <SelectField id="card1-affiliation" label="Brand / Chain Affiliation">
            <AffiliationSelect id="card1-affiliation" draft={draft} setDraft={setDraft} canEdit={canEdit} />
          </SelectField>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card1-short-description">Short Description</Label>
          <Textarea
            id="card1-short-description"
            maxLength={500}
            value={draft.shortDescription}
            disabled={!canEdit}
            onChange={(event) => setDraft((p) => ({ ...p, shortDescription: event.target.value.slice(0, 500) }))}
          />
          <p className="text-xs text-muted-foreground text-right">{draft.shortDescription.length}/500</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ToggleRow
            id="card1-independent"
            label="Independent Property"
            helper={CARD1_INDEPENDENT_HELPER}
            checked={draft.identityToggles.independentProperty}
            disabled={!canEdit}
            onChange={(independentProperty) =>
              setDraft((p) => ({ ...p, identityToggles: { ...p.identityToggles, independentProperty } }))
            }
          />
          <ToggleRow
            id="card1-public"
            label="Display Property Publicly"
            helper={CARD1_PUBLIC_HELPER}
            checked={draft.identityToggles.displayPublicly}
            disabled={!canEdit}
            onChange={(displayPublicly) =>
              setDraft((p) => ({ ...p, identityToggles: { ...p.identityToggles, displayPublicly } }))
            }
          />
        </div>
      </Panel>
      <Panel title="Branding & Visual Identity" helper={CARD1_BRANDING_HELPER} testId="card1-branding-panel">
        <p className="sr-only">Hotel brand colours are accents only — they do not recolour PMS chrome.</p>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="card1-website"
            label="Company Website"
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
          <SelectField id="card1-affiliation-branding" label="Brand / Chain Affiliation">
            <AffiliationSelect id="card1-affiliation-branding" draft={draft} setDraft={setDraft} canEdit={canEdit} />
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
  const regionOptions = regionsForCountry(draft.country).map((region) => ({ value: region, label: region }));
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
      <Panel title="Address & Location" helper={CARD1_ADDRESS_SUBTITLE} testId="card1-address-panel">
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
          <Input id="card1-full-address" value={composedAddress} readOnly disabled data-testid="card1-full-address" className="h-11 bg-muted/40" />
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
            onChange={(nearbyLandmark) => setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, nearbyLandmark } }))}
          />
        </div>
        <ToggleRow
          id="card1-pin"
          label="Show property location on NORU and guest platforms"
          checked={draft.locationExtras.pinVisible}
          disabled={!canEdit}
          onChange={(pinVisible) => setDraft((p) => ({ ...p, locationExtras: { ...p.locationExtras, pinVisible } }))}
        />
      </Panel>
    </div>
  );
}

export function ContactsStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-contacts">
      <Panel title="General contact details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="card1-phone" label="Primary phone" required value={draft.phone} disabled={!canEdit} onChange={(phone) => setDraft((p) => ({ ...p, phone }))} placeholder="+251" />
          <Field id="card1-email" label="Company email" required value={draft.email} disabled={!canEdit} onChange={(email) => setDraft((p) => ({ ...p, email }))} />
          <Field id="card1-whatsapp" label="WhatsApp / Messaging contact" value={draft.whatsapp} disabled={!canEdit} onChange={(whatsapp) => setDraft((p) => ({ ...p, whatsapp }))} placeholder="+251" />
        </div>
      </Panel>
      <Panel title="Social media links">
        <div className="space-y-3">
          {draft.social.links.map((row, index) => (
            <div key={`${row.platform}-${index}`} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
              <Select value={row.platform || "facebook"} onValueChange={(platform) => setDraft((p) => {
                const links = [...p.social.links];
                links[index] = { ...row, platform };
                return { ...p, social: { ...p.social, links } };
              })} disabled={!canEdit}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD1_SOCIAL_PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>{CARD1_SOCIAL_PLATFORM_LABELS[platform]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="https://" value={row.url} disabled={!canEdit} onChange={(event) => setDraft((p) => {
                const links = [...p.social.links];
                links[index] = { ...row, url: event.target.value };
                return { ...p, social: { ...p.social, links } };
              })} className="h-11" />
              {canEdit ? (
                <Button type="button" variant="outline" onClick={() => setDraft((p) => ({ ...p, social: { ...p.social, links: p.social.links.filter((_, i) => i !== index) } }))}>Remove</Button>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <Button type="button" variant="outline" onClick={() => setDraft((p) => ({ ...p, social: { ...p.social, links: [...p.social.links, { platform: "facebook", url: "" }] } }))}>
              + Add social link
            </Button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Department contacts">
        <div className="space-y-3">
          {draft.departmentContacts.map((row, index) => (
            <div key={`${row.department}-${index}`} className="grid gap-2 sm:grid-cols-4">
              <Input placeholder="Department name *" value={row.department} disabled={!canEdit} onChange={(event) => setDraft((p) => {
                const next = [...p.departmentContacts];
                next[index] = { ...row, department: event.target.value };
                return { ...p, departmentContacts: next };
              })} className="h-11" />
              <Input placeholder="Department email *" value={row.email} disabled={!canEdit} onChange={(event) => setDraft((p) => {
                const next = [...p.departmentContacts];
                next[index] = { ...row, email: event.target.value };
                return { ...p, departmentContacts: next };
              })} className="h-11" />
              <Input placeholder="Department phone *" value={row.phone} disabled={!canEdit} onChange={(event) => setDraft((p) => {
                const next = [...p.departmentContacts];
                next[index] = { ...row, phone: event.target.value };
                return { ...p, departmentContacts: next };
              })} className="h-11" />
              {canEdit ? (
                <Button type="button" variant="outline" onClick={() => setDraft((p) => ({ ...p, departmentContacts: p.departmentContacts.filter((_, i) => i !== index) }))}>Remove</Button>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <Button type="button" variant="outline" onClick={() => setDraft((p) => ({ ...p, departmentContacts: [...p.departmentContacts, { department: "", name: "", phone: "", email: "" }] }))}>
              + Add department
            </Button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Emergency / alternate contact" testId="card1-emergency">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="card1-emergency-name" label="Emergency contact name" required value={draft.emergency.name} disabled={!canEdit} onChange={(name) => setDraft((p) => ({ ...p, emergency: { ...p.emergency, name } }))} />
          <Field id="card1-emergency-phone" label="Emergency contact phone" required value={draft.emergency.phone} disabled={!canEdit} onChange={(phone) => setDraft((p) => ({ ...p, emergency: { ...p.emergency, phone } }))} placeholder="+251" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card1-emergency-notes">Notes or availability</Label>
          <Textarea id="card1-emergency-notes" maxLength={500} value={draft.emergency.notes} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, emergency: { ...p.emergency, notes: event.target.value.slice(0, 500) } }))} />
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]" data-testid="pms-card1-step-checkin">
      <Panel title="Check-in & Check-out" helper="Operating times, stay rules, and guest arrival/departure policies.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field id="card1-ci" label="Standard Check-in Time" required value={draft.checkInTime} disabled={!canEdit} onChange={(checkInTime) => setDraft((p) => ({ ...p, checkInTime }))} placeholder="14:00" />
          <Field id="card1-co" label="Standard Check-out Time" required value={draft.checkOutTime} disabled={!canEdit} onChange={(checkOutTime) => setDraft((p) => ({ ...p, checkOutTime }))} placeholder="12:00" />
          <Field id="card1-lead" label="Minimum Lead Time" required value={draft.checkinOps.minLeadTime} disabled={!canEdit} onChange={(minLeadTime) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, minLeadTime } }))} />
          <Field id="card1-early" label="Early Check-in Policy" value={draft.checkinOps.earlyCheckinPolicy} disabled={!canEdit} onChange={(earlyCheckinPolicy) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, earlyCheckinPolicy } }))} />
          <Field id="card1-late" label="Late Check-out Policy" value={draft.checkinOps.lateCheckoutPolicy} disabled={!canEdit} onChange={(lateCheckoutPolicy) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, lateCheckoutPolicy } }))} />
          <Field id="card1-cutoff" label="Same-day Booking Cut-off Time" value={draft.checkinOps.sameDayCutoff} disabled={!canEdit} onChange={(sameDayCutoff) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, sameDayCutoff } }))} />
          <Field id="card1-grace" label="Overstay Grace Period" value={draft.checkinOps.overstayGrace} disabled={!canEdit} onChange={(overstayGrace) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, overstayGrace } }))} />
          <Field id="card1-child" label="Child Policy Summary" value={draft.checkinOps.childPolicy} disabled={!canEdit} onChange={(childPolicy) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, childPolicy } }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow id="card1-day-use" label="Day Use Allowed" checked={draft.checkinOps.dayUseAllowed} disabled={!canEdit} onChange={(dayUseAllowed) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, dayUseAllowed } }))} />
          <ToggleRow id="card1-24h" label="24-hour Front Desk" checked={draft.checkinOps.frontDesk24h} disabled={!canEdit} onChange={(frontDesk24h) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, frontDesk24h } }))} />
          <ToggleRow id="card1-extra-bed" label="Extra Bed Availability" checked={draft.checkinOps.extraBedAvailable} disabled={!canEdit} onChange={(extraBedAvailable) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, extraBedAvailable } }))} />
          <ToggleRow id="card1-id" label="ID Required at Check-in" checked={draft.checkinOps.idRequiredAtCheckin} disabled={!canEdit} onChange={(idRequiredAtCheckin) => setDraft((p) => ({ ...p, checkinOps: { ...p.checkinOps, idRequiredAtCheckin } }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="card1-ci-policy">Check-in Instructions</Label>
            <Textarea id="card1-ci-policy" maxLength={1000} value={draft.checkinPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, checkinPolicyText: event.target.value.slice(0, 1000) }))} />
            <p className="text-xs text-muted-foreground">{draft.checkinPolicyText.length}/1000</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card1-co-policy">Check-out Notes</Label>
            <Textarea id="card1-co-policy" maxLength={1000} value={draft.checkoutPolicyText} disabled={!canEdit} onChange={(event) => setDraft((p) => ({ ...p, checkoutPolicyText: event.target.value.slice(0, 1000) }))} />
            <p className="text-xs text-muted-foreground">{draft.checkoutPolicyText.length}/1000</p>
          </div>
        </div>
      </Panel>
      <aside className="rounded-2xl border border-[#CCCCCC] bg-white p-4 text-sm">
        <h4 className="font-display text-[#251605]">Current Settings Summary</h4>
        <ul className="mt-3 space-y-1 text-muted-foreground">
          <li>Check-in Time: {draft.checkInTime || "—"}</li>
          <li>Check-out Time: {draft.checkOutTime || "—"}</li>
          <li>Minimum Lead Time: {draft.checkinOps.minLeadTime || "—"}</li>
          <li>Day Use Allowed: {draft.checkinOps.dayUseAllowed ? "Allowed" : "Off"}</li>
          <li>24-hour Front Desk: {draft.checkinOps.frontDesk24h ? "Enabled" : "Off"}</li>
          <li>Same-day Booking Cut-off: {draft.checkinOps.sameDayCutoff || "—"}</li>
          <li>Overstay Grace Period: {draft.checkinOps.overstayGrace || "—"}</li>
          <li>Child Policy: {draft.checkinOps.childPolicy || "—"}</li>
          <li>Extra Bed Availability: {draft.checkinOps.extraBedAvailable ? "Available" : "Off"}</li>
          <li>ID Required at Check-in: {draft.checkinOps.idRequiredAtCheckin ? "Yes" : "No"}</li>
        </ul>
      </aside>
    </div>
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]" data-testid="pms-card1-step-business-date">
      <div className="space-y-4">
        <Panel title="CURRENT STATE" helper={CARD1_BUSINESS_DATE_CURRENT_COPY}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="card1-business-date-current">Business Date</Label>
              <Input id="card1-business-date-current" value={currentState.businessDate ?? "—"} readOnly disabled data-testid="card1-business-date-current" className="h-11 bg-muted/40" />
            </div>
            <Field id="card1-system-date" label="System Date" value={currentState.systemDate || "—"} readOnly />
            <Field id="card1-local-time" label="Property Local Time" value={currentState.propertyLocalTime || "—"} readOnly />
            <Field id="card1-bd-status" label="Status" value={currentState.status} readOnly />
            <Field id="card1-last-na" label="Last Successful Night Audit" value={currentState.lastSuccessfulNightAudit || "Never"} readOnly />
          </div>
        </Panel>
        <Panel title="CONFIGURATION">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Business date time zone</Label>
              <Input value={draft.timezone || "—"} readOnly disabled className="h-11 bg-muted/40" />
              <a href={`${SET1_HUB_HREF}#property-business`} className="text-xs font-medium text-[#C89933]" onClick={() => { window.location.hash = "property-business"; }}>
                Edit in Property Identity
              </a>
            </div>
            <Field id="card1-boundary" label="Business day boundary" required value={draft.businessDateConfig.dayBoundary} disabled={!canEdit} onChange={(dayBoundary) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, dayBoundary } }))} />
            <Field id="card1-na-start" label="Expected Night Audit window start" required value={draft.businessDateConfig.nightAuditWindowStart} disabled={!canEdit} onChange={(nightAuditWindowStart) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, nightAuditWindowStart } }))} />
            <Field id="card1-na-end" label="Expected Night Audit window end" required value={draft.businessDateConfig.nightAuditWindowEnd} disabled={!canEdit} onChange={(nightAuditWindowEnd) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, nightAuditWindowEnd } }))} />
          </div>
          <ToggleRow id="card1-auto-roll" label="Automatic date rollover — Only after successful Night Audit" checked={draft.businessDateConfig.automaticRollover} disabled={!canEdit} onChange={(automaticRollover) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, automaticRollover } }))} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#251605]">Manual rollover (permissions) <span className="text-red-600">*</span></p>
            <div className="flex flex-wrap gap-2">
              {CARD1_MANUAL_ROLLOVER_ROLES.map((role) => {
                const on = draft.businessDateConfig.manualRolloverRoles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setDraft((p) => {
                      const roles = on
                        ? p.businessDateConfig.manualRolloverRoles.filter((id) => id !== role.id)
                        : [...p.businessDateConfig.manualRolloverRoles, role.id];
                      return { ...p, businessDateConfig: { ...p.businessDateConfig, manualRolloverRoles: roles } };
                    })}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]" : "border-[#CCCCCC] text-muted-foreground"}`}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ToggleRow id="card1-approval" label="Approval required" checked={draft.businessDateConfig.approvalRequired} disabled={!canEdit} onChange={(approvalRequired) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, approvalRequired } }))} />
          <ToggleRow id="card1-lock" label="Business date lock during audit" checked={draft.businessDateConfig.lockDuringAudit} disabled={!canEdit} onChange={(lockDuringAudit) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, lockDuringAudit } }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="card1-sell-date" label="Reservation sell date rule" value={draft.businessDateConfig.reservationSellDateRule} disabled={!canEdit} onChange={(reservationSellDateRule) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, reservationSellDateRule } }))} />
            <Field id="card1-hk-date" label="Housekeeping board date" value={draft.businessDateConfig.housekeepingBoardDate} disabled={!canEdit} onChange={(housekeepingBoardDate) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, housekeepingBoardDate } }))} />
            <Field id="card1-fo-date" label="Front Office desk date" value={draft.businessDateConfig.frontOfficeDeskDate} disabled={!canEdit} onChange={(frontOfficeDeskDate) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, frontOfficeDeskDate } }))} />
            <div className="space-y-1.5">
              <Label htmlFor="card1-calendar">Calendar display</Label>
              <Select value={draft.businessDateConfig.calendarDisplay} onValueChange={(calendarDisplay) => setDraft((p) => ({ ...p, businessDateConfig: { ...p.businessDateConfig, calendarDisplay: calendarDisplay as typeof p.businessDateConfig.calendarDisplay } }))} disabled={!canEdit}>
                <SelectTrigger id="card1-calendar" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD1_CALENDAR_DISPLAYS.map((item) => (
                    <SelectItem key={item} value={item}>{CARD1_CALENDAR_DISPLAY_LABELS[item]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Panel>
        <Panel title="Block Date Advance When">
          <div className="space-y-2">
            {CARD1_DEFAULT_BLOCKERS.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.businessDateBlockers.includes(id)}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => setDraft((p) => ({
                    ...p,
                    businessDateBlockers: checked === true
                      ? [...new Set([...p.businessDateBlockers, id])]
                      : p.businessDateBlockers.filter((row) => row !== id),
                  }))}
                />
                {CARD1_BLOCKER_LABELS[id]}
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-testid="card1-live-block-preview">
            <p className="font-medium">Live Block Preview</p>
            <p className="mt-1">{preview}</p>
          </div>
        </Panel>
      </div>
      <aside className="space-y-3">
        <div className="rounded-2xl border border-[#CCCCCC] bg-white p-4 text-sm">
          <h4 className="font-display text-[#251605]">Current Settings Summary</h4>
          <ul className="mt-3 space-y-1 text-muted-foreground">
            <li>Boundary: {draft.businessDateConfig.dayBoundary || "—"}</li>
            <li>Audit Window: {draft.businessDateConfig.nightAuditWindowStart}–{draft.businessDateConfig.nightAuditWindowEnd}</li>
            <li>Auto Rollover: {draft.businessDateConfig.automaticRollover ? "After NA" : "Off"}</li>
            <li>Manual Rollover: {draft.businessDateConfig.manualRolloverRoles.join(", ") || "—"}</li>
            <li>Lock During Audit: {draft.businessDateConfig.lockDuringAudit ? "Enabled" : "Off"}</li>
            <li>Calendar: {CARD1_CALENDAR_DISPLAY_LABELS[draft.businessDateConfig.calendarDisplay]}</li>
            <li>Approval required: {draft.businessDateConfig.approvalRequired ? "On" : "Off"}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[#CCCCCC] bg-white p-4 text-sm text-muted-foreground">
          <h4 className="font-display text-[#251605]">Recommended Defaults</h4>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Rollover only after successful Night Audit</li>
            <li>FO / HK / Reservations follow business date</li>
            <li>Time zone managed in Property Identity</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function LegalStep({
  draft,
  setDraft,
  canEdit,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-legal">
      <Panel title="Legal Identity" helper={CARD1_AGREEMENT_OUT}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field id="card1-legal-name" label="Registered Company Name" required value={draft.legalName} disabled={!canEdit} onChange={(legalName) => setDraft((p) => ({ ...p, legalName }))} />
          <Field id="card1-legal-entity" label="Legal entity name" value={draft.legalEntityName} disabled={!canEdit} onChange={(legalEntityName) => setDraft((p) => ({ ...p, legalEntityName }))} />
          <Field id="card1-ownership" label="Ownership Type" value={draft.legalExtras.ownershipType} disabled={!canEdit} onChange={(ownershipType) => setDraft((p) => ({ ...p, legalExtras: { ...p.legalExtras, ownershipType } }))} />
          <Field id="card1-incorp" label="Date of Incorporation" type="date" value={draft.legalExtras.incorporationDate} disabled={!canEdit} onChange={(incorporationDate) => setDraft((p) => ({ ...p, legalExtras: { ...p.legalExtras, incorporationDate } }))} />
          <div className="space-y-1.5">
            <Label htmlFor="card1-entity-type">Entity type</Label>
            <Select value={draft.legalEntityType || "unset"} onValueChange={(value) => setDraft((p) => ({ ...p, legalEntityType: value === "unset" ? "" : (value as typeof draft.legalEntityType) }))} disabled={!canEdit}>
              <SelectTrigger id="card1-entity-type" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {LEGAL_ENTITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{LEGAL_ENTITY_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field id="card1-reg" label="Registration number" value={draft.registrationNumber} disabled={!canEdit} onChange={(registrationNumber) => setDraft((p) => ({ ...p, registrationNumber }))} />
        </div>
        <UploadRefs label="Certificate of Incorporation" kind="certificate_of_incorporation" refs={draft.legalUploadRefs} canEdit={canEdit} onChange={(legalUploadRefs) => setDraft((p) => ({ ...p, legalUploadRefs }))} />
        <UploadRefs label="Trade License Copy" kind="trade_license" refs={draft.legalUploadRefs} canEdit={canEdit} onChange={(legalUploadRefs) => setDraft((p) => ({ ...p, legalUploadRefs }))} />
      </Panel>
    </div>
  );
}

export function TaxStep({
  draft,
  setDraft,
  canEdit,
  warnings,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings: string[];
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-tax">
      <Panel title="Tax & Documents" helper={CARD1_VAT_GATE_COPY}>
        <div className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 p-3 text-sm text-[#251605]">
          Tax identity is used for property setup and compliance. VAT certificate is required only when VAT Registered is On.
        </div>
        <ToggleRow id="card1-vat-registered" label="VAT Registered" checked={draft.vatRegistered} disabled={!canEdit} onChange={(vatRegistered) => setDraft((p) => ({ ...p, vatRegistered }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="card1-vat-number" label="VAT number" value={draft.vatNumber} disabled={!canEdit} onChange={(vatNumber) => setDraft((p) => ({ ...p, vatNumber }))} />
          <Field id="card1-tin" label="TIN" value={draft.tinNumber} disabled={!canEdit} onChange={(tinNumber) => setDraft((p) => ({ ...p, tinNumber }))} />
          <Field id="card1-licence" label="Licence number" value={draft.licenceNumber} disabled={!canEdit} onChange={(licenceNumber) => setDraft((p) => ({ ...p, licenceNumber }))} />
        </div>
        <UploadRefs label="Trade License" kind="trade_license" required refs={draft.taxUploadRefs} canEdit={canEdit} onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))} />
        <UploadRefs label="TIN Certificate" kind="tin_certificate" required refs={draft.taxUploadRefs} canEdit={canEdit} onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))} />
        {vatCertificateRequired(draft.vatRegistered) ? (
          <UploadRefs label="VAT certificate" kind="vat_certificate" required refs={draft.taxUploadRefs} canEdit={canEdit} onChange={(taxUploadRefs) => setDraft((p) => ({ ...p, taxUploadRefs }))} />
        ) : null}
        {warnings.map((warning) => (
          <p key={warning} className="text-sm text-[#C89933]" data-testid="card1-vat-warning">{warning}</p>
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
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  set2: Set2Snapshot;
  snapshot: Card1Snapshot;
  warnings: string[];
}) {
  const queryClient = useQueryClient();
  const saveBuilding = useServerFn(saveHotelBuilding);
  const saveFloor = useServerFn(saveHotelFloor);
  const saveWing = useServerFn(saveHotelWing);
  const [selected, setSelected] = useState<StructureNode | null>(null);

  const building = selected?.kind === "building" ? set2.buildings.find((row) => row.id === selected.id) ?? null : null;
  const wing = selected?.kind === "wing" ? set2.wings.find((row) => row.id === selected.id) ?? null : null;
  const floor = selected?.kind === "floor" ? set2.floors.find((row) => row.id === selected.id) ?? null : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
  };

  const buildingMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean; floorCount?: number | null; buildingType?: string; description?: string; location?: string; status?: string }) =>
      saveBuilding({ data: { restaurantId, ...input } }),
    onSuccess: () => { toast.success("Building saved."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const floorMutation = useMutation({
    mutationFn: (input: { id?: string; buildingId: string; code: string; name: string; active: boolean; floorNumber?: number | null; description?: string; status?: string; wingId?: string | null }) =>
      saveFloor({ data: { restaurantId, ...input } }),
    onSuccess: () => { toast.success("Floor saved."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const wingMutation = useMutation({
    mutationFn: (input: { id?: string; name: string; active: boolean; parentBuildingId?: string | null; parentFloorId?: string | null; code?: string; description?: string; status?: string }) =>
      saveWing({ data: { restaurantId, ...input } }),
    onSuccess: () => { toast.success("Wing saved."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const tree = useMemo(() => set2.buildings.map((row) => ({
    building: row,
    wings: set2.wings.filter((item) => item.parentBuildingId === row.id),
    floors: set2.floors.filter((item) => item.buildingId === row.id),
  })), [set2.buildings, set2.floors, set2.wings]);

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_16rem]" data-testid="pms-card1-step-structure">
      <Panel title="Hierarchy" helper={CARD1_STRUCTURE_CRUD_COPY} testId="card1-structure-tree">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => buildingMutation.mutate({ code: `B${set2.buildings.length + 1}`, name: `Building ${set2.buildings.length + 1}`, active: true })}>+ Add Building</Button>
          <Button type="button" variant="outline" size="sm" disabled={!canEdit || set2.buildings.length === 0} onClick={() => wingMutation.mutate({ name: `Wing ${set2.wings.length + 1}`, active: true, parentBuildingId: selected?.kind === "building" ? selected.id : set2.buildings[0]?.id ?? null, parentFloorId: null, code: `W${set2.wings.length + 1}` })}>+ Add Wing</Button>
          <Button type="button" variant="outline" size="sm" disabled={!canEdit || set2.buildings.length === 0} onClick={() => floorMutation.mutate({ buildingId: selected?.kind === "building" ? selected.id : set2.buildings[0]?.id ?? "", code: `${set2.floors.length + 1}`, name: `Floor ${set2.floors.length + 1}`, active: true, floorNumber: set2.floors.length + 1, wingId: selected?.kind === "wing" ? selected.id : null })}>+ Add Floor</Button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {tree.map((node) => (
            <li key={node.building.id}>
              <button type="button" onClick={() => setSelected({ kind: "building", id: node.building.id })} className={`w-full rounded-lg border px-2 py-1.5 text-left ${selected?.id === node.building.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}>
                {node.building.name} · {node.building.code}
              </button>
              <ul className="ml-4 mt-1 space-y-1">
                {node.wings.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelected({ kind: "wing", id: item.id })} className={`w-full rounded-lg border px-2 py-1 text-left ${selected?.id === item.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}>
                      Wing · {item.name}
                    </button>
                  </li>
                ))}
                {node.floors.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelected({ kind: "floor", id: item.id })} className={`w-full rounded-lg border px-2 py-1 text-left ${selected?.id === item.id ? "border-[#C89933] bg-[#C89933]/10" : "border-[#CCCCCC]"}`}>
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
            <BuildingForm key={building.id} building={building} canEdit={canEdit} pending={buildingMutation.isPending} onSave={(input) => buildingMutation.mutate(input)} onDeactivate={() => buildingMutation.mutate({ id: building.id, code: building.code, name: building.name, active: false, status: "inactive" })} />
          </Panel>
        ) : wing ? (
          <Panel title="Wing Details">
            <WingForm key={wing.id} wing={wing} buildings={set2.buildings} canEdit={canEdit} pending={wingMutation.isPending} onSave={(input) => wingMutation.mutate(input)} onDeactivate={() => wingMutation.mutate({ id: wing.id, name: wing.name, active: false, parentBuildingId: wing.parentBuildingId, parentFloorId: wing.parentFloorId, status: "inactive" })} />
          </Panel>
        ) : floor ? (
          <Panel title="Floor Details">
            <FloorForm key={floor.id} floor={floor} buildings={set2.buildings} wings={set2.wings} canEdit={canEdit} pending={floorMutation.isPending} onSave={(input) => floorMutation.mutate(input)} onDeactivate={() => floorMutation.mutate({ id: floor.id, buildingId: floor.buildingId, code: floor.code, name: floor.name, active: false, status: "inactive" })} />
          </Panel>
        ) : (
          <Panel title="Details">
            <p className="text-sm text-muted-foreground">Select a building, wing or floor — or add one. Full hierarchy CRUD is live.</p>
          </Panel>
        )}
        <Panel title="Property Areas">
          <div className="flex flex-wrap gap-2">
            {CARD1_PROPERTY_AREA_OPTIONS.map((area) => {
              const on = draft.propertyAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setDraft((p) => ({
                    ...p,
                    propertyAreas: on ? p.propertyAreas.filter((row) => row !== area) : [...p.propertyAreas, area],
                  }))}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]" : "border-[#CCCCCC] text-muted-foreground"}`}
                >
                  {area}
                </button>
              );
            })}
          </div>
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
          <a href={CARD1_ROOMS_HREF} className="inline-flex text-sm font-medium text-[#C89933]">Open room inventory</a>
        </Panel>
        <Panel title="Structure Rules">
          <div className="grid gap-3 sm:grid-cols-3">
            <RuleChip label="Building required" on={draft.structureRules.buildingRequired} />
            <RuleChip label="Wing optional" on={draft.structureRules.wingOptional} />
            <RuleChip label="Floor required" on={draft.structureRules.floorRequired} />
          </div>
          <Field id="card1-code-format" label="Room # / Code Format" value={draft.structureRules.roomCodeFormat} disabled={!canEdit} onChange={(roomCodeFormat) => setDraft((p) => ({ ...p, structureRules: { ...p.structureRules, roomCodeFormat } }))} helper={`Example: ${structureRoomCodeExample(draft.structureRules.roomCodeFormat)}`} />
          <ToggleRow id="card1-auto-number" label="Auto Numbering" checked={draft.structureRules.autoNumbering} disabled={!canEdit} onChange={(autoNumbering) => setDraft((p) => ({ ...p, structureRules: { ...p.structureRules, autoNumbering } }))} />
          <ToggleRow id="card1-dup" label="Duplicate Code Prevention" checked={draft.structureRules.duplicateCodePrevention} disabled={!canEdit} onChange={(duplicateCodePrevention) => setDraft((p) => ({ ...p, structureRules: { ...p.structureRules, duplicateCodePrevention } }))} />
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-[#C89933]">{warning}</p>
          ))}
        </Panel>
      </div>
      <aside className="rounded-2xl border border-[#CCCCCC] bg-white p-4 text-sm text-muted-foreground">
        <h4 className="font-display text-[#251605]">Current Settings Summary</h4>
        <p className="mt-2">{set2.buildings.length} buildings · {set2.floors.length} floors · {set2.wings.length} wings</p>
        <p className="mt-2">D8: Building required · Wing optional · Floor required</p>
      </aside>
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
  onSave: (input: { id: string; code: string; name: string; active: boolean; floorCount: number | null; buildingType: string; description: string; location: string; status: string }) => void;
  onDeactivate: () => void;
}) {
  const [name, setName] = useState(building.name);
  const [code, setCode] = useState(building.code);
  const [type, setType] = useState(building.buildingType);
  const [floors, setFloors] = useState(building.floorCount == null ? "" : String(building.floorCount));
  const [description, setDescription] = useState(building.description);
  const [location, setLocation] = useState(building.location);
  const [status, setStatus] = useState(building.status || (building.active ? "active" : "inactive"));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="b-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="b-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
        <Field id="b-type" label="Type" value={type} disabled={!canEdit} onChange={setType} />
        <Field id="b-floors" label="Number of Floors" value={floors} disabled={!canEdit} onChange={setFloors} />
        <Field id="b-status" label="Status" value={status} disabled={!canEdit} onChange={setStatus} />
        <Field id="b-location" label="Location" value={location} disabled={!canEdit} onChange={setLocation} />
      </div>
      <Field id="b-desc" label="Description" value={description} disabled={!canEdit} onChange={setDescription} />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => onSave({ id: building.id, code, name, active: status !== "inactive", floorCount: floors ? Number(floors) : null, buildingType: type, description, location, status })}>Edit / Save</Button>
          <Button type="button" variant="outline" disabled={pending || !building.active} onClick={onDeactivate}>Deactivate</Button>
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
  onSave: (input: { id: string; name: string; active: boolean; parentBuildingId: string | null; parentFloorId: string | null; code: string; description: string; status: string }) => void;
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
        <Field id="w-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="w-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
        <Field id="w-status" label="Status" value={status} disabled={!canEdit} onChange={setStatus} />
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Select value={buildingId} onValueChange={setBuildingId} disabled={!canEdit}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {buildings.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field id="w-desc" label="Description" value={description} disabled={!canEdit} onChange={setDescription} />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => onSave({ id: wing.id, name, active: status !== "inactive", parentBuildingId: buildingId || null, parentFloorId: null, code, description, status })}>Edit / Save</Button>
          <Button type="button" variant="outline" disabled={pending || !wing.active} onClick={onDeactivate}>Deactivate</Button>
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
  onSave: (input: { id: string; buildingId: string; code: string; name: string; active: boolean; floorNumber: number | null; description: string; status: string; wingId: string | null }) => void;
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
        <Field id="f-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="f-number" label="Number" required value={number} disabled={!canEdit} onChange={setNumber} />
        <Field id="f-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
        <Field id="f-status" label="Status" value={status} disabled={!canEdit} onChange={setStatus} />
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Select value={buildingId} onValueChange={setBuildingId} disabled={!canEdit}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {buildings.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Wing</Label>
          <Select value={wingId} onValueChange={setWingId} disabled={!canEdit}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {wings.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Field id="f-desc" label="Description" value={description} disabled={!canEdit} onChange={setDescription} />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => onSave({ id: floor.id, buildingId, code, name, active: status !== "inactive", floorNumber: number ? Number(number) : null, description, status, wingId: wingId === "none" ? null : wingId })}>Edit / Save</Button>
          <Button type="button" variant="outline" disabled={pending || !floor.active} onClick={onDeactivate}>Deactivate</Button>
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
    <div className="flex items-start gap-3 rounded-xl border border-[#E8E2D6] bg-[#FBF9F5] px-3 py-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {helper ? <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    </div>
  );
}

function RuleChip({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="rounded-xl border border-[#CCCCCC] px-3 py-2 text-sm" data-testid={`card1-rule-${label.toLowerCase().replace(/\s+/g, "-")}`}>
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
          className={`h-11 ${error ? "border-red-500" : ""}`}
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
      const { error: uploadError } = await supabase.storage.from("property-images").uploadToSignedUrl(ticket.path, ticket.token, file);
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
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "Uploading…" : "Change Image"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  if (localPreview) URL.revokeObjectURL(localPreview);
                  setLocalPreview("");
                  setLocalError("");
                  onChange("");
                }}
              >
                Remove Image
              </Button>
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
  label,
  kind,
  refs,
  canEdit,
  required,
  onChange,
}: {
  label: string;
  kind: string;
  refs: { name: string; kind: string }[];
  canEdit: boolean;
  required?: boolean;
  onChange: (refs: { name: string; kind: string }[]) => void;
}) {
  const rows = refs.filter((row) => row.kind === kind);
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? " (required)" : ""}
      </Label>
      {rows.map((row, index) => (
        <Input
          key={`${row.kind}-${index}`}
          value={row.name}
          disabled={!canEdit}
          onChange={(event) => {
            const next = refs.map((item) => item);
            const at = refs.findIndex((item, i) => item.kind === kind && refs.filter((r) => r.kind === kind).indexOf(item) === index);
            const target = at >= 0 ? at : refs.indexOf(row);
            next[target] = { ...row, name: event.target.value };
            onChange(next);
          }}
        />
      ))}
      {canEdit ? (
        <Button type="button" variant="outline" onClick={() => onChange([...refs, { name: "", kind }])}>
          Add {label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}
