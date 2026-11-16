import { useEffect, useState } from "react";
import { Edit2, Lock, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { COMMON_CURRENCIES } from "@/shared/lib/property-time";
import { formatStayDate } from "@/shared/lib/property-dates";
import {
  CANCELLATION_PENALTY_TYPE_LABELS,
  CANCELLATION_WINDOW_UNIT_LABELS,
} from "@/packages/pms/lib/cancellation-policy-rules";
import { buildNoShowPolicyPreview } from "@/packages/pms/lib/corporate-contracts.server";
import { EARLY_DEPARTURE_PENALTY_TYPE_LABELS } from "@/packages/pms/lib/early-departure-policy";
import {
  computeRatePlanBaseFromDefaults,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import { suggestRatePlanCode } from "@/packages/pms/lib/rates-card2-code";
import type {
  RateCancellationPolicyRow,
  RateEarlyDeparturePolicyRow,
  RateNoShowPolicyRow,
} from "@/packages/pms/lib/rates-card2.server";
import { useRatePlanWizard } from "./rate-plan-wizard-context";
import {
  derivedRefundabilityLabel,
  RATE_PLAN_NONE,
  type RatePlanWizardStepId,
} from "./rate-plan-wizard-types";

type Step1Field =
  | "categoryId"
  | "roomTypeId"
  | "name"
  | "code"
  | "validFrom"
  | "baseRate";

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

function CreateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
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
      Create
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

function cancellationDetail(row: RateCancellationPolicyRow): string {
  if (row.policyKind === "non_refundable") {
    return `No free cancellation · ${CANCELLATION_PENALTY_TYPE_LABELS[row.penaltyType]} after`;
  }
  const penalty =
    row.penaltyType === "percentage"
      ? `${row.penaltyValue}% of stay`
      : CANCELLATION_PENALTY_TYPE_LABELS[row.penaltyType];
  if (row.cutoffTime) {
    return `Free until same-day ${row.cutoffTime} · ${penalty} after`;
  }
  if (row.windowValue == null) {
    return `${CANCELLATION_WINDOW_UNIT_LABELS[row.windowUnit]} · ${penalty} after`;
  }
  const windowLabel =
    row.windowUnit === "days_before_arrival"
      ? `${row.windowValue} ${row.windowValue === 1 ? "day" : "days"}`
      : `${row.windowValue}h`;
  return `Free until ${windowLabel} before arrival · ${penalty} after`;
}

function noShowDetail(row: RateNoShowPolicyRow): string {
  return buildNoShowPolicyPreview(row.penaltyType, row.penaltyValue, row.releaseHour);
}

function earlyDepartureDetail(row: RateEarlyDeparturePolicyRow): string {
  return row.description?.trim() || EARLY_DEPARTURE_PENALTY_TYPE_LABELS[row.penaltyType];
}

function PolicySelectItem({
  value,
  name,
  detail,
}: {
  value: string;
  name: string;
  detail?: string;
}) {
  return (
    <SelectItem value={value} className="items-start py-2">
      <div className="flex flex-col gap-0.5">
        <span>{name}</span>
        {detail ? <span className="text-[10px] font-normal text-[#8A7963]">{detail}</span> : null}
      </div>
    </SelectItem>
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
                setForm((prev) => ({ ...prev, categoryId }));
              }}
            >
              <SelectTrigger
                className={cn(showError("categoryId", !form.categoryId) && "border-destructive")}
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
                className={cn(showError("roomTypeId", !form.roomTypeId) && "border-destructive")}
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
              className={cn(showError("name", !form.name.trim()) && "border-destructive")}
              onBlur={() => markTouched("name")}
              onChange={(event) => {
                const name = event.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  code: codeManuallyEdited ? prev.code : suggestRatePlanCode(name),
                }));
              }}
            />
            <FieldError show={showError("name", !form.name.trim())} message="Name is required." />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="rpw-code">
                Rate Plan Code <span className="text-destructive">*</span>
              </Label>
              {!codeManuallyEdited && form.code ? (
                <span className="text-[10px] text-muted-foreground">Auto from name</span>
              ) : null}
            </div>
            <Input
              id="rpw-code"
              value={form.code}
              disabled={!canEdit}
              placeholder="e.g. BAR-STD-KNG"
              className={cn(showError("code", !form.code.trim()) && "border-destructive")}
              onBlur={() => markTouched("code")}
              onChange={(event) => {
                setCodeManuallyEdited(true);
                setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }));
              }}
            />
            <FieldError show={showError("code", !form.code.trim())} message="Code is required." />
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <Label htmlFor="rpw-description">Description</Label>
          <Textarea
            id="rpw-description"
            value={form.description}
            disabled={!canEdit}
            rows={2}
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
              className={cn(showError("validFrom", !form.validFrom) && "border-destructive")}
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
          <p className="text-[11px] font-medium text-[#5C5346]">Pricing basis</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(
              [
                ["use_base", "Use Room Type Base"],
                ["discount", "Discount from Room Type Base"],
                ["markup", "Markup from Room Type Base"],
                ["fixed", "Fixed Price"],
              ] as const
            ).map(([method, label]) => {
              const selected = form.pricingMethod === method;
              const disabled = !canEdit || (method !== "fixed" && !hasTypeBase);
              return (
                <button
                  key={method}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyPricingMethod(method)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors",
                    selected
                      ? "border-[#C89933] bg-[#FBF3E0] text-[#251605] shadow-xs"
                      : "border-[#E6E1D8] bg-white text-[#5C5346] hover:border-[#D9C7A2] hover:bg-[#FBF9F5]",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                  aria-pressed={selected}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {form.pricingMethod === "discount" || form.pricingMethod === "markup" ? (
            <div className="space-y-1 pt-1">
              <Label>Percent</Label>
              <Input
                type="number"
                min={0}
                value={form.methodPercent}
                disabled={!canEdit}
                onChange={(event) =>
                  applyPricingMethod(form.pricingMethod, Number(event.target.value) || 0)
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
              className="flex h-9 items-center gap-2 rounded-md border border-[#E6E1D8] bg-[#F7F4EE] px-3 text-sm text-[#251605]"
              title="Inherited from Property & Business"
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

  const selectedCancellation = catalogues.cancellationPolicies.find(
    (row) => row.id === form.cancellationPolicyId,
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
        description="Assign policies used when this rate plan is sold."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-1">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-[#251605]">Cancellation Policy</Label>
              {canEdit ? <CreateButton onClick={onAddCancellation} /> : null}
            </div>
            <Select
              value={form.cancellationPolicyId}
              disabled={!canEdit}
              onValueChange={(cancellationPolicyId) =>
                setForm((prev) => ({ ...prev, cancellationPolicyId }))
              }
            >
              <SelectTrigger className="h-auto min-h-9 py-1.5">
                <SelectValue>
                  {staffName(form.cancellationPolicyId, catalogues.cancellationPolicies)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                {catalogues.cancellationPolicies.map((row) => (
                  <PolicySelectItem
                    key={row.id}
                    value={row.id}
                    name={row.name}
                    detail={cancellationDetail(row)}
                  />
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[#5C5346]">
              Refundability:{" "}
              <span className="font-semibold text-[#251605]">
                {derivedRefundabilityLabel(selectedCancellation?.policyKind)}
              </span>
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-[#251605]">No-Show Policy</Label>
              {canEdit ? <CreateButton onClick={onAddNoShow} /> : null}
            </div>
            <Select
              value={form.noShowPolicyId}
              disabled={!canEdit}
              onValueChange={(noShowPolicyId) => setForm((prev) => ({ ...prev, noShowPolicyId }))}
            >
              <SelectTrigger className="h-auto min-h-9 py-1.5">
                <SelectValue>
                  {staffName(form.noShowPolicyId, catalogues.noShowPolicies)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                {catalogues.noShowPolicies.map((row) => (
                  <PolicySelectItem
                    key={row.id}
                    value={row.id}
                    name={row.name}
                    detail={noShowDetail(row)}
                  />
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[#5C5346]">Deposit Policy</Label>
              {canEdit ? <CreateButton onClick={onAddDeposit} /> : null}
            </div>
            <Select
              value={form.depositPolicyId}
              disabled={!canEdit}
              onValueChange={(depositPolicyId) => setForm((prev) => ({ ...prev, depositPolicyId }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {staffName(form.depositPolicyId, catalogues.depositPolicies)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                {catalogues.depositPolicies.map((row) => (
                  <PolicySelectItem key={row.id} value={row.id} name={row.name} />
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[#5C5346]">Early Departure Policy</Label>
              {canEdit ? <CreateButton onClick={onAddEarlyDeparture} /> : null}
            </div>
            <Select
              value={form.earlyDeparturePolicyId}
              disabled={!canEdit}
              onValueChange={(earlyDeparturePolicyId) =>
                setForm((prev) => ({ ...prev, earlyDeparturePolicyId }))
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {staffName(form.earlyDeparturePolicyId, catalogues.earlyDeparturePolicies)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
                {catalogues.earlyDeparturePolicies.map((row) => (
                  <PolicySelectItem
                    key={row.id}
                    value={row.id}
                    name={row.name}
                    detail={earlyDepartureDetail(row)}
                  />
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </WizardCard>
    </div>
  );
}

export function RatePlanWizardStep3() {
  const {
    canEdit,
    form,
    setForm,
    catalogues,
    packages,
    onAddMealPlan,
    setFooter,
    setStep,
  } = useRatePlanWizard();

  useEffect(() => {
    setFooter({
      continueLabel: "Continue",
      onContinue: () => setStep(4),
    });
    return () => setFooter(null);
  }, [setFooter, setStep]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#756A5B]">
        Meal plans and packages are optional for this rate plan.
      </p>

      <WizardCard
        title="Meal Plan"
        description="Default is Room Only when no meal plan is selected."
        action={canEdit ? <CreateButton onClick={onAddMealPlan} /> : null}
      >
        <Select
          value={form.mealPlanId}
          disabled={!canEdit}
          onValueChange={(mealPlanId) => setForm((prev) => ({ ...prev, mealPlanId }))}
        >
          <SelectTrigger>
            <SelectValue>
              {staffName(form.mealPlanId, catalogues.mealPlans, "Room Only")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value={RATE_PLAN_NONE}>Room Only</SelectItem>
            {catalogues.mealPlans.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </WizardCard>

      <WizardCard
        title="Package"
        description="Optional. Select an existing package to bundle with this rate plan."
      >
        <Select
          value={form.packageId}
          disabled={!canEdit}
          onValueChange={(packageId) => setForm((prev) => ({ ...prev, packageId }))}
        >
          <SelectTrigger>
            <SelectValue>{staffName(form.packageId, packages, "None")}</SelectValue>
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value={RATE_PLAN_NONE}>None</SelectItem>
            {packages.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </WizardCard>
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
      <WizardCard title="Status & Availability">
        <div className="flex items-center justify-between rounded-lg border border-[#E6E1D8] px-3 py-2.5">
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
          Sellable:{" "}
          <span className="font-semibold text-[#251605]">{form.active ? "Yes" : "No"}</span>
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
  const cancellation = catalogues.cancellationPolicies.find(
    (row) => row.id === form.cancellationPolicyId,
  );
  const deposit = catalogues.depositPolicies.find((row) => row.id === form.depositPolicyId);
  const noShow = catalogues.noShowPolicies.find((row) => row.id === form.noShowPolicyId);
  const early = catalogues.earlyDeparturePolicies.find(
    (row) => row.id === form.earlyDeparturePolicyId,
  );
  const meal = catalogues.mealPlans.find((row) => row.id === form.mealPlanId);
  const pkg = packages.find((row) => row.id === form.packageId);

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

        <ReviewSection title="Pricing" step={1}>
          <ReviewRow
            label="Base rate"
            value={`${catalogues.currencyCode} ${form.baseRate}`}
          />
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
          <ReviewRow label="Cancellation" value={cancellation?.name ?? "None"} />
          <ReviewRow label="Deposit" value={deposit?.name ?? "None"} />
          <ReviewRow label="No-show" value={noShow?.name ?? "None"} />
          <ReviewRow label="Early departure" value={early?.name ?? "None"} />
          <ReviewRow
            label="Refundability"
            value={derivedRefundabilityLabel(cancellation?.policyKind)}
          />
        </ReviewSection>

        <ReviewSection title="Meals & Packages" step={3}>
          <ReviewRow label="Meal Plan" value={meal?.name ?? "Room Only"} />
          <ReviewRow label="Package" value={pkg?.name ?? "None"} />
        </ReviewSection>

        <ReviewSection title="Status & Availability" step={4}>
          <ReviewRow label="Status" value={form.active ? "Active" : "Inactive"} />
          <ReviewRow label="Available for sale" value={form.active ? "Yes" : "No"} />
        </ReviewSection>
      </div>
    </div>
  );
}
