import type { CheckInGuestSource } from "./fo-check-in-unit";

export type CheckInAgreementAcknowledgement = Record<string, boolean>;

export type CheckInAgreementSectionView = {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
};

export type CheckInAgreementAcknowledgementView = {
  id: string;
  title: string;
  statement: string;
  required: boolean;
  displayOrder: number;
};

export type CheckInAgreementVersion = {
  id: string;
  label: string;
  body: string;
  /** True when the row has only the original body and no structured snapshot. */
  legacy?: boolean;
  title?: string | null;
  intro?: string | null;
  leadIn?: string | null;
  acknowledgementTitle?: string | null;
  acknowledgementIntro?: string | null;
  sections?: CheckInAgreementSectionView[];
  acknowledgements?: CheckInAgreementAcknowledgementView[];
};

export type CheckInAgreementSignature = {
  id: string;
  agreementVersionId: string;
  guestId: string;
  reservationRoomId: string | null;
  acknowledgements: CheckInAgreementAcknowledgement;
  signedAt: string;
  capturedBy: string;
  hasSignature: boolean;
};

export type CheckInAgreementDraft = {
  id: string;
  agreementVersionId: string;
  guestId: string;
  reservationRoomId: string | null;
  acknowledgements: CheckInAgreementAcknowledgement;
};

export type CheckInAgreementRead = {
  reservationRoomId: string | null;
  guestId: string;
  guestSource: CheckInGuestSource;
  blocker: "AGREEMENT_REQUIRED" | null;
  version: CheckInAgreementVersion | null;
  signed: CheckInAgreementSignature | null;
  draft: CheckInAgreementDraft | null;
};

/** Copy the submitted flags. The stored snapshot is this object, not a later edit. */
export function copyAcknowledgements(
  value: CheckInAgreementAcknowledgement,
): CheckInAgreementAcknowledgement {
  const copy: CheckInAgreementAcknowledgement = {};
  for (const [key, flag] of Object.entries(value)) {
    copy[key] = flag;
  }
  return copy;
}

export function signatureStoragePrefix(restaurantId: string, reservationId: string): string {
  return `${restaurantId}/check-in-agreements/${reservationId}/`;
}

/**
 * Active version plus the current signature for this unit.
 * No active version is a blocker. It is not an unsigned success.
 */
export function projectCheckInAgreement(input: {
  reservationRoomId: string | null;
  guestId: string;
  guestSource: CheckInGuestSource;
  version: CheckInAgreementVersion | null;
  signed: CheckInAgreementSignature | null;
  draft: CheckInAgreementDraft | null;
}): CheckInAgreementRead {
  const base = {
    reservationRoomId: input.reservationRoomId,
    guestId: input.guestId,
    guestSource: input.guestSource,
  };
  if (!input.version) {
    return { ...base, blocker: "AGREEMENT_REQUIRED", version: null, signed: null, draft: null };
  }
  return {
    ...base,
    blocker: null,
    version: input.version,
    signed: input.signed,
    draft: input.draft,
  };
}
