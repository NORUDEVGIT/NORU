import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { toDistributionSyncEventInsert } from "./distribution-sync-event";
import { externalReservationIdentity } from "./external-reservation-identity";
import {
  createExternalReservationMapping,
  findExternalReservationMapping,
  type ExternalReservationMapping,
  type ExternalReservationMappingStore,
} from "./external-reservation-mapping";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

function memoryStore() {
  const reservations = new Map<string, string>();
  const rows: ExternalReservationMapping[] = [];
  let sequence = 0;
  const store: ExternalReservationMappingStore = {
    async findReservationRestaurant(reservationId) {
      return reservations.get(reservationId) ?? null;
    },
    async findByIdentity(identity) {
      return (
        rows.find(
          (row) =>
            row.restaurantId === identity.restaurantId &&
            row.provider === identity.provider &&
            row.hotelCode === identity.hotelCode &&
            row.channel === identity.channel &&
            row.externalBookingId === identity.externalBookingId,
        ) ?? null
      );
    },
    async insert(row) {
      const created: ExternalReservationMapping = {
        ...row,
        id: `map-${++sequence}`,
        createdAt: "2026-10-14T00:00:00.000Z",
        updatedAt: "2026-10-14T00:00:00.000Z",
      };
      rows.push(created);
      return created;
    },
  };
  return { store, reservations, rows };
}

const propertyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const propertyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const reservationA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const reservationB = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function mappingInput(overrides: Record<string, string> = {}) {
  return {
    restaurantId: propertyA,
    provider: "aiosell",
    hotelCode: "sandbox-pms",
    channel: "booking.com",
    externalBookingId: "BDC5238846",
    reservationId: reservationA,
    ...overrides,
  };
}

describe("AIOS-02 external reservation identity", () => {
  const migration = read("drizzle/migrations/0162_external_reservation_identity.sql");
  const migrationCopy = read("supabase/migrations/0162_external_reservation_identity.sql");
  const service = read("src/packages/pms/lib/distribution/external-reservation-mapping.ts");

  it("keeps both migration copies identical and locks the identity key", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain(
      "UNIQUE (restaurant_id, provider, hotel_code, channel, external_booking_id)",
    );
    expect(migration).toContain(
      "FOREIGN KEY (reservation_id, restaurant_id)\n    REFERENCES public.hotel_reservations (id, restaurant_id)",
    );
    expect(migration).toContain("RAISE EXCEPTION 'EXTERNAL_RESERVATION_CONFLICT'");
    expect(migration).toContain("RAISE EXCEPTION 'EXTERNAL_RESERVATION_PROPERTY_MISMATCH'");
    expect(migration).not.toContain("ALTER TABLE public.hotel_reservations");
    expect(migration).not.toMatch(/payload\s+jsonb/);
    expect(migration).not.toContain("credit_card");
    expect(service).toContain('rpc("create_external_reservation_mapping"');
    expect(service).not.toContain("create_hotel_reservation");
    expect(service).not.toContain("cancel_hotel_reservation");
  });

  it("preserves booking id and channel text", () => {
    const identity = externalReservationIdentity({
      restaurantId: propertyA,
      provider: "Aiosell",
      hotelCode: "sandbox-pms",
      channel: "Goibibo",
      externalBookingId: "AbC123",
    });
    expect(identity.provider).toBe("aiosell");
    expect(identity.channel).toBe("Goibibo");
    expect(identity.externalBookingId).toBe("AbC123");
    expect(identity.hotelCode).toBe("sandbox-pms");
  });

  it("creates and finds a mapping", async () => {
    const { store, reservations } = memoryStore();
    reservations.set(reservationA, propertyA);
    const created = await createExternalReservationMapping(store, mappingInput());
    const found = await findExternalReservationMapping(store, mappingInput());
    expect(found?.id).toBe(created.id);
    expect(found?.reservationId).toBe(reservationA);
  });

  it("returns the existing row for the same identity and reservation", async () => {
    const { store, reservations, rows } = memoryStore();
    reservations.set(reservationA, propertyA);
    const first = await createExternalReservationMapping(
      store,
      mappingInput({ cmBookingId: "CM-1" }),
    );
    const second = await createExternalReservationMapping(
      store,
      mappingInput({ cmBookingId: "CM-2" }),
    );
    expect(second.id).toBe(first.id);
    expect(second.cmBookingId).toBe("CM-1");
    expect(rows).toHaveLength(1);
  });

  it("rejects the same identity pointed at another reservation", async () => {
    const { store, reservations, rows } = memoryStore();
    reservations.set(reservationA, propertyA);
    reservations.set(reservationB, propertyA);
    await createExternalReservationMapping(store, mappingInput());
    await expect(
      createExternalReservationMapping(store, mappingInput({ reservationId: reservationB })),
    ).rejects.toThrow("EXTERNAL_RESERVATION_CONFLICT");
    expect(rows).toHaveLength(1);
  });

  it("allows the same booking id at another property and on another channel", async () => {
    const { store, reservations } = memoryStore();
    reservations.set(reservationA, propertyA);
    reservations.set(reservationB, propertyB);
    const first = await createExternalReservationMapping(store, mappingInput());
    const otherProperty = await createExternalReservationMapping(
      store,
      mappingInput({ restaurantId: propertyB, reservationId: reservationB }),
    );
    const otherChannel = await createExternalReservationMapping(
      store,
      mappingInput({ channel: "gommt", reservationId: reservationA }),
    );
    expect(otherProperty.id).not.toBe(first.id);
    expect(otherChannel.id).not.toBe(first.id);
    expect(otherChannel.channel).toBe("gommt");
  });

  it("stores a null channel-manager booking id", async () => {
    const { store, reservations } = memoryStore();
    reservations.set(reservationA, propertyA);
    const created = await createExternalReservationMapping(store, mappingInput());
    expect(created.cmBookingId).toBeNull();
  });

  it("rejects a reservation that belongs to another property", async () => {
    const { store, reservations, rows } = memoryStore();
    reservations.set(reservationB, propertyB);
    await expect(
      createExternalReservationMapping(store, mappingInput({ reservationId: reservationB })),
    ).rejects.toThrow("EXTERNAL_RESERVATION_PROPERTY_MISMATCH");
    expect(rows).toHaveLength(0);
  });

  it("rejects a technical event that carries a body or secret field", () => {
    const row = toDistributionSyncEventInsert({
      restaurantId: propertyA,
      provider: "aiosell",
      direction: "inbound",
      channel: "booking.com",
      externalBookingId: "BDC5238846",
      operation: "book",
      status: "success",
      responseSuccess: true,
      responseMessage: "Reservation Updated Successfully",
    });
    expect(row).not.toHaveProperty("payload");
    expect(row.retry_eligible).toBe(false);
    expect(() =>
      toDistributionSyncEventInsert({
        restaurantId: propertyA,
        provider: "aiosell",
        direction: "inbound",
        operation: "book",
        status: "failed",
        payload: "raw-body",
      } as never),
    ).toThrow("DISTRIBUTION_SYNC_EVENT_FIELD_REJECTED");
  });
});
