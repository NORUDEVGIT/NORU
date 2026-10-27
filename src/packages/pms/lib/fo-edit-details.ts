/**
 * Front Office Edit Details form.
 * Decides which existing writer a change belongs to. It does not price a stay.
 */
import type { GuestProfile } from "./guests.functions";
import { isGuestGender, isGuestTitle, isRestrictionSeverity } from "./guest-profile-individual";
import { isPreferredContactMethod, isPreferredContactTime } from "./guest-profile-overview";
import { occupancyBlockMessage, targetRoomRequired } from "./fo-amendments";
import { stayDateTargetsOneRoom } from "./fo-unit-desk";
import { authoritativeRoomChargeDelta, stayNightLabel } from "./fo-stay-date-finance";
import { isStayRangeValid } from "./create-reservation-phase1";
import type { FrontOfficeStay, InHouseStayQuote } from "./frontoffice.functions";
import type { ReservationStatus } from "./reservation-dates";

export const FO_EDIT_DETAILS_PLACEHOLDERS = {
  arrival: "Select check-in date",
  departure: "Select check-out date",
  roomType: "Select room category",
  room: "Select assigned room",
  adults: "Enter adults count",
  children: "Enter children count",
  firstName: "Enter first name",
  middleName: "Enter middle name",
  lastName: "Enter last name",
  phone: "Enter phone number",
  email: "Enter email address",
  requests: "Enter special requests or notes",
  notes: "Enter internal notes",
} as const;

/** Same address check the guest profile writer uses. */
const GUEST_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const FO_EDIT_DETAILS_MULTI_ROOM =
  "This room is one of several on the reservation. This desk will not change every room from this row.";

export const FO_EDIT_DETAILS_ROOM_TYPE_ROOM = "Assign a room of the new type.";

export type FoEditDetailsDraft = {
  arrival: string;
  departure: string;
  roomTypeId: string;
  adults: string;
  children: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
  specialRequests: string;
  notes: string;
};

export type FoEditDetailsErrors = Partial<Record<keyof FoEditDetailsDraft | "form", string>>;

export type FoEditDetailsPlan = {
  amend: boolean;
  /** Checked-in date changes stay on changeStayDates. */
  inHouseDates: boolean;
  guest: boolean;
  /** In-house amendments keep the stored dates so the date writer remains the only date change. */
  amendDates: "form" | "stored";
  roomTypeId: string;
};

type QuoteTotals = Pick<InHouseStayQuote, "nextNights" | "previousSubtotal" | "quotedSubtotal">;

export function foEditDetailsSeed(input: {
  stay: Pick<
    FrontOfficeStay,
    | "arrivalDate"
    | "departureDate"
    | "roomTypeId"
    | "adults"
    | "children"
    | "guestName"
    | "guestPhone"
    | "guestEmail"
    | "specialRequests"
  >;
  notes?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}): FoEditDetailsDraft {
  return {
    arrival: input.stay.arrivalDate,
    departure: input.stay.departureDate,
    roomTypeId: input.stay.roomTypeId,
    adults: String(input.stay.adults),
    children: String(input.stay.children ?? 0),
    firstName: input.firstName ?? "",
    middleName: input.middleName ?? "",
    lastName: input.lastName ?? "",
    phone: input.phone ?? input.stay.guestPhone ?? "",
    email: input.email ?? input.stay.guestEmail ?? "",
    specialRequests: input.stay.specialRequests ?? "",
    notes: input.notes ?? "",
  };
}

/** Full guest-profile payload with only the contact fields edited in this form. */
export function foGuestProfileWrite(
  profile: GuestProfile,
  contact: {
    firstName: string;
    middleName: string;
    lastName: string;
    phone: string;
    email: string;
  },
) {
  const method = profile.preferredContactMethod ?? "";
  const time = profile.preferredContactTime ?? "";
  return {
    firstName: contact.firstName.trim(),
    lastName: contact.lastName.trim() || null,
    phone: contact.phone.trim() || null,
    email: contact.email.trim() || null,
    nationality: profile.nationality,
    language: profile.language,
    dateOfBirth: profile.dateOfBirth,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    region: profile.region,
    country: profile.country,
    postalCode: profile.postalCode,
    idDocumentType: profile.idDocumentType,
    idDocumentNumber: profile.idDocumentNumber,
    idDocumentExpiry: profile.idDocumentExpiry,
    vipStatus: profile.vipStatus,
    notes: profile.notes,
    title: profile.title && isGuestTitle(profile.title) ? profile.title : null,
    middleName: contact.middleName.trim() || null,
    preferredName: profile.preferredName,
    gender: profile.gender && isGuestGender(profile.gender) ? profile.gender : null,
    phoneAlt: profile.phoneAlt,
    emailAlt: profile.emailAlt,
    preferredContactMethod: isPreferredContactMethod(method) ? method : null,
    preferredContactTime: isPreferredContactTime(time) ? time : null,
    position: profile.position,
    department: profile.department,
    sourceOfBusiness: profile.sourceOfBusiness,
    guestStatus: profile.guestStatus,
    restricted: profile.restricted,
    blacklisted: profile.blacklisted,
    restrictionSeverity:
      profile.restrictionSeverity && isRestrictionSeverity(profile.restrictionSeverity)
        ? profile.restrictionSeverity
        : null,
    restrictionReason: profile.restrictionReason,
    restrictionUntil: profile.restrictionUntil,
    emergencyContacts: profile.emergencyContacts
      .filter((contact) => contact.name.trim().length > 0)
      .map((contact) => ({
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email,
      })),
  };
}

