/**
 * FO-10R2 — Front Desk Check-Out & Folio Review.
 *
 * Three stages only: Folio Review & Settlement, Final Confirmation,
 * Departure Complete. Reads come from the FO-10R1 contract
 * (getCheckOutContract / getCheckOutConfirmation); the only status writer is
 * the existing hardened completeFoCheckOut. Settlement, override and close
 * still go through the existing Cashiering writers (postCheckOutPayment,
 * overrideCheckOutSettlement, closeFolioAtCheckout) — nothing new is posted
 * here. reservationRoomId is chosen once and never changes for the rest of
 * the flow.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Printer, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Dialog, DialogContent } from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  RoomUnitOccupantContext,
  RoomUnitTargetSelect,
} from "@/packages/pms/components/frontoffice/room-unit-target-select";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { FoAuthorizationCard } from "@/packages/pms/components/frontoffice/fo-authorization-card";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import { useMoney } from "@/core/state/property-format";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import {
  FOLIO_LEFT_OPEN_CHIP,
  formatCheckoutDate,
  isOwesBalance,
  outstandingAmount,
  overrideKindForBalance,
  paymentAmountAllowed,
  renderCheckoutDocumentHtml,
} from "@/packages/pms/lib/fo-check-out";
import {
  checkOutAccountingBadge,
  checkOutDueLabel,
  checkOutDocumentSnapshot,
  checkOutSharedFolioWarning,
  type CheckOutChargeItem,
  type CheckOutCompletion,
  type CheckOutPaymentItem,
} from "@/packages/pms/lib/fo-check-out-contract";
import {
  CHECKOUT_STALE_MESSAGE,
  closeFolioAtCheckout,
  completeFoCheckOut,
  ensureCheckOutFolio,
  getCheckOutConfirmation,
  getCheckOutContext,
  getCheckOutContract,
  overrideCheckOutSettlement,
  postCheckOutPayment,
  type CheckOutContract,
} from "@/packages/pms/lib/fo-check-out.functions";
import { cn } from "@/shared/lib/utils";

const GOLD = "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]";
const HEADER_BG = "bg-[#1F140A]";
const RAIL_BG = "bg-[#2B1B0C]";

type Stage = "pick-room" | "folio" | "confirm" | "complete";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoCheckOutWorkspace({
  restaurantId,
  stay,
  open,
  onOpenChange,
  initialReservationRoomId,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialReservationRoomId?: string;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const multiRoom = (stay.roomUnits?.length ?? 0) > 1;

  const [reservationRoomId, setReservationRoomId] = useState(
    () => stay.reservationRoomId ?? initialReservationRoomId ?? "",
  );
  const [stage, setStage] = useState<Stage>(
    multiRoom && !(stay.reservationRoomId ?? initialReservationRoomId) ? "pick-room" : "folio",
  );
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const [confirmContract, setConfirmContract] = useState<CheckOutContract | null>(null);
  const [completion, setCompletion] = useState<CheckOutCompletion | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [sharedCloseAck, setSharedCloseAck] = useState(false);
  const closedOnceRef = useRef(false);
  const openedOnceRef = useRef(false);
  const payKey = useRef(crypto.randomUUID());
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");

  useEffect(() => {
    if (!open) return;
    const fixed = stay.reservationRoomId ?? initialReservationRoomId ?? "";
    setReservationRoomId(fixed);
    setStage(multiRoom && !fixed ? "pick-room" : "folio");
    setReviewedFingerprint(null);
    setConfirmContract(null);
    setCompletion(null);
    setStaleMessage(null);
    setDenyMessage(null);
    setPaymentPanelOpen(false);
    setOverridePanelOpen(false);
    setOverrideReason("");
    setSharedCloseAck(false);
    closedOnceRef.current = false;
    openedOnceRef.current = false;
    setPayAmount("");
    setPayRef("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stay.id]);

  const fetchContract = useServerFn(getCheckOutContract);
  const fetchConfirmation = useServerFn(getCheckOutConfirmation);
  const fetchContext = useServerFn(getCheckOutContext);
  const ensureFolio = useServerFn(ensureCheckOutFolio);
  const postPayment = useServerFn(postCheckOutPayment);
  const overrideFn = useServerFn(overrideCheckOutSettlement);
  const closeFn = useServerFn(closeFolioAtCheckout);
  const complete = useServerFn(completeFoCheckOut);
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);

  const contractQuery = useQuery({
    queryKey: ["fo-check-out-contract", restaurantId, stay.id, reservationRoomId],
    queryFn: () =>
      fetchContract({
        data: {
          restaurantId,
          reservationId: stay.id,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: open && (stage === "folio" || stage === "pick-room") && Boolean(stay.id),
    retry: false,
  });
  const contract = contractQuery.data ?? null;

  // Display-only (property name / email capability); not part of the
  // financial contract and never gates eligibility.
  const contextQuery = useQuery({
    queryKey: ["fo-check-out-context", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });
  const propertyName = contextQuery.data?.propertyName ?? "Property";

  const approvalQuery = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "front_office.check_out.override"],
    queryFn: () =>
      fetchApproval({ data: { restaurantId, actionKey: "front_office.check_out.override" } }),
    enabled: open && stage === "folio",
    retry: false,
  });

  const sharedWarning = useMemo(
    () =>
      checkOutSharedFolioWarning({
        reservationRoomId: (contract?.reservationRoomId ?? reservationRoomId) || null,
        units: (stay.roomUnits ?? []).map((unit) => ({
          id: unit.id,
          roomNumber: unit.roomNumber ?? null,
          status: unit.status,
        })),
      }),
    [stay.roomUnits, contract?.reservationRoomId, reservationRoomId],
  );
  const sharedBlocksAutoClose = sharedWarning.shared && sharedWarning.siblingsInHouse.length > 0;

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-check-out-contract"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-check-out-context"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard"] });
  }

  // Side effect mirrors FO-FS2: open the folio the moment it is reviewed.
  // Still the existing writer (open_folio_for_reservation); no new insert.
  useEffect(() => {
    if (!open || stage !== "folio" || !contract) return;
    if (!contract.eligibility.folioMissing || openedOnceRef.current) return;
    openedOnceRef.current = true;
    void ensureFolio({ data: { restaurantId, reservationId: stay.id } })
      .then(() => contractQuery.refetch())
      .catch((error: unknown) => {
        openedOnceRef.current = false;
        if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
        else toast.error(errorText(error));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage, contract?.eligibility.folioMissing]);

  // Auto-close only when safe: settled, open, not overridden, and no sibling
  // room on this shared folio is still in-house. When a sibling is in-house,
  // closing is left to an explicit, acknowledged action (see below).
  useEffect(() => {
    if (!open || stage !== "folio" || !contract) return;
    if (!contract.eligibility.closeFolioRequired || closedOnceRef.current) return;
    if (sharedBlocksAutoClose && !sharedCloseAck) return;
    closedOnceRef.current = true;
    void closeFn({ data: { restaurantId, reservationId: stay.id } })
      .then(() => contractQuery.refetch())
      .catch((error: unknown) => {
        closedOnceRef.current = false;
        if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
        else toast.error(errorText(error));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    stage,
    contract?.eligibility.closeFolioRequired,
    sharedBlocksAutoClose,
    sharedCloseAck,
  ]);

  useEffect(() => {
    if (!contract) return;
    if (isOwesBalance(contract.folio?.balance ?? 0)) {
      setPayAmount(outstandingAmount(contract.folio?.balance ?? 0).toFixed(2));
    }
    // Only the balance should resync the prefilled amount, not every contract read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.folio?.balance]);

  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });
  useEffect(() => {
    if (!tenders.some((row) => row.code === payMethod)) setPayMethod(tenders[0]?.code ?? "");
  }, [payMethod, tenders]);

  const postPayMut = useMutation({
    mutationFn: () =>
      postPayment({
        data: {
          restaurantId,
          reservationId: stay.id,
          amount: Number(payAmount),
          method: payMethod,
          reference: payRef,
          idempotencyKey: payKey.current,
        },
      }),
    onSuccess: async () => {
      payKey.current = crypto.randomUUID();
      setPayRef("");
      closedOnceRef.current = false;
      await contractQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const overrideMut = useMutation({
    mutationFn: () =>
      overrideFn({ data: { restaurantId, reservationId: stay.id, reason: overrideReason.trim() } }),
    onSuccess: async () => {
      setOverrideReason("");
      setOverridePanelOpen(false);
      setDenyMessage(null);
      await contractQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const manualCloseMut = useMutation({
    mutationFn: () => closeFn({ data: { restaurantId, reservationId: stay.id } }),
    onSuccess: async () => {
      await contractQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const confirmationQuery = useQuery({
    queryKey: [
      "fo-check-out-confirmation",
      restaurantId,
      stay.id,
      reservationRoomId,
      reviewedFingerprint,
    ],
    queryFn: () =>
      fetchConfirmation({
        data: {
          restaurantId,
          reservationId: stay.id,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          ...(reviewedFingerprint ? { expectedFingerprint: reviewedFingerprint } : {}),
        },
      }),
    enabled: open && stage === "confirm" && Boolean(reviewedFingerprint),
    retry: false,
  });

  useEffect(() => {
    if (!confirmationQuery.data) return;
    if (confirmationQuery.data.stale) {
      setStaleMessage(CHECKOUT_STALE_MESSAGE);
      setStage("folio");
      setConfirmContract(null);
      void contractQuery.refetch();
      return;
    }
    setStaleMessage(null);
    setConfirmContract(confirmationQuery.data.contract);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmationQuery.data]);

  const completeMut = useMutation({
    mutationFn: () =>
      complete({
        data: {
          restaurantId,
          reservationId: stay.id,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          ...(confirmContract ? { expectedFingerprint: confirmContract.fingerprint } : {}),
        },
      }),
    onSuccess: (result) => {
      setCompletion(result.completion);
      setStage("complete");
      refreshDesk();
    },
    onError: (error) => {
      const message = errorText(error);
      if (message === CHECKOUT_STALE_MESSAGE) {
        setStaleMessage(message);
        setStage("folio");
        setConfirmContract(null);
        void contractQuery.refetch();
        return;
      }
      toast.error(message);
    },
  });

  function goToConfirmation() {
    if (!contract?.eligibility.checkoutAllowed) return;
    setReviewedFingerprint(contract.fingerprint);
    setStaleMessage(null);
    setStage("confirm");
  }

  function backToFolio() {
    setStage("folio");
    setConfirmContract(null);
    void contractQuery.refetch();
  }

  function printSnapshot(
    source: CheckOutContract | null,
    charges: CheckOutChargeItem[],
    payments: CheckOutPaymentItem[],
    overrideOpen: boolean,
  ) {
    if (!source) return;
    const snapshot = checkOutDocumentSnapshot({
      propertyName,
      guestName: source.guestName,
      confirmationNumber: source.confirmationNumber,
      roomNumber: source.roomNumber,
      arrivalDate: source.stay.arrivalDate,
      departureDate: source.stay.scheduledDepartureDate,
      folio: source.folio,
      charges,
      payments,
      overrideOpen,
    });
    const html = renderCheckoutDocumentHtml(snapshot);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => document.body.removeChild(frame), 1000);
  }

  function requestClose() {
    onOpenChange(false);
  }

  const stageIndex =
    stage === "pick-room" ? 0 : stage === "folio" ? 0 : stage === "confirm" ? 1 : 2;
  const balance = contract?.folio?.balance ?? 0;
  const badge = checkOutAccountingBadge({
    folio: contract?.folio ?? null,
    override: contract?.override ?? { recorded: false, kind: null, reason: null },
  });
  const checkOutAuth = approvalQuery.data;
  const dueLabel = checkOutDueLabel(
    contract?.stay.scheduledDepartureDate ?? stay.departureDate,
    contract?.businessDate ?? null,
  );
  const remaining = outstandingAmount(balance);
  const canPostPay = paymentAmountAllowed(Number(payAmount), remaining) && Boolean(payMethod);
  const overrideKind = overrideKindForBalance(balance);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? requestClose() : undefined)}>
      <DialogContent
        data-testid="fo-check-out-workspace"
        className="flex max-h-[92vh] w-[calc(100%-2rem)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[920px] [&>button:last-child]:text-[#F3E9D8]"
      >
        <header className={cn(HEADER_BG, "shrink-0 px-5 py-4 text-[#F3E9D8]")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-semibold">
                  Front Desk Check-Out &amp; Folio Review
                </h2>
                {contract?.folio?.folioNumber ? (
                  <span className="rounded-full bg-[#C89933]/20 px-2.5 py-0.5 text-xs font-semibold text-[#C89933]">
                    Folio #{contract.folio.folioNumber}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[#C7B79A]" data-testid="fo-check-out-step-label">
                {stage === "complete"
                  ? "Step Complete: Departure Processed"
                  : stage === "confirm"
                    ? "Step 2 of 2: Final Confirmation & Turnover"
                    : "Step 1 of 2: Folio Verification & Settlement"}
              </p>
            </div>
            <p className="text-xs text-[#C7B79A]" data-testid="fo-check-out-business-date">
              Business Date:{" "}
              {contract?.businessDate ? formatCheckoutDate(contract.businessDate) : "—"}
            </p>
          </div>
        </header>

        <nav className={cn(RAIL_BG, "shrink-0 px-5 py-2.5")}>
          <ol className="flex flex-wrap items-center gap-2 text-xs">
            {(
              [
                { id: 0, label: "Folio Review & Settlement" },
                { id: 1, label: "Final Confirmation" },
                { id: 2, label: "Departure Complete" },
              ] as const
            ).map((step, idx) => (
              <li key={step.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                    step.id < stageIndex && "bg-[#436436]/25 text-[#8FD19E]",
                    step.id === stageIndex && "bg-[#C89933] text-[#251605]",
                    step.id > stageIndex && "text-[#8A7A61]",
                  )}
                >
                  {step.id < stageIndex ? <CheckCircle2 className="size-3.5" /> : null}
                  {step.id + 1} {step.label}
                </span>
                {idx < 2 ? <span className="text-[#8A7A61]">→</span> : null}
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F0] px-5 py-4">
          {denyMessage ? <PermissionDeniedPanel className="mb-4" message={denyMessage} /> : null}
          {staleMessage && stage === "folio" ? (
            <p
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="fo-check-out-stale"
            >
              {staleMessage}
            </p>
          ) : null}

          {stage === "pick-room" ? (
            <div className="space-y-4" data-testid="fo-check-out-pick-room">
              <p className="text-sm text-muted-foreground">
                This reservation has more than one room. Choose which room is checking out.
              </p>
              <RoomUnitTargetSelect
                units={stay.roomUnits}
                value={reservationRoomId}
                onChange={setReservationRoomId}
              />
              <RoomUnitOccupantContext
                stayGuestId={stay.guestId}
                units={stay.roomUnits}
                selectedId={reservationRoomId}
              />
              <Button
                type="button"
                className={GOLD}
                disabled={!reservationRoomId}
                onClick={() => setStage("folio")}
              >
                Continue
              </Button>
            </div>
          ) : null}

          {stage === "folio" ? (
            contractQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading folio review…</p>
            ) : contractQuery.isError && isPermissionDeniedMessage(contractQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contractQuery.error)} />
            ) : contractQuery.isError ? (
              <p className="text-sm text-destructive">{errorText(contractQuery.error)}</p>
            ) : contract ? (
              <div className="space-y-4" data-testid="fo-check-out-stage-folio">
                <StaySummaryCard contract={contract} dueLabel={dueLabel} />

                {sharedWarning.shared && sharedWarning.siblingsInHouse.length > 0 ? (
                  <div
                    className="flex items-start gap-3 rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-4 py-3"
                    data-testid="fo-check-out-shared-folio-warning"
                  >
                    <Users className="mt-0.5 size-4 shrink-0 text-[#8A6A1F]" />
                    <div className="space-y-1 text-sm text-[#5B4616]">
                      <p className="font-semibold">
                        This folio is shared with other active rooms on this reservation.
                      </p>
                      <p>
                        Settling or closing the folio may affect those rooms —{" "}
                        {sharedWarning.siblingsInHouse.length} room
                        {sharedWarning.siblingsInHouse.length === 1 ? "" : "s"} still in-house (
                        {sharedWarning.siblingsInHouse
                          .map((unit) => unit.roomNumber ?? "unassigned")
                          .join(", ")}
                        ).
                      </p>
                      {contract.eligibility.closeFolioRequired && !sharedCloseAck ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          data-testid="fo-check-out-shared-close-ack"
                          onClick={() => setSharedCloseAck(true)}
                        >
                          I understand — close this folio anyway
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <section className="rounded-xl border border-[#E8E1D7] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-[#251605]">
                      Folio Balance &amp; Accounting Summary
                    </h3>
                    <AccountingBadge badge={badge} />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <SummaryCard
                      label="Total Charges (Debit)"
                      amount={money(contract.folio?.charges ?? 0)}
                      sub={`${contract.charges.length} posted charge item${contract.charges.length === 1 ? "" : "s"}`}
                    />
                    <SummaryCard
                      label="Payments & Credits (Credit)"
                      amount={money(contract.folio?.credits ?? 0)}
                      sub={`${contract.payments.length} recorded payment${contract.payments.length === 1 ? "" : "s"}`}
                    />
                    <SummaryCard
                      label="Outstanding Balance"
                      amount={money(balance)}
                      sub={
                        badge === "paid_in_full"
                          ? "Account clear for departure"
                          : badge === "credit"
                            ? "Credit on folio"
                            : "Settle to continue"
                      }
                      tone={badge === "paid_in_full" ? "good" : badge === "credit" ? "warn" : "bad"}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Review all posted ledger entries below before confirming departure.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isOwesBalance(balance) ? (
                      <Button
                        type="button"
                        className={GOLD}
                        data-testid="fo-check-out-record-payment"
                        onClick={() => setPaymentPanelOpen((v) => !v)}
                      >
                        Record Payment
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="fo-check-out-print-folio"
                      onClick={() =>
                        printSnapshot(
                          contract,
                          contract.charges,
                          contract.payments,
                          contract.override.recorded,
                        )
                      }
                    >
                      <Printer className="mr-1 size-3.5" />
                      Print Folio
                    </Button>
                    {contract.eligibility.overrideAvailable || contract.override.recorded ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" data-testid="fo-check-out-more">
                            More
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!contract.eligibility.overrideAvailable}
                            data-testid="fo-check-out-override-menu"
                            onSelect={() => setOverridePanelOpen(true)}
                          >
                            Override settlement
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>

                  {contract.override.recorded ? (
                    <p className="mt-3 inline-flex rounded-full bg-[#C89933] px-2.5 py-1 text-xs font-semibold text-[#251605]">
                      {FOLIO_LEFT_OPEN_CHIP}
                      {contract.override.reason ? ` · ${contract.override.reason}` : ""}
                    </p>
                  ) : null}

                  {paymentPanelOpen && isOwesBalance(balance) ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-border p-3">
                      <Field label="Amount">
                        <Input
                          type="number"
                          min={0.01}
                          step="0.01"
                          max={remaining}
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                        />
                      </Field>
                      <p className="text-xs text-muted-foreground">
                        Outstanding {money(remaining)}.
                      </p>
                      {tenders.length === 0 ? (
                        <p className="text-sm text-[#C89933]">
                          No active payment methods. Configure them in{" "}
                          <a href={POLISH1_PAYMENT_METHODS_HREF} className="underline">
                            Payment methods
                          </a>
                          .
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tenders.map((tender) => (
                            <button
                              key={tender.code}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm",
                                payMethod === tender.code
                                  ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]"
                                  : "border-[#CCCCCC] text-muted-foreground",
                              )}
                              onClick={() => setPayMethod(tender.code)}
                            >
                              {tender.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <Field label="Reference">
                        <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                      </Field>
                      <Button
                        type="button"
                        className={GOLD}
                        disabled={!canPostPay || postPayMut.isPending}
                        onClick={() => postPayMut.mutate()}
                      >
                        {postPayMut.isPending ? "Posting…" : "Post payment"}
                      </Button>
                    </div>
                  ) : null}

                  {overridePanelOpen && overrideKind ? (
                    <div className="mt-4">
                      <FoAuthorizationCard
                        requirement={checkOutAuth}
                        guestLine={`${contract.guestName} · ${contract.confirmationNumber}`}
                        reason={overrideReason}
                        onReasonChange={setOverrideReason}
                        pending={overrideMut.isPending}
                        confirmLabel="Record override"
                        onAuthorize={() => overrideMut.mutate()}
                        reasonId="checkout-workspace-override"
                      />
                    </div>
                  ) : null}

                  {sharedBlocksAutoClose &&
                  sharedCloseAck &&
                  contract.eligibility.closeFolioRequired ? (
                    <Button
                      type="button"
                      className={cn(GOLD, "mt-3")}
                      data-testid="fo-check-out-shared-close"
                      disabled={manualCloseMut.isPending}
                      onClick={() => manualCloseMut.mutate()}
                    >
                      {manualCloseMut.isPending ? "Closing…" : "Close Folio"}
                    </Button>
                  ) : null}
                </section>

                <ItemizedChargesTable charges={contract.charges} money={money} />
                <PaymentsCreditsTable payments={contract.payments} money={money} />
              </div>
            ) : null
          ) : null}

          {stage === "confirm" ? (
            <FinalConfirmationStage
              contract={confirmContract}
              loading={confirmationQuery.isFetching && !confirmContract}
              money={money}
            />
          ) : null}

          {stage === "complete" && completion ? (
            <DepartureCompleteStage completion={completion} money={money} />
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-[#E8E1D7] bg-white px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {stage === "folio" ? (
              <>
                <Button type="button" variant="ghost" onClick={requestClose}>
                  Cancel &amp; Return
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      contract &&
                      printSnapshot(
                        contract,
                        contract.charges,
                        contract.payments,
                        contract.override.recorded,
                      )
                    }
                    disabled={!contract}
                  >
                    Print Folio
                  </Button>
                  <Button
                    type="button"
                    className={GOLD}
                    data-testid="fo-check-out-continue"
                    disabled={!contract?.eligibility.checkoutAllowed}
                    onClick={goToConfirmation}
                  >
                    Continue to Confirmation →
                  </Button>
                </div>
              </>
            ) : stage === "confirm" ? (
              <>
                <Button type="button" variant="outline" onClick={backToFolio}>
                  ← Back to Folio
                </Button>
                <Button
                  type="button"
                  className={GOLD}
                  data-testid="fo-check-out-confirm"
                  disabled={!confirmContract || completeMut.isPending}
                  onClick={() => completeMut.mutate()}
                >
                  {completeMut.isPending ? "Checking out…" : "Confirm Check-Out →"}
                </Button>
              </>
            ) : stage === "complete" && completion ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="fo-check-out-print-receipt"
                  onClick={() =>
                    printSnapshot(
                      confirmContract,
                      confirmContract?.charges ?? [],
                      confirmContract?.payments ?? [],
                      completion.settlement !== "settled",
                    )
                  }
                >
                  <Printer className="mr-1 size-3.5" />
                  Print Final Folio Receipt
                </Button>
                <Button
                  type="button"
                  className="bg-[#1F140A] text-[#F3E9D8] hover:bg-[#1F140A]/90"
                  data-testid="fo-check-out-done"
                  onClick={requestClose}
                >
                  Done
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={requestClose}>
                Cancel &amp; Return
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StaySummaryCard({
  contract,
  dueLabel,
}: {
  contract: CheckOutContract;
  dueLabel: "due_out_today" | "in_house";
}) {
  return (
    <section
      className="rounded-xl border border-[#E8E1D7] bg-white p-4"
      data-testid="fo-check-out-stay-summary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-semibold text-[#251605]">
          {contract.guestName}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            dueLabel === "due_out_today"
              ? "bg-[#C89933]/20 text-[#8A6A1F]"
              : "bg-[#436436]/15 text-[#436436]",
          )}
        >
          {dueLabel === "due_out_today" ? "DUE OUT TODAY" : "IN-HOUSE"}
        </span>
        <span className="text-xs text-muted-foreground">
          Unit: {contract.roomNumber ? `Room #${contract.roomNumber}` : "Unassigned"}
          {contract.roomTypeName ? ` · Category: ${contract.roomTypeName}` : ""}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Detail label="Arrival" value={formatStayDate(contract.stay.arrivalDate)} />
        <Detail
          label="Scheduled departure"
          value={formatStayDate(contract.stay.scheduledDepartureDate)}
        />
        <Detail
          label="Duration & occupancy"
          value={`${contract.stay.nights} night${contract.stay.nights === 1 ? "" : "s"} · ${contract.stay.adults} adult${contract.stay.adults === 1 ? "" : "s"}`}
        />
        <Detail label="Booking reference" value={contract.confirmationNumber} />
      </dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  sub,
  tone,
}: {
  label: string;
  amount: string;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <article className="rounded-xl border border-[#E8E1D7] bg-[#FBF7F0] p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg",
          tone === "good" && "text-[#436436]",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-[#8A6A1F]",
          !tone && "text-[#251605]",
        )}
      >
        {amount}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </article>
  );
}

function AccountingBadge({ badge }: { badge: ReturnType<typeof checkOutAccountingBadge> }) {
  const label =
    badge === "paid_in_full"
      ? "Paid in Full"
      : badge === "credit"
        ? "Credit"
        : badge === "override_open"
          ? "Override — Left Open"
          : badge === "no_folio"
            ? "No Folio"
            : "Balance Due";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        badge === "paid_in_full" && "bg-[#436436]/15 text-[#436436]",
        badge === "balance_due" && "bg-destructive/10 text-destructive",
        badge === "credit" && "bg-[#C89933]/20 text-[#8A6A1F]",
        badge === "override_open" && "bg-[#C89933]/20 text-[#8A6A1F]",
        badge === "no_folio" && "bg-[#CCCCCC]/40 text-muted-foreground",
      )}
      data-testid="fo-check-out-accounting-badge"
    >
      {label}
    </span>
  );
}

function ItemizedChargesTable({
  charges,
  money,
}: {
  charges: CheckOutChargeItem[];
  money: (value: number) => string;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-[#E8E1D7] bg-white"
      data-testid="fo-check-out-charges-table"
    >
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-3 py-2">
        <h4 className="text-xs font-semibold text-[#251605]">
          Itemized Charges &amp; Taxes ({charges.length})
        </h4>
        <span className="text-xs text-muted-foreground">
          Sum {money(charges.reduce((sum, row) => sum + row.amount, 0))}
        </span>
      </div>
      {charges.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">No charges posted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Posted By</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((row) => (
                <tr key={row.transactionId} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatStayDate(row.postedAt.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.category}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2">{row.quantity ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{money(row.amount)}</td>
                  <td className="px-3 py-2">{row.postedBy ?? row.source ?? "System"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentsCreditsTable({
  payments,
  money,
}: {
  payments: CheckOutPaymentItem[];
  money: (value: number) => string;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-[#E8E1D7] bg-white"
      data-testid="fo-check-out-payments-table"
    >
      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-3 py-2">
        <h4 className="text-xs font-semibold text-[#251605]">
          Recorded Payments &amp; Credits ({payments.length})
        </h4>
        <span className="text-xs text-muted-foreground">
          Total paid {money(payments.reduce((sum, row) => sum + row.amount, 0))}
        </span>
      </div>
      {payments.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Payment Method</th>
                <th className="px-3 py-2 font-medium">Reference / Txn ID</th>
                <th className="px-3 py-2 font-medium">Cashier / Channel</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.transactionId} className="border-t border-[#E8E1D7]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatStayDate(row.postedAt.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.method ?? "—"}</td>
                  <td className="px-3 py-2">{row.reference ?? "—"}</td>
                  <td className="px-3 py-2">{row.cashier ?? row.channel ?? "System"}</td>
                  <td className="px-3 py-2 text-right">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Exported for tests only — the stage orchestration above wires the real data in. */
