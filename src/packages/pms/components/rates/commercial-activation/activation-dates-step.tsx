import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { PackageActivationDraft, PromotionActivationDraft } from "@/packages/pms/lib/revenue/commercial-activation-workflow";

export function PromotionDatesStep({
  draft,
  masterValidity,
  onChange,
}: {
  draft: PromotionActivationDraft;
  masterValidity?: { validFrom: string; validTo: string } | null;
  onChange: (patch: Partial<PromotionActivationDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Dates</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Stay and booking windows must be complete. Dates are not clipped to master validity.
        </p>
        {masterValidity ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Master validity {masterValidity.validFrom} – {masterValidity.validTo}.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Stay Valid From">
          <Input type="date" value={draft.validFrom} onChange={(event) => onChange({ validFrom: event.target.value })} />
        </Field>
        <Field label="Stay Valid To">
          <Input type="date" value={draft.validTo} onChange={(event) => onChange({ validTo: event.target.value })} />
        </Field>
        <Field label="Booking Window From">
          <Input type="date" value={draft.bookingFrom} onChange={(event) => onChange({ bookingFrom: event.target.value })} />
        </Field>
        <Field label="Booking Window To">
          <Input type="date" value={draft.bookingTo} onChange={(event) => onChange({ bookingTo: event.target.value })} />
        </Field>
        <Field label="Priority">
          <Input
            type="number"
            min={0}
            value={draft.priority}
            onChange={(event) => onChange({ priority: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

export function PackageDatesStep({
  draft,
  onChange,
}: {
  draft: PackageActivationDraft;
  onChange: (patch: Partial<PackageActivationDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Dates</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Package activations use a stay window only. There is no booking window in V1.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Stay Valid From">
          <Input type="date" value={draft.validFrom} onChange={(event) => onChange({ validFrom: event.target.value })} />
        </Field>
        <Field label="Stay Valid To">
          <Input type="date" value={draft.validTo} onChange={(event) => onChange({ validTo: event.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </label>
  );
}
