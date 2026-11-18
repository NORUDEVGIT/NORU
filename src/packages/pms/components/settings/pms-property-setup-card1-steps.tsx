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
import {
  Building2,
  CalendarDays,
  Columns2,
  Ellipsis,
  Gauge,
  Layers3,
  ListChecks,
  Lock,
  MapPin,
  Maximize2,
  Plus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/lib/utils";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Calendar } from "@/shared/components/ui/calendar";
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
import { OPEN_CASHIER_SHIFT_RULE } from "@/packages/pms/lib/night-audit-steps";
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
  validateTinFormat,
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
import { friendlySetupError } from "@/packages/pms/lib/setup-form-errors";

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
    <PropertySetupPanel title={title} helper={helper} icon={icon} testId={testId} dense>
      {children}
    </PropertySetupPanel>
  );
}

function parseIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOpeningDateLabel(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return "Select date";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function OpeningDateField({
  id,
  value,
  disabled,
  error,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  return (
    <PropertySetupField id={id} label="Opening Date" icon="date" required error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-haspopup="dialog"
            className={cn(PROPERTY_SETUP_CONTROL_CLASS, "justify-between font-normal")}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {formatOpeningDateLabel(value)}
            </span>
            <CalendarDays className="size-4 shrink-0 text-[#8A6A24]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-xl border-[#E6E1D8] p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatIsoDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </PropertySetupField>
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
    <div className="space-y-3" data-testid="pms-card1-step-identity">
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
                aria-readonly="true"
                className={`${PROPERTY_SETUP_CONTROL_CLASS} cursor-not-allowed border-[#E6E1D8] bg-[#F4EDE0] pr-10 font-medium tracking-wide text-[#6B6458]`}
                data-testid="card1-property-code"
              />
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A6A24]"
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
          {/* The name used publicly by the property. */}
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
          <OpeningDateField
            id="card1-opening-date"
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
              <SelectTrigger
                id="card1-currency"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(errors.currencyCode)}
              >
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
              <SelectTrigger
                id="card1-timezone"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(errors.timezone)}
              >
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
              <SelectTrigger
                id="card1-language"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(errors.defaultLanguage)}
              >
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-3 border-t border-[#E8E2D6] pt-3">
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
    <div className="space-y-3" data-testid="pms-card1-step-address">
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
              className={PROPERTY_SETUP_CONTROL_CLASS}
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
                  className={PROPERTY_SETUP_CONTROL_CLASS}
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
                className={PROPERTY_SETUP_CONTROL_CLASS}
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
    <div className="space-y-3" data-testid="pms-card1-step-checkin">
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
            <p className="mt-3 text-sm text-foreground" data-testid="card1-eod-open-shifts">
              {OPEN_CASHIER_SHIFT_RULE}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              System integrity checks always block End of Day and cannot be turned off.
            </p>
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
  vatNumberError,
  vatCertificateError,
  onClearVatNumber,
  onClearVatCertificate,
}: {
  restaurantId: string;
  draft: Card1Draft;
  setDraft: Dispatch<SetStateAction<Card1Draft>>;
  canEdit: boolean;
  warnings?: string[];
  vatNumberError?: string;
  vatCertificateError?: string;
  onClearVatNumber?: () => void;
  onClearVatCertificate?: () => void;
}) {
  const tinFormatError = validateTinFormat(draft.tinNumber);

  return (
    <div className="space-y-3" data-testid="pms-card1-step-legal">
      <Panel title="Legal & Tax Information" helper={CARD1_VAT_GATE_COPY} icon="tax">
        <div className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 p-3 text-sm text-[#251605]">
          Legal business registration and tax identity are used for property setup, cashiering documents, folios, and fiscal device compliance.
        </div>

        {/* Group 1: Legal Business Information */}
        <div className="space-y-3 pt-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Legal Business Information</h3>
            <p className="text-xs text-slate-500">Corporate registration and entity classification details.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="card1-legal-name"
              label="Registered Company Name"
              required
              value={draft.legalName}
              disabled={!canEdit}
              onChange={(legalName) => setDraft((p) => ({ ...p, legalName }))}
            />
            <div className="space-y-1">
              <Field
                id="card1-legal-entity"
                label="Operating Entity Name"
                value={draft.legalEntityName}
                disabled={!canEdit}
                onChange={(legalEntityName) => setDraft((p) => ({ ...p, legalEntityName }))}
              />
              <p className="text-[11px] text-slate-500">
                Only enter this if the entity operating the hotel differs from the registered company.
              </p>
            </div>
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
                  {draft.legalEntityType === "private_limited" ? (
                    <SelectItem value="private_limited">Private Limited Company (PLC)</SelectItem>
                  ) : (
                    <SelectItem value="plc">Private Limited Company (PLC)</SelectItem>
                  )}
                  <SelectItem value="sole_proprietor">Sole proprietorship</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              id="card1-reg"
              label="Commercial Registration Number"
              value={draft.registrationNumber}
              disabled={!canEdit}
              onChange={(registrationNumber) => setDraft((p) => ({ ...p, registrationNumber }))}
            />
          </div>
        </div>

        <div className="my-2 border-t border-slate-200/80" />

        {/* Group 2: Tax & Licensing */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Tax & Licensing</h3>
            <p className="text-xs text-slate-500">Taxpayer identification, trade licensing, and VAT registration posture.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Field
                id="card1-tin"
                label="Taxpayer Identification Number (TIN)"
                value={draft.tinNumber}
                disabled={!canEdit}
                onChange={(tinNumber) => setDraft((p) => ({ ...p, tinNumber }))}
              />
              {tinFormatError ? (
                <p className="text-[11px] font-medium text-amber-600">{tinFormatError}</p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  10-digit Ethiopian taxpayer identifier used for cashiering and fiscal machine integration.
                </p>
              )}
            </div>
            <Field
              id="card1-licence"
              label="Trade License Number"
              value={draft.licenceNumber}
              disabled={!canEdit}
              onChange={(licenceNumber) => setDraft((p) => ({ ...p, licenceNumber }))}
            />
          </div>
          <ToggleRow
            id="card1-vat-registered"
            label="VAT Registered"
            checked={draft.vatRegistered}
            disabled={!canEdit}
            onChange={(vatRegistered) => setDraft((p) => ({ ...p, vatRegistered }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {draft.vatRegistered ? (
              <Field
                id="card1-vat-number"
                label="VAT Registration Number"
                required
                value={draft.vatNumber}
                disabled={!canEdit}
                error={vatNumberError}
                onChange={(vatNumber) => {
                  onClearVatNumber?.();
                  setDraft((p) => ({ ...p, vatNumber }));
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="my-2 border-t border-slate-200/80" />

        {/* Group 3: Legal Documents */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Legal Documents</h3>
            <p className="text-xs text-slate-500">Attach verification and compliance documents (PDF, PNG, JPG under 1 MB).</p>
          </div>
          <UploadRefs
            restaurantId={restaurantId}
            label="Trade License"
            kind="trade_license"
            refs={draft.taxUploadRefs}
            canEdit={canEdit}
            onChange={(taxUploadRefs) => {
              setDraft((p) => {
                const remainingTradePaths = new Set(
                  taxUploadRefs.filter((r) => r.kind === "trade_license").map((r) => r.storagePath).filter(Boolean),
                );
                const nextLegalUploadRefs = p.legalUploadRefs.filter(
                  (r) => r.kind !== "trade_license" || (r.storagePath && remainingTradePaths.has(r.storagePath)),
                );
                return { ...p, taxUploadRefs, legalUploadRefs: nextLegalUploadRefs };
              });
            }}
          />
          <UploadRefs
            restaurantId={restaurantId}
            label="TIN Certificate"
            kind="tin_certificate"
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
              controlId="card1-vat-certificate"
              error={vatCertificateError}
              refs={draft.taxUploadRefs}
              canEdit={canEdit}
              onChange={(taxUploadRefs) => {
                onClearVatCertificate?.();
                setDraft((p) => ({ ...p, taxUploadRefs }));
              }}
            />
          ) : null}
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-[#C89933]" data-testid="card1-vat-warning">
              {warning}
            </p>
          ))}
        </div>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [utility, setUtility] = useState<StructureUtility | null>(null);
  const [areaComposerOpen, setAreaComposerOpen] = useState(false);
  const [frontWindow, setFrontWindow] = useState<StructureWindowId>("details");
  const [newBuildingDraft, setNewBuildingDraft] = useState<{ name: string; code: string } | null>(
    null,
  );
  const [newWingDraft, setNewWingDraft] = useState<{
    parentBuildingId: string;
    name: string;
    code: string;
  } | null>(null);
  const [newFloorDraft, setNewFloorDraft] = useState<{
    buildingId: string;
    wingId: string | null;
    name: string;
    code: string;
    floorNumber: number;
  } | null>(null);
  const creatingBuildingRef = useRef(false);
  creatingBuildingRef.current = newBuildingDraft !== null;
  const creatingWingRef = useRef(false);
  creatingWingRef.current = newWingDraft !== null;
  const creatingFloorRef = useRef(false);
  creatingFloorRef.current = newFloorDraft !== null;
  const pendingFitRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
      if (creatingBuildingRef.current) {
        setNewBuildingDraft(null);
        setDetailsOpen(false);
        pendingFitRef.current = true;
      }
      refresh();
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
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
      if (creatingFloorRef.current) {
        setNewFloorDraft(null);
        setDetailsOpen(true);
        setFrontWindow("details");
      }
      refresh();
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
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
      if (creatingWingRef.current) {
        setNewWingDraft(null);
        setDetailsOpen(true);
        setFrontWindow("details");
      }
      refresh();
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
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
    onError: (error: Error) => toast.error(friendlySetupError(error)),
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
      setAreaComposerOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
  });
  const deleteAreaMutation = useMutation({
    mutationFn: (id: string) => removeArea({ data: { restaurantId, id } }),
    onSuccess: () => {
      toast.success("Property area deleted.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
  });

  const hierarchy = useMemo(() => {
    const byFloorNumber = (a: Set2Snapshot["floors"][number], b: Set2Snapshot["floors"][number]) =>
      (a.floorNumber ?? Number.MAX_SAFE_INTEGER) - (b.floorNumber ?? Number.MAX_SAFE_INTEGER);
    const wingIds = new Set(set2.wings.map((item) => item.id));
    const buildingIds = new Set(set2.buildings.map((item) => item.id));
    const floorsByWing = new Map<string, Set2Snapshot["floors"]>();
    const directByBuilding = new Map<string, Set2Snapshot["floors"]>();
    for (const item of set2.floors) {
      if (item.wingId && wingIds.has(item.wingId)) {
        floorsByWing.set(item.wingId, [...(floorsByWing.get(item.wingId) ?? []), item]);
      } else {
        directByBuilding.set(item.buildingId, [...(directByBuilding.get(item.buildingId) ?? []), item]);
      }
    }
    const wingEntry = (item: Set2Snapshot["wings"][number]) => ({
      wing: item,
      floors: [...(floorsByWing.get(item.id) ?? [])].sort(byFloorNumber),
    });
    const groups = set2.buildings.map((row) => {
      const wings = set2.wings.filter((item) => item.parentBuildingId === row.id).map(wingEntry);
      const directFloors = [...(directByBuilding.get(row.id) ?? [])].sort(byFloorNumber);
      const floorTotal =
        directFloors.length + wings.reduce((sum, entry) => sum + entry.floors.length, 0);
      return { building: row, wings, directFloors, floorTotal };
    });
    const orphanWings = set2.wings
      .filter((item) => !item.parentBuildingId || !buildingIds.has(item.parentBuildingId))
      .map(wingEntry);
    return { groups, orphanWings };
  }, [set2.buildings, set2.floors, set2.wings]);

  const breadcrumb = useMemo(() => {
    if (building) return ["Property", building.name].join(" › ");
    if (wing) {
      const parent = set2.buildings.find((row) => row.id === wing.parentBuildingId);
      return ["Property", parent?.name, wing.name].filter(Boolean).join(" › ");
    }
    if (floor) {
      const parentBuilding = set2.buildings.find((row) => row.id === floor.buildingId);
      const parentWing = floor.wingId
        ? set2.wings.find((row) => row.id === floor.wingId)
        : null;
      return ["Property", parentBuilding?.name, parentWing?.name, floor.name]
        .filter(Boolean)
        .join(" › ");
    }
    return "";
  }, [building, floor, set2.buildings, set2.wings, wing]);

  const parentPathForBuilding = (buildingId: string) => {
    const row = set2.buildings.find((item) => item.id === buildingId);
    return row?.name ?? "Building";
  };
  const parentPathForWing = (buildingId: string, wingId: string | null) => {
    const buildingName = parentPathForBuilding(buildingId);
    if (!wingId) return buildingName;
    const wingName = set2.wings.find((item) => item.id === wingId)?.name;
    return wingName ? `${buildingName} › ${wingName}` : buildingName;
  };
  const createParentLabel = newBuildingDraft
    ? "Property"
    : newWingDraft
      ? parentPathForBuilding(newWingDraft.parentBuildingId)
      : newFloorDraft
        ? parentPathForWing(newFloorDraft.buildingId, newFloorDraft.wingId)
        : null;
  const detailsSubtitle = newBuildingDraft
    ? "Property › New building"
    : newWingDraft
      ? `Property › ${parentPathForBuilding(newWingDraft.parentBuildingId)} › New wing`
      : newFloorDraft
        ? `Property › ${parentPathForWing(newFloorDraft.buildingId, newFloorDraft.wingId)} › New floor`
        : breadcrumb || undefined;

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setViewportWidth(viewportEl.clientWidth);
      setNaturalSize({ w: contentEl.offsetWidth, h: contentEl.offsetHeight });
    });
    observer.observe(viewportEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, []);

  const zoomBy = (delta: number) =>
    setZoom((value) => Math.min(1.5, Math.max(0.5, Math.round((value + delta) * 10) / 10)));
  const fitView = () => {
    const viewportEl = viewportRef.current;
    if (!viewportEl || !naturalSize.w || !naturalSize.h) {
      setZoom(1);
      return;
    }
    const next = Math.min(
      1,
      (viewportEl.clientWidth - 64) / naturalSize.w,
      (viewportEl.clientHeight - 96) / naturalSize.h,
    );
    setZoom(Math.min(1, Math.max(0.5, Math.floor(next * 20) / 20)));
    viewportEl.scrollTo({
      left: Math.max(0, (naturalSize.w * Math.min(1, Math.max(0.5, next)) - viewportEl.clientWidth) / 2),
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!pendingFitRef.current || naturalSize.w <= 0) return;
    pendingFitRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const viewportEl = viewportRef.current;
      if (!viewportEl || !naturalSize.w || !naturalSize.h) {
        setZoom(1);
        return;
      }
      const next = Math.min(
        1,
        (viewportEl.clientWidth - 64) / naturalSize.w,
        (viewportEl.clientHeight - 96) / naturalSize.h,
      );
      const zoomValue = Math.min(1, Math.max(0.5, Math.floor(next * 20) / 20));
      setZoom(zoomValue);
      viewportEl.scrollTo({
        left: Math.max(0, (naturalSize.w * zoomValue - viewportEl.clientWidth) / 2),
        top: 0,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [set2.buildings.length, naturalSize.w, naturalSize.h]);

  const clearCreateDrafts = () => {
    setNewBuildingDraft(null);
    setNewWingDraft(null);
    setNewFloorDraft(null);
  };

  const selectNode = (node: StructureNode) => {
    clearCreateDrafts();
    setSelected(node);
    setDetailsOpen(true);
    setFrontWindow("details");
  };

  const toggleUtility = (next: StructureUtility) => {
    setUtility((current) => (current === next ? null : next));
    setFrontWindow(next);
  };

  const openNewBuilding = () => {
    const used = new Set(set2.buildings.map((row) => row.code.toUpperCase()));
    let index = set2.buildings.length + 1;
    while (used.has(`B${index}`)) index += 1;
    clearCreateDrafts();
    // Always property-root — never a child of the current selection.
    setSelected(null);
    setNewBuildingDraft({ name: `Building ${index}`, code: `B${index}` });
    setDetailsOpen(true);
    setFrontWindow("details");
  };

  const openNewWing = (parentBuildingId: string) => {
    if (!parentBuildingId) return;
    const used = new Set(set2.wings.map((row) => row.code.toUpperCase()));
    let index = set2.wings.filter((row) => row.parentBuildingId === parentBuildingId).length + 1;
    while (used.has(`W${index}`)) index += 1;
    clearCreateDrafts();
    setSelected({ kind: "building", id: parentBuildingId });
    setNewWingDraft({
      parentBuildingId,
      name: `Wing ${index}`,
      code: `W${index}`,
    });
    setDetailsOpen(true);
    setFrontWindow("details");
  };

  const openNewFloor = (buildingId: string, wingId: string | null) => {
    if (!buildingId) return;
    const siblings = set2.floors.filter((row) =>
      wingId ? row.wingId === wingId : row.buildingId === buildingId && !row.wingId,
    );
    let floorNumber = siblings.length + 1;
    const usedCodes = new Set(set2.floors.map((row) => row.code.toUpperCase()));
    while (usedCodes.has(String(floorNumber))) floorNumber += 1;
    clearCreateDrafts();
    setSelected(wingId ? { kind: "wing", id: wingId } : { kind: "building", id: buildingId });
    setNewFloorDraft({
      buildingId,
      wingId,
      name: `Floor ${floorNumber}`,
      code: String(floorNumber),
      floorNumber,
    });
    setDetailsOpen(true);
    setFrontWindow("details");
  };

  const clearSelection = () => {
    clearCreateDrafts();
    setSelected(null);
    setDetailsOpen(false);
  };
  const clearOnBackground = (event: { target: unknown; currentTarget: unknown }) => {
    if (event.target === event.currentTarget) clearSelection();
  };

  const confirmDelete = (node: StructureNode) => {
    if (!window.confirm("Delete this structure item? Dependencies will block unsafe deletion.")) {
      return;
    }
    deleteStructureMutation.mutate(node);
  };

  const showAddWing = selected?.kind === "building" && !newBuildingDraft && !newWingDraft && !newFloorDraft;
  const showAddFloor =
    (selected?.kind === "building" || selected?.kind === "wing") &&
    !newBuildingDraft &&
    !newWingDraft &&
    !newFloorDraft;
  const structureLayoutMarker = `xl:grid-cols-[20rem_minmax(0,1fr)] Full hierarchy CRUD Open room inventory ${CARD1_ROOMS_HREF} ${CARD1_CAPACITY_COPY}`;

  // Room counts are only shown when the snapshot actually carries room assignments.
  const roomCountFor = (id: string): number | undefined => {
    const assigned = set2.assignedByFloor[id];
    if (typeof assigned === "number") return assigned;
    return set2.roomCount > 0 && Object.keys(set2.assignedByFloor).length > 0 ? 0 : undefined;
  };

  const nodeMenu = (
    node: StructureNode,
    label: string,
    active: boolean,
    pending: boolean,
    onDeactivate: () => void,
  ) => {
    if (!canEdit) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label} actions`}
            className="rounded-md p-1 text-[#8A7352] outline-none hover:bg-[#F4E9D0] hover:text-[#251605] focus-visible:bg-[#FBF3DE]"
            onClick={(event) => {
              event.stopPropagation();
              selectNode(node);
            }}
          >
            <Ellipsis className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {node.kind === "building" ? (
            <>
              <DropdownMenuItem onClick={() => openNewWing(node.id)}>Add Wing</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewFloor(node.id, null)}>Add Floor</DropdownMenuItem>
            </>
          ) : null}
          {node.kind === "wing" ? (
            <DropdownMenuItem
              onClick={() => {
                const parentBuildingId =
                  set2.wings.find((row) => row.id === node.id)?.parentBuildingId ?? "";
                openNewFloor(parentBuildingId, node.id);
              }}
            >
              Add Floor
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              selectNode(node);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending || !active} onClick={onDeactivate}>
            Deactivate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const floorMenu = (item: Set2Snapshot["floors"][number]) =>
    nodeMenu({ kind: "floor", id: item.id }, item.name, item.active, floorMutation.isPending, () =>
      floorMutation.mutate({
        id: item.id,
        buildingId: item.buildingId,
        code: item.code,
        name: item.name,
        active: false,
        status: "inactive",
      }),
    );

  const renderFloorStack = (floors: Set2Snapshot["floors"]) => (
    <FloorStack
      floors={floors}
      roomCountFor={roomCountFor}
      selectedId={selected?.kind === "floor" ? selected.id : null}
      onSelect={(id) => selectNode({ kind: "floor", id })}
      menuFor={floorMenu}
    />
  );

  const renderWingBranch = (entry: { wing: Set2Snapshot["wings"][number]; floors: Set2Snapshot["floors"] }) => (
    <div className="flex flex-col items-center">
      <StructureNodeCard
        kind="wing"
        title={entry.wing.name}
        meta={entry.wing.code || undefined}
        summary={countPhrase(entry.floors.length, "Floor", "Floors")}
        selected={selected?.kind === "wing" && selected.id === entry.wing.id}
        active={entry.wing.active}
        onSelect={() => selectNode({ kind: "wing", id: entry.wing.id })}
        menu={nodeMenu(
          { kind: "wing", id: entry.wing.id },
          entry.wing.name,
          entry.wing.active,
          wingMutation.isPending,
          () =>
            wingMutation.mutate({
              id: entry.wing.id,
              name: entry.wing.name,
              active: false,
              parentBuildingId: entry.wing.parentBuildingId,
              parentFloorId: entry.wing.parentFloorId,
              status: "inactive",
            }),
        )}
      />
      {renderFloorStack(entry.floors)}
    </div>
  );

  const multiBuilding = hierarchy.groups.length > 1;

  return (
    <div
      className="relative left-1/2 w-[100cqw] max-w-[100cqw] -translate-x-1/2"
      data-testid="pms-card1-step-structure"
    >
      <p className="sr-only" aria-hidden="true">
        {structureLayoutMarker}
      </p>
      <section
        className="relative flex overflow-hidden border-y border-[#E6DCC8]"
        data-testid="card1-structure-tree"
        style={{
          minHeight: "max(26rem, calc(100dvh - 19rem))",
          backgroundColor: "#F6F1E6",
          backgroundImage:
            "linear-gradient(rgba(176,137,72,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(176,137,72,0.08) 1px, transparent 1px), radial-gradient(circle at 85% 12%, rgba(200,153,51,0.07), transparent 36%)",
          backgroundSize: "32px 32px, 32px 32px, auto",
        }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute bottom-6 right-10 h-36 w-52 text-[#8A641A] opacity-[0.07]"
          viewBox="0 0 200 120"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        >
          <path d="M16 108 V42 H68 V18 H132 V42 H184 V108 Z" />
          <path d="M68 18 H132" />
          <path d="M92 18 V6 H108 V18" />
          <path d="M36 108 V72 H56 V108 M78 108 V58 H98 V108 M112 108 V58 H132 V108 M148 108 V72 H168 V108" />
        </svg>

        <div
          className="absolute left-3 top-3 z-10 flex w-[8.75rem] flex-col gap-0.5 rounded-xl border border-[#E6DCC8] bg-white/90 p-1 shadow-sm backdrop-blur-sm"
          data-testid="card1-structure-rail"
        >
          <button
            type="button"
            disabled={!canEdit || buildingMutation.isPending}
            onClick={openNewBuilding}
            className={STRUCTURE_RAIL_ACTION}
          >
            + Add Building
          </button>
          {showAddWing ? (
            <button
              type="button"
              disabled={!canEdit || !building || wingMutation.isPending}
              onClick={() => {
                if (building) openNewWing(building.id);
              }}
              className={STRUCTURE_RAIL_ACTION}
            >
              + Add Wing
            </button>
          ) : null}
          {showAddFloor ? (
            <button
              type="button"
              disabled={!canEdit || floorMutation.isPending}
              onClick={() => {
                if (selected?.kind === "building") openNewFloor(selected.id, null);
                else if (selected?.kind === "wing" && wing?.parentBuildingId) {
                  openNewFloor(wing.parentBuildingId, wing.id);
                }
              }}
              className={STRUCTURE_RAIL_ACTION}
            >
              + Add Floor
            </button>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-xl border border-[#E6DCC8] bg-white/90 p-1 shadow-sm backdrop-blur-sm">
          <UtilityButton
            icon={<Gauge className="size-3.5" />}
            label="Capacity"
            open={utility === "capacity"}
            onClick={() => toggleUtility("capacity")}
          />
          <UtilityButton
            icon={<MapPin className="size-3.5" />}
            label="Areas"
            open={utility === "areas"}
            onClick={() => toggleUtility("areas")}
          />
          <UtilityButton
            icon={<ListChecks className="size-3.5" />}
            label="Rules"
            open={utility === "rules"}
            onClick={() => toggleUtility("rules")}
          />
        </div>

        {breadcrumb ? (
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 hidden max-w-[40%] -translate-x-1/2 truncate rounded-full border border-[#E6DCC8] bg-white/90 px-3 py-1 text-xs font-medium text-[#5C5346] shadow-sm lg:block">
            {breadcrumb}
          </p>
        ) : null}

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-xl border border-[#E6DCC8] bg-white/90 p-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => zoomBy(-0.1)}
            className={STRUCTURE_ZOOM_BUTTON}
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset view to 100%"
            title="Reset view"
            onClick={() => setZoom(1)}
            className="min-w-[2.75rem] rounded-lg px-1.5 py-1 text-[11px] font-semibold tabular-nums text-[#5C5346] hover:bg-[#FBF3DE]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 1.5}
            onClick={() => zoomBy(0.1)}
            className={STRUCTURE_ZOOM_BUTTON}
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Fit hierarchy to canvas"
            onClick={fitView}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#5C5346] hover:bg-[#FBF3DE]"
          >
            <Maximize2 className="size-3.5" />
            Fit
          </button>
        </div>

        <div
          ref={viewportRef}
          className="relative z-[1] flex min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-14 pt-16 sm:px-40"
          onClick={clearOnBackground}
        >
          <div
            className="m-auto shrink-0"
            style={
              zoom !== 1 && naturalSize.w > 0
                ? { width: naturalSize.w * zoom, height: naturalSize.h * zoom }
                : undefined
            }
            onClick={clearOnBackground}
          >
            <div
              ref={contentRef}
              className="flex w-max flex-wrap items-start justify-center gap-6"
              style={{
                maxWidth: viewportWidth ? Math.max(320, (viewportWidth - 64) / zoom) : undefined,
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: "top left",
              }}
              onClick={clearOnBackground}
            >
              {hierarchy.groups.length === 0 && hierarchy.orphanWings.length === 0 ? (
                <p className="max-w-sm py-10 text-center text-sm text-[#7A6A55]">
                  Add a building to draw the property hierarchy.
                </p>
              ) : null}
              {hierarchy.groups.map((group) => {
                const branches = [
                  ...(group.directFloors.length > 0
                    ? [
                        {
                          key: `${group.building.id}-direct`,
                          node: (
                            <div className="flex flex-col items-center">
                              <span className="inline-flex w-[9.5rem] items-center justify-center rounded-full border border-dashed border-[#C4A574] bg-[#FBF7EE] px-3 py-1 text-[11px] font-medium text-[#7A6A55]">
                                Direct floors
                              </span>
                              {renderFloorStack(group.directFloors)}
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...group.wings.map((entry) => ({
                    key: entry.wing.id,
                    node: renderWingBranch(entry),
                  })),
                ];
                return (
                  <div
                    key={group.building.id}
                    className={cn(
                      "flex flex-col items-center",
                      multiBuilding &&
                        "rounded-2xl border border-[#E3D6BC] bg-white/40 px-5 pb-5 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
                    )}
                  >
                    {multiBuilding ? (
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8560]">
                        {group.building.name} hierarchy
                      </p>
                    ) : null}
                    <StructureNodeCard
                      kind="building"
                      title={group.building.name}
                      meta={group.building.code}
                      summary={buildingHierarchySummary(group.wings.length, group.floorTotal)}
                      selected={selected?.kind === "building" && selected.id === group.building.id}
                      active={group.building.active}
                      onSelect={() => selectNode({ kind: "building", id: group.building.id })}
                      menu={nodeMenu(
                        { kind: "building", id: group.building.id },
                        group.building.name,
                        group.building.active,
                        buildingMutation.isPending,
                        () =>
                          buildingMutation.mutate({
                            id: group.building.id,
                            code: group.building.code,
                            name: group.building.name,
                            active: false,
                            status: "inactive",
                          }),
                      )}
                    />
                    {branches.length > 0 ? (
                      <>
                        <div aria-hidden className="h-3 w-px bg-[#C4A574]" />
                        <div className="flex items-start">
                          {branches.map((branch, index) => (
                            <StructureChildColumn
                              key={branch.key}
                              index={index}
                              count={branches.length}
                            >
                              {branch.node}
                            </StructureChildColumn>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
              {hierarchy.orphanWings.length > 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#D9C7A0] bg-white/30 px-5 pb-5 pt-3">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8560]">
                    Wings without a building
                  </p>
                  <div className="flex items-start gap-5">
                    {hierarchy.orphanWings.map((entry) => (
                      <div key={entry.wing.id}>{renderWingBranch(entry)}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 top-14 z-20 flex w-[min(44rem,calc(100%-11.5rem))] max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 overflow-hidden">
          {detailsOpen && (selected || newBuildingDraft || newWingDraft || newFloorDraft) ? (
            <div className="pointer-events-auto flex min-h-0 w-[min(22rem,100%)] flex-[0_1_auto] flex-col overflow-hidden self-end">
              <StructureWindow
                title={
                  newBuildingDraft
                    ? "New building"
                    : newWingDraft
                      ? "New wing"
                      : newFloorDraft
                        ? "New floor"
                        : (building?.name ?? wing?.name ?? floor?.name ?? "Details")
                }
                subtitle={detailsSubtitle}
                active={
                  newBuildingDraft || newWingDraft || newFloorDraft
                    ? true
                    : (building?.active ?? wing?.active ?? floor?.active ?? true)
                }
                icon={
                  newBuildingDraft || selected?.kind === "building" ? (
                    <Building2 className="size-3.5" />
                  ) : newWingDraft || selected?.kind === "wing" ? (
                    <Columns2 className="size-3.5" />
                  ) : (
                    <Layers3 className="size-3.5" />
                  )
                }
                scroll
                className={frontWindow === "details" ? "z-30" : "z-20"}
                onClose={() => {
                  setDetailsOpen(false);
                  clearCreateDrafts();
                }}
                onFocus={() => setFrontWindow("details")}
                menu={
                  selected && canEdit && !newBuildingDraft && !newWingDraft && !newFloorDraft ? (
                    <WindowMenu label="Details menu">
                      {selected.kind === "building" ? (
                        <>
                          <DropdownMenuItem onClick={() => openNewWing(selected.id)}>
                            Add Wing
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openNewFloor(selected.id, null)}>
                            Add Floor
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {selected.kind === "wing" ? (
                        <DropdownMenuItem
                          onClick={() =>
                            openNewFloor(
                              set2.wings.find((row) => row.id === selected.id)?.parentBuildingId ??
                                "",
                              selected.id,
                            )
                          }
                        >
                          Add Floor
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        disabled={deleteStructureMutation.isPending}
                        onClick={() => confirmDelete(selected)}
                      >
                        Delete {selected.kind}
                      </DropdownMenuItem>
                    </WindowMenu>
                  ) : null
                }
              >
                {newBuildingDraft ? (
                  <NewBuildingForm
                    key={newBuildingDraft.code}
                    initialName={newBuildingDraft.name}
                    initialCode={newBuildingDraft.code}
                    parentLabel={createParentLabel ?? "Property"}
                    canEdit={canEdit}
                    pending={buildingMutation.isPending}
                    onCancel={() => {
                      clearCreateDrafts();
                      setDetailsOpen(false);
                    }}
                    onSave={(input) => buildingMutation.mutate(input)}
                  />
                ) : newWingDraft ? (
                  <NewWingForm
                    key={`${newWingDraft.parentBuildingId}-${newWingDraft.code}`}
                    initialName={newWingDraft.name}
                    initialCode={newWingDraft.code}
                    parentLabel={createParentLabel ?? "Building"}
                    canEdit={canEdit}
                    pending={wingMutation.isPending}
                    onCancel={() => {
                      setNewWingDraft(null);
                    }}
                    onSave={(input) =>
                      wingMutation.mutate({
                        ...input,
                        parentBuildingId: newWingDraft.parentBuildingId,
                        parentFloorId: null,
                        active: true,
                        status: "active",
                      })
                    }
                  />
                ) : newFloorDraft ? (
                  <NewFloorForm
                    key={`${newFloorDraft.buildingId}-${newFloorDraft.wingId ?? "direct"}-${newFloorDraft.code}`}
                    initialName={newFloorDraft.name}
                    initialCode={newFloorDraft.code}
                    initialFloorNumber={newFloorDraft.floorNumber}
                    parentLabel={createParentLabel ?? "Building"}
                    canEdit={canEdit}
                    pending={floorMutation.isPending}
                    onCancel={() => {
                      setNewFloorDraft(null);
                    }}
                    onSave={(input) =>
                      floorMutation.mutate({
                        ...input,
                        buildingId: newFloorDraft.buildingId,
                        wingId: newFloorDraft.wingId,
                        active: true,
                        status: "active",
                      })
                    }
                  />
                ) : building ? (
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
                    onActivate={() =>
                      buildingMutation.mutate({
                        id: building.id,
                        code: building.code,
                        name: building.name,
                        active: true,
                        status: "active",
                        floorCount: building.floorCount,
                        buildingType: building.buildingType,
                        description: building.description,
                        location: building.location,
                      })
                    }
                  />
                ) : wing ? (
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
                    onActivate={() =>
                      wingMutation.mutate({
                        id: wing.id,
                        name: wing.name,
                        active: true,
                        parentBuildingId: wing.parentBuildingId,
                        parentFloorId: wing.parentFloorId,
                        code: wing.code,
                        description: wing.description,
                        status: "active",
                      })
                    }
                  />
                ) : floor ? (
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
                    onActivate={() =>
                      floorMutation.mutate({
                        id: floor.id,
                        buildingId: floor.buildingId,
                        code: floor.code,
                        name: floor.name,
                        active: true,
                        floorNumber: floor.floorNumber,
                        description: floor.description,
                        status: "active",
                        wingId: floor.wingId,
                      })
                    }
                  />
                ) : null}
              </StructureWindow>
            </div>
          ) : null}

          {utility === "capacity" ? (
            <div className="pointer-events-auto w-[min(20rem,100%)] shrink-0 self-end">
              <StructureWindow
                title="Capacity"
                icon={<Layers3 className="size-3.5" />}
                scroll={false}
                className={cn("h-auto", frontWindow === "capacity" ? "z-30" : "z-20")}
                onClose={() => setUtility(null)}
                onFocus={() => setFrontWindow("capacity")}
                menu={<WindowMenu label="Capacity menu" onClose={() => setUtility(null)} />}
              >
                <div className="grid grid-cols-2 gap-2" data-testid="card1-derived-capacity">
                  {(
                    [
                      ["Buildings", snapshot.derivedCapacity.buildings],
                      ["Wings", set2.wings.length],
                      ["Floors", snapshot.derivedCapacity.floors],
                      ["Rooms", snapshot.derivedCapacity.rooms],
                      ["Sellable rooms", snapshot.derivedCapacity.sellable],
                      ["Non-sellable rooms", snapshot.derivedCapacity.nonSellable],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#E8E1D7] bg-[#FBF7EE] px-2.5 py-2">
                      <p className="text-[11px] text-[#7A6A55]">{label}</p>
                      <p className="text-sm font-semibold text-[#251605]">{value}</p>
                    </div>
                  ))}
                </div>
              </StructureWindow>
            </div>
          ) : null}

          {utility === "areas" ? (
            <div className="pointer-events-auto max-h-[min(28rem,calc(100%-0.5rem))] w-[min(24rem,100%)] shrink-0 self-end overflow-hidden">
              <StructureWindow
                title="Property Areas"
                icon={<Columns2 className="size-3.5" />}
                scroll
                className={cn("h-auto max-h-full", frontWindow === "areas" ? "z-30" : "z-20")}
                onClose={() => setUtility(null)}
                onFocus={() => setFrontWindow("areas")}
                menu={<WindowMenu label="Property Areas menu" onClose={() => setUtility(null)} />}
              >
                {functionalHardeningAvailable ? (
                  <div className="space-y-3">
                    {areaComposerOpen ? (
                      <PropertySetupFormGrid>
                        <Field id="card1-area-name" label="Area Name" value={areaName} onChange={setAreaName} />
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
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingArea(null);
                              setAreaName("");
                              setAreaDescription("");
                              setAreaComposerOpen(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </PropertySetupFormGrid>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {propertyAreas.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-[#E6DCC8] bg-[#FBF7EE] px-3 py-4 text-center text-xs text-[#7A6A55]">
                              No property areas yet. Add lobby, pool, parking, or other shared spaces.
                            </p>
                          ) : (
                            propertyAreas.map((area) => (
                              <div
                                key={area.id}
                                className="flex items-start gap-2 rounded-xl border border-[#E8E1D7] bg-white px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-semibold text-[#251605]">
                                      {area.name}
                                    </p>
                                    <StatusChip active={area.active} />
                                  </div>
                                  {area.description ? (
                                    <p className="line-clamp-2 text-xs text-[#7A6A55]">
                                      {area.description}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-[#B5A48C]">No description</p>
                                  )}
                                </div>
                                {canEdit ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label={`${area.name} actions`}
                                        className="rounded-md p-1 text-[#8A7352] outline-none hover:bg-[#F4E9D0] hover:text-[#251605] focus-visible:bg-[#FBF3DE]"
                                      >
                                        <Ellipsis className="size-3.5" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditingArea(area);
                                          setAreaName(area.name);
                                          setAreaDescription(area.description);
                                          setAreaComposerOpen(true);
                                        }}
                                      >
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={deleteAreaMutation.isPending}
                                        onClick={() => {
                                          if (window.confirm(`Delete property area “${area.name}”?`)) {
                                            deleteAreaMutation.mutate(area.id);
                                          }
                                        }}
                                      >
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E6DCC8] bg-[#FBF3DE] px-3 py-2 text-xs font-semibold text-[#251605] hover:border-[#C89933]"
                            onClick={() => {
                              setEditingArea(null);
                              setAreaName("");
                              setAreaDescription("");
                              setAreaComposerOpen(true);
                            }}
                          >
                            <Plus className="size-3.5" />
                            Add Area
                          </button>
                        ) : null}
                      </>
                    )}
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
                          className={`rounded-full border px-3 py-1 text-xs outline-none focus-visible:border-[#C89933] ${on ? "border-[#C89933] bg-[#FBF3DE] text-[#251605]" : "border-[#CCCCCC] text-[#7A6A55]"}`}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                )}
              </StructureWindow>
            </div>
          ) : null}

          {utility === "rules" ? (
            <div className="pointer-events-auto w-[min(24rem,100%)] shrink-0 self-end">
              <StructureWindow
                title="Structure Rules"
                icon={<Layers3 className="size-3.5" />}
                scroll={false}
                className={cn("h-auto", frontWindow === "rules" ? "z-30" : "z-20")}
                onClose={() => setUtility(null)}
                onFocus={() => setFrontWindow("rules")}
                menu={<WindowMenu label="Structure Rules menu" onClose={() => setUtility(null)} />}
              >
                <div className="space-y-2 rounded-xl border border-[#E8E1D7] bg-[#FBF7EE] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9A8560]">
                    Hierarchy requirements
                  </p>
                  <ToggleRow
                    id="card1-rule-building"
                    label="Building required"
                    helper="Every property needs at least one building."
                    checked={draft.structureRules.buildingRequired}
                    disabled={!canEdit}
                    onChange={(buildingRequired) =>
                      setDraft((p) => ({
                        ...p,
                        structureRules: { ...p.structureRules, buildingRequired },
                      }))
                    }
                  />
                  <ToggleRow
                    id="card1-rule-wing"
                    label="Wing optional"
                    helper="Wings are allowed, but rooms do not require one."
                    checked={draft.structureRules.wingOptional}
                    disabled={!canEdit}
                    onChange={(wingOptional) =>
                      setDraft((p) => ({
                        ...p,
                        structureRules: { ...p.structureRules, wingOptional },
                      }))
                    }
                  />
                  <ToggleRow
                    id="card1-rule-floor"
                    label="Floor required"
                    helper="Rooms must sit on a floor under a building."
                    checked={draft.structureRules.floorRequired}
                    disabled={!canEdit}
                    onChange={(floorRequired) =>
                      setDraft((p) => ({
                        ...p,
                        structureRules: { ...p.structureRules, floorRequired },
                      }))
                    }
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <Field
                      id="card1-code-format"
                      label="Room Number / Code Format"
                      value={draft.structureRules.roomCodeFormat}
                      disabled={!canEdit}
                      onChange={(roomCodeFormat) =>
                        setDraft((p) => ({
                          ...p,
                          structureRules: { ...p.structureRules, roomCodeFormat },
                        }))
                      }
                    />
                    <p className="mt-1.5 text-xs text-[#7A6A55]">
                      Example:{" "}
                      <span className="font-medium text-[#251605]">
                        {structureRoomCodeLiveExample(
                          draft.structureRules.roomCodeFormat,
                          draft.structureRules.wingOptional,
                        )}
                      </span>
                    </p>
                  </div>
                  <ToggleRow
                    id="card1-auto-number"
                    label="Auto Numbering"
                    checked={draft.structureRules.autoNumbering}
                    disabled={!canEdit}
                    onChange={(autoNumbering) =>
                      setDraft((p) => ({
                        ...p,
                        structureRules: { ...p.structureRules, autoNumbering },
                      }))
                    }
                  />
                  <ToggleRow
                    id="card1-dup"
                    label="Prevent Duplicate Room Codes"
                    checked={draft.structureRules.duplicateCodePrevention}
                    disabled={!canEdit}
                    onChange={(duplicateCodePrevention) =>
                      setDraft((p) => ({
                        ...p,
                        structureRules: { ...p.structureRules, duplicateCodePrevention },
                      }))
                    }
                  />
                </div>
                {warnings.map((warning) => (
                  <p key={warning} className="text-sm text-[#C89933]">
                    {warning}
                  </p>
                ))}
              </StructureWindow>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

type StructureUtility = "capacity" | "areas" | "rules";
type StructureWindowId = "details" | StructureUtility;

const STRUCTURE_RAIL_BUTTON =
  "rounded-lg border border-[#E6DCC8] bg-white/95 px-2.5 py-1.5 text-left text-xs font-semibold text-[#251605] shadow-sm hover:border-[#C89933] disabled:cursor-not-allowed disabled:opacity-50";

const STRUCTURE_RAIL_ACTION =
  "rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-[#251605] hover:bg-[#FBF3DE] disabled:cursor-not-allowed disabled:opacity-50";

const STRUCTURE_ZOOM_BUTTON =
  "rounded-lg p-1.5 text-[#5C5346] hover:bg-[#FBF3DE] disabled:cursor-not-allowed disabled:opacity-40";

function countPhrase(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildingHierarchySummary(wingCount: number, floorCount: number) {
  if (wingCount > 0) {
    return `${countPhrase(wingCount, "Wing", "Wings")} • ${countPhrase(floorCount, "Floor", "Floors")}`;
  }
  return countPhrase(floorCount, "Floor", "Floors");
}

/** Live room-code preview. When wings are optional, do not imply a wing segment. */
function structureRoomCodeLiveExample(format: string, wingOptional: boolean) {
  const normalized = wingOptional
    ? format
        .replace(/-?WNG-?/gi, (match) => (match.startsWith("-") && match.endsWith("-") ? "-" : ""))
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "")
    : format;
  const example = structureRoomCodeExample(normalized || format)
    .replace(/\bMAIN\b/g, "MB")
    .replace(/\bEAST\b/g, "EW")
    .replace(/\b101\b/g, "201");
  return example || "MB-02-201";
}

function ParentContext({ label }: { label: string }) {
  return (
    <p
      className="rounded-lg border border-[#E6DCC8] bg-[#FBF7EE] px-3 py-2 text-xs text-[#5C5346]"
      data-testid="card1-structure-parent-context"
    >
      <span className="font-semibold text-[#251605]">Parent:</span> {label}
    </p>
  );
}

function UtilityButton({
  icon,
  label,
  open,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
        "border outline-none focus:outline-none focus-visible:border-[#C89933] focus-visible:ring-0",
        open
          ? "border-[#C89933] bg-[#FBF3DE] text-[#251605] shadow-[inset_0_0_0_1px_rgba(200,153,51,0.35)]"
          : "border-transparent text-[#5C5346] hover:border-[#E6DCC8] hover:bg-[#FBF3DE]",
      )}
    >
      <span className={open ? "text-[#8A641A]" : "text-[#C89933]"}>{icon}</span>
      {label}
    </button>
  );
}

function WindowMenu({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="rounded-md p-1 text-[#B5A48C] outline-none hover:bg-[#F4E9D0] hover:text-[#251605] focus-visible:text-[#251605]"
        >
          <Ellipsis className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {children}
        {onClose ? <DropdownMenuItem onClick={onClose}>Close</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StructureWindow({
  title,
  subtitle,
  active,
  icon,
  className,
  scroll = true,
  onClose,
  onFocus,
  menu,
  children,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  icon: ReactNode;
  className?: string;
  scroll?: boolean;
  onClose: () => void;
  onFocus: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#FFFCF7] shadow-[0_8px_20px_rgba(37,22,5,0.08)]",
        className,
      )}
      onMouseDown={(event) => {
        event.stopPropagation();
        onFocus();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-[#E8E1D7] bg-[#FBF7EE] px-3 py-2">
        <span className="mt-0.5 text-[#C89933]">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[#251605]">{title}</h3>
            {active === undefined ? null : <StatusChip active={active} />}
          </div>
          {subtitle ? (
            <p className="truncate text-[11px] text-[#7A6A55]">{subtitle}</p>
          ) : null}
        </div>
        {menu}
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={onClose}
          className="rounded-md p-1 text-[#8A7352] outline-none hover:bg-[#F4E9D0] hover:text-[#251605]"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div
        className={cn(
          "space-y-3 p-3",
          scroll ? "min-h-0 flex-1 overflow-y-auto" : "overflow-visible",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        active ? "bg-[#FBF3DE] text-[#8A641A]" : "bg-[#F4EDE0] text-[#7A6A55]",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function StructureNodeCard({
  kind,
  title,
  meta,
  summary,
  selected,
  active,
  onSelect,
  menu,
}: {
  kind: "building" | "wing" | "floor";
  title: string;
  meta?: string | undefined;
  summary?: string | undefined;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  menu?: ReactNode;
}) {
  const Icon = kind === "building" ? Building2 : kind === "wing" ? Columns2 : Layers3;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2.5 rounded-xl border text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]/50",
        kind === "building" && "w-[15rem] border-2 px-4 py-3",
        kind === "wing" && "w-[11.5rem] px-3 py-2.5",
        kind === "floor" && "w-[9.5rem] px-2.5 py-1.5",
        selected
          ? "border-[#C89933] bg-[#FBF1D6] shadow-[0_10px_24px_rgba(200,153,51,0.32)]"
          : kind === "building"
            ? "border-[#D9C7A0] bg-white shadow-sm hover:border-[#C89933]/70"
            : "border-[#E4D8C4] bg-white/95 shadow-sm hover:border-[#C89933]/70",
        selected && kind === "building" && "ring-2 ring-[#C89933]/30",
        !active && "opacity-70",
      )}
    >
      <Icon
        className={cn(
          "shrink-0 text-[#C89933]",
          kind === "building" ? "size-5" : kind === "wing" ? "size-4" : "size-3.5",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-semibold leading-tight text-[#251605]",
            kind === "building" ? "text-[15px]" : kind === "wing" ? "text-sm" : "text-xs",
          )}
        >
          {title}
        </p>
        {meta ? (
          <p className="truncate text-[11px] leading-tight text-[#7A6A55]">{meta}</p>
        ) : null}
        {summary ? (
          <p
            className={cn(
              "truncate leading-tight text-[#5C5346]",
              kind === "floor" ? "text-[11px]" : "mt-0.5 text-xs",
            )}
          >
            {summary}
            {!active ? " · Inactive" : ""}
          </p>
        ) : !active ? (
          <p className="text-[11px] leading-tight text-[#8A7352]">Inactive</p>
        ) : null}
      </div>
      {menu ? (
        <div
          className={cn(
            "shrink-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
            selected ? "opacity-100" : "opacity-0",
          )}
        >
          {menu}
        </div>
      ) : null}
    </div>
  );
}

function StructureChildColumn({
  index,
  count,
  children,
}: {
  index: number;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center px-3 pt-3">
      {count > 1 ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-0 h-px bg-[#C4A574]",
            index === 0 && "left-1/2 right-0",
            index === count - 1 && "left-0 right-1/2",
            index > 0 && index < count - 1 && "inset-x-0",
          )}
        />
      ) : null}
      <span aria-hidden className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-[#C4A574]" />
      {children}
    </div>
  );
}

function floorSubtitle(
  floor: Set2Snapshot["floors"][number],
  roomCount: number | undefined,
): string | undefined {
  const parts: string[] = [];
  const identifier = floor.floorNumber != null ? String(floor.floorNumber) : floor.code;
  const nameWords = floor.name.toLowerCase().split(/[^a-z0-9]+/);
  if (identifier && !nameWords.includes(identifier.toLowerCase())) {
    parts.push(`No. ${identifier}`);
  }
  if (typeof roomCount === "number") parts.push(countPhrase(roomCount, "room", "rooms"));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function FloorStack({
  floors,
  roomCountFor,
  selectedId,
  onSelect,
  menuFor,
}: {
  floors: Set2Snapshot["floors"];
  roomCountFor: (id: string) => number | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  menuFor: (floor: Set2Snapshot["floors"][number]) => ReactNode;
}) {
  if (floors.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col items-center gap-2">
      {floors.map((item, index) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute left-1/2 w-px -translate-x-1/2 bg-[#C4A574]",
              index === 0 ? "-top-3 h-3" : "-top-2 h-2",
            )}
          />
          <StructureNodeCard
            kind="floor"
            title={item.name}
            summary={floorSubtitle(item, roomCountFor(item.id))}
            selected={selectedId === item.id}
            active={item.active}
            onSelect={() => onSelect(item.id)}
            menu={menuFor(item)}
          />
        </li>
      ))}
    </ul>
  );
}

function NewBuildingForm({
  initialName,
  initialCode,
  parentLabel,
  canEdit,
  pending,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialCode: string;
  parentLabel: string;
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    code: string;
    name: string;
    active: boolean;
    floorCount: number | null;
    buildingType: string;
    description: string;
    location: string;
    status: string;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [type, setType] = useState("");
  const [floors, setFloors] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  return (
    <div className="space-y-3">
      <ParentContext label={parentLabel} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="b-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="b-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
        <Field id="b-type" label="Type" value={type} disabled={!canEdit} onChange={setType} />
        <Field
          id="b-floors"
          label="Number of Floors"
          value={floors}
          disabled={!canEdit}
          onChange={setFloors}
        />
        <Field id="b-location" label="Location" value={location} disabled={!canEdit} onChange={setLocation} />
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
            disabled={pending || !name.trim() || !code.trim()}
            onClick={() =>
              onSave({
                code,
                name,
                active: true,
                floorCount: floors ? Number(floors) : null,
                buildingType: type,
                description,
                location,
                status: "active",
              })
            }
          >
            Save Changes
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NewWingForm({
  initialName,
  initialCode,
  parentLabel,
  canEdit,
  pending,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialCode: string;
  parentLabel: string;
  canEdit: boolean;
  pending: boolean;
  onSave: (input: { name: string; code: string; description: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-3">
      <ParentContext label={parentLabel} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="nw-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="nw-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
      </div>
      <Field
        id="nw-desc"
        label="Description"
        value={description}
        disabled={!canEdit}
        onChange={setDescription}
      />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !name.trim() || !code.trim()}
            onClick={() => onSave({ name, code, description })}
          >
            Save Changes
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NewFloorForm({
  initialName,
  initialCode,
  initialFloorNumber,
  parentLabel,
  canEdit,
  pending,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialCode: string;
  initialFloorNumber: number;
  parentLabel: string;
  canEdit: boolean;
  pending: boolean;
  onSave: (input: {
    name: string;
    code: string;
    floorNumber: number | null;
    description: string;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [number, setNumber] = useState(String(initialFloorNumber));
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-3">
      <ParentContext label={parentLabel} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="nf-name" label="Name" required value={name} disabled={!canEdit} onChange={setName} />
        <Field id="nf-number" label="Number" required value={number} disabled={!canEdit} onChange={setNumber} />
        <Field id="nf-code" label="Code" required value={code} disabled={!canEdit} onChange={setCode} />
      </div>
      <Field
        id="nf-desc"
        label="Description"
        value={description}
        disabled={!canEdit}
        onChange={setDescription}
      />
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !name.trim() || !code.trim()}
            onClick={() =>
              onSave({
                name,
                code,
                floorNumber: number ? Number(number) : null,
                description,
              })
            }
          >
            Save Changes
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BuildingForm({
  building,
  canEdit,
  pending,
  onSave,
  onDeactivate,
  onActivate,
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
  onActivate: () => void;
}) {
  const [name, setName] = useState(building.name);
  const [code, setCode] = useState(building.code);
  const [type, setType] = useState(building.buildingType);
  const [floors, setFloors] = useState(
    building.floorCount == null ? "" : String(building.floorCount),
  );
  const [description, setDescription] = useState(building.description);
  const [location, setLocation] = useState(building.location);
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
                active: building.active,
                floorCount: floors ? Number(floors) : null,
                buildingType: type,
                description,
                location,
                status: building.active ? "active" : "inactive",
              })
            }
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={building.active ? onDeactivate : onActivate}
          >
            {building.active ? "Deactivate" : "Activate"}
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
  onActivate,
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
  onActivate: () => void;
}) {
  const [name, setName] = useState(wing.name);
  const [code, setCode] = useState(wing.code);
  const [description, setDescription] = useState(wing.description);
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
                active: wing.active,
                parentBuildingId: buildingId || null,
                parentFloorId: null,
                code,
                description,
                status: wing.active ? "active" : "inactive",
              })
            }
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={wing.active ? onDeactivate : onActivate}
          >
            {wing.active ? "Deactivate" : "Activate"}
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
  onActivate,
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
  onActivate: () => void;
}) {
  const [name, setName] = useState(floor.name);
  const [code, setCode] = useState(floor.code);
  const [number, setNumber] = useState(floor.floorNumber == null ? "" : String(floor.floorNumber));
  const [description, setDescription] = useState(floor.description);
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
                active: floor.active,
                floorNumber: number ? Number(number) : null,
                description,
                status: floor.active ? "active" : "inactive",
                wingId: wingId === "none" ? null : wingId,
              })
            }
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={floor.active ? onDeactivate : onActivate}
          >
            {floor.active ? "Deactivate" : "Activate"}
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
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-[6px] border border-[#CCCCCC] bg-white px-2 transition-colors focus-within:border-[#C89933] focus-within:ring-1 focus-within:ring-[#C89933]",
          error && "border-red-500 focus-within:border-red-500 focus-within:ring-red-500",
        )}
      >
        <label className="relative size-7 shrink-0 overflow-hidden rounded-md border border-[#E6E1D8]">
          <span className="absolute inset-0" style={{ backgroundColor: pickerValue }} aria-hidden />
          <span className="sr-only">{label} swatch</span>
          <Input
            type="color"
            aria-label={`${label} picker`}
            value={pickerValue}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-sm uppercase shadow-none focus-visible:ring-0"
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
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "group relative shrink-0 overflow-hidden rounded-lg border border-[#E6E1D8] bg-[#F7F4EE]",
            landscape ? "h-14 w-24" : "size-14",
          )}
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
              className="flex h-full w-full items-center justify-center text-center text-[10px] leading-tight text-muted-foreground"
            >
              No image
            </button>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          {!disabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#DDD4C5] px-2.5 text-xs"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Change Image"}
            </Button>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{CARD1_BRAND_IMAGE_HELPER}</p>
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
                  <div className="absolute left-2 top-2 rounded-md bg-[#C89933] px-1.5 py-0.5 text-[10px] font-semibold text-[#251605] shadow">
                    Cover
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
              "flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-dashed border-[#DDD4C5] bg-[#FAF8F5] text-center transition-colors hover:border-[#C89933] hover:bg-[#FBF7EE]",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 px-3">
              {uploading ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#251605] border-t-transparent" />
                  <span className="text-xs font-medium text-[#251605]">Uploading…</span>
                </>
              ) : (
                <>
                  <span className="rounded-full border border-[#E8E2D6] bg-white p-2 shadow-sm">
                    <Plus className="h-4 w-4 text-[#251605]" />
                  </span>
                  <span className="text-xs font-semibold text-[#251605]">Upload Images</span>
                </>
              )}
            </span>
            <span className="flex h-9 items-center justify-center border-t border-[#E8E2D6] px-2 text-[11px] text-muted-foreground">
              PNG, JPG or WEBP
            </span>
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
  controlId,
  error: externalError,
  onChange,
}: {
  restaurantId: string;
  label: string;
  kind: string;
  refs: Card1UploadRef[];
  canEdit: boolean;
  required?: boolean;
  controlId?: string;
  error?: string;
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
          id={controlId}
          type="button"
          variant="outline"
          disabled={uploading}
          aria-invalid={Boolean(externalError)}
          className={cn(externalError && "border-red-500")}
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
      {externalError ? (
        <p className="text-xs text-red-600" role="alert">
          {externalError}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
