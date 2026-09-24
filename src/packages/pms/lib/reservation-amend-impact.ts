export interface ReservationAmendSnapshot {
  guestId: string;
  guestName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  specialRequests: string;
  notes: string;
  commercialBookingSource: string;
  marketSegment: string;
  externalReference: string;
  guaranteeMethod: string;
  available: number | null;
  currentTotal: number | null;
  proposedTotal: number | null;
}

export interface ReservationAmendChange {
  field: string;
  current: string;
  proposed: string;
}

function display(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function reservationAmendImpact(
  current: ReservationAmendSnapshot,
  proposed: ReservationAmendSnapshot,
): {
  changes: ReservationAmendChange[];
  assignmentCleared: boolean;
  availabilityNone: boolean;
  rateMayChange: boolean;
} {
  const fields: Array<{ field: string; current: string | number | null; proposed: string | number | null }> = [
    { field: "Guest", current: current.guestName, proposed: proposed.guestName },
    { field: "Arrival", current: current.arrival, proposed: proposed.arrival },
    { field: "Departure", current: current.departure, proposed: proposed.departure },
    { field: "Adults", current: current.adults, proposed: proposed.adults },
    { field: "Children", current: current.children, proposed: proposed.children },
    { field: "Room type", current: current.roomTypeName, proposed: proposed.roomTypeName },
    {
      field: "Assigned room",
      current: current.roomNumber ?? "Unassigned",
      proposed: proposed.roomNumber ?? "Unassigned",
    },
    { field: "Special requests", current: current.specialRequests, proposed: proposed.specialRequests },
    { field: "Internal notes", current: current.notes, proposed: proposed.notes },
    {
      field: "Booking source",
      current: current.commercialBookingSource,
      proposed: proposed.commercialBookingSource,
    },
    { field: "Market segment", current: current.marketSegment, proposed: proposed.marketSegment },
    {
      field: "External reference",
      current: current.externalReference,
      proposed: proposed.externalReference,
    },
    { field: "Guarantee", current: current.guaranteeMethod, proposed: proposed.guaranteeMethod },
    { field: "Stay total", current: current.currentTotal, proposed: proposed.proposedTotal },
  ];

  const stayChanged =
    current.arrival !== proposed.arrival ||
    current.departure !== proposed.departure ||
    current.roomTypeId !== proposed.roomTypeId;

  return {
    changes: fields
      .filter((row) => display(row.current) !== display(row.proposed))
      .map((row) => ({
        field: row.field,
        current: display(row.current),
        proposed: display(row.proposed),
      })),
    assignmentCleared: Boolean(current.roomId) && proposed.roomId == null,
    availabilityNone: proposed.available != null && proposed.available <= 0,
    rateMayChange: stayChanged,
  };
}
