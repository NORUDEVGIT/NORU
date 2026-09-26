import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  ACTIVATION_NO_STACKING_NOTE,
  ACTIVATION_OVERLAP_COPY,
  ACTIVATION_PACKAGE_ONE_AT_A_TIME,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import { PACKAGE_CHARGE_BASIS_LABEL, packageComponentLabel, packageTypeLabel } from "@/packages/pms/lib/revenue/commercial-packages-ui";
import { commercialKindLabel, commercialValueLabel } from "@/packages/pms/lib/revenue/commercial-overview";
import type { PackageActivationPreview } from "@/packages/pms/lib/revenue/commercial-package-activation";
import type { PromotionActivationPreview } from "@/packages/pms/lib/revenue/commercial-promotion-activation";
import { formatHistoryMoney } from "@/packages/pms/lib/revenue/rate-history";

export function PromotionActivationReview({
  preview,
  reason,
  currency,
  roomNames,
  planNames,
  onReasonChange,
}: {
  preview: PromotionActivationPreview;
  reason: string;
  currency: string;
  roomNames: Map<string, string>;
  planNames: Map<string, string>;
  onReasonChange: (value: string) => void;
}) {
  const proposed = preview.proposedActivation;
  const money = (value: number) => formatHistoryMoney(value, currency);
  if (!proposed) {
    return <p className="text-xs text-muted-foreground">Validate this activation before review.</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Review</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Configuration review of the values that will be snapshotted. This is not a forecast.
        </p>
      </div>
      <Row label="Promotion" value={`${proposed.promotionName} (${proposed.promotionCode})`} />
      <Row label="Kind" value={commercialKindLabel(proposed.promoKind)} />
      <Row label="Value" value={commercialValueLabel(proposed.promoKind, proposed.promoValue, money)} />
      <Row label="Stay Window" value={`${proposed.validFrom} – ${proposed.validTo}`} />
      <Row label="Booking Window" value={`${proposed.bookingFrom} – ${proposed.bookingTo}`} />
      <Row label="Priority" value={String(proposed.priority)} />
      <Row
        label="Room Scope"
        value={preview.roomTypeScope.all
          ? "All eligible room types"
          : preview.roomTypeScope.effective.map((id) => roomNames.get(id) ?? id).join(", ") || `${preview.roomTypeScope.effective.length} room types`}
      />
      <Row
        label="Rate Plan Scope"
        value={preview.ratePlanScope.all
          ? "All eligible rate plans"
          : preview.ratePlanScope.effective.map((id) => planNames.get(id) ?? id).join(", ") || `${preview.ratePlanScope.effective.length} rate plans`}
      />
      {preview.warnings.length > 0 ? (
        <p className="text-[11px] text-amber-800">{ACTIVATION_OVERLAP_COPY}</p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">{ACTIVATION_NO_STACKING_NOTE}</p>
      <ReasonField value={reason} onChange={onReasonChange} />
    </div>
  );
}

export function PackageActivationReview({
  preview,
  reason,
  currency,
  roomNames,
  planNames,
  onReasonChange,
}: {
  preview: PackageActivationPreview;
  reason: string;
  currency: string;
  roomNames: Map<string, string>;
  planNames: Map<string, string>;
  onReasonChange: (value: string) => void;
}) {
  const proposed = preview.proposedActivation;
  const money = (value: number) => formatHistoryMoney(value, currency);
  if (!proposed) {
    return <p className="text-xs text-muted-foreground">Validate this activation before review.</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Review</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Configuration review of the values that will be snapshotted. This is not a forecast.
        </p>
      </div>
      <Row label="Package" value={`${proposed.packageName} (${proposed.packageCode})`} />
      <Row label="Type" value={packageTypeLabel(proposed.packageType)} />
      <Row label="Configured Price" value={money(proposed.packagePrice)} />
      <Row label="Charge Basis" value={PACKAGE_CHARGE_BASIS_LABEL} />
      <Row label="Stay Window" value={`${proposed.validFrom} – ${proposed.validTo}`} />
      <Row
        label="Room Scope"
        value={preview.roomTypeScope.all
          ? "All eligible room types"
          : preview.roomTypeScope.effective.map((id) => roomNames.get(id) ?? id).join(", ") || `${preview.roomTypeScope.effective.length} room types`}
      />
      <Row
        label="Rate Plan Scope"
        value={preview.ratePlanScope.all
          ? "All eligible rate plans"
          : preview.ratePlanScope.effective.map((id) => planNames.get(id) ?? id).join(", ") || `${preview.ratePlanScope.effective.length} rate plans`}
      />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Components Snapshot</p>
        {proposed.components.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No components on this package snapshot.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {proposed.components.map((component, index) => (
              <li key={`${component.componentId ?? component.label}-${index}`} className="text-xs text-[#251605]">
                {packageComponentLabel(component)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">{ACTIVATION_PACKAGE_ONE_AT_A_TIME}</p>
      <ReasonField value={reason} onChange={onReasonChange} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs text-[#251605]">{value}</p>
    </div>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason / Note</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} />
      <p className="text-[10px] text-muted-foreground">Optional. Stored on the history event.</p>
    </label>
  );
}
