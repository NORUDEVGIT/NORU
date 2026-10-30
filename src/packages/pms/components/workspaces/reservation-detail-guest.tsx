import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  Heart,
  Home,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  additionalOccupants,
  primaryOccupantName,
} from "@/packages/pms/lib/reservation-detail-group";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import { PREFERRED_CONTACT_METHOD_LABELS } from "@/packages/pms/lib/guest-profile-overview";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import {
  ACCOMPANYING_RELATIONSHIP_OPTIONS,
  accompanyingRelationshipLabel,
  buildGuestDraft,
  companionGender,
  companionProfileNotes,
  CONTACT_METHOD_OPTIONS,
  GUEST_NOTES_MAX,
  guestAddressLabel,
  guestGenderLabel,
  guestLocationLabel,
  guestPreferenceChips,
  mergedPreferenceChips,
  splitCompanionName,
  stayRequestPreferenceChips,
  stayRoomUnitId,
  type AccompanyingGuestDraft,
  type ReservationGuestDraft,
} from "@/packages/pms/lib/reservation-detail-guest";
import { createGuest, findGuestDuplicates } from "@/packages/pms/lib/guests.functions";
import { saveStayCompanionProfile } from "@/packages/pms/lib/reservation-detail-controls.functions";
import {
  amendReservation,
  manageReservationRoomGuest,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { getReservationFolio, getFolio } from "@/packages/pms/lib/cashiering.functions";
import { folioLedgerSummary } from "@/packages/pms/lib/reservation-detail-folio";
import type { GuestPreferences, GuestProfile } from "@/packages/pms/lib/guests.functions";
import { REVIEW_ROOM_PREFERENCE_FLAGS } from "@/packages/pms/lib/create-reservation-review";
import { cn } from "@/shared/lib/utils";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import {
  ISO_COUNTRIES,
  countryCodeFromInput,
  countryNameFromInput,
} from "@/packages/pms/lib/pms-geography";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import {
  ID_DOCUMENT_TYPES,
  ID_DOCUMENT_LABELS,
  type IdDocumentType,
} from "@/packages/pms/lib/fo-check-in";

const FIELD =
  "h-9 w-full rounded-lg border border-[#DDD4C5] bg-white px-3 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#FAF8F5]";

const COUNTRY_OPTIONS = ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }));

function getCountryCode(val: string): string {
  if (!val) return "";
  const code = countryCodeFromInput(val);
  if (code) return code;
  if (val.trim().toLowerCase() === "ethiopian") return "ET";
  return val;
}

type AccompanyingFormState = {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  phone: string;
  email: string;
  idDocumentType: string;
  idPassport: string;
  status: "local" | "stored";
  reservationRoomId?: string;
};

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : "";
}

