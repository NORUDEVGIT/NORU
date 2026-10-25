/**
 * Front Office — wide Check-In / Guest Control workspace (pure routing & copy).
 * Authoritative check-in writes remain in fo-check-in.functions + FoCheckInStepper.
 */
import { DEFAULT_BOOKING_SOURCES } from "./create-reservation-phase1";
import type { CheckInStepId } from "./fo-check-in";
import type { ReservationDetail } from "./reservations.functions";
import type { ReservationStatus } from "./reservation-dates";
import {
  DETAIL_DASH,
  OVERVIEW_LABEL_UNAVAILABLE,
  overviewBookingSourceLabel,
  type OverviewCatalogueRow,
} from "./reservation-detail-overview";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS } from "./front-office-room-operations";

const CHANNEL_SOURCE_LABELS: Record<string, string> = {
  staff: "Staff",
  walk_in: "Walk-in",
  direct_booking: "Direct booking",
  future_online: "Future online",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function knownSourceLabel(
  value: string | null | undefined,
  sources: OverviewCatalogueRow[] | null | undefined,
): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const catalogue = sources?.find((row) => row.id === raw || row.code === raw);
  const name = catalogue?.name?.trim();
  if (name && !UUID_RE.test(name)) return name;
  const booking = DEFAULT_BOOKING_SOURCES.find((row) => row.value === raw);
  if (booking) return booking.label;
  return CHANNEL_SOURCE_LABELS[raw] ?? null;
}

/** Stay Information source: catalogue or desk label, never a raw id or stored code. */
export function foStayInformationSourceLabel(
  source: string | null | undefined,
  commercialBookingSource: string | null | undefined,
  sources: OverviewCatalogueRow[] | null | undefined,
): string {
  const commercial = knownSourceLabel(commercialBookingSource, sources);
  if (commercial) return commercial;
  const commercialRaw = commercialBookingSource?.trim() ?? "";
  if (!commercialRaw) {
    const channel = knownSourceLabel(source, sources);
    if (channel) return channel;
  }
  const resolved = overviewBookingSourceLabel(source, commercialBookingSource, sources);
  if (resolved === DETAIL_DASH || resolved === OVERVIEW_LABEL_UNAVAILABLE) return resolved;
  if (UUID_RE.test(resolved)) return OVERVIEW_LABEL_UNAVAILABLE;
  return knownSourceLabel(resolved, sources) ?? resolved;
}

export const FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS = FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS;

/** Main workspace: reservation/guest/stay/room (~70%) | folio/payment/requests/notes (~30%). */
export const FO_CHECK_IN_WORKSPACE_MAIN_GRID_CLASS =
  "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]";

export function foOpensPreArrivalCheckInWorkspace(stay: { status: ReservationStatus }): boolean {
  return stay.status === "pending" || stay.status === "confirmed";
}

/**
 * Room-row click target for a confirmed stay already assigned to the room.
 * Checked-in stays are resolved separately so they open the in-house sheet.
 */
export function foRackConfirmedAssignedStay<
  T extends { status: ReservationStatus; roomId: string | null },
>(stays: readonly T[]): T | null {
  if (stays.some((stay) => stay.status === "checked_in")) return null;
  return stays.find((stay) => stay.status === "confirmed" && Boolean(stay.roomId)) ?? null;
}

export type FoRackInHouseTarget = {
  reservationId: string;
  reservationRoomId: string | null;
};

type FoRackClickStay = {
  id: string;
  status: ReservationStatus;
  roomId: string | null;
  rooms?: ReadonlyArray<{
    id: string;
    roomId: string | null;
    status: string | null;
  }> | null;
};

/**
 * Active checked-in stay for one physical room.
 * Unit rows on a different room are ignored. When several stays could match,
 * the occupant already resolved for this room wins.
 */
export function foRackCheckedInStay(input: {
  roomId: string;
  stays: readonly FoRackClickStay[];
  occupied?: { reservationId: string; reservationRoomId?: string | null } | null;
}): FoRackInHouseTarget | null {
  const matches: FoRackInHouseTarget[] = [];
  for (const stay of input.stays) {
    const unitsOnRoom = (stay.rooms ?? []).filter((unit) => unit.roomId === input.roomId);
    const checkedInUnits = unitsOnRoom.filter(
      (unit) => (unit.status ?? stay.status) === "checked_in",
    );
    if (checkedInUnits.length > 0) {
      for (const unit of checkedInUnits) {
        matches.push({ reservationId: stay.id, reservationRoomId: unit.id });
      }
      continue;
    }
    if ((stay.rooms ?? []).length > 0) continue;
    if (stay.status === "checked_in" && stay.roomId === input.roomId) {
      matches.push({ reservationId: stay.id, reservationRoomId: null });
    }
  }

  const occupied = input.occupied?.reservationId ? input.occupied : null;
  if (occupied) {
    const sameReservation = matches.filter((row) => row.reservationId === occupied.reservationId);
    const exact = occupied.reservationRoomId
      ? sameReservation.find((row) => row.reservationRoomId === occupied.reservationRoomId)
      : undefined;
    if (exact) return exact;
    if (sameReservation.length === 1) {
      return {
        reservationId: occupied.reservationId,
        reservationRoomId:
          sameReservation[0]!.reservationRoomId ?? occupied.reservationRoomId ?? null,
      };
    }
    return {
      reservationId: occupied.reservationId,
      reservationRoomId: occupied.reservationRoomId ?? null,
    };
  }

  return matches[0] ?? null;
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
