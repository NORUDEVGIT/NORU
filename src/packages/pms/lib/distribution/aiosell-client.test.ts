import { describe, expect, it } from "vitest";

import { createAiosellClient, resolveAiosellBasicAuth, runAiosellOutbound } from "./aiosell-client";
import type { AiosellTransportRequest } from "./aiosell-client";
import { aiosellSandboxPropertyDetails } from "./aiosell-sandbox-property-details.fixture";

const username = "dummy-user";
const password = "dummy-password";

function client(
  transport: (request: AiosellTransportRequest) => Promise<{ status: number; body: string }>,
) {
  return createAiosellClient({ partnerSlug: "partner-east", username, password, transport });
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

describe("AIOS-04 Aiosell HTTP client", () => {
  it("builds the documented paths and Basic Auth header", async () => {
    const seen: AiosellTransportRequest[] = [];
    const api = client(async (request) => {
      seen.push(request);
      if (request.method === "GET") {
        return {
          status: 200,
          body: JSON.stringify({
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
            connected_channels: [
              { operation: "inventory", partner_id: "booking.com", hotel_code: "452981" },
            ],
          }),
        };
      }
      return {
        status: 200,
        body: JSON.stringify({ success: true, message: "Inventory Updated Successfully" }),
      };
    });
    const details = await api.getPropertyDetails("Hotel-East");
    expect(details.ok).toBe(true);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.url).toBe(
      "https://live.aiosell.com/api/v2/cm/property_details/Hotel-East?partnerId=partner-east",
    );
    expect(seen[0]?.headers.Authorization).toBe(authorization);
    if (details.ok) {
      expect(details.data.rooms[0]?.room_id).toBe("executive");
      expect(details.data.connected_channels[0]?.partner_id).toBe("booking.com");
    }
    const pushed = await api.pushInventory({
      hotelCode: "Hotel-East",
      updates: [
        {
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          rooms: [{ roomCode: "executive", available: 4 }],
        },
      ],
    });
    expect(pushed.ok).toBe(true);
    expect(seen[1]?.method).toBe("POST");
    expect(seen[1]?.url).toBe("https://live.aiosell.com/api/v2/cm/update/partner-east");
    expect(seen[1]?.headers["Content-Type"]).toBe("application/json");
    expect(seen[1]?.body).toContain('"roomCode":"executive"');
    const rates = await api.pushRates({
      hotelCode: "Hotel-East",
      updates: [
        {
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          rates: [{ roomCode: "executive", rateplanCode: "executive-s-ep", rate: 100 }],
        },
      ],
    });
    expect(rates.ok).toBe(true);
    expect(seen[2]?.url).toBe("https://live.aiosell.com/api/v2/cm/update-rates/partner-east");
    const fetched = await api.fetchInventory({
      type: "inventory",
      hotelCode: "Hotel-East",
      startDate: "2026-10-20",
      endDate: "2026-10-20",
    });
    expect(seen[3]?.url).toBe("https://live.aiosell.com/api/v2/cm/data/partner-east");
    expect(seen[3]?.body).toContain('"type":"inventory"');
    expect(fetched.ok).toBe(false);
  });

  it("surfaces rejection, HTTP failure, malformed JSON, and timeout without secrets", async () => {
    const rejected = await client(async () => ({
      status: 200,
      body: JSON.stringify({ success: false, message: `rejected ${password}` }),
    })).pushInventory({
      hotelCode: "Hotel-East",
      updates: [
        {
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          rooms: [{ roomCode: "executive", available: 1 }],
        },
      ],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.code).toBe("AIOSELL_REJECTED");
      expect(rejected.message).not.toContain(password);
    }
    const http = await client(async () => ({ status: 500, body: "upstream failed" })).pushRates({
      hotelCode: "Hotel-East",
      updates: [
        {
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          rates: [{ roomCode: "executive", rateplanCode: "executive-s-ep", rate: 1 }],
        },
      ],
    });
    expect(http.ok).toBe(false);
    if (!http.ok) {
      expect(http.code).toBe("AIOSELL_HTTP_ERROR");
      expect(http.message).toBe("AIOSELL_HTTP_ERROR");
      expect(http.message).not.toContain("upstream failed");
    }
    const malformed = await client(async () => ({
      status: 200,
      body: "not-json",
    })).getPropertyDetails("Hotel-East");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.code).toBe("AIOSELL_RESPONSE_INVALID");
    const timeout = await client(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    }).getPropertyDetails("Hotel-East");
    expect(timeout.ok).toBe(false);
    if (!timeout.ok) {
      expect(timeout.code).toBe("AIOSELL_TIMEOUT");
      expect(timeout.message).not.toContain(password);
      expect(timeout.message).not.toContain(authorization);
    }
  });

  it("records one failed attempt and does not call the transport again", async () => {
    let calls = 0;
    const events: unknown[] = [];
    const result = await runAiosellOutbound({
      restaurantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      operation: "inventory_push",
      secrets: { username, password },
      call: async () => {
        calls += 1;
        return {
          ok: false as const,
          code: "AIOSELL_REJECTED",
          message: `no ${password}`,
          httpStatus: 200,
        };
      },
      record: (event) => {
        events.push(event);
      },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(events).toHaveLength(1);
    const encoded = JSON.stringify(events[0]);
    expect(encoded).not.toContain(password);
    expect(encoded).not.toContain(username);
    expect(encoded).not.toContain(authorization);
    expect(encoded).toContain('"retry_eligible":false');
    expect(encoded).toContain('"attempt_count":1');
    expect(resolveAiosellBasicAuth({})).toEqual({ error: "AIOSELL_CREDENTIALS_MISSING" });
  });

  it("parses the sandbox property-details body and does not store a raw error body", async () => {
    const details = await client(async () => ({
      status: 200,
      body: JSON.stringify(aiosellSandboxPropertyDetails),
    })).getPropertyDetails("sandbox-pms");
    expect(details.ok).toBe(true);
    if (details.ok) {
      expect(details.data.hotel_id).toBe("sandbox-pms");
      expect(details.data.currency).toBe("INR");
      expect(details.data.timezone).toBe("Asia/Dhaka");
    }
    const raw = JSON.stringify({ success: false, message: "Authentication Required!" });
    const events: unknown[] = [];
    const failed = await runAiosellOutbound({
      restaurantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      operation: "property_details",
      secrets: { username, password },
      call: () =>
        client(async () => ({
          status: 401,
          body: raw,
        })).getPropertyDetails("sandbox-pms"),
      record: (event) => {
        events.push(event);
      },
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("AIOSELL_AUTH_FAILED");
    const stored = JSON.stringify(events);
    expect(stored).toContain("AIOSELL_AUTH_FAILED");
    expect(stored).not.toContain("Authentication Required");
    expect(stored).not.toContain(raw);
  });
});
