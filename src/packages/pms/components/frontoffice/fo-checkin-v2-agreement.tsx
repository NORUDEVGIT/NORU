/**
 * Check-In Step 4. Rendered inside the shared workspace sheet.
 * Agreement text and acknowledgements come from getCheckInAgreement.
 * Signing uses saveCheckInAgreement, then captureCheckInAgreementSignature.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Eraser, Maximize2, PenLine, Printer, ShieldAlert } from "lucide-react";

import { useAuth } from "@/core/state/auth-store";
import { getMyRestaurants } from "@/core/lib/restaurant.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  AgreementContent,
  AgreementPrintLayer,
  FullAgreementDialog,
} from "@/packages/pms/components/frontoffice/fo-checkin-v2-agreement-document";
import {
  beginCheckInAgreementResign,
  captureCheckInAgreementSignature,
  getCheckInAgreement,
  saveCheckInAgreement,
} from "@/packages/pms/lib/fo-check-in-agreement.functions";
import type {
  CheckInAgreementAcknowledgementView,
  CheckInAgreementRead,
} from "@/packages/pms/lib/fo-check-in-agreement";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  acknowledgementsMatch,
  agreementAcknowledgementItems,
  agreementAcknowledgementLabel,
  agreementAcknowledgementState,
  agreementCanContinue,
  agreementFailureCopy,
  agreementMissingRequired,
  agreementSignaturePath,
  agreementSignReady,
  agreementStaffReference,
  agreementVersionIsStale,
  agreementVersionLabel,
  buildCheckInAgreementSummary,
  formatAgreementTimestamp,
  signatureHasInk,
  type CheckInAgreementSummary,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import { classifyCheckInUnitFailure } from "@/packages/pms/lib/fo-checkin-v2-model";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export type CheckInAgreementHandle = {
  sign: () => Promise<boolean>;
  save: () => Promise<boolean>;
};

export type CheckInAgreementActions = {
  canSign: boolean;
  canSave: boolean;
  busy: boolean;
};

export const FoCheckInV2Agreement = forwardRef<
  CheckInAgreementHandle,
  {
    restaurantId: string;
    reservationId: string;
    reservationRoomId: string | null;
    unit: CheckInUnitRead;
    confirmationNumber: string | null;
    onReady: (signed: boolean) => void;
    onSummary: (summary: CheckInAgreementSummary) => void;
    onActions: (actions: CheckInAgreementActions) => void;
    onRefresh: () => void;
  }
>(function FoCheckInV2Agreement(
  {
    restaurantId,
    reservationId,
    reservationRoomId,
    unit,
    confirmationNumber,
    onReady,
    onSummary,
    onActions,
    onRefresh,
  },
  ref,
) {
  const { user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const fetchAgreement = useServerFn(getCheckInAgreement);
  const saveAgreement = useServerFn(saveCheckInAgreement);
  const captureSignature = useServerFn(captureCheckInAgreementSignature);
  const beginResign = useServerFn(beginCheckInAgreementResign);
  const padRef = useRef<SignaturePadHandle>(null);
  const previewUrl = useRef<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [seedKey, setSeedKey] = useState("");
  const [padKey, setPadKey] = useState("");
  const [ink, setInk] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [fullView, setFullView] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const signRef = useRef<() => Promise<boolean>>(async () => false);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);

  const membershipQuery = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: Boolean(user?.id),
    retry: false,
  });
  const propertyName =
    membershipQuery.data?.find((row) => row.restaurantId === restaurantId)?.restaurant.name ?? null;

  const agreementQuery = useQuery({
    queryKey: ["fo-ci-v2-agreement", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchAgreement({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    retry: false,
  });
  const agreement = agreementQuery.data ?? null;
  const guestMatches = !agreement || agreement.guestId === unit.primaryGuestId;
  const editable = Boolean(
    agreement?.version && !agreement.blocker && (!agreement.signed || agreement.draft),
  );
  const readOnly = Boolean(agreement?.signed && !agreement.draft);
  const summary = useMemo(
    () => buildCheckInAgreementSummary(agreement, unit.primaryGuestName),
    [agreement, unit.primaryGuestName],
  );
  const configured = useMemo(() => agreementAcknowledgementItems(agreement), [agreement]);
  const items = useMemo<CheckInAgreementAcknowledgementView[]>(
    () =>
      configured.length > 0
        ? configured
        : Object.keys(flags).map((key, index) => ({
            id: key,
            title: "",
            statement: agreementAcknowledgementLabel(key),
            required: true,
            displayOrder: index,
          })),
    [configured, flags],
  );
  const canSign = agreementSignReady({
    read: agreement,
    flags,
    strokes: ink ? 1 : 0,
    guestMatches,
  });
  const canSave = editable && guestMatches && Object.keys(flags).length > 0;

  const signedRecord = agreement?.signed && !agreement.draft ? agreement.signed : null;
  const storedSignatureQuery = useQuery({
    queryKey: ["fo-ci-v2-agreement-signature", restaurantId, reservationId, signedRecord?.id],
    queryFn: async () => {
      if (!signedRecord) return null;
      const path = agreementSignaturePath(restaurantId, reservationId, signedRecord.id);
      const { data, error } = await supabase.storage
        .from("property-images")
        .createSignedUrl(path, 600);
      return error ? null : data.signedUrl;
    },
    enabled: Boolean(signedRecord?.hasSignature) && !preview,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const signatureImage = preview ?? storedSignatureQuery.data ?? null;

  useEffect(() => {
    onReady(agreementCanContinue(agreement));
  }, [agreement, onReady]);

  useEffect(() => {
    onSummary(summary);
  }, [onSummary, summary]);

  useEffect(() => {
    onActions({ canSign, canSave, busy: signing });
  }, [canSign, canSave, signing, onActions]);

  useEffect(() => {
    if (!agreement) return;
    const unitKey = `${agreement.reservationRoomId ?? "legacy"}:${agreement.guestId}:${agreement.version?.id ?? "none"}:${agreement.signed?.id ?? ""}`;
    const nextKey = `${unitKey}:${agreement.draft?.id ?? ""}`;
    if (nextKey === seedKey) return;
    setSeedKey(nextKey);
    setFlags(agreementAcknowledgementState(agreement));
    setFormError(null);
    if (unitKey !== padKey) {
      setPadKey(unitKey);
      setInk(false);
      padRef.current?.clear();
    }
  }, [agreement, seedKey, padKey]);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

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

  function target() {
    return {
      restaurantId,
      reservationId,
      ...(reservationRoomId ? { reservationRoomId } : {}),
    };
  }

  async function persistAcknowledgements(): Promise<CheckInAgreementRead | null> {
    if (!agreement?.version) throw new Error("AGREEMENT_REQUIRED");
    await saveAgreement({
      data: {
        ...target(),
        agreementVersionId: agreement.version.id,
        acknowledgements: flags,
      },
    });
    const refreshed = await agreementQuery.refetch();
    return refreshed.data ?? null;
  }

  const saveMut = useMutation({
    mutationFn: persistAcknowledgements,
    onSuccess: () => {
      setFormError(null);
      onRefresh();
    },
    onError: async (error) => {
      setFormError(agreementFailureCopy(error));
      if (agreementVersionIsStale(error)) await agreementQuery.refetch();
    },
  });

  const resignMut = useMutation({
    mutationFn: () => {
      if (!agreement?.version || !agreement.signed) throw new Error("AGREEMENT_NOT_SIGNED");
      return beginResign({
        data: {
          ...target(),
          agreementVersionId: agreement.version.id,
          acknowledgements: agreement.signed.acknowledgements,
        },
      });
    },
    onSuccess: async () => {
      setFormError(null);
      setPreview(null);
      await agreementQuery.refetch();
      onRefresh();
    },
    onError: async (error) => {
      setFormError(agreementFailureCopy(error));
      if (agreementVersionIsStale(error)) await agreementQuery.refetch();
    },
  });

  function save(): Promise<boolean> {
    if (!canSave) return Promise.resolve(false);
    return saveMut.mutateAsync().then(
      () => true,
      () => false,
    );
  }

  async function uploadSignature(blob: Blob, draftId: string): Promise<string | null> {
    const options = { contentType: "image/png", upsert: false };
    const storagePath = agreementSignaturePath(restaurantId, reservationId, draftId);
    const uploaded = await supabase.storage
      .from("property-images")
      .upload(storagePath, blob, options);
    if (!uploaded.error) return storagePath;
    if (!/exists|duplicate/i.test(uploaded.error.message)) return null;
    const retryPath = agreementSignaturePath(restaurantId, reservationId, crypto.randomUUID());
    const retried = await supabase.storage.from("property-images").upload(retryPath, blob, options);
    return retried.error ? null : retryPath;
  }

  async function sign(): Promise<boolean> {
    if (!agreement?.version || agreement.blocker || !guestMatches) return false;
    if (agreement.signed && !agreement.draft) return false;
    if (agreementMissingRequired(agreement, flags).length > 0) {
      setFormError("Confirm each required acknowledgement before signing.");
      return false;
    }
    if (!signatureHasInk(padRef.current?.strokeCount() ?? 0) || !ink) {
      setFormError("Draw a signature before signing.");
      return false;
    }
    const blob = await padRef.current?.toBlob();
    if (!blob) {
      setFormError("Draw a signature before signing.");
      return false;
    }
    const versionId = agreement.version.id;
    setSigning(true);
    try {
      let draftId = agreement.draft?.id ?? null;
      if (!agreement.draft || !acknowledgementsMatch(flags, agreement.draft.acknowledgements)) {
        try {
          draftId = (await persistAcknowledgements())?.draft?.id ?? null;
        } catch (error) {
          setFormError(agreementFailureCopy(error));
          if (agreementVersionIsStale(error)) await agreementQuery.refetch();
          return false;
        }
      }
      if (!draftId) {
        setFormError("Save the acknowledgements before signing.");
        return false;
      }
      const storagePath = await uploadSignature(blob, draftId);
      if (!storagePath) {
        setFormError("The signature could not be uploaded. Try again.");
        return false;
      }
      try {
        await captureSignature({
          data: {
            ...target(),
            agreementVersionId: versionId,
            storagePath,
            method: "drawn",
          },
        });
      } catch (error) {
        setFormError(agreementFailureCopy(error));
        if (agreementVersionIsStale(error)) await agreementQuery.refetch();
        return false;
      }
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPreview(previewUrl.current);
      setFormError(null);
      await agreementQuery.refetch();
      onRefresh();
      return true;
    } finally {
      setSigning(false);
    }
  }

  signRef.current = sign;
  saveRef.current = save;
  useImperativeHandle(
    ref,
    () => ({ sign: () => signRef.current(), save: () => saveRef.current() }),
    [],
  );

  if (agreementQuery.isLoading) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#6B5E4E]"
        data-testid="fo-ci-v2-agreement-loading"
      >
        Loading the registration agreement…
      </div>
    );
  }

  if (agreementQuery.isError || !agreement) {
    const failure = classifyCheckInUnitFailure(agreementQuery.error);
    const message =
      failure === "permission_denied"
        ? "You don't have access to this registration agreement."
        : failure === "reservation_not_found"
          ? "This reservation could not be found for the property."
          : failure === "room_unit_required"
            ? "Choose which room this agreement applies to."
            : "The registration agreement could not be loaded. Try again.";
    return (
      <div
        className="rounded-xl border border-red-200 bg-white p-6"
        data-testid="fo-ci-v2-agreement-error"
      >
        <p className="text-sm text-red-800">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void agreementQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (agreement.blocker === "AGREEMENT_REQUIRED" || !agreement.version) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-white p-6"
        data-testid="fo-ci-v2-agreement-required"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 text-red-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-800">AGREEMENT_REQUIRED</p>
            <p className="mt-1 text-sm text-[#251605]">
              No active registration agreement is published for this property.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const version = agreement.version;
  const booker = agreement.guestSource === "booker";
  const showPad = editable && guestMatches;
  const versionText = agreementVersionLabel(version);
  const shownFlags = readOnly ? (agreement.signed?.acknowledgements ?? flags) : flags;

  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="fo-ci-v2-agreement"
      data-guest-id={agreement.guestId}
      data-reservation-room-id={agreement.reservationRoomId ?? ""}
      data-version-id={version.id}
    >
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm"
        data-testid="fo-ci-v2-agreement-header"
      >
        <Fact label="Guest" testId="fo-ci-v2-agreement-guest">
          {unit.primaryGuestName}
          {booker ? (
            <span
              className="ml-2 rounded-full bg-[#C89933]/15 px-2 py-0.5 text-[10px] font-medium text-[#8B6914]"
              data-testid="fo-ci-v2-agreement-relationship"
            >
              Booker
            </span>
          ) : null}
        </Fact>
        <Fact label="Room" testId="fo-ci-v2-agreement-room">
          {unit.roomNumber ? `Room ${unit.roomNumber}` : "No room assigned"}
        </Fact>
        <Fact label="Stay" testId="fo-ci-v2-agreement-stay">
          {formatStayDate(unit.arrivalDate)} {"\u2192"} {formatStayDate(unit.departureDate)}
        </Fact>
        <Fact label="Agreement" testId="fo-ci-v2-agreement-version">
          {versionText}
        </Fact>
        {!guestMatches ? (
          <p
            className="basis-full text-sm text-red-800"
            role="alert"
            data-testid="fo-ci-v2-agreement-guest-mismatch"
          >
            This agreement is not for the guest on the selected room.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          className="min-w-0 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
          data-testid="fo-ci-v2-agreement-document"
          aria-labelledby="fo-ci-v2-agreement-heading"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                id="fo-ci-v2-agreement-heading"
                className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]"
              >
                Guest Agreement
              </h3>
              <p
                className="mt-1 text-base font-bold text-[#251605]"
                data-testid="fo-ci-v2-agreement-title"
              >
                {version.title || "Registration Agreement"}
              </p>
              <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-agreement-version-label">
                {versionText}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setFullView(true)}
                aria-label="View full agreement"
                data-testid="fo-ci-v2-agreement-view-full"
              >
                <Maximize2 className="mr-1.5 size-3.5" aria-hidden="true" />
                View Full Agreement
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPrinting(true)}
                aria-label="Print agreement"
                data-testid="fo-ci-v2-agreement-print"
              >
                <Printer className="mr-1.5 size-3.5" aria-hidden="true" />
                Print Agreement
              </Button>
            </div>
          </div>
          <AgreementContent read={agreement} version={version} variant="panel" />
        </section>

        <div className="min-w-0 space-y-4">
          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid="fo-ci-v2-acknowledgements"
            aria-labelledby="fo-ci-v2-ack-heading"
          >
            <h3
              id="fo-ci-v2-ack-heading"
              className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]"
            >
              Guest Acknowledgement
            </h3>
            {version.acknowledgementIntro ? (
              <p className="mt-1 text-sm text-[#251605]">{version.acknowledgementIntro}</p>
            ) : null}
            <ul className="mt-3 space-y-3">
              {items.map((item) => {
                const id = `fo-ci-v2-ack-${item.id}`;
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-[#E8DFD0] px-3 py-2.5 text-sm text-[#251605]",
                        readOnly || !guestMatches
                          ? "bg-[#FBF7F1]"
                          : "cursor-pointer hover:bg-[#FBF7F1]",
                      )}
                      htmlFor={id}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-[#C89933]"
                        checked={shownFlags[item.id] === true}
                        disabled={readOnly || !guestMatches}
                        aria-required={item.required}
                        onChange={(event) =>
                          setFlags((current) => ({ ...current, [item.id]: event.target.checked }))
                        }
                        data-testid={id}
                        data-required={item.required ? "true" : "false"}
                      />
                      <span className="min-w-0">
                        {item.title ? (
                          <span className="block text-xs font-semibold text-[#6B5E4E]">
                            {item.title}
                          </span>
                        ) : null}
                        <span className="block whitespace-pre-wrap">{item.statement}</span>
                        {item.required ? (
                          <span
                            className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[#8B6914]"
                            data-testid={`${id}-required`}
                          >
                            Required
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[#6B5E4E]">
                            Optional
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {signedRecord ? (
            <SignedRecord
              agreement={agreement}
              guestName={unit.primaryGuestName}
              signatureImage={signatureImage}
              canResign={guestMatches}
              resignPending={resignMut.isPending}
              onResign={() => resignMut.mutate()}
            />
          ) : showPad ? (
            <section
              className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
              data-testid="fo-ci-v2-signature"
              aria-labelledby="fo-ci-v2-signature-heading"
            >
              <h3
                id="fo-ci-v2-signature-heading"
                className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]"
              >
                Guest Signature <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </h3>
              <p className="mt-1 text-sm text-[#251605]" id="fo-ci-v2-signature-help">
                Please provide your signature to acknowledge and accept the above terms.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#C89933] bg-[#C89933]/10"
                  aria-pressed="true"
                  onClick={() => padRef.current?.focus()}
                  data-testid="fo-ci-v2-signature-draw"
                >
                  <PenLine className="mr-1.5 size-3.5" aria-hidden="true" />
                  Draw Signature
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!ink}
                  onClick={() => {
                    padRef.current?.clear();
                    setInk(false);
                  }}
                  data-testid="fo-ci-v2-signature-clear"
                >
                  <Eraser className="mr-1.5 size-3.5" aria-hidden="true" />
                  Clear
                </Button>
              </div>
              <SignaturePad ref={padRef} onInkChange={setInk} />
              <p className="mt-2 text-sm text-[#251605]">
                Signer: <span data-testid="fo-ci-v2-signature-signer">{unit.primaryGuestName}</span>
              </p>
              {!canSign ? (
                <p className="mt-1 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-signature-gate">
                  {agreementMissingRequired(agreement, flags).length > 0
                    ? "Accept each required acknowledgement, then draw the signature."
                    : "Draw the signature to enable Sign Agreement."}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p
          className="text-sm text-red-800"
          role="alert"
          data-testid="fo-ci-v2-agreement-error-message"
        >
          {formError}
        </p>
      ) : null}

      <FullAgreementDialog
        open={fullView}
        onOpenChange={setFullView}
        read={agreement}
        version={version}
        items={items}
        flags={shownFlags}
      />
      <AgreementPrintLayer
        active={printing}
        read={agreement}
        version={version}
        items={items}
        signatureUrl={signatureImage}
        context={{
          propertyName,
          guestName: unit.primaryGuestName,
          confirmationNumber,
          roomNumber: unit.roomNumber,
          arrivalDate: unit.arrivalDate,
          departureDate: unit.departureDate,
        }}
      />
    </div>
  );
});

function SignedRecord({
  agreement,
  guestName,
  signatureImage,
  canResign,
  resignPending,
  onResign,
}: {
  agreement: CheckInAgreementRead;
  guestName: string;
  signatureImage: string | null;
  canResign: boolean;
  resignPending: boolean;
  onResign: () => void;
}) {
  const signed = agreement.signed;
  if (!signed) return null;
  return (
    <section
      className="rounded-xl border border-[#436436]/30 bg-[#436436]/10 p-4"
      data-testid="fo-ci-v2-agreement-signed"
      aria-label="Registration Agreement Signed"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[#436436]">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Agreement Signed
      </div>
      {signatureImage ? (
        <img
          src={signatureImage}
          alt={`Signature of ${guestName}`}
          className="mt-3 max-h-28 w-full rounded-md border border-[#E8DFD0] bg-white object-contain"
          data-testid="fo-ci-v2-agreement-signature-image"
        />
      ) : signed.hasSignature ? (
        <p className="mt-3 text-xs text-[#436436]">Signature recorded</p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fact label="Signed on" testId="fo-ci-v2-agreement-signed-at">
          {formatAgreementTimestamp(signed.signedAt)}
        </Fact>
        <Fact label="Signed by">{guestName}</Fact>
        <Fact label="Recorded by" testId="fo-ci-v2-agreement-recorded-by">
          {agreementStaffReference(signed.capturedBy)}
        </Fact>
        <Fact label="Agreement">{agreementVersionLabel(agreement.version)}</Fact>
      </div>
      {canResign ? (
        <div className="mt-4 border-t border-[#436436]/20 pt-3">
          <p className="text-xs text-[#6B5E4E]">
            Create New Signature adds a new agreement instance for this room. The signed record
            stays unchanged.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8"
            disabled={resignPending || Object.keys(signed.acknowledgements).length === 0}
            onClick={onResign}
            data-testid="fo-ci-v2-new-signature"
          >
            {resignPending ? "Starting…" : "Create New Signature"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type SignaturePadHandle = {
  clear: () => void;
  focus: () => void;
  toBlob: () => Promise<Blob | null>;
  strokeCount: () => number;
};

const SignaturePad = forwardRef<SignaturePadHandle, { onInkChange: (hasInk: boolean) => void }>(
  function SignaturePad({ onInkChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const strokes = useRef(0);
    const last = useRef<{ x: number; y: number } | null>(null);

    function context() {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.strokeStyle = "#251605";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      return ctx;
    }

    function point(event: PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = context();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.current = 0;
      last.current = null;
      onInkChange(false);
    }

    useImperativeHandle(ref, () => ({
      clear,
      focus: () => canvasRef.current?.focus(),
      strokeCount: () => strokes.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            resolve(null);
            return;
          }
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
    }));

    return (
      <canvas
        ref={canvasRef}
        width={900}
        height={300}
        tabIndex={0}
        role="img"
        className="mt-3 h-48 w-full touch-none rounded-xl border-2 border-dashed border-[#DDD4C5] bg-white focus:outline-none focus-visible:border-[#C89933]"
        aria-label="Signature area. Draw the guest signature with a mouse, pen, or finger."
        aria-describedby="fo-ci-v2-signature-help"
        aria-required="true"
        data-testid="fo-ci-v2-signature-pad"
        onPointerDown={(event) => {
          const ctx = context();
          if (!ctx) return;
          drawing.current = true;
          last.current = point(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const ctx = context();
          const from = last.current;
          if (!ctx || !from) return;
          const next = point(event);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
          last.current = next;
          strokes.current += 1;
          onInkChange(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
    );
  },
);

function Fact({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{label}</p>
      <p
        className="text-sm font-medium text-[#251605]"
        {...(testId ? { "data-testid": testId } : {})}
      >
        {children}
      </p>
    </div>
  );
}
