import type { ReactNode } from "react";
import { BedDouble, CalendarDays, CreditCard, FileText, Share2, UserRound } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import {
  CREATE_REVIEW_STEPS,
  guestInitials,
  isCardGuaranteeMethod,
  maskGuaranteePan,
  preferenceFlagFromRequests,
  reviewDash,
  yesNoFromBoolean,
} from "@/packages/pms/lib/create-reservation-review";

export type CreateReservationReviewProps = {
  guestName: string | null;
  guestVip: boolean;
  profileNumber: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  idDocumentNumber: string | null;
  bookedBy: string;
  companyName: string | null;
  travelAgentName: string | null;
  groupName: string | null;
  arrivalLabel: string;
  departureLabel: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  purposeOfStay: string | null;
  coverUrl: string | null;
  roomName: string;
  ratePlan: string;
  ratePerNight: string;
  stayTotal: string;
  breakfastLabel: string;
  cancellationLabel: string;
  bookingSource: string;
  salesChannel: string;
  marketSegment: string;
  internalNotes: string | null;
  guaranteeRequired: string;
  guaranteeType: string;
  cardHolderName: string | null;
  cardNumber: string | null;
  cardExpiry: string | null;
  guaranteeMethod: string;
  depositRequired: string;
  depositAmount: string;
  depositDueDate: string | null;
  depositPaymentMethod: string;
  noShowPolicy: string;
  earlyDeparturePolicy: string;
  specialRequests: string | null;
  ackInformed: boolean;
  ackConsent: boolean;
  ackNonRefundable: boolean;
  ackSpecialTerms: boolean;
  quotedNonRefundable: boolean;
  onAckChange: (patch: {
    ackInformed?: boolean;
    ackConsent?: boolean;
    ackNonRefundable?: boolean;
    ackSpecialTerms?: boolean;
  }) => void;
  onEdit: (step: number) => void;
  packagesSlot?: ReactNode;
};

