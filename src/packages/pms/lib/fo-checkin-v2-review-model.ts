/**
 * Step 5 display rules.
 * getCheckInReadiness is the only eligibility source. This file does not
 * recompute blockers, and a waiver is never shown as money received.
 */
import type { CheckInReadiness, CheckInOverride } from "@/packages/pms/lib/fo-check-in-readiness";
import type { CheckInAgreementRead } from "@/packages/pms/lib/fo-check-in-agreement";
import {
  agreementAcknowledgementItems,
  agreementStaffReference,
  agreementVersionLabel,
  formatAgreementTimestamp,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import {
  formatDepositAmount,
  guaranteeMethodLabel,
  GUARANTEE_NOT_EVALUATED,
} from "@/packages/pms/lib/fo-checkin-v2-payment-model";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";

export type ReadinessItem = { id: string; label: string };

export type KeyRequirementState = "Recorded" | "Waived" | "Required";

export type ReviewDepositView = {
  scope: string;
  required: string;
  received: string | null;
  outstanding: string | null;
  status: string;
  waived: boolean;
  waiverReason: string | null;
  guarantee: string;
  guaranteeNote: string;
};

export type RegistrationFormAcknowledgement = {
  id: string;
  statement: string;
  state: "Accepted" | "Not accepted" | "Not yet accepted";
};

export type RegistrationFormView = {
  heading: "HOTEL REGISTRATION FORM" | "HOTEL REGISTRATION & CHECK-IN CONFIRMATION";
  status: "Pending Check-In" | "Checked In";
  propertyName: string | null;
  propertyAddress: string | null;
  propertyPhone: string | null;
  propertyEmail: string | null;
  propertyLogoUrl: string | null;
  guestName: string;
  profileNumber: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  confirmationNumber: string | null;
  reservationStatus: string;
  bookingSource: string | null;
  companyName: string | null;
  travelAgentName: string | null;
  groupName: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  roomNumber: string | null;
  roomTypeName: string | null;
  ratePlanName: string | null;
  roomCharge: string | null;
  depositRequired: string | null;
  depositReceived: string | null;
  depositStatus: string | null;
  guaranteeMethod: string | null;
  idType: string | null;
  idNumber: string | null;
  idCountry: string | null;
  idExpiry: string | null;
  idIssueDate: string | null;
  idVerification: string | null;
  agreementTitle: string | null;
  agreementVersion: string | null;
  agreementSigned: boolean;
  agreementSignedAt: string | null;
  acknowledgements: RegistrationFormAcknowledgement[];
  signatureUrl: string | null;
  signatureRecorded: boolean;
  signedBy: string | null;
  checkInTime: string | null;
  processedBy: string | null;
  stampPending: boolean;
  generatedAt: string;
};

const WAIVER_LABEL: Record<CheckInOverride["requirement"], string> = {
  REGISTRATION_INCOMPLETE: "Registration completeness",
  DEPOSIT_REQUIRED: "Deposit",
  KEY_REQUIRED: "Key",
};

export function checkInCommandTarget(input: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId: string | null;
}): {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string;
} {
  return {
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    ...(input.reservationRoomId ? { reservationRoomId: input.reservationRoomId } : {}),
  };
}

export function unitAlreadyCheckedIn(status: string | null | undefined): boolean {
  return status === "checked_in";
}

/**
 * The button follows canCheckIn. Pending, an existing outcome, and an
 * already checked-in unit only stop a second transition.
 */
export function completeCheckInEnabled(input: {
  canCheckIn: boolean | undefined;
  pending: boolean;
  alreadyCheckedIn: boolean;
  outcome: "completed" | "checked_in_stamp_pending" | null;
}): boolean {
  if (input.pending || input.alreadyCheckedIn || input.outcome) return false;
  return input.canCheckIn === true;
}

export function completionFailureCopy(error: unknown): { blocked: boolean; message: string } {
  const message = error instanceof Error ? error.message : "Check-in could not be completed.";
  if (/Check-in blocked:/i.test(message)) {
    return {
      blocked: true,
      message: "Check-in was not completed. A requirement changed. Review the items below.",
    };
  }
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return { blocked: false, message: "You don't have permission to complete this check-in." };
  }
  if (message.includes("\n") || /at \S+\.(ts|js)/.test(message)) {
    return { blocked: false, message: "Check-in could not be completed. Try again." };
  }
  return { blocked: false, message };
}

