/**
 * AIOS-05 inbound Aiosell reservation webhook rules.
 * OTA nightly sellRate is stored as given. This module does not reprice,
 * post Cashiering, decrypt cards, or keep the raw webhook body.
 */
import { timingSafeEqual } from "node:crypto";

import {
  parseAiosellBook,
  parseAiosellCancel,
  parseAiosellModify,
  withoutUnsupportedAiosellCard,
  type AiosellBookReservation,
  type AiosellCancelReservation,
  type AiosellModifyReservation,
} from "./aiosell-contract";
import {
  toDistributionSyncEventInsert,
  type DistributionSyncEventInsert,
} from "./distribution-sync-event";

export const EXTERNAL_GUEST_LABEL = "External guest";
export const AIOSELL_CANCEL_REASON = "Cancelled by OTA via Aiosell";
const ANCHORS = new Set(["aiosell.sandbox", "aiosell.production"]);

export function aiosellWebhookChannelAccepted(input: {
  restaurantId: string;
  environment: "sandbox" | "production";
  channel: string;
  integrationId: string | null;
  channels: {
    restaurantId: string;
    environment: "sandbox" | "production";
    code: string;
    channelType: string;
    status: string;
    integrationId: string | null;
  }[];
}): boolean {
  if (ANCHORS.has(input.channel) || !input.integrationId) return false;
  return input.channels.some(
    (row) =>
      row.restaurantId === input.restaurantId &&
      row.environment === input.environment &&
      row.code === input.channel &&
      row.channelType === "ota" &&
      row.status === "active" &&
      row.integrationId === input.integrationId,
  );
}

export type AiosellWebhookBody = {
  success: boolean;
  message: string;
};

export type ExternalGuestSnapshot = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
};

export type ExternalNight = { date: string; sellRate: number };

export type ExternalRoomCommand = {
  roomTypeId: string;
  ratePlanId: string;
  guestName: string | null;
  adults: number;
  children: number;
  nights: ExternalNight[];
};

export type ExternalAmountSnapshot = {
  amountAfterTax: number;
  amountBeforeTax: number;
  tax: number;
  currency: string;
  commission: number | null;
  tcs: number | null;
  tds: number | null;
};

export type ExternalReservationCommand = {
  action: "book" | "modify" | "cancel";
  restaurantId: string;
  hotelCode: string;
  channel: string;
  bookingId: string;
  cmBookingId: string | null;
  bookedOn: string | null;
  checkin: string | null;
  checkout: string | null;
  segment: string | null;
  specialRequests: string | null;
  pah: boolean | null;
  creditCardPresent: boolean;
  amount: ExternalAmountSnapshot | null;
  guest: ExternalGuestSnapshot | null;
  rooms: ExternalRoomCommand[];
  fingerprint: string;
};

export type ExternalApplyResult = {
  outcome:
    | "created"
    | "duplicate"
    | "modified"
    | "modify_idempotent"
    | "cancelled"
    | "cancel_idempotent"
    | "not_found"
    | "status_conflict";
  reservationId: string | null;
  confirmationNumber: string | null;
  folioId: string | null;
};

export type StoredExternalGuest = {
  id: string;
  restaurantId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  profileOrigin: "staff" | "external_provisional";
};

export type StoredReservation = {
  id: string;
  restaurantId: string;
  guestId: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  reservationMode: "single" | "group";
  roomTypeId: string;
  roomId: null;
  ratePlanId: string;
  adults: number;
  children: number;
  roomsRequested: number;
  specialRequests: string | null;
  currency: string;
  roomSubtotal: number;
  nightlyRateSnapshot: { date: string; rate: number; source: "external" }[];
  folioId: string;
  createdAt: string;
};

export type StoredUnit = {
  id: string;
  reservationId: string;
  sequence: number;
  roomTypeId: string;
  ratePlanId: string;
  roomId: null;
  adults: number;
  children: number;
  nights: { date: string; rate: number; source: "external" }[];
  subtotal: number;
  status: StoredReservation["status"];
};

export type StoredSnapshot = {
  reservationId: string;
  hotelCode: string;
  channel: string;
  bookingId: string;
  cmBookingId: string | null;
  bookedOn: string | null;
  segment: string | null;
  specialRequests: string | null;
  pah: boolean | null;
  creditCardPresent: boolean;
  amount: ExternalAmountSnapshot | null;
  guest: ExternalGuestSnapshot | null;
  fingerprint: string;
};

