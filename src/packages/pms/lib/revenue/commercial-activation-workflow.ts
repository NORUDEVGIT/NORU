/**
 * RR-P5-UI-03 — Commercial activation wizard helpers.
 * Client convenience only. Server preview/apply remain authoritative.
 */

import { COMMERCIAL_ABSENT_VERSION, COMMERCIAL_DEFAULT_PRIORITY } from "./commercial-engine.ts";
import type { PackageActivationPreview } from "./commercial-package-activation.ts";
import type { PromotionActivationPreview } from "./commercial-promotion-activation.ts";

export const ACTIVATION_STEPS = [
  { id: 1, label: "Select" },
  { id: 2, label: "Dates" },
  { id: 3, label: "Scope" },
  { id: 4, label: "Validate" },
  { id: 5, label: "Review" },
  { id: 6, label: "Activate" },
] as const;

export type CommercialActivationStep = (typeof ACTIVATION_STEPS)[number]["id"];
export type CommercialActivationKind = "promotion" | "package";
export type CommercialActivationSource = "overview" | "promotions" | "packages";
export type ActivationWizardStatus = "ready" | "warnings" | "blocked";

export const ACTIVATION_OVERLAP_COPY =
  "Another active promotion overlaps this stay window and scope.";
export const ACTIVATION_WIZARD_STALE_COPY =
  "This activation changed since it was reviewed. Run validation again before activating.";
export const ACTIVATION_DISCARD_COPY = "Discard activation setup?";
export const ACTIVATION_NO_STACKING_NOTE =
  "Only one promotion can be applied to a reservation in V1.";
export const ACTIVATION_PACKAGE_ONE_AT_A_TIME =
  "This workflow activates one package at a time. Reservations may still attach multiple packages.";
export const ACTIVATION_SCOPE_NARROW_NOTE =
  "Activation may narrow Property Setup master scope. It cannot broaden it. Server preview determines the final effective scope.";
export const ACTIVATION_FREE_NIGHT_COPY =
  "Free Night is configured in Property Setup but is not executable in Commercial Engine V1.";
export const ACTIVATION_PROMOTION_DUPLICATE_COPY =
  "An equivalent promotion activation already exists.";
export const ACTIVATION_PACKAGE_DUPLICATE_COPY =
  "An equivalent package activation already exists.";

export const ACTIVATION_ERROR_COPY: Record<string, string> = {
  PROMOTION_KIND_UNSUPPORTED: ACTIVATION_FREE_NIGHT_COPY,
  PROMOTION_ACTIVATION_DUPLICATE: ACTIVATION_PROMOTION_DUPLICATE_COPY,
  PACKAGE_ACTIVATION_DUPLICATE: ACTIVATION_PACKAGE_DUPLICATE_COPY,
  PROMOTION_INACTIVE: "This promotion master is inactive and cannot be activated.",
  PACKAGE_INACTIVE: "This package master is inactive and cannot be activated.",
  COMMERCIAL_DATES_INVALID: "Stay dates are invalid. From must be on or before To.",
  COMMERCIAL_MASTER_WINDOW_BROADEN: "Activation dates cannot exceed the master validity window.",
  PROMOTION_SCOPE_BROADEN: "Activation scope cannot broaden beyond the master room types.",
  PACKAGE_SCOPE_BROADEN: "Activation scope cannot broaden beyond the master room types or rate plans.",
  COMMERCIAL_SCOPE_WRONG_PROPERTY: "Selected room types or rate plans do not belong to this property.",
  COMMERCIAL_ACTIVATION_STALE: ACTIVATION_WIZARD_STALE_COPY,
  PROMOTION_NOT_FOUND: "Promotion master was not found.",
  PACKAGE_NOT_FOUND: "Package master was not found.",
  PACKAGE_PRICE_INVALID: "Package master price is invalid.",
  PACKAGE_CHARGE_BASIS_UNSUPPORTED: "This package charge basis is not supported in Commercial Engine V1.",
  COMMERCIAL_OPERATION_INVALID: "This activation operation is not valid.",
};

export type PromotionActivationDraft = {
  promotionId: string | null;
  validFrom: string;
  validTo: string;
  bookingFrom: string;
  bookingTo: string;
  priority: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
  reason: string;
};

export type PackageActivationDraft = {
  packageId: string | null;
  validFrom: string;
  validTo: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
  reason: string;
};

export function emptyPromotionDraft(promotionId?: string | null): PromotionActivationDraft {
  return {
    promotionId: promotionId ?? null,
    validFrom: "",
    validTo: "",
    bookingFrom: "",
    bookingTo: "",
    priority: String(COMMERCIAL_DEFAULT_PRIORITY),
    roomTypeIds: [],
    ratePlanIds: [],
    reason: "",
  };
}

export function emptyPackageDraft(packageId?: string | null): PackageActivationDraft {
  return {
    packageId: packageId ?? null,
    validFrom: "",
    validTo: "",
    roomTypeIds: [],
    ratePlanIds: [],
    reason: "",
  };
}

export function promotionDraftFingerprint(draft: PromotionActivationDraft): string {
  return JSON.stringify({
    promotionId: draft.promotionId,
    validFrom: draft.validFrom,
    validTo: draft.validTo,
    bookingFrom: draft.bookingFrom,
    bookingTo: draft.bookingTo,
    priority: draft.priority,
    roomTypeIds: [...draft.roomTypeIds].sort(),
    ratePlanIds: [...draft.ratePlanIds].sort(),
  });
}

export function packageDraftFingerprint(draft: PackageActivationDraft): string {
  return JSON.stringify({
    packageId: draft.packageId,
    validFrom: draft.validFrom,
    validTo: draft.validTo,
    roomTypeIds: [...draft.roomTypeIds].sort(),
    ratePlanIds: [...draft.ratePlanIds].sort(),
  });
}