export function FinalConfirmationStage({
  contract,
  loading,
  money,
}: {
  contract: CheckOutContract | null;
  loading: boolean;
  money: (value: number) => string;
}) {
  if (loading || !contract) {
    return <p className="text-sm text-muted-foreground">Reviewing the fresh folio…</p>;
  }
  const target = contract.housekeeping.targetStatus ?? "dirty";
  return (
    <div className="space-y-4 text-center" data-testid="fo-check-out-stage-confirm">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#436436]/15">
        <CheckCircle2 className="size-5 text-[#436436]" />
      </div>
      <h3 className="font-display text-lg text-[#251605]">
        Confirm Guest Departure &amp; Key Handover
      </h3>
      <p className="text-sm text-muted-foreground">
        Review the departure summary before closing the guest stay and vacating the room unit.
      </p>
      <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 text-left">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Guest Name</span>
          <span className="font-medium text-[#251605]">{contract.guestName}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Vacating Room
          </span>
          <span className="rounded-full bg-[#436436]/15 px-2 py-0.5 text-xs font-semibold text-[#436436]">
            {contract.roomNumber ? `Room #${contract.roomNumber}` : "Unassigned"}
          </span>
        </div>
        <div className="mt-3 space-y-1 border-t border-[#E8E1D7] pt-3 text-sm">
          <Row label="Total Stay Charges" value={money(contract.folio?.charges ?? 0)} />
          <Row label="Total Payments Received" value={money(contract.folio?.credits ?? 0)} />
          <Row
            label="Final Balance"
            value={money(contract.folio?.balance ?? 0)}
            emphasis
            testId="fo-check-out-final-balance"
          />
        </div>
        <div className="mt-3 rounded-lg bg-[#2F6FA6]/10 px-3 py-2 text-xs text-[#20507A]">
          <strong>Housekeeping Turnover Trigger:</strong> Completing check-out will automatically
          set {contract.roomNumber ? `Room #${contract.roomNumber}` : "this room"} to{" "}
          {target.replaceAll("_", " ")} status for housekeeping inspection and linen change.
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
  testId,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? "font-display text-base text-[#251605]" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

/** Exported for tests only — the stage orchestration above wires the real data in. */
export function DepartureCompleteStage({
  completion,
  money,
}: {
  completion: CheckOutCompletion;
  money: (value: number) => string;
}) {
  const folioState =
    completion.settlement === "settled"
      ? `Settled in Full (${money(completion.folioBalance)} Balance)`
      : completion.settlement === "override_unpaid"
        ? "Left open — unpaid override"
        : completion.settlement === "override_credit"
          ? "Left open — credit override"
          : "Open";
  return (
    <div className="space-y-4 text-center" data-testid="fo-check-out-stage-complete">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#436436]/15">
        <CheckCircle2 className="size-6 text-[#436436]" />
      </div>
      <h3 className="font-display text-lg text-[#251605]">Check-Out Successfully Processed!</h3>
      <p className="text-sm text-muted-foreground">
        Guest {completion.guestName} is now marked as departed.
      </p>
      <div className="space-y-2 rounded-xl border border-[#E8E1D7] bg-white p-4 text-left text-sm">
        <Row label="Booking Reference" value={completion.confirmationNumber} />
        <Row
          label="Room Status"
          value={
            completion.roomNumber
              ? `Room #${completion.roomNumber} → ${(completion.housekeeping.targetStatus ?? "Dirty").replaceAll("_", " ")} (Housekeeping Turnover)`
              : "No room on this stay"
          }
        />
        <Row label="Folio Accounting" value={folioState} testId="fo-check-out-folio-accounting" />
        <Row label="Final Outstanding Balance" value={money(completion.folioBalance)} />
        <Row
          label="Audit Timestamp"
          value={completion.checkedOutAt ? new Date(completion.checkedOutAt).toLocaleString() : "—"}
        />
      </div>
    </div>
  );
}
