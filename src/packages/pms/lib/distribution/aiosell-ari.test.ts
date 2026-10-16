import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  aiosellOutboundSyncEvent,
  aiosellRestrictionObject,
  compareAiosellPropertyDetails,
  noruStayForAiosellRange,
  prepareAiosellInventoryPush,
  prepareAiosellInventoryRestrictions,
  prepareAiosellRatePush,
  prepareAiosellRateRestrictions,
  resolveNoruNightlyRate,
} from "./aiosell-ari";
import type { AiosellPropertyDetails } from "./aiosell-contract";

const roomTypeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const physicalRoomId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ratePlanId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function nights(values: number[], start = "2026-10-20") {
  return values.map((available, index) => {
    const date = new Date(Date.UTC(2026, 9, 20 + index)).toISOString().slice(0, 10);
    return { date: start === "2026-10-20" ? date : date, available };
  });
}

const details = {
  hotel_id: "Hotel-East",
  currency: "INR",
  timezone: "Asia/Kolkata",
  rooms: [
    {
      room_id: "executive",
      room_name: "EXECUTIVE",
      rateplans: [{ rateplan_id: "executive-s-ep", rateplan_name: "Room Only" }],
    },
  ],
  connected_channels: [{ operation: "rates", partner_id: "booking.com", hotel_code: "452981" }],
} as AiosellPropertyDetails;

