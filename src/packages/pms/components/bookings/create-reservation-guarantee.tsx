import { Shield } from "lucide-react";

import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
  type GuaranteeMethodOption,
} from "@/packages/pms/lib/create-reservation-phase1-section7";
import { CREATE_RESERVATION_PAYMENT_TERMS_COPY } from "@/packages/pms/lib/create-reservation-phase1";
import {
  formatGuaranteeCardNumber,
  isCardGuaranteeMethod,
} from "@/packages/pms/lib/create-reservation-step4";
import { cn } from "@/shared/lib/utils";

const CONTROL =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA] disabled:text-muted-foreground";

export function CreateReservationGuarantee({
  guaranteeMethod,
  options,
  catalogueWarning,
  persistApplied,
  companyName,
  companyTerms,
  travelAgentName,
  travelAgentTerms,
  guestName,
  cardHolderName,
  cardNumber,
  cardExpiry,
  onGuaranteeMethodChange,
  onCardHolderNameChange,
  onCardNumberChange,
  onCardExpiryChange,
}: {
  guaranteeMethod: string;
  options: GuaranteeMethodOption[];
  catalogueWarning: string | null;
  persistApplied: boolean;
  companyName: string | null;
  companyTerms: string | null;
  travelAgentName: string | null;
  travelAgentTerms: string | null;
  guestName: string | null;
  cardHolderName: string;
  cardNumber: string;
  cardExpiry: string;
  onGuaranteeMethodChange: (value: string) => void;
  onCardHolderNameChange: (value: string) => void;
  onCardNumberChange: (value: string) => void;
  onCardExpiryChange: (value: string) => void;
}) {
  const hasMaster = Boolean(companyName || travelAgentName);
  const cardGuarantee = isCardGuaranteeMethod(guaranteeMethod, options);
  const displayHolder = cardHolderName || guestName || "";

  return (
    <section
      className="rounded-2xl border border-[#DDD4C5] bg-white p-3 shadow-sm"
      data-testid="create-reservation-guarantee"
    >
      <div className="flex items-start gap-2">
        <Shield className="mt-0.5 size-4 text-[#B8954F]" aria-hidden />
        <div>
          <h2 className="font-display text-base text-[#251605]">Guarantee Information</h2>
          <p className="text-[11px] text-muted-foreground">
            Select how this reservation will be guaranteed.
          </p>
        </div>
      </div>
      {/* CREATE_RESERVATION_SECTION7_SCOPE */}
      <p className="sr-only">{CREATE_RESERVATION_GUARANTEE_LABELS_ONLY}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="guarantee-method" className="text-[11px] font-medium text-[#6B5E4E]">
              Guarantee Type
            </Label>
            {/* Guarantee method — Setup tenders / cashier labels; not a payment capture. */}
            <Select value={guaranteeMethod || undefined} onValueChange={onGuaranteeMethodChange}>
              <SelectTrigger
                id="guarantee-method"
                className="h-8"
                data-testid="guarantee-method"
              >
                <SelectValue placeholder="Select guarantee type" />
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

          {cardGuarantee ? (
            <div className="space-y-2">
              {/* TODO: replace raw guarantee card inputs with tokenized payment-provider flow */}
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-[#6B5E4E]">Card Holder Name</p>
                <Input
                  className={CONTROL}
                  value={displayHolder}
                  onChange={(event) => onCardHolderNameChange(event.target.value)}
                  aria-label="Card Holder Name"
                  autoComplete="cc-name"
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_4.5rem] gap-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-[#6B5E4E]">Card Number</p>
                  <Input
                    className={CONTROL}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardNumber}
                    onChange={(event) =>
                      onCardNumberChange(formatGuaranteeCardNumber(event.target.value))
                    }
                    aria-label="Card Number"
                    placeholder="•••• •••• •••• ••••"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-[#6B5E4E]">Expiry Date</p>
                  <Input
                    className={CONTROL}
                    type="month"
                    autoComplete="cc-exp"
                    value={cardExpiry}
                    onChange={(event) => onCardExpiryChange(event.target.value)}
                    aria-label="Expiry Date"
                  />
                </div>
                <GuaranteeCvvField />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[#251605]">
                <Checkbox disabled aria-label="Save card for future stays" />
                Save card for future stays (with guest consent)
              </label>
            </div>
          ) : null}

          {catalogueWarning ? (
            <p className="text-[11px] text-amber-800" data-testid="guarantee-catalogue-warning">
              {catalogueWarning}
            </p>
          ) : null}

          {!persistApplied ? (
            <p className="text-[11px] text-amber-800" data-testid="guarantee-persist-held">
              {CREATE_RESERVATION_PERSIST_HELD_COPY}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-[#E7E0D4] bg-[#F7F4EE] px-3 py-2 text-[11px] text-[#6B5E4E]">
          {cardGuarantee ? (
            <p>
              This card will be used to guarantee the reservation. No charges will be made at this
              time unless specified by the hotel policy.
            </p>
          ) : (
            <p>{CREATE_RESERVATION_GUARANTEE_LABELS_ONLY}</p>
          )}
          {hasMaster ? (
            <div className="mt-2 space-y-1 text-[#251605]" data-testid="guarantee-payment-terms">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Payment terms
              </p>
              {companyName ? (
                <p data-testid="guarantee-company-terms">
                  Company · {companyTerms?.trim() ? companyTerms : CREATE_RESERVATION_NO_PAYMENT_TERMS}
                </p>
              ) : null}
              {travelAgentName ? (
                <p data-testid="guarantee-ta-terms">
                  Travel Agency ·{" "}
                  {travelAgentTerms?.trim() ? travelAgentTerms : CREATE_RESERVATION_NO_PAYMENT_TERMS}
                </p>
              ) : null}
              <p className="text-muted-foreground">{CREATE_RESERVATION_PAYMENT_TERMS_COPY}</p>
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground" data-testid="guarantee-payment-terms-empty">
              Payment terms appear when a Company or Travel Agency is linked.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function GuaranteeCvvField() {
  // TODO: replace raw guarantee card inputs with tokenized payment-provider flow
  // CVV is never lifted to create-page state or the reservation payload.
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-[#6B5E4E]">CVV</p>
      <Input
        className={cn(CONTROL, "tracking-widest")}
        type="password"
        inputMode="numeric"
        autoComplete="cc-csc"
        maxLength={4}
        aria-label="CVV"
        defaultValue=""
      />
    </div>
  );
}