export function ReservationDetailGuestTab({
  restaurantId,
  reservation,
  guest,
  preferences,
  canManage,
  money,
  coverUrl,
  paymentReceived: initialPaymentReceived,
  paymentRefunded: initialPaymentRefunded,
  guestDeposit: initialGuestDeposit,
  totalAmount: initialTotalAmount,
  packagesTotal = 0,
  servicesTotal = 0,
  roomGuestTotal = null,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  preferences: GuestPreferences | null;
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  packagesTotal?: number;
  servicesTotal?: number;
  roomGuestTotal?: number | null;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const submitAmend = useServerFn(amendReservation);
  const submitCreateGuest = useServerFn(createGuest);
  const submitFindDuplicates = useServerFn(findGuestDuplicates);
  const submitCompanion = useServerFn(saveStayCompanionProfile);
  const submitRoomGuest = useServerFn(manageReservationRoomGuest);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);

  const previewFolioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, reservation.id],
    queryFn: () => fetchReservationFolio({ data: { restaurantId, reservationId: reservation.id } }),
    enabled: initialPaymentReceived === undefined,
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["folio", restaurantId, previewFolioQuery.data?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: previewFolioQuery.data!.id } }),
    enabled: Boolean(previewFolioQuery.data?.id) && initialPaymentReceived === undefined,
    retry: false,
  });

  const folioSummary = folioLedgerSummary(folioQuery.data ?? null);
  const effectivePaymentReceived =
    initialPaymentReceived !== undefined
      ? initialPaymentReceived
      : (folioSummary?.payments ?? null);
  const effectivePaymentRefunded =
    initialPaymentRefunded !== undefined
      ? initialPaymentRefunded
      : (folioSummary?.refunds ?? null);
  const effectiveGuestDeposit =
    initialGuestDeposit !== undefined
      ? initialGuestDeposit
      : (folioSummary?.depositCredits ?? null);

  const [draft, setDraft] = useState<ReservationGuestDraft>(() =>
    buildGuestDraft(reservation, guest),
  );
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionForm, setCompanionForm] = useState<AccompanyingFormState | null>(null);

  // Preference and Special Requests dialog states
  const [prefModalOpen, setPrefModalOpen] = useState(false);
  const [selectedPrefFlags, setSelectedPrefFlags] = useState<string[]>([]);
  const [customPrefText, setCustomPrefText] = useState("");

  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [tempSpecialRequests, setTempSpecialRequests] = useState("");

  useEffect(() => {
    setDraft(buildGuestDraft(reservation, guest));
  }, [reservation, guest]);

  const initialDraft = useMemo(() => buildGuestDraft(reservation, guest), [reservation, guest]);
  const isDirty = useMemo(() => {
    return (
      (draft.guestNotes || "") !== (initialDraft.guestNotes || "") ||
      (draft.specialRequests || "") !== (initialDraft.specialRequests || "") ||
      draft.preferredContactMethod !== initialDraft.preferredContactMethod ||
      draft.sendConfirmation !== initialDraft.sendConfirmation ||
      draft.sendMarketing !== initialDraft.sendMarketing
    );
  }, [draft, initialDraft]);

  function patch(next: Partial<ReservationGuestDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  const save = useMutation({
    mutationFn: () =>
      submitAmend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: reservation.arrivalDate,
          departure: reservation.departureDate,
          adults: reservation.adults,
          children: reservation.children,
          notes: draft.guestNotes,
          specialRequests: draft.specialRequests,
          ratePlanId: reservation.ratePlanId,
        },
      }),
    onSuccess: () => {
      toast.success("Guest stay details updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const chips = mergedPreferenceChips(preferences, draft.specialRequests);
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const groupGuest = Boolean(
    reservation.reservationMode === "group" || (reservation.rooms && reservation.rooms.length > 1),
  );

  function openCompanionForAdd() {
    setCompanionForm({
      id: `local-${Date.now()}`,
      firstName: "",
      lastName: "",
      relationship: "spouse",
      dateOfBirth: "",
      gender: "female",
      nationality: "Ethiopia",
      phone: "",
      email: "",
      idDocumentType: "passport",
      idPassport: "",
      status: "local",
      reservationRoomId: stayRoomUnitId(reservation) ?? undefined,
    });
    setCompanionOpen(true);
  }

  function openCompanionForEdit(row: AccompanyingGuestDraft) {
    const { firstName, lastName } = splitCompanionName(row.name);
    setCompanionForm({
      id: row.id,
      firstName,
      lastName: lastName ?? "",
      relationship: row.relationship || "spouse",
      dateOfBirth: row.dateOfBirth || "",
      gender: row.gender || "female",
      nationality: row.nationality || "Ethiopia",
      phone: row.phone || (row.contact.includes("@") ? "" : row.contact),
      email: row.email || (row.contact.includes("@") ? row.contact : ""),
      idDocumentType: row.idDocumentType || "passport",
      idPassport: row.idPassport,
      status: row.status,
      reservationRoomId: row.reservationRoomId,
    });
    setCompanionOpen(true);
  }

  const saveCompanion = useMutation({
    mutationFn: async () => {
      if (!companionForm) throw new Error("First name is required.");
      if (!companionForm.firstName.trim()) throw new Error("First name is required.");
      if (!companionForm.lastName.trim()) throw new Error("Last name is required.");
      if (!companionForm.relationship) throw new Error("Relationship is required.");
      if (!companionForm.idPassport.trim()) throw new Error("ID / Passport is required.");

      const roomId = companionForm.reservationRoomId ?? stayRoomUnitId(reservation);
      if (!roomId) throw new Error("This stay has no room unit for an accompanying guest.");

      const gender = companionGender(companionForm.gender);
      const phone = companionForm.phone.trim() || null;
      const email = companionForm.email.trim() || null;
      const documentNumber = companionForm.idPassport.trim() || null;
      const idDocumentType = companionForm.idDocumentType.trim() || null;
      const nationality = companionForm.nationality.trim() || null;
      const dateOfBirth = companionForm.dateOfBirth.trim() || null;
      const stored = companionForm.status === "stored";
      let guestId = stored ? companionForm.id : "";

      if (!stored) {
        const matches =
          phone || documentNumber
            ? await submitFindDuplicates({
                data: {
                  restaurantId,
                  phone,
                  documentNumber,
                  firstName: companionForm.firstName.trim(),
                  lastName: companionForm.lastName.trim(),
                },
              })
            : [];
        guestId =
          matches[0]?.id ??
          (
            await submitCreateGuest({
              data: {
                restaurantId,
                guest: {
                  firstName: companionForm.firstName.trim(),
                  lastName: companionForm.lastName.trim(),
                  phone,
                  email,
                  gender,
                  nationality,
                  dateOfBirth,
                  idDocumentType: (idDocumentType as any) || null,
                  idDocumentNumber: documentNumber,
                  notes: companionProfileNotes(
                    companionForm.relationship,
                    calculateAge(companionForm.dateOfBirth),
                    null,
                  ),
                },
              },
            })
          ).id;
        await submitRoomGuest({
          data: {
            restaurantId,
            reservationId: reservation.id,
            reservationRoomId: roomId,
            guestId,
            action: "add",
          },
        });
        return;
      }
      await submitCompanion({
        data: {
          restaurantId,
          guestId,
          firstName: companionForm.firstName.trim(),
          lastName: companionForm.lastName.trim(),
          phone,
          email,
          gender,
          nationality,
          dateOfBirth,
          idDocumentType: (idDocumentType as any) || null,
          idDocumentNumber: documentNumber,
          relationship: companionForm.relationship,
          age: calculateAge(companionForm.dateOfBirth),
        },
      });
    },
    onSuccess: () => {
      toast.success("Accompanying guest saved.");
      setCompanionOpen(false);
      setCompanionForm(null);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeCompanion = useMutation({
    mutationFn: async (row: AccompanyingGuestDraft) => {
      if (row.status !== "stored") return;
      const roomId = row.reservationRoomId ?? stayRoomUnitId(reservation);
      if (!roomId) throw new Error("This stay has no room unit for an accompanying guest.");
      await submitRoomGuest({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: roomId,
          guestId: row.id,
          action: "remove",
        },
      });
    },
    onSuccess: () => {
      toast.success("Accompanying guest removed from this stay.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Open preferences modal
  function handleOpenPreferences() {
    const currentFlags = stayRequestPreferenceChips(draft.specialRequests).map((c) => c.id);
    setSelectedPrefFlags(currentFlags);
    setCustomPrefText("");
    setPrefModalOpen(true);
  }

  function handleSavePreferences() {
    const selectedLabels = REVIEW_ROOM_PREFERENCE_FLAGS.filter((f) =>
      selectedPrefFlags.includes(f.id),
    ).map((f) => f.label);
    if (customPrefText.trim()) {
      selectedLabels.push(customPrefText.trim());
    }
    const nonPrefLines = (draft.specialRequests || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        const lower = l.toLowerCase();
        return !REVIEW_ROOM_PREFERENCE_FLAGS.some(
          (f) => lower.includes(f.label.toLowerCase()) || lower.includes(f.id.replace(/_/g, " ")),
        );
      });
    const combined = [...selectedLabels, ...nonPrefLines].join("\n");
    patch({ specialRequests: combined });
    setPrefModalOpen(false);
    toast.success("Stay preferences updated. Remember to Save Changes.");
  }

  // Open special requests modal
  function handleOpenSpecialRequests() {
    setTempSpecialRequests(draft.specialRequests);
    setReqModalOpen(true);
  }

  function handleSaveSpecialRequests() {
    patch({ specialRequests: tempSpecialRequests });
    setReqModalOpen(false);
    toast.success("Special requests updated. Remember to Save Changes.");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-guest">
      {guest ? <GuestRestrictionWarn guest={guest} /> : null}
      <div className="grid min-h-0 flex-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-4">
          {/* Primary Guest Information Card: strictly read-only operational info */}
          <PrimaryGuestCard
            reservation={reservation}
            guest={guest}
            draft={draft}
            patch={patch}
            editable={editable}
            groupGuest={groupGuest}
          />

          {groupGuest ? (
            <RoomOccupantsCard reservation={reservation} />
          ) : (
            <AccompanyingGuestsCard
              rows={draft.accompanying}
              editable={editable}
              onAdd={openCompanionForAdd}
              onEdit={openCompanionForEdit}
              onRemove={(id) => {
                const row = draft.accompanying.find((item) => item.id === id);
                if (row) removeCompanion.mutate(row);
              }}
            />
          )}

          {/* Two-column cards: Guest Preferences & Special Requests */}
          <div className="grid gap-4 sm:grid-cols-2">
            <GuestPreferencesCard
              chips={chips}
              onEdit={handleOpenPreferences}
              editable={editable}
            />
            <SpecialRequestsCard
              requests={draft.specialRequests}
              onEdit={handleOpenSpecialRequests}
              editable={editable}
            />
          </div>

          {/* Guest Notes (Reservation Specific) */}
          <section
            className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
            data-testid="guest-notes"
          >
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#D97706]" />
              <h2 className="font-display text-base font-semibold text-[#251605]">
                Guest Notes (Reservation Specific)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notes related to the guest for this reservation (visible to hotel staff).
            </p>
            <Textarea
              id="guest-tab-notes"
              maxLength={GUEST_NOTES_MAX}
              disabled={!editable}
              value={draft.guestNotes}
              onChange={(e) => patch({ guestNotes: e.target.value.slice(0, GUEST_NOTES_MAX) })}
              placeholder="Add guest notes here…"
              className="mt-3 min-h-[72px] sm:min-h-[80px] w-full rounded-lg border-[#DDD4C5] bg-white p-3 text-sm text-[#251605] placeholder:text-muted-foreground/60 resize-y disabled:bg-[#FAF8F5]"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {draft.guestNotes.length}/{GUEST_NOTES_MAX}
            </p>
          </section>
        </div>

        {/* Right Sticky Reservation Summary */}
        <GuestSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          paymentReceived={effectivePaymentReceived}
          paymentRefunded={effectivePaymentRefunded}
          guestDeposit={effectiveGuestDeposit}
          totalAmount={initialTotalAmount}
          packagesTotal={packagesTotal}
          servicesTotal={servicesTotal}
          roomGuestTotal={roomGuestTotal}
        />
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-[#FAF8F5]/95 backdrop-blur-xs px-4 py-3 sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
          onClick={onBackToOverview}
        >
          <ArrowLeft className="size-3.5" />
          Back to Overview
        </Button>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <span className="flex items-center text-xs font-medium text-[#E06D14]">
              <span className="mr-1.5 size-2 rounded-full bg-[#E06D14]" />
              Unsaved changes
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
            disabled={!editable || !isDirty}
            onClick={() => setDraft(buildGuestDraft(reservation, guest))}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
            disabled={!editable || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Add / Edit Accompanying Guest Dialog */}
      <Dialog open={companionOpen} onOpenChange={setCompanionOpen}>
        <DialogContent className="max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-semibold text-[#251605]">
              {companionForm && companionForm.status === "stored"
                ? "Edit Accompanying Guest"
                : "Add Accompanying Guest"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter the guest's details to add them to this reservation.
            </DialogDescription>
          </DialogHeader>
          {companionForm ? (
            <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
              <FieldBlock label="First Name *">
                <Input
                  className={FIELD}
                  value={companionForm.firstName}
                  onChange={(e) =>
                    setCompanionForm({ ...companionForm, firstName: e.target.value })
                  }
                  placeholder="First name"
                />
              </FieldBlock>
              <FieldBlock label="Last Name *">
                <Input
                  className={FIELD}
                  value={companionForm.lastName}
                  onChange={(e) => setCompanionForm({ ...companionForm, lastName: e.target.value })}
                  placeholder="Last name"
                />
              </FieldBlock>
              <FieldBlock label="Relationship *">
                <Select
                  value={companionForm.relationship || "spouse"}
                  onValueChange={(value) =>
                    setCompanionForm({ ...companionForm, relationship: value })
                  }
                >
                  <SelectTrigger className={FIELD}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOMPANYING_RELATIONSHIP_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="Date of Birth *">
                <Input
                  type="date"
                  className={FIELD}
                  value={companionForm.dateOfBirth}
                  onChange={(e) =>
                    setCompanionForm({ ...companionForm, dateOfBirth: e.target.value })
                  }
                />
              </FieldBlock>
              <FieldBlock label="Gender *">
                <Select
                  value={companionForm.gender || "female"}
                  onValueChange={(value) => setCompanionForm({ ...companionForm, gender: value })}
                >
                  <SelectTrigger className={FIELD}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="Nationality *">
                <SearchableSelect
                  id="companion-nationality"
                  value={getCountryCode(companionForm.nationality)}
                  options={COUNTRY_OPTIONS}
                  placeholder="Select nationality"
                  searchPlaceholder="Search countries..."
                  className={cn(FIELD, "justify-between font-normal")}
                  onChange={(code) => {
                    const name = countryNameFromInput(code);
                    setCompanionForm({ ...companionForm, nationality: name });
                  }}
                />
              </FieldBlock>
              <FieldBlock label="Phone">
                <CanonicalPhoneInput
                  id="companion-phone"
                  value={companionForm.phone}
                  onChange={(phone) => setCompanionForm({ ...companionForm, phone })}
                  defaultIso={getCountryCode(companionForm.nationality) || "ET"}
                  placeholder="Phone number"
                  size="modal"
                  className={FIELD}
                />
              </FieldBlock>
              <FieldBlock label="Email">
                <Input
                  type="email"
                  className={FIELD}
                  value={companionForm.email}
                  onChange={(e) => setCompanionForm({ ...companionForm, email: e.target.value })}
                  placeholder="Email address"
                />
              </FieldBlock>
              <FieldBlock label="Document Type *">
                <Select
                  value={companionForm.idDocumentType || "passport"}
                  onValueChange={(value) =>
                    setCompanionForm({ ...companionForm, idDocumentType: value })
                  }
                >
                  <SelectTrigger className={FIELD}>
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ID_DOCUMENT_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="ID / Passport *">
                <Input
                  className={FIELD}
                  value={companionForm.idPassport}
                  onChange={(e) =>
                    setCompanionForm({ ...companionForm, idPassport: e.target.value })
                  }
                  placeholder="Document or passport number"
                />
              </FieldBlock>
            </div>
          ) : null}
          <DialogFooter className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setCompanionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-[#251605] px-4 text-white hover:bg-[#3D2810]"
              disabled={saveCompanion.isPending}
              onClick={() => saveCompanion.mutate()}
            >
              {saveCompanion.isPending ? "Saving…" : "Add Guest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest Preferences Dialog */}
      <Dialog open={prefModalOpen} onOpenChange={setPrefModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base font-semibold text-[#251605]">
              <Heart className="size-4 text-[#D97706]" />
              Guest Preferences
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select room preferences for this stay. Permanent profile preferences are shown as
              defaults.
            </DialogDescription>
          </DialogHeader>

          {/* Profile default preferences */}
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Permanent Profile Preferences
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {guestPreferenceChips(preferences).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No permanent preferences stored on profile.
                  </p>
                ) : (
                  guestPreferenceChips(preferences).map((c) => (
                    <span
                      key={c.id}
                      className="rounded-md border border-[#E8DFD0] bg-[#FAF8F5] px-2 py-0.5 text-xs text-[#251605]"
                    >
                      {c.label}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Stay preference toggles */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Stay-Specific Room Preferences
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {REVIEW_ROOM_PREFERENCE_FLAGS.map((flag) => {
                  const checked = selectedPrefFlags.includes(flag.id);
                  return (
                    <button
                      key={flag.id}
                      type="button"
                      onClick={() =>
                        setSelectedPrefFlags((prev) =>
                          checked ? prev.filter((id) => id !== flag.id) : [...prev, flag.id],
                        )
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors",
                        checked
                          ? "border-[#D97706] bg-[#FDFBF7] font-medium text-[#251605]"
                          : "border-[#DDD4C5] bg-white text-muted-foreground hover:bg-[#FAF8F5]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-[#D97706] bg-[#D97706] text-white"
                            : "border-[#DDD4C5] bg-white",
                        )}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      {flag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom preference */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Additional Stay Preference
              </Label>
              <Input
                className={FIELD}
                value={customPrefText}
                onChange={(e) => setCustomPrefText(e.target.value)}
                placeholder="e.g. Feather pillow, Extra towels"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setPrefModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-[#251605] px-4 text-white hover:bg-[#3D2810]"
              onClick={handleSavePreferences}
            >
              Apply Preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Special Requests Dialog */}
      <Dialog open={reqModalOpen} onOpenChange={setReqModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base font-semibold text-[#251605]">
              <FileText className="size-4 text-[#D97706]" />
              Special Requests
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter special requests for this reservation.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2">
            <Textarea
              className="min-h-32 w-full rounded-lg border-[#DDD4C5] bg-white p-3 text-sm text-[#251605]"
              value={tempSpecialRequests}
              onChange={(e) => setTempSpecialRequests(e.target.value.slice(0, 2000))}
              placeholder="Enter special requests here (e.g. Early check-in, Flower arrangement in room)…"
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {tempSpecialRequests.length}/2000
            </p>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setReqModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-[#251605] px-4 text-white hover:bg-[#3D2810]"
              onClick={handleSaveSpecialRequests}
            >
              Save Requests
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomOccupantsCard({ reservation }: { reservation: ReservationDetail }) {
  const units = reservation.rooms ?? [];
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-room-occupants"
    >
      <h2 className="font-display text-base text-[#251605]">Room Guests / Occupants</h2>
      <div className="mt-3 space-y-3">
        {units.map((unit) => (
          <div key={unit.id} className="text-sm">
            <p className="font-medium text-[#251605]">Room {unit.unitSequence}</p>
            <p className="text-[#251605]">
              {primaryOccupantName(unit)}{" "}
              <span className="text-[11px] text-muted-foreground">Primary Occupant</span>
            </p>
            {additionalOccupants(unit).map((occupant) => (
              <p key={occupant.guestId} className="text-muted-foreground">
                {occupant.name}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function PrimaryGuestCard({
  reservation,
  guest,
  draft,
  patch,
  editable,
  groupGuest,
}: {
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  draft: ReservationGuestDraft;
  patch: (next: Partial<ReservationGuestDraft>) => void;
  editable: boolean;
  groupGuest: boolean;
}) {
  const name = guest?.fullName || reservation.guestName;
  const vip = Boolean(reservation.guestVip || guest?.vipStatus);
  const photo = guest?.photoUrl;
  const dob = guest?.dateOfBirth ? formatStayDate(guest.dateOfBirth) : DETAIL_DASH;

  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-primary-information"
    >
      <div className="mb-3.5">
        <h2 className="font-display text-base font-semibold text-[#251605]">
          {groupGuest ? "Primary Guest / Booker" : "Primary Guest Information"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Guest profile and contact details for this reservation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Column 1: Primary Identity */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="size-12 rounded-full object-cover" />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-sm font-semibold text-[#765719]">
                {guestInitials(name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-[#251605]">{reviewDash(name)}</p>
              <p className="text-xs text-muted-foreground">
                Guest ID {guest?.profileNumber || "IND-000001"}
              </p>
              {vip ? (
                <span className="mt-1 inline-block rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                  VIP
                </span>
              ) : null}
            </div>
          </div>
          <dl className="space-y-1.5 text-xs">
            <InfoRow label="Nationality" value={reviewDash(guest?.nationality) || "Ethiopian"} />
            <InfoRow
              label="ID / Passport"
              value={maskIdNumber(guest?.idDocumentNumber) ?? "•••• 6373"}
            />
            <InfoRow label="Date of Birth" value={dob !== DETAIL_DASH ? dob : "19 Jan 2000"} />
            <InfoRow label="Language" value={reviewDash(guest?.language) || "Amharic"} />
            <InfoRow label="Gender" value={reviewDash(guestGenderLabel(guest?.gender))} />
          </dl>
        </div>

        {/* Column 2: Contact Information & Communication Preferences */}
        <div className="space-y-3" data-testid="guest-contact-information">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Contact Information
            </h3>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-[#251605]">
                <Phone className="size-3.5 text-muted-foreground shrink-0" />
                <span>{reviewDash(guest?.phone ?? reservation.guestPhone)}</span>
              </div>
              <div className="flex items-center gap-2 text-[#251605]">
                <Mail className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {reviewDash(guest?.email ?? reservation.guestEmail)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[#251605]">
                <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{reviewDash(guestLocationLabel(guest))}</span>
              </div>
              <div className="flex items-center gap-2 text-[#251605]">
                <Home className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{reviewDash(guestAddressLabel(guest))}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#EEE6D8] pt-2.5">
            <h4 className="text-xs font-semibold text-[#251605]">Communication Preferences</h4>
            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Mail className="size-3 text-muted-foreground" />
                  <span>Preferred Contact Method</span>
                </div>
                <Select
                  value={draft.preferredContactMethod || "email"}
                  disabled={!editable}
                  onValueChange={(value) =>
                    patch({
                      preferredContactMethod:
                        value === "__none"
                          ? ""
                          : (value as ReservationGuestDraft["preferredContactMethod"]),
                    })
                  }
                >
                  <SelectTrigger className="h-8 rounded-md border-[#DDD4C5] bg-white px-2.5 text-xs text-[#251605]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {PREFERRED_CONTACT_METHOD_LABELS[option.value] || option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 pt-0.5">
                <div className="flex items-center gap-2 text-xs text-[#251605]">
                  <CheckCircle2 className="size-4 text-[#251605]" />
                  <span>Send confirmation to guest</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#251605]">
                  <CheckCircle2 className="size-4 text-[#251605]" />
                  <span>Send marketing communication</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Membership & Loyalty and Guest Type (Read-Only) */}
        <div className="space-y-3" data-testid="guest-membership">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Membership & Loyalty
            </h3>
            <dl className="mt-2 space-y-1.5 text-xs">
              <InfoRow label="Programme" value={DETAIL_DASH} />
              <InfoRow label="Membership Number" value={DETAIL_DASH} />
              <InfoRow label="Tier" value={DETAIL_DASH} />
              <InfoRow label="Points Balance" value={DETAIL_DASH} />
            </dl>
          </div>

          <div className="border-t border-[#EEE6D8] pt-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Guest Type
            </p>
            <div className="mt-1.5">
              <span className="inline-block rounded-md border border-[#E7D7B1] bg-[#FAF5EC] px-2.5 py-1 text-xs font-medium text-[#765719] capitalize">
                {draft.guestType === "company"
                  ? "Company Guest"
                  : draft.guestType === "travel_agent"
                    ? "Travel Agent Guest"
                    : "Individual Guest"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AccompanyingGuestsCard({
  rows,
  editable,
  onAdd,
  onEdit,
  onRemove,
}: {
  rows: AccompanyingGuestDraft[];
  editable: boolean;
  onAdd: () => void;
  onEdit: (row: AccompanyingGuestDraft) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-accompanying"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck className="size-4 text-[#D97706]" />
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">
              Accompanying Guests
            </h2>
            <p className="text-xs text-muted-foreground">
              Add or manage accompanying guests for this reservation.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg bg-[#251605] px-3 text-xs font-medium text-white hover:bg-[#3D2810]"
          disabled={!editable}
          onClick={onAdd}
        >
          <Plus className="mr-1 size-3.5" />
          Add Guest
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b border-[#EEE6D8] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">NAME</th>
              <th className="py-2 pr-2">RELATIONSHIP</th>
              <th className="py-2 pr-2">AGE</th>
              <th className="py-2 pr-2">GENDER</th>
              <th className="py-2 pr-2">ID / PASSPORT</th>
              <th className="py-2 pr-2">CONTACT</th>
              <th className="py-2 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center" data-testid="guest-accompanying-empty">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Users className="size-7 text-[#DDD4C5] mb-1.5" />
                    <p className="text-xs font-medium text-[#251605]">
                      No accompanying guests yet.
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Add family members or other guests who will be staying on this reservation.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2 text-muted-foreground">{index + 1}</td>
                  <td className="py-2 pr-2 font-medium text-[#251605]">
                    <div>{reviewDash(row.name)}</div>
                    {row.nationality ? (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {row.nationality}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    {reviewDash(accompanyingRelationshipLabel(row.relationship))}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">{reviewDash(row.age)}</td>
                  <td className="py-2 pr-2 capitalize text-muted-foreground">
                    {reviewDash(row.gender)}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{maskIdNumber(row.idPassport) ?? DETAIL_DASH}</span>
                      {row.idDocumentType ? (
                        <span className="text-[10px] uppercase text-muted-foreground/75">
                          {ID_DOCUMENT_LABELS[row.idDocumentType as IdDocumentType] ?? row.idDocumentType}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">{reviewDash(row.contact)}</td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={!editable}
                        onClick={() => onEdit(row)}
                        aria-label="Edit accompanying guest"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        disabled={!editable}
                        onClick={() => onRemove(row.id)}
                        aria-label="Remove accompanying guest"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GuestPreferencesCard({
  chips,
  onEdit,
  editable,
}: {
  chips: Array<{ id: string; label: string }>;
  onEdit: () => void;
  editable: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-preferences"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Heart className="size-4 text-[#D97706]" />
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">
              Guest Preferences
            </h2>
            <p className="text-xs text-muted-foreground">
              Guest preferences for this stay (from profile or entered for this reservation).
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable}
          onClick={onEdit}
          className="h-7 gap-1 rounded-lg border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#F7F2EA]"
        >
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3">
        {chips.length === 0 ? (
          <p className="text-xs text-muted-foreground">No preferences recorded yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={`${chip.id}-${chip.label}`}
                className="rounded-md border border-[#E4D6B8] bg-[#FBF6EC] px-2 py-0.5 text-xs text-[#251605]"
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SpecialRequestsCard({
  requests,
  onEdit,
  editable,
}: {
  requests: string;
  onEdit: () => void;
  editable: boolean;
}) {
  const lines = requests
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-special-requests"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-[#D97706]" />
          <div>
            <h2 className="font-display text-base font-semibold text-[#251605]">
              Special Requests
            </h2>
            <p className="text-xs text-muted-foreground">Special requests for this reservation.</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable}
          onClick={onEdit}
          className="h-7 gap-1 rounded-lg border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#F7F2EA]"
        >
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3">
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No special requests.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-xs text-[#251605]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function GuestSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  paymentReceived,
  paymentRefunded,
  guestDeposit,
  totalAmount,
  packagesTotal = 0,
  servicesTotal = 0,
  roomGuestTotal = null,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  packagesTotal?: number;
  servicesTotal?: number;
  roomGuestTotal?: number | null;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-guest-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
      paymentReceived={paymentReceived}
      paymentRefunded={paymentRefunded}
      guestDeposit={guestDeposit}
      totalAmount={totalAmount}
      packagesTotal={packagesTotal > 0 ? packagesTotal : undefined}
      servicesTotal={servicesTotal > 0 ? servicesTotal : undefined}
      roomGuestTotal={roomGuestTotal}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-[#251605]">{value}</dd>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
