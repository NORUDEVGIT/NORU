import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AIOSELL_CANCEL_REASON,
  EXTERNAL_GUEST_LABEL,
  aiosellBasicAuthMatches,
  aiosellWebhookChannelAccepted,
  applyExternalReservationMemory,
  createExternalReservationMemory,
  receiveAiosellReservation,
  validateAiosellStayNights,
  type AiosellReservationDirectory,
  type ExternalReservationMemory,
} from "./aiosell-reservation";

const username = "dummy-user";
const password = "dummy-password";
const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
const roomTypeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherRoomTypeId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ratePlanId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const otherRatePlanId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function booking(overrides: Record<string, unknown> = {}) {
  return {
    action: "book",
    hotelCode: "Hotel-East",
    channel: "booking.com",
    bookingId: "Book-1",
    bookedOn: "2026-10-01 09:00:00",
    checkin: "2026-10-20",
    checkout: "2026-10-22",
    segment: "OTA",
    specialRequests: "Late arrival",
    pah: true,
    amount: {
      amountAfterTax: 200,
      amountBeforeTax: 180,
      tax: 20,
      currency: "INR",
      commission: null,
      tcs: null,
      tds: null,
    },
    guest: {
      firstName: "Amina",
      lastName: "Diallo",
      email: "amina@example.test",
      phone: "9000000000",
    },
    rooms: [
      {
        roomCode: "executive",
        rateplanCode: "executive-s-ep",
        occupancy: { adults: 2, children: 1 },
        prices: [
          { date: "2026-10-20", sellRate: 100 },
          { date: "2026-10-21", sellRate: 100 },
        ],
      },
    ],
    ...overrides,
  };
}

function harness(extraProperties = 0) {
  const memory = createExternalReservationMemory();
  const events: unknown[] = [];
  const properties = [
    {
      restaurantId: "property-east",
      environment: "sandbox" as const,
      currency: "INR",
      hotelCode: "Hotel-East",
    },
    ...Array.from({ length: extraProperties }, (_, index) => ({
      restaurantId: `property-${index}`,
      environment: "sandbox" as const,
      currency: "INR",
      hotelCode: "Hotel-East",
    })),
  ];
  const directory: AiosellReservationDirectory = {
    async findProperties(hotelCode) {
      return properties
        .filter((property) => property.hotelCode === hotelCode)
        .map(({ restaurantId, environment, currency }) => ({
          restaurantId,
          environment,
          currency,
        }));
    },
    async hasChannel(_restaurantId, _environment, channel) {
      return channel === "booking.com" || channel === "Goibibo";
    },
    async resolveRoom(_restaurantId, _environment, roomCode) {
      if (roomCode === "executive") return { roomTypeId };
      if (roomCode === "suite") return { roomTypeId: otherRoomTypeId };
      return null;
    },
    async resolveRate(_restaurantId, _environment, roomCode, rateplanCode) {
      if (roomCode === "executive" && rateplanCode === "executive-s-ep") {
        return { ratePlanId, roomTypeId };
      }
      if (roomCode === "suite" && rateplanCode === "suite-ep") {
        return { ratePlanId: otherRatePlanId, roomTypeId: otherRoomTypeId };
      }
      if (roomCode === "executive" && rateplanCode === "wrong-room") {
        return { ratePlanId: otherRatePlanId, roomTypeId: otherRoomTypeId };
      }
      return null;
    },
    async apply(command) {
      return applyExternalReservationMemory(memory, command);
    },
    async record(event) {
      events.push(event);
    },
  };
  return { memory, events, directory };
}

async function post(
  directory: AiosellReservationDirectory,
  body: unknown,
  header: string | null = authorization,
) {
  return receiveAiosellReservation(
    { authorization: header, username, password, body, rawText: "" },
    directory,
  );
}

