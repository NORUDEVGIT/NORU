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
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  MoreHorizontal,
  ScanLine,
  ShieldAlert,
  X,
} from "lucide-react";

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
  registrationIdentitySelection,
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
import {
  registrationSnapshotGaps,
  type RegistrationCompletionProjection,
} from "@/packages/pms/lib/fo-check-in-readiness";
import { getCheckInReadiness } from "@/packages/pms/lib/fo-check-in-readiness.functions";
import { classifyCheckInUnitFailure } from "@/packages/pms/lib/fo-checkin-v2-model";
import { documentExpiryStatus } from "@/packages/pms/lib/guest-identity-documents";
import {
  GUEST_GENDER_LABELS,
  GUEST_GENDERS,
  GUEST_TITLE_LABELS,
  GUEST_TITLES,
} from "@/packages/pms/lib/guest-profile-individual";
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
import {
  ISO_COUNTRIES,
  countryCodeFromInput,
  countryNameFromInput,
} from "@/packages/pms/lib/pms-geography";
import { unicodeFlagFromIso } from "@/packages/pms/lib/pms-property-setup-phone";
import { propertyToday } from "@/shared/lib/property-dates";
import { useRestaurantTime } from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogOverlay } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import { cn } from "@/shared/lib/utils";

export type CheckInRegistrationHandle = {
  save: () => Promise<boolean>;
};

const DEMONYMS: Record<string, string> = {
  ET: "Ethiopian",
  GB: "British",
  KE: "Kenyan",
  US: "American",
  FR: "French",
  DE: "German",
  IT: "Italian",
  ES: "Spanish",
  CA: "Canadian",
  AU: "Australian",
  CN: "Chinese",
  IN: "Indian",
  JP: "Japanese",
  BR: "Brazilian",
  NG: "Nigerian",
  ZA: "South African",
  EG: "Egyptian",
  SD: "Sudanese",
  SS: "South Sudanese",
  SO: "Somali",
  DJ: "Djiboutian",
  ER: "Eritrean",
  UG: "Ugandan",
  RW: "Rwandan",
  TZ: "Tanzanian",
  SA: "Saudi",
  AE: "Emirati",
  NL: "Dutch",
  SE: "Swedish",
  NO: "Norwegian",
  CH: "Swiss",
  RU: "Russian",
  TR: "Turkish",
  GR: "Greek",
  PT: "Portuguese",
  IE: "Irish",
  BE: "Belgian",
  AT: "Austrian",
};

const NATIONALITY_OPTIONS = ISO_COUNTRIES.map((c) => {
  const demonym = DEMONYMS[c.code] || c.name;
  return {
    value: demonym,
    label: `${unicodeFlagFromIso(c.code)} ${demonym} (${c.name})`.trim(),
    code: c.code,
    countryName: c.name,
  };
});

const COUNTRY_OPTIONS = ISO_COUNTRIES.map((c) => ({
  value: c.code,
  label: `${unicodeFlagFromIso(c.code)} ${c.name}`.trim(),
}));

const LANGUAGE_LIST = [
  "English",
  "Amharic",
  "Oromo",
  "Tigrinya",
  "Arabic",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Chinese",
  "Other",
];

