import { describe, expect, it } from "vitest";

import { compareAiosellPropertyDetails } from "./aiosell-ari";
import {
  parseAiosellBook,
  parseAiosellCancel,
  parseAiosellModify,
  parseAiosellPropertyDetails,
} from "./aiosell-contract";
import { aiosellSandboxPropertyDetails } from "./aiosell-sandbox-property-details.fixture";
import { aiosellValidationMessage } from "./aiosell-workspace";

const room = {
  roomCode: "suite",
  rateplanCode: "suite-d-cp",
  guestName: "Test Guest",
  occupancy: { adults: 2, children: 2 },
  prices: [
    { date: "2026-09-18", sellRate: 6961.14 },
    { date: "2026-09-19", sellRate: 6961.14 },
  ],
};

function book(overrides: Record<string, unknown> = {}) {
  return {
    action: "book",
    hotelCode: "sandbox-pms",
    channel: "booking.com",
    bookingId: "BDC5238846",
    cmBookingId: "CM-BDC5238846",
    bookedOn: "2026-09-11 11:01:50",
    checkin: "2026-09-18",
    checkout: "2026-09-20",
    segment: "OTA",
    specialRequests: "",
    pah: false,
    amount: {
      amountAfterTax: 13922.28,
      amountBeforeTax: 13922.28,
      tax: 0,
      currency: "INR",
      commission: null,
      tcs: null,
      tds: null,
    },
    guest: {
      firstName: "Test",
      lastName: "Guest",
      email: "testguest@example.com",
      phone: "9876543210",
      address: {
        line1: "1 Test Street",
        city: "Bangalore",
        state: "Karnataka",
        country: "India",
        zipCode: "560001",
      },
    },
    rooms: [room],
    ...overrides,
  };
}

describe("AIOS-02 Aiosell reservation contract", () => {
  it("accepts a valid book payload and keeps Aiosell date strings", () => {
    const parsed = parseAiosellBook(book());
    expect(parsed.action).toBe("book");
    expect(parsed.bookingId).toBe("BDC5238846");
    expect(parsed.channel).toBe("booking.com");
    expect(parsed.checkin).toBe("2026-09-18");
    expect(parsed.bookedOn).toBe("2026-09-11 11:01:50");
    expect(parsed.rooms[0]?.prices[0]?.sellRate).toBe(6961.14);
  });

  it("accepts a book with the guest block absent", () => {
    const payload = book();
    delete payload.guest;
    expect(parseAiosellBook(payload).guest).toBeUndefined();
  });

  it("accepts null guest fields", () => {
    const parsed = parseAiosellBook(
      book({
        guest: {
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          address: { line1: null, city: null, state: null, country: null, zipCode: null },
        },
      }),
    );
    expect(parsed.guest?.firstName).toBeNull();
    expect(parsed.guest?.address?.city).toBeNull();
  });

  it("accepts empty guest fields", () => {
    const parsed = parseAiosellBook(
      book({
        guest: { firstName: "", lastName: "", email: "", phone: "", address: { line1: "" } },
      }),
    );
    expect(parsed.guest?.email).toBe("");
  });

  it("accepts a missing cmBookingId", () => {
    const payload = book();
    delete payload.cmBookingId;
    expect(parseAiosellBook(payload).cmBookingId).toBeUndefined();
  });

  it("accepts a missing specialRequests value", () => {
    const payload = book();
    delete payload.specialRequests;
    expect(parseAiosellBook(payload).specialRequests).toBeUndefined();
  });

  it("accepts a multi-room book", () => {
    const parsed = parseAiosellBook(
      book({
        rooms: [room, { ...room, roomCode: "executive", rateplanCode: "executive-s-ep" }],
      }),
    );
    expect(parsed.rooms).toHaveLength(2);
  });

  it("accepts a room without guestName", () => {
    const { guestName: _guestName, ...withoutName } = room;
    const parsed = parseAiosellBook(book({ rooms: [withoutName] }));
    expect(parsed.rooms[0]?.guestName).toBeUndefined();
  });

  it("accepts the minimal cancel payload", () => {
    const parsed = parseAiosellCancel({
      action: "cancel",
      hotelCode: "sandbox-pms",
      channel: "Goibibo",
      bookingId: "111222333",
    });
    expect(parsed).toEqual({
      action: "cancel",
      hotelCode: "sandbox-pms",
      channel: "Goibibo",
      bookingId: "111222333",
    });
  });

  it("parses modify as the full booking state", () => {
    const parsed = parseAiosellModify(
      book({
        action: "modify",
        channel: "Goibibo",
        bookingId: "111222333",
      }),
    );
    expect(parsed.action).toBe("modify");
    expect(parsed.rooms).toHaveLength(1);
    expect(parsed.amount.amountAfterTax).toBe(13922.28);
    expect(() => parseAiosellModify({ action: "modify", bookingId: "111222333" })).toThrow();
  });

  it("rejects a book without bookingId, hotelCode, or channel", () => {
    const withoutBooking = book();
    delete withoutBooking.bookingId;
    const withoutHotel = book();
    delete withoutHotel.hotelCode;
    const withoutChannel = book();
    delete withoutChannel.channel;
    expect(() => parseAiosellBook(withoutBooking)).toThrow();
    expect(() => parseAiosellBook(withoutHotel)).toThrow();
    expect(() => parseAiosellBook(withoutChannel)).toThrow();
  });

  it("rejects a room without roomCode or rateplanCode", () => {
    const { roomCode: _roomCode, ...withoutRoom } = room;
    const { rateplanCode: _rateplanCode, ...withoutPlan } = room;
    expect(() => parseAiosellBook(book({ rooms: [withoutRoom] }))).toThrow();
    expect(() => parseAiosellBook(book({ rooms: [withoutPlan] }))).toThrow();
  });

  it("drops an unsupported card object and does not return it", () => {
    const parsed = parseAiosellBook(
      book({ creditCard: { cardNumber: "unsupported", cvv: "unsupported" } }),
    );
    expect(parsed).not.toHaveProperty("creditCard");
    expect(JSON.stringify(parsed)).not.toContain("unsupported");
  });
});