describe("AIOS-05 inbound Aiosell reservations", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-reservation.ts"),
    "utf8",
  );
  const server = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-reservation.server.ts"),
    "utf8",
  );
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0164_external_reservation_ingest.sql"),
    "utf8",
  );

  it("rejects bad credentials before processing and compares them in constant time", async () => {
    expect(source).toContain("timingSafeEqual");
    const { directory, events } = harness();
    expect((await post(directory, booking(), null)).status).toBe(401);
    expect((await post(directory, booking(), "Bearer token")).status).toBe(401);
    expect(
      (
        await post(
          directory,
          booking(),
          `Basic ${Buffer.from(`nope:${password}`).toString("base64")}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await post(
          directory,
          booking(),
          `Basic ${Buffer.from(`${username}:nope`).toString("base64")}`,
        )
      ).status,
    ).toBe(401);
    expect(aiosellBasicAuthMatches(authorization, username, password)).toBe(true);
    expect(events).toHaveLength(0);
    const malformed = await receiveAiosellReservation(
      { authorization, username, password, body: undefined, rawText: "not-json" },
      directory,
    );
    expect(malformed.status).toBe(400);
    const unknown = await post(directory, { action: "noshow", hotelCode: "Hotel-East" });
    expect(unknown.body.success).toBe(false);
    expect(JSON.stringify(unknown)).not.toContain(password);
  });

  it("keeps the external mapping lookup free of an ambiguous channel reference", () => {
    const lanes = [
      "drizzle/migrations/0164_external_reservation_ingest.sql",
      "supabase/migrations/0164_external_reservation_ingest.sql",
      "docs/pms/sql/aiosell-05-apply-external-reservation-event-hotfix.sql",
    ].map((name) => readFileSync(resolve(process.cwd(), name), "utf8"));
    const oldDeclaration = /(^|\n)[ \t]*channel[ \t]+text[ \t]*:=/;
    const selfComparison = /(^|[^A-Za-z0-9_.])channel[ \t]*=[ \t]*channel(?![A-Za-z0-9_])/;
    for (const sql of lanes) {
      expect(sql).toContain("channel_key text := _payload->>'channel'");
      expect(sql).toContain("FROM public.pms_external_reservation_mappings AS m");
      expect(sql).toContain("m.channel = channel_key");
      expect(sql).not.toMatch(oldDeclaration);
      expect(sql).not.toMatch(selfComparison);
    }
  });

  it("books one room from mapped codes and keeps the OTA price", async () => {
    const { directory, memory, events } = harness();
    const result = await post(directory, booking());
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(memory.reservations).toHaveLength(1);
    expect(memory.reservations[0]?.reservationMode).toBe("single");
    expect(memory.reservations[0]?.status).toBe("confirmed");
    expect(memory.reservations[0]?.roomId).toBeNull();
    expect(memory.units).toHaveLength(1);
    expect(memory.units[0]?.roomTypeId).toBe(roomTypeId);
    expect(memory.units[0]?.ratePlanId).toBe(ratePlanId);
    expect(memory.units[0]?.adults).toBe(2);
    expect(memory.units[0]?.nights).toEqual([
      { date: "2026-10-20", rate: 100, source: "external" },
      { date: "2026-10-21", rate: 100, source: "external" },
    ]);
    expect(memory.snapshots[0]?.amount?.amountAfterTax).toBe(200);
    expect(memory.snapshots[0]?.specialRequests).toBe("Late arrival");
    expect(memory.snapshots[0]?.pah).toBe(true);
    expect(memory.snapshots[0]?.bookedOn).toBe("2026-10-01 09:00:00");
    expect(memory.snapshots[0]?.channel).toBe("booking.com");
    expect(memory.snapshots[0]?.bookingId).toBe("Book-1");
    expect(memory.mappings).toHaveLength(1);
    expect(memory.reservations[0]?.folioId).toBeTruthy();
    expect(memory.transactions).toEqual([
      {
        reservationId: memory.reservations[0]?.id,
        type: "charge",
        amount: 200,
        referenceType: "reservation_room_charge",
      },
    ]);
    expect(memory.availabilityWrites).toHaveLength(0);
    expect(events[0]).toMatchObject({
      direction: "inbound",
      operation: "book",
      retry_eligible: false,
    });
    expect(source).not.toContain("price_hotel_stay");
    expect(source).not.toContain("pms_exchange_rates");
    expect(sql).toContain("cancel_hotel_reservation_unit");
    expect(sql).toContain(AIOSELL_CANCEL_REASON);
    expect(sql).not.toContain("public.price_hotel_stay");
    expect(sql).not.toContain("INSERT INTO public.folio_transactions");
    const folioSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0168_channel_reservation_folio.sql"),
      "utf8",
    );
    const folioSqlCopy = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0168_channel_reservation_folio.sql"),
      "utf8",
    );
    expect(folioSqlCopy).toBe(folioSql);
    expect(folioSql).toContain("post_channel_reservation_folio");
    expect(folioSql).toContain("external_prepaid");
    expect(folioSql).toContain("pay_at_hotel IS DISTINCT FROM false");
    expect(sql).not.toContain("UPDATE public.pms_room_type_availability");
  });

  it("settles a prepaid channel booking and leaves a pay-at-hotel booking due", async () => {
    const prepaid = harness();
    await post(prepaid.directory, booking({ pah: false, bookingId: "Prepaid-1" }));
    expect(prepaid.memory.transactions).toEqual([
      {
        reservationId: prepaid.memory.reservations[0]?.id,
        type: "charge",
        amount: 200,
        referenceType: "reservation_room_charge",
      },
      {
        reservationId: prepaid.memory.reservations[0]?.id,
        type: "payment",
        amount: 200,
        referenceType: "external_prepaid",
      },
    ]);

    const due = harness();
    await post(due.directory, booking({ pah: true, bookingId: "Due-1" }));
    expect(due.memory.transactions.map((line) => line.type)).toEqual(["charge"]);
  });

  it("accepts a guest-less booking without inventing contact data", async () => {
    const { directory, memory } = harness();
    memory.guests.push({
      id: "staff-guest",
      restaurantId: "property-east",
      firstName: "Amina",
      lastName: "Diallo",
      email: "masked***@guest.booking.com",
      phone: null,
      line1: null,
      city: null,
      state: null,
      country: null,
      zipCode: null,
      profileOrigin: "staff",
    });
    const result = await post(
      directory,
      booking({
        guest: null,
        rooms: [
          {
            roomCode: "executive",
            rateplanCode: "executive-s-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 0 },
              { date: "2026-10-21", sellRate: 0 },
            ],
          },
        ],
      }),
    );
    expect(result.body.success).toBe(true);
    const created = memory.guests.filter((guest) => guest.id !== "staff-guest");
    expect(created).toHaveLength(1);
    expect(created[0]?.firstName).toBe(EXTERNAL_GUEST_LABEL);
    expect(created[0]?.email).toBeNull();
    expect(created[0]?.phone).toBeNull();
    expect(created[0]?.profileOrigin).toBe("external_provisional");
    expect(memory.snapshots[0]?.guest).toBeNull();
  });

  it("keeps a duplicate book on the same reservation", async () => {
    const { directory, memory } = harness();
    await post(directory, booking());
    const again = await post(directory, booking({ cmBookingId: "CM-2" }));
    expect(again.body.message).toBe("Reservation already exists.");
    expect(memory.reservations).toHaveLength(1);
    expect(memory.units).toHaveLength(1);
    expect(memory.guests).toHaveLength(1);
    expect(memory.mappings).toHaveLength(1);
    expect(memory.mappings[0]?.cmBookingId).toBeNull();
    expect(memory.history).toHaveLength(1);
  });

  it("stores two rooms on one group reservation", async () => {
    const { directory, memory } = harness();
    const result = await post(
      directory,
      booking({
        rooms: [
          {
            roomCode: "executive",
            rateplanCode: "executive-s-ep",
            guestName: "Amina Diallo",
            occupancy: { adults: 2, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 100 },
              { date: "2026-10-21", sellRate: 80 },
            ],
          },
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 1, children: 1 },
            prices: [
              { date: "2026-10-20", sellRate: 140 },
              { date: "2026-10-21", sellRate: 140 },
            ],
          },
        ],
      }),
    );
    expect(result.body.success).toBe(true);
    expect(memory.reservations).toHaveLength(1);
    expect(memory.reservations[0]?.reservationMode).toBe("group");
    expect(memory.units).toHaveLength(2);
    expect(memory.units.map((unit) => unit.roomTypeId)).toEqual([roomTypeId, otherRoomTypeId]);
    expect(memory.units[1]?.adults).toBe(1);
    expect(memory.units[1]?.nights[0]?.rate).toBe(140);
    expect(memory.mappings).toHaveLength(1);
    const missingName = await post(
      directory,
      booking({
        bookingId: "Book-2",
        rooms: [
          {
            roomCode: "executive",
            rateplanCode: "executive-s-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 10 },
              { date: "2026-10-21", sellRate: 10 },
            ],
          },
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 10 },
              { date: "2026-10-21", sellRate: 10 },
            ],
          },
        ],
      }),
    );
    expect(missingName.body.success).toBe(true);
  });

  it("rejects incomplete nights, bad mappings, and a currency mismatch", async () => {
    const { directory } = harness();
    expect(
      validateAiosellStayNights("2026-10-20", "2026-10-22", [{ date: "2026-10-20", sellRate: 1 }]),
    ).toBe("AIOSELL_NIGHT_MISSING");
    expect(
      validateAiosellStayNights("2026-10-20", "2026-10-21", [
        { date: "2026-10-20", sellRate: 1 },
        { date: "2026-10-20", sellRate: 1 },
      ]),
    ).toBe("AIOSELL_NIGHT_DUPLICATE");
    expect(
      validateAiosellStayNights("2026-10-20", "2026-10-21", [{ date: "2026-10-19", sellRate: 1 }]),
    ).toBe("AIOSELL_NIGHT_OUT_OF_RANGE");
    expect(
      validateAiosellStayNights("2026-10-20", "2026-10-21", [{ date: "2026-10-20", sellRate: -1 }]),
    ).toBe("AIOSELL_SELL_RATE_INVALID");
    const missingRoom = await post(
      directory,
      booking({
        rooms: [
          {
            roomCode: "unknown",
            rateplanCode: "executive-s-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 1 },
              { date: "2026-10-21", sellRate: 1 },
            ],
          },
        ],
      }),
    );
    expect(missingRoom.body.message).toBe("Room or rate mapping is not ready.");
    const wrong = await post(
      directory,
      booking({
        rooms: [
          {
            roomCode: "executive",
            rateplanCode: "wrong-room",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 1 },
              { date: "2026-10-21", sellRate: 1 },
            ],
          },
        ],
      }),
    );
    expect(wrong.body.success).toBe(false);
    const currency = await post(
      directory,
      booking({ amount: { amountAfterTax: 1, amountBeforeTax: 1, tax: 0, currency: "EUR" } }),
    );
    expect(currency.body.message).toContain("currency");
    const ambiguous = harness(1);
    const both = await post(ambiguous.directory, booking());
    expect(both.body.message).toContain("more than one property");
    const unknownHotel = await post(directory, booking({ hotelCode: "Missing" }));
    expect(unknownHotel.body.success).toBe(false);
  });

  it("discards card material and keeps technical events free of secrets", async () => {
    const { directory, memory, events } = harness();
    const result = await post(directory, {
      ...booking(),
      creditCard: {
        cardNumber: "4111111111111111",
        cvv: "123",
        expiry: "12/30",
        cardHolderName: "Amina",
      },
    });
    expect(result.body.success).toBe(true);
    const stored = JSON.stringify({ memory, events, body: result.body });
    expect(stored).not.toContain("4111111111111111");
    expect(stored).not.toContain("cvv");
    expect(stored).not.toContain("cardHolderName");
    expect(stored).not.toContain(authorization);
    expect(stored).not.toContain(password);
    expect(memory.snapshots[0]?.creditCardPresent).toBe(true);
    expect(server).not.toContain("console.log");
  });

  it("replaces a booking in full and leaves a verified guest in place", async () => {
    const { directory, memory, events } = harness();
    await post(directory, booking());
    const reservation = memory.reservations[0];
    const lead = memory.guests[0];
    if (!reservation || !lead) throw new Error("missing booking");
    lead.profileOrigin = "staff";
    lead.firstName = "Verified";
    const modified = await post(
      directory,
      booking({
        action: "modify",
        guest: null,
        checkin: "2026-10-18",
        checkout: "2026-10-21",
        specialRequests: "Quiet room",
        amount: { amountAfterTax: 360, amountBeforeTax: 300, tax: 60, currency: "INR" },
        rooms: [
          {
            roomCode: "executive",
            rateplanCode: "executive-s-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-18", sellRate: 120 },
              { date: "2026-10-19", sellRate: 120 },
              { date: "2026-10-20", sellRate: 120 },
            ],
          },
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 2, children: 0 },
            prices: [
              { date: "2026-10-18", sellRate: 140 },
              { date: "2026-10-19", sellRate: 140 },
              { date: "2026-10-20", sellRate: 140 },
            ],
          },
        ],
      }),
    );
    expect(modified.body.success).toBe(true);
    expect(reservation.id).toBe(memory.reservations[0]?.id);
    expect(reservation.confirmationNumber).toBe(memory.reservations[0]?.confirmationNumber);
    expect(reservation.folioId).toBe(memory.reservations[0]?.folioId);
    expect(reservation.arrivalDate).toBe("2026-10-18");
    expect(reservation.reservationMode).toBe("group");
    expect(memory.units.filter((unit) => unit.reservationId === reservation.id)).toHaveLength(2);
    expect(
      memory.units.some((unit) => unit.nights.some((night) => night.date === "2026-10-21")),
    ).toBe(false);
    expect(memory.snapshots[0]?.amount?.amountAfterTax).toBe(360);
    expect(memory.snapshots[0]?.specialRequests).toBe("Quiet room");
    expect(memory.snapshots[0]?.guest).toBeNull();
    expect(lead.firstName).toBe("Verified");
    const shrunk = await post(
      directory,
      booking({
        action: "modify",
        guest: null,
        rooms: [
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 90 },
              { date: "2026-10-21", sellRate: 90 },
            ],
          },
        ],
      }),
    );
    expect(shrunk.body.success).toBe(true);
    expect(memory.units.filter((unit) => unit.reservationId === reservation.id)).toHaveLength(1);
    expect(reservation.reservationMode).toBe("single");
    const same = await post(
      directory,
      booking({
        action: "modify",
        guest: null,
        rooms: [
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [
              { date: "2026-10-20", sellRate: 90 },
              { date: "2026-10-21", sellRate: 90 },
            ],
          },
        ],
      }),
    );
    expect(same.body.message).toBe("Reservation already matches this booking.");
    reservation.status = "checked_in";
    const blocked = await post(
      directory,
      booking({
        action: "modify",
        guest: null,
        checkin: "2026-11-01",
        checkout: "2026-11-02",
        rooms: [
          {
            roomCode: "suite",
            rateplanCode: "suite-ep",
            occupancy: { adults: 1, children: 0 },
            prices: [{ date: "2026-11-01", sellRate: 90 }],
          },
        ],
      }),
    );
    expect(blocked.status).toBe(409);
    expect(reservation.status).toBe("checked_in");
    expect(events.some((event) => JSON.stringify(event).includes('"operation":"modify"'))).toBe(
      true,
    );
  });

  it("cancels through the external result without a second reservation or a payment", async () => {
    const { directory, memory, events } = harness();
    const missing = await post(directory, {
      action: "cancel",
      hotelCode: "Hotel-East",
      channel: "booking.com",
      bookingId: "Missing",
    });
    expect(missing.body.success).toBe(false);
    await post(directory, booking());
    const cancelled = await post(directory, {
      action: "cancel",
      hotelCode: "Hotel-East",
      channel: "booking.com",
      bookingId: "Book-1",
    });
    expect(cancelled.body.success).toBe(true);
    expect(memory.reservations[0]?.status).toBe("cancelled");
    expect(memory.transactions.map((line) => line.type)).toEqual(["charge"]);
    expect(memory.history.some((row) => row.eventType === "cancelled")).toBe(true);
    expect(memory.history.some((row) => row.eventType === "external_reservation_cancelled")).toBe(
      true,
    );
    const again = await post(directory, {
      action: "cancel",
      hotelCode: "Hotel-East",
      channel: "booking.com",
      bookingId: "Book-1",
    });
    expect(again.body.message).toBe("Reservation is already cancelled.");
    expect(
      memory.history.filter((row) => row.eventType === "external_reservation_cancelled"),
    ).toHaveLength(1);
    memory.reservations[0]!.status = "checked_out";
    const departed = await post(directory, {
      action: "cancel",
      hotelCode: "Hotel-East",
      channel: "booking.com",
      bookingId: "Book-1",
    });
    expect(departed.status).toBe(409);
    expect(memory.reservations[0]?.status).toBe("checked_out");
    const stored = JSON.stringify(events);
    expect(stored).not.toContain("amina@example.test");
    expect(stored).not.toContain(password);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toContain("external_reference");
  });
});

describe("Aiosell webhook channel configuration", () => {
  const integrationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11";
  const propertyEast = "property-east";
  const configured = {
    restaurantId: propertyEast,
    environment: "sandbox" as const,
    code: "booking.com",
    channelType: "ota",
    status: "active",
    integrationId,
  };

  function directoryFor(
    channels: (typeof configured)[],
    integration: string | null,
  ): AiosellReservationDirectory {
    const base = harness().directory;
    return {
      ...base,
      async hasChannel(restaurantId, environment, channel) {
        return aiosellWebhookChannelAccepted({
          restaurantId,
          environment,
          channel,
          integrationId: integration,
          channels,
        });
      },
    };
  }

  it("accepts a configured Booking.com channel and rejects an unknown OTA", async () => {
    const accepted = await post(directoryFor([configured], integrationId), booking());
    expect(accepted.body.success).toBe(true);
    expect(accepted.body.message).not.toBe("Channel is not configured for this property.");

    const unknown = await post(
      directoryFor([configured], integrationId),
      booking({ channel: "expedia" }),
    );
    expect(unknown.body.success).toBe(false);
    expect(unknown.body.message).toBe("Channel is not configured for this property.");

    const otherProperty = await post(
      directoryFor([{ ...configured, restaurantId: "property-west" }], integrationId),
      booking(),
    );
    expect(otherProperty.body.message).toBe("Channel is not configured for this property.");
  });
});