export function satisfiedReadinessItems(readiness: CheckInReadiness): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  if (readiness.room.assigned) items.push({ id: "room-assigned", label: "Room is assigned" });
  if (readiness.room.eligible === true)
    items.push({ id: "room-eligible", label: "Room is eligible" });
  if (readiness.room.ready === true) items.push({ id: "room-ready", label: "Room is ready" });
  if (readiness.registration.complete && !readiness.registration.waived) {
    items.push({ id: "registration", label: "Guest registration complete" });
  }
  const identityBlocked = readiness.blockers.some(
    (item) => item.code === "IDENTITY_DOCUMENT" || item.code === "GUEST_FIELDS",
  );
  if (readiness.identity.valid && !identityBlocked) {
    items.push({ id: "identity", label: "Identification requirements satisfied" });
  }
  const depositWaived = readiness.overrides.some((item) => item.requirement === "DEPOSIT_REQUIRED");
  if (readiness.financial?.satisfied && !depositWaived) {
    items.push({ id: "deposit", label: "Deposit requirement satisfied" });
  }
  if (readiness.agreement.versionId && readiness.agreement.signed) {
    items.push({ id: "agreement", label: "Agreement accepted" });
    items.push({ id: "signature", label: "Signature captured" });
  }
  if (readiness.key.recorded && !readiness.key.waived) {
    items.push({ id: "key", label: "Key recorded" });
  }
  return items;
}

export function keyRequirementState(key: {
  recorded: boolean;
  waived: boolean;
}): KeyRequirementState {
  if (key.waived) return "Waived";
  if (key.recorded) return "Recorded";
  return "Required";
}

export function roomReadinessLabel(room: CheckInReadiness["room"]): string {
  if (!room.assigned) return "No room assigned";
  if (room.ready === true) return "Ready";
  if (room.ready === false) return "Not ready";
  if (room.eligible === false) return "Not eligible";
  return "Readiness not confirmed";
}

export function waiverLabel(requirement: CheckInOverride["requirement"]): string {
  return WAIVER_LABEL[requirement];
}

