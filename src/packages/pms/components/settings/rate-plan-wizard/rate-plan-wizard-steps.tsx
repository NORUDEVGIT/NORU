import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Edit2, Lock, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { COMMON_CURRENCIES } from "@/shared/lib/property-time";
import { formatStayDate } from "@/shared/lib/property-dates";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import {
  computeRatePlanBaseFromDefaults,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import {
  isValidRatePlanCode,
  RATE_PLAN_CODE_STAFF_HINT,
  suggestRatePlanCode,
} from "@/packages/pms/lib/rates-card2-code";
import { PmsPropertySetupCard3Meals } from "@/packages/pms/components/settings/pms-property-setup-card3-meals";
import { useRatePlanWizard } from "./rate-plan-wizard-context";
import {
  buildCancellationWizardOptions,
  buildDepositWizardOptions,
  buildEarlyDepartureWizardOptions,
  buildNoShowWizardOptions,
  derivedCancellationKindFromSelection,
  policyOptionLabel,
  type WizardPolicyOption,
} from "./rate-plan-wizard-policy-options";
import {
  PACKAGE_INCLUSION_TYPE_LABELS,
  PACKAGE_INCLUSION_TYPES,
  type PackageInclusionType,
} from "@/packages/pms/lib/rate-plan-package-inclusion";
import {
  formatPackagePriceDetail,
  formatRatePlanMoney,
  oneNightStartingTotal,
} from "@/packages/pms/lib/rate-plan-price-summary";
import {
  buildMealPlanWizardOptions,
  resolveMealPlanSelectionValue,
} from "./rate-plan-wizard-meal-options";
import {
  derivedRefundabilityLabel,
  formatAdvanceBookingSummary,
  formatStaySummary,
  RATE_PLAN_NONE,
  type RatePlanWizardStepId,
} from "./rate-plan-wizard-types";
import type { RatePlanWizardPackageOption } from "./rate-plan-wizard-context";

type Step1Field =
  | "categoryId"
  | "roomTypeId"
  | "name"
  | "code"
  | "validFrom"
  | "baseRate";

/** Rectangular NORU settings control — keep wizard field height (h-9), Settings radius (6px). */
const WIZARD_CONTROL_CLASS = cn(
  PROPERTY_SETUP_CONTROL_CLASS,
  "h-9 rounded-[6px] focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const WIZARD_TEXTAREA_CLASS = cn(
  WIZARD_CONTROL_CLASS,
  "h-auto min-h-[4.5rem] py-2",
);

const WIZARD_SELECT_TRIGGER_CLASS = cn(
  WIZARD_CONTROL_CLASS,
  "justify-between [&>span]:line-clamp-1",
);

const WIZARD_SELECT_TRIGGER_TALL_CLASS = cn(
  WIZARD_SELECT_TRIGGER_CLASS,
  "h-auto min-h-9 py-1.5",
);

const WIZARD_LOCKED_CONTROL_CLASS =
  "flex h-9 items-center gap-2 rounded-[6px] border border-[#CCCCCC] bg-[#F7F4EE] px-3 text-sm text-[#251605]";

const PRICING_BASIS_OPTIONS: ReadonlyArray<{
  value: RatePlanPricingMethod;
  label: string;
}> = [
  { value: "use_base", label: "Use Room Type Base" },
  { value: "discount", label: "Discount from Room Type Base" },
  { value: "markup", label: "Markup from Room Type Base" },
  { value: "fixed", label: "Fixed Price" },
];

function WizardCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs", className)}
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#EDE6D8] pb-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">{title}</h4>
          {description ? (
            <p className="mt-0.5 text-[11px] text-[#756A5B]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldError({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return <p className="text-[11px] text-destructive">{message}</p>;
}

function CreateButton({
  onClick,
  disabled,
  label = "Create",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-5 px-1.5 text-xs text-[#8A641A] hover:bg-[#F4EDE0]"
      disabled={disabled}
      onClick={onClick}
    >
      <Plus className="mr-1 size-3" />
      {label}
    </Button>
  );
}

function staffName(
  id: string,
  rows: ReadonlyArray<{ id: string; name: string }>,
  noneLabel = "None",
): string | undefined {
  if (!id || id === RATE_PLAN_NONE) return noneLabel;
  return rows.find((item) => item.id === id)?.name;
}

function categoryStaffLabel(code: string, name: string) {
  const short = code.trim();
  if (!short) return name;
  if (name.toLowerCase().includes(short.toLowerCase())) return name;
  return `${short} · ${name}`;
}

function currencyDisplayLabel(code: string) {
  const row = COMMON_CURRENCIES.find((item) => item.code === code);
  if (!row) return code;
  const name = row.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return `${code} — ${name}`;
}

function formatWizardValidity(validFrom?: string | null, validTo?: string | null): string {
  const from = validFrom?.trim();
  const to = validTo?.trim();
  if (!from && !to) return "Always";
  if (from && !to) return `From ${formatStayDate(from)}`;
  if (!from && to) return `Until ${formatStayDate(to)}`;
  return `${formatStayDate(from!)} – ${formatStayDate(to!)}`;
}

function PolicySelectItem({ option }: { option: WizardPolicyOption }) {
  return (
    <SelectItem value={option.value} className="items-start py-2">
      <div className="flex flex-col gap-0.5">
        <span>{option.name}</span>
        {option.detail ? (
          <span className="text-[10px] font-normal text-[#8A7963]">{option.detail}</span>
        ) : null}
      </div>
    </SelectItem>
  );
}

function PolicySelectGroups({
  options,
  noruLabel = "NORU Policies",
  customLabel = "Custom Policies",
}: {
  options: readonly WizardPolicyOption[];
  noruLabel?: string;
  customLabel?: string;
}) {
  const noru = options.filter((row) => row.group === "noru");
  const custom = options.filter((row) => row.group === "custom");
  return (
    <>
      {noru.length > 0 ? (
        <SelectGroup>
          <SelectLabel className="text-[10px] uppercase tracking-wider text-[#8A641A]">
            {noruLabel}
          </SelectLabel>
          {noru.map((option) => (
            <PolicySelectItem key={`${option.group}-${option.value}`} option={option} />
          ))}
        </SelectGroup>
      ) : null}
      {custom.length > 0 ? (
        <SelectGroup>
          <SelectLabel className="text-[10px] uppercase tracking-wider text-[#8A641A]">
            {customLabel}
          </SelectLabel>
          {custom.map((option) => (
            <PolicySelectItem key={`${option.group}-${option.value}`} option={option} />
          ))}
        </SelectGroup>
      ) : null}
    </>
  );
}

function InheritedHint({ roomTypeName }: { roomTypeName?: string }) {
  if (!roomTypeName) return null;
  return <p className="text-[10px] text-[#8A641A]">From {roomTypeName}</p>;
}

export function RatePlanWizardStep1() {
  const {
    canEdit,
    form,
    setForm,
    codeManuallyEdited,
    setCodeManuallyEdited,
    attemptedStep1,
    catalogues,
    onAddCategory,
    applyRoomTypeDefaults,
    setFooter,
    setStep,
  } = useRatePlanWizard();

  const [touched, setTouched] = useState<Partial<Record<Step1Field, boolean>>>({});

  const selectedType = catalogues.roomTypes.find((row) => row.id === form.roomTypeId);
  const selectedCategory = catalogues.categories.find((row) => row.id === form.categoryId);
  const hasTypeBase = roomTypeBaseIsConfigured(selectedType?.baseNightlyRate);
  const fromRoom = selectedType?.name;

  const baseMatchesType =
    Boolean(selectedType) &&
    selectedType?.baseNightlyRate != null &&
    form.baseRate === selectedType.baseNightlyRate;
  const includedMatchesType =
    Boolean(selectedType) &&
    form.includedOccupancy.trim() === String(selectedType?.standardOccupancy ?? "");
  const extraAdultMatchesType =
    Boolean(selectedType) &&
    selectedType?.extraAdultRateDefault != null &&
    form.extraAdultRate.trim() === String(selectedType.extraAdultRateDefault);
  const extraChildMatchesType =
    Boolean(selectedType) &&
    selectedType?.extraChildRateDefault != null &&
    form.extraChildRate.trim() === String(selectedType.extraChildRateDefault);

  function showError(field: Step1Field, invalid: boolean) {
    return Boolean((attemptedStep1 || touched[field]) && invalid);
  }

  function markTouched(field: Step1Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function applyPricingMethod(method: RatePlanPricingMethod, percent = form.methodPercent) {
    setForm((prev) => {
      const computed = computeRatePlanBaseFromDefaults({
        method,
        roomTypeBase: selectedType?.baseNightlyRate,
        percent,
        fixedPrice: method === "fixed" ? prev.baseRate : selectedType?.baseNightlyRate,
      });
      return {
        ...prev,
        pricingMethod: method,
        methodPercent: percent,
        baseRate: computed.ok ? computed.baseRate : prev.baseRate,
      };
    });
  }

  useEffect(() => {
    setFooter({
      continueLabel: "Continue",
      onContinue: () => setStep(2),
    });
    return () => setFooter(null);
  }, [setFooter, setStep]);

  return (
    <div className="space-y-3">
      <WizardCard
        title="Rate Plan Identity"
        description="Link this plan to an existing category and room type."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>
                Rate Category <span className="text-destructive">*</span>
              </Label>
              {canEdit ? <CreateButton onClick={onAddCategory} /> : null}
            </div>
            <Select
              value={form.categoryId || undefined}
              disabled={!canEdit}
              onValueChange={(categoryId) => {
                markTouched("categoryId");
                setForm((prev) => {
                  const category = catalogues.categories.find((row) => row.id === categoryId);
                  const roomType = catalogues.roomTypes.find((row) => row.id === prev.roomTypeId);
                  return {
                    ...prev,
                    categoryId,
                    code: codeManuallyEdited
                      ? prev.code
                      : suggestRatePlanCode(category?.code ?? "", roomType?.name ?? ""),
                  };
                });
              }}
            >
              <SelectTrigger
                className={cn(
                  WIZARD_SELECT_TRIGGER_CLASS,
                  showError("categoryId", !form.categoryId) && "border-destructive",
                )}
                onBlur={() => markTouched("categoryId")}
              >
                <SelectValue placeholder="Select category">
                  {selectedCategory
                    ? categoryStaffLabel(selectedCategory.code, selectedCategory.name)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] max-h-[190px]">
                {catalogues.categories.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {categoryStaffLabel(row.code, row.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              show={showError("categoryId", !form.categoryId)}
              message="Category is required."
            />
          </div>

          <div className="space-y-1">
            <Label>
              Room Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.roomTypeId || undefined}
              disabled={!canEdit}
              onValueChange={(roomTypeId) => {
                markTouched("roomTypeId");
                applyRoomTypeDefaults(roomTypeId);
              }}
            >
              <SelectTrigger
                className={cn(
                  WIZARD_SELECT_TRIGGER_CLASS,
                  showError("roomTypeId", !form.roomTypeId) && "border-destructive",
                )}
                onBlur={() => markTouched("roomTypeId")}
              >
                <SelectValue placeholder="Select room type">
                  {selectedType?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] max-h-[190px]">
                {catalogues.roomTypes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              show={showError("roomTypeId", !form.roomTypeId)}
              message="Room type is required."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="rpw-name">
              Rate Plan Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rpw-name"
              value={form.name}
              disabled={!canEdit}
              placeholder="e.g. Best Available Rate - Standard King"
              className={cn(
                WIZARD_CONTROL_CLASS,
                showError("name", !form.name.trim()) && "border-destructive",
              )}
              onBlur={() => markTouched("name")}
              onChange={(event) => {
                const name = event.target.value;
                setForm((prev) => ({ ...prev, name }));
              }}
            />
            <FieldError show={showError("name", !form.name.trim())} message="Name is required." />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="rpw-code">
                Rate Plan Code <span className="text-destructive">*</span>
              </Label>
              {canEdit && codeManuallyEdited && (selectedCategory || selectedType) ? (
                <button
                  type="button"
                  className="text-[10px] text-[#8A641A] hover:underline"
                  data-testid="rpw-code-reset-auto"
                  onClick={() => {
                    setCodeManuallyEdited(false);
                    setForm((prev) => ({
                      ...prev,
                      code: suggestRatePlanCode(
                        selectedCategory?.code ?? "",
                        selectedType?.name ?? "",
                      ),
                    }));
                  }}
                >
                  Reset to auto
                </button>
              ) : null}
            </div>
            <div className="relative">
              <Input
                id="rpw-code"
                value={form.code}
                disabled={!canEdit}
                placeholder="e.g. BAR_STD_KING"
                className={cn(
                  WIZARD_CONTROL_CLASS,
                  "pr-14 font-mono uppercase",
                  (showError("code", !form.code.trim()) ||
                    (Boolean(form.code.trim()) && !isValidRatePlanCode(form.code))) &&
                    "border-destructive",
                )}
                onBlur={() => markTouched("code")}
                onChange={(event) => {
                  setCodeManuallyEdited(true);
                  setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }));
                }}
              />
              {!codeManuallyEdited && form.code ? (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#EDE6D8] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5C4528]">
                  Auto
                </span>
              ) : null}
            </div>
            <FieldError
              show={showError("code", !form.code.trim())}
              message="Code is required."
            />
            <FieldError
              show={
                Boolean(form.code.trim()) &&
                !isValidRatePlanCode(form.code) &&
                Boolean(attemptedStep1 || touched.code)
              }
              message={RATE_PLAN_CODE_STAFF_HINT}
            />
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <Label htmlFor="rpw-description">Description</Label>
          <Textarea
            id="rpw-description"
            value={form.description}
            disabled={!canEdit}
            rows={2}
            className={WIZARD_TEXTAREA_CLASS}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rpw-valid-from">
              Valid From <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rpw-valid-from"
              type="date"
              value={form.validFrom}
              disabled={!canEdit}
              className={cn(
                WIZARD_CONTROL_CLASS,
                showError("validFrom", !form.validFrom) && "border-destructive",
              )}
              onBlur={() => markTouched("validFrom")}
              onChange={(event) => setForm((prev) => ({ ...prev, validFrom: event.target.value }))}
            />
            {form.validFrom ? (
              <p className="text-[10px] text-[#8A7963]">{formatStayDate(form.validFrom)}</p>
            ) : null}
            <FieldError
              show={showError("validFrom", !form.validFrom)}
              message="Valid from is required."
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="rpw-valid-to"
                className={cn(form.noEndDate && "text-[#A89F90]")}
              >
                Valid To
              </Label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#5C5346]">
                <input
                  type="checkbox"
                  checked={form.noEndDate}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      noEndDate: event.target.checked,
                      validTo: event.target.checked ? "" : prev.validTo,
                    }))
                  }
                />
                No end date
              </label>
            </div>
            <Input
              id="rpw-valid-to"
              type="date"
              value={form.validTo}
              disabled={!canEdit || form.noEndDate}
              className={cn(
                WIZARD_CONTROL_CLASS,
                form.noEndDate && "cursor-not-allowed bg-[#F3EFE7] text-[#A89F90] opacity-70",
              )}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, validTo: event.target.value, noEndDate: false }))
              }
            />
            {form.noEndDate ? (
              <p className="text-[10px] text-[#A89F90]">No end date — Valid To is not used.</p>
            ) : form.validTo ? (
              <p className="text-[10px] text-[#8A7963]">{formatStayDate(form.validTo)}</p>
            ) : null}
          </div>
        </div>
      </WizardCard>

      <WizardCard
        title="Pricing Defaults"
        description="Room Type values are used as starting defaults. The saved Rate Plan remains the pricing authority."
      >
        <div className="mb-3 space-y-1.5">
          <div className="space-y-1">
            <Label htmlFor="rpw-pricing-basis">Pricing Basis</Label>
            <Select
              value={form.pricingMethod}
              disabled={!canEdit}
              onValueChange={(next) => applyPricingMethod(next as RatePlanPricingMethod)}
            >
              <SelectTrigger id="rpw-pricing-basis" className={WIZARD_SELECT_TRIGGER_CLASS}>
                <SelectValue>
                  {PRICING_BASIS_OPTIONS.find((row) => row.value === form.pricingMethod)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                {PRICING_BASIS_OPTIONS.map((row) => (
                  <SelectItem
                    key={row.value}
                    value={row.value}
                    disabled={row.value !== "fixed" && !hasTypeBase}
                  >
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.pricingMethod === "discount" ? (
            <div className="space-y-1 pt-1">
              <Label htmlFor="rpw-discount-percent">Discount percent</Label>
              <Input
                id="rpw-discount-percent"
                type="number"
                min={0}
                value={form.methodPercent}
                disabled={!canEdit}
                className={WIZARD_CONTROL_CLASS}
                onChange={(event) =>
                  applyPricingMethod("discount", Number(event.target.value) || 0)
                }
              />
            </div>
          ) : null}
          {form.pricingMethod === "markup" ? (
            <div className="space-y-1 pt-1">
              <Label htmlFor="rpw-markup-percent">Markup percent</Label>
              <Input
                id="rpw-markup-percent"
                type="number"
                min={0}
                value={form.methodPercent}
                disabled={!canEdit}
                className={WIZARD_CONTROL_CLASS}
                onChange={(event) =>
                  applyPricingMethod("markup", Number(event.target.value) || 0)
                }
              />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rpw-base">
              Base Rate <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#8A641A]">{catalogues.currencyCode}</span>
              <Input
                id="rpw-base"
                type="number"
                min={0}
                step="any"
                value={form.baseRate}
                disabled={!canEdit}
                className={cn(
                  WIZARD_CONTROL_CLASS,
                  showError(
                    "baseRate",
                    !(Number.isFinite(form.baseRate) && form.baseRate >= 0),
                  ) && "border-destructive",
                )}
                onBlur={() => markTouched("baseRate")}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    pricingMethod: "fixed",
                    baseRate: Number(event.target.value),
                  }))
                }
              />
            </div>
            {baseMatchesType ? <InheritedHint roomTypeName={fromRoom} /> : null}
          </div>

          <div className="space-y-1">
            <Label>Currency</Label>
            <div
              className={WIZARD_LOCKED_CONTROL_CLASS}
              title="From Property & Business"
            >
              <Lock className="size-3.5 shrink-0 text-[#8A641A]" aria-hidden />
              <span className="truncate">{currencyDisplayLabel(catalogues.currencyCode)}</span>
              <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-[#8A641A]">
                Property
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rpw-included">Included Occupancy</Label>
            <Input
              id="rpw-included"
              type="number"
              min={1}
              value={form.includedOccupancy}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, includedOccupancy: event.target.value }))
              }
            />
            {includedMatchesType ? <InheritedHint roomTypeName={fromRoom} /> : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rpw-extra-adult">Extra Adult Default</Label>
            <Input
              id="rpw-extra-adult"
              type="number"
              min={0}
              step="any"
              value={form.extraAdultRate}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, extraAdultRate: event.target.value }))
              }
            />
            {extraAdultMatchesType ? <InheritedHint roomTypeName={fromRoom} /> : null}
          </div>

          <div className="space-y-1 sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]">
            <Label htmlFor="rpw-extra-child">Extra Child Default</Label>
            <Input
              id="rpw-extra-child"
              type="number"
              min={0}
              step="any"
              value={form.extraChildRate}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, extraChildRate: event.target.value }))
              }
            />
            {extraChildMatchesType ? <InheritedHint roomTypeName={fromRoom} /> : null}
          </div>
        </div>
      </WizardCard>

      <div className="rounded-xl border border-[#E6E1D8] bg-white px-3 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[#8A7963]">Summary</span>
          <span className="text-[#251605]">
            <span className="text-[#8A7963]">Room </span>
            {selectedType?.name ?? "—"}
          </span>
          <span className="text-[#D9D2C4]">·</span>
          <span className="text-[#251605]">
            <span className="text-[#8A7963]">Category </span>
            {selectedCategory?.name ?? "—"}
          </span>
          <span className="text-[#D9D2C4]">·</span>
          <span className="text-[#251605]">
            <span className="text-[#8A7963]">Rate </span>
            {catalogues.currencyCode} {form.baseRate}
          </span>
          <span className="text-[#D9D2C4]">·</span>
          <span className="text-[#251605]">
            <span className="text-[#8A7963]">Occ </span>
            {form.includedOccupancy.trim() || "—"}
          </span>
          <span className="text-[#D9D2C4]">·</span>
          <span className="text-[#251605]">
            <span className="text-[#8A7963]">Valid </span>
            {formatWizardValidity(
              form.validFrom || null,
              form.noEndDate ? null : form.validTo || null,
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RatePlanWizardStep2() {
  const {
    canEdit,
    form,
    setForm,
    catalogues,
    onAddCancellation,
    onAddDeposit,
    onAddNoShow,
    onAddEarlyDeparture,
    setFooter,
    setStep,
  } = useRatePlanWizard();

  const cancellationOptions = buildCancellationWizardOptions(
    catalogues.cancellationPolicies,
    form.cancellationPolicyId,
  );
  const noShowOptions = buildNoShowWizardOptions(
    catalogues.noShowPolicies,
    form.noShowPolicyId,
  );
  const depositOptions = buildDepositWizardOptions(
    catalogues.depositPolicies,
    form.depositPolicyId,
  );
  const earlyDepartureOptions = buildEarlyDepartureWizardOptions(
    catalogues.earlyDeparturePolicies,
    form.earlyDeparturePolicyId,
  );

  const refundKind = derivedCancellationKindFromSelection(
    form.cancellationPolicyId,
    catalogues.cancellationPolicies,
  );

  useEffect(() => {
    setFooter({
      continueLabel: "Continue",
      onContinue: () => setStep(3),
    });
    return () => setFooter(null);
  }, [setFooter, setStep]);

  return (
    <div className="space-y-3">
      <WizardCard
        title="Policies"
        description="Select a NORU policy or a property custom policy. Create custom only when the policy is not already listed."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-1">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-[#251605]">Cancellation Policy</Label>
              {canEdit ? (
                <CreateButton label="Create custom" onClick={onAddCancellation} />
              ) : null}
            </div>
            <Select
              value={form.cancellationPolicyId}
              disabled={!canEdit}
              onValueChange={(cancellationPolicyId) =>
                setForm((prev) => ({ ...prev, cancellationPolicyId }))
              }
            >
              <SelectTrigger className={WIZARD_SELECT_TRIGGER_TALL_CLASS}>
                <SelectValue>
                  {policyOptionLabel(form.cancellationPolicyId, cancellationOptions)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                <PolicySelectGroups options={cancellationOptions} />
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#5C5346]">
              Refundability:{" "}
              <span className="font-semibold text-[#251605]">
                {derivedRefundabilityLabel(refundKind)}
              </span>
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-[#251605]">No-Show Policy</Label>
              {canEdit ? <CreateButton label="Create custom" onClick={onAddNoShow} /> : null}
            </div>
            <Select
              value={form.noShowPolicyId}
              disabled={!canEdit}
              onValueChange={(noShowPolicyId) => setForm((prev) => ({ ...prev, noShowPolicyId }))}
            >
              <SelectTrigger className={WIZARD_SELECT_TRIGGER_TALL_CLASS}>
                <SelectValue>
                  {policyOptionLabel(form.noShowPolicyId, noShowOptions)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                <PolicySelectGroups options={noShowOptions} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[#5C5346]">Deposit Policy</Label>
              {canEdit ? <CreateButton label="Create custom" onClick={onAddDeposit} /> : null}
            </div>
            <Select
              value={form.depositPolicyId}
              disabled={!canEdit}
              onValueChange={(depositPolicyId) => setForm((prev) => ({ ...prev, depositPolicyId }))}
            >
              <SelectTrigger className={WIZARD_SELECT_TRIGGER_CLASS}>
                <SelectValue>
                  {policyOptionLabel(form.depositPolicyId, depositOptions)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                <PolicySelectGroups options={depositOptions} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[#5C5346]">Early Departure Policy</Label>
              {canEdit ? (
                <CreateButton label="Create custom" onClick={onAddEarlyDeparture} />
              ) : null}
            </div>
            <Select
              value={form.earlyDeparturePolicyId}
              disabled={!canEdit}
              onValueChange={(earlyDeparturePolicyId) =>
                setForm((prev) => ({ ...prev, earlyDeparturePolicyId }))
              }
            >
              <SelectTrigger className={WIZARD_SELECT_TRIGGER_CLASS}>
                <SelectValue>
                  {policyOptionLabel(form.earlyDeparturePolicyId, earlyDepartureOptions)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                <PolicySelectGroups options={earlyDepartureOptions} />
              </SelectContent>
            </Select>
          </div>
        </div>
      </WizardCard>
    </div>
  );
}

function packagePriceDetail(
  row: RatePlanWizardPackageOption,
  currencyCode: string,
): string {
  return formatPackagePriceDetail(row, currencyCode);
}

function packageTreatmentHelper(inclusion: PackageInclusionType): string {
  if (inclusion === "included") {
    return "Package benefits are included with this rate plan.";
  }
  return "Guests may add this package separately when booking.";
}

function Step3CatalogueActions({
  canEdit,
  createLabel,
  manageLabel,
  manageTestId,
  onCreate,
  onManage,
}: {
  canEdit: boolean;
  createLabel: string;
  manageLabel: string;
  manageTestId: string;
  onCreate: () => void;
  onManage: () => void;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-1">
      <CreateButton label={createLabel} onClick={onCreate} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-5 border-[#D9D2C4] px-1.5 text-[10px] text-[#251605] hover:bg-[#F4EDE0]"
        onClick={onManage}
        data-testid={manageTestId}
      >
        {manageLabel}
      </Button>
    </div>
  );
}

export function RatePlanWizardStep3() {
  const {
    restaurantId,
    canEdit,
    form,
    setForm,
    catalogues,
    packages,
    onAddMealPlan,
    onAddPackage,
    setFooter,
    setStep,
  } = useRatePlanWizard();
  const queryClient = useQueryClient();
  const [mealCatalogueOpen, setMealCatalogueOpen] = useState(false);
  const [packageCatalogueOpen, setPackageCatalogueOpen] = useState(false);

  const mealSelectValue = resolveMealPlanSelectionValue(form.mealPlanId, catalogues.mealPlans);
  const mealOptions = buildMealPlanWizardOptions(catalogues.mealPlans, mealSelectValue);
  const packageOptions = packages.filter(
    (row) => row.active || row.id === form.packageId,
  );
  const selectedPackage = packageOptions.find((row) => row.id === form.packageId);
  const packageSelected = Boolean(form.packageId && form.packageId !== RATE_PLAN_NONE);

  useEffect(() => {
    setFooter({
      continueLabel: "Continue",
      onContinue: () => setStep(4),
    });
    return () => setFooter(null);
  }, [setFooter, setStep]);

  function refreshCatalogues() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-meals", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card2-rates", restaurantId] });
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#756A5B]">
        Meal plans and packages are optional for this rate plan.
      </p>

      <WizardCard
        title="Meal Plan"
        description="Select a standard NORU meal plan or a custom plan created for this property."
        action={
          <Step3CatalogueActions
            canEdit={canEdit}
            createLabel="Create custom"
            manageLabel="Manage catalogue"
            manageTestId="rate-plan-manage-meal-catalogue"
            onCreate={onAddMealPlan}
            onManage={() => setMealCatalogueOpen(true)}
          />
        }
      >
        <Select
          value={mealSelectValue}
          disabled={!canEdit}
          onValueChange={(mealPlanId) => setForm((prev) => ({ ...prev, mealPlanId }))}
        >
          <SelectTrigger className={WIZARD_SELECT_TRIGGER_CLASS}>
            <SelectValue>
              {policyOptionLabel(mealSelectValue, mealOptions, "Room Only")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-[100] rounded-[6px]">
            <PolicySelectGroups
              options={mealOptions}
              noruLabel="NORU Meal Plans"
              customLabel="Custom Meal Plans"
            />
          </SelectContent>
        </Select>
      </WizardCard>

      <WizardCard
        title="Package"
        description="Select a reusable package from Package Master, or create a custom package."
        action={
          <Step3CatalogueActions
            canEdit={canEdit}
            createLabel="Create custom"
            manageLabel="Manage packages"
            manageTestId="rate-plan-manage-packages"
            onCreate={onAddPackage}
            onManage={() => setPackageCatalogueOpen(true)}
          />
        }
      >
        <Select
          value={form.packageId}
          disabled={!canEdit}
          onValueChange={(packageId) => setForm((prev) => ({ ...prev, packageId }))}
        >
          <SelectTrigger className={WIZARD_SELECT_TRIGGER_CLASS}>
            <SelectValue>
              {selectedPackage?.name ?? staffName(form.packageId, packageOptions, "None")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-[100] rounded-[6px]">
            <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
            {packageOptions.map((row) => (
              <SelectItem key={row.id} value={row.id} className="items-start py-2">
                <div className="flex flex-col gap-0.5">
                  <span>{row.name}</span>
                  <span className="text-[10px] font-normal text-[#8A7963]">
                    {packagePriceDetail(row, catalogues.currencyCode)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {packageSelected ? (
          <div className="mt-3 space-y-1.5" data-testid="rate-plan-package-treatment">
            <Label className="text-[11px] font-medium text-[#5C5346]">Package treatment</Label>
            <Select
              value={form.packageInclusionType}
              disabled={!canEdit}
              onValueChange={(next) =>
                setForm((prev) => ({
                  ...prev,
                  packageInclusionType: next as PackageInclusionType,
                }))
              }
            >
              <SelectTrigger className={WIZARD_SELECT_TRIGGER_CLASS}>
                <SelectValue>
                  {PACKAGE_INCLUSION_TYPE_LABELS[form.packageInclusionType]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100] rounded-[6px]">
                {PACKAGE_INCLUSION_TYPES.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {PACKAGE_INCLUSION_TYPE_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#756A5B]">
              {packageTreatmentHelper(form.packageInclusionType)}
            </p>
          </div>
        ) : null}
      </WizardCard>

      {/* Nested Meal Plan catalogue — Rate Plan wizard stays mounted underneath */}
      <Dialog open={mealCatalogueOpen} onOpenChange={setMealCatalogueOpen}>
        <DialogContent
          overlayClassName="bg-[#1F140A]/60 z-[70]"
          className="z-[80] flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl sm:max-w-none"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-[#EDE6D8] bg-white px-5 py-3 text-left">
            <DialogTitle className="font-display text-base text-[#251605]">
              Manage Meal Plan Catalogue
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Add or edit meal plans for this property. Your rate plan selections stay preserved
              underneath.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PmsPropertySetupCard3Meals
              restaurantId={restaurantId}
              canEdit={canEdit}
              embedded
              catalogueMode="meals"
              onMealPlanCreated={(mealPlanId) => {
                setForm((prev) => ({ ...prev, mealPlanId }));
                refreshCatalogues();
                setMealCatalogueOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested Package catalogue — Rate Plan wizard stays mounted underneath */}
      <Dialog open={packageCatalogueOpen} onOpenChange={setPackageCatalogueOpen}>
        <DialogContent
          overlayClassName="bg-[#1F140A]/60 z-[70]"
          className="z-[80] flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl sm:max-w-none"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-[#EDE6D8] bg-white px-5 py-3 text-left">
            <DialogTitle className="font-display text-base text-[#251605]">
              Manage Packages
            </DialogTitle>
            <DialogDescription className="text-xs text-[#756A5B]">
              Add or edit packages for this property. Your rate plan selections stay preserved
              underneath.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PmsPropertySetupCard3Meals
              restaurantId={restaurantId}
              canEdit={canEdit}
              embedded
              catalogueMode="packages"
              onPackageCreated={(packageId) => {
                setForm((prev) => ({ ...prev, packageId }));
                refreshCatalogues();
                setPackageCatalogueOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RatePlanWizardStep4() {
  const { canEdit, form, setForm, setFooter, setStep } = useRatePlanWizard();

  useEffect(() => {
    setFooter({
      continueLabel: "Continue",
      onContinue: () => setStep(5),
    });
    return () => setFooter(null);
  }, [setFooter, setStep]);

  return (
    <div className="space-y-3">
      <WizardCard title="Availability & Restrictions">
        <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2.5">
          <div>
            <Label htmlFor="rpw-active">Active</Label>
            <p className="text-[11px] text-[#756A5B]">Active rate plans are available for sale.</p>
          </div>
          <Switch
            id="rpw-active"
            checked={form.active}
            disabled={!canEdit}
            onCheckedChange={(active) => setForm((prev) => ({ ...prev, active, sellable: active }))}
          />
        </div>
        <p className="mt-2 text-[11px] text-[#5C5346]">
          Available for sale:{" "}
          <span className="font-semibold text-[#251605]">{form.active ? "Yes" : "No"}</span>
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rpw-min-stay">Minimum stay</Label>
            <Input
              id="rpw-min-stay"
              type="number"
              min={1}
              step={1}
              placeholder="No minimum"
              value={form.minStayNights}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, minStayNights: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rpw-max-stay">Maximum stay</Label>
            <Input
              id="rpw-max-stay"
              type="number"
              min={1}
              step={1}
              placeholder="No maximum"
              value={form.maxStayNights}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxStayNights: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rpw-min-advance">Minimum advance booking</Label>
            <Input
              id="rpw-min-advance"
              type="number"
              min={0}
              step={1}
              placeholder="No minimum"
              value={form.minAdvanceDays}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, minAdvanceDays: event.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">Days before arrival.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rpw-max-advance">Maximum advance booking</Label>
            <Input
              id="rpw-max-advance"
              type="number"
              min={0}
              step={1}
              placeholder="No maximum"
              value={form.maxAdvanceDays}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxAdvanceDays: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2.5">
            <Label htmlFor="rpw-cta">Closed to Arrival</Label>
            <Switch
              id="rpw-cta"
              checked={form.closedToArrival}
              disabled={!canEdit}
              onCheckedChange={(closedToArrival) =>
                setForm((prev) => ({ ...prev, closedToArrival }))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2.5">
            <Label htmlFor="rpw-ctd">Closed to Departure</Label>
            <Switch
              id="rpw-ctd"
              checked={form.closedToDeparture}
              disabled={!canEdit}
              onCheckedChange={(closedToDeparture) =>
                setForm((prev) => ({ ...prev, closedToDeparture }))
              }
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rpw-rest-from">Valid from</Label>
            <Input
              id="rpw-rest-from"
              type="date"
              value={form.restrictionValidFrom}
              disabled={!canEdit}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, restrictionValidFrom: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rpw-rest-to">Valid to</Label>
              <label className="flex items-center gap-2 text-xs text-[#251605]">
                <input
                  type="checkbox"
                  checked={form.restrictionNoEndDate}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      restrictionNoEndDate: event.target.checked,
                      restrictionValidTo: event.target.checked ? "" : prev.restrictionValidTo,
                    }))
                  }
                />
                No end date
              </label>
            </div>
            <Input
              id="rpw-rest-to"
              type="date"
              value={form.restrictionNoEndDate ? "" : form.restrictionValidTo}
              disabled={!canEdit || form.restrictionNoEndDate}
              className={WIZARD_CONTROL_CLASS}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  restrictionValidTo: event.target.value,
                  restrictionNoEndDate: false,
                }))
              }
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Stay and arrival/departure restrictions apply on this Rate Plan for the dates above.
          Leave stay fields blank for no minimum or no maximum.
        </p>
      </WizardCard>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function ReviewSection({
  title,
  step,
  children,
}: {
  title: string;
  step: RatePlanWizardStepId;
  children: React.ReactNode;
}) {
  const { setStep } = useRatePlanWizard();
  return (
    <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
          onClick={() => setStep(step)}
        >
          <Edit2 className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  );
}

export function RatePlanWizardStep5() {
  const { form, catalogues, packages, pendingSave, completeSetup, setFooter } = useRatePlanWizard();

  const category = catalogues.categories.find((row) => row.id === form.categoryId);
  const roomType = catalogues.roomTypes.find((row) => row.id === form.roomTypeId);
  const cancellationOptions = buildCancellationWizardOptions(
    catalogues.cancellationPolicies,
    form.cancellationPolicyId,
  );
  const noShowOptions = buildNoShowWizardOptions(
    catalogues.noShowPolicies,
    form.noShowPolicyId,
  );
  const depositOptions = buildDepositWizardOptions(
    catalogues.depositPolicies,
    form.depositPolicyId,
  );
  const earlyOptions = buildEarlyDepartureWizardOptions(
    catalogues.earlyDeparturePolicies,
    form.earlyDeparturePolicyId,
  );
  const refundKind = derivedCancellationKindFromSelection(
    form.cancellationPolicyId,
    catalogues.cancellationPolicies,
  );
  const mealSelectValue = resolveMealPlanSelectionValue(form.mealPlanId, catalogues.mealPlans);
  const mealOptions = buildMealPlanWizardOptions(catalogues.mealPlans, mealSelectValue);
  const pkg = packages.find((row) => row.id === form.packageId);
  const packageSelected = Boolean(form.packageId && form.packageId !== RATE_PLAN_NONE);

  useEffect(() => {
    setFooter({
      continueLabel: "Complete Rate Plan Setup",
      continueBusy: pendingSave,
      continueDisabled: pendingSave || !form.categoryId || !form.roomTypeId,
      onContinue: completeSetup,
    });
    return () => setFooter(null);
  }, [setFooter, completeSetup, pendingSave, form.categoryId, form.roomTypeId]);

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">Review & Complete</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Confirm the rate plan before completing. Use Edit to return to any step.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReviewSection title="Rate Plan" step={1}>
          <ReviewRow label="Name" value={form.name || "—"} />
          <ReviewRow label="Code" value={form.code || "—"} />
          <ReviewRow
            label="Category"
            value={
              category ? categoryStaffLabel(category.code, category.name) : "—"
            }
          />
          <ReviewRow label="Room Type" value={roomType?.name ?? "—"} />
          <ReviewRow
            label="Validity"
            value={formatWizardValidity(
              form.validFrom || null,
              form.noEndDate ? null : form.validTo || null,
            )}
          />
        </ReviewSection>

        <ReviewSection title="Price Summary" step={1}>
          <ReviewRow
            label="Room rate"
            value={`${formatRatePlanMoney(catalogues.currencyCode, form.baseRate)} / night`}
          />
          {packageSelected && pkg && form.packageInclusionType === "included" ? (
            <>
              <ReviewRow
                label={pkg.name}
                value={packagePriceDetail(pkg, catalogues.currencyCode)}
              />
              <ReviewRow
                label="Package treatment"
                value={PACKAGE_INCLUSION_TYPE_LABELS.included}
              />
              <div className="mt-2 flex justify-between gap-3 border-t border-[#EDE6D8] pt-2.5">
                <span className="text-xs font-semibold text-[#251605]">
                  1-night starting total
                </span>
                <span
                  className="text-right text-sm font-semibold tabular-nums text-[#251605]"
                  data-testid="rate-plan-review-starting-total"
                >
                  {formatRatePlanMoney(
                    catalogues.currencyCode,
                    oneNightStartingTotal(form.baseRate, pkg.packagePrice),
                  )}
                </span>
              </div>
              <p className="pt-1 text-[11px] text-[#756A5B]">
                Final booking total depends on stay length and package charge basis.
              </p>
            </>
          ) : null}
          {packageSelected && pkg && form.packageInclusionType === "optional" ? (
            <>
              <ReviewRow
                label="Optional add-on"
                value={`${pkg.name} · ${packagePriceDetail(pkg, catalogues.currencyCode)}`}
              />
              <div className="mt-2 flex justify-between gap-3 border-t border-[#EDE6D8] pt-2.5">
                <span className="text-xs font-semibold text-[#251605]">Starting room rate</span>
                <span
                  className="text-right text-sm font-semibold tabular-nums text-[#251605]"
                  data-testid="rate-plan-review-starting-room-rate"
                >
                  {`${formatRatePlanMoney(catalogues.currencyCode, form.baseRate)} / night`}
                </span>
              </div>
            </>
          ) : null}
          <ReviewRow label="Currency" value={currencyDisplayLabel(catalogues.currencyCode)} />
          <ReviewRow label="Included occupancy" value={form.includedOccupancy.trim() || "—"} />
          <ReviewRow
            label="Extra adult"
            value={
              form.extraAdultRate.trim()
                ? `${catalogues.currencyCode} ${form.extraAdultRate}`
                : "—"
            }
          />
          <ReviewRow
            label="Extra child"
            value={
              form.extraChildRate.trim()
                ? `${catalogues.currencyCode} ${form.extraChildRate}`
                : "—"
            }
          />
        </ReviewSection>

        <ReviewSection title="Policies" step={2}>
          <ReviewRow
            label="Cancellation"
            value={policyOptionLabel(form.cancellationPolicyId, cancellationOptions)}
          />
          <ReviewRow
            label="Deposit"
            value={policyOptionLabel(form.depositPolicyId, depositOptions)}
          />
          <ReviewRow
            label="No-show"
            value={policyOptionLabel(form.noShowPolicyId, noShowOptions)}
          />
          <ReviewRow
            label="Early departure"
            value={policyOptionLabel(form.earlyDeparturePolicyId, earlyOptions)}
          />
          <ReviewRow label="Refundability" value={derivedRefundabilityLabel(refundKind)} />
        </ReviewSection>

        <ReviewSection title="Meals & Packages" step={3}>
          <ReviewRow
            label="Meal Plan"
            value={policyOptionLabel(mealSelectValue, mealOptions, "Room Only")}
          />
          <ReviewRow label="Package" value={pkg?.name ?? "None"} />
          {packageSelected ? (
            <ReviewRow
              label="Treatment"
              value={PACKAGE_INCLUSION_TYPE_LABELS[form.packageInclusionType]}
            />
          ) : null}
        </ReviewSection>

        <ReviewSection title="Availability & Restrictions" step={4}>
          <ReviewRow label="Status" value={form.active ? "Active" : "Inactive"} />
          <ReviewRow label="Available for sale" value={form.active ? "Yes" : "No"} />
          <ReviewRow
            label="Minimum stay"
            value={formatStaySummary(form.minStayNights, form.maxStayNights).minimum}
          />
          <ReviewRow
            label="Maximum stay"
            value={formatStaySummary(form.minStayNights, form.maxStayNights).maximum}
          />
          <ReviewRow
            label="Advance booking"
            value={formatAdvanceBookingSummary(form.minAdvanceDays, form.maxAdvanceDays)}
          />
          <ReviewRow label="Closed to Arrival" value={form.closedToArrival ? "Yes" : "No"} />
          <ReviewRow label="Closed to Departure" value={form.closedToDeparture ? "Yes" : "No"} />
        </ReviewSection>
      </div>
    </div>
  );
}
