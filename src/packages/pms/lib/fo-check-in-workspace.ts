/**
 * Front Office — wide Check-In / Guest Control workspace (pure routing & copy).
 * Authoritative check-in writes remain in fo-check-in.functions + FoCheckInStepper.
 */
import type { CheckInStepId } from "./fo-check-in";
import type { ReservationDetail } from "./reservations.functions";
import type { ReservationStatus } from "./reservation-dates";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS } from "./front-office-room-operations";

export const FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS = FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS;

/** Main workspace: reservation/guest/stay/room (~70%) | folio/payment/requests/notes (~30%). */
export const FO_CHECK_IN_WORKSPACE_MAIN_GRID_CLASS =
  "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]";

export function foOpensPreArrivalCheckInWorkspace(stay: { status: ReservationStatus }): boolean {
  return stay.status === "pending" || stay.status === "confirmed";
}

export function foCheckInWorkspaceInitialStep(stay: { roomId: string | null }): CheckInStepId {
  return stay.roomId ? "registration" : "stay";
}

export function foCheckInWorkspaceContinueLabel(stay: { roomId: string | null }): string {
  return stay.roomId ? "Next: Guest Verification" : "Next: Room Assignment";
}

export type FoDerivedReservationType = "Individual" | "Corporate" | "Travel Agency";

export function foDeriveReservationType(
  reservation:
    Pick<ReservationDetail, "companyMasterId" | "travelAgentMasterId"> | null | undefined,
): FoDerivedReservationType | null {
  if (!reservation) return null;
  if (reservation.travelAgentMasterId) return "Travel Agency";
  if (reservation.companyMasterId) return "Corporate";
  return "Individual";
}

export function foCheckInWorkspaceRoomLabel(stay: FrontOfficeStay): string {
  return stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned";
}

export function foCheckInWorkspaceProminentUnassigned(stay: FrontOfficeStay): boolean {
  return foOpensPreArrivalCheckInWorkspace(stay) && !stay.roomId;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Prefer human profile number; never surface raw UUID as a business guest id. */
export function foGuestDisplayId(profileNumber: string | null | undefined): string | null {
  const trimmed = profileNumber?.trim();
  if (trimmed) return trimmed;
  return null;
}

export function foGuestIdLooksLikeUuid(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return UUID_LIKE.test(value.trim());
}

export type FoGuaranteeStatusLabel =
  "Guaranteed" | "Deposit required" | "Deposit posted" | "Waived" | "Not guaranteed" | "—";

export function foGuaranteeStatusLabel(input: {
  guaranteeMethod: string | null | undefined;
  depositRequired: boolean | null;
  depositPosted: number;
  depositWaived: boolean;
}): FoGuaranteeStatusLabel {
  if (input.depositWaived) return "Waived";
  if (input.depositPosted > 0) return "Deposit posted";
  if (input.depositRequired === true) return "Deposit required";
  const method = input.guaranteeMethod?.trim();
  if (method) return "Guaranteed";
  if (input.depositRequired === false) return "Not guaranteed";
  return "—";
}

export type FoReservationPackageRow = {
  packageName: string;
  appliedAmount: number;
};

export function foPackageSummaryLabel(packages: FoReservationPackageRow[]): string | null {
  if (packages.length === 0) return null;
  return packages.map((row) => row.packageName).join(", ");
}

export type FoIdentityDocumentPreview = {
  url: string | null;
  verificationStatus: string | null;
};

/** Pick a signed image URL from listGuestDocuments rows (no upload flow). */
export function foPickGuestIdentityDocumentPreview(
  documents: Array<{
    url: string | null;
    mimeType: string | null;
    verificationStatus: string;
  }>,
): FoIdentityDocumentPreview {
  const withImage = documents.filter((doc) => {
    if (!doc.url) return false;
    if (!doc.mimeType) return true;
    return doc.mimeType.startsWith("image/");
  });
  if (withImage.length === 0) return { url: null, verificationStatus: null };
  const verified = withImage.find((doc) => doc.verificationStatus === "verified");
  const pick = verified ?? withImage[0]!;
  return { url: pick.url, verificationStatus: pick.verificationStatus };
}

export const FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE =
  "Taxes and service charge are not exposed on this Front Office read model.";

export type FoFolioPreviewDisplay = {
  roomCharge: string | null;
  packageLine: string | null;
  taxesAndService: string | null;
  estimatedTotal: string | null;
  folioBalance: string | null;
};

export function foBuildFolioPreviewDisplay(input: {
  money: (amount: number) => string;
  roomSubtotal: number | null;
  packages: FoReservationPackageRow[];
  packagesSubtotal: number | null;
  grandCommercialSubtotal: number | null;
  folioBalance: number | null;
}): FoFolioPreviewDisplay {
  const roomCharge = input.roomSubtotal != null ? input.money(input.roomSubtotal) : null;
  let packageLine: string | null = null;
  const names = foPackageSummaryLabel(input.packages);
  if (names && input.packagesSubtotal != null && input.packagesSubtotal > 0) {
    packageLine = `${names} · ${input.money(input.packagesSubtotal)}`;
  } else if (names) {
    packageLine = names;
  }
  const estimatedTotal =
    input.grandCommercialSubtotal != null ? input.money(input.grandCommercialSubtotal) : null;
  return {
    roomCharge,
    packageLine,
    taxesAndService: null,
    estimatedTotal,
    folioBalance: input.folioBalance != null ? input.money(input.folioBalance) : null,
  };
}
