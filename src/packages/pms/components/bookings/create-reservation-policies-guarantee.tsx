import { Ban, CalendarDays, CircleDollarSign, Info, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import type { GuaranteeMethodOption } from "@/packages/pms/lib/create-reservation-phase1-section7";
import {
  computeDepositRequirementAmount,
  type DepositComputeQuote,
} from "@/packages/pms/lib/create-reservation-step4";
import { PMS_OP_INPUT, PMS_OP_SELECT_TRIGGER } from "@/packages/pms/lib/pms-operational-surface";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DEPOSIT_POLICY_TYPE_LABELS,
  type DepositPolicyCard3Row,
} from "@/packages/pms/lib/payments-card3";
import { cn } from "@/shared/lib/utils";

export type CreateReservationPoliciesState = {
  depositDueDate: string;
  depositPaymentMethod: string;
  depositReference: string;
  cancelPolicyMode: "hotel" | "different";
  cancelPolicyCode: string;
  ackInformed: boolean;
  ackConsent: boolean;
  ackNonRefundable: boolean;
  ackSpecialTerms: boolean;
  cardHolderName: string;
  cardNumber: string;
  cardExpiry: string;
  paymentReceivedAmount: string;
  paymentReceivedTender: string;
  paymentReceivedReference: string;
  guestDepositAmount: string;
  guestDepositTender: string;
  guestDepositReference: string;
};

export const EMPTY_CREATE_RESERVATION_POLICIES: CreateReservationPoliciesState = {
  depositDueDate: "",
  depositPaymentMethod: "",
  depositReference: "",
  cancelPolicyMode: "hotel",
  cancelPolicyCode: "",
  ackInformed: false,
  ackConsent: false,
  ackNonRefundable: false,
  ackSpecialTerms: false,
  cardHolderName: "",
  cardNumber: "",
  cardExpiry: "",
  paymentReceivedAmount: "",
  paymentReceivedTender: "",
  paymentReceivedReference: "",
  guestDepositAmount: "",
  guestDepositTender: "",
  guestDepositReference: "",
};