describe("AIOS-04 Aiosell ARI translation", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-ari.ts"),
    "utf8",
  );
  const server = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-ari.server.ts"),
    "utf8",
  );

  it("keeps reservation import and FX out of the adapter", () => {
    expect(source).not.toContain("pms_exchange_rates");
    expect(source).not.toContain("upsertAiosellRoomMapping");
    expect(server).not.toContain("create_hotel_reservation");
    expect(server).not.toContain("update_reservation");
    expect(server).not.toContain("marknoshow");
    expect(server).not.toContain("channel_multiplier");
  });

  it("converts one inclusive Aiosell night into a NORU half-open stay", () => {
    expect(noruStayForAiosellRange("2026-10-20", "2026-10-20")).toEqual({
      arrival: "2026-10-20",
      departure: "2026-10-21",
    });
    const prepared = prepareAiosellInventoryPush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      rooms: [{ roomTypeId, nights: [{ date: "2026-10-20", available: 0 }] }],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
    });
    expect(prepared.payload?.updates).toEqual([
      {
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        rooms: [{ roomCode: "executive", available: 0 }],
      },
    ]);
    expect(JSON.stringify(prepared.payload)).not.toContain(roomTypeId);
    expect(JSON.stringify(prepared.payload)).not.toContain(physicalRoomId);
  });

  it("compresses equal inventory nights and splits changes", () => {
    const prepared = prepareAiosellInventoryPush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-24",
      rooms: [{ roomTypeId, nights: nights([4, 4, 2, 2, 4]) }],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
    });
    expect(prepared.payload?.updates).toEqual([
      {
        startDate: "2026-10-20",
        endDate: "2026-10-21",
        rooms: [{ roomCode: "executive", available: 4 }],
      },
      {
        startDate: "2026-10-22",
        endDate: "2026-10-23",
        rooms: [{ roomCode: "executive", available: 2 }],
      },
      {
        startDate: "2026-10-24",
        endDate: "2026-10-24",
        rooms: [{ roomCode: "executive", available: 4 }],
      },
    ]);
  });

  it("rejects a missing room mapping and a negative count", () => {
    const missing = prepareAiosellInventoryPush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      rooms: [{ roomTypeId, nights: [{ date: "2026-10-20", available: 1 }] }],
      roomMappings: [],
    });
    expect(missing.ready).toBe(false);
    expect(missing.errors[0]?.code).toBe("ROOM_MAPPING_MISSING");
    const negative = prepareAiosellInventoryPush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      rooms: [{ roomTypeId, nights: [{ date: "2026-10-20", available: -1 }] }],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
    });
    expect(negative.errors[0]?.code).toBe("AVAILABILITY_INVALID");
    expect(negative.payload).toBeNull();
  });

  it("uses the calendar rate when present and the base rate otherwise", () => {
    expect(resolveNoruNightlyRate({ date: "2026-10-20", baseRate: 100, calendar: [] })).toBe(100);
    expect(
      resolveNoruNightlyRate({
        date: "2026-10-20",
        baseRate: 100,
        calendar: [{ date: "2026-10-20", nightlyRate: 120 }],
      }),
    ).toBe(120);
    const prepared = prepareAiosellRatePush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-22",
      aiosellCurrency: "INR",
      propertyCurrency: "INR",
      plans: [
        {
          ratePlanId,
          roomTypeId,
          roomCode: "executive",
          rateplanCode: "executive-s-ep",
          baseRate: 100,
          currency: "INR",
        },
      ],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
      calendar: [{ ratePlanId, date: "2026-10-21", nightlyRate: 140 }],
    });
    expect(prepared.payload?.updates).toEqual([
      {
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        rates: [{ roomCode: "executive", rateplanCode: "executive-s-ep", rate: 100 }],
      },
      {
        startDate: "2026-10-21",
        endDate: "2026-10-21",
        rates: [{ roomCode: "executive", rateplanCode: "executive-s-ep", rate: 140 }],
      },
      {
        startDate: "2026-10-22",
        endDate: "2026-10-22",
        rates: [{ roomCode: "executive", rateplanCode: "executive-s-ep", rate: 100 }],
      },
    ]);
  });

  it("blocks a currency mismatch and a wrong room relationship", () => {
    const property = { currency: "INR" };
    const before = { ...property };
    const mismatch = prepareAiosellRatePush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      aiosellCurrency: "INR",
      propertyCurrency: "INR",
      plans: [
        {
          ratePlanId,
          roomTypeId,
          roomCode: "executive",
          rateplanCode: "executive-s-ep",
          baseRate: 100,
          currency: "EUR",
        },
      ],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
      calendar: [],
    });
    expect(mismatch.errors[0]?.code).toBe("AIOSELL_CURRENCY_MISMATCH");
    expect(mismatch.errors[0]?.message).toContain(ratePlanId);
    expect(mismatch.errors[0]?.message).toContain("EUR");
    expect(property).toEqual(before);
    const wrongRoom = prepareAiosellRatePush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      aiosellCurrency: "INR",
      propertyCurrency: "INR",
      plans: [
        {
          ratePlanId,
          roomTypeId,
          roomCode: "suite",
          rateplanCode: "executive-s-ep",
          baseRate: 100,
          currency: "INR",
        },
      ],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
      calendar: [],
    });
    expect(wrongRoom.errors[0]?.code).toBe("WRONG_ROOM_RATE_PLAN");
    const missingRate = prepareAiosellRatePush({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      aiosellCurrency: "INR",
      propertyCurrency: "INR",
      plans: [
        {
          ratePlanId,
          roomTypeId,
          roomCode: "executive",
          rateplanCode: "",
          baseRate: 100,
          currency: "INR",
        },
      ],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
      calendar: [],
    });
    expect(missingRate.errors[0]?.code).toBe("RATE_MAPPING_MISSING");
  });

  it("sends explicit nulls for unsupported restriction fields and skips room-only restrictions", () => {
    const restrictions = aiosellRestrictionObject({
      stopSell: true,
      minimumStay: 2,
      maximumStay: 4,
      closeOnArrival: true,
      closeOnDeparture: false,
    });
    const encoded = JSON.stringify(restrictions);
    expect(restrictions.stopSell).toBe(true);
    expect(restrictions.minimumStay).toBe(2);
    expect(restrictions.maximumStay).toBe(4);
    expect(restrictions.closeOnArrival).toBe(true);
    expect(restrictions.closeOnDeparture).toBe(false);
    expect(encoded).toContain('"minimumStayArrival":null');
    expect(encoded).toContain('"maximumStayArrival":null');
    expect(encoded).toContain('"exactStayArrival":null');
    expect(encoded).toContain('"minimumAdvanceReservation":null');
    expect(encoded).toContain('"maximumAdvanceReservation":null');
    const unset = JSON.stringify(aiosellRestrictionObject(null));
    expect(unset).toContain('"stopSell":null');
    expect(unset).toContain('"minimumStay":null');
    const prepared = prepareAiosellRateRestrictions({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      toChannels: ["aiosell.sandbox", "booking.com", "booking.com"],
      plans: [{ ratePlanId, roomTypeId, roomCode: "executive", rateplanCode: "executive-s-ep" }],
      roomMappings: [{ roomTypeId, roomCode: "executive" }],
      restrictions: [
        {
          ratePlanId,
          date: "2026-10-20",
          stopSell: true,
          minimumStay: 2,
          maximumStay: null,
          closeOnArrival: false,
          closeOnDeparture: false,
        },
      ],
    });
    expect(prepared.payload?.toChannels).toEqual(["booking.com"]);
    expect(prepared.payload?.updates[0]?.rates[0]?.roomCode).toBe("executive");
    expect(prepared.payload?.updates[0]?.rates[0]?.rateplanCode).toBe("executive-s-ep");
    expect(JSON.stringify(prepared.payload)).not.toContain("aiosell.sandbox");
    const noChannel = prepareAiosellRateRestrictions({
      environment: "sandbox",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      toChannels: ["aiosell.sandbox"],
      plans: [],
      roomMappings: [],
      restrictions: [],
    });
    expect(noChannel.errors[0]?.code).toBe("AIOSELL_CHANNELS_REQUIRED");
    expect(prepareAiosellInventoryRestrictions().errors[0]?.code).toBe(
      "NO_ROOM_LEVEL_RESTRICTION_SOURCE",
    );
  });

  it("blocks a property details mismatch and does not describe a mapping write", () => {
    const match = compareAiosellPropertyDetails({
      configuredHotelCode: "Hotel-East",
      details,
      propertyCurrency: "INR",
      propertyTimezone: "Asia/Kolkata",
    });
    expect(match.pushBlocked).toBe(false);
    expect(details.rooms[0]?.room_id).toBe("executive");
    expect(details.connected_channels[0]?.partner_id).toBe("booking.com");
    const blocked = compareAiosellPropertyDetails({
      configuredHotelCode: "Other-Hotel",
      details,
      propertyCurrency: "USD",
      propertyTimezone: "Europe/London",
    });
    expect(blocked.hotelCodeMatch).toBe(false);
    expect(blocked.currencyCompatible).toBe(false);
    expect(blocked.timezoneCompatible).toBe(false);
    expect(blocked.pushBlocked).toBe(true);
  });

  it("records one outbound event without a retry", () => {
    const event = aiosellOutboundSyncEvent({
      restaurantId: roomTypeId,
      operation: "inventory_push",
      success: false,
      responseMessage: "Inventory failed",
    });
    expect(event.direction).toBe("outbound");
    expect(event.attempt_count).toBe(1);
    expect(event.retry_eligible).toBe(false);
    expect(event.response_message).toBe("Inventory failed");
    expect(event).not.toHaveProperty("payload");
  });
});
