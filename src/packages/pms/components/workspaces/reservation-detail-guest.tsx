import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Heart,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import {
  WAVE4_NO_POINTS_COPY,
  WAVE4_VIP_STAFF_FLAG_COPY,
} from "@/packages/pms/lib/guest-profile-wave4";
import { PREFERRED_CONTACT_METHOD_LABELS } from "@/packages/pms/lib/guest-profile-overview";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  ACCOMPANYING_RELATIONSHIP_OPTIONS,
  accompanyingRelationshipLabel,
  buildGuestDraft,
  CONTACT_METHOD_OPTIONS,
  emptyAccompanyingGuest,
  GUEST_NOTES_MAX,
  GUEST_TYPE_OPTIONS,
  guestAddressLabel,
  guestGenderLabel,
  guestLocationLabel,
  mergedPreferenceChips,
  type AccompanyingGuestDraft,
  type ReservationGuestDraft,
} from "@/packages/pms/lib/reservation-detail-guest";
import {
  amendReservation,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import type { GuestPreferences, GuestProfile } from "@/packages/pms/lib/guests.functions";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";

export function ReservationDetailGuestTab({
  restaurantId,
  reservation,
  guest,
  preferences,
  canManage,
  money,
  coverUrl,
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
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const submitAmend = useServerFn(amendReservation);
  const [draft, setDraft] = useState<ReservationGuestDraft>(() =>
    buildGuestDraft(reservation, guest),
  );
  const [editingRequests, setEditingRequests] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionDraft, setCompanionDraft] = useState<AccompanyingGuestDraft | null>(null);

  useEffect(() => {
    setDraft(buildGuestDraft(reservation, guest));
  }, [reservation, guest]);

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
  const chips = mergedPreferenceChips(preferences, reservation.specialRequests);
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);

  function openCompanion(row?: AccompanyingGuestDraft) {
    setCompanionDraft(row ? { ...row } : emptyAccompanyingGuest());
    setCompanionOpen(true);
  }

  function saveCompanion() {
    if (!companionDraft) return;
    if (!companionDraft.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    patch({
      accompanying: draft.accompanying.some((row) => row.id === companionDraft.id)
        ? draft.accompanying.map((row) => (row.id === companionDraft.id ? companionDraft : row))
        : [...draft.accompanying, companionDraft],
    });
    setCompanionOpen(false);
    setCompanionDraft(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-guest">
      {guest ? <GuestRestrictionWarn guest={guest} /> : null}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <PrimaryGuestCard
            reservation={reservation}
            guest={guest}
            draft={draft}
            patch={patch}
            editable={editable}
          />
          <AccompanyingGuestsCard
            rows={draft.accompanying}
            editable={editable}
            onAdd={() => openCompanion()}
            onEdit={openCompanion}
            onRemove={(id) =>
              patch({ accompanying: draft.accompanying.filter((row) => row.id !== id) })
            }
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <GuestPreferencesCard chips={chips} guestId={reservation.guestId} />
            <SpecialRequestsCard
              draft={draft}
              patch={patch}
              editable={editable}
              editing={editingRequests}
              onToggleEdit={() => setEditingRequests((value) => !value)}
            />
          </div>
          <GuestNotesCard draft={draft} patch={patch} editable={editable} />
        </div>
        <GuestSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToOverview}>
          Back to Overview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(buildGuestDraft(reservation, guest));
              setEditingRequests(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
      <Dialog open={companionOpen} onOpenChange={setCompanionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {companionDraft && draft.accompanying.some((row) => row.id === companionDraft.id)
                ? "Edit accompanying guest"
                : "Add accompanying guest"}
            </DialogTitle>
          </DialogHeader>
          {companionDraft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Name">
                <Input
                  className={FIELD}
                  value={companionDraft.name}
                  onChange={(e) => setCompanionDraft({ ...companionDraft, name: e.target.value })}
                />
              </FieldBlock>
              <FieldBlock label="Relationship">
                <Select
                  value={companionDraft.relationship || "__none"}
                  onValueChange={(value) =>
                    setCompanionDraft({
                      ...companionDraft,
                      relationship: value === "__none" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className={FIELD}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select</SelectItem>
                    {ACCOMPANYING_RELATIONSHIP_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="Age">
                <Input
                  className={FIELD}
                  value={companionDraft.age}
                  onChange={(e) => setCompanionDraft({ ...companionDraft, age: e.target.value })}
                />
              </FieldBlock>
              <FieldBlock label="Gender">
                <Input
                  className={FIELD}
                  value={companionDraft.gender}
                  onChange={(e) => setCompanionDraft({ ...companionDraft, gender: e.target.value })}
                />
              </FieldBlock>
              <FieldBlock label="ID / Passport">
                <Input
                  className={FIELD}
                  value={companionDraft.idPassport}
                  onChange={(e) =>
                    setCompanionDraft({ ...companionDraft, idPassport: e.target.value })
                  }
                />
              </FieldBlock>
              <FieldBlock label="Contact">
                <Input
                  className={FIELD}
                  value={companionDraft.contact}
                  onChange={(e) =>
                    setCompanionDraft({ ...companionDraft, contact: e.target.value })
                  }
                />
              </FieldBlock>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Accompanying guests are not stored on this reservation yet. Changes stay on this screen
            until you leave.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompanionOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveCompanion}>
              Add to stay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrimaryGuestCard({
  reservation,
  guest,
  draft,
  patch,
  editable,
}: {
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  draft: ReservationGuestDraft;
  patch: (next: Partial<ReservationGuestDraft>) => void;
  editable: boolean;
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
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Primary Guest Information</h2>
          <p className="text-xs text-muted-foreground">
            Guest profile and contact details for this reservation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: reservation.guestId }}>
              View Full Profile
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              to="/restaurant/pms/guests/$guestId"
              params={{ guestId: reservation.guestId }}
              search={{ card: "information" }}
            >
              <Pencil className="mr-1 size-3.5" />
              Edit
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {photo ? (
              <img src={photo} alt="" className="size-14 rounded-full object-cover" />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-sm font-semibold text-[#765719]">
                {guestInitials(name)}
              </div>
            )}
            <div>
              <p className="font-medium text-[#251605]">{reviewDash(name)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {vip ? (
                  <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                    VIP
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Guest ID" value={reviewDash(guest?.profileNumber)} />
            <InfoRow label="Nationality" value={reviewDash(guest?.nationality)} />
            <InfoRow
              label="ID / Passport"
              value={maskIdNumber(guest?.idDocumentNumber) ?? DETAIL_DASH}
            />
            <InfoRow label="Date of Birth" value={dob} />
            <InfoRow label="Language" value={reviewDash(guest?.language)} />
            <InfoRow label="Gender" value={reviewDash(guestGenderLabel(guest?.gender))} />
          </dl>
        </div>
        <div className="space-y-3" data-testid="guest-contact-information">
          <h3 className="text-sm font-medium text-[#251605]">Contact Information</h3>
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Phone" value={reviewDash(guest?.phone ?? reservation.guestPhone)} />
            <InfoRow label="Email" value={reviewDash(guest?.email ?? reservation.guestEmail)} />
            <InfoRow label="Location" value={reviewDash(guestLocationLabel(guest))} />
            <InfoRow label="Address" value={reviewDash(guestAddressLabel(guest))} />
          </dl>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Preferred Contact Method</Label>
            <Select
              value={draft.preferredContactMethod || "__none"}
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
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select</SelectItem>
                {CONTACT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {PREFERRED_CONTACT_METHOD_LABELS[option.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Contact method is owned by Guest Profile and is not saved from this stay.
            </p>
          </div>
          <label className={cn("flex items-center gap-2 text-sm", !editable && "opacity-60")}>
            <Checkbox
              checked={draft.sendConfirmation}
              disabled={!editable}
              onCheckedChange={(value) => patch({ sendConfirmation: value === true })}
            />
            Send confirmation to guest
          </label>
          <label className={cn("flex items-center gap-2 text-sm", !editable && "opacity-60")}>
            <Checkbox
              checked={draft.sendMarketing}
              disabled={!editable}
              onCheckedChange={(value) => patch({ sendMarketing: value === true })}
            />
            Send marketing communication
          </label>
        </div>
        <div className="space-y-3" data-testid="guest-membership">
          <h3 className="text-sm font-medium text-[#251605]">Membership & Loyalty</h3>
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Program" value={DETAIL_DASH} />
            <InfoRow label="Membership Number" value={DETAIL_DASH} />
            <InfoRow label="Tier" value={DETAIL_DASH} />
            <InfoRow label="Points Balance" value={DETAIL_DASH} />
          </dl>
          <p className="text-[11px] text-muted-foreground">{WAVE4_NO_POINTS_COPY}</p>
          <p className="text-[11px] text-muted-foreground">{WAVE4_VIP_STAFF_FLAG_COPY}</p>
          <Button asChild variant="link" size="sm" className="h-auto px-0 text-[#765719]">
            <Link
              to="/restaurant/pms/guests/$guestId"
              params={{ guestId: reservation.guestId }}
              search={{ card: "loyalty" }}
            >
              View Membership
            </Link>
          </Button>
          <div>
            <p className="mb-2 text-[11px] text-muted-foreground">Guest Type</p>
            <RadioGroup
              value={draft.guestType}
              disabled={!editable}
              onValueChange={(value) =>
                patch({ guestType: value as ReservationGuestDraft["guestType"] })
              }
              className="gap-1.5"
            >
              {GUEST_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={option.value} />
                  {option.label}
                </label>
              ))}
            </RadioGroup>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Type is inferred from linked Company / Travel Agent masters on this stay. Changing it
              here is not saved.
            </p>
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
        <div>
          <h2 className="font-display text-base text-[#251605]">Accompanying Guests</h2>
          <p className="text-xs text-muted-foreground">
            Add or manage accompanying guests for this reservation.
          </p>
        </div>
        <Button type="button" size="sm" disabled={!editable} onClick={onAdd}>
          <Plus className="mr-1 size-3.5" />
          Add Guest
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Relationship</th>
              <th className="py-2 pr-2">Age</th>
              <th className="py-2 pr-2">Gender</th>
              <th className="py-2 pr-2">ID / Passport</th>
              <th className="py-2 pr-2">Contact</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 text-center text-sm text-muted-foreground"
                  data-testid="guest-accompanying-empty"
                >
                  No accompanying guests on this reservation.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2">{index + 1}</td>
                  <td className="py-2 pr-2">{reviewDash(row.name)}</td>
                  <td className="py-2 pr-2">
                    {reviewDash(accompanyingRelationshipLabel(row.relationship))}
                  </td>
                  <td className="py-2 pr-2">{reviewDash(row.age)}</td>
                  <td className="py-2 pr-2">{reviewDash(row.gender)}</td>
                  <td className="py-2 pr-2">{maskIdNumber(row.idPassport) ?? DETAIL_DASH}</td>
                  <td className="py-2 pr-2">{reviewDash(row.contact)}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
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
  guestId,
}: {
  chips: Array<{ id: string; label: string }>;
  guestId: string;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-preferences"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
            <Heart className="size-4 text-[#B8954F]" />
            Guest Preferences
          </h2>
          <p className="text-xs text-muted-foreground">
            Guest preferences for this stay (from profile or entered for this reservation).
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/restaurant/pms/guests/$guestId"
            params={{ guestId }}
            search={{ card: "preferences" }}
          >
            Edit
          </Link>
        </Button>
      </div>
      {chips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No preferences recorded yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={`${chip.id}-${chip.label}`}
              className="rounded-full border border-[#E4D6B8] bg-[#FBF6EC] px-2.5 py-1 text-xs text-[#251605]"
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function SpecialRequestsCard({
  draft,
  patch,
  editable,
  editing,
  onToggleEdit,
}: {
  draft: ReservationGuestDraft;
  patch: (next: Partial<ReservationGuestDraft>) => void;
  editable: boolean;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const lines = draft.specialRequests
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-special-requests"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Special Requests</h2>
          <p className="text-xs text-muted-foreground">Special requests for this reservation.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={onToggleEdit}>
          Edit
        </Button>
      </div>
      {editing ? (
        <Textarea
          value={draft.specialRequests}
          disabled={!editable}
          onChange={(e) => patch({ specialRequests: e.target.value.slice(0, 2000) })}
          className="min-h-24"
          placeholder="Add special requests…"
        />
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{DETAIL_DASH}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#251605]">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuestNotesCard({
  draft,
  patch,
  editable,
}: {
  draft: ReservationGuestDraft;
  patch: (next: Partial<ReservationGuestDraft>) => void;
  editable: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="guest-notes"
    >
      <h2 className="font-display text-base text-[#251605]">Guest Notes (Reservation Specific)</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Notes related to the guest for this reservation (visible to hotel staff).
      </p>
      <Textarea
        id="guest-tab-notes"
        maxLength={GUEST_NOTES_MAX}
        disabled={!editable}
        value={draft.guestNotes}
        onChange={(e) => patch({ guestNotes: e.target.value.slice(0, GUEST_NOTES_MAX) })}
        placeholder="Add guest notes here…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {draft.guestNotes.length}/{GUEST_NOTES_MAX}
      </p>
    </section>
  );
}

function GuestSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);

  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-guest-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-2">
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
