import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info, ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import {
  PropertySetupField,
  PropertySetupFormGrid,
} from "@/packages/pms/components/settings/setup-kit";
import { cn } from "@/shared/lib/utils";
import { saveRoomType } from "@/packages/pms/lib/rooms.functions";
import { parseOptionalMoney } from "./room-type-wizard-types";
import { useRoomTypeWizard } from "./room-type-wizard-context";

export function RoomTypeWizardStep2Pricing() {
  const {
    restaurantId,
    canEdit,
    roomTypeId,
    typeForm,
    setTypeForm,
    attemptedStep2Submit,
    setAttemptedStep2Submit,
    setStep,
  } = useRoomTypeWizard();
  const disabled = !canEdit || !roomTypeId;
  const saveTypeFn = useServerFn(saveRoomType);
  const [saving, setSaving] = useState(false);

  const standardOccupancyRef = useRef<HTMLInputElement>(null);
  const baseRateRef = useRef<HTMLInputElement>(null);
  const extraAdultRef = useRef<HTMLInputElement>(null);
  const extraChildRef = useRef<HTMLInputElement>(null);

  // Validation
  const includedOccupancyInvalid =
    typeForm.standardOccupancy < 1 || typeForm.standardOccupancy > typeForm.maxOccupancy;

  const baseRateNum = typeForm.baseNightlyRate.trim() ? Number(typeForm.baseNightlyRate) : null;
  const baseRateInvalid = baseRateNum !== null && (isNaN(baseRateNum) || baseRateNum < 0);

  const extraAdultNum = typeForm.extraAdultRateDefault.trim()
    ? Number(typeForm.extraAdultRateDefault)
    : null;
  const extraAdultInvalid = extraAdultNum !== null && (isNaN(extraAdultNum) || extraAdultNum < 0);

  const extraChildNum = typeForm.extraChildRateDefault.trim()
    ? Number(typeForm.extraChildRateDefault)
    : null;
  const extraChildInvalid = extraChildNum !== null && (isNaN(extraChildNum) || extraChildNum < 0);

  const hasErrors =
    includedOccupancyInvalid || baseRateInvalid || extraAdultInvalid || extraChildInvalid;

  const includedOccupancyHasError = attemptedStep2Submit && includedOccupancyInvalid;
  const baseRateHasError =
    (attemptedStep2Submit || typeForm.baseNightlyRate.trim() !== "") && baseRateInvalid;
  const extraAdultHasError =
    (attemptedStep2Submit || typeForm.extraAdultRateDefault.trim() !== "") && extraAdultInvalid;
  const extraChildHasError =
    (attemptedStep2Submit || typeForm.extraChildRateDefault.trim() !== "") && extraChildInvalid;

  async function saveAndContinue() {
    setAttemptedStep2Submit(true);
    if (!roomTypeId) {
      toast.error("Save the room type in Step 1 first.");
      return;
    }
    if (includedOccupancyInvalid) {
      standardOccupancyRef.current?.focus();
      toast.error(
        `Included Occupancy must be between 1 and Maximum Occupancy (${typeForm.maxOccupancy}).`,
      );
      return;
    }
    if (hasErrors) {
      if (baseRateInvalid) baseRateRef.current?.focus();
      else if (extraAdultInvalid) extraAdultRef.current?.focus();
      else if (extraChildInvalid) extraChildRef.current?.focus();
      toast.error("Please resolve pricing validation errors before continuing.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveTypeFn({
        data: {
          restaurantId,
          id: roomTypeId,
          code: typeForm.code.trim(),
          name: typeForm.name.trim(),
          shortName: typeForm.shortName.trim() || null,
          displayName: typeForm.displayName.trim() || null,
          description: typeForm.description.trim() || null,
          category: typeForm.category.trim() || null,
          class: typeForm.class.trim() || null,
          standardOccupancy: typeForm.standardOccupancy,
          maxOccupancy: typeForm.maxOccupancy,
          adultCapacity: typeForm.adultCapacity,
          childCapacity: typeForm.childCapacity,
          infantCapacity: typeForm.infantCapacity,
          extraGuestAllowed: typeForm.extraGuestAllowed,
          extraBedAllowed: typeForm.extraBedAllowed,
          connectingEligible: typeForm.connectingEligible,
          accessibleEligible: typeForm.accessibleEligible,
          smokingPolicy: typeForm.smokingPolicy,
          roomSize: typeForm.roomSize.trim() || null,
          roomView: typeForm.roomView.trim() || null,
          sellable: typeForm.sellable,
          active: typeForm.active,
          defaultBuildingId: typeForm.defaultBuildingId || null,
          defaultWingId: typeForm.defaultWingId || null,
          preferredFloorId: typeForm.preferredFloorId || null,
          beds: typeForm.beds
            .filter((row) => row.bedType.trim())
            .map((row) => ({
              bedType: row.bedType.trim(),
              bedSize: row.bedSize.trim() || null,
              numberOfBeds: row.numberOfBeds,
            })),
          baseNightlyRate: parseOptionalMoney(typeForm.baseNightlyRate),
          extraAdultRateDefault: parseOptionalMoney(typeForm.extraAdultRateDefault),
          extraChildRateDefault: parseOptionalMoney(typeForm.extraChildRateDefault),
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Pricing defaults saved");
      setStep(3);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-20">
      {/* SECTION A: Pricing Defaults */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">Pricing Defaults</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Default base rate for{" "}
            <span className="font-medium text-[#251605]">
              {typeForm.name || "Room Type"}
              {typeForm.code ? ` (${typeForm.code})` : ""}
            </span>
            . Used as the starting suggestion when creating Rate Plans.
          </p>
        </div>

        <div className="mt-4 max-w-md">
          <PropertySetupField
            label="Base Nightly Price"
            helper="Suggested base value used when creating Rate Plans."
            error={baseRateHasError ? "Enter a valid positive amount." : undefined}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-muted-foreground">
                ETB
              </span>
              <Input
                ref={baseRateRef}
                disabled={disabled}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className={cn(
                  "pl-12 transition-colors",
                  baseRateHasError &&
                    "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                )}
                aria-invalid={baseRateHasError ? true : undefined}
                value={typeForm.baseNightlyRate}
                onChange={(e) =>
                  setTypeForm((prev) => ({ ...prev, baseNightlyRate: e.target.value }))
                }
              />
            </div>
          </PropertySetupField>
        </div>
      </section>

      {/* SECTION B: Occupancy Pricing */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h3 className="font-display text-base font-semibold text-[#251605]">Occupancy Pricing</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure how many guests are included in base rates and specify extra-person surcharge
            defaults.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <PropertySetupFormGrid>
            <PropertySetupField
              label="Included Occupancy *"
              error={
                includedOccupancyHasError
                  ? `✕ Included Occupancy cannot exceed Maximum Occupancy (${typeForm.maxOccupancy}).`
                  : undefined
              }
            >
              <Input
                ref={standardOccupancyRef}
                type="number"
                min="1"
                max={typeForm.maxOccupancy}
                disabled={disabled}
                value={typeForm.standardOccupancy}
                className={cn(
                  "transition-colors",
                  includedOccupancyHasError &&
                    "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                )}
                aria-invalid={includedOccupancyHasError ? true : undefined}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    standardOccupancy: Number(e.target.value) || 0,
                  }))
                }
              />
            </PropertySetupField>

            <PropertySetupField
              label="Extra Adult Default"
              error={extraAdultHasError ? "Enter a valid positive amount." : undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-muted-foreground">
                  ETB
                </span>
                <Input
                  ref={extraAdultRef}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={disabled}
                  placeholder="0.00"
                  className={cn(
                    "pl-12 transition-colors",
                    extraAdultHasError &&
                      "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                  )}
                  aria-invalid={extraAdultHasError ? true : undefined}
                  value={typeForm.extraAdultRateDefault}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTypeForm((prev) => ({
                      ...prev,
                      extraAdultRateDefault: val,
                      ...(val.trim() && !prev.extraGuestAllowed ? { extraGuestAllowed: true } : {}),
                    }));
                  }}
                />
              </div>
            </PropertySetupField>

            <PropertySetupField
              label="Extra Child Default"
              error={extraChildHasError ? "Enter a valid positive amount." : undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-muted-foreground">
                  ETB
                </span>
                <Input
                  ref={extraChildRef}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={disabled}
                  placeholder="0.00"
                  className={cn(
                    "pl-12 transition-colors",
                    extraChildHasError &&
                      "border-red-500 ring-1 ring-red-500 focus-visible:ring-red-500 bg-red-50/10",
                  )}
                  aria-invalid={extraChildHasError ? true : undefined}
                  value={typeForm.extraChildRateDefault}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTypeForm((prev) => ({
                      ...prev,
                      extraChildRateDefault: val,
                      ...(val.trim() && !prev.extraGuestAllowed ? { extraGuestAllowed: true } : {}),
                    }));
                  }}
                />
              </div>
            </PropertySetupField>
          </PropertySetupFormGrid>

          {/* Extra Guest Allowed Toggle */}
          <div className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="extraGuestAllowedToggle"
                  className="text-sm font-medium text-[#251605] cursor-pointer"
                >
                  Extra Guest Allowed
                </label>
                <p className="text-xs text-muted-foreground">
                  Enable extra-person pricing eligibility. Does not change Maximum Occupancy (
                  {typeForm.maxOccupancy}).
                </p>
              </div>
              <Switch
                id="extraGuestAllowedToggle"
                checked={typeForm.extraGuestAllowed}
                disabled={disabled}
                onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraGuestAllowed: v }))}
              />
            </div>
            {!typeForm.extraGuestAllowed && (
              <p className="mt-2 text-xs text-[#8A7963] bg-[#F7F4EE] rounded px-2.5 py-1.5 border border-[#E6DFD3]">
                Extra-person pricing is currently disabled. Previously configured surcharge values
                remain stored but inactive.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* SECTION C: Pricing Authority Explanation Card */}
      <div className="flex items-start gap-3 rounded-xl border border-[#D9D2C4] bg-[#F7F4EE] p-4 text-xs text-[#5C4528]">
        <Info className="h-4 w-4 shrink-0 text-[#C89933] mt-0.5" />
        <div>
          <p className="font-semibold text-[#251605]">Pricing Architecture Note</p>
          <p className="mt-0.5 leading-relaxed">
            These values are Room Type baseline defaults. Rate Plans remain the live pricing
            authority across all distribution channels, seasons, and front-desk reservations.
          </p>
        </div>
      </div>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D9D2C4] bg-white/95 px-6 py-3.5 backdrop-blur-xs shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
            onClick={() => setStep(1)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Room Type
          </Button>
          <Button
            type="button"
            disabled={disabled || saving || hasErrors}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium"
            onClick={() => void saveAndContinue()}
          >
            {saving ? "Saving…" : "Save & Continue to Amenities"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

export const RoomTypeWizardStep3Pricing = RoomTypeWizardStep2Pricing;
