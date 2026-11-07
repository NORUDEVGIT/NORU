import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/lib/utils";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import {
  COMMON_CURRENCIES,
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  localDateInZone,
} from "@/shared/lib/property-time";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { BUSINESS_DATE_NORMAL_COPY } from "@/packages/pms/lib/business-date-recovery";
import { nightAuditWindowConfigProblem } from "@/packages/pms/lib/night-audit-window";
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
  CARD1_BRAND_IMAGE_HELPER,
  CARD1_BRAND_IMAGE_UPLOAD_ERROR,
  CARD1_BUSINESS_DATE_CURRENT_COPY,
  CARD1_CAPACITY_COPY,
  CARD1_FULL_ADDRESS_COPY,
  CARD1_IDENTITY_HELPER,
  CARD1_INDEPENDENT_HELPER,
  CARD1_OPENING_DATE_IN,
  CARD1_PROPERTY_AREA_OPTIONS,
  CARD1_PROPERTY_CODE_TOOLTIP,
  CARD1_PROPERTY_TYPE_LABELS,
  CARD1_PROPERTY_TYPES,
  CARD1_ROOMS_HREF,
  CARD1_SOCIAL_PLATFORM_LABELS,
  CARD1_SOCIAL_PLATFORMS,
  CARD1_VAT_GATE_COPY,
  LEGAL_ENTITY_TYPE_LABELS,
  LEGAL_ENTITY_TYPES,
  STAR_RATINGS,
  card1LanguageOptions,
  emptyCurrentState,
  formatTimeDisplay,
  generateHourlyTimeOptions,
  isHttpOrDataAsset,
  validateBrandImageFile,
  structureRoomCodeExample,
  vatCertificateRequired,
  type Card1AddressFieldErrors,
  type Card1DepartmentOption,
  type Card1Draft,
  type Card1IdentityFieldErrors,
  type Card1PropertyArea,
  type Card1Snapshot,
  type Card1StayPolicy,
  type Card1TimeFormat,
  type Card1CurrentState,
  type Card1UploadRef,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  createCard1Department,
  seedCard1StandardDepartments,
  generateDepartmentCode,
} from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  ISO_COUNTRIES,
  addressLayoutForCountry,
  clearDependentGeography,
  countryCodeFromInput,
  countryNameFromInput,
  regionsForCountry,
  resolveRegionForCountryChange,
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

