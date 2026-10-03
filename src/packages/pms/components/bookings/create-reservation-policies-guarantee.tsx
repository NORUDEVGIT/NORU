import { Banknote, Ban, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import type { GuaranteeMethodOption } from "@/packages/pms/lib/create-reservation-phase1-section7";
import {
  computeDepositRequirementAmount,
  type DepositComputeQuote,
} from "@/packages/pms/lib/create-reservation-step4";
import {
  DEPOSIT_POLICY_TYPE_LABELS,
  type DepositPolicyCard3Row,
} from "@/packages/pms/lib/payments-card3";
import { cn } from "@/shared/lib/utils";

const CONTROL =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA] disabled:text-muted-foreground";
const NOTES_MAX = 500;

/** Frontend-only policy labels until Settings catalogue is wired. */
const LOCAL_STAY_POLICY_OPTIONS = [
  { value: "charge_full_stay", label: "Charge full stay amount" },
  { value: "charge_first_night", label: "Charge first night" },
  { value: "no_charge", label: "No charge" },
  { value: "custom", label: "Custom policy" },
] as const;

export type CreateReservationPoliciesState = {
  depositPolicyId: string;
  depositDueDate: string;
  depositPaymentMethod: string;
  depositReference: string;
  cancelPolicyMode: "hotel" | "different";
  cancelPolicyCode: string;
  noShowPolicy: string;
  earlyDeparturePolicy: string;
  ackInformed: boolean;
  ackConsent: boolean;
  ackNonRefundable: boolean;
  ackSpecialTerms: boolean;
  cardHolderName: string;
  cardNumber: string;
  cardExpiry: string;
};

export const EMPTY_CREATE_RESERVATION_POLICIES: CreateReservationPoliciesState = {
  depositPolicyId: "",
  depositDueDate: "",
  depositPaymentMethod: "",
  depositReference: "",
  cancelPolicyMode: "hotel",
  cancelPolicyCode: "",
  noShowPolicy: "",
  earlyDeparturePolicy: "",
  ackInformed: false,
  ackConsent: false,
  ackNonRefundable: false,
  ackSpecialTerms: false,
  cardHolderName: "",
  cardNumber: "",
  cardExpiry: "",
};