function profileValues(
  guest: GuestProfile | null,
): Partial<Record<CheckInProfileField, string | null>> {
  if (!guest) return {};
  return {
    title: guest.title,
    firstName: guest.firstName,
    middleName: guest.middleName,
    lastName: guest.lastName,
    preferredName: guest.preferredName,
    gender: guest.gender,
    dateOfBirth: guest.dateOfBirth,
    nationality: guest.nationality,
    country: guest.country,
    phone: guest.phone,
    email: guest.email,
    addressLine1: guest.addressLine1,
    addressLine2: guest.addressLine2,
    city: guest.city,
    region: guest.region,
    postalCode: guest.postalCode,
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
        {required ? <span className="text-[#8B4513] font-semibold"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const controlClass =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

const selectClass =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus-visible:border-[#8A641A] focus-visible:ring-1 focus-visible:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

const fieldGridClass = "grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-3";

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
    registrationCompletion: RegistrationCompletionProjection | null;
    onSaved: () => void;
  }
>(function FoCheckInV2Registration(
  {
    restaurantId,
    reservationId,
    reservationRoomId,
    unit,
    profileNumber,
    roomGuests,
    registrationCompletion,
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
  const fetchReadiness = useServerFn(getCheckInReadiness);
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
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const seed = `${registration?.guestId ?? ""}:${registration?.reservationRoomId ?? ""}`;
  useEffect(() => {
    if (!registration || guestQuery.isLoading || seed === seedKey) return;
    setDraft(registrationDraft(registration.fields, profileValues(guest)));
    const identity = registrationIdentitySelection(registration.documents, today);
    setSelectedDocumentId(identity?.id ?? null);
    setIdTypeId(identity?.typeId ?? "");
    setDocumentNumber(identity?.documentNumber ?? "");
    setIssuingCountry(
      countryCodeFromInput(identity?.issuingCountry ?? "") || identity?.issuingCountry || "",
    );
    setExpiryDate(identity?.expiryDate ?? "");
    setIssueDate(identity?.issueDate ?? "");
    setErrors([]);
    setDuplicates(null);
    setSeedKey(seed);
  }, [guest, guestQuery.isLoading, registration, seed, seedKey, today]);

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
    if (documentDetail.issuingCountry) {
      setIssuingCountry(
        countryCodeFromInput(documentDetail.issuingCountry) || documentDetail.issuingCountry,
      );
    }
    if (documentDetail.idTypeId) setIdTypeId(documentDetail.idTypeId);
  }, [documentDetail, selectedDocumentId]);

  const selected = registration?.documents.find((item) => item.id === selectedDocumentId) ?? null;
  const documentState = registration
    ? registrationDocumentState({
        documents: selected ? [selected] : [],
        warnings: registration.warnings,
        today,
      })
    : null;

  function setValue(key: CheckInProfileField, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function selectDocument(id: string | null) {
    setSelectedDocumentId(id);
    const row = registration?.documents.find((item) => item.id === id) ?? null;
    setIdTypeId(row?.typeId ?? "");
    setDocumentNumber(row?.documentNumber ?? "");
    setIssuingCountry(countryCodeFromInput(row?.issuingCountry ?? "") || row?.issuingCountry || "");
    setExpiryDate(row?.expiryDate ?? "");
    setIssueDate(row?.issueDate ?? "");
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
      await queryClient.invalidateQueries({
        queryKey: ["fo-ci-v2-readiness", restaurantId, reservationId, reservationRoomId],
      });
      const readiness = await fetchReadiness({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      });
      onSaved();
      if (!readiness.registration.complete && !readiness.registration.waived) {
        const gaps = registrationSnapshotGaps({ fields: payload.fields });
        setErrors(gaps.length > 0 ? gaps : ["Registration is incomplete."]);
        return false;
      }
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
    setDuplicateChecking(true);
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
      setDuplicates(null);
      setDuplicateError("Duplicate search could not be completed. Try again.");
    } finally {
      setDuplicateChecking(false);
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
      className="space-y-3"
      data-testid="fo-ci-v2-registration"
      data-guest-id={registration.guestId}
    >
      <section
        className="rounded-xl border border-[#E8DFD0] bg-white px-4 py-3 shadow-sm"
        data-testid="fo-ci-v2-registration-header"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#251605]">Registration</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  registrationCompletion?.state === "complete" && "bg-[#436436]/12 text-[#436436]",
                  registrationCompletion?.state === "incomplete" && "bg-red-50 text-red-800",
                  registrationCompletion?.state === "waived" && "bg-[#C89933]/15 text-[#8B6914]",
                  !registrationCompletion && "bg-[#F3EEE6] text-[#6B5E4E]",
                )}
                data-testid="fo-ci-v2-registration-completion"
                data-registration-state={registrationCompletion?.state ?? "unknown"}
              >
                {registrationCompletion?.label ?? "—"}
              </span>
            </div>
            <p
              className="mt-1.5 text-sm font-semibold text-[#251605]"
              data-testid="fo-ci-v2-registration-guest"
            >
              {unit.primaryGuestName}
            </p>
            <p className="text-xs text-[#6B5E4E]">
              {profileNumber ? `${profileNumber} · ` : ""}
              <span data-testid="fo-ci-v2-registration-relationship">{relationship}</span>
              {` · ${unit.adults} Adult${unit.adults === 1 ? "" : "s"} · ${unit.children} ${
                unit.children === 1 ? "Child" : "Children"
              }`}
            </p>
            {registrationCompletion?.detail ? (
              <p className="mt-1 text-xs text-[#6B5E4E]">{registrationCompletion.detail}</p>
            ) : null}
            {guestQuery.isError ? (
              <p
                className="mt-1 text-xs text-[#8B4513]"
                data-testid="fo-ci-v2-registration-guest-unavailable"
              >
                Guest profile unavailable. Required check-in fields can still be saved when they are
                already loaded.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={duplicateChecking}
              onClick={() => void checkDuplicates()}
              data-testid="fo-ci-v2-check-duplicates"
            >
              Check for possible duplicate profiles
            </Button>
            {duplicateChecking ? (
              <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-duplicate-checking">
                Checking for duplicate profiles…
              </p>
            ) : null}
            {!duplicateChecking && duplicates && duplicates.length === 0 ? (
              <p
                className="flex items-center gap-1 text-xs text-[#436436]"
                data-testid="fo-ci-v2-duplicate-clear"
              >
                <CheckCircle2 className="size-3.5" />
                No possible duplicate profiles found
              </p>
            ) : null}
            {duplicateError ? <p className="text-xs text-[#8B4513]">{duplicateError}</p> : null}
          </div>
        </div>
        {duplicates && duplicates.length > 0 ? (
          <div className="mt-3 border-t border-[#E8DFD0] pt-3" data-testid="fo-ci-v2-duplicates">
            <p className="text-sm font-semibold text-[#251605]">Possible duplicate profiles</p>
            <p className="mt-1 text-xs text-[#6B5E4E]">
              Review only. This search does not merge or replace the current guest.
            </p>
            <ul className="mt-2 space-y-2">
              {duplicates.map((match) => (
                <li
                  key={match.id}
                  className="rounded-[6px] border border-[#E8DFD0] px-3 py-2 text-sm"
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
          </div>
        ) : null}
      </section>

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

      {/* Required fields note */}
      <p className="-mt-1 text-[11px] text-[#8C7E72]">
        <span className="font-semibold text-[#8B4513]">*</span> Required to complete registration
      </p>

      <FormSection title="A. Registration Details" testId="fo-ci-v2-registration-details">
        <div className={fieldGridClass}>
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
        {/* Identity details grid + document thumbnail */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID type">
              <SearchableSelect
                id="fo-ci-v2-id-type"
                data-testid="fo-ci-v2-id-type"
                value={idTypeId}
                options={types.map((type) => ({ value: type.id, label: type.name }))}
                placeholder="Select ID type"
                searchPlaceholder="Search ID types…"
                className={selectClass}
                popoverClassName="z-[90]"
                onChange={setIdTypeId}
              />
            </Field>
            <Field label="ID number" required={selectedType?.documentNumberRequired === true}>
              <Input
                className={controlClass}
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                data-testid="fo-ci-v2-id-number"
              />
            </Field>
            <Field label="Issuing country" required={Boolean(selectedType?.issuingCountryRequired)}>
              <SearchableSelect
                id="fo-ci-v2-issuing-country"
                value={countryCodeFromInput(issuingCountry) || issuingCountry}
                options={COUNTRY_OPTIONS}
                placeholder="Select issuing country"
                searchPlaceholder="Search countries…"
                className={selectClass}
                popoverClassName="z-[90]"
                onChange={(code) => setIssuingCountry(code)}
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
            {/* Verification status inline */}
            <div className="flex flex-col justify-end space-y-1">
              <p className="text-xs font-medium text-[#6B5E4E]">Verification status</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  selected?.verificationStatus === "verified" && "text-[#436436]",
                  selected?.verificationStatus === "rejected" && "text-red-700",
                  (!selected?.verificationStatus || selected.verificationStatus === "unverified") &&
                    "text-[#8B6914]",
                )}
                data-testid="fo-ci-v2-id-verification"
              >
                {selected?.verificationStatus ?? "Unverified"}
              </p>
              {documentDetail?.verifiedByName ? (
                <p className="text-xs text-[#6B5E4E]">by {documentDetail.verifiedByName}</p>
              ) : null}
            </div>
          </div>

          {/* Document thumbnail card */}
          <div className="flex flex-col gap-2">
            <div
              className="flex min-h-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-[6px] border border-[#DDD4C5] bg-[#FBF7F1] transition-colors hover:border-[#8A641A]"
              onClick={() => { if (documentDetail?.url) setPreviewOpen(true); }}
              title={documentDetail?.url ? "Click to preview" : ""}
            >
              {documentDetail?.url && documentDetail.mimeType?.startsWith("image/") ? (
                <img
                  src={documentDetail.url}
                  alt="Identity document"
                  className="max-h-28 rounded-sm object-contain"
                />
              ) : documentDetail?.url ? (
                <div className="flex flex-col items-center gap-1 text-[#6B5E4E]">
                  <FileText className="size-7" />
                  <span className="text-xs">PDF Document</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-[#CCCCCC]">
                  <FileText className="size-7" />
                  <span className="text-[10px]">
                    {selected?.hasFile ? "On guest profile" : "No file"}
                  </span>
                </div>
              )}
            </div>
            {documentDetail?.url ? (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-[#8A641A] hover:underline"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="size-3" /> View document
              </button>
            ) : null}
          </div>
        </div>

        {/* Document image preview modal */}
        {previewOpen && documentDetail?.url ? (
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogOverlay className="z-[90]" />
            <DialogContent className="z-[90] max-w-3xl p-0">
              <div className="relative">
                <button
                  type="button"
                  className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
                  onClick={() => setPreviewOpen(false)}
                >
                  <X className="size-4" />
                </button>
                {documentDetail.mimeType?.startsWith("image/") ? (
                  <img
                    src={documentDetail.url}
                    alt="Identity document"
                    className="max-h-[80vh] w-full rounded-md object-contain"
                  />
                ) : (
                  <iframe
                    src={documentDetail.url}
                    title="Identity document"
                    className="h-[80vh] w-full rounded-md"
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}

        {/* Action buttons — hierarchical */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Primary action */}
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#C89933] text-xs text-white hover:bg-[#8A641A]"
            disabled={busy}
            onClick={() => void save()}
            data-testid="fo-ci-v2-add-document"
          >
            Save ID details
          </Button>
          {/* Secondary actions */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedDocumentId || busy}
            onClick={() => fileRef.current?.click()}
            data-testid="fo-ci-v2-attach-document"
          >
            Attach file
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
          {/* More actions (verify / reject) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-[#6B5E4E]"
                disabled={!selectedDocumentId || busy}
              >
                <MoreHorizontal className="mr-1 size-3.5" />
                More
              </Button>
            </PopoverTrigger>
            <PopoverContent className="z-[90] w-44 p-1" align="start">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-xs text-[#436436] hover:bg-[#436436]/10"
                disabled={busy}
                onClick={() => void review("verified")}
                data-testid="fo-ci-v2-verify-document"
              >
                <CheckCircle2 className="size-3.5" /> Verify ID
              </button>
              <div className="my-1 border-t border-[#E8DFD0]" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                disabled={busy}
                onClick={() => void review("rejected")}
                data-testid="fo-ci-v2-reject-document"
              >
                <AlertTriangle className="size-3.5" /> Reject ID
              </button>
            </PopoverContent>
          </Popover>
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
        </div>
        {scanNote ? (
          <p className="mt-2 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-scan-unavailable">
            Scanner integration not configured.
          </p>
        ) : null}
        {/* Rejection reason input (shown when a doc is selected) */}
        {selectedDocumentId ? (
          <div className="mt-2">
            <Input
              className={cn(controlClass, "max-w-xs")}
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection title="C. Contact Information" testId="fo-ci-v2-contact">
        <div className={fieldGridClass}>
          <Field label="Mobile phone" required={registrationFieldRequired(registration.fields, "phone")}>
            <CanonicalPhoneInput
              value={draft.phone}
              onChange={(v) => setValue("phone", v)}
              size="modal"
              containerClassName="h-9 gap-0 overflow-hidden rounded-[6px] border border-[#CCCCCC] bg-white focus-within:border-[#8A641A] focus-within:ring-1 focus-within:ring-[#8A641A]"
              triggerClassName="h-9 w-[7.75rem] rounded-none border-0 bg-transparent px-2 shadow-none hover:bg-[#FAF8F5]"
              className="h-9 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              popoverClassName="z-[90]"
              data-testid="fo-ci-v2-field-phone"
            />
          </Field>
          {REGISTRATION_CONTACT_FIELDS.filter((key) => key !== "phone").map((key) => (
            <ProfileControl
              key={key}
              field={key}
              required={registrationFieldRequired(registration.fields, key)}
              value={draft[key]}
              onChange={(value) => setValue(key, value)}
            />
          ))}
        </div>
        {registration.fields.some((field) => registrationCanonicalKey(field.code) == null) ? (
          <div className={cn(fieldGridClass, "mt-2")}>
            {registration.fields
              .filter((field) => registrationCanonicalKey(field.code) == null)
              .map((field) => (
                <ReadOnly key={field.code} label={field.label} value={field.value ?? "—"} />
              ))}
          </div>
        ) : null}
      </FormSection>

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
  const label = REGISTRATION_FIELD_LABELS[field] ?? field;

  if (field === "title") {
    return (
      <Field label={label} required={required}>
        <SearchableSelect
          id="fo-ci-v2-field-title"
          data-testid="fo-ci-v2-field-title"
          value={value}
          options={GUEST_TITLES.map((title) => ({ value: title, label: GUEST_TITLE_LABELS[title] }))}
          placeholder="Select title"
          searchPlaceholder="Search titles…"
          className={selectClass}
          popoverClassName="z-[90]"
          onChange={onChange}
        />
      </Field>
    );
  }

  if (field === "gender") {
    return (
      <Field label={label} required={required}>
        <SearchableSelect
          id="fo-ci-v2-field-gender"
          data-testid="fo-ci-v2-field-gender"
          value={value}
          options={GUEST_GENDERS.map((gender) => ({
            value: gender,
            label: GUEST_GENDER_LABELS[gender],
          }))}
          placeholder="Select gender"
          searchPlaceholder="Search genders…"
          className={selectClass}
          popoverClassName="z-[90]"
          onChange={onChange}
        />
      </Field>
    );
  }

  if (field === "nationality") {
    // value stored as demonym string (e.g. "Ethiopian")
    const matchedOption = NATIONALITY_OPTIONS.find(
      (o) => o.value === value || o.code === countryCodeFromInput(value),
    );
    const selectValue = matchedOption?.value ?? value;
    return (
      <Field label={label} required={required}>
        <SearchableSelect
          id="fo-ci-v2-field-nationality"
          data-testid="fo-ci-v2-field-nationality"
          value={selectValue}
          options={NATIONALITY_OPTIONS}
          placeholder="Select nationality"
          searchPlaceholder="Search nationality…"
          allowCustomValue
          className={selectClass}
          popoverClassName="z-[90]"
          onChange={(v) => onChange(v)}
        />
      </Field>
    );
  }

  if (field === "country") {
    const code = countryCodeFromInput(value) || value;
    return (
      <Field label="Country" required={required}>
        <SearchableSelect
          id="fo-ci-v2-field-country"
          data-testid="fo-ci-v2-field-country"
          value={code}
          options={COUNTRY_OPTIONS}
          placeholder="Select country"
          searchPlaceholder="Search countries…"
          className={selectClass}
          popoverClassName="z-[90]"
          onChange={(code) => onChange(countryNameFromInput(code) || code)}
        />
      </Field>
    );
  }

  if (field === "language") {
    const languageOptions = LANGUAGE_LIST.map((l) => ({ value: l, label: l }));
    return (
      <Field label={label} required={required}>
        <SearchableSelect
          id="fo-ci-v2-field-language"
          data-testid="fo-ci-v2-field-language"
          value={value}
          options={languageOptions}
          placeholder="Select language"
          searchPlaceholder="Search languages…"
          allowCustomValue
          className={selectClass}
          popoverClassName="z-[90]"
          onChange={onChange}
        />
      </Field>
    );
  }

  // phone is handled separately in the Contact section with CanonicalPhoneInput
  if (field === "phone") return null;

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
