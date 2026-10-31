import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  computeRatePlanBaseFromDefaults,
  roomTypeBaseIsConfigured,
  type RatePlanPricingMethod,
} from "@/packages/pms/lib/rate-plan-from-defaults";
import { computeFinalNightlyRate } from "@/packages/pms/lib/occupancy-allocation";

export type RatePlanPricingTypeRef = {
  name: string;
  code: string;
  baseNightlyRate: number | null;
  standardOccupancy: number;
  extraAdultRateDefault: number | null;
  extraChildRateDefault: number | null;
  maxOccupancy?: number | null;
};

export function parseOptionalMoneyField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseOptionalIncludedField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function RatePlanPricingSetup({
  canEdit,
  isCreate,
  selectedType,
  savedBaseRate,
  pricingMethod,
  methodPercent,
  baseRate,
  includedOccupancy,
  extraAdultRate,
  extraChildRate,
  onPricingMethodChange,
  onPercentChange,
  onBaseRateChange,
  onIncludedChange,
  onExtraAdultChange,
  onExtraChildChange,
  onRecalculateFromType,
}: {
  canEdit: boolean;
  isCreate: boolean;
  selectedType: RatePlanPricingTypeRef | undefined;
  savedBaseRate?: number;
  pricingMethod: RatePlanPricingMethod;
  methodPercent: number;
  baseRate: number;
  includedOccupancy: string;
  extraAdultRate: string;
  extraChildRate: string;
  onPricingMethodChange: (method: RatePlanPricingMethod) => void;
  onPercentChange: (percent: number) => void;
  onBaseRateChange: (rate: number) => void;
  onIncludedChange: (value: string) => void;
  onExtraAdultChange: (value: string) => void;
  onExtraChildChange: (value: string) => void;
  onRecalculateFromType: () => void;
}) {
  const hasTypeBase = roomTypeBaseIsConfigured(selectedType?.baseNightlyRate);
  const computed = computeRatePlanBaseFromDefaults({
    method: pricingMethod,
    roomTypeBase: selectedType?.baseNightlyRate,
    percent: methodPercent,
    fixedPrice: baseRate,
  });
  const included = parseOptionalIncludedField(includedOccupancy);
  const extraAdult = parseOptionalMoneyField(extraAdultRate);
  const extraChild = parseOptionalMoneyField(extraChildRate);
  const previewNight = computeFinalNightlyRate(baseRate, {
    adults: 3,
    children: 0,
    includedOccupancy: included,
    extraAdultRate: extraAdult,
    extraChildRate: extraChild,
  });

  return (
    <div className="space-y-3">
      {selectedType ? (
        <div className="rounded-xl border bg-[#F7F4EE] px-3 py-2 text-xs text-[#251605] space-y-1">
          <p className="font-medium">
            Room Type reference · {selectedType.name}
            {selectedType.code ? ` · ${selectedType.code}` : ""}
          </p>
          <p>Base default: {selectedType.baseNightlyRate ?? "—"}</p>
          <p>Included occupancy: {selectedType.standardOccupancy}</p>
          <p>Extra adult: {selectedType.extraAdultRateDefault ?? "—"}</p>
          <p>Extra child: {selectedType.extraChildRateDefault ?? "—"}</p>
          {!isCreate && savedBaseRate != null ? (
            <p>
              Current Rate Plan base: {savedBaseRate}
              {hasTypeBase ? ` · current Room Type base: ${selectedType.baseNightlyRate}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {isCreate ? (
        <div className="space-y-2 rounded-xl border px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">Pricing method</p>
          {(
            [
              ["use_base", "Use Room Type Base"],
              ["discount", "Discount from Room Type Base"],
              ["markup", "Markup from Room Type Base"],
              ["fixed", "Fixed Price"],
            ] as const
          ).map(([method, label]) => (
            <label key={method} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pricing-method"
                disabled={!canEdit || (method !== "fixed" && !hasTypeBase)}
                checked={pricingMethod === method}
                onChange={() => onPricingMethodChange(method)}
              />
              {label}
            </label>
          ))}
          {!hasTypeBase ? (
            <p className="text-xs text-muted-foreground">
              No Room Type base price is configured. Use Fixed Price.
            </p>
          ) : null}
          {pricingMethod === "discount" || pricingMethod === "markup" ? (
            <div className="space-y-1">
              <Label>Percent</Label>
              <Input
                type="number"
                min={0}
                value={methodPercent}
                disabled={!canEdit}
                onChange={(event) => onPercentChange(Number(event.target.value) || 0)}
              />
              {computed.ok ? (
                <p className="text-xs text-muted-foreground">
                  {computed.roomTypeBase} {computed.adjustment < 0 ? "−" : "+"}{" "}
                  {Math.abs(computed.adjustment)} = {computed.baseRate}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Method is a create-time calculator only. Only the final base rate is saved. Later Room
            Type changes do not update this Rate Plan.
          </p>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || !selectedType}
            onClick={onRecalculateFromType}
          >
            Recalculate from Room Type Defaults
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="plan-rate">Base rate</Label>
        <Input
          id="plan-rate"
          type="number"
          min={0}
          step="any"
          value={baseRate}
          disabled={!canEdit}
          onChange={(event) => onBaseRateChange(Number(event.target.value))}
        />
      </div>

      <div className="space-y-2 rounded-xl border px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">Occupancy pricing</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="plan-included">Included occupancy</Label>
            <Input
              id="plan-included"
              type="number"
              min={1}
              value={includedOccupancy}
              disabled={!canEdit}
              onChange={(event) => onIncludedChange(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-extra-adult">Extra adult</Label>
            <Input
              id="plan-extra-adult"
              type="number"
              min={0}
              step="any"
              value={extraAdultRate}
              disabled={!canEdit}
              onChange={(event) => onExtraAdultChange(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-extra-child">Extra child</Label>
            <Input
              id="plan-extra-child"
              type="number"
              min={0}
              step="any"
              value={extraChildRate}
              disabled={!canEdit}
              onChange={(event) => onExtraChildChange(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave extra rates empty if that guest type is not configured. 0 means explicitly free.
          Empty included occupancy keeps historical no-surcharge behavior.
        </p>
      </div>

      <div className="rounded-xl border px-3 py-2 text-xs space-y-1">
        <p className="font-medium text-[#251605]">Final Rate Plan summary</p>
        <p>Base rate: {baseRate}</p>
        <p>Included guests: {includedOccupancy.trim() || "not configured"}</p>
        <p>Extra adult: {extraAdultRate.trim() || "not configured"} / night</p>
        <p>Extra child: {extraChildRate.trim() || "not configured"} / night</p>
        <p className="text-muted-foreground">
          Example · 3 adults: base {baseRate} + extra {previewNight - baseRate} = {previewNight} /
          night. Server quote remains the authority.
        </p>
      </div>
    </div>
  );
}