export function CreateReservationPoliciesGuarantee({
  guarantee,
  policies,
  onPoliciesChange,
  notes,
  onNotesChange,
  money,
  hotelCancelSummary,
  depositPaymentOptions,
  depositPolicies,
  depositPolicyHint,
  depositQuote,
  quotedNonRefundable,
}: {
  guarantee: ReactNode;
  policies: CreateReservationPoliciesState;
  onPoliciesChange: (patch: Partial<CreateReservationPoliciesState>) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  money: (value: number) => string;
  hotelCancelSummary: string | null;
  depositPaymentOptions: GuaranteeMethodOption[];
  depositPolicies: DepositPolicyCard3Row[];
  depositPolicyHint: string | null;
  depositQuote: DepositComputeQuote | null;
  quotedNonRefundable: boolean;
}) {
  const selectedPolicy =
    depositPolicies.find((row) => row.id === policies.depositPolicyId) ?? null;
  const previewAmount = selectedPolicy
    ? computeDepositRequirementAmount(selectedPolicy, depositQuote)
    : null;
  const depositFieldsOpen = Boolean(selectedPolicy);

  return (
    <div className="space-y-3" data-testid="create-reservation-policies-guarantee">
      <div className="grid gap-3 lg:grid-cols-2">
        {guarantee}

        <PolicyCard
          icon={<Banknote className="size-4 text-[#B8954F]" />}
          title="Deposit Information"
          subtitle="Settings deposit policy for this stay. Cashiering posts money."
        >
          {depositPolicyHint ? (
            <p
              className="rounded-md border border-[#E7E0D4] bg-[#F7F4EE] px-2 py-1.5 text-[11px] text-[#251605]"
              data-testid="deposit-policy-hint"
            >
              {depositPolicyHint}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No active default deposit policy in Settings. Pick an active policy or leave none.
            </p>
          )}
          <div className="mt-2">
            <Field label="Deposit Policy">
              <select
                className={CONTROL}
                value={policies.depositPolicyId}
                onChange={(event) => onPoliciesChange({ depositPolicyId: event.target.value })}
                aria-label="Deposit Policy"
                data-testid="deposit-policy"
              >
                <option value="">—</option>
                {depositPolicies.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {selectedPolicy ? (
            <dl className="mt-3 grid gap-2 text-[11px] text-[#251605] sm:grid-cols-2">
              <div>
                <dt className="text-[#6B5E4E]">Required</dt>
                <dd>{selectedPolicy.required ? "Required" : "Not required"}</dd>
              </div>
              <div>
                <dt className="text-[#6B5E4E]">Deposit type</dt>
                <dd>{DEPOSIT_POLICY_TYPE_LABELS[selectedPolicy.depositType]}</dd>
              </div>
              <div>
                <dt className="text-[#6B5E4E]">Policy value</dt>
                <dd>
                  {selectedPolicy.depositType === "percent"
                    ? `${selectedPolicy.depositValue}%`
                    : selectedPolicy.depositType === "none"
                      ? "—"
                      : String(selectedPolicy.depositValue)}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B5E4E]">Computed amount (preview)</dt>
                <dd>
                  {previewAmount != null ? money(previewAmount) : "—"}
                  <span className="block text-[10px] text-muted-foreground">
                    Server recomputes this at create. Not posted.
                  </span>
                </dd>
              </div>
            </dl>
          ) : null}

          <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", !depositFieldsOpen && "opacity-60")}>
            <Field label="Deposit Due Date">
              <Input
                className={CONTROL}
                type="date"
                disabled={!depositFieldsOpen}
                value={policies.depositDueDate}
                onChange={(event) => onPoliciesChange({ depositDueDate: event.target.value })}
                aria-label="Deposit Due Date"
              />
            </Field>
            <Field label="Payment Method">
              <select
                className={CONTROL}
                disabled={!depositFieldsOpen}
                value={policies.depositPaymentMethod}
                onChange={(event) => onPoliciesChange({ depositPaymentMethod: event.target.value })}
                aria-label="Payment Method"
              >
                <option value="">—</option>
                <option value="same_as_guarantee">Same as Guarantee</option>
                {depositPaymentOptions.map((option) => (
                  <option key={`deposit-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Payment Reference (Optional)">
                <Input
                  className={CONTROL}
                  disabled={!depositFieldsOpen}
                  value={policies.depositReference}
                  maxLength={120}
                  onChange={(event) => onPoliciesChange({ depositReference: event.target.value })}
                  placeholder="e.g. transaction ID, authorization code..."
                  aria-label="Payment Reference"
                />
              </Field>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Due date and payment reference are not stored on create. Cashiering posts the deposit.
          </p>
        </PolicyCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PolicyCard
          icon={<Ban className="size-4 text-[#B8954F]" />}
          title="Cancellation Policy"
          subtitle="Hotel default is the selected rate plan’s quoted policy."
        >
          <p className="mb-2 text-[11px] text-muted-foreground">
            Create snapshots the rate plan policy. A different policy is not stored and
            would require a re-quote.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 text-sm text-[#251605]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cancel-policy-mode"
                  className="accent-[#B8954F]"
                  checked={policies.cancelPolicyMode === "hotel"}
                  onChange={() => onPoliciesChange({ cancelPolicyMode: "hotel" })}
                />
                Use Hotel Default Policy
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cancel-policy-mode"
                  className="accent-[#B8954F]"
                  checked={policies.cancelPolicyMode === "different"}
                  onChange={() => onPoliciesChange({ cancelPolicyMode: "different" })}
                />
                Use Different Policy
              </label>
              {policies.cancelPolicyMode === "different" ? (
                <div className="flex items-end gap-2">
                  {/* TODO: wire cancellation policy picker from Settings / rate-plan catalogue. */}
                  <select
                    className={CONTROL}
                    value={policies.cancelPolicyCode}
                    onChange={(event) => onPoliciesChange({ cancelPolicyCode: event.target.value })}
                    aria-label="Cancellation policy"
                  >
                    <option value="">—</option>
                    {hotelCancelSummary ? (
                      <option value="quoted">{hotelCancelSummary}</option>
                    ) : null}
                  </select>
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" disabled>
                    View Details
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="rounded-md border border-[#E7E0D4] bg-[#F7F4EE] px-3 py-2">
              <p className="text-[11px] font-medium text-[#6B5E4E]">Policy Summary</p>
              <p className="mt-1 text-[11px] text-[#251605]">
                {hotelCancelSummary || "No cancellation summary on the selected rate."}
              </p>
            </div>
          </div>
        </PolicyCard>

        <PolicyCard
          icon={<FileText className="size-4 text-[#B8954F]" />}
          title="No-Show & Early Departure Policy"
          subtitle="Define no-show and early departure conditions."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="No-Show Policy">
              {/* TODO: wire no-show policy from Settings reservation rules. */}
              <select
                className={CONTROL}
                value={policies.noShowPolicy}
                onChange={(event) => onPoliciesChange({ noShowPolicy: event.target.value })}
                aria-label="No-Show Policy"
              >
                <option value="">—</option>
                {LOCAL_STAY_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Early Departure Policy">
              {/* TODO: wire early-departure policy from Settings reservation rules. */}
              <select
                className={CONTROL}
                value={policies.earlyDeparturePolicy}
                onChange={(event) => onPoliciesChange({ earlyDeparturePolicy: event.target.value })}
                aria-label="Early Departure Policy"
              >
                <option value="">—</option>
                {LOCAL_STAY_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-medium text-[#6B5E4E]">Additional Policies</p>
            {/* TODO: acknowledgements are frontend-only until consent persistence exists. */}
            <Ack
              label="I have informed the guest about the cancellation and no-show policy."
              checked={policies.ackInformed}
              onCheckedChange={(checked) => onPoliciesChange({ ackInformed: checked })}
            />
            <Ack
              label="I have received guest consent for the deposit and guarantee."
              checked={policies.ackConsent}
              onCheckedChange={(checked) => onPoliciesChange({ ackConsent: checked })}
            />
            <Ack
              label="This is a non-refundable reservation."
              checked={quotedNonRefundable || policies.ackNonRefundable}
              disabled={quotedNonRefundable}
              onCheckedChange={(checked) => onPoliciesChange({ ackNonRefundable: checked })}
            />
            {quotedNonRefundable ? (
              <p className="text-[10px] text-muted-foreground">
                Derived from the selected rate’s refundability. Not stored as a separate flag.
              </p>
            ) : null}
            <Ack
              label="Special terms and conditions apply."
              checked={policies.ackSpecialTerms}
              onCheckedChange={(checked) => onPoliciesChange({ ackSpecialTerms: checked })}
            />
          </div>
        </PolicyCard>
      </div>

      <section className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm text-[#251605]">Internal Notes (Optional)</h2>
          <p className="text-[10px] text-muted-foreground">
            {notes.length}/{NOTES_MAX}
          </p>
        </div>
        <Textarea
          className="mt-1 min-h-[72px] resize-none text-sm"
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value.slice(0, NOTES_MAX))}
          placeholder="Add internal notes for hotel staff (not visible to guest)..."
          aria-label="Internal notes"
        />
      </section>
    </div>
  );
}

function PolicyCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        {icon}
        <div>
          <h2 className="font-display text-base text-[#251605]">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-[11px] font-medium text-[#6B5E4E]">{label}</p>
      {children}
    </div>
  );
}

function Ack({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-[12px] text-[#251605]">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {label}
    </label>
  );
}