export function promotionDraftIsDirty(draft: PromotionActivationDraft, initialPromotionId?: string | null): boolean {
  const baseline = emptyPromotionDraft(initialPromotionId ?? null);
  return promotionDraftFingerprint(draft) !== promotionDraftFingerprint(baseline) || Boolean(draft.reason.trim());
}

export function packageDraftIsDirty(draft: PackageActivationDraft, initialPackageId?: string | null): boolean {
  const baseline = emptyPackageDraft(initialPackageId ?? null);
  return packageDraftFingerprint(draft) !== packageDraftFingerprint(baseline) || Boolean(draft.reason.trim());
}

export function clientDatesValid(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
}

export function promotionSelectCanAdvance(master: { kind: string; active: boolean } | null): boolean {
  return Boolean(master && master.active && master.kind !== "free_night");
}

export function packageSelectCanAdvance(master: { active: boolean } | null): boolean {
  return Boolean(master && master.active);
}

export function promotionDatesCanAdvance(draft: PromotionActivationDraft): boolean {
  return (
    clientDatesValid(draft.validFrom, draft.validTo) &&
    clientDatesValid(draft.bookingFrom, draft.bookingTo)
  );
}

export function packageDatesCanAdvance(draft: PackageActivationDraft): boolean {
  return clientDatesValid(draft.validFrom, draft.validTo);
}

export function activationWizardStatus(errors: string[], warningCount: number): ActivationWizardStatus {
  if (errors.length > 0) return "blocked";
  if (warningCount > 0) return "warnings";
  return "ready";
}

export function isDuplicateActivationError(code: string): boolean {
  return code === "PROMOTION_ACTIVATION_DUPLICATE" || code === "PACKAGE_ACTIVATION_DUPLICATE";
}

export function isStaleActivationError(codeOrMessage: string): boolean {
  return /COMMERCIAL_ACTIVATION_STALE|changed since/i.test(codeOrMessage);
}

export function activationErrorCopy(code: string): string {
  return ACTIVATION_ERROR_COPY[code] ?? code;
}

export function previewStillMatchesPromotion(
  previewFingerprint: string | null,
  draft: PromotionActivationDraft,
): boolean {
  return previewFingerprint != null && previewFingerprint === promotionDraftFingerprint(draft);
}

export function previewStillMatchesPackage(
  previewFingerprint: string | null,
  draft: PackageActivationDraft,
): boolean {
  return previewFingerprint != null && previewFingerprint === packageDraftFingerprint(draft);
}

export function canApplyReviewedPreview(
  previewFingerprint: string | null,
  currentFingerprint: string,
  canApply: boolean,
): boolean {
  return previewFingerprint === currentFingerprint && canApply;
}

export function promotionPreviewPayload(
  restaurantId: string,
  draft: PromotionActivationDraft,
) {
  return {
    restaurantId,
    operation: "CREATE" as const,
    promotionId: draft.promotionId ?? undefined,
    validFrom: draft.validFrom || undefined,
    validTo: draft.validTo || undefined,
    bookingFrom: draft.bookingFrom || undefined,
    bookingTo: draft.bookingTo || undefined,
    priority: Number.parseInt(draft.priority, 10) || COMMERCIAL_DEFAULT_PRIORITY,
    roomTypeIds: draft.roomTypeIds,
    ratePlanIds: draft.ratePlanIds,
    expectedVersion: COMMERCIAL_ABSENT_VERSION,
  };
}

export function packagePreviewPayload(
  restaurantId: string,
  draft: PackageActivationDraft,
) {
  return {
    restaurantId,
    operation: "CREATE" as const,
    packageId: draft.packageId ?? undefined,
    validFrom: draft.validFrom || undefined,
    validTo: draft.validTo || undefined,
    roomTypeIds: draft.roomTypeIds,
    ratePlanIds: draft.ratePlanIds,
    expectedVersion: COMMERCIAL_ABSENT_VERSION,
  };
}

export function promotionApplyPayload(
  restaurantId: string,
  preview: PromotionActivationPreview,
  reason: string,
) {
  const proposed = preview.proposedActivation;
  if (!proposed) return null;
  return {
    restaurantId,
    operation: "CREATE" as const,
    promotionId: proposed.promotionId,
    validFrom: proposed.validFrom,
    validTo: proposed.validTo,
    bookingFrom: proposed.bookingFrom,
    bookingTo: proposed.bookingTo,
    priority: proposed.priority,
    roomTypeIds: proposed.roomTypeIds,
    ratePlanIds: proposed.ratePlanIds,
    reason: reason.trim() || proposed.reason,
    expectedVersion: preview.expectedVersion,
  };
}

export function packageApplyPayload(
  restaurantId: string,
  preview: PackageActivationPreview,
  reason: string,
) {
  const proposed = preview.proposedActivation;
  if (!proposed) return null;
  return {
    restaurantId,
    operation: "CREATE" as const,
    packageId: proposed.packageId,
    validFrom: proposed.validFrom,
    validTo: proposed.validTo,
    roomTypeIds: proposed.roomTypeIds,
    ratePlanIds: proposed.ratePlanIds,
    reason: reason.trim() || proposed.reason,
    expectedVersion: preview.expectedVersion,
  };
}

export function existingActivationIdFromErrors(
  errors: string[],
  warnings: Array<{ activationId?: string }>,
): string | null {
  if (!errors.some((code) => isDuplicateActivationError(code))) return null;
  return warnings.find((row) => row.activationId)?.activationId ?? null;
}
