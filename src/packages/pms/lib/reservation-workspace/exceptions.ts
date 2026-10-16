import { nightsBetween } from "../reservation-dates";
import type { ReservationStatus } from "../reservation-dates";
import type {
  ReservationExceptionActionTarget,
  ReservationExceptionItem,
  ReservationExceptionKey,
  ReservationExceptionResponsibleModule,
  ReservationExceptionSourceModule,
} from "./shared-read-models";

export const EXCEPTION_CONTROL_EMPTY = "No operational exceptions on the business date.";

export const RESERVATION_EXCEPTION_KEY_LABELS: Record<ReservationExceptionKey, string> = {
  unassigned: "Unassigned",
  room_unavailable: "Room unavailable",
  room_not_ready: "Room not ready",
  operational_block: "Operational block",
  payment_issue: "Payment issue",
  overstay: "Overstay",
  room_discrepancy: "Room discrepancy",
  overbooking: "Overbooking",
  missing_rate_snapshot: "Missing rate snapshot",
  missing_guest_contact: "Missing guest contact",
  assignment_overlap: "Assignment overlap",
};

export const RESERVATION_EXCEPTION_SOURCE_LABELS: Record<ReservationExceptionSourceModule, string> =
  {
    reservation: "Reservation",
    front_office: "Front Office",
    inventory: "Inventory",
    housekeeping: "Housekeeping",
    cashiering: "Cashiering",
    guest: "Guest",
  };

export const RESERVATION_EXCEPTION_OWNER_LABELS: Record<
  ReservationExceptionResponsibleModule,
  string
> = {
  reservation: "Reservation",
  front_office: "Front Office",
  housekeeping: "Housekeeping",
  cashiering: "Cashiering",
  inventory: "Inventory",
  guest_profile: "Guest Profile",
};

export function reservationExceptionActionLabel(
  target: ReservationExceptionActionTarget,
): string {
  switch (target) {
    case "assign_room":
      return "Assign Room";
    case "check_out":
      return "Check Out";
    case "open_folio":
      return "Open Folio";
    case "open_housekeeping":
      return "Open Housekeeping";
    case "open_room_rack":
      return "Open Calendar";
    case "open_front_office_stay":
      return "Open Stay";
    default:
      return "Open Reservation";
  }
}

export function stayFromExceptionItem(item: ReservationExceptionItem): {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestVip: boolean;
  guestPhone: string | null;
  guestEmail: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  specialRequests: string | null;
  overstay: boolean;
} | null {
  if (!item.reservationId || !item.stay.status) return null;
  return {
    id: item.reservationId,
    confirmationNumber: item.confirmationNumber ?? "—",
    guestId: item.guest.id ?? "",
    guestName: item.guest.name,
    guestVip: item.guest.vip,
    guestPhone: item.guest.phone,
    guestEmail: item.guest.email,
    roomTypeId: item.room?.roomTypeId ?? "",
    roomTypeName: item.room?.roomTypeName ?? "",
    roomId: item.room?.roomId ?? null,
    roomNumber: item.room?.roomNumber ?? null,
    arrivalDate: item.stay.arrivalDate,
    departureDate: item.stay.departureDate,
    nights: nightsBetween(item.stay.arrivalDate, item.stay.departureDate),
    adults: 1,
    children: 0,
    status: item.stay.status,
    specialRequests: null,
    overstay: item.key === "overstay",
  };
}
