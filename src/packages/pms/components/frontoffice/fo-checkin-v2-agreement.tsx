/**
 * Check-In Step 4. Rendered inside the shared workspace sheet.
 * Agreement text comes from getCheckInAgreement. Signing uses captureCheckInAgreementSignature.
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
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  beginCheckInAgreementResign,
  captureCheckInAgreementSignature,
  getCheckInAgreement,
  saveCheckInAgreement,
} from "@/packages/pms/lib/fo-check-in-agreement.functions";
import type { CheckInAgreementRead } from "@/packages/pms/lib/fo-check-in-agreement";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  acknowledgementsMatch,
  acknowledgementsReady,
  agreementAcknowledgementLabel,
  agreementAcknowledgementState,
  agreementCanContinue,
  agreementFailureCopy,
  agreementSignaturePath,
  agreementVersionIsStale,
  buildCheckInAgreementSummary,
  signatureHasInk,
  type CheckInAgreementSummary,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import { classifyCheckInUnitFailure } from "@/packages/pms/lib/fo-checkin-v2-model";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export type CheckInAgreementHandle = {
  sign: () => Promise<boolean>;
};

export const FoCheckInV2Agreement = forwardRef<
  CheckInAgreementHandle,
  {
    restaurantId: string;
    reservationId: string;
    reservationRoomId: string | null;
    unit: CheckInUnitRead;
    onReady: (signed: boolean) => void;
    onSummary: (summary: CheckInAgreementSummary) => void;
    onRefresh: () => void;
  }
>(function FoCheckInV2Agreement(
  { restaurantId, reservationId, reservationRoomId, unit, onReady, onSummary, onRefresh },
  ref,
) {
  const fetchAgreement = useServerFn(getCheckInAgreement);
  const saveAgreement = useServerFn(saveCheckInAgreement);
  const captureSignature = useServerFn(captureCheckInAgreementSignature);
  const beginResign = useServerFn(beginCheckInAgreementResign);
  const padRef = useRef<SignaturePadHandle>(null);
  const previewUrl = useRef<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [seedKey, setSeedKey] = useState("");
  const [ink, setInk] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const signRef = useRef<() => Promise<boolean>>(async () => false);

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
  const savedFlags = useMemo(
    () => (agreement ? agreementAcknowledgementState(agreement) : {}),
    [agreement],
  );
  const summary = useMemo(
    () => buildCheckInAgreementSummary(agreement, unit.primaryGuestName),
    [agreement, unit.primaryGuestName],
  );

  useEffect(() => {
    onReady(agreementCanContinue(agreement));
  }, [agreement, onReady]);

  useEffect(() => {
    onSummary(summary);
  }, [onSummary, summary]);

  useEffect(() => {
    if (!agreement) return;
    const nextKey = `${agreement.reservationRoomId ?? "legacy"}:${agreement.guestId}:${agreement.version?.id ?? "none"}:${agreement.draft?.id ?? ""}:${agreement.signed?.id ?? ""}`;
    if (nextKey === seedKey) return;
    setSeedKey(nextKey);
    setFlags(agreementAcknowledgementState(agreement));
    setInk(false);
    setFormError(null);
    padRef.current?.clear();
  }, [agreement, seedKey]);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function target() {
    return {
      restaurantId,
      reservationId,
      ...(reservationRoomId ? { reservationRoomId } : {}),
    };
  }

  const saveMut = useMutation({
    mutationFn: () => {
      if (!agreement?.version) throw new Error("AGREEMENT_REQUIRED");
      return saveAgreement({
        data: {
          ...target(),
          agreementVersionId: agreement.version.id,
          acknowledgements: flags,
        },
      });
    },
    onSuccess: async () => {
      setFormError(null);
      await agreementQuery.refetch();
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
      await agreementQuery.refetch();
      onRefresh();
    },
    onError: async (error) => {
      setFormError(agreementFailureCopy(error));
      if (agreementVersionIsStale(error)) await agreementQuery.refetch();
    },
  });

  async function sign(): Promise<boolean> {
    if (!agreement?.version || agreement.blocker || !guestMatches) return false;
    if (agreement.signed && !agreement.draft) return false;
    if (!agreement.draft) {
      setFormError("Save the acknowledgements before signing.");
      return false;
    }
    if (!acknowledgementsMatch(flags, agreement.draft.acknowledgements)) {
      setFormError("Save the acknowledgements before signing.");
      return false;
    }
    if (!acknowledgementsReady(flags)) {
      setFormError("Confirm each acknowledgement before signing.");
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
    const storagePath = agreementSignaturePath(restaurantId, reservationId, crypto.randomUUID());
    const uploaded = await supabase.storage.from("property-images").upload(storagePath, blob, {
      contentType: "image/png",
      upsert: false,
    });
    if (uploaded.error) {
      setFormError("The signature could not be uploaded. Try again.");
      return false;
    }
    try {
      await captureSignature({
        data: {
          ...target(),
          agreementVersionId: agreement.version.id,
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
  }

  signRef.current = sign;
  useImperativeHandle(ref, () => ({ sign: () => signRef.current() }), []);

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
          <ShieldAlert className="mt-0.5 size-4 text-red-700" />
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

  return (
    <div
      className="space-y-4"
      data-testid="fo-ci-v2-agreement"
      data-guest-id={agreement.guestId}
      data-reservation-room-id={agreement.reservationRoomId ?? ""}
    >
      <Section title="Registration Agreement" testId="fo-ci-v2-agreement-header">
        <p
          className="text-base font-semibold text-[#251605]"
          data-testid="fo-ci-v2-agreement-version"
        >
          {version.label}
        </p>
        <p className="text-xs text-[#6B5E4E]">Version {version.id}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
        </div>
        {!guestMatches ? (
          <p className="mt-3 text-sm text-red-800" data-testid="fo-ci-v2-agreement-guest-mismatch">
            This agreement is not for the guest on the selected room.
          </p>
        ) : null}
      </Section>

      <Section title="Agreement" testId="fo-ci-v2-agreement-document">
        <div
          className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#E8DFD0] bg-[#FBF7F1] p-4 text-sm leading-6 text-[#251605]"
          data-testid="fo-ci-v2-agreement-body"
        >
          {version.body}
        </div>
      </Section>

      <Section title="Acknowledgements" testId="fo-ci-v2-acknowledgements">
        <ul className="space-y-2">
          {Object.entries(readOnly ? (agreement.signed?.acknowledgements ?? flags) : flags).map(
            ([key, value]) => (
              <li key={key}>
                <label
                  className="flex cursor-pointer items-start gap-2 text-sm text-[#251605]"
                  htmlFor={`fo-ci-v2-ack-${key}`}
                >
                  <input
                    id={`fo-ci-v2-ack-${key}`}
                    type="checkbox"
                    className="mt-1 size-4 accent-[#C89933]"
                    checked={value === true}
                    disabled={readOnly || !guestMatches}
                    onChange={(event) =>
                      setFlags((current) => ({ ...current, [key]: event.target.checked }))
                    }
                    data-testid={`fo-ci-v2-ack-${key}`}
                  />
                  <span>{agreementAcknowledgementLabel(key)}</span>
                </label>
              </li>
            ),
          )}
        </ul>
        {editable && guestMatches ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-9"
            disabled={saveMut.isPending || Object.keys(flags).length === 0}
            onClick={() => saveMut.mutate()}
            data-testid="fo-ci-v2-save-acknowledgements"
          >
            {saveMut.isPending ? "Saving…" : "Save acknowledgements"}
          </Button>
        ) : null}
      </Section>

      {agreement.signed ? (
        <SignedRecord
          agreement={agreement}
          guestName={unit.primaryGuestName}
          roomNumber={unit.roomNumber}
          preview={preview}
        />
      ) : null}

      {showPad ? (
        <Section title="Signature" testId="fo-ci-v2-signature">
          <p className="text-sm text-[#251605]">
            Signer: <span data-testid="fo-ci-v2-signature-signer">{unit.primaryGuestName}</span>
          </p>
          <p className="mt-1 text-xs text-[#6B5E4E]" id="fo-ci-v2-signature-help">
            Draw the signature with a mouse or finger. The method is drawn.
          </p>
          <SignaturePad ref={padRef} onInkChange={setInk} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                padRef.current?.clear();
                setInk(false);
              }}
              data-testid="fo-ci-v2-signature-clear"
            >
              Clear
            </Button>
            <Button
              type="button"
              className="h-10 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              onClick={() => void sign()}
              data-testid="fo-ci-v2-sign-agreement"
            >
              Sign Agreement
            </Button>
          </div>
        </Section>
      ) : null}

      {readOnly && guestMatches ? (
        <div className="rounded-xl border border-[#E8DFD0] bg-white p-4">
          <p className="text-sm text-[#6B5E4E]">
            Create New Signature adds a new agreement instance for this room. The signed record
            stays unchanged.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-10"
            disabled={
              resignMut.isPending ||
              Object.keys(agreement.signed?.acknowledgements ?? {}).length === 0
            }
            onClick={() => resignMut.mutate()}
            data-testid="fo-ci-v2-new-signature"
          >
            {resignMut.isPending ? "Starting…" : "Create New Signature"}
          </Button>
        </div>
      ) : null}

      {formError ? (
        <p className="text-sm text-red-800" data-testid="fo-ci-v2-agreement-error-message">
          {formError}
        </p>
      ) : null}
    </div>
  );
});

function SignedRecord({
  agreement,
  guestName,
  roomNumber,
  preview,
}: {
  agreement: CheckInAgreementRead;
  guestName: string;
  roomNumber: string | null;
  preview: string | null;
}) {
  const signed = agreement.signed;
  if (!signed) return null;
  return (
    <section
      className="rounded-xl border border-[#436436]/30 bg-[#436436]/10 p-4"
      data-testid="fo-ci-v2-agreement-signed"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[#436436]">
        <CheckCircle2 className="size-4" />
        Registration Agreement Signed
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fact label="Signed by">{guestName}</Fact>
        <Fact label="Agreement">{agreement.version?.label ?? signed.agreementVersionId}</Fact>
        <Fact label="Signed at" testId="fo-ci-v2-agreement-signed-at">
          {signed.signedAt}
        </Fact>
        <Fact label="Recorded by" testId="fo-ci-v2-agreement-recorded-by">
          {signed.capturedBy}
        </Fact>
        <Fact label="Room">{roomNumber ? `Room ${roomNumber}` : "No room assigned"}</Fact>
      </div>
      {preview ? (
        <img
          src={preview}
          alt="Signature preview"
          className="mt-3 max-h-24 rounded-md border border-[#E8DFD0] bg-white"
        />
      ) : signed.hasSignature ? (
        <p className="mt-3 text-xs text-[#436436]">Signature recorded</p>
      ) : null}
    </section>
  );
}

type SignaturePadHandle = {
  clear: () => void;
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
        height={280}
        className="mt-3 h-44 w-full touch-none rounded-xl border border-[#DDD4C5] bg-white"
        aria-label="Signature. Draw with a mouse or finger."
        aria-describedby="fo-ci-v2-signature-help"
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
    <div>
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
      className={cn("rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm")}
      data-testid={testId}
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">{title}</h3>
      {children}
    </section>
  );
}
