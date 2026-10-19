/**
 * Step 4 display rules.
 * The published agreement body is shown as returned. This file does not write property terms.
 */
import {
  signatureStoragePrefix,
  type CheckInAgreementAcknowledgement,
  type CheckInAgreementRead,
} from "@/packages/pms/lib/fo-check-in-agreement";

export type AgreementProgressStatus =
  "Not signed" | "Ready to sign" | "Signed" | "Agreement unavailable";

export type CheckInAgreementSummary = {
  version: string;
  status: AgreementProgressStatus;
  signedBy: string | null;
  signedAt: string | null;
};

/**
 * Saved only when the agreement read returns no acknowledgement flags.
 * This is not property legal text.
 */
export const CHECKIN_AGREEMENT_REVIEW_FLAG = "reviewed";

export const CHECKIN_AGREEMENT_REVIEW_LABEL = "Reviewed with the guest";

export function agreementAcknowledgementLabel(key: string): string {
  if (key === CHECKIN_AGREEMENT_REVIEW_FLAG) return CHECKIN_AGREEMENT_REVIEW_LABEL;
  return key;
}

/** Flags already stored on this unit. A review flag is added only when none were returned. */
export function agreementAcknowledgementState(
  read: CheckInAgreementRead,
): CheckInAgreementAcknowledgement {
  const source = read.draft?.acknowledgements ?? read.signed?.acknowledgements ?? {};
  if (Object.keys(source).length > 0) return { ...source };
  if (read.signed || read.blocker) return {};
  return { [CHECKIN_AGREEMENT_REVIEW_FLAG]: false };
}

export function acknowledgementsMatch(
  left: CheckInAgreementAcknowledgement,
  right: CheckInAgreementAcknowledgement,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

export function acknowledgementsReady(flags: CheckInAgreementAcknowledgement): boolean {
  const keys = Object.keys(flags);
  return keys.length > 0 && keys.every((key) => flags[key] === true);
}

export function agreementProgressStatus(
  read: CheckInAgreementRead | null,
): AgreementProgressStatus {
  if (!read || read.blocker === "AGREEMENT_REQUIRED" || !read.version)
    return "Agreement unavailable";
  if (read.signed) return "Signed";
  if (read.draft) return "Ready to sign";
  return "Not signed";
}

export function agreementCanContinue(read: CheckInAgreementRead | null | undefined): boolean {
  return Boolean(read && read.blocker == null && read.signed);
}

export function signatureHasInk(strokeCount: number): boolean {
  return strokeCount > 0;
}

export function agreementSignaturePath(
  restaurantId: string,
  reservationId: string,
  fileId: string,
): string {
  return `${signatureStoragePrefix(restaurantId, reservationId)}${fileId}.png`;
}

export function buildCheckInAgreementSummary(
  read: CheckInAgreementRead | null,
  guestName: string | null,
): CheckInAgreementSummary {
  return {
    version: read?.version?.label ?? "—",
    status: agreementProgressStatus(read),
    signedBy: read?.signed ? guestName : null,
    signedAt: read?.signed?.signedAt ?? null,
  };
}

export function agreementFailureCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : "The agreement could not be saved.";
  if (/AGREEMENT_VERSION_MISMATCH|currently shown/i.test(message)) {
    return "The agreement changed. Review the current version before signing.";
  }
  if (
    /AGREEMENT_REQUIRED|no active registration agreement|Publish a registration agreement/i.test(
      message,
    )
  ) {
    return "No active registration agreement is published for this property.";
  }
  if (/AGREEMENT_ALREADY_SIGNED|already signed/i.test(message)) {
    return "This agreement is already signed. The signed record cannot be edited.";
  }
  if (/AGREEMENT_NOT_READY|before capturing/i.test(message)) {
    return "Save the acknowledgements before signing.";
  }
  if (/AGREEMENT_GUEST_MISMATCH|guest on this room/i.test(message)) {
    return "Sign this agreement for the guest on this room.";
  }
  if (
    /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(
      message,
    )
  ) {
    return "You don't have permission to update this agreement.";
  }
  if (/Invalid signature reference/i.test(message)) {
    return "The signature file could not be stored for this reservation.";
  }
  if (message.includes("\n") || /at \S+\.(ts|js)/.test(message)) {
    return "The agreement could not be saved. Try again.";
  }
  return message;
}

export function agreementVersionIsStale(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /AGREEMENT_VERSION_MISMATCH|currently shown/i.test(message);
}