export type ExternalReservationMemory = {
  guests: StoredExternalGuest[];
  reservations: StoredReservation[];
  units: StoredUnit[];
  occupants: { reservationId: string; unitId: string; guestId: string; primary: boolean }[];
  mappings: {
    restaurantId: string;
    hotelCode: string;
    channel: string;
    bookingId: string;
    cmBookingId: string | null;
    reservationId: string;
  }[];
  snapshots: StoredSnapshot[];
  history: { reservationId: string; eventType: string; channel: string; bookingId: string }[];
  transactions: unknown[];
  availabilityWrites: unknown[];
};

export function createExternalReservationMemory(): ExternalReservationMemory {
  return {
    guests: [],
    reservations: [],
    units: [],
    occupants: [],
    mappings: [],
    snapshots: [],
    history: [],
    transactions: [],
    availabilityWrites: [],
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function aiosellBasicAuthMatches(
  header: string | null,
  username: string,
  password: string,
): boolean {
  if (!header || username === "" || password === "") return false;
  const separator = header.indexOf(" ");
  const scheme = separator === -1 ? header : header.slice(0, separator);
  const encoded = separator === -1 ? "" : header.slice(separator + 1);
  if (scheme !== "Basic" || encoded === "") return false;
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return (
    safeEqual(decoded.slice(0, split), username) && safeEqual(decoded.slice(split + 1), password)
  );
}

function addDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function validateAiosellStayNights(
  checkin: string,
  checkout: string,
  prices: { date: string; sellRate: number }[],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    return "AIOSELL_STAY_INVALID";
  }
  if (checkout <= checkin) return "AIOSELL_STAY_INVALID";
  const expected: string[] = [];
  let cursor = checkin;
  while (cursor < checkout) {
    expected.push(cursor);
    if (expected.length > 366) return "AIOSELL_STAY_INVALID";
    cursor = addDay(cursor);
  }
  const seen = new Set<string>();
  for (const price of prices) {
    if (price.date < checkin || price.date >= checkout) return "AIOSELL_NIGHT_OUT_OF_RANGE";
    if (seen.has(price.date)) return "AIOSELL_NIGHT_DUPLICATE";
    if (!Number.isFinite(price.sellRate) || price.sellRate < 0) return "AIOSELL_SELL_RATE_INVALID";
    seen.add(price.date);
  }
  if (expected.some((date) => !seen.has(date))) return "AIOSELL_NIGHT_MISSING";
  return null;
}

function blank(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

export function externalGuestSnapshot(
  guest: AiosellBookReservation["guest"] | null | undefined,
): ExternalGuestSnapshot | null {
  if (!guest) return null;
  return {
    firstName: blank(guest.firstName),
    lastName: blank(guest.lastName),
    email: blank(guest.email),
    phone: blank(guest.phone),
    line1: blank(guest.address?.line1),
    city: blank(guest.address?.city),
    state: blank(guest.address?.state),
    country: blank(guest.address?.country),
    zipCode: blank(guest.address?.zipCode),
  };
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function nightsOf(prices: { date: string; sellRate: number }[]) {
  return [...prices]
    .sort((left, right) => (left.date < right.date ? -1 : 1))
    .map((price) => ({ date: price.date, rate: price.sellRate, source: "external" as const }));
}

function subtotal(nights: { rate: number }[]): number {
  return nights.reduce((sum, night) => sum + night.rate, 0);
}

function nextId(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function leadGuest(
  memory: ExternalReservationMemory,
  restaurantId: string,
  guest: ExternalGuestSnapshot | null,
) {
  const created: StoredExternalGuest = {
    id: nextId("guest", memory.guests.length),
    restaurantId,
    firstName: guest?.firstName ?? EXTERNAL_GUEST_LABEL,
    lastName: guest?.lastName ?? null,
    email: guest?.email ?? null,
    phone: guest?.phone ?? null,
    line1: guest?.line1 ?? null,
    city: guest?.city ?? null,
    state: guest?.state ?? null,
    country: guest?.country ?? null,
    zipCode: guest?.zipCode ?? null,
    profileOrigin: "external_provisional",
  };
  memory.guests.push(created);
  return created;
}

function writeRooms(
  memory: ExternalReservationMemory,
  reservation: StoredReservation,
  rooms: ExternalRoomCommand[],
  lead: StoredExternalGuest,
) {
  memory.units = memory.units.filter((unit) => unit.reservationId !== reservation.id);
  memory.occupants = memory.occupants.filter((row) => row.reservationId !== reservation.id);
  rooms.forEach((room, index) => {
    const nights = nightsOf(room.nights);
    const unit: StoredUnit = {
      id: nextId("unit", memory.units.length),
      reservationId: reservation.id,
      sequence: index + 1,
      roomTypeId: room.roomTypeId,
      ratePlanId: room.ratePlanId,
      roomId: null,
      adults: room.adults,
      children: room.children,
      nights,
      subtotal: subtotal(nights),
      status: reservation.status,
    };
    memory.units.push(unit);
    if (index === 0) {
      memory.occupants.push({
        reservationId: reservation.id,
        unitId: unit.id,
        guestId: lead.id,
        primary: true,
      });
    }
    const name = blank(room.guestName);
    if (name && name !== lead.firstName) {
      const occupant = leadGuest(memory, reservation.restaurantId, {
        firstName: name,
        lastName: null,
        email: null,
        phone: null,
        line1: null,
        city: null,
        state: null,
        country: null,
        zipCode: null,
      });
      memory.occupants.push({
        reservationId: reservation.id,
        unitId: unit.id,
        guestId: occupant.id,
        primary: false,
      });
    }
  });
  const first = memory.units.find(
    (unit) => unit.reservationId === reservation.id && unit.sequence === 1,
  );
  const active = memory.units.filter((unit) => unit.reservationId === reservation.id);
  reservation.roomTypeId = first?.roomTypeId ?? reservation.roomTypeId;
  reservation.ratePlanId = first?.ratePlanId ?? reservation.ratePlanId;
  reservation.roomId = null;
  reservation.adults = active.reduce((sum, unit) => sum + unit.adults, 0);
  reservation.children = active.reduce((sum, unit) => sum + unit.children, 0);
  reservation.roomsRequested = active.length;
  reservation.reservationMode = active.length > 1 ? "group" : "single";
  reservation.roomSubtotal = active.reduce((sum, unit) => sum + unit.subtotal, 0);
  reservation.nightlyRateSnapshot = first?.nights ?? [];
}

function writeSnapshot(
  memory: ExternalReservationMemory,
  reservationId: string,
  command: ExternalReservationCommand,
) {
  const next: StoredSnapshot = {
    reservationId,
    hotelCode: command.hotelCode,
    channel: command.channel,
    bookingId: command.bookingId,
    cmBookingId: command.cmBookingId,
    bookedOn: command.bookedOn,
    segment: command.segment,
    specialRequests: command.specialRequests,
    pah: command.pah,
    creditCardPresent: command.creditCardPresent,
    amount: command.amount,
    guest: command.guest,
    fingerprint: command.fingerprint,
  };
  const index = memory.snapshots.findIndex((row) => row.reservationId === reservationId);
  if (index === -1) memory.snapshots.push(next);
  else {
    const previous = memory.snapshots[index];
    memory.snapshots[index] = {
      ...next,
      cmBookingId: command.cmBookingId ?? previous?.cmBookingId ?? null,
    };
  }
}

export function applyExternalReservationMemory(
  memory: ExternalReservationMemory,
  command: ExternalReservationCommand,
): ExternalApplyResult {
  const identity = memory.mappings.find(
    (row) =>
      row.restaurantId === command.restaurantId &&
      row.hotelCode === command.hotelCode &&
      row.channel === command.channel &&
      row.bookingId === command.bookingId,
  );
  if (command.action === "book") {
    if (identity) {
      const existing = memory.reservations.find((row) => row.id === identity.reservationId);
      return {
        outcome: "duplicate",
        reservationId: existing?.id ?? null,
        confirmationNumber: existing?.confirmationNumber ?? null,
        folioId: existing?.folioId ?? null,
      };
    }
    const lead = leadGuest(memory, command.restaurantId, command.guest);
    const reservation: StoredReservation = {
      id: nextId("reservation", memory.reservations.length),
      restaurantId: command.restaurantId,
      guestId: lead.id,
      confirmationNumber: `NR-${String(memory.reservations.length + 1).padStart(6, "0")}`,
      arrivalDate: command.checkin ?? "",
      departureDate: command.checkout ?? "",
      status: "confirmed",
      reservationMode: "single",
      roomTypeId: command.rooms[0]?.roomTypeId ?? "",
      roomId: null,
      ratePlanId: command.rooms[0]?.ratePlanId ?? "",
      adults: 1,
      children: 0,
      roomsRequested: command.rooms.length,
      specialRequests: command.specialRequests,
      currency: command.amount?.currency ?? "",
      roomSubtotal: 0,
      nightlyRateSnapshot: [],
      folioId: nextId("folio", memory.reservations.length),
      createdAt: "ingested",
    };
    memory.reservations.push(reservation);
    writeRooms(memory, reservation, command.rooms, lead);
    memory.mappings.push({
      restaurantId: command.restaurantId,
      hotelCode: command.hotelCode,
      channel: command.channel,
      bookingId: command.bookingId,
      cmBookingId: command.cmBookingId,
      reservationId: reservation.id,
    });
    writeSnapshot(memory, reservation.id, command);
    memory.history.push({
      reservationId: reservation.id,
      eventType: "external_reservation_created",
      channel: command.channel,
      bookingId: command.bookingId,
    });
    return {
      outcome: "created",
      reservationId: reservation.id,
      confirmationNumber: reservation.confirmationNumber,
      folioId: reservation.folioId,
    };
  }
  if (!identity) {
    return { outcome: "not_found", reservationId: null, confirmationNumber: null, folioId: null };
  }
  const reservation = memory.reservations.find((row) => row.id === identity.reservationId);
  if (!reservation) {
    return { outcome: "not_found", reservationId: null, confirmationNumber: null, folioId: null };
  }
  if (command.action === "cancel") {
    if (reservation.status === "cancelled") {
      return {
        outcome: "cancel_idempotent",
        reservationId: reservation.id,
        confirmationNumber: reservation.confirmationNumber,
        folioId: reservation.folioId,
      };
    }
    if (reservation.status !== "pending" && reservation.status !== "confirmed") {
      return {
        outcome: "status_conflict",
        reservationId: reservation.id,
        confirmationNumber: reservation.confirmationNumber,
        folioId: reservation.folioId,
      };
    }
    reservation.status = "cancelled";
    for (const unit of memory.units) {
      if (unit.reservationId === reservation.id) unit.status = "cancelled";
    }
    memory.history.push({
      reservationId: reservation.id,
      eventType: "cancelled",
      channel: command.channel,
      bookingId: command.bookingId,
    });
    memory.history.push({
      reservationId: reservation.id,
      eventType: "external_reservation_cancelled",
      channel: command.channel,
      bookingId: command.bookingId,
    });
    return {
      outcome: "cancelled",
      reservationId: reservation.id,
      confirmationNumber: reservation.confirmationNumber,
      folioId: reservation.folioId,
    };
  }
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return {
      outcome: "status_conflict",
      reservationId: reservation.id,
      confirmationNumber: reservation.confirmationNumber,
      folioId: reservation.folioId,
    };
  }
  const previous = memory.snapshots.find((row) => row.reservationId === reservation.id);
  if (previous?.fingerprint === command.fingerprint) {
    return {
      outcome: "modify_idempotent",
      reservationId: reservation.id,
      confirmationNumber: reservation.confirmationNumber,
      folioId: reservation.folioId,
    };
  }
  const beforeGuest = memory.guests.find((guest) => guest.id === reservation.guestId);
  reservation.arrivalDate = command.checkin ?? reservation.arrivalDate;
  reservation.departureDate = command.checkout ?? reservation.departureDate;
  reservation.specialRequests = command.specialRequests;
  reservation.currency = command.amount?.currency ?? reservation.currency;
  const lead = beforeGuest ?? leadGuest(memory, command.restaurantId, command.guest);
  if (beforeGuest?.profileOrigin === "external_provisional" && command.guest?.firstName) {
    beforeGuest.firstName = command.guest.firstName;
    if (command.guest.lastName) beforeGuest.lastName = command.guest.lastName;
    if (command.guest.email) beforeGuest.email = command.guest.email;
    if (command.guest.phone) beforeGuest.phone = command.guest.phone;
  }
  writeRooms(memory, reservation, command.rooms, lead);
  if (command.cmBookingId) identity.cmBookingId = command.cmBookingId;
  writeSnapshot(memory, reservation.id, command);
  memory.history.push({
    reservationId: reservation.id,
    eventType: "external_reservation_modified",
    channel: command.channel,
    bookingId: command.bookingId,
  });
  return {
    outcome: "modified",
    reservationId: reservation.id,
    confirmationNumber: reservation.confirmationNumber,
    folioId: reservation.folioId,
  };
}

export type AiosellPropertyMatch = {
  restaurantId: string;
  environment: "sandbox" | "production";
  currency: string;
};

export type AiosellReservationDirectory = {
  findProperties(hotelCode: string): Promise<AiosellPropertyMatch[]>;
  hasChannel(
    restaurantId: string,
    environment: "sandbox" | "production",
    channel: string,
  ): Promise<boolean>;
  resolveRoom(
    restaurantId: string,
    environment: "sandbox" | "production",
    roomCode: string,
  ): Promise<{ roomTypeId: string } | null>;
  resolveRate(
    restaurantId: string,
    environment: "sandbox" | "production",
    roomCode: string,
    rateplanCode: string,
  ): Promise<{ ratePlanId: string; roomTypeId: string } | null>;
  apply(command: ExternalReservationCommand): Promise<ExternalApplyResult>;
  record(event: DistributionSyncEventInsert): Promise<void>;
};

export async function normalizeAiosellStayCommand(
  directory: AiosellReservationDirectory,
  action: "book" | "modify",
  booking: AiosellBookReservation | AiosellModifyReservation,
  creditCardPresent: boolean,
): Promise<{ command: ExternalReservationCommand } | { error: string }> {
  const prepared = await prepareStay(directory, booking);
  if ("error" in prepared) return prepared;
  return {
    command: commandFrom(
      action,
      prepared.property.restaurantId,
      booking,
      prepared.rooms,
      creditCardPresent,
    ),
  };
}

export function externalCancelCommand(
  restaurantId: string,
  cancel: AiosellCancelReservation,
): ExternalReservationCommand {
  return {
    action: "cancel",
    restaurantId,
    hotelCode: cancel.hotelCode,
    channel: cancel.channel,
    bookingId: cancel.bookingId,
    cmBookingId: null,
    bookedOn: null,
    checkin: null,
    checkout: null,
    segment: null,
    specialRequests: null,
    pah: null,
    creditCardPresent: false,
    amount: null,
    guest: null,
    rooms: [],
    fingerprint: "",
  };
}

function commandFrom(
  action: "book" | "modify",
  restaurantId: string,
  booking: AiosellBookReservation | AiosellModifyReservation,
  rooms: ExternalRoomCommand[],
  creditCardPresent: boolean,
): ExternalReservationCommand {
  const guest = externalGuestSnapshot(booking.guest);
  const amount = {
    amountAfterTax: booking.amount.amountAfterTax,
    amountBeforeTax: booking.amount.amountBeforeTax,
    tax: booking.amount.tax,
    currency: booking.amount.currency,
    commission: booking.amount.commission,
    tcs: booking.amount.tcs,
    tds: booking.amount.tds,
  };
  const specialRequests = booking.specialRequests === undefined ? null : booking.specialRequests;
  const body = {
    hotelCode: booking.hotelCode,
    channel: booking.channel,
    bookingId: booking.bookingId,
    cmBookingId: blank(booking.cmBookingId),
    bookedOn: booking.bookedOn,
    checkin: booking.checkin,
    checkout: booking.checkout,
    segment: booking.segment,
    specialRequests,
    pah: booking.pah,
    amount,
    guest,
    rooms,
  };
  return {
    action,
    restaurantId,
    creditCardPresent,
    fingerprint: fingerprint(body),
    ...body,
  };
}

async function prepareStay(
  directory: AiosellReservationDirectory,
  booking: AiosellBookReservation | AiosellModifyReservation,
): Promise<{ property: AiosellPropertyMatch; rooms: ExternalRoomCommand[] } | { error: string }> {
  if (ANCHORS.has(booking.channel)) return { error: "AIOSELL_CHANNEL_ANCHOR" };
  const properties = await directory.findProperties(booking.hotelCode);
  if (properties.length === 0) return { error: "AIOSELL_PROPERTY_NOT_FOUND" };
  if (properties.length > 1) return { error: "AIOSELL_PROPERTY_AMBIGUOUS" };
  const property = properties[0];
  if (!property) return { error: "AIOSELL_PROPERTY_NOT_FOUND" };
  if (property.currency !== booking.amount.currency) return { error: "AIOSELL_CURRENCY_MISMATCH" };
  if (!(await directory.hasChannel(property.restaurantId, property.environment, booking.channel))) {
    return { error: "AIOSELL_CHANNEL_NOT_CONFIGURED" };
  }
  const rooms: ExternalRoomCommand[] = [];
  for (const room of booking.rooms) {
    if (!Number.isInteger(room.occupancy.adults) || room.occupancy.adults < 1) {
      return { error: "AIOSELL_OCCUPANCY_INVALID" };
    }
    if (!Number.isInteger(room.occupancy.children) || room.occupancy.children < 0) {
      return { error: "AIOSELL_OCCUPANCY_INVALID" };
    }
    const nightError = validateAiosellStayNights(booking.checkin, booking.checkout, room.prices);
    if (nightError) return { error: nightError };
    const mappedRoom = await directory.resolveRoom(
      property.restaurantId,
      property.environment,
      room.roomCode,
    );
    if (!mappedRoom) return { error: "ROOM_MAPPING_MISSING" };
    const mappedRate = await directory.resolveRate(
      property.restaurantId,
      property.environment,
      room.roomCode,
      room.rateplanCode,
    );
    if (!mappedRate) return { error: "RATE_MAPPING_MISSING" };
    if (mappedRate.roomTypeId !== mappedRoom.roomTypeId) return { error: "WRONG_ROOM_RATE_PLAN" };
    rooms.push({
      roomTypeId: mappedRoom.roomTypeId,
      ratePlanId: mappedRate.ratePlanId,
      guestName: blank(room.guestName),
      adults: room.occupancy.adults,
      children: room.occupancy.children,
      nights: room.prices.map((price) => ({ date: price.date, sellRate: price.sellRate })),
    });
  }
  return { property, rooms };
}

function eventFor(
  restaurantId: string,
  operation: string,
  channel: string,
  bookingId: string,
  success: boolean,
  message: string,
): DistributionSyncEventInsert {
  return toDistributionSyncEventInsert({
    restaurantId,
    provider: "aiosell",
    direction: "inbound",
    channel,
    externalBookingId: bookingId,
    operation,
    status: success ? "success" : "failed",
    responseSuccess: success,
    responseMessage: message,
    attemptCount: 1,
    retryEligible: false,
  });
}

function publicMessage(code: string, outcome?: ExternalApplyResult["outcome"]): string {
  if (outcome === "created") return "Reservation booked.";
  if (outcome === "duplicate") return "Reservation already exists.";
  if (outcome === "modified") return "Reservation modified.";
  if (outcome === "modify_idempotent") return "Reservation already matches this booking.";
  if (outcome === "cancelled") return "Reservation cancelled.";
  if (outcome === "cancel_idempotent") return "Reservation is already cancelled.";
  if (code === "AIOSELL_PROPERTY_NOT_FOUND" || outcome === "not_found")
    return "Reservation was not found.";
  if (code === "AIOSELL_PROPERTY_AMBIGUOUS") return "Hotel code matches more than one property.";
  if (code === "AIOSELL_CURRENCY_MISMATCH")
    return "Booking currency does not match the property currency.";
  if (code === "AIOSELL_CHANNEL_NOT_CONFIGURED" || code === "AIOSELL_CHANNEL_ANCHOR") {
    return "Channel is not configured for this property.";
  }
  if (
    code === "ROOM_MAPPING_MISSING" ||
    code === "RATE_MAPPING_MISSING" ||
    code === "WRONG_ROOM_RATE_PLAN"
  ) {
    return "Room or rate mapping is not ready.";
  }
  if (outcome === "status_conflict") return "Reservation status does not allow this change.";
  if (code === "AIOSELL_ACTION_UNKNOWN") return "Action is not supported.";
  if (code === "AIOSELL_PAYLOAD_INVALID") return "Reservation payload is not valid.";
  return "Reservation could not be processed.";
}

export async function receiveAiosellReservation(
  input: {
    authorization: string | null;
    username: string;
    password: string;
    body: unknown;
    rawText: string;
  },
  directory: AiosellReservationDirectory,
): Promise<{ status: number; body: AiosellWebhookBody; events: DistributionSyncEventInsert[] }> {
  if (!aiosellBasicAuthMatches(input.authorization, input.username, input.password)) {
    return { status: 401, body: { success: false, message: "Authentication failed." }, events: [] };
  }
  let payload: unknown = input.body;
  if (typeof input.rawText === "string" && input.body === undefined) {
    try {
      payload = JSON.parse(input.rawText);
    } catch {
      return {
        status: 400,
        body: { success: false, message: publicMessage("AIOSELL_PAYLOAD_INVALID") },
        events: [],
      };
    }
  }
  const creditCardPresent =
    Boolean(payload) && typeof payload === "object" && payload !== null && "creditCard" in payload;
  const stripped = withoutUnsupportedAiosellCard(payload);
  const action =
    stripped && typeof stripped === "object" && "action" in stripped
      ? (stripped as { action?: unknown }).action
      : null;
  if (action !== "book" && action !== "modify" && action !== "cancel") {
    return {
      status: 400,
      body: { success: false, message: publicMessage("AIOSELL_ACTION_UNKNOWN") },
      events: [],
    };
  }
  try {
    if (action === "cancel") {
      const cancel = parseAiosellCancel(stripped) as AiosellCancelReservation;
      const properties = await directory.findProperties(cancel.hotelCode);
      if (properties.length === 0) {
        return {
          status: 422,
          body: { success: false, message: publicMessage("AIOSELL_PROPERTY_NOT_FOUND") },
          events: [],
        };
      }
      if (properties.length > 1) {
        return {
          status: 422,
          body: { success: false, message: publicMessage("AIOSELL_PROPERTY_AMBIGUOUS") },
          events: [],
        };
      }
      const property = properties[0];
      if (!property) {
        return {
          status: 422,
          body: { success: false, message: publicMessage("AIOSELL_PROPERTY_NOT_FOUND") },
          events: [],
        };
      }
      const result = await directory.apply(externalCancelCommand(property.restaurantId, cancel));
      const success = result.outcome === "cancelled" || result.outcome === "cancel_idempotent";
      const message = publicMessage(result.outcome, result.outcome);
      const event = eventFor(
        property.restaurantId,
        "cancel",
        cancel.channel,
        cancel.bookingId,
        success,
        message,
      );
      await directory.record(event);
      const status = success ? 200 : result.outcome === "status_conflict" ? 409 : 422;
      return { status, body: { success, message }, events: [event] };
    }
    const booking = action === "book" ? parseAiosellBook(stripped) : parseAiosellModify(stripped);
    const prepared = await normalizeAiosellStayCommand(
      directory,
      action,
      booking,
      creditCardPresent,
    );
    if ("error" in prepared) {
      const properties = await directory.findProperties(booking.hotelCode);
      const property = properties.length === 1 ? properties[0] : null;
      const message = publicMessage(prepared.error);
      const events: DistributionSyncEventInsert[] = [];
      if (property) {
        const event = eventFor(
          property.restaurantId,
          action,
          booking.channel,
          booking.bookingId,
          false,
          message,
        );
        await directory.record(event);
        events.push(event);
      }
      return { status: 422, body: { success: false, message }, events };
    }
    const command = prepared.command;
    const result = await directory.apply(command);
    const success =
      result.outcome === "created" ||
      result.outcome === "duplicate" ||
      result.outcome === "modified" ||
      result.outcome === "modify_idempotent";
    const message = publicMessage(result.outcome, result.outcome);
    const event = eventFor(
      command.restaurantId,
      action,
      booking.channel,
      booking.bookingId,
      success,
      result.outcome === "duplicate" || result.outcome === "modify_idempotent"
        ? `${message} idempotent`
        : message,
    );
    await directory.record(event);
    const status = success ? 200 : result.outcome === "status_conflict" ? 409 : 422;
    return { status, body: { success, message }, events: [event] };
  } catch {
    return {
      status: 400,
      body: { success: false, message: publicMessage("AIOSELL_PAYLOAD_INVALID") },
      events: [],
    };
  }
}
