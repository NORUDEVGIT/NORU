import { Info, Wallet } from "lucide-react";

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
  CREATE_RESERVATION_PERSIST_HELD_COPY,
  type GuaranteeMethodOption,
} from "@/packages/pms/lib/create-reservation-phase1-section7";
import {
  formatGuaranteeCardNumber,
  isCardGuaranteeMethod,
} from "@/packages/pms/lib/create-reservation-step4";
import { PMS_OP_INPUT, PMS_OP_SELECT_TRIGGER } from "@/packages/pms/lib/pms-operational-surface";
import { cn } from "@/shared/lib/utils";

const FIELD_LABEL = "text-xs font-medium text-[#6B5E4E]";
const PAYMENT_METHOD_NONE = "__none__";
const NORU_MENU = "z-[80] max-h-60 rounded-[6px] border-[#CCCCCC] bg-white text-sm text-[#251605]";

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
  depositReference,
  depositPaymentMethod,
  depositDueDate,
  onGuaranteeMethodChange,
  onCardHolderNameChange,
  onCardNumberChange,
  onCardExpiryChange,
  onDepositReferenceChange,
  onDepositPaymentMethodChange,
  onDepositDueDateChange,
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
  depositReference: string;
  depositPaymentMethod: string;
  depositDueDate: string;
  onGuaranteeMethodChange: (value: string) => void;
  onCardHolderNameChange: (value: string) => void;
  onCardNumberChange: (value: string) => void;
  onCardExpiryChange: (value: string) => void;
  onDepositReferenceChange: (value: string) => void;
  onDepositPaymentMethodChange: (value: string) => void;
  onDepositDueDateChange: (value: string) => void;
}) {
  const hasMaster = Boolean(companyName || travelAgentName);
  const cardGuarantee = isCardGuaranteeMethod(guaranteeMethod, options);
  const displayHolder = cardHolderName || guestName || "";

  return (
    <section
      className="h-fit rounded-[6px] border border-[#CCCCCC] bg-white p-4 shadow-none"
      data-testid="create-reservation-guarantee"
    >
      <div className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
          <Wallet className="size-3.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">Payment Information</h2>
          <p className="text-xs text-[#6B5E4E]">Review payment details for this reservation.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="guarantee-method" className={FIELD_LABEL}>
            Payment Type
          </Label>
          {/* Guarantee method — Setup tenders / cashier labels; not a payment capture. */}
          <Select
            value={guaranteeMethod || PAYMENT_METHOD_NONE}
            onValueChange={(value) =>
              onGuaranteeMethodChange(value === PAYMENT_METHOD_NONE ? "" : value)
            }
          >
            <SelectTrigger
              id="guarantee-method"
              className={PMS_OP_SELECT_TRIGGER}
              data-testid="guarantee-method"
            >
              <SelectValue placeholder="Select payment type" />
            </SelectTrigger>
            <SelectContent className={NORU_MENU}>
              <SelectItem value={PAYMENT_METHOD_NONE}>Select payment type</SelectItem>
              {options.map((option) => (
                <SelectItem key={`${option.origin}-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="payment-reference" className={FIELD_LABEL}>
            Payment Reference (Optional)
          </Label>
          <Input
            id="payment-reference"
            className={PMS_OP_INPUT}
            value={depositReference}
            maxLength={120}
            onChange={(event) => onDepositReferenceChange(event.target.value)}
            placeholder="Transaction / authorization reference"
            aria-label="Payment Reference"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit-payment-method" className={FIELD_LABEL}>
            Payment Method
          </Label>
          <Select
            value={depositPaymentMethod || PAYMENT_METHOD_NONE}
            onValueChange={(value) =>
              onDepositPaymentMethodChange(value === PAYMENT_METHOD_NONE ? "" : value)
            }
          >
            <SelectTrigger
              id="deposit-payment-method"
              className={PMS_OP_SELECT_TRIGGER}
              aria-label="Payment Method"
              data-testid="deposit-payment-method"
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className={NORU_MENU}>
              <SelectItem value={PAYMENT_METHOD_NONE}>—</SelectItem>
              <SelectItem value="same_as_guarantee">Same as payment type</SelectItem>
              {options
                .filter(
                  (option) =>
                    option.value &&
                    option.value !== "same_as_guarantee" &&
                    option.value !== PAYMENT_METHOD_NONE,
                )
                .map((option) => (
                  <SelectItem key={`deposit-${option.origin}-${option.value}`} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit-due-date" className={FIELD_LABEL}>
            Deposit Due Date
          </Label>
          <Input
            id="deposit-due-date"
            className={cn(PMS_OP_INPUT, "[color-scheme:light]")}
            type="date"
            value={depositDueDate}
            onChange={(event) => onDepositDueDateChange(event.target.value)}
            aria-label="Deposit Due Date"
          />
        </div>
      </div>

      {cardGuarantee ? (
        <div className="mt-3 space-y-2">
          {/* TODO: replace raw guarantee card inputs with tokenized payment-provider flow */}
          <div className="space-y-1">
            <p className={FIELD_LABEL}>Card Holder Name</p>
            <Input
              className={PMS_OP_INPUT}
              value={displayHolder}
              onChange={(event) => onCardHolderNameChange(event.target.value)}
              aria-label="Card Holder Name"
              autoComplete="cc-name"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_4.5rem] gap-2">
            <div className="space-y-1">
              <p className={FIELD_LABEL}>Card Number</p>
              <Input
                className={PMS_OP_INPUT}
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
              <p className={FIELD_LABEL}>Expiry Date</p>
              <Input
                className={PMS_OP_INPUT}
                type="month"
                autoComplete="cc-exp"
                value={cardExpiry}
                onChange={(event) => onCardExpiryChange(event.target.value)}
                aria-label="Expiry Date"
              />
            </div>
            <GuaranteeCvvField />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#251605]">
            <Checkbox disabled aria-label="Save card for future stays" />
            Save card for future stays (with guest consent)
          </label>
          <p className="text-xs text-[#6B5E4E]">
            This card guarantees the reservation. No charge is taken unless the hotel policy says
            so.
          </p>
        </div>
      ) : null}

      {catalogueWarning ? (
        <p className="mt-3 text-xs text-amber-800" data-testid="guarantee-catalogue-warning">
          {catalogueWarning}
        </p>
      ) : null}

      {!persistApplied ? (
        <p className="mt-3 text-xs text-amber-800" data-testid="guarantee-persist-held">
          {CREATE_RESERVATION_PERSIST_HELD_COPY}
        </p>
      ) : null}

      {hasMaster ? (
        <div className="mt-3 space-y-1" data-testid="guarantee-payment-terms">
          <p className="text-[11px] text-[#6B5E4E]">Payment Terms</p>
          {companyName ? (
            <p className="text-sm font-medium text-[#251605]" data-testid="guarantee-company-terms">
              {companyTerms?.trim()
                ? companyTerms.trim()
                : `No payment terms configured for ${companyName}`}
            </p>
          ) : null}
          {travelAgentName ? (
            <p className="text-sm font-medium text-[#251605]" data-testid="guarantee-ta-terms">
              {travelAgentTerms?.trim()
                ? travelAgentTerms.trim()
                : `No payment terms configured for ${travelAgentName}`}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-xs text-[#6B5E4E]">
        <Info className="mt-0.5 size-3.5 shrink-0 text-[#C89933]" aria-hidden />
        Payment collection is handled separately from the reservation.
      </p>
    </section>
  );
}

function GuaranteeCvvField() {
  // TODO: replace raw guarantee card inputs with tokenized payment-provider flow
  // CVV is never lifted to create-page state or the reservation payload.
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[#6B5E4E]">CVV</p>
      <Input
        className={cn(PMS_OP_INPUT, "tracking-widest")}
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