describe("Aiosell sandbox property details", () => {
  it("parses the observed sandbox body, including null operations and duplicate channels", () => {
    const parsed = parseAiosellPropertyDetails(aiosellSandboxPropertyDetails);
    expect(parsed.hotel_id).toBe("sandbox-pms");
    expect(parsed.currency).toBe("INR");
    expect(parsed.timezone).toBe("Asia/Dhaka");
    expect(parsed.address?.location?.long).toBe("12.917836347560788");
    expect(parsed.address?.location?.latt).toBe("77.6750138517398");
    expect(parsed.contact).toEqual({ phone: "", email: "", website: "" });
    expect(parsed.tax_id).toBe("");
    expect(parsed.connected_channels).toHaveLength(2);
    expect(parsed.connected_channels.every((row) => row.operation === null)).toBe(true);
    expect(parsed.rooms.map((room) => room.room_id)).toEqual(["executive", "suite"]);
    expect(parsed.rooms.flatMap((room) => room.rateplans.map((plan) => plan.rateplan_id))).toEqual([
      "executive-s-ep",
      "executive-d-ep",
      "executive-s-cp",
      "executive-d-cp",
      "suite-s-ep",
      "suite-d-ep",
      "suite-s-cp",
      "suite-d-cp",
    ]);
  });

  it("rejects a missing hotel id, room id, or rate-plan id", () => {
    const { hotel_id: _hotelId, ...withoutHotel } = aiosellSandboxPropertyDetails;
    expect(() => parseAiosellPropertyDetails(withoutHotel)).toThrow();
    expect(() =>
      parseAiosellPropertyDetails({ ...aiosellSandboxPropertyDetails, hotel_id: "" }),
    ).toThrow();
    const missingRoom = structuredClone(aiosellSandboxPropertyDetails);
    missingRoom.rooms[0].room_id = "";
    expect(() => parseAiosellPropertyDetails(missingRoom)).toThrow();
    const missingPlan = structuredClone(aiosellSandboxPropertyDetails);
    missingPlan.rooms[0].rateplans[0].rateplan_id = "";
    expect(() => parseAiosellPropertyDetails(missingPlan)).toThrow();
  });

  it("keeps hotel, currency, and timezone mismatches out of response-invalid", () => {
    const parsed = parseAiosellPropertyDetails(aiosellSandboxPropertyDetails);
    const hotel = compareAiosellPropertyDetails({
      configuredHotelCode: "other-hotel",
      details: parsed,
      propertyCurrency: "INR",
      propertyTimezone: "Asia/Dhaka",
    });
    expect(hotel.hotelCodeMatch).toBe(false);
    expect(hotel.pushBlocked).toBe(true);
    expect(aiosellValidationMessage({ ready: false, error: null, reasons: hotel.reasons })).toBe(
      "Aiosell hotel_id does not match the configured hotelCode.",
    );
    const currency = compareAiosellPropertyDetails({
      configuredHotelCode: "sandbox-pms",
      details: parsed,
      propertyCurrency: "USD",
      propertyTimezone: "Asia/Dhaka",
    });
    expect(currency.currencyCompatible).toBe(false);
    expect(currency.timezoneCompatible).toBe(true);
    expect(aiosellValidationMessage({ ready: false, error: null, reasons: currency.reasons })).toBe(
      "Aiosell property currency does not match the NORU property currency.",
    );
    expect(currency.reasons.join(" ")).not.toContain("AIOSELL_RESPONSE_INVALID");
    const timezone = compareAiosellPropertyDetails({
      configuredHotelCode: "sandbox-pms",
      details: parsed,
      propertyCurrency: "INR",
      propertyTimezone: "Europe/London",
    });
    expect(timezone.timezoneCompatible).toBe(false);
    expect(timezone.currencyCompatible).toBe(true);
    expect(aiosellValidationMessage({ ready: false, error: null, reasons: timezone.reasons })).toBe(
      "Aiosell property timezone does not match the NORU property timezone.",
    );
    expect(timezone.reasons.join(" ")).not.toContain("AIOSELL_RESPONSE_INVALID");
  });
});
