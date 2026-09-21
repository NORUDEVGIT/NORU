/**
 * Individual Guest Identity Documents helpers.
 * Types stay on pms_guest_id_types. Files stay on guest_documents.
 */

import { maskIdNumber, type GuestDocumentKind } from "./guest-profile-wave2.ts";
import type { IdentityDocumentTypeRecord } from "./identity-documents-card4.server.ts";

export const IDENTITY_DOCUMENTS_MIGRATION_FILE = "0087_pms_guest_identity_documents.sql";

export const IDENTITY_DOCUMENTS_EMPTY = "No identity documents added yet.";
export const IDENTITY_DOCUMENTS_NO_ACTIVE_TYPES =
  "Configure active identity document types in Property Setup before adding a document.";
export const IDENTITY_DOCUMENTS_NO_IMAGE = "No document image available.";
export const IDENTITY_DOCUMENTS_COPY =
  "Manage guest identity documents. All document types and required fields are configured in Property Setup.";

export const IDENTITY_EXPIRING_SOON_DAYS = 30;

export type DocumentExpiryStatus = "valid" | "expiring_soon" | "expired" | "none";

export const DOCUMENT_EXPIRY_STATUS_LABELS: Record<DocumentExpiryStatus, string> = {
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  none: "No expiry date",
};

export function kindFromTypeCode(code: string | null | undefined): GuestDocumentKind {
  const normalized = (code ?? "").trim().toUpperCase();
  if (normalized === "PAS" || normalized === "PASSPORT") return "passport";
  if (normalized === "NID" || normalized === "NATIONAL_ID") return "national_id";
  if (normalized === "DL" || normalized === "DRIVING_LICENCE") return "driving_licence";
  if (normalized === "VISA") return "visa";
  return "other";
}

export function typeAllowedForNewDocument(
  type: Pick<IdentityDocumentTypeRecord, "active" | "validForProfileTypeIds">,
  profileTypeId: string | null | undefined,
): boolean {
  if (!type.active) return false;
  const allowed = type.validForProfileTypeIds;
  if (allowed.length === 0) return false;
  if (!profileTypeId) return true;
  return allowed.includes(profileTypeId);
}

export function documentExpiryStatus(
  expiryDate: string | null | undefined,
  today: string,
  soonDays = IDENTITY_EXPIRING_SOON_DAYS,
): DocumentExpiryStatus {
  const expiry = (expiryDate ?? "").trim();
  if (!expiry) return "none";
  if (expiry < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  const soon = limit.toISOString().slice(0, 10);
  if (expiry <= soon) return "expiring_soon";
  return "valid";
}

export function maskedDocumentNumber(value: string | null | undefined): string | null {
  return maskIdNumber(value);
}

export function nextSelectedDocumentId(
  documents: Array<{ id: string }>,
  selectedId: string | null | undefined,
  deletedId?: string | null,
): string | null {
  const remaining = deletedId ? documents.filter((item) => item.id !== deletedId) : documents;
  if (selectedId && remaining.some((item) => item.id === selectedId)) return selectedId;
  return remaining[0]?.id ?? null;
}
