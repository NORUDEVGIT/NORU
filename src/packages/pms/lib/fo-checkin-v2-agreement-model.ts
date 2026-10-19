/**
 * Step 4 display rules.
 * The published agreement body is shown as returned. This file does not write property terms.
 */
import {
  signatureStoragePrefix,
  type CheckInAgreementAcknowledgement,
  type CheckInAgreementAcknowledgementView,
  type CheckInAgreementRead,
  type CheckInAgreementSectionView,
  type CheckInAgreementVersion,
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

/** Enabled acknowledgements from the published version, in display order. */
export function agreementAcknowledgementItems(
  read: CheckInAgreementRead | null | undefined,
): CheckInAgreementAcknowledgementView[] {
  const items = read?.version?.acknowledgements ?? [];
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Enabled sections from the published version, in display order. */
export function agreementSectionItems(
  read: CheckInAgreementRead | null | undefined,
): CheckInAgreementSectionView[] {
  const items = read?.version?.sections ?? [];
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Flags keyed by the configured acknowledgement ids, seeded from the stored record.
 * The review flag is used only when the version has no configured acknowledgements,
 * because the save command needs at least one flag.
 */
export function agreementAcknowledgementState(
  read: CheckInAgreementRead,
): CheckInAgreementAcknowledgement {
  const source = read.draft?.acknowledgements ?? read.signed?.acknowledgements ?? {};
  const items = agreementAcknowledgementItems(read);
  if (items.length > 0) {
    const flags: CheckInAgreementAcknowledgement = {};
    for (const item of items) flags[item.id] = source[item.id] === true;
    return flags;
  }
  if (Object.keys(source).length > 0) return { ...source };
  if (read.signed || read.blocker) return {};
  return { [CHECKIN_AGREEMENT_REVIEW_FLAG]: false };
}

/** Required configured ids that are not accepted. Without configured items every flag counts. */
export function agreementMissingRequired(
  read: CheckInAgreementRead | null | undefined,
  flags: CheckInAgreementAcknowledgement,
): string[] {
  const items = agreementAcknowledgementItems(read);
  if (items.length > 0) {
    return items.filter((item) => item.required && flags[item.id] !== true).map((item) => item.id);
  }
  const keys = Object.keys(flags);
  if (keys.length === 0) return [CHECKIN_AGREEMENT_REVIEW_FLAG];
  return keys.filter((key) => flags[key] !== true);
}

export function agreementSignReady(input: {
  read: CheckInAgreementRead | null | undefined;
  flags: CheckInAgreementAcknowledgement;
  strokes: number;
  guestMatches: boolean;
}): boolean {
  const { read } = input;
  if (!read?.version || read.blocker) return false;
  if (read.signed && !read.draft) return false;
  if (!input.guestMatches) return false;
  if (!signatureHasInk(input.strokes)) return false;
  return agreementMissingRequired(read, input.flags).length === 0;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Version 3" for numbered labels. Never shows a bare row id. */
export function agreementVersionLabel(version: CheckInAgreementVersion | null | undefined): string {
  if (!version) return "—";
  const label = version.label.trim();
  if (!label || label === version.id || UUID_PATTERN.test(label)) return "Published Agreement";
  if (/^v?\d+(\.\d+)*$/i.test(label)) return `Version ${label.replace(/^v/i, "")}`;
  return label;
}

/** Staff memberships come back as ids only. Show a short reference, not the full id. */
export function agreementStaffReference(membershipId: string | null | undefined): string {
  if (!membershipId) return "—";
  return `Front desk staff (ref ${membershipId.slice(0, 8)})`;
}

export function formatAgreementTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    version: agreementVersionLabel(read?.version),
    status: agreementProgressStatus(read),
    signedBy: read?.signed ? guestName : null,
    signedAt: read?.signed ? formatAgreementTimestamp(read.signed.signedAt) : null,
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