export function stayStatusLabel(status: string | null | undefined, checkedIn: boolean): string {
  if (checkedIn || status === "checked_in") return "Checked In";
  if (!status) return "—";
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function depositWaiver(readiness: CheckInReadiness): CheckInOverride | null {
  return readiness.overrides.find((item) => item.requirement === "DEPOSIT_REQUIRED") ?? null;
}

/** Received money stays the amount actually posted. A waiver is not a receipt. */
export function reviewDepositView(
  readiness: CheckInReadiness,
  currency: string | null,
): ReviewDepositView | null {
  const financial = readiness.financial;
  if (!financial) return null;
  const waiver = depositWaiver(readiness);
  const receivedAmount = financial.receivedAmount;
  const showReceived = !waiver || receivedAmount > 0;
  return {
    scope: financial.scope === "reservation" ? "Reservation" : financial.scope,
    required: formatDepositAmount(financial.requiredAmount, currency),
    received: showReceived ? formatDepositAmount(receivedAmount, currency) : null,
    outstanding: waiver ? null : formatDepositAmount(financial.outstanding, currency),
    status: waiver ? "Waived" : financial.satisfied ? "Satisfied" : "Outstanding",
    waived: Boolean(waiver),
    waiverReason: waiver?.reason ?? null,
    guarantee: guaranteeMethodLabel(financial.guaranteeMethod),
    guaranteeNote: GUARANTEE_NOT_EVALUATED,
  };
}

export function identityReviewTone(
  readiness: CheckInReadiness,
): "satisfied" | "warning" | "blocker" {
  if (readiness.blockers.some((item) => item.code === "IDENTITY_DOCUMENT")) return "blocker";
  if (readiness.warnings.some((item) => item.code === "UNVERIFIED_DOCUMENT")) return "warning";
  return readiness.identity.valid ? "satisfied" : "blocker";
}

export function maskedIdentityNumber(value: string | null | undefined): string | null {
  return maskIdNumber(value);
}

export function propertyAddressLine(parts: Array<string | null | undefined>): string | null {
  const line = parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(", ");
  return line || null;
}

export function registrationFormAcknowledgements(
  read: CheckInAgreementRead | null,
): RegistrationFormAcknowledgement[] {
  const items = agreementAcknowledgementItems(read);
  const signed = read?.signed && !read.draft ? read.signed.acknowledgements : null;
  return items.map((item) => ({
    id: item.id,
    statement: item.statement,
    state: !signed ? "Not yet accepted" : signed[item.id] === true ? "Accepted" : "Not accepted",
  }));
}

export function registrationFormHeading(checkedIn: boolean): RegistrationFormView["heading"] {
  return checkedIn ? "HOTEL REGISTRATION & CHECK-IN CONFIRMATION" : "HOTEL REGISTRATION FORM";
}

export function staffDisplayName(
  user: {
    email?: string | null;
    user_metadata?: unknown;
  } | null,
): string | null {
  const meta = user?.user_metadata;
  if (meta && typeof meta === "object" && "full_name" in meta) {
    const name = (meta as { full_name?: unknown }).full_name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  const email = user?.email?.trim();
  return email || null;
}

export function buildRegistrationFormView(input: {
  checkedIn: boolean;
  stampPending: boolean;
  generatedAt: string;
  property: {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  } | null;
  guestName: string;
  profileNumber: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  confirmationNumber: string | null;
  reservationStatus: string | null;
  bookingSource: string | null;
  companyName: string | null;
  travelAgentName: string | null;
  groupName: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  roomNumber: string | null;
  roomTypeName: string | null;
  ratePlanName: string | null;
  currency: string | null;
  roomCharge: number | null;
  deposit: ReviewDepositView | null;
  idType: string | null;
  idNumber: string | null;
  idCountry: string | null;
  idExpiry: string | null;
  idIssueDate: string | null;
  idVerification: string | null;
  agreement: CheckInAgreementRead | null;
  signatureUrl: string | null;
  checkInTime: string | null;
  processedBy: string | null;
}): RegistrationFormView {
  const agreement = input.agreement;
  const signed = Boolean(agreement?.signed && !agreement.draft);
  const version = agreement?.version ?? null;
  return {
    heading: registrationFormHeading(input.checkedIn),
    status: input.checkedIn ? "Checked In" : "Pending Check-In",
    propertyName: input.property?.name ?? null,
    propertyAddress: input.property?.address ?? null,
    propertyPhone: input.property?.phone ?? null,
    propertyEmail: input.property?.email ?? null,
    propertyLogoUrl: input.property?.logoUrl ?? null,
    guestName: input.guestName,
    profileNumber: input.profileNumber,
    dateOfBirth: input.dateOfBirth,
    nationality: input.nationality,
    phone: input.phone,
    email: input.email,
    address: input.address,
    confirmationNumber: input.confirmationNumber,
    reservationStatus: stayStatusLabel(input.reservationStatus, input.checkedIn),
    bookingSource: input.bookingSource,
    companyName: input.companyName,
    travelAgentName: input.travelAgentName,
    groupName: input.groupName,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    nights: input.nights,
    adults: input.adults,
    children: input.children,
    roomNumber: input.roomNumber,
    roomTypeName: input.roomTypeName,
    ratePlanName: input.ratePlanName,
    roomCharge:
      input.roomCharge == null ? null : formatDepositAmount(input.roomCharge, input.currency),
    depositRequired: input.deposit?.required ?? null,
    depositReceived: input.deposit?.received ?? null,
    depositStatus: input.deposit?.status ?? null,
    guaranteeMethod: input.deposit ? input.deposit.guarantee : null,
    idType: input.idType,
    idNumber: maskedIdentityNumber(input.idNumber),
    idCountry: input.idCountry,
    idExpiry: input.idExpiry,
    idIssueDate: input.idIssueDate,
    idVerification: input.idVerification,
    agreementTitle: version?.title || (version ? "Guest Agreement" : null),
    agreementVersion: version ? agreementVersionLabel(version) : null,
    agreementSigned: signed,
    agreementSignedAt: signed ? formatAgreementTimestamp(agreement?.signed?.signedAt) : null,
    acknowledgements: registrationFormAcknowledgements(agreement),
    signatureUrl: signed ? input.signatureUrl : null,
    signatureRecorded: signed && Boolean(agreement?.signed?.hasSignature),
    signedBy: signed ? input.guestName : null,
    checkInTime: input.checkedIn ? input.checkInTime : null,
    processedBy: input.checkedIn ? input.processedBy : null,
    stampPending: input.checkedIn && input.stampPending,
    generatedAt: input.generatedAt,
  };
}

export { agreementStaffReference, formatAgreementTimestamp };
