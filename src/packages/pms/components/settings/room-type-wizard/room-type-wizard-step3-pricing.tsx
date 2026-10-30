import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import {
  PropertySetupField,
  PropertySetupFormGrid,
} from "@/packages/pms/components/settings/setup-kit";
import { saveRoomType } from "@/packages/pms/lib/rooms.functions";
import { parseOptionalMoney } from "./room-type-wizard-types";
import { useRoomTypeWizard } from "./room-type-wizard";

export function RoomTypeWizardStep3Pricing() {
  const { restaurantId, canEdit, roomTypeId, typeForm, setTypeForm, setStep } = useRoomTypeWizard();
  const disabled = !canEdit || !roomTypeId;
  const saveTypeFn = useServerFn(saveRoomType);
  const [saving, setSaving] = useState(false);

  async function saveAndContinue() {
    if (!roomTypeId) {
      toast.error("Save the room type in Step 1 first.");
      return;
    }
    if (typeForm.standardOccupancy < 1 || typeForm.standardOccupancy > typeForm.maxOccupancy) {
      toast.error("Included Occupancy must be between 1 and Maximum Occupancy.");
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
      setStep(4);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Pricing Defaults</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Setup / reference defaults for Rate Plan create. Not live reservation pricing. Amounts use
          the property currency.{" "}
          <span className="font-medium text-[#251605]">
            {typeForm.name}
            {typeForm.code ? ` · ${typeForm.code}` : ""}
          </span>
        </p>

        <div className="mt-4">
          <PropertySetupFormGrid>
            <PropertySetupField label="Base Nightly Price">
              <Input
                disabled={disabled}
                inputMode="decimal"
                placeholder="Optional"
                value={typeForm.baseNightlyRate}
                onChange={(e) =>
                  setTypeForm((prev) => ({ ...prev, baseNightlyRate: e.target.value }))
                }
              />
            </PropertySetupField>
            <PropertySetupField label="Included Occupancy in Base Rate">
              <Input
                type="number"
                disabled={disabled}
                value={typeForm.standardOccupancy}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    standardOccupancy: Number(e.target.value) || 0,
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be ≥ 1 and ≤ Maximum Occupancy ({typeForm.maxOccupancy}). Confirm legacy values
                as pricing policy.
              </p>
            </PropertySetupField>
            <PropertySetupField label="Extra Adult Default">
              <Input
                disabled={disabled}
                inputMode="decimal"
                placeholder="NULL = not configured · 0 = free"
                value={typeForm.extraAdultRateDefault}
                onChange={(e) =>
                  setTypeForm((prev) => ({ ...prev, extraAdultRateDefault: e.target.value }))
                }
              />
            </PropertySetupField>
            <PropertySetupField label="Extra Child Default">
              <Input
                disabled={disabled}
                inputMode="decimal"
                placeholder="NULL = not configured · 0 = free"
                value={typeForm.extraChildRateDefault}
                onChange={(e) =>
                  setTypeForm((prev) => ({ ...prev, extraChildRateDefault: e.target.value }))
                }
              />
            </PropertySetupField>
          </PropertySetupFormGrid>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <Switch
              checked={typeForm.extraGuestAllowed}
              disabled={disabled}
              onCheckedChange={(v) => setTypeForm((prev) => ({ ...prev, extraGuestAllowed: v }))}
            />
            Extra Guest Allowed (surcharge eligibility — does not change Maximum Occupancy)
          </label>
        </div>
      </section>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(2)}>
          Back
        </Button>
        <Button type="button" disabled={disabled || saving} onClick={() => void saveAndContinue()}>
          {saving ? "Saving…" : "Save & continue to Photos"}
        </Button>
      </div>
    </div>
  );
}