export function CreateReservationReview(props: CreateReservationReviewProps) {
  const cardVisible = isCardGuaranteeMethod(props.guaranteeMethod);
  const maskedPan = cardVisible ? maskGuaranteePan(props.cardNumber) : reviewDash(null);
  const maskedId = maskIdNumber(props.idDocumentNumber) ?? "—";

  return (
    <div className="space-y-4" data-testid="create-reservation-review">
      <div className="grid gap-3 lg:grid-cols-3">
        <ReviewCard
          title="Guest & Booker Information"
          icon={<UserRound className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.guestStay)}
          testId="review-card-guest"
        >
          <div className="flex items-start gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-sm font-semibold text-[#765719]"
              data-testid="review-guest-avatar"
            >
              {guestInitials(props.guestName)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-[#251605]" data-testid="review-guest-name">
                {reviewDash(props.guestName)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {props.guestVip ? (
                  <span className="inline-flex rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">
                    VIP
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <ReviewFields
            rows={[
              ["Guest ID", reviewDash(props.profileNumber)],
              ["Phone", reviewDash(props.phone)],
              ["Email", reviewDash(props.email)],
              ["Nationality", reviewDash(props.nationality)],
              ["ID / Passport", maskedId],
              ["Booked by", reviewDash(props.bookedBy)],
              ["Company", reviewDash(props.companyName)],
              ["Travel Agent", reviewDash(props.travelAgentName)],
            ]}
          />
        </ReviewCard>

        <ReviewCard
          title="Stay Information"
          icon={<CalendarDays className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.guestStay)}
          testId="review-card-stay"
        >
          <ReviewFields
            rows={[
              ["Arrival Date", reviewDash(props.arrivalLabel)],
              ["Departure Date", reviewDash(props.departureLabel)],
              ["Nights", String(props.nights)],
              ["Rooms", String(props.rooms)],
              ["Adults", String(props.adults)],
              ["Children", String(props.children)],
              ["Infants", String(props.infants)],
              ["Purpose of Stay", reviewDash(props.purposeOfStay)],
            ]}
          />
        </ReviewCard>

        <ReviewCard
          title="Room & Rate Information"
          icon={<BedDouble className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.availability)}
          testId="review-card-rate"
        >
          <div className="flex gap-3">
            {props.coverUrl ? (
              <img
                src={props.coverUrl}
                alt=""
                className="h-16 w-20 shrink-0 rounded-md object-cover"
                data-testid="review-room-cover"
              />
            ) : (
              <div
                className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]"
                data-testid="review-room-cover-fallback"
              >
                <BedDouble className="size-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-[#251605]">{reviewDash(props.roomName)}</p>
              <p className="text-xs text-muted-foreground">{reviewDash(props.ratePlan)}</p>
            </div>
          </div>
          <ReviewFields
            rows={[
              ["Rate Plan", reviewDash(props.ratePlan)],
              ["Rate per Night", reviewDash(props.ratePerNight)],
              ["Nights", String(props.nights)],
              ["Total Amount", reviewDash(props.stayTotal)],
              ["Breakfast", reviewDash(props.breakfastLabel)],
              ["Cancellation Policy", reviewDash(props.cancellationLabel)],
            ]}
          />
        </ReviewCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ReviewCard
          title="Booking Source & Classification"
          icon={<Share2 className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.bookingDetails)}
          testId="review-card-source"
        >
          <ReviewFields
            rows={[
              ["Source", reviewDash(props.bookingSource)],
              ["Channel", reviewDash(props.salesChannel)],
              ["Market Segment", reviewDash(props.marketSegment)],
              ["Company", reviewDash(props.companyName)],
              ["Travel Agent", reviewDash(props.travelAgentName)],
              ["Group", reviewDash(props.groupName)],
              ["Purpose of Stay", reviewDash(props.purposeOfStay)],
              ["Internal Notes", reviewDash(props.internalNotes)],
            ]}
          />
        </ReviewCard>

        <ReviewCard
          title="Guarantee & Deposit"
          icon={<CreditCard className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.policies)}
          testId="review-card-guarantee"
        >
          <ReviewFields
            rows={[
              ["Guarantee Required", reviewDash(props.guaranteeRequired)],
              ["Guarantee Type", reviewDash(props.guaranteeType)],
              ...(cardVisible
                ? ([
                    ["Card Holder Name", reviewDash(props.cardHolderName)],
                    ["Card Number", maskedPan],
                    ["Expiry Date", reviewDash(props.cardExpiry)],
                  ] as Array<[string, string]>)
                : []),
              ["Deposit Required", reviewDash(props.depositRequired)],
              ["Deposit Amount", reviewDash(props.depositAmount)],
              ["Due Date", reviewDash(props.depositDueDate)],
              ["Payment Method", reviewDash(props.depositPaymentMethod)],
            ]}
          />
        </ReviewCard>

        <ReviewCard
          title="Policies & Additional Information"
          icon={<FileText className="size-4 text-[#B8954F]" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.policies)}
          testId="review-card-policies"
        >
          <ReviewFields
            rows={[
              ["Cancellation Policy", reviewDash(props.cancellationLabel)],
              ["No-Show Policy", reviewDash(props.noShowPolicy)],
              ["Early Departure Policy", reviewDash(props.earlyDeparturePolicy)],
              ["Special Requests", reviewDash(props.specialRequests)],
              [
                "Room Preferences",
                preferenceSummary(props.specialRequests),
              ],
              ["VIP Treatment", yesNoFromBoolean(props.guestVip)],
              [
                "Late Check-in",
                preferenceFlagFromRequests(props.specialRequests, "Late Check-In"),
              ],
              [
                "Early Check-in",
                preferenceFlagFromRequests(props.specialRequests, "Early Check-In"),
              ],
              [
                "Connecting Rooms",
                preferenceFlagFromRequests(props.specialRequests, "Connecting Rooms"),
              ],
            ]}
          />
        </ReviewCard>
      </div>

      <section
        className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 shadow-sm"
        data-testid="review-policy-ack"
      >
        <h2 className="font-display text-sm text-[#251605]">Policy Acknowledgment</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Confirm that you have informed the guest about the policies and obtained necessary consent.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Ack
            testId="review-ack-informed"
            label="Guest informed about cancellation policy"
            checked={props.ackInformed}
            onCheckedChange={(checked) => props.onAckChange({ ackInformed: checked })}
          />
          <Ack
            testId="review-ack-consent"
            label="Guest consent for deposit and guarantee"
            checked={props.ackConsent}
            onCheckedChange={(checked) => props.onAckChange({ ackConsent: checked })}
          />
          <Ack
            testId="review-ack-nonrefundable"
            label="This is a non-refundable reservation (if applicable)"
            checked={props.quotedNonRefundable || props.ackNonRefundable}
            disabled={props.quotedNonRefundable}
            onCheckedChange={(checked) => props.onAckChange({ ackNonRefundable: checked })}
          />
          <Ack
            testId="review-ack-terms"
            label="Special terms and conditions apply"
            checked={props.ackSpecialTerms}
            onCheckedChange={(checked) => props.onAckChange({ ackSpecialTerms: checked })}
          />
        </div>
      </section>

      {props.packagesSlot ? (
        <div className="text-xs" data-testid="review-packages-slot">
          {props.packagesSlot}
        </div>
      ) : null}
    </div>
  );
}

function preferenceSummary(specialRequests: string | null): string {
  const flags = [
    preferenceFlagFromRequests(specialRequests, "High Floor"),
    preferenceFlagFromRequests(specialRequests, "Non-Smoking"),
    preferenceFlagFromRequests(specialRequests, "Quiet Room"),
  ].filter((row) => row === "Yes");
  if (flags.length === 0) return "—";
  const labels = ["High Floor", "Non-Smoking", "Quiet Room"].filter(
    (label) => preferenceFlagFromRequests(specialRequests, label) === "Yes",
  );
  return labels.join(", ");
}

function ReviewCard({
  title,
  icon,
  onEdit,
  testId,
  children,
}: {
  title: string;
  icon: ReactNode;
  onEdit: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-display text-sm text-[#251605]">{title}</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="mt-3 space-y-3 text-sm text-[#251605]">{children}</div>
    </section>
  );
}

function ReviewFields({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-[12px] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[#6B5E4E]">{label}</dt>
          <dd className={cn("min-w-0 break-words text-[#251605]", value === "—" && "text-muted-foreground")}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Ack({
  label,
  checked,
  onCheckedChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <label className="flex items-start gap-2 text-[12px] text-[#251605]" data-testid={testId}>
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {label}
    </label>
  );
}