export function CreateReservationPoliciesGuarantee({
  guarantee,
  money,
  depositQuote,
  ratePlanDepositPolicy,
  ratePlanDepositLabel,
  cancellationName,
  cancellationDetail,
  refundabilityLabel,
  refundabilityNonRefundable,
  ratePlanNoShowLabel,
  ratePlanNoShowPenalty,
  ratePlanEarlyDepartureName,
  ratePlanEarlyDeparturePenalty,
  refundabilityKind,
  depositBasisNote = null,
  depositAmountKnown = true,
  sharedPolicyNote = null,
  roomPolicyRows = null,
  tenderOptions,
  paymentReceivedAmount,
  paymentReceivedTender,
  paymentReceivedReference,
  guestDepositAmount,
  guestDepositTender,
  guestDepositReference,
  onPaymentReceivedAmountChange,
  onPaymentReceivedTenderChange,
  onPaymentReceivedReferenceChange,
  onGuestDepositAmountChange,
  onGuestDepositTenderChange,
  onGuestDepositReferenceChange,
}: {
  guarantee: ReactNode;
  money: (value: number) => string;
  depositQuote: DepositComputeQuote | null;
  ratePlanDepositPolicy: DepositPolicyCard3Row | null;
  ratePlanDepositLabel?: string | null;
  cancellationName?: string | null;
  cancellationDetail?: string | null;
  refundabilityLabel?: string | null;
  refundabilityNonRefundable?: boolean;
  refundabilityKind?: string | null;
  ratePlanNoShowLabel?: string | null;
  ratePlanNoShowPenalty?: string | null;
  ratePlanEarlyDepartureName?: string | null;
  ratePlanEarlyDeparturePenalty?: string | null;
  depositBasisNote?: string | null;
  depositAmountKnown?: boolean;
  sharedPolicyNote?: string | null;
  tenderOptions: GuaranteeMethodOption[];
  paymentReceivedAmount: string;
  paymentReceivedTender: string;
  paymentReceivedReference: string;
  guestDepositAmount: string;
  guestDepositTender: string;
  guestDepositReference: string;
  onPaymentReceivedAmountChange: (value: string) => void;
  onPaymentReceivedTenderChange: (value: string) => void;
  onPaymentReceivedReferenceChange: (value: string) => void;
  onGuestDepositAmountChange: (value: string) => void;
  onGuestDepositTenderChange: (value: string) => void;
  onGuestDepositReferenceChange: (value: string) => void;
  roomPolicyRows?: Array<{
    title: string;
    detail: string;
    cancellation: string;
    noShow: string;
    earlyDeparture: string;
    refundability: string;
  }> | null;
}) {
  const previewAmount = ratePlanDepositPolicy
    ? computeDepositRequirementAmount(ratePlanDepositPolicy, depositQuote)
    : null;
  const depositName = ratePlanDepositPolicy?.name || ratePlanDepositLabel || "";
  const policyValue = ratePlanDepositPolicy
    ? ratePlanDepositPolicy.depositType === "percent"
      ? `${ratePlanDepositPolicy.depositValue}%`
      : ratePlanDepositPolicy.depositType === "none"
        ? "—"
        : String(ratePlanDepositPolicy.depositValue)
    : null;
  const cancelName = present(cancellationName);
  const cancelDetail = present(cancellationDetail);
  const refund = refundabilityCopy(refundabilityLabel, refundabilityKind);
  const afterDeadline =
    cancelDetail?.startsWith("Free cancellation") && refund?.title ? refund.title : null;

  return (
    <div className="space-y-3" data-testid="create-reservation-policies-guarantee">
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        {guarantee}

        <section
          className="h-fit rounded-[6px] border border-[#CCCCCC] bg-white p-4 shadow-none"
          data-testid="deposit-policy"
        >
          <div className="flex items-start gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
              <CircleDollarSign className="size-3.5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#251605]">Deposit</h2>
              <p className="text-xs text-[#6B5E4E]">
                {depositBasisNote ?? "Based on the selected rate plan."}
              </p>
            </div>
          </div>

          {depositName ? (
            <div
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
              data-testid="rate-plan-deposit-policy"
            >
              <dl className="space-y-2 text-sm text-[#251605]">
                <div>
                  <dt className="text-xs text-[#6B5E4E]">Deposit Policy</dt>
                  <dd className="font-medium">{depositName}</dd>
                </div>
                {ratePlanDepositPolicy ? (
                  <>
                    <div>
                      <dt className="text-xs text-[#6B5E4E]">Required</dt>
                      <dd>{ratePlanDepositPolicy.required ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#6B5E4E]">Policy Value</dt>
                      <dd>{policyValue}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {ratePlanDepositPolicy ? (
                <dl className="space-y-2 text-sm text-[#251605]">
                  <div>
                    <dt className="text-xs text-[#6B5E4E]">Deposit Type</dt>
                    <dd>{DEPOSIT_POLICY_TYPE_LABELS[ratePlanDepositPolicy.depositType]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6B5E4E]">Deposit Amount</dt>
                    <dd className="text-lg font-semibold text-[#C89933]">
                      {depositAmountKnown && previewAmount != null ? money(previewAmount) : "—"}
                    </dd>
                    <p className="text-xs text-[#6B5E4E]">
                      {ratePlanDepositPolicy.required ? "Required deposit" : "Not required"}
                    </p>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B5E4E]">No deposit policy configured</p>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-xs text-[#6B5E4E]">
            <Info className="mt-0.5 size-3.5 shrink-0 text-[#C89933]" aria-hidden />
            Collected separately. The amount above is the requirement, not money received.
          </p>

          <ReceiptFields
            title="Payment received"
            testId="payment-received"
            hint="Optional. Posts to the folio as a reservation payment."
            amount={paymentReceivedAmount}
            tender={paymentReceivedTender}
            reference={paymentReceivedReference}
            options={tenderOptions}
            onAmountChange={onPaymentReceivedAmountChange}
            onTenderChange={onPaymentReceivedTenderChange}
            onReferenceChange={onPaymentReceivedReferenceChange}
          />
          <ReceiptFields
            title="Guest deposit"
            testId="guest-deposit"
            hint="Optional extra credit. It does not pay the reservation requirement."
            amount={guestDepositAmount}
            tender={guestDepositTender}
            reference={guestDepositReference}
            options={tenderOptions}
            onAmountChange={onGuestDepositAmountChange}
            onTenderChange={onGuestDepositTenderChange}
            onReferenceChange={onGuestDepositReferenceChange}
          />
        </section>
      </div>

      <section
        className="rounded-[6px] border border-[#CCCCCC] bg-white p-4 shadow-none"
        data-testid="stay-policies"
      >
        <div className="flex items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
            <CalendarDays className="size-3.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#251605]">Stay Policies</h2>
            <p className="text-xs text-[#6B5E4E]">
              {roomPolicyRows
                ? "Policies vary by room"
                : "Policies are inherited from the selected rate plan."}
            </p>
            {sharedPolicyNote ? (
              <p className="text-xs text-[#8A641A]" data-testid="stay-policies-applies-all">
                {sharedPolicyNote}
              </p>
            ) : null}
          </div>
        </div>

        {roomPolicyRows ? (
          <ul className="mt-3 space-y-2" data-testid="stay-policies-varied">
            {roomPolicyRows.map((room) => (
              <li
                key={room.title}
                className="rounded-[6px] border border-[#E7E0D4] px-2.5 py-2"
                data-testid="stay-policy-room"
              >
                <p className="text-xs font-medium text-[#251605]">{room.title}</p>
                <p className="text-[11px] text-[#6B5E4E]">{room.detail}</p>
                <p className="mt-1 text-[11px] text-[#251605]">Cancellation: {room.cancellation}</p>
                <p className="text-[11px] text-[#251605]">No-show: {room.noShow}</p>
                <p className="text-[11px] text-[#251605]">Early Departure: {room.earlyDeparture}</p>
                <p className="text-[11px] text-[#251605]">Refundability: {room.refundability}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PolicySummary
              testId="stay-policy-cancellation"
              tone="green"
              icon={<CalendarDays className="size-3.5" aria-hidden />}
              title="Cancellation"
            >
              {cancelName || cancelDetail ? (
                <>
                  {cancelName ? <Badge tone="green">{cancelName}</Badge> : null}
                  {cancelDetail ? <p className="text-xs text-[#251605]">{cancelDetail}</p> : null}
                  {afterDeadline ? (
                    <p className="text-xs text-[#6B5E4E]">After deadline: {afterDeadline}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[#6B5E4E]">No cancellation policy configured</p>
              )}
            </PolicySummary>

            <PolicySummary
              testId="stay-policy-no-show"
              tone="sand"
              icon={<Ban className="size-3.5" aria-hidden />}
              title="No-show"
            >
              {ratePlanNoShowLabel ? (
                <>
                  <Badge tone="sand" testId="rate-plan-no-show-policy">
                    {ratePlanNoShowLabel}
                  </Badge>
                  {ratePlanNoShowPenalty ? (
                    <p className="text-xs text-[#251605]" data-testid="rate-plan-no-show-penalty">
                      {ratePlanNoShowPenalty}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[#6B5E4E]" data-testid="rate-plan-no-show-policy">
                  No no-show policy configured
                </p>
              )}
            </PolicySummary>

            <PolicySummary
              testId="stay-policy-early-departure"
              tone="sand"
              icon={<LogOut className="size-3.5" aria-hidden />}
              title="Early Departure"
            >
              {ratePlanEarlyDepartureName ? (
                <div data-testid="rate-plan-early-departure-policy">
                  <Badge tone="sand">{ratePlanEarlyDepartureName}</Badge>
                  {ratePlanEarlyDeparturePenalty ? (
                    <p
                      className="text-xs text-[#251605]"
                      data-testid="rate-plan-early-departure-penalty"
                    >
                      {ratePlanEarlyDeparturePenalty}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p
                  className="text-xs text-[#6B5E4E]"
                  data-testid="rate-plan-early-departure-policy"
                >
                  No early departure policy configured
                </p>
              )}
            </PolicySummary>

            <PolicySummary
              testId="stay-policy-refundability"
              tone={refundabilityNonRefundable ? "rose" : "sand"}
              icon={<Ban className="size-3.5" aria-hidden />}
              title="Refundability"
            >
              {refund ? (
                <>
                  <Badge tone={refundabilityNonRefundable ? "rose" : "sand"}>{refund.title}</Badge>
                  {refund.detail ? <p className="text-xs text-[#6B5E4E]">{refund.detail}</p> : null}
                </>
              ) : (
                <p className="text-xs text-[#6B5E4E]">No refundability configured</p>
              )}
            </PolicySummary>
          </div>
        )}
      </section>
    </div>
  );
}

const RECEIPT_NONE = "__none__";
const RECEIPT_MENU = "z-[80] max-h-60 rounded-[6px] border-[#CCCCCC] bg-white text-sm text-[#251605]";

function ReceiptFields({
  title,
  testId,
  hint,
  amount,
  tender,
  reference,
  options,
  onAmountChange,
  onTenderChange,
  onReferenceChange,
}: {
  title: string;
  testId: string;
  hint: string;
  amount: string;
  tender: string;
  reference: string;
  options: GuaranteeMethodOption[];
  onAmountChange: (value: string) => void;
  onTenderChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-[#E7E0D6] pt-3" data-testid={testId}>
      <div>
        <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
        <p className="text-xs text-[#6B5E4E]">{hint}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${testId}-amount`} className="text-xs font-medium text-[#6B5E4E]">
            Amount
          </Label>
          <Input
            id={`${testId}-amount`}
            className={PMS_OP_INPUT}
            inputMode="decimal"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            aria-label={`${title} amount`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testId}-tender`} className="text-xs font-medium text-[#6B5E4E]">
            Tender
          </Label>
          <Select
            value={tender || RECEIPT_NONE}
            onValueChange={(value) => onTenderChange(value === RECEIPT_NONE ? "" : value)}
          >
            <SelectTrigger
              id={`${testId}-tender`}
              className={PMS_OP_SELECT_TRIGGER}
              aria-label={`${title} tender`}
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className={RECEIPT_MENU}>
              <SelectItem value={RECEIPT_NONE}>—</SelectItem>
              {options
                .filter((option) => option.value && option.value !== "same_as_guarantee")
                .map((option) => (
                  <SelectItem key={`${testId}-${option.origin}-${option.value}`} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testId}-reference`} className="text-xs font-medium text-[#6B5E4E]">
            Reference
          </Label>
          <Input
            id={`${testId}-reference`}
            className={PMS_OP_INPUT}
            value={reference}
            maxLength={80}
            onChange={(event) => onReferenceChange(event.target.value)}
            aria-label={`${title} reference`}
          />
        </div>
      </div>
    </div>
  );
}

function refundabilityCopy(
  label: string | null | undefined,
  kind: string | null | undefined,
): { title: string; detail: string | null } | null {
  const name = present(label);
  const title =
    kind === "non_refundable" ? "Non-refundable" : kind === "refundable" ? "Refundable" : name;
  if (!title) return null;
  return { title, detail: name && name !== title ? name : null };
}

function present(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || text === "—") return null;
  return text;
}

function PolicySummary({
  title,
  icon,
  tone,
  testId,
  children,
}: {
  title: string;
  icon: ReactNode;
  tone: "green" | "sand" | "rose";
  testId: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "h-fit rounded-[6px] border p-3",
        tone === "green" && "border-[#D7E5D4] bg-[#F4F8F2]",
        tone === "sand" && "border-[#EFE4D0] bg-[#FBF6EE]",
        tone === "rose" && "border-[#F0D4D4] bg-[#FDF4F4]",
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#6B5E4E]">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </article>
  );
}

function Badge({
  children,
  tone,
  testId,
}: {
  children: ReactNode;
  tone: "green" | "sand" | "rose";
  testId?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "green" && "bg-[#E5F2E4] text-[#2F6B3A]",
        tone === "sand" && "bg-[#F3E6CC] text-[#8A641A]",
        tone === "rose" && "bg-[#F8E4E4] text-[#9B3A3A]",
      )}
      data-testid={testId}
    >
      {children}
    </span>
  );
}
