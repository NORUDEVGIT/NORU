/**
 * Check-In Step 2. Rendered inside the shared workspace sheet.
 * Saves the selected unit's guest through saveCheckInUnitRegistration.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ScanLine, ShieldAlert } from "lucide-react";

import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  IDENTITY_UPLOAD_ACCEPT,
  IDENTITY_UPLOAD_MAX_BYTES,
} from "@/packages/pms/components/guests/guest-form-identity-upload";
import { supabase } from "@/integrations/supabase/client";
import type { CheckInUnitRead } from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  getCheckInRegistration,
  saveCheckInUnitRegistration,
  searchCheckInGuestDuplicates,
} from "@/packages/pms/lib/fo-check-in-registration.functions";
import {
  buildRegistrationSave,
  registrationCanonicalKey,
  registrationDocumentState,
  registrationDraft,
  registrationFailureCopy,
  registrationFieldRequired,
  registrationRelationship,
  registrationRequiredErrors,
  REGISTRATION_CONTACT_FIELDS,
  REGISTRATION_DETAIL_FIELDS,
  REGISTRATION_FIELD_LABELS,
  type RegistrationDocumentState,
} from "@/packages/pms/lib/fo-checkin-v2-registration-model";
import type { CheckInProfileField } from "@/packages/pms/lib/fo-check-in-registration";
import { classifyCheckInUnitFailure } from "@/packages/pms/lib/fo-checkin-v2-model";
import { documentExpiryStatus } from "@/packages/pms/lib/guest-identity-documents";
import { GUEST_GENDER_LABELS, GUEST_GENDERS } from "@/packages/pms/lib/guest-profile-individual";
import {
  createGuestDocumentUpload,
  getGuest,
  getGuestDocument,
  listGuestIdentityDocumentTypes,
  reviewGuestDocument,
  saveGuestDocumentImage,
  validateDocumentFields,
  type GuestProfile,
} from "@/packages/pms/lib/guests.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import { propertyToday } from "@/shared/lib/property-dates";
import { useRestaurantTime } from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type CheckInRegistrationHandle = {
  save: () => Promise<boolean>;
};

function profileValues(
  guest: GuestProfile | null,
): Partial<Record<CheckInProfileField, string | null>> {
  if (!guest) return {};
  return {
    firstName: guest.firstName,
    middleName: guest.middleName,
    lastName: guest.lastName,
    gender: guest.gender,
    dateOfBirth: guest.dateOfBirth,
    nationality: guest.nationality,
    country: guest.country,
    phone: guest.phone,
    email: guest.email,
    addressLine1: guest.addressLine1,
    city: guest.city,
    language: guest.language,
  };
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[#6B5E4E]">
        {label}
        {required ? <span className="text-[#8B4513]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const controlClass = "h-9 border-[#DDD4C5] bg-white text-sm text-[#251605]";

export const FoCheckInV2Registration = forwardRef<
  CheckInRegistrationHandle,
  {
    restaurantId: string;
    reservationId: string;
    reservationRoomId: string | null;
    unit: CheckInUnitRead;
    reservation: ReservationDetail | null;
    profileNumber: string | null;
    roomGuests: ReactNode;
    onStatus: (status: RegistrationDocumentState) => void;
    onSaved: () => void;
  }
>(function FoCheckInV2Registration(
  {
    restaurantId,
    reservationId,
    reservationRoomId,
    unit,
    reservation,
    profileNumber,
    roomGuests,
    onStatus,
    onSaved,
  },
  ref,
) {
  const { timezone } = useRestaurantTime();
  const today = propertyToday(timezone);
  const queryClient = useQueryClient();
  const fetchRegistration = useServerFn(getCheckInRegistration);
  const fetchGuest = useServerFn(getGuest);
  const fetchTypes = useServerFn(listGuestIdentityDocumentTypes);
  const fetchDocument = useServerFn(getGuestDocument);
  const saveRegistration = useServerFn(saveCheckInUnitRegistration);
  const searchDuplicates = useServerFn(searchCheckInGuestDuplicates);
  const reviewDocument = useServerFn(reviewGuestDocument);
  const startUpload = useServerFn(createGuestDocumentUpload);
  const attachImage = useServerFn(saveGuestDocumentImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const registrationQuery = useQuery({
    queryKey: ["fo-ci-v2-registration", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchRegistration({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    retry: false,
  });
  const registration = registrationQuery.data ?? null;
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
  const guest = guestQuery.data?.guest ?? null;
  const types = (typesQuery.data?.types ?? []).filter((type) => type.active);

  const [draft, setDraft] = useState<Record<CheckInProfileField, string> | null>(null);
  const [seedKey, setSeedKey] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [idTypeId, setIdTypeId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [scanNote, setScanNote] = useState(false);
  const [duplicates, setDuplicates] = useState<Array<{
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    profileNumber: string | null;
  }> | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const seed = `${registration?.guestId ?? ""}:${registration?.reservationRoomId ?? ""}`;
  useEffect(() => {
    if (!registration || guestQuery.isLoading || seed === seedKey) return;
    setDraft(registrationDraft(registration.fields, profileValues(guest)));
    const first = registration.documents[0] ?? null;
    setSelectedDocumentId(first?.id ?? null);
    setIdTypeId(first?.typeId ?? "");
    setDocumentNumber(first?.documentNumber ?? "");
    setIssuingCountry(first?.issuingCountry ?? "");
    setExpiryDate(first?.expiryDate ?? "");
    setIssueDate("");
    setErrors([]);
    setDuplicates(null);
    setSeedKey(seed);
  }, [guest, guestQuery.isLoading, registration, seed, seedKey]);

  const documentQuery = useQuery({
    queryKey: ["fo-ci-v2-document", restaurantId, registration?.guestId, selectedDocumentId],
    queryFn: () =>
      fetchDocument({
        data: {
          restaurantId,
          guestId: registration!.guestId,
          documentId: selectedDocumentId!,
        },
      }),
    enabled: Boolean(registration?.guestId && selectedDocumentId),
    retry: false,
  });
  const documentDetail =
    documentQuery.data && "document" in documentQuery.data ? documentQuery.data.document : null;

  useEffect(() => {
    if (!documentDetail || documentDetail.id !== selectedDocumentId) return;
    setIssueDate(documentDetail.issueDate ?? "");
    if (documentDetail.expiryDate) setExpiryDate(documentDetail.expiryDate);
    if (documentDetail.documentNumber) setDocumentNumber(documentDetail.documentNumber);
    if (documentDetail.issuingCountry) setIssuingCountry(documentDetail.issuingCountry);
    if (documentDetail.idTypeId) setIdTypeId(documentDetail.idTypeId);
  }, [documentDetail, selectedDocumentId]);

  const selected = registration?.documents.find((item) => item.id === selectedDocumentId) ?? null;
  const documentState = registration
    ? registrationDocumentState({
        documents: registration.documents,
        warnings: registration.warnings,
        today,
      })
    : null;

  useEffect(() => {
    if (documentState) onStatus(documentState);
  }, [documentState, onStatus]);

  function setValue(key: CheckInProfileField, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function selectDocument(id: string | null) {
    setSelectedDocumentId(id);
    const row = registration?.documents.find((item) => item.id === id) ?? null;
    setIdTypeId(row?.typeId ?? "");
    setDocumentNumber(row?.documentNumber ?? "");
    setIssuingCountry(row?.issuingCountry ?? "");
    setExpiryDate(row?.expiryDate ?? "");
    setIssueDate("");
  }

  async function save(): Promise<boolean> {
    if (!registration || !draft) return false;
    const required = registrationRequiredErrors(registration.fields, draft);
    const selectedType = types.find((type) => type.id === idTypeId) ?? null;
    const documentError = selectedType
      ? validateDocumentFields(selectedType, {
          documentNumber: documentNumber.trim() || null,
          issuingCountry: issuingCountry.trim() || null,
          issueDate: issueDate.trim() || null,
          expiryDate: expiryDate.trim() || null,
        })
      : null;
    const nextErrors = [...required, ...(documentError ? [documentError] : [])];
    setErrors(nextErrors);
    if (nextErrors.length > 0) return false;
    const payload = buildRegistrationSave({
      draft,
      document: idTypeId
        ? {
            ...(selectedDocumentId ? { documentId: selectedDocumentId } : {}),
            idTypeId,
            documentNumber,
            issuingCountry,
            issueDate,
            expiryDate,
          }
        : null,
    });
    setBusy(true);
    try {
      await saveRegistration({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
          fields: payload.fields,
          ...(payload.document ? { document: payload.document } : {}),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-registration", restaurantId, reservationId],
      });
      onSaved();
      return true;
    } catch (error) {
      setErrors([registrationFailureCopy(error)]);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveRef = useRef(save);
  saveRef.current = save;
  useImperativeHandle(ref, () => ({ save: () => saveRef.current() }), []);

  async function checkDuplicates() {
    if (!registration || !draft) return;
    setDuplicateError(null);
    try {
      const matches = await searchDuplicates({
        data: {
          restaurantId,
          firstName: draft.firstName || null,
          lastName: draft.lastName || null,
          email: draft.email || null,
          phone: draft.phone || null,
          dateOfBirth: draft.dateOfBirth || null,
          documentNumber: documentNumber || null,
          excludeGuestId: registration.guestId,
        },
      });
      setDuplicates(
        matches.map((match) => ({
          id: match.id,
          fullName: match.fullName,
          phone: match.phone,
          email: match.email,
          profileNumber: match.profileNumber,
        })),
      );
    } catch {
      setDuplicateError("Duplicate search could not be completed. Try again.");
    }
  }

  async function review(status: "verified" | "rejected") {
    if (!registration || !selectedDocumentId) return;
    setBusy(true);
    try {
      const result = await reviewDocument({
        data: {
          restaurantId,
          guestId: registration.guestId,
          documentId: selectedDocumentId,
          status,
          ...(status === "rejected" ? { reason: rejectReason.trim() || null } : {}),
        },
      });
      if (!result.ok) {
        setErrors([result.message || "Document review could not be saved."]);
        return;
      }
      setRejectReason("");
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-registration", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-document", restaurantId, registration.guestId],
      });
    } catch (error) {
      setErrors([registrationFailureCopy(error)]);
    } finally {
      setBusy(false);
    }
  }

  async function attachFile(file: File) {
    if (!registration || !selectedDocumentId) {
      setErrors(["Save the identity document before attaching a file."]);
      return;
    }
    if (!(IDENTITY_UPLOAD_ACCEPT as readonly string[]).includes(file.type)) {
      setErrors(["Attach a JPG, PNG, WebP, or PDF."]);
      return;
    }
    if (file.size > IDENTITY_UPLOAD_MAX_BYTES) {
      setErrors(["Document files must be 8 MB or smaller."]);
      return;
    }
    setBusy(true);
    try {
      const ticket = await startUpload({
        data: {
          restaurantId,
          guestId: registration.guestId,
          contentType: file.type as (typeof IDENTITY_UPLOAD_ACCEPT)[number],
          size: file.size,
        },
      });
      if (!ticket.ok) {
        setErrors([ticket.message]);
        return;
      }
      const uploaded = await supabase.storage
        .from("property-images")
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (uploaded.error) {
        setErrors(["The document file could not be uploaded. Try again."]);
        return;
      }
      const saved = await attachImage({
        data: {
          restaurantId,
          guestId: registration.guestId,
          documentId: selectedDocumentId,
          side: "front",
          storagePath: ticket.path,
          mimeType: file.type as (typeof IDENTITY_UPLOAD_ACCEPT)[number],
          size: file.size,
        },
      });
      if (!saved.ok) {
        setErrors([saved.message]);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-registration", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-document", restaurantId, registration.guestId],
      });
    } catch (error) {
      setErrors([registrationFailureCopy(error)]);
    } finally {
      setBusy(false);
    }
  }

  if (registrationQuery.isLoading || (registration && !draft)) {
    return (
      <p className="text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-registration-loading">
        Loading registration…
      </p>
    );
  }
  if (registrationQuery.isError) {
    const failure = classifyCheckInUnitFailure(registrationQuery.error);
    const message =
      failure === "permission_denied"
        ? "You don't have access to this registration."
        : failure === "room_unit_required"
          ? "Choose which room this registration applies to."
          : /could not be found/i.test(
                registrationQuery.error instanceof Error ? registrationQuery.error.message : "",
              )
            ? "Guest profile unavailable."
            : "Registration details could not be loaded. Try again.";
    return (
      <div
        className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4"
        data-testid="fo-ci-v2-registration-error"
      >
        <p className="text-sm text-[#251605]">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void registrationQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!registration || !draft) return null;

  const relationship = registrationRelationship(registration.guestSource);
  const selectedType = types.find((type) => type.id === idTypeId) ?? null;
  const expiryTone = documentExpiryStatus(expiryDate || selected?.expiryDate, today);

  return (
    <div
      className="space-y-4"
      data-testid="fo-ci-v2-registration"
      data-guest-id={registration.guestId}
    >
      <div
        className="rounded-xl border border-[#436436]/25 bg-[#436436]/10 px-4 py-3"
        data-testid="fo-ci-v2-registration-header"
      >
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="size-4 text-[#436436]" />
          <p className="text-sm font-semibold text-[#436436]">Reservation Found</p>
          {reservation?.confirmationNumber ? (
            <span className="font-mono text-sm font-bold text-[#251605]">
              {reservation.confirmationNumber}
            </span>
          ) : null}
          {unit.status ? <ReservationStatusBadge status={unit.status as never} /> : null}
        </div>
        <p className="mt-1 font-semibold text-[#251605]" data-testid="fo-ci-v2-registration-guest">
          {unit.primaryGuestName}
        </p>
        <p className="text-xs text-[#6B5E4E]">
          {formatStayDate(unit.arrivalDate)} – {formatStayDate(unit.departureDate)}
          {unit.roomNumber ? ` · Room ${unit.roomNumber}` : ""}
          {` · ${unit.adults} Adult${unit.adults === 1 ? "" : "s"} · ${unit.children} Children`}
        </p>
      </div>

      <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#251605]">{unit.primaryGuestName}</p>
            {profileNumber ? <p className="text-xs text-[#6B5E4E]">{profileNumber}</p> : null}
            <p className="mt-1 text-xs text-[#6B5E4E]">
              Relationship to unit:{" "}
              <span
                className="font-semibold text-[#251605]"
                data-testid="fo-ci-v2-registration-relationship"
              >
                {relationship}
              </span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void checkDuplicates()}
            data-testid="fo-ci-v2-check-duplicates"
          >
            Check for possible duplicate profiles
          </Button>
        </div>
        {guestQuery.isError ? (
          <p
            className="mt-2 text-sm text-[#8B4513]"
            data-testid="fo-ci-v2-registration-guest-unavailable"
          >
            Guest profile unavailable. Required check-in fields can still be saved when they are
            already loaded.
          </p>
        ) : null}
      </section>

      {duplicates ? (
        <section
          className="rounded-xl border border-[#E8DFD0] bg-white p-4"
          data-testid="fo-ci-v2-duplicates"
        >
          <p className="text-sm font-semibold text-[#251605]">Possible duplicate profiles</p>
          <p className="mt-1 text-xs text-[#6B5E4E]">
            Review only. This search does not merge or replace the current guest.
          </p>
          {duplicates.length === 0 ? (
            <p className="mt-2 text-sm text-[#6B5E4E]">No other profiles matched these details.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {duplicates.map((match) => (
                <li
                  key={match.id}
                  className="rounded-lg border border-[#E8DFD0] px-3 py-2 text-sm"
                  data-testid="fo-ci-v2-duplicate-match"
                >
                  <p className="font-medium text-[#251605]">{match.fullName}</p>
                  {match.profileNumber ? (
                    <p className="text-xs text-[#6B5E4E]">{match.profileNumber}</p>
                  ) : null}
                  {match.phone || match.email ? (
                    <p className="text-xs text-[#6B5E4E]">
                      {[match.phone, match.email].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {duplicateError ? <p className="text-sm text-[#8B4513]">{duplicateError}</p> : null}

      {errors.length > 0 ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
          data-testid="fo-ci-v2-registration-errors"
        >
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <FormSection title="A. Registration Details" testId="fo-ci-v2-registration-details">
        <div className="grid gap-3 md:grid-cols-3">
          {REGISTRATION_DETAIL_FIELDS.map((key) => (
            <ProfileControl
              key={key}
              field={key}
              required={registrationFieldRequired(registration.fields, key)}
              value={draft[key]}
              onChange={(value) => setValue(key, value)}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title="B. Identification" testId="fo-ci-v2-identification">
        <DocumentStatusBanner state={documentState} expiryTone={expiryTone} />
        {registration.documents.length > 1 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {registration.documents.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={item.id === selectedDocumentId ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => selectDocument(item.id)}
              >
                {item.documentNumber || item.kind || "Document"}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="ID type" required>
              <select
                className={cn(controlClass, "w-full rounded-md border px-2")}
                value={idTypeId}
                onChange={(event) => setIdTypeId(event.target.value)}
                data-testid="fo-ci-v2-id-type"
              >
                <option value="">Select</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ID number" required={selectedType?.documentNumberRequired !== false}>
              <Input
                className={controlClass}
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                data-testid="fo-ci-v2-id-number"
              />
            </Field>
            <Field label="Issuing country" required={Boolean(selectedType?.issuingCountryRequired)}>
              <Input
                className={controlClass}
                value={issuingCountry}
                onChange={(event) => setIssuingCountry(event.target.value)}
              />
            </Field>
            <Field label="Issue date" required={Boolean(selectedType?.issueDateRequired)}>
              <Input
                className={controlClass}
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </Field>
            <Field label="Expiry date" required={Boolean(selectedType?.expiryDateRequired)}>
              <Input
                className={controlClass}
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                data-testid="fo-ci-v2-id-expiry"
              />
            </Field>
            <div className="text-sm text-[#6B5E4E]">
              <p>
                File: {selected?.hasFile || documentDetail?.url ? "Attached" : "No file attached"}
              </p>
              <p data-testid="fo-ci-v2-id-verification">
                Verification: {selected?.verificationStatus ?? "unverified"}
              </p>
              {documentDetail?.verifiedByName ? (
                <p>Verified by {documentDetail.verifiedByName}</p>
              ) : null}
              {documentDetail?.verifiedAt ? (
                <p>Verified at {documentDetail.verifiedAt.slice(0, 16).replace("T", " ")}</p>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-[#DDD4C5] bg-[#FBF7F1] p-3">
            {documentDetail?.url && documentDetail.mimeType?.startsWith("image/") ? (
              <img
                src={documentDetail.url}
                alt="Identity document"
                className="max-h-32 rounded-md object-contain"
              />
            ) : (
              <p className="text-center text-xs text-[#6B5E4E]">
                {selected?.hasFile
                  ? "Document file is on the guest profile."
                  : "No document preview."}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              if (selectedDocumentId) return;
              selectDocument(null);
            }}
            data-testid="fo-ci-v2-add-document"
          >
            Add / Update ID Document
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedDocumentId || busy}
            onClick={() => fileRef.current?.click()}
            data-testid="fo-ci-v2-attach-document"
          >
            Attach Document
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={IDENTITY_UPLOAD_ACCEPT.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attachFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedDocumentId || busy}
            onClick={() => void review("verified")}
            data-testid="fo-ci-v2-verify-document"
          >
            Verify ID
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setScanNote(true)}
            data-testid="fo-ci-v2-scan-id"
          >
            <ScanLine className="mr-1 size-3.5" />
            Scan ID
          </Button>
        </div>
        {scanNote ? (
          <p className="mt-2 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-scan-unavailable">
            Scanner integration not configured.
          </p>
        ) : null}
        {selectedDocumentId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              className={cn(controlClass, "max-w-xs")}
              placeholder="Rejection reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => void review("rejected")}
              data-testid="fo-ci-v2-reject-document"
            >
              Reject ID
            </Button>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="C. Contact Information" testId="fo-ci-v2-contact">
        <div className="grid gap-3 md:grid-cols-3">
          {REGISTRATION_CONTACT_FIELDS.map((key) => (
            <ProfileControl
              key={key}
              field={key}
              required={registrationFieldRequired(registration.fields, key)}
              value={draft[key]}
              onChange={(value) => setValue(key, value)}
            />
          ))}
        </div>
      </FormSection>

      <details
        className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm"
        data-testid="fo-ci-v2-additional"
      >
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
          D. Additional Information
        </summary>
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-3">
          <ProfileControl
            field="language"
            required={registrationFieldRequired(registration.fields, "language")}
            value={draft.language}
            onChange={(value) => setValue("language", value)}
          />
          {reservation?.purposeOfStay ? (
            <ReadOnly label="Purpose of visit" value={reservation.purposeOfStay} />
          ) : null}
          {reservation?.companyName ? (
            <ReadOnly label="Company" value={reservation.companyName} />
          ) : null}
          {guest?.position ? <ReadOnly label="Occupation" value={guest.position} /> : null}
          {guest?.emergencyContacts?.[0] ? (
            <ReadOnly
              label="Emergency contact"
              value={[guest.emergencyContacts[0].name, guest.emergencyContacts[0].phone]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : null}
          {registration.fields
            .filter((field) => registrationCanonicalKey(field.code) == null)
            .map((field) => (
              <ReadOnly key={field.code} label={field.label} value={field.value ?? "—"} />
            ))}
        </div>
      </details>

      {roomGuests}
    </div>
  );
});

function ProfileControl({
  field,
  required,
  value,
  onChange,
}: {
  field: CheckInProfileField;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = field === "country" ? "Country" : REGISTRATION_FIELD_LABELS[field];
  if (field === "gender") {
    return (
      <Field label={label} required={required}>
        <select
          className={cn(controlClass, "w-full rounded-md border px-2")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select</option>
          {GUEST_GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {GUEST_GENDER_LABELS[gender]}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field label={label} required={required}>
      <Input
        className={controlClass}
        type={field === "dateOfBirth" ? "date" : field === "email" ? "email" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={`fo-ci-v2-field-${field}`}
      />
    </Field>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#6B5E4E]">{label}</p>
      <p className="mt-1 text-sm text-[#251605]">{value}</p>
    </div>
  );
}

function FormSection({
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

function DocumentStatusBanner({
  state,
  expiryTone,
}: {
  state: RegistrationDocumentState | null;
  expiryTone: ReturnType<typeof documentExpiryStatus>;
}) {
  if (!state) return null;
  const blocked = state.tone === "blocked" || expiryTone === "expired";
  const warning = state.tone === "warning";
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
        blocked && "bg-red-50 text-red-800",
        warning && "bg-[#C89933]/15 text-[#8B6914]",
        !blocked && !warning && "bg-[#436436]/10 text-[#436436]",
      )}
      data-testid="fo-ci-v2-document-state"
      data-tone={blocked ? "blocked" : state.tone}
    >
      {blocked ? <ShieldAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
      <span>{blocked && expiryTone === "expired" ? "Expired document" : state.label}</span>
    </div>
  );
}
