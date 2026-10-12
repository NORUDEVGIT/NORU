import type { ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  Package,
  Printer,
  Share2,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import { PMS_OP_PANEL } from "@/packages/pms/lib/pms-operational-surface";
import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import {
  CREATE_REVIEW_STEPS,
  guestInitials,
  reviewNoShowCopy,
  reviewRefundabilityCopy,
} from "@/packages/pms/lib/create-reservation-review";
import { ReservationPrintDocument } from "@/packages/pms/components/bookings/reservation-print-document";
import {
  buildDraftReservationPrintData,
  formatPrintDateTime,
} from "@/packages/pms/lib/reservation-print-document";

export type ReviewSelectedPackage = {
  key: string;
  name: string;
  category: string;
  priceLabel: string;
  chargeBasisLabel: string;
  inclusions: string;
};

export type CreateReservationReviewProps = {
  propertyName: string;
  guestName: string | null;
  guestVip: boolean;
  profileNumber: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  idDocumentNumber: string | null;
  bookedBy: string;
  companyName: string | null;
  companyTerms: string | null;
  travelAgentName: string | null;
  travelAgentTerms: string | null;
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
  roomCode: string | null;
  ratePlan: string;
  ratePerNight: string;
  stayTotal: string;
  includedItems: string | null;
  cancellationLabel: string;
  refundabilityLabel: string | null;
  refundabilityKind: string | null;
  bookingSource: string;
  salesChannel: string;
  marketSegment: string;
  internalNotes: string | null;
  paymentType: string;
  depositRequired: string;
  depositAmount: string;
  depositDueDate: string | null;
  depositPaymentMethod: string;
  depositReference: string | null;
  noShowPolicy: string;
  noShowPenalty: string | null;
  earlyDeparturePolicy: string;
  specialRequests: string | null;
  roomAssignment: string | null;
  onEdit: (step: number) => void;
  selectedPackages?: ReviewSelectedPackage[];
  savedPreferences?: Array<{ typeId: string; label: string; value: string }>;
  selectedServiceRequests?: Array<{ serviceTypeId: string; name: string; description: string }>;
  propertyAddress?: string | null;
  propertyPhone?: string | null;
  propertyEmail?: string | null;
  propertyWebsite?: string | null;
};

export function CreateReservationReview(props: CreateReservationReviewProps) {
  const packages = props.selectedPackages ?? [];
  const preferences = props.savedPreferences ?? [];
  const services = props.selectedServiceRequests ?? [];
  const roomCode =
    props.roomCode && !props.roomName.includes(`(${props.roomCode})`) ? props.roomCode : null;
  const printData = buildDraftReservationPrintData({
    generatedAt: formatPrintDateTime(new Date()) ?? "",
    propertyName: props.propertyName,
    propertyAddress: props.propertyAddress,
    propertyPhone: props.propertyPhone,
    propertyEmail: props.propertyEmail,
    propertyWebsite: props.propertyWebsite,
    guestName: props.guestName,
    phone: props.phone,
    email: props.email,
    nationality: props.nationality,
    idDocumentNumber: props.idDocumentNumber,
    bookedBy: props.bookedBy,
    bookingSource: props.bookingSource,
    salesChannel: props.salesChannel,
    marketSegment: props.marketSegment,
    companyName: props.companyName,
    companyTerms: props.companyTerms,
    travelAgentName: props.travelAgentName,
    travelAgentTerms: props.travelAgentTerms,
    groupName: props.groupName,
    arrivalLabel: props.arrivalLabel,
    departureLabel: props.departureLabel,
    nights: props.nights,
    rooms: props.rooms,
    adults: props.adults,
    children: props.children,
    infants: props.infants,
    roomImageUrl: props.coverUrl,
    roomName: props.roomName,
    roomCode,
    ratePlan: props.ratePlan,
    inclusions: props.includedItems,
    ratePerNight: props.ratePerNight,
    roomTotal: props.stayTotal,
    packages: packages.map((row) => ({
      name: row.name,
      chargeBasis: row.chargeBasisLabel,
      quantity: null,
      unitAmount: row.priceLabel,
      amount: null,
      inclusions: row.inclusions,
    })),
    paymentType: props.paymentType,
    paymentMethod: props.depositPaymentMethod,
    depositRequired: props.depositRequired,
    depositAmount: props.depositAmount,
    depositDueDate: props.depositDueDate,
    cancellation: props.cancellationLabel,
    noShowPolicy: props.noShowPolicy,
    noShowPenalty: props.noShowPenalty,
    earlyDeparture: props.earlyDeparturePolicy,
    refundabilityKind: props.refundabilityKind,
    refundabilityLabel: props.refundabilityLabel,
    preferences: preferences.map((row) => `${row.label}: ${row.value}`),
    serviceRequests: services.map((row) =>
      row.description.trim() ? `${row.name} — ${row.description.trim()}` : row.name,
    ),
    specialRequests: props.specialRequests,
    roomAssignment: props.roomAssignment,
  });
  const maskedId = maskIdNumber(props.idDocumentNumber);
  const refundability = reviewRefundabilityCopy(props.refundabilityKind, props.refundabilityLabel);
  const noShow = reviewNoShowCopy(props.noShowPolicy, props.noShowPenalty);
  const dueDate = readableDate(props.depositDueDate);
  const paymentTerms = paymentTermsLines(props);
  const guestRows = filledRows([
    ["Guest ID", props.profileNumber],
    ["Phone", props.phone],
    ["Email", props.email],
    ["Nationality", props.nationality],
    ["ID / Passport", maskedId],
    ["Booked by", props.bookedBy],
    ["Company", props.companyName],
    ["Travel Agent", props.travelAgentName],
  ]);
  const stayRows = [
    ...filledRows([
      ["Arrival Date", props.arrivalLabel],
      ["Departure Date", props.departureLabel],
    ]),
    ["Nights", String(props.nights)] as [string, string],
    ["Rooms", String(props.rooms)] as [string, string],
    ["Adults", String(props.adults)] as [string, string],
    ["Children", String(props.children)] as [string, string],
    ["Infants", String(props.infants)] as [string, string],
    ...filledRows([["Purpose of Stay", props.purposeOfStay]]),
  ];
  const rateRows = [
    ...filledRows([
      ["Room Type", props.roomName],
      ["Room Code", roomCode],
      ["Rate Plan", props.ratePlan],
      ["Rate / Night", props.ratePerNight],
    ]),
    ["Nights", String(props.nights)] as [string, string],
    ["Stay Total", props.stayTotal || "—"] as [string, string],
    ...filledRows([
      ["Included", props.includedItems],
      ["Cancellation", props.cancellationLabel],
      ["Refundability", refundability],
    ]),
  ];
  const sourceRows = [
    ["Source", props.bookingSource || "—"] as [string, string],
    ["Channel", props.salesChannel || "—"] as [string, string],
    ["Market Segment", props.marketSegment || "—"] as [string, string],
    ...filledRows([
      ["Company", props.companyName],
      ["Travel Agent", props.travelAgentName],
      ["Group", props.groupName],
      ["Internal Notes", props.internalNotes],
    ]),
  ];
  const paymentRows = [
    ["Payment Type", props.paymentType || "—"] as [string, string],
    ["Payment Method", props.depositPaymentMethod || "—"] as [string, string],
    ["Deposit Required", props.depositRequired || "—"] as [string, string],
    ["Deposit Amount", props.depositAmount || "—"] as [string, string],
    ...filledRows([
      ["Deposit Due Date", dueDate],
      ["Payment Reference", props.depositReference],
    ]),
    ...paymentTerms.map((line) => ["Payment Terms", line] as [string, string]),
  ];
  const policyRows = filledRows([
    ["Cancellation Policy", props.cancellationLabel],
    ["No-show Policy", noShow],
    ["Early Departure Policy", props.earlyDeparturePolicy],
    ["Refundability", refundability],
  ]);
  const preferenceLines = preferences.map((row) => `${row.label}: ${row.value}`);
  const serviceLines = services.map((row) =>
    row.description.trim() ? `${row.name} — ${row.description.trim()}` : row.name,
  );

  return (
    <div className="pb-8" data-testid="create-reservation-review">
      <div
        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        data-testid="review-card-grid"
      >
        <ReviewCard
          title="Guest & Booker Information"
          icon={<UserRound className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.guestStayAvailability)}
          testId="review-card-guest"
        >
          <div className="flex items-center gap-2">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FBF6EE] text-xs font-semibold text-[#8A6A1F]"
              data-testid="review-guest-avatar"
            >
              {guestInitials(props.guestName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#251605]" data-testid="review-guest-name">
                {props.guestName?.trim() || "—"}
              </p>
              {props.guestVip ? (
                <span className="mt-1 inline-flex rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">
                  VIP
                </span>
              ) : null}
            </div>
          </div>
          <ReviewFields rows={guestRows} />
        </ReviewCard>

        <ReviewCard
          title="Stay Information"
          icon={<CalendarDays className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.guestStayAvailability)}
          testId="review-card-stay"
        >
          <ReviewFields rows={stayRows} />
        </ReviewCard>

        <ReviewCard
          title="Room & Rate Information"
          icon={<BedDouble className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.guestStayAvailability)}
          testId="review-card-rate"
        >
          <div className="flex gap-3">
            {props.coverUrl ? (
              <img
                src={props.coverUrl}
                alt=""
                className="h-14 w-16 shrink-0 rounded-[6px] object-cover"
                data-testid="review-room-cover"
              />
            ) : (
              <div
                className="flex h-14 w-16 shrink-0 items-center justify-center rounded-[6px] bg-[#FBF6EE] text-[#C89933]"
                data-testid="review-room-cover-fallback"
              >
                <BedDouble className="size-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#251605]">{props.roomName || "—"}</p>
              {roomCode ? <p className="text-xs text-[#6B5E4E]">{roomCode}</p> : null}
              <p className="text-xs text-[#6B5E4E]">{props.ratePlan || "—"}</p>
            </div>
          </div>
          <ReviewFields rows={rateRows} emphasize="Stay Total" />
        </ReviewCard>

        <ReviewCard
          title="Booking Source & Classification"
          icon={<Share2 className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.bookingDetails)}
          testId="review-card-source"
        >
          <ReviewFields rows={sourceRows} />
        </ReviewCard>

        <ReviewCard
          title="Payment & Deposit"
          icon={<CreditCard className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.policies)}
          testId="review-card-guarantee"
        >
          <ReviewFields rows={paymentRows} />
        </ReviewCard>

        <ReviewCard
          title="Stay Policies"
          icon={<FileText className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.policies)}
          testId="review-card-policies"
        >
          <ReviewFields rows={policyRows} />
        </ReviewCard>

        <ReviewCard
          title="Packages & Add-ons"
          icon={<Package className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.bookingDetails)}
          testId="review-card-packages"
        >
          <ReviewPackages packages={packages} />
        </ReviewCard>

        <ReviewCard
          title="Guest Requests & Preferences"
          icon={<ClipboardList className="size-3.5" />}
          onEdit={() => props.onEdit(CREATE_REVIEW_STEPS.bookingDetails)}
          testId="review-card-requests"
        >
          <div className="space-y-2">
            <RequestBlock title="Saved Preferences">
              {preferenceLines.length === 0 ? (
                <p className="text-xs text-[#6B5E4E]">No saved preferences</p>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {preferences.map((row) => (
                    <li
                      key={row.typeId}
                      className="rounded-full bg-[#FBF6EE] px-2 py-0.5 text-xs text-[#251605]"
                    >
                      {row.label}: {row.value}
                    </li>
                  ))}
                </ul>
              )}
            </RequestBlock>
            <RequestBlock title="Service Requests">
              {serviceLines.length === 0 ? (
                <p className="text-xs text-[#6B5E4E]">No service requests selected</p>
              ) : (
                <ul className="space-y-0.5 text-sm text-[#251605]">
                  {services.map((row) => (
                    <li key={row.serviceTypeId}>
                      {row.name}
                      {row.description.trim() ? ` — ${row.description.trim()}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </RequestBlock>
            {props.specialRequests?.trim() ? (
              <RequestBlock title="Special Requests">
                <p className="text-sm text-[#251605]">{props.specialRequests.trim()}</p>
              </RequestBlock>
            ) : null}
            {props.internalNotes?.trim() ? (
              <RequestBlock title="Internal Notes">
                <p className="text-sm text-[#251605]">{props.internalNotes.trim()}</p>
              </RequestBlock>
            ) : null}
            {props.roomAssignment?.trim() ? (
              <RequestBlock title="Room Assignment">
                <p className="text-sm text-[#251605]">{props.roomAssignment.trim()}</p>
              </RequestBlock>
            ) : null}
          </div>
        </ReviewCard>

        <ReviewCard
          title="Print Reservation"
          icon={<Printer className="size-3.5" />}
          testId="review-card-print"
        >
          <p className="text-xs text-[#6B5E4E]">
            Print a clean reservation review before confirmation.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-[6px] border-[#C89933] bg-white text-[#8A6A1F] shadow-none hover:bg-[#FBF6EE]"
            data-testid="review-print-reservation"
            onClick={() => window.print()}
          >
            Print Reservation
          </Button>
        </ReviewCard>
      </div>
      <ReservationPrintDocument data={printData} />
    </div>
  );
}

function filledRows(rows: Array<[string, string | null | undefined]>): Array<[string, string]> {
  return rows.flatMap(([label, value]) => {
    const text = value?.trim() ?? "";
    if (!text || text === "—") return [];
    return [[label, text]];
  });
}

function readableDate(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatStayDate(text);
  return text;
}

function paymentTermsLines(props: CreateReservationReviewProps): string[] {
  const lines: string[] = [];
  const company = props.companyName?.trim() ?? "";
  const agent = props.travelAgentName?.trim() ?? "";
  if (company) {
    lines.push(props.companyTerms?.trim() || `No payment terms configured for ${company}`);
  }
  if (agent) {
    lines.push(props.travelAgentTerms?.trim() || `No payment terms configured for ${agent}`);
  }
  return lines;
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
  onEdit?: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        PMS_OP_PANEL,
        "h-full !rounded-[6px] !border-[#CCCCCC] !shadow-none min-w-0 p-3",
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
            {icon}
          </span>
          <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
        </div>
        {onEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[#8A6A1F]"
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : null}
      </div>
      <div className="mt-2 space-y-2 text-sm text-[#251605]">{children}</div>
    </section>
  );
}

function ReviewPackages({ packages }: { packages: ReviewSelectedPackage[] }) {
  if (packages.length === 0) {
    return (
      <p className="text-xs text-[#6B5E4E]" data-testid="review-packages-empty">
        No packages selected
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="review-packages-list">
      {packages.map((row) => (
        <li key={row.key} data-testid="review-package-row">
          <p className="text-sm font-medium text-[#251605]">{row.name}</p>
          <p className="text-xs text-[#251605]">
            {row.chargeBasisLabel}
            {row.priceLabel ? ` · ${row.priceLabel}` : ""}
          </p>
          {row.inclusions.trim() ? (
            <p className="text-[11px] text-[#6B5E4E]">Includes: {row.inclusions}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReviewFields({ rows, emphasize }: { rows: Array<[string, string]>; emphasize?: string }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-x-3 gap-y-1 text-[12px] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} className="contents">
          <dt className="text-[#6B5E4E]">{label}</dt>
          <dd
            className={cn(
              "min-w-0 break-words text-[#251605]",
              label === emphasize && "text-sm font-semibold",
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RequestBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{title}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
