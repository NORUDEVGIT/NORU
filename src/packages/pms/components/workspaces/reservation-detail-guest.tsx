import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  buildGuestDraft,
  GUEST_NOTES_MAX,
  type ReservationGuestDraft,
} from "@/packages/pms/lib/reservation-detail-guest";
import {
  amendReservation,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import type { GuestPreferences, GuestProfile } from "@/packages/pms/lib/guests.functions";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-gray-200 bg-white p-4";
const BTN_PRIMARY = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";
const BTN_OUTLINE = "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50";
const MUTED = "text-muted-foreground";
const SPECIAL_REQUESTS_MAX = 2000;

export function ReservationDetailGuestTab({
  restaurantId,
  reservation,
  guest,
  canManage,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  // Kept optional so existing callers don't break; this edit-only tab doesn't use them.
  preferences?: GuestPreferences | null;
  money?: (value: number) => string;
  coverUrl?: string | null;
  canManage: boolean;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const submitAmend = useServerFn(amendReservation);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ReservationGuestDraft>(() =>
    buildGuestDraft(reservation, guest),
  );
  const [guestEditOpen, setGuestEditOpen] = useState(false);

  useEffect(() => {
    setDraft(buildGuestDraft(reservation, guest));
  }, [reservation, guest]);

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

  const editable = canManage && reservation.status !== "cancelled";
  const name = guest?.fullName || reservation.guestName;
  const contact =
    [guest?.phone ?? reservation.guestPhone, guest?.email ?? reservation.guestEmail]
      .filter(Boolean)
      .join(" · ") || "No contact details";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-guest">
      {guest ? <GuestRestrictionWarn guest={guest} /> : null}

      <div className="min-h-0 flex-1 space-y-4">
        {/* Guest: name and contact, with one button to edit the profile */}
        <section
          className={cn(CARD, "flex flex-wrap items-center justify-between gap-3")}
          data-testid="guest-primary-information"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-sm font-semibold text-[#4A2C0F]">
              {guestInitials(name)}
            </div>
            <div>
              <p className="font-medium text-[#251605]">{reviewDash(name)}</p>
              <p className={cn("text-xs", MUTED)}>{contact}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={BTN_OUTLINE}
            disabled={!canManage || !guest}
            data-testid="guest-primary-edit"
            onClick={() => setGuestEditOpen(true)}
          >
            <Pencil className="mr-1 size-3.5" />
            Edit guest
          </Button>
        </section>

        {/* Special requests: always editable */}
        <section className={CARD} data-testid="guest-special-requests">
          <Label htmlFor="guest-tab-requests" className="text-sm font-medium text-[#251605]">
            Special requests
          </Label>
          <p className={cn("mb-2 text-xs", MUTED)}>One request per line.</p>
          <Textarea
            id="guest-tab-requests"
            maxLength={SPECIAL_REQUESTS_MAX}
            disabled={!editable}
            value={draft.specialRequests}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                specialRequests: e.target.value.slice(0, SPECIAL_REQUESTS_MAX),
              }))
            }
            placeholder="Add special requests…"
            className="min-h-24 border-gray-200 bg-white text-[#251605]"
          />
        </section>

        {/* Notes: always editable */}
        <section className={CARD} data-testid="guest-notes">
          <Label htmlFor="guest-tab-notes" className="text-sm font-medium text-[#251605]">
            Guest notes
          </Label>
          <p className={cn("mb-2 text-xs", MUTED)}>
            For this reservation only. Visible to hotel staff.
          </p>
          <Textarea
            id="guest-tab-notes"
            maxLength={GUEST_NOTES_MAX}
            disabled={!editable}
            value={draft.guestNotes}
            onChange={(e) =>
              setDraft((d) => ({ ...d, guestNotes: e.target.value.slice(0, GUEST_NOTES_MAX) }))
            }
            placeholder="Add guest notes here…"
            className="min-h-24 border-gray-200 bg-white text-[#251605]"
          />
          <p className={cn("mt-1 text-right text-[11px]", MUTED)}>
            {draft.guestNotes.length}/{GUEST_NOTES_MAX}
          </p>
        </section>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={BTN_OUTLINE}
          onClick={onBackToOverview}
        >
          Back to Overview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className={BTN_PRIMARY}
            disabled={!editable || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={BTN_OUTLINE}
            onClick={() => setDraft(buildGuestDraft(reservation, guest))}
          >
            Cancel
          </Button>
        </div>
      </div>

      {guest ? (
        <GuestFormDialog
          restaurantId={restaurantId}
          open={guestEditOpen}
          onOpenChange={setGuestEditOpen}
          guest={guest}
          onSaved={() => onSaved()}
          onMergeRequested={() =>
            void navigate({
              to: "/restaurant/pms/guests/$guestId",
              params: { guestId: reservation.guestId },
            })
          }
        />
      ) : null}
    </div>
  );
}