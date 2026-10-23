/**
 * Check-In Step 3. Rendered inside the shared workspace sheet.
 * Deposit numbers come from getCheckInDepositReadiness. Collection uses postCheckInDeposit.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MoreHorizontal, ShieldAlert, Wallet } from "lucide-react";

import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import {
  getCheckInDepositReadiness,
  postCheckInDeposit,
  waiveCheckInDeposit,
} from "@/packages/pms/lib/fo-check-in.functions";
import type { CheckInDepositReadiness } from "@/packages/pms/lib/fo-check-in";
import { FO_CHECK_IN_POLL_MS } from "@/packages/pms/lib/fo-freshness";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import type { ReservationCashieringSummary } from "@/packages/pms/lib/reservation-cashiering-summary";
import {
  buildCheckInPaymentSummary,
  canAuthorizeCheckInDepositWaiver,
  depositActionFailureCopy,
  depositRequirementStatus,
  formatDepositAmount,
  guaranteeMethodLabel,
  GUARANTEE_NOT_EVALUATED,
  postedDepositProgressFailure,
  waiverFailureCopy,
  type CheckInPaymentSummary,
} from "@/packages/pms/lib/fo-checkin-v2-payment-model";
import { classifyCheckInUnitFailure } from "@/packages/pms/lib/fo-checkin-v2-model";
import {
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

export function FoCheckInV2Payment({
  restaurantId,
  reservationId,
  reservationRoomId,
  unit,
  reservation,
  cashiering,
  cashieringPending,
  onReady,
  onSummary,
  onRefresh,
}: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string | null;
  unit: CheckInUnitRead;
  reservation: ReservationDetail | null;
  cashiering: ReservationCashieringSummary | null;
  cashieringPending: boolean;
  onReady: (satisfied: boolean) => void;
  onSummary: (summary: CheckInPaymentSummary) => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const fetchReadiness = useServerFn(getCheckInDepositReadiness);
  const postDeposit = useServerFn(postCheckInDeposit);
  const waiveDeposit = useServerFn(waiveCheckInDeposit);
  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });
  const depositKey = useRef(crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [postedTransactionId, setPostedTransactionId] = useState<string | null>(null);
  const [showWaiverForm, setShowWaiverForm] = useState(false);

  const membershipQuery = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: Boolean(user?.id),
    retry: false,
  });
  const role = membershipQuery.data?.find((row) => row.restaurantId === restaurantId)?.role ?? null;
  const canWaive = canAuthorizeCheckInDepositWaiver(role);

  const readinessQuery = useQuery({
    queryKey: ["fo-ci-v2-deposit", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchReadiness({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    refetchOnWindowFocus: "always",
    refetchInterval: FO_CHECK_IN_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const readiness = readinessQuery.data ?? null;
  const waived = unit.progress.depositWaived;
  const status = readiness
    ? depositRequirementStatus({
        requiredAmount: readiness.requiredAmount,
        receivedAmount: readiness.receivedAmount,
        satisfied: readiness.satisfied,
        waived,
      })
    : null;
  const summary = useMemo(
    () => (readiness ? buildCheckInPaymentSummary(readiness, waived) : null),
    [readiness, waived],
  );

  useEffect(() => {
    onReady(readiness?.satisfied === true);
  }, [onReady, readiness?.satisfied]);

  useEffect(() => {
    if (summary) onSummary(summary);
  }, [onSummary, summary]);

  useEffect(() => {
    if (!tenders.some((row) => row.code === method)) setMethod(tenders[0]?.code ?? "");
  }, [method, tenders]);

  useEffect(() => {
    if (readiness && !readiness.satisfied && readiness.outstanding > 0 && amount === "") {
      setAmount(String(readiness.outstanding));
    }
  }, [readiness?.satisfied, readiness?.outstanding, amount]);

  useEffect(() => {
    if (readiness?.satisfied) setShowWaiverForm(false);
  }, [readiness?.satisfied]);

  function refreshState() {
    void readinessQuery.refetch();
    void queryClient.invalidateQueries({
      queryKey: ["fo-ci-v2-deposit", restaurantId, reservationId],
    });
    onRefresh();
  }

  const postMut = useMutation({
    mutationFn: () => {
      const parsed = Number(amount);
      return postDeposit({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          amount: parsed,
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          idempotencyKey: depositKey.current,
        },
      });
    },
    onSuccess: async () => {
      depositKey.current = crypto.randomUUID();
      setAmount("");
      setReference("");
      setFormError(null);
      setPostedTransactionId(null);
      await readinessQuery.refetch();
      onRefresh();
    },
    onError: (error) => {
      const transactionId = postedDepositProgressFailure(error);
      if (transactionId) {
        setPostedTransactionId(transactionId);
        setFormError(null);
        refreshState();
        return;
      }
      setFormError(depositActionFailureCopy(error));
    },
  });

  const waiveMut = useMutation({
    mutationFn: () =>
      waiveDeposit({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          reason: reason.trim(),
        },
      }),
    onSuccess: async () => {
      setReason("");
      setFormError(null);
      await readinessQuery.refetch();
      onRefresh();
    },
    onError: (error) => setFormError(waiverFailureCopy(error)),
  });

  function collectDeposit() {
    if (postedTransactionId) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError("Enter a deposit amount.");
      return;
    }
    if (!method) {
      setFormError("Choose a payment method.");
      return;
    }
    setFormError(null);
    postMut.mutate();
  }

  if (readinessQuery.isLoading) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#6B5E4E]"
        data-testid="fo-ci-v2-payment-loading"
      >
        Loading deposit readiness…
      </div>
    );
  }

  if (readinessQuery.isError || !readiness || !status || !summary) {
    const failure = classifyCheckInUnitFailure(readinessQuery.error);
    const message =
      failure === "permission_denied"
        ? "You don't have access to this reservation's deposit."
        : failure === "reservation_not_found"
          ? "This reservation could not be found for the property."
          : failure === "room_unit_required"
            ? "Choose which room this deposit applies to."
            : "Deposit readiness could not be loaded. Try again.";
    return (
      <div
        className="rounded-xl border border-red-200 bg-white p-6"
        data-testid="fo-ci-v2-payment-error"
      >
        <p className="text-sm font-semibold text-[#251605]">Payment & Guarantee</p>
        <p className="mt-2 text-sm text-red-800">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void readinessQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const sharedFolio = unit.siblings.length > 0;
  const ready = readiness.satisfied;
  const currencyMissing = !readiness.currency?.trim();

  return (
    <div className="space-y-4" data-testid="fo-ci-v2-payment">
      <ReadinessBanner
        readiness={readiness}
        status={status}
        ready={ready}
        currencyMissing={currencyMissing}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Deposit" testId="fo-ci-v2-deposit-requirement">
          <AmountRow
            label="Required amount"
            value={summary.required}
            testId="fo-ci-v2-deposit-required"
          />
          <AmountRow
            label="Received amount"
            value={summary.received}
            testId="fo-ci-v2-deposit-received"
          />
          <AmountRow
            label="Outstanding amount"
            value={summary.outstanding}
            testId="fo-ci-v2-deposit-outstanding"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={refreshState}
              data-testid="fo-ci-v2-refresh-cashiering"
            >
              Refresh from Cashiering
            </Button>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-[#6B5E4E]">Status</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  status === "Satisfied" || status === "Not required"
                    ? "bg-[#436436]/15 text-[#436436]"
                    : status === "Waived"
                      ? "bg-[#C89933]/20 text-[#8B6914]"
                      : status === "Partially paid"
                        ? "bg-[#C89933]/15 text-[#8B6914]"
                        : "bg-red-50 text-red-800",
                )}
                data-testid="fo-ci-v2-deposit-status"
              >
                {status}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-deposit-not-payment">
            Ordinary payments do not satisfy this deposit.
          </p>
          {status === "Waived" ? (
            <p className="mt-2 text-xs text-[#8B6914]" data-testid="fo-ci-v2-waiver-note">
              The requirement was waived for this room. Received deposit is unchanged.
              {unit.progress.depositWaiverReason
                ? ` Reason: ${unit.progress.depositWaiverReason}`
                : ""}
            </p>
          ) : null}
        </Section>

        <Section title="Folio / Payment Status" testId="fo-ci-v2-folio">
          <AmountRow
            label="Folio number"
            value={
              readiness.folioNumber ?? (readiness.folioId ? "Open Folio" : "No folio open")
            }
            testId="fo-ci-v2-folio-number"
          />
          <div className="flex items-baseline justify-between gap-3 py-1">
            <p className="text-xs text-[#6B5E4E]">Status</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                readiness.folioStatus === "open"
                  ? "bg-[#C89933]/15 text-[#8B6914]"
                  : readiness.folioStatus === "closed"
                    ? "bg-[#436436]/15 text-[#436436]"
                    : "bg-[#F3EEE6] text-[#6B5E4E]",
              )}
              data-testid="fo-ci-v2-folio-status"
            >
              {readiness.folioStatus === "open"
                ? "Open"
                : readiness.folioStatus === "closed"
                  ? "Closed"
                  : "Not opened"}
            </span>
          </div>
          <AmountRow
            label="Currency"
            value={readiness.currency?.trim() || "Currency unavailable"}
            testId="fo-ci-v2-folio-currency"
          />

          {cashiering && cashiering.folioBalance != null ? (
            <div className="mt-3 border-t border-[#E8DFD0] pt-3" data-testid="fo-ci-v2-folio-breakdown">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
                Charge breakdown (stay to date)
              </p>
              <AmountRow
                label="Room charge"
                value={formatDepositAmount(cashiering.postedRoomCharges, readiness.currency)}
                testId="fo-ci-v2-folio-room-charge"
              />
              {cashiering.postedTax != null && cashiering.postedTax !== 0 ? (
                <AmountRow
                  label="Tax"
                  value={formatDepositAmount(cashiering.postedTax, readiness.currency)}
                  testId="fo-ci-v2-folio-tax"
                />
              ) : null}
              <AmountRow
                label="Total charges"
                value={formatDepositAmount(cashiering.postedTotalCharges, readiness.currency)}
                testId="fo-ci-v2-folio-total-charges"
              />
              <AmountRow
                label="Deposit applied"
                value={
                  cashiering.depositReceived && cashiering.depositReceived > 0
                    ? `-${formatDepositAmount(cashiering.depositReceived, readiness.currency)}`
                    : formatDepositAmount(0, readiness.currency)
                }
                testId="fo-ci-v2-folio-deposit-applied"
              />
              <AmountRow
                label="Remaining balance"
                value={formatDepositAmount(cashiering.folioBalance, readiness.currency)}
                testId="fo-ci-v2-folio-remaining-balance"
              />
            </div>
          ) : cashieringPending ? (
            <p className="mt-3 text-xs text-[#6B5E4E]">Loading charge breakdown…</p>
          ) : null}

          <p className="mt-3 text-sm font-medium text-[#251605]" data-testid="fo-ci-v2-folio-scope">
            Folio scope: {summary.folioScope}
          </p>
          <p className="mt-1 text-xs text-[#6B5E4E]">
            Payments apply to the whole reservation. Any deposit waiver applies only to this room.
          </p>
          {sharedFolio ? (
            <p className="mt-2 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-shared-folio">
              Financial activity is shared across this reservation. This room uses the reservation
              folio.
            </p>
          ) : null}
          {!readiness.folioId ? (
            <p className="mt-2 text-xs text-[#8B6914]">
              No reservation folio is open yet. Collecting a deposit opens that folio.
            </p>
          ) : null}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Guarantee" testId="fo-ci-v2-guarantee">
          <AmountRow
            label="Guarantee method"
            value={guaranteeMethodLabel(readiness.guaranteeMethod)}
            testId="fo-ci-v2-guarantee-method"
          />
          <p
            className="mt-3 text-xs text-[#6B5E4E]"
            data-testid="fo-ci-v2-guarantee-status"
            data-guarantee-satisfied="null"
          >
            Status: {GUARANTEE_NOT_EVALUATED}
          </p>
          <p className="mt-1 text-xs text-[#6B5E4E]">
            This is informational only and does not change the deposit requirement.
          </p>
        </Section>
        <BillingContext readiness={readiness} reservation={reservation} />
      </div>

      {postedTransactionId || !ready ? (
        <Section title="Deposit Actions" testId="fo-ci-v2-deposit-actions">
          {postedTransactionId ? (
            <div
              className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-3 text-sm text-[#251605]"
              data-testid="fo-ci-v2-deposit-reconciliation"
            >
              <p className="font-semibold">Deposit posted. Room progress still needs a refresh.</p>
              <p className="mt-1 text-xs text-[#6B5E4E]">
                Transaction {postedTransactionId} is on the reservation folio. Do not submit this
                deposit again.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-xs"
                onClick={refreshState}
                data-testid="fo-ci-v2-refresh-deposit"
              >
                Refresh status
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#251605]">Collect Deposit</p>
              <p className="-mt-1 text-xs text-[#6B5E4E]">
                Collect the outstanding deposit to continue.
              </p>
              <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_160px]">
                <label className="block text-xs font-medium text-[#6B5E4E]">
                  Amount<span className="text-[#8B4513] font-semibold"> *</span>
                  <Input
                    className="mt-1 h-9"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-required="true"
                    data-testid="fo-ci-v2-deposit-amount"
                  />
                </label>
                <div>
                  <p className="text-xs font-medium text-[#6B5E4E]">
                    Payment method<span className="text-[#8B4513] font-semibold"> *</span>
                  </p>
                  {tenders.length === 0 ? (
                    <p className="mt-2 text-xs text-[#8B6914]">No payment method is available.</p>
                  ) : (
                    <div
                      className="mt-1 flex flex-wrap gap-1 rounded-[6px] border border-[#CCCCCC] bg-white p-1"
                      role="radiogroup"
                      aria-label="Payment method"
                      data-testid="fo-ci-v2-deposit-method"
                    >
                      {tenders.map((tender) => (
                        <button
                          key={tender.code}
                          type="button"
                          role="radio"
                          aria-checked={method === tender.code}
                          aria-pressed={method === tender.code}
                          className={cn(
                            "flex-1 rounded-[4px] px-3 py-1 text-xs font-medium transition-colors",
                            method === tender.code
                              ? "bg-[#C89933] text-white"
                              : "text-[#6B5E4E] hover:bg-[#FAF8F5]",
                          )}
                          onClick={() => setMethod(tender.code)}
                        >
                          {tender.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="block text-xs font-medium text-[#6B5E4E]">
                  Reference
                  <Input
                    className="mt-1 h-9"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    data-testid="fo-ci-v2-deposit-reference"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                  disabled={postMut.isPending || tenders.length === 0}
                  onClick={collectDeposit}
                  data-testid="fo-ci-v2-collect-deposit"
                >
                  <Wallet className="mr-2 size-4" />
                  {postMut.isPending ? "Posting…" : "Collect Deposit"}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-[#6B5E4E]"
                      data-testid="fo-ci-v2-more-actions"
                    >
                      <MoreHorizontal className="mr-1 size-3.5" />
                      More actions
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[90] w-56 p-1" align="end">
                    <button
                      type="button"
                      className="w-full rounded-[4px] px-2 py-1.5 text-left text-xs text-[#251605] hover:bg-[#FAF8F5]"
                      onClick={() => setShowWaiverForm((value) => !value)}
                      data-testid="fo-ci-v2-waive-deposit-toggle"
                    >
                      Waive deposit requirement
                    </button>
                  </PopoverContent>
                </Popover>
              </div>

              {showWaiverForm ? (
                <div className="rounded-[6px] border border-[#E8DFD0] bg-[#FAF8F5] p-3">
                  <p className="text-sm font-semibold text-[#251605]">Deposit waiver</p>
                  <p className="mt-1 text-xs text-[#6B5E4E]">
                    A waiver clears only this room&apos;s deposit requirement. It does not change
                    the amount received on the reservation folio.
                  </p>
                  {membershipQuery.isLoading ? (
                    <p className="mt-2 text-sm text-[#6B5E4E]">
                      Checking who can authorize this waiver…
                    </p>
                  ) : canWaive ? (
                    <div className="mt-3 space-y-2">
                      <label
                        className="block text-xs font-medium text-[#6B5E4E]"
                        htmlFor="fo-ci-v2-waiver-reason"
                      >
                        Reason<span className="text-[#8B4513] font-semibold"> *</span>
                      </label>
                      <Textarea
                        id="fo-ci-v2-waiver-reason"
                        rows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        aria-required="true"
                        data-testid="fo-ci-v2-waiver-reason"
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!reason.trim() || waiveMut.isPending}
                        onClick={() => waiveMut.mutate()}
                        data-testid="fo-ci-v2-waive-deposit"
                      >
                        {waiveMut.isPending ? "Saving…" : "Authorize Deposit Waiver"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-waiver-denied">
                      An owner or manager must authorize a deposit waiver for this room.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {formError ? (
            <p
              className="mt-3 text-sm text-red-800"
              role="alert"
              data-testid="fo-ci-v2-payment-form-error"
            >
              {formError}
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

function ReadinessBanner({
  readiness,
  status,
  ready,
  currencyMissing,
}: {
  readiness: CheckInDepositReadiness;
  status: ReturnType<typeof depositRequirementStatus>;
  ready: boolean;
  currencyMissing: boolean;
}) {
  const required = formatDepositAmount(readiness.requiredAmount, readiness.currency);
  const received = formatDepositAmount(readiness.receivedAmount, readiness.currency);
  const outstanding = formatDepositAmount(readiness.outstanding, readiness.currency);
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        ready ? "border-[#436436]/25 bg-[#436436]/10" : "border-[#C89933]/40 bg-[#C89933]/10",
      )}
      data-testid="fo-ci-v2-readiness"
      data-satisfied={ready ? "true" : "false"}
    >
      <div className="flex items-start gap-2">
        {ready ? (
          <CheckCircle2 className="mt-0.5 size-4 text-[#436436]" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 text-[#8B6914]" />
        )}
        <div>
          <p className="text-sm font-semibold text-[#251605]">
            {ready ? "Payment & Guarantee ready" : "Payment & Guarantee — Action required"}
          </p>
          <p className={cn("text-xs", ready ? "text-[#436436]" : "text-[#8B6914]")}>
            {ready
              ? "Deposit requirement is satisfied. You can continue to the next step."
              : `Deposit outstanding: ${outstanding}`}
          </p>
          {!ready ? (
            <p className="mt-1 text-xs text-[#8B6914]">
              {required} required · {received} received
            </p>
          ) : status === "Waived" ? (
            <p className="mt-1 text-xs text-[#436436]">Satisfied by an approved waiver for this room.</p>
          ) : null}
          {currencyMissing ? (
            <p className="mt-1 text-xs text-[#8B6914]">Currency unavailable</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BillingContext({
  readiness,
  reservation,
}: {
  readiness: CheckInDepositReadiness;
  reservation: ReservationDetail | null;
}) {
  const company = reservation?.companyName ?? readiness.companyMasterId;
  const group = reservation?.groupName ?? readiness.groupAccountMasterId;
  const agency = reservation?.travelAgentName ?? null;
  const allEmpty = !company && !group && !agency;
  return (
    <Section title="Company / Group Billing" testId="fo-ci-v2-billing">
      {allEmpty ? (
        <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-billing-empty">
          Company, Group, and Travel agency: None recorded
        </p>
      ) : (
        <>
          <AmountRow
            label="Company"
            value={company || "None recorded"}
            testId="fo-ci-v2-billing-company"
          />
          <AmountRow
            label="Group"
            value={group || "None recorded"}
            testId="fo-ci-v2-billing-group"
          />
          <AmountRow
            label="Travel agency"
            value={agency || "None recorded"}
            testId="fo-ci-v2-billing-agency"
          />
        </>
      )}
      <p className="mt-3 text-xs text-[#6B5E4E]">
        Informational only. This does not change the deposit requirement.
      </p>
    </Section>
  );
}

function AmountRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <p className="text-xs text-[#6B5E4E]">{label}</p>
      <p className="text-right text-sm font-medium text-[#251605]" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">{title}</h3>
      {children}
    </section>
  );
}