export function IdentityStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  logoPreviewUrl,
  coverPreviewUrl,
  propertyImagePreviews = {},
  errors,
  onClearError,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  logoPreviewUrl: string;
  coverPreviewUrl: string;
  propertyImagePreviews?: Record<string, string>;
  errors: Card1IdentityFieldErrors;
  onClearError: (key: keyof Card1IdentityFieldErrors) => void;
}) {
  const languages = card1LanguageOptions(draft.defaultLanguage);
  return (
    <div className="space-y-4" data-testid="pms-card1-step-identity">
      <Panel
        title="Property Identity"
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
            helper="The name used publicly by the property."
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
          <SelectField id="card1-time-format" label="Time Display Format">
            <Select
              value={draft.timeFormat || "24h"}
              onValueChange={(val) => {
                const timeFormat = val === "12h" ? "12h" : "24h";
                setDraft((p) => ({
                  ...p,
                  timeFormat,
                  identityToggles: { ...p.identityToggles, timeFormat },
                }));
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card1-time-format" className={SELECT_TRIGGER_CLASS} data-testid="card1-time-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour (14:00)</SelectItem>
                <SelectItem value="12h">12-hour (2:00 PM)</SelectItem>
              </SelectContent>
            </Select>
          </SelectField>

          <PropertySetupFormItem span={3}>
            <PropertySetupField
              id="card1-short-description"
              label="Short Description"
              icon="document"
              error={
                isShortDescriptionOverLimit(draft.shortDescription)
                  ? "Reduce to 2,000 characters before saving."
                  : undefined
              }
            >
              <Textarea
                id="card1-short-description"
                rows={3}
                value={draft.shortDescription}
                disabled={!canEdit}
                aria-invalid={isShortDescriptionOverLimit(draft.shortDescription)}
                className={cn(PROPERTY_SETUP_COMPACT_TEXTAREA_CLASS, "min-h-[4.5rem]")}
                placeholder="Enter property description or overview..."
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
            </PropertySetupField>
          </PropertySetupFormItem>
        </PropertySetupFormGrid>
      </Panel>
      <Panel
        title="Branding & Visual Identity"
        testId="card1-branding-panel"
        icon="image"
      >
        <p className="sr-only">
          Hotel brand colours are accents only — they do not recolour PMS chrome.
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-5 border-t border-[#E8E2D6] pt-5">
          <PropertyImagesField
            id="card1-property-images"
            label="Property Images"
            restaurantId={restaurantId}
            coverImageUrl={draft.coverImageUrl}
            coverPreviewUrl={coverPreviewUrl}
            images={draft.locationExtras.propertyImages ?? []}
            previewMap={propertyImagePreviews}
            disabled={!canEdit}
            error={errors.coverImageUrl}
            onChange={(updatedImages, updatedCover) => {
              onClearError("coverImageUrl");
              setDraft((p) => ({
                ...p,
                coverImageUrl: updatedCover,
                locationExtras: {
                  ...p.locationExtras,
                  propertyImages: updatedImages,
                },
              }));
            }}
          />
        </div>
      </Panel>
    </div>
  );
}

export function AddressStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  composedAddress,
  errors,
  onClearError,
  departmentOptions,
  onDepartmentsChange,
  websiteError,
}: {
  restaurantId?: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  composedAddress: string;
  errors: Card1AddressFieldErrors;
  onClearError: (key: keyof Card1AddressFieldErrors) => void;
  departmentOptions: Card1DepartmentOption[];
  onDepartmentsChange?: (options: Card1DepartmentOption[]) => void;
  websiteError?: string | undefined;
}) {
  const createDept = useServerFn(createCard1Department);
  const seedDepts = useServerFn(seedCard1StandardDepartments);
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [targetContactIdx, setTargetContactIdx] = useState<number | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const [isSeedingDepts, setIsSeedingDepts] = useState(false);

  async function handleCreateDepartment() {
    if (!restaurantId || !newDeptName.trim()) return;
    setIsCreatingDept(true);
    try {
      const res = await createDept({
        data: {
          restaurantId,
          name: newDeptName.trim(),
          code: newDeptCode.trim() || undefined,
        },
      });
      if (res?.ok) {
        toast.success(`Department "${res.created.name}" created.`);
        onDepartmentsChange?.(res.departmentOptions);
        if (targetContactIdx !== null && targetContactIdx !== undefined) {
          setDraft((p) => {
            const next = [...p.departmentContacts];
            if (next[targetContactIdx]) {
              next[targetContactIdx] = {
                ...next[targetContactIdx],
                departmentId: res.created.id,
                department: res.created.name,
              };
            }
            return { ...p, departmentContacts: next };
          });
        }
        setCreateDeptOpen(false);
        setNewDeptName("");
        setNewDeptCode("");
        setTargetContactIdx(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create department.";
      toast.error(msg);
    } finally {
      setIsCreatingDept(false);
    }
  }

  async function handleSeedStandardDepartments() {
    if (!restaurantId) return;
    setIsSeedingDepts(true);
    try {
      const res = await seedDepts({
        data: { restaurantId },
      });
      if (res?.ok) {
        toast.success(
          res.seededCount > 0
            ? `Added ${res.seededCount} standard hotel departments.`
            : "Standard departments are already present.",
        );
        onDepartmentsChange?.(res.departmentOptions);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to seed departments.";
      toast.error(msg);
    } finally {
      setIsSeedingDepts(false);
    }
  }

  const layout = addressLayoutForCountry(draft.country);
  const countryCode = countryCodeFromInput(draft.country);
  const regionOptions = regionsForCountry(draft.country).map((region) => ({
    value: region,
    label: region,
  }));
  const countryOptions = ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }));
  const defaultIso = countryCodeFromInput(draft.country) || null;
  const socialOptions = CARD1_SOCIAL_PLATFORMS.map((platform) => ({
    id: platform,
    label: CARD1_SOCIAL_PLATFORM_LABELS[platform],
  }));

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
                setDraft((p) => {
                  const cleared = clearDependentGeography({ ...p, country: name });
                  const resolvedRegion = resolveRegionForCountryChange(name, p.addressRegion, p.country);
                  return {
                    ...cleared,
                    addressRegion: resolvedRegion,
                  };
                });
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
      </Panel>

      <Panel
        title="Primary & Alternate Contacts"
        helper="Property contact details and channels"
        icon="contact"
      >
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
          <Field
            id="card1-website"
            label="Company Website"
            icon="website"
            type="url"
            value={draft.websiteUrl}
            disabled={!canEdit}
            placeholder="https://"
            error={websiteError}
            onChange={(websiteUrl) => setDraft((p) => ({ ...p, websiteUrl }))}
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
          {canEdit && restaurantId && departmentOptions.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
              data-testid="pms-card1-dept-zero-state"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    No departments configured
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Department contacts require a registered department. Load standard hotel departments (Front Desk, Housekeeping, etc.) to get started.
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSeedingDepts}
                    onClick={handleSeedStandardDepartments}
                    data-testid="pms-card1-seed-standard-depts"
                  >
                    {isSeedingDepts ? "Loading..." : "Load Standard Departments"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {draft.departmentContacts.map((row, index) => (
            <div
              key={row.id ?? `${row.departmentId ?? row.department}-${index}`}
              className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_1fr_1fr_1fr_auto]"
            >
              <Select
                value={row.departmentId || (row.department ? `legacy:${index}` : "unset")}
                disabled={!canEdit}
                onValueChange={(val) => {
                  if (val === "__create_new__") {
                    setTargetContactIdx(index);
                    setNewDeptName("");
                    setNewDeptCode("");
                    setCreateDeptOpen(true);
                    return;
                  }
                  setDraft((p) => {
                    const next = [...p.departmentContacts];
                    const department = departmentOptions.find(
                      (option) => option.id === val,
                    );
                    next[index] = {
                      ...row,
                      departmentId: val === "unset" ? undefined : val,
                      department: department?.name ?? "",
                    };
                    return { ...p, departmentContacts: next };
                  });
                }}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Select department</SelectItem>
                  {canEdit && restaurantId ? (
                    <SelectItem value="__create_new__" className="font-medium text-primary">
                      + Create New Department…
                    </SelectItem>
                  ) : null}
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
            <div className="pt-1">
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
                + Add department contact
              </Button>
            </div>
          ) : null}
        </div>
      </Panel>

      <Dialog open={createDeptOpen} onOpenChange={setCreateDeptOpen}>
        <DialogContent className="sm:max-w-md" data-testid="pms-card1-create-dept-modal">
          <DialogHeader>
            <DialogTitle>Create Department</DialogTitle>
            <DialogDescription>
              Add a department to your property directory. It will immediately be available for department contacts.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateDepartment();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="card1-new-dept-name">
                Department Name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="card1-new-dept-name"
                placeholder="e.g. Front Desk, Housekeeping, Security"
                value={newDeptName}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setNewDeptName(nextName);
                  const existingCodes = departmentOptions.map((d) => d.code ?? d.name);
                  setNewDeptCode(generateDepartmentCode(nextName, existingCodes));
                }}
                disabled={isCreatingDept}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card1-new-dept-code">Department Code</Label>
              <Input
                id="card1-new-dept-code"
                placeholder="e.g. FD, HK, SEC"
                value={newDeptCode}
                onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                disabled={isCreatingDept}
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Unique short code (2-20 characters). Auto-suggested from the department name.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDeptOpen(false)}
                disabled={isCreatingDept}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreatingDept || !newDeptName.trim()}
              >
                {isCreatingDept ? "Creating..." : "Create Department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
  return (
    <AddressStep
      draft={draft}
      setDraft={setDraft}
      canEdit={canEdit}
      composedAddress=""
      errors={{}}
      onClearError={() => {}}
      departmentOptions={departmentOptions}
    />
  );
}

