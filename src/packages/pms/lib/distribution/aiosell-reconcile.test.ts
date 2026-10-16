import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createAiosellClient, type AiosellTransportRequest } from "./aiosell-client";
import {
  notifyAiosellNoShow,
  reconcileAiosellReservations,
  type AiosellReconcilePorts,
} from "./aiosell-reconcile";
import {
  applyExternalReservationMemory,
  createExternalReservationMemory,
  type AiosellReservationDirectory,
  type ExternalReservationCommand,
} from "./aiosell-reservation";

const roomTypeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ratePlanId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function stay(overrides: Record<string, unknown> = {}) {
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
        occupancy: { adults: 2, children: 0 },
        prices: [
          { date: "2026-10-20", sellRate: 100 },
          { date: "2026-10-21", sellRate: 100 },
        ],
      },
    ],
    ...overrides,
  };
}

function world() {
  const memory = createExternalReservationMemory();
  const events: unknown[] = [];
  const actions: ExternalReservationCommand["action"][] = [];
  const directory: AiosellReservationDirectory = {
    async findProperties(hotelCode) {
      return hotelCode === "Hotel-East"
        ? [{ restaurantId: "property-east", environment: "sandbox", currency: "INR" }]
        : [];
    },
    async hasChannel(_restaurantId, _environment, channel) {
      return channel === "booking.com" || channel === "gommt";
    },
    async resolveRoom(_restaurantId, _environment, roomCode) {
      return roomCode === "executive" ? { roomTypeId } : null;
    },
    async resolveRate(_restaurantId, _environment, roomCode, rateplanCode) {
      return roomCode === "executive" && rateplanCode === "executive-s-ep"
        ? { ratePlanId, roomTypeId }
        : null;
    },
    async apply(command) {
      actions.push(command.action);
      return applyExternalReservationMemory(memory, command);
    },
    async record(event) {
      events.push(event);
    },
  };
  const ports = (rows: unknown[]): AiosellReconcilePorts => ({
    directory,
    async fetchReservations() {
      return { ok: true, data: rows, message: null };
    },
    async findFingerprint(query) {
      const mapping = memory.mappings.find(
        (row) =>
          row.restaurantId === query.restaurantId &&
          row.hotelCode === query.hotelCode &&
          row.channel === query.channel &&
          row.bookingId === query.bookingId,
      );
      if (!mapping) return { found: false, fingerprint: null };
      const snapshot = memory.snapshots.find((row) => row.reservationId === mapping.reservationId);
      return { found: true, fingerprint: snapshot?.fingerprint ?? null };
    },
    now: () => new Date("2026-10-14T12:00:00.000Z"),
  });
  return { memory, events, actions, directory, ports };
}

async function run(rows: unknown[], current = world()) {
  const summary = await reconcileAiosellReservations(
    {
      restaurantId: "property-east",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-22",
    },
    current.ports(rows),
  );
  return { ...current, summary };
}