function wholeNumber(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

export function foEditDetailsErrors(input: {
  draft: FoEditDetailsDraft;
  baseline: FoEditDetailsDraft;
  status: ReservationStatus;
  stay: Pick<FrontOfficeStay, "roomId" | "roomUnits">;
  maxOccupancy: number | null;
}): FoEditDetailsErrors {
  const errors: FoEditDetailsErrors = {};
  const { draft, baseline } = input;
  if (!draft.arrival) errors.arrival = FO_EDIT_DETAILS_PLACEHOLDERS.arrival;
  if (!draft.departure) errors.departure = FO_EDIT_DETAILS_PLACEHOLDERS.departure;
  else if (draft.arrival && !isStayRangeValid(draft.arrival, draft.departure)) {
    errors.departure = "Check-out must be after check-in.";
  }
  if (!draft.roomTypeId) errors.roomType = FO_EDIT_DETAILS_PLACEHOLDERS.roomType;
  else if (
    draft.roomTypeId !== baseline.roomTypeId &&
    targetRoomRequired({ status: input.status, roomId: input.stay.roomId })
  ) {
    errors.roomType = FO_EDIT_DETAILS_ROOM_TYPE_ROOM;
  }

  const adults = wholeNumber(draft.adults);
  const children = wholeNumber(draft.children);
  if (adults == null || adults < 1 || adults > 20) {
    errors.adults = "Enter a whole number of adults from 1 to 20.";
  }
  if (children == null || children > 20) {
    errors.children = "Enter a whole number of children from 0 to 20.";
  }
  const occupancyChanged = draft.adults !== baseline.adults || draft.children !== baseline.children;
  if (!errors.adults && !errors.children && adults != null && children != null) {
    if (occupancyChanged && input.maxOccupancy == null) {
      errors.adults = "Room occupancy is still loading.";
    } else if (input.maxOccupancy != null) {
      const block = occupancyBlockMessage(adults, children, input.maxOccupancy);
      if (block) errors.adults = block;
    }
  }

  if (!draft.firstName.trim()) errors.firstName = FO_EDIT_DETAILS_PLACEHOLDERS.firstName;
  if (draft.email.trim() && !GUEST_EMAIL.test(draft.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  const datesChanged = draft.arrival !== baseline.arrival || draft.departure !== baseline.departure;
  const typeChanged = draft.roomTypeId !== baseline.roomTypeId;
  if ((datesChanged || occupancyChanged || typeChanged) && !stayDateTargetsOneRoom(input.stay)) {
    errors.form = FO_EDIT_DETAILS_MULTI_ROOM;
  }
  return errors;
}

export function foEditDetailsPlan(input: {
  draft: FoEditDetailsDraft;
  baseline: FoEditDetailsDraft;
  status: ReservationStatus;
}): FoEditDetailsPlan {
  const { draft, baseline } = input;
  const inHouse = input.status === "checked_in";
  const datesChanged = draft.arrival !== baseline.arrival || draft.departure !== baseline.departure;
  const typeChanged = draft.roomTypeId !== baseline.roomTypeId;
  const occupancyChanged = draft.adults !== baseline.adults || draft.children !== baseline.children;
  const textChanged =
    draft.specialRequests !== baseline.specialRequests || draft.notes !== baseline.notes;
  const guestChanged =
    draft.firstName !== baseline.firstName ||
    draft.middleName !== baseline.middleName ||
    draft.lastName !== baseline.lastName ||
    draft.phone !== baseline.phone ||
    draft.email !== baseline.email;
  return {
    amend: typeChanged || occupancyChanged || textChanged || (!inHouse && datesChanged),
    inHouseDates: inHouse && datesChanged,
    guest: guestChanged,
    amendDates: inHouse ? "stored" : "form",
    roomTypeId: inHouse ? baseline.roomTypeId : draft.roomTypeId,
  };
}

/** Quote fields only. Missing quote stays empty so the form can show a dash. */
export function foEditDetailsFinancial(quote: QuoteTotals | null): {
  duration: string | null;
  total: number | null;
  adjustment: number | null;
} {
  if (!quote) return { duration: null, total: null, adjustment: null };
  const total = Number.isFinite(quote.quotedSubtotal) ? quote.quotedSubtotal : null;
  return {
    duration: stayNightLabel(quote.nextNights),
    total,
    adjustment:
      total == null
        ? null
        : authoritativeRoomChargeDelta(quote.previousSubtotal, quote.quotedSubtotal),
  };
}