export function CheckinStep({
  draft,
  setDraft,
  canEdit,
  currentState,
  businessDateAction,
}: {
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  currentState?: Card1CurrentState;
  /** Owner-only recovery control. Absent for every other role. */
  businessDateAction?: ReactNode;
}) {
  const effectiveCurrentState = currentState ?? emptyCurrentState();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const systemDate = useMemo(() => {
    if (!draft.timezone) return effectiveCurrentState.systemDate || localDateInZone(DEFAULT_TIMEZONE, now);
    try {
      return localDateInZone(draft.timezone, now);
    } catch {
      return effectiveCurrentState.systemDate || localDateInZone(DEFAULT_TIMEZONE, now);
    }
  }, [draft.timezone, effectiveCurrentState.systemDate, now]);

  const localClock = useMemo(() => {
    if (!draft.timezone) return effectiveCurrentState.propertyLocalTime || "—";
    try {
      return new Intl.DateTimeFormat(draft.timeFormat === "12h" ? "en-US" : "en-GB", {
        timeZone: draft.timezone,
        hour: draft.timeFormat === "12h" ? "numeric" : "2-digit",
        minute: "2-digit",
        hour12: draft.timeFormat === "12h",
      }).format(now);
    } catch {
      return effectiveCurrentState.propertyLocalTime || "—";
    }
  }, [draft.timezone, draft.timeFormat, effectiveCurrentState.propertyLocalTime, now]);

  const nightAuditWindowProblem = nightAuditWindowConfigProblem(
    draft.businessDateConfig.nightAuditWindowStart,
    draft.businessDateConfig.nightAuditWindowEnd,
  );
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
            timeFormat={draft.timeFormat}
            disabled={!canEdit}
            onChange={(checkInTime) => setDraft((p) => ({ ...p, checkInTime }))}
          />
          <TimeSelect
            id="card1-co"
            label="Standard Check-out Time"
            required
            value={draft.checkOutTime}
            timeFormat={draft.timeFormat}
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
            timeFormat={draft.timeFormat}
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

      <Panel
        title="Business Date & Night Audit"
        helper={CARD1_BUSINESS_DATE_CURRENT_COPY}
        icon="time"
        testId="card1-business-date-panel"
      >
        <div className="space-y-6">
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              System & Property Information
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                id="card1-system-date"
                label="System Date"
                value={systemDate}
                readOnly
              />
              <Field
                id="card1-local-time"
                label="Property Time"
                value={localClock}
                readOnly
              />
              <div className="space-y-1.5">
                <Label htmlFor="card1-business-date-current">Current Business Date</Label>
                <Input
                  id="card1-business-date-current"
                  value={effectiveCurrentState.businessDate ?? "—"}
                  readOnly
                  disabled
                  data-testid="card1-business-date-current"
                  className="h-11 bg-muted/40"
                />
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="card1-business-date-normal-copy"
                >
                  {BUSINESS_DATE_NORMAL_COPY}
                </p>
                {businessDateAction}
              </div>
              <Field
                id="card1-last-na"
                label="Last Successful Night Audit"
                value={effectiveCurrentState.lastSuccessfulNightAudit || "Never"}
                readOnly
              />
            </div>
          </div>

          <div className="border-t border-[#E8E2D6] pt-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Night Audit Configuration
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <TimeSelect
                id="card1-na-start"
                label="Night Audit Window Start"
                required
                value={draft.businessDateConfig.nightAuditWindowStart}
                timeFormat={draft.timeFormat}
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
                label="Night Audit Window End"
                required
                value={draft.businessDateConfig.nightAuditWindowEnd}
                timeFormat={draft.timeFormat}
                disabled={!canEdit}
                onChange={(nightAuditWindowEnd) =>
                  setDraft((p) => ({
                    ...p,
                    businessDateConfig: { ...p.businessDateConfig, nightAuditWindowEnd },
                  }))
                }
              />
            </div>
            {nightAuditWindowProblem ? (
              <p
                className="mt-2 text-xs font-medium text-destructive"
                data-testid="card1-night-audit-window-error"
              >
                {nightAuditWindowProblem}
              </p>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}


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
  timeFormat = "24h",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  required?: boolean;
  timeFormat?: Card1TimeFormat;
  onChange: (value: string) => void;
}) {
  const hourly = generateHourlyTimeOptions(timeFormat);
  const options =
    value && !hourly.some((option) => option.value === value)
      ? [{ value, label: `${formatTimeDisplay(value, timeFormat)} (custom)` }, ...hourly]
      : hourly;
  return (
    <PropertySetupField id={id} label={label} required={required}>
      <Select value={value || "__unset"} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className={SELECT_TRIGGER_CLASS} data-testid={id}>
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
  return (
    <CheckinStep draft={draft} setDraft={setDraft} canEdit={canEdit} currentState={currentState} />
  );
}

export function LegalStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  warnings = [],
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings?: string[];
}) {
  return (
    <div className="space-y-4" data-testid="pms-card1-step-legal">
      <Panel title="Legal Identity" icon="briefcase">
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

export function TaxStep({
  restaurantId,
  draft,
  setDraft,
  canEdit,
  warnings = [],
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings?: string[];
}) {
  return (
    <LegalStep
      restaurantId={restaurantId}
      draft={draft}
      setDraft={setDraft}
      canEdit={canEdit}
      warnings={warnings}
    />
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
      <div className="flex h-11 overflow-hidden rounded-md border border-[#CCCCCC] bg-white">
        <label className="relative h-full w-11 shrink-0 overflow-hidden border-r border-[#CCCCCC]">
          <span className="sr-only">{label} swatch</span>
          <Input
            type="color"
            aria-label={`${label} picker`}
            value={pickerValue}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-[-20%] h-[140%] w-[140%] cursor-pointer border-0 p-0"
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
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 font-mono text-sm shadow-none focus-visible:ring-0"
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
          className={`group relative overflow-hidden rounded-xl border border-[#E8E2D6] bg-[#F7F4EE] ${
            landscape ? "h-20 w-36" : "h-16 w-16"
          }`}
        >
          {shown ? (
            <>
              <img src={shown} alt={`${label} preview`} className="h-full w-full object-cover" />
              {!disabled ? (
                <button
                  type="button"
                  aria-label="Remove Image"
                  disabled={uploading}
                  onClick={() => {
                    if (localPreview) URL.revokeObjectURL(localPreview);
                    setLocalPreview("");
                    setLocalError("");
                    onChange("");
                  }}
                  className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Change Image"}
            </Button>
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

function PropertyImagesField({
  id,
  label = "Property Images",
  restaurantId,
  coverImageUrl,
  coverPreviewUrl,
  images,
  previewMap = {},
  disabled,
  error,
  onChange,
}: {
  id: string;
  label?: string;
  restaurantId: string;
  coverImageUrl: string;
  coverPreviewUrl: string;
  images: string[];
  previewMap?: Record<string, string>;
  disabled?: boolean;
  error?: string;
  onChange: (images: string[], coverUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const startUpload = useServerFn(createPropertyBrandImageUpload);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const allImages = useMemo(() => {
    const list = [...images];
    if (coverImageUrl && !list.includes(coverImageUrl)) {
      list.unshift(coverImageUrl);
    }
    return list;
  }, [images, coverImageUrl]);

  function getPreview(path: string): string {
    if (!path) return "";
    if (localPreviews[path]) return localPreviews[path];
    if (isHttpOrDataAsset(path)) return path;
    if (path === coverImageUrl && coverPreviewUrl) return coverPreviewUrl;
    return previewMap[path] || "";
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || disabled) return;
    const files = Array.from(fileList);
    setUploading(true);
    setUploadError("");
    const newPaths: string[] = [];
    const newLocalPreviews: Record<string, string> = {};

    try {
      for (const file of files) {
        const invalid = validateBrandImageFile(file);
        if (invalid) {
          toast.error(`${file.name}: ${invalid}`);
          continue;
        }
        const ticket = await startUpload({
          data: {
            restaurantId,
            kind: "cover",
            contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
            size: file.size,
          },
        });
        if (!ticket.ok) {
          toast.error(ticket.message ?? `${file.name}: upload failed`);
          continue;
        }
        const { error: uploadErr } = await supabase.storage
          .from("property-images")
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (uploadErr) {
          toast.error(`${file.name}: upload failed`);
          continue;
        }
        newPaths.push(ticket.path);
        newLocalPreviews[ticket.path] = URL.createObjectURL(file);
      }

      if (newPaths.length > 0) {
        setLocalPreviews((prev) => ({ ...prev, ...newLocalPreviews }));
        const updatedList = [...allImages, ...newPaths];
        const updatedCover = coverImageUrl || updatedList[0] || "";
        onChange(updatedList, updatedCover);
        toast.success(`Uploaded ${newPaths.length} ${newPaths.length === 1 ? "image" : "images"}.`);
      }
    } catch {
      setUploadError("Image upload encountered an error. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function makeCover(path: string) {
    if (disabled) return;
    const reordered = [path, ...allImages.filter((p) => p !== path)];
    onChange(reordered, path);
    toast.success("Cover image updated.");
  }

  function removeImage(path: string) {
    if (disabled) return;
    const remaining = allImages.filter((p) => p !== path);
    const nextCover = path === coverImageUrl ? remaining[0] ?? "" : coverImageUrl;
    if (localPreviews[path]) {
      URL.revokeObjectURL(localPreviews[path]);
      setLocalPreviews((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
    onChange(remaining, nextCover);
  }

  const message = uploadError || error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold text-[#251605]">
            {label}
            {allImages.length > 0 && (
              <span className="ml-2 rounded-full bg-[#E8E2D6] px-2 py-0.5 text-[11px] font-normal text-[#251605]">
                {allImages.length} {allImages.length === 1 ? "image" : "images"}
              </span>
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            Cover photo is used on guest documents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {allImages.map((path, index) => {
          const isCover = path === coverImageUrl || (index === 0 && !coverImageUrl);
          const previewSrc = getPreview(path);
          return (
            <div
              key={path}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl border bg-[#F7F4EE] shadow-sm transition-all",
                isCover
                  ? "border-[#251605] ring-2 ring-[#251605]/20"
                  : "border-[#E8E2D6] hover:border-[#DDD4C5]",
              )}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#ECE6DA]">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={`Property photo ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    Photo {index + 1}
                  </div>
                )}
                {isCover && (
                  <div className="absolute left-2 top-2 rounded-md bg-[#251605] px-1.5 py-0.5 text-[10px] font-semibold text-[#F7F4EE] shadow">
                    ★ Cover
                  </div>
                )}
                {!disabled && (
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => removeImage(path)}
                    className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-red-600 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between p-2 text-xs">
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  {isCover ? "Main cover" : `Photo ${index + 1}`}
                </span>
                {!isCover && !disabled && (
                  <button
                    type="button"
                    onClick={() => makeCover(path)}
                    className="text-[11px] font-semibold text-[#251605] underline hover:text-[#000]"
                  >
                    Set as cover
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!disabled && (
          <label
            htmlFor={`${id}-file`}
            className={cn(
              "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-3 text-center transition-colors hover:border-[#251605] hover:bg-[#F5F1E8]",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <div className="space-y-1">
                <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[#251605] border-t-transparent" />
                <p className="text-xs font-medium text-[#251605]">Uploading…</p>
              </div>
            ) : (
              <>
                <div className="rounded-full bg-white p-2 shadow-sm border border-[#E8E2D6]">
                  <Plus className="h-4 w-4 text-[#251605]" />
                </div>
                <span className="mt-1.5 text-xs font-semibold text-[#251605]">Upload Images</span>
                <span className="text-[10px] text-muted-foreground">Select multiple files</span>
              </>
            )}
            <input
              id={`${id}-file`}
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={disabled || uploading}
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
        )}
      </div>

      {allImages.length === 0 && disabled && (
        <p className="text-xs text-muted-foreground">No property images uploaded yet.</p>
      )}

      {message ? (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {message}
        </p>
      ) : null}
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