describe("AIOS-06 Aiosell reservation reconciliation", () => {
  it("creates, skips an identical fetch, and modifies a changed full state", async () => {
    const created = await run([stay()]);
    expect(created.summary.totals).toMatchObject({ fetched: 1, created: 1, failed: 0 });
    expect(created.actions).toEqual(["book"]);
    expect(created.memory.reservations).toHaveLength(1);
    expect(created.memory.units).toHaveLength(1);
    expect(created.memory.reservations[0]?.folioId).toBeTruthy();
    expect(created.memory.snapshots).toHaveLength(1);
    expect(created.memory.mappings).toHaveLength(1);
    const confirmation = created.memory.reservations[0]?.confirmationNumber;
    const same = await run([stay()], created);
    expect(same.summary.totals).toMatchObject({
      fetched: 1,
      unchanged: 1,
      created: 0,
      modified: 0,
    });
    expect(same.actions).toEqual(["book"]);
    expect(same.memory.reservations).toHaveLength(1);
    expect(same.memory.history).toHaveLength(1);
    const changed = stay({
      rooms: [
        {
          roomCode: "executive",
          rateplanCode: "executive-s-ep",
          occupancy: { adults: 2, children: 0 },
          prices: [
            { date: "2026-10-20", sellRate: 140 },
            { date: "2026-10-21", sellRate: 140 },
          ],
        },
      ],
    });
    const modified = await run([changed], same);
    expect(modified.summary.totals.modified).toBe(1);
    expect(modified.actions).toEqual(["book", "modify"]);
    expect(modified.memory.reservations).toHaveLength(1);
    expect(modified.memory.reservations[0]?.confirmationNumber).toBe(confirmation);
    expect(modified.memory.reservations[0]?.folioId).toBe(created.memory.reservations[0]?.folioId);
    expect(modified.memory.units[0]?.nights[0]?.rate).toBe(140);
  });

  it("cancels only an explicit cancel payload and ignores a booking absent from the window", async () => {
    const seeded = await run([stay()]);
    const absent = await run([], seeded);
    expect(absent.summary.totals).toMatchObject({ fetched: 0, cancelled: 0 });
    expect(absent.memory.reservations[0]?.status).toBe("confirmed");
    const cancelled = await run([stay({ action: "cancel", bookingId: "Book-1" })], absent);
    expect(cancelled.summary.totals).toMatchObject({ cancelled: 1, failed: 0 });
    expect(cancelled.actions).toEqual(["book", "cancel"]);
    expect(cancelled.memory.reservations[0]?.status).toBe("cancelled");
  });

  it("isolates mapping failures, a property mismatch, and a guest-less card payload", async () => {
    const secret = "4111111111111111";
    const result = await run([
      stay({ bookingId: "missing-room", rooms: [room("unknown", "executive-s-ep")] }),
      stay({ bookingId: "missing-rate", rooms: [room("executive", "unknown")] }),
      stay({ bookingId: "other-hotel", hotelCode: "Hotel-West" }),
      stay({
        bookingId: "guest-less",
        guest: undefined,
        creditCard: { number: secret },
        specialRequests: "Late arrival",
      }),
      stay({ bookingId: "Book-ok" }),
    ]);
    expect(result.summary.totals).toEqual({
      fetched: 5,
      created: 2,
      modified: 0,
      cancelled: 0,
      unchanged: 0,
      conflicts: 0,
      failed: 3,
    });
    expect(result.summary.results.map((item) => item.code)).toEqual([
      "ROOM_MAPPING_MISSING",
      "RATE_MAPPING_MISSING",
      "AIOSELL_PROPERTY_MISMATCH",
      "created",
      "created",
    ]);
    expect(result.memory.reservations).toHaveLength(2);
    const guestLess = result.memory.guests.find((guest) => guest.firstName === "External guest");
    expect(guestLess?.email).toBeNull();
    expect(guestLess?.phone).toBeNull();
    expect(guestLess?.profileOrigin).toBe("external_provisional");
    const published = JSON.stringify({ summary: result.summary, events: result.events });
    expect(published).not.toContain(secret);
    expect(published).not.toContain("amina@example.test");
    expect(published).not.toContain("Late arrival");
    expect(published).not.toContain("creditCard");
    expect(
      result.memory.snapshots.every(
        (row) => row.creditCardPresent === false || row.bookingId === "guest-less",
      ),
    ).toBe(true);
    expect(
      result.memory.snapshots.find((row) => row.bookingId === "guest-less")?.creditCardPresent,
    ).toBe(true);
    expect(JSON.stringify(result.memory)).not.toContain(secret);
  });

  it("does not duplicate a reservation when the same booking is fetched twice in one window", async () => {
    const result = await run([stay(), stay()]);
    expect(result.memory.reservations).toHaveLength(1);
    expect(result.summary.totals).toMatchObject({ created: 1, unchanged: 1 });
  });

  it("fails the run when the fetch fails and still returns a summary", async () => {
    const current = world();
    const summary = await reconcileAiosellReservations(
      {
        restaurantId: "property-east",
        hotelCode: "Hotel-East",
        startDate: "2026-10-20",
        endDate: "2026-10-22",
      },
      {
        ...current.ports([]),
        async fetchReservations() {
          return {
            ok: false,
            code: "AIOSELL_TIMEOUT",
            message: "Aiosell request timed out.",
            httpStatus: null,
          };
        },
      },
    );
    expect(summary.ok).toBe(false);
    expect(summary.runError).toBe("AIOSELL_TIMEOUT");
    expect(summary.results).toEqual([]);
    expect(summary.totals.fetched).toBe(0);
  });

  it("notifies Aiosell only for booking.com and gommt and does not mark the local stay", async () => {
    const calls: unknown[] = [];
    const events: unknown[] = [];
    const supported = await notifyAiosellNoShow(
      { restaurantId: "property-east", reservationId: "reservation-1" },
      {
        async loadReservation() {
          return true;
        },
        async loadMapping() {
          return {
            provider: "aiosell",
            hotelCode: "Hotel-East",
            channel: "gommt",
            bookingId: "Book-9",
          };
        },
        async markNoShow(request) {
          calls.push(request);
          return {
            ok: true,
            data: { success: true, message: "Noshow Marked Successfully" },
            message: "ok",
          };
        },
        async record(event) {
          events.push(event);
        },
      },
    );
    expect(supported).toEqual({ ok: true, code: "notified" });
    expect(calls).toEqual([{ hotelCode: "Hotel-East", bookingId: "Book-9", channel: "gommt" }]);
    const rejected = await notifyAiosellNoShow(
      { restaurantId: "property-east", reservationId: "reservation-1" },
      {
        async loadReservation() {
          return true;
        },
        async loadMapping() {
          return {
            provider: "aiosell",
            hotelCode: "Hotel-East",
            channel: "expedia",
            bookingId: "Book-9",
          };
        },
        async markNoShow() {
          throw new Error("should not call Aiosell");
        },
        async record() {},
      },
    );
    expect(rejected).toEqual({ ok: false, code: "AIOSELL_NO_SHOW_CHANNEL" });
    const source = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-reconcile.ts"),
      "utf8",
    );
    const server = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-reconcile.server.ts"),
      "utf8",
    );
    const frontOffice = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/fo-cancel-noshow.functions.ts"),
      "utf8",
    );
    expect(source).not.toContain("mark_hotel_reservation_no_show");
    expect(server).not.toContain("mark_hotel_reservation_no_show");
    expect(frontOffice).not.toContain("notifyAiosell");
    expect(frontOffice).not.toContain("marknoshow");
    expect(JSON.stringify(events)).not.toContain("Amina");
  });

  it("posts reservation fetch and mark-no-show to the documented paths", async () => {
    const seen: AiosellTransportRequest[] = [];
    const client = createAiosellClient({
      partnerSlug: "partner-east",
      username: "dummy-user",
      password: "dummy-password",
      transport: async (request) => {
        seen.push(request);
        if (request.url.includes("/marknoshow/")) {
          return {
            status: 200,
            body: JSON.stringify({ success: true, message: "Noshow Marked Successfully" }),
          };
        }
        return { status: 200, body: JSON.stringify([stay()]) };
      },
    });
    const fetched = await client.fetchReservations({
      type: "reservation",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-22",
    });
    expect(fetched.ok).toBe(true);
    expect(seen[0]?.url).toBe("https://live.aiosell.com/api/v2/cm/data/partner-east");
    expect(seen[0]?.body).toContain('"type":"reservation"');
    const marked = await client.markNoShow({
      hotelCode: "Hotel-East",
      bookingId: "Book-9",
      channel: "booking.com",
    });
    expect(marked.ok).toBe(true);
    expect(seen[1]?.url).toBe("https://live.aiosell.com/api/v2/cm/marknoshow/partner-east");
    expect(seen[1]?.body).not.toContain("dummy-password");
  });
});

function room(roomCode: string, rateplanCode: string) {
  return {
    roomCode,
    rateplanCode,
    occupancy: { adults: 1, children: 0 },
    prices: [
      { date: "2026-10-20", sellRate: 100 },
      { date: "2026-10-21", sellRate: 100 },
    ],
  };
}
