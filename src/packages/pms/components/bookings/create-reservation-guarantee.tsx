import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  CREATE_RESERVATION_GUARANTEE_LABELS_ONLY,
  CREATE_RESERVATION_NO_PAYMENT_TERMS,
  CREATE_RESERVATION_PERSIST_HELD_COPY,
  CREATE_RESERVATION_SECTION7_SCOPE,
  type GuaranteeMethodOption,
} from "@/packages/pms/lib/create-reservation-phase1-section7";
import { CREATE_RESERVATION_PAYMENT_TERMS_COPY } from "@/packages/pms/lib/create-reservation-phase1";

export function CreateReservationGuarantee({
  guaranteeMethod,
  options,
  catalogueWarning,
  persistApplied,
  companyName,
  companyTerms,
  travelAgentName,
  travelAgentTerms,
  onGuaranteeMethodChange,
}: {
  guaranteeMethod: string;
  options: GuaranteeMethodOption[];
  catalogueWarning: string | null;
  persistApplied: boolean;
  companyName: string | null;
  companyTerms: string | null;
  travelAgentName: string | null;
  travelAgentTerms: string | null;
  onGuaranteeMethodChange: (value: string) => void;
}) {
  const hasMaster = Boolean(companyName || travelAgentName);

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-guarantee">
      <h2 className="font-display text-lg">Guarantee</h2>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION7_SCOPE}</p>
      <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_GUARANTEE_LABELS_ONLY}</p>

      <div className="mt-3 max-w-sm space-y-1">
        <Label htmlFor="guarantee-method">Guarantee method</Label>
        <Select value={guaranteeMethod} onValueChange={onGuaranteeMethodChange}>
          <SelectTrigger id="guarantee-method" data-testid="guarantee-method">
            <SelectValue placeholder="Select guarantee method" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={`${option.origin}-${option.value}`} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {catalogueWarning ? (
        <p className="mt-2 text-xs text-amber-800" data-testid="guarantee-catalogue-warning">
          {catalogueWarning}
        </p>
      ) : null}

      {hasMaster ? (
        <div className="mt-3 space-y-1 text-sm" data-testid="guarantee-payment-terms">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment terms</p>
          {companyName ? (
            <p data-testid="guarantee-company-terms">
              Company · {companyTerms?.trim() ? companyTerms : CREATE_RESERVATION_NO_PAYMENT_TERMS}
            </p>
          ) : null}
          {travelAgentName ? (
            <p data-testid="guarantee-ta-terms">
              Travel Agency · {travelAgentTerms?.trim() ? travelAgentTerms : CREATE_RESERVATION_NO_PAYMENT_TERMS}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{CREATE_RESERVATION_PAYMENT_TERMS_COPY}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="guarantee-payment-terms-empty">
          Payment terms appear when a Company or Travel Agency is linked.
        </p>
      )}

      {!persistApplied ? (
        <p className="mt-3 text-xs text-amber-800" data-testid="guarantee-persist-held">
          {CREATE_RESERVATION_PERSIST_HELD_COPY}
        </p>
      ) : null}
    </section>
  );
}
