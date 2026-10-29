/**
 * Check-In Step 5. Rendered inside the shared workspace sheet.
 * Readiness comes from getCheckInReadiness. Completion uses completeFoCheckIn once.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2, Pencil } from "lucide-react";

import { useAuth } from "@/core/state/auth-store";
import { FO_CHECK_IN_POLL_MS } from "@/packages/pms/lib/fo-freshness";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  DepositFacts,
  IdentityTone,
  ReadinessCard,
  ReviewBanner,
} from "@/packages/pms/components/frontoffice/fo-checkin-v2-review-panels";
import { RegistrationPrintLayer } from "@/packages/pms/components/frontoffice/fo-checkin-v2-review-print";
import { completeFoCheckIn } from "@/packages/pms/lib/fo-check-in.functions";
import { servicePostingNotice } from "@/packages/pms/lib/reservation-service-lines";
import { toast } from "sonner";
import {
  registrationCompletionProjection,
  type CheckInReadiness,
} from "@/packages/pms/lib/fo-check-in-readiness";
import { getCheckInAgreement } from "@/packages/pms/lib/fo-check-in-agreement.functions";
import { getCheckInRegistration } from "@/packages/pms/lib/fo-check-in-registration.functions";
import { getCheckInReadiness } from "@/packages/pms/lib/fo-check-in-readiness.functions";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  getGuest,
  getGuestDocument,
  listGuestIdentityDocumentTypes,
} from "@/packages/pms/lib/guests.functions";
import {
  agreementAcknowledgementItems,
  agreementSignaturePath,
  agreementVersionLabel,
  formatAgreementTimestamp,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import {
  registrationDraft,
  registrationRelationship,
} from "@/packages/pms/lib/fo-checkin-v2-registration-model";
import {
  checkInStep1Presentation,
  classifyCheckInUnitFailure,
  type CheckInV2StepId,
} from "@/packages/pms/lib/fo-checkin-v2-model";
import {
  buildRegistrationFormView,
  checkInCommandTarget,
  completeCheckInEnabled,
  completionFailureCopy,
  formatAgreementTimestamp as formatReviewTimestamp,
  identityReviewTone,
  propertyAddressLine,
  reviewDepositView,
  roomReadinessLabel,
  staffDisplayName,
  unitAlreadyCheckedIn,
  maskedIdentityNumber,
  type RegistrationFormView,
} from "@/packages/pms/lib/fo-checkin-v2-review-model";
import { Button } from "@/shared/components/ui/button";
import { DialogOverlay, DialogPortal } from "@/shared/components/ui/dialog";

export type CheckInReviewHandle = {
  requestComplete: () => void;
  print: () => void;
};

export type CheckInReviewActions = {
  canComplete: boolean;
  busy: boolean;
  checkedIn: boolean;
  roomReadiness: string | null;
};

export const FoCheckInV2Review = forwardRef<
  CheckInReviewHandle,
  {
    restaurantId: string;
    reservationId: string;
    reservationRoomId: string | null;
    unit: CheckInUnitRead;
    reservation: ReservationDetail | null;
    confirmationNumber: string | null;
    onEdit: (step: CheckInV2StepId) => void;
    onActions: (actions: CheckInReviewActions) => void;
    onClose: () => void;
    onRefresh: () => void;
  }
>(function FoCheckInV2Review(
  {
    restaurantId,
    reservationId,
    reservationRoomId,
    unit,
    reservation,
    confirmationNumber,
    onEdit,
    onActions,
    onClose,
    onRefresh,
  },
  ref,
) {
  const { user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const fetchReadiness = useServerFn(getCheckInReadiness);
  const fetchRegistration = useServerFn(getCheckInRegistration);
  const fetchGuest = useServerFn(getGuest);
  const fetchTypes = useServerFn(listGuestIdentityDocumentTypes);
  const fetchDocument = useServerFn(getGuestDocument);
  const fetchAgreement = useServerFn(getCheckInAgreement);
  const completeCheckIn = useServerFn(completeFoCheckIn);
  const successRef = useRef<HTMLElement>(null);
  const enabledRef = useRef(false);
  const outcomeRef = useRef<"completed" | "checked_in_stamp_pending" | null>(null);
  const lockRef = useRef(false);
  const [outcome, setOutcome] = useState<"completed" | "checked_in_stamp_pending" | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printForm, setPrintForm] = useState<RegistrationFormView | null>(null);

  const membershipQuery = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: Boolean(user?.id),
    retry: false,
  });
  const property =
    membershipQuery.data?.find((row) => row.restaurantId === restaurantId)?.restaurant ?? null;

  const readinessQuery = useQuery({
    queryKey: ["fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchReadiness({
        data: checkInCommandTarget({ restaurantId, reservationId, reservationRoomId }),
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: FO_CHECK_IN_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const registrationQuery = useQuery({
    queryKey: ["fo-ci-v2-registration", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchRegistration({
        data: checkInCommandTarget({ restaurantId, reservationId, reservationRoomId }),
      }),
    retry: false,
  });
  const agreementQuery = useQuery({
    queryKey: ["fo-ci-v2-agreement", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchAgreement({
        data: checkInCommandTarget({ restaurantId, reservationId, reservationRoomId }),
      }),
    retry: false,
  });
  const registration = registrationQuery.data ?? null;
  const agreement = agreementQuery.data ?? null;
  const guestQuery = useQuery({
    queryKey: ["fo-ci-v2-registration-guest", restaurantId, registration?.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: registration!.guestId } }),
    enabled: Boolean(registration?.guestId),
    retry: false,
  });
  const typesQuery = useQuery({
    queryKey: ["fo-ci-v2-id-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const documentId = registration?.documents[0]?.id ?? null;
  const documentQuery = useQuery({
    queryKey: ["fo-ci-v2-document", restaurantId, registration?.guestId, documentId],
    queryFn: () =>
      fetchDocument({
        data: {
          restaurantId,
          guestId: registration!.guestId,
          documentId: documentId!,
        },
      }),
    enabled: Boolean(registration?.guestId && documentId),
    retry: false,
  });
  const signedRecord = agreement?.signed && !agreement.draft ? agreement.signed : null;
  const signatureQuery = useQuery({
    queryKey: ["fo-ci-v2-agreement-signature", restaurantId, reservationId, signedRecord?.id],
    queryFn: async () => {
      if (!signedRecord?.hasSignature) return null;
      const path = agreementSignaturePath(restaurantId, reservationId, signedRecord.id);
      const { data, error } = await supabase.storage
        .from("property-images")
        .createSignedUrl(path, 600);
      return error ? null : data.signedUrl;
    },
    enabled: Boolean(signedRecord?.hasSignature),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const readiness = readinessQuery.data ?? null;
  const guest = guestQuery.data?.guest ?? null;
  const already = unitAlreadyCheckedIn(unit.status);
  const checkedIn = Boolean(outcome) || already;
  const stampPending = outcome === "checked_in_stamp_pending";
  const enabled = completeCheckInEnabled({
    canCheckIn: readiness?.canCheckIn,
    pending: busy,
    alreadyCheckedIn: already,
    outcome,
  });
  enabledRef.current = enabled;
  outcomeRef.current = outcome;
  const view = checkInStep1Presentation(unit);
  const deposit = readiness ? reviewDepositView(readiness, unit.currency) : null;
  const confirmation = confirmationNumber ?? reservation?.confirmationNumber ?? null;

  const draft = useMemo(() => {
    if (!registration) return null;
    return registrationDraft(registration.fields, {
      firstName: guest?.firstName ?? null,
      middleName: guest?.middleName ?? null,
      lastName: guest?.lastName ?? null,
      dateOfBirth: guest?.dateOfBirth ?? null,
      nationality: guest?.nationality ?? null,
      phone: guest?.phone ?? null,
      email: guest?.email ?? null,
      addressLine1: guest?.addressLine1 ?? null,
      addressLine2: guest?.addressLine2 ?? null,
      city: guest?.city ?? null,
      country: guest?.country ?? null,
      postalCode: guest?.postalCode ?? null,
    });
  }, [guest, registration]);

  const fullName =
    [draft?.firstName, draft?.middleName, draft?.lastName].filter(Boolean).join(" ").trim() ||
    unit.primaryGuestName;
  const address =
    [draft?.addressLine1, draft?.addressLine2, draft?.city, draft?.country, draft?.postalCode]
      .filter(Boolean)
      .join(", ") || null;
  const identityDocument = registration?.documents[0] ?? null;
  const documentDetail =
    documentQuery.data && "document" in documentQuery.data ? documentQuery.data.document : null;
  const idTypeName =
    typesQuery.data?.types?.find((type) => type.id === identityDocument?.typeId)?.name ??
    documentDetail?.typeName ??
    identityDocument?.kind ??
    null;
  const idNumber =
    documentDetail?.documentNumberMasked ??
    maskedIdentityNumber(identityDocument?.documentNumber) ??
    "—";
  const signatureUrl =
    agreement?.guestId === unit.primaryGuestId ? (signatureQuery.data ?? null) : null;
  const checkInTime = formatReviewTimestamp(
    completedAt ?? (already ? unit.progress.completedAt : null),
  );

  function currentForm(generatedAt: string): RegistrationFormView {
    const tone = readiness ? identityReviewTone(readiness) : null;
    return buildRegistrationFormView({
      checkedIn,
      stampPending,
      generatedAt,
      property: property
        ? {
            name: property.name,
            address: propertyAddressLine([
              property.address,
              property.city,
              property.postcode,
              property.country,
            ]),
            phone: property.phone,
            email: property.email,
            logoUrl: property.logoUrl,
          }
        : null,
      guestName: fullName,
      profileNumber: guest?.profileNumber ?? null,
      dateOfBirth: draft?.dateOfBirth || null,
      nationality: draft?.nationality || null,
      phone: draft?.phone || guest?.phone || null,
      email: draft?.email || guest?.email || null,
      address,
      confirmationNumber: confirmation,
      reservationStatus: unit.status,
      bookingSource: reservation?.commercialBookingSource || reservation?.source || null,
      companyName: reservation?.companyName ?? null,
      travelAgentName: reservation?.travelAgentName ?? null,
      groupName: reservation?.groupName ?? null,
      arrivalDate: unit.arrivalDate,
      departureDate: unit.departureDate,
      nights: view.nights,
      adults: unit.adults,
      children: unit.children,
      roomNumber: unit.roomNumber,
      roomTypeName: unit.roomTypeName,
      ratePlanName: unit.ratePlanName,
      currency: unit.currency,
      roomCharge: unit.subtotal,
      deposit,
      idType: idTypeName,
      idNumber: identityDocument?.documentNumber ?? documentDetail?.documentNumberMasked ?? null,
      idCountry: documentDetail?.issuingCountry ?? identityDocument?.issuingCountry ?? null,
      idExpiry: documentDetail?.expiryDate ?? identityDocument?.expiryDate ?? null,
      idIssueDate: documentDetail?.issueDate ?? null,
      idVerification:
        tone === "warning"
          ? "Unverified"
          : tone === "blocker"
            ? "Blocking"
            : tone === "satisfied"
              ? "Satisfied"
              : null,
      agreement,
      signatureUrl,
      checkInTime: checkInTime === "—" ? null : checkInTime,
      processedBy: staffDisplayName(user),
    });
  }

  useEffect(() => {
    onActions({
      canComplete: enabled,
      busy,
      checkedIn,
      roomReadiness: readiness ? roomReadinessLabel(readiness.room) : null,
    });
  }, [busy, checkedIn, enabled, onActions, readiness]);

  useEffect(() => {
    setOutcome(null);
    setCompletedAt(null);
    setFormError(null);
    outcomeRef.current = null;
  }, [reservationId, reservationRoomId]);

  useEffect(() => {
    if (!checkedIn) return;
    successRef.current?.focus();
  }, [checkedIn, outcome]);

  useEffect(() => {
    if (!formError) return;
    document.getElementById("fo-ci-v2-review-error")?.focus();
  }, [formError]);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  function requestComplete() {
    if (!enabledRef.current || outcomeRef.current) return;
    setConfirmOpen(true);
  }

  function print() {
    setPrintForm(currentForm(new Date().toLocaleString()));
    setPrinting(true);
  }

  async function complete(): Promise<void> {
    if (lockRef.current || outcomeRef.current || unitAlreadyCheckedIn(unit.status)) return;
    if (readiness?.canCheckIn !== true) return;
    lockRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const result = await completeCheckIn({
        data: checkInCommandTarget({ restaurantId, reservationId, reservationRoomId }),
      });
      outcomeRef.current = result.outcome;
      setOutcome(result.outcome);
      const notice = servicePostingNotice(result.servicePosting);
      if (notice) {
        if (notice.tone === "warning") toast.warning(notice.message);
        else toast.success(notice.message);
      }
      setCompletedAt(new Date().toISOString());
      setConfirmOpen(false);
      onRefresh();
      await readinessQuery.refetch();
    } catch (error) {
      const failure = completionFailureCopy(error);
      setFormError(failure.message);
      setConfirmOpen(false);
      if (failure.blocked) await readinessQuery.refetch();
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  }

  const apiRef = useRef({ requestComplete, print });
  apiRef.current = { requestComplete, print };
  useImperativeHandle(
    ref,
    () => ({
      requestComplete: () => apiRef.current.requestComplete(),
      print: () => apiRef.current.print(),
    }),
    [],
  );

  const roomLabel = unit.roomNumber ? `Room ${unit.roomNumber}` : "this stay";
  const failure = readinessQuery.isError ? classifyCheckInUnitFailure(readinessQuery.error) : null;

  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="fo-ci-v2-review"
      data-guest-id={readiness?.target?.guestId ?? unit.primaryGuestId}
      data-reservation-room-id={reservationRoomId ?? ""}
    >
      {checkedIn ? (
        <section
          ref={successRef}
          tabIndex={-1}
          className="rounded-xl border border-[#436436]/30 bg-[#436436]/10 px-4 py-4 outline-none"
          data-testid="fo-ci-v2-review-complete"
          role="status"
        >
          <p className="flex items-center gap-2 text-base font-bold text-[#436436]">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            Guest Checked In
          </p>
          <p className="mt-1 text-sm text-[#251605]">
            {outcome
              ? `${fullName} has been checked in successfully.`
              : `${fullName} is already checked in.`}
          </p>
          {stampPending ? (
            <p className="mt-2 text-sm text-[#8B6914]" data-testid="fo-ci-v2-review-stamp-pending">
              The room status was successfully updated to Checked In. Progress synchronization is
              still pending and will be reconciled automatically.
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            <Fact
              label="Room"
              value={unit.roomNumber ? `Room ${unit.roomNumber}` : "No room assigned"}
            />
            {checkInTime !== "—" ? <Fact label="Check-In Time" value={checkInTime} /> : null}
            <Fact label="Reservation / Unit Status" value="Checked In" />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={print}>
              Print Registration Form
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </section>
      ) : null}

      {readinessQuery.isLoading ? (
        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#6B5E4E]"
          data-testid="fo-ci-v2-review-loading"
        >
          <p id="fo-ci-v2-complete-reason">Loading check-in readiness…</p>
        </div>
      ) : failure || !readiness ? (
        <div
          className="rounded-xl border border-red-200 bg-white p-6"
          data-testid="fo-ci-v2-review-readiness-error"
        >
          <p id="fo-ci-v2-complete-reason" className="text-sm text-red-800">
            {failure === "permission_denied"
              ? "You don't have access to complete this check-in."
              : failure === "room_unit_required"
                ? "Choose which room this check-in applies to."
                : failure === "reservation_not_found"
                  ? "This reservation could not be found for the property."
                  : "Check-in readiness could not be loaded. Try again."}
          </p>
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
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <div className="min-w-0 space-y-4">
            {checkedIn ? null : <ReviewBanner readiness={readiness} />}
            <ReviewCard
              title="1. Guest & Reservation"
              summary="Guest details and reservation information have been collected."
              testId="fo-ci-v2-review-step-1"
              editLabel="Edit Guest & Reservation"
              onEdit={() => onEdit("guest_reservation")}
            >
              <dl className="grid gap-2 sm:grid-cols-2">
                <Fact label="Guest Name" value={unit.primaryGuestName} />
                <Fact label="Confirmation" value={confirmation ?? "—"} />
                <Fact
                  label="Stay"
                  value={`${formatStayDate(unit.arrivalDate)} → ${formatStayDate(unit.departureDate)}`}
                />
                <Fact label="Nights" value={String(view.nights)} />
                <Fact label="Adults" value={String(unit.adults)} />
                <Fact label="Children" value={String(unit.children)} />
                <Fact
                  label="Room"
                  value={unit.roomNumber ? `Room ${unit.roomNumber}` : "No room assigned"}
                />
                <Fact label="Room Type" value={unit.roomTypeName ?? "—"} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
                    Reservation Status
                  </p>
                  {unit.status ? (
                    <ReservationStatusBadge status={unit.status as never} />
                  ) : (
                    <p className="text-sm text-[#251605]">—</p>
                  )}
                </div>
                {unit.guestSource === "booker" ? (
                  <Fact label="Guest relationship" value={registrationRelationship("booker")} />
                ) : null}
              </dl>
            </ReviewCard>
            <ReviewCard
              title="2. Registration"
              summary="Registration details recorded for this guest."
              testId="fo-ci-v2-review-step-2"
              editLabel="Edit Registration"
              onEdit={() => onEdit("registration")}
            >
              <IdentityTone readiness={readiness} />
              <RegistrationCompletionCopy readiness={readiness} unit={unit} />
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <Fact label="Full Name" value={fullName} />
                <Fact label="Date of Birth" value={draft?.dateOfBirth || "—"} />
                <Fact label="Nationality" value={draft?.nationality || "—"} />
                <Fact label="ID Type" value={idTypeName ?? "—"} />
                <Fact label="ID Number" value={idNumber} />
                <Fact label="Issue Date" value={documentDetail?.issueDate || "—"} />
                <Fact
                  label="Expiry Date"
                  value={documentDetail?.expiryDate ?? identityDocument?.expiryDate ?? "—"}
                />
              </dl>
            </ReviewCard>
            <ReviewCard
              title="3. Payment & Guarantee"
              summary="Deposit and guarantee state for this reservation."
              testId="fo-ci-v2-review-step-3"
              editLabel="Edit Payment & Guarantee"
              onEdit={() => onEdit("payment_guarantee")}
            >
              {deposit ? (
                <DepositFacts deposit={deposit} />
              ) : (
                <p className="text-sm text-[#6B5E4E]">Deposit readiness is not available.</p>
              )}
            </ReviewCard>
            <ReviewCard
              title="4. Agreement & Signature"
              summary="Agreement recorded for this check-in."
              testId="fo-ci-v2-review-step-4"
              editLabel="Edit Agreement & Signature"
              onEdit={() => onEdit("agreement_signature")}
            >
              <dl className="grid gap-2 sm:grid-cols-2">
                <Fact
                  label="Agreement Status"
                  value={
                    readiness.agreement.signed
                      ? "Signed"
                      : readiness.agreement.versionId
                        ? "Not signed"
                        : "No published agreement"
                  }
                />
                <Fact
                  label="Version"
                  value={agreement?.version ? agreementVersionLabel(agreement.version) : "—"}
                />
                <Fact
                  label="Signed At"
                  value={signedRecord ? formatAgreementTimestamp(signedRecord.signedAt) : "—"}
                />
                <Fact label="Signed By" value={signedRecord ? fullName : "—"} />
                <Fact
                  label="Signature"
                  value={signedRecord?.hasSignature ? "Signature recorded" : "Not recorded"}
                />
              </dl>
              {agreementAcknowledgementItems(agreement).length > 0 ? (
                <ul className="mt-3 space-y-2" data-testid="fo-ci-v2-review-acknowledgements">
                  {agreementAcknowledgementItems(agreement).map((item) => {
                    const accepted = signedRecord?.acknowledgements[item.id] === true;
                    return (
                      <li key={item.id} className="text-sm text-[#251605]">
                        <span className="block text-xs font-semibold text-[#6B5E4E]">
                          {item.title}
                          {item.required ? " · Required" : " · Optional"}
                        </span>
                        <span className="whitespace-pre-wrap">{item.statement}</span>
                        <span className="mt-0.5 block text-xs text-[#6B5E4E]">
                          {signedRecord ? (accepted ? "Accepted" : "Not accepted") : "Not signed"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt={`Signature of ${fullName}`}
                  className="mt-3 max-h-16 rounded-md border border-[#E8DFD0] bg-white"
                />
              ) : signedRecord?.hasSignature ? (
                <p className="mt-3 text-xs text-[#436436]">Signature recorded</p>
              ) : null}
            </ReviewCard>
          </div>
          <ReadinessCard readiness={readiness} settled={checkedIn} />
        </div>
      )}

      {formError ? (
        <p
          id="fo-ci-v2-review-error"
          tabIndex={-1}
          className="text-sm text-red-800 outline-none"
          role="alert"
          data-testid="fo-ci-v2-review-error"
        >
          {formError}
        </p>
      ) : null}

      <DialogPrimitive.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogPortal>
          <DialogOverlay className="z-[80]" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-xl"
            data-testid="fo-ci-v2-complete-confirm"
          >
            <DialogPrimitive.Title className="text-base font-bold text-[#251605]">
              Complete check-in
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-[#251605]">
              Complete check-in for {fullName} in {roomLabel}?
            </DialogPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                disabled={busy}
                onClick={() => void complete()}
                data-testid="fo-ci-v2-complete-confirm-submit"
              >
                {busy ? "Completing…" : "Complete Check-In"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </DialogPrimitive.Root>
      <RegistrationPrintLayer active={printing} form={printForm} />
    </div>
  );
});

function RegistrationCompletionCopy({
  readiness,
  unit,
}: {
  readiness: CheckInReadiness;
  unit: CheckInUnitRead;
}) {
  const registration = registrationCompletionProjection({
    complete: readiness.registration.complete,
    waived: readiness.registration.waived,
    savedSnapshotExists: Boolean(unit.progress.registrationSnapshot),
    identitySatisfied:
      readiness.identity.valid &&
      !readiness.blockers.some((item) => item.code === "IDENTITY_DOCUMENT"),
    missingRequirements: readiness.blockers
      .filter((item) => item.code === "GUEST_FIELDS")
      .map((item) => item.message),
  });
  return (
    <div className="mt-1" data-testid="fo-ci-v2-review-registration-state">
      <p className="text-sm font-medium text-[#251605]">{registration.label}</p>
      {registration.detail ? (
        <p className="mt-1 text-xs text-[#6B5E4E]">{registration.detail}</p>
      ) : null}
    </div>
  );
}

function ReviewCard({
  title,
  summary,
  testId,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  summary: string;
  testId: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
          <p className="mt-0.5 text-xs text-[#6B5E4E]">{summary}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          aria-label={editLabel}
          onClick={onEdit}
        >
          <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{label}</p>
      <p className="text-sm font-medium text-[#251605]">{value}</p>
    </div>
  );
}
