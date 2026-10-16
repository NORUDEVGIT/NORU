import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  upsertAiosellConnection,
  upsertAiosellRateMapping,
  upsertAiosellRoomMapping,
} from "./aiosell-connection";
import type { AiosellConnectionState } from "./aiosell-connection";
import {
  AIOSELL_STALE_FETCH_WARNING,
  aiosellRateMappingError,
  aiosellReconcileDisplay,
  aiosellValidationMessage,
  aiosellWebhookReadiness,
  aiosellWorkspaceView,
  type AiosellWorkspaceInput,
} from "./aiosell-workspace";

const roomTypeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ratePlanId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const password = "dummy-password";

function input(overrides: Partial<AiosellWorkspaceInput> = {}): AiosellWorkspaceInput {
  return {
    environment: "sandbox",
    connection: {
      partnerSlug: "partner-east",
      hotelCode: "Hotel-East",
      status: "pending",
      enabled: true,
      lastValidatedAt: "2026-10-14T12:00:00.000Z",
      lastError: null,
    },
    credentialsConfigured: true,
    currencyCompatible: true,
    timezoneCompatible: true,
    roomTypes: [{ id: roomTypeId, name: "Executive", code: "EXE" }],
    roomMappings: [{ roomTypeId, roomCode: "executive", active: true }],
    ratePlans: [{ id: ratePlanId, name: "Room Only", roomTypeId, roomTypeName: "Executive" }],
    rateMappings: [
      { ratePlanId, roomCode: "executive", rateplanCode: "bar", active: true, error: null },
    ],
    channels: [{ code: "booking.com", operations: ["reservation"], enabled: true }],
    events: [
      {
        operation: "property_details",
        direction: "outbound",
        status: "success",
        channel: null,
        bookingId: null,
        message: "ok",
        createdAt: "2026-10-14T12:00:00.000Z",
      },
    ],
    publicBaseUrl: "https://hotel.example",
    ...overrides,
  };
}

describe("AIOS-07 Aiosell operator workspace", () => {
  it("shows connection metadata and credential state without secret values", () => {
    const ready = aiosellWorkspaceView(input());
    expect(ready.provider).toBe("Aiosell");
    expect(ready.partnerSlug).toBe("partner-east");
    expect(ready.hotelCode).toBe("Hotel-East");
    expect(ready.credentialStatus).toBe("configured");
    expect(ready.readiness.level).toBe("ready");
    const missing = aiosellWorkspaceView(input({ credentialsConfigured: false }));
    expect(missing.credentialStatus).toBe("missing");
    expect(missing.readiness.level).toBe("not_ready");
    expect(JSON.stringify(missing)).not.toContain(password);
    expect(JSON.stringify(missing)).not.toContain("AIOSELL_BASIC_AUTH");
  });

  it("reports validation as a safe code and withholds unsafe sync text", () => {
    expect(
      aiosellValidationMessage({
        ready: true,
        error: null,
        reasons: [],
      }),
    ).toBeNull();
    expect(
      aiosellValidationMessage({
        ready: false,
        error: "AIOSELL_CREDENTIALS_MISSING",
        reasons: [],
      }),
    ).toBe("AIOSELL_CREDENTIALS_MISSING");
    const view = aiosellWorkspaceView(
      input({
        events: [
          {
            operation: "book",
            direction: "inbound",
            status: "failed",
            channel: "booking.com",
            bookingId: "Book-1",
            message: `guest amina@example.test card 4111111111111111 ${password}`,
            createdAt: "2026-10-14T12:01:00.000Z",
          },
        ],
      }),
    );
    const published = JSON.stringify(view.sync);
    expect(published).not.toContain("amina@example.test");
    expect(published).not.toContain("4111111111111111");
    expect(published).not.toContain(password);
    expect(published).toContain("withheld");
  });

  it("withholds a historical raw provider body and keeps a currency mismatch unready", () => {
    const raw = '{"success":false,"message":"Authentication Required!"}';
    const view = aiosellWorkspaceView(
      input({
        currencyCompatible: false,
        timezoneCompatible: true,
        connection: {
          partnerSlug: "partner-east",
          hotelCode: "Hotel-East",
          status: "pending",
          enabled: true,
          lastValidatedAt: "2026-10-14T12:00:00.000Z",
          lastError: raw,
        },
        events: [
          {
            operation: "property_details",
            direction: "outbound",
            status: "failed",
            channel: null,
            bookingId: null,
            message: raw,
            createdAt: "2026-10-14T12:02:00.000Z",
          },
        ],
      }),
    );
    const published = JSON.stringify(view);
    expect(published).not.toContain("Authentication Required");
    expect(published).not.toContain(raw);
    expect(published).toContain("withheld");
    expect(view.readiness.level).toBe("not_ready");
    expect(view.readiness.reasons).toContain("Currency does not match the property.");
    expect(
      aiosellValidationMessage({
        ready: false,
        error: null,
        reasons: ["Aiosell property currency does not match the NORU property currency."],
      }),
    ).not.toBe("AIOSELL_RESPONSE_INVALID");
  });

  it("rejects a rate mapped to another room and a room from another property", () => {
    expect(aiosellRateMappingError({ roomCode: "deluxe", mappedRoomCode: "executive" })).toBe(
      "WRONG_ROOM_RATE_PLAN",
    );
    const state: AiosellConnectionState = {
      connections: [],
      channels: [],
      roomMappings: [],
      rateMappings: [],
    };
    upsertAiosellConnection(state, {
      restaurantId: "property-east",
      provider: "aiosell",
      environment: "sandbox",
      partnerSlug: "partner-east",
      hotelCode: "Hotel-East",
    });
    upsertAiosellRoomMapping(
      state,
      {
        roomTypes: [{ id: roomTypeId, restaurantId: "property-east" }],
        physicalRooms: [],
        ratePlans: [],
      },
      {
        restaurantId: "property-east",
        environment: "sandbox",
        roomTypeId,
        roomCode: "executive",
      },
    );
    upsertAiosellRoomMapping(
      state,
      {
        roomTypes: [{ id: roomTypeId, restaurantId: "property-east" }],
        physicalRooms: [],
        ratePlans: [],
      },
      {
        restaurantId: "property-east",
        environment: "sandbox",
        roomTypeId,
        roomCode: "executive-2",
      },
    );
    expect(state.roomMappings[0]?.roomCode).toBe("executive-2");
    expect(() =>
      upsertAiosellRoomMapping(
        state,
        {
          roomTypes: [{ id: roomTypeId, restaurantId: "property-west" }],
          physicalRooms: [],
          ratePlans: [],
        },
        {
          restaurantId: "property-east",
          environment: "sandbox",
          roomTypeId,
          roomCode: "other",
        },
      ),
    ).toThrow("CROSS_PROPERTY_ROOM");
    expect(() =>
      upsertAiosellRateMapping(
        state,
        {
          roomTypes: [],
          physicalRooms: [],
          ratePlans: [
            {
              id: ratePlanId,
              restaurantId: "property-east",
              roomTypeId,
              currency: "INR",
            },
          ],
        },
        {
          restaurantId: "property-east",
          environment: "sandbox",
          ratePlanId,
          roomCode: "deluxe",
          rateplanCode: "bar",
        },
      ),
    ).toThrow("WRONG_ROOM_RATE_PLAN");
  });

  it("keeps reconciliation counts and withholds guest fields", () => {
    const display = aiosellReconcileDisplay({
      totals: {
        fetched: 2,
        created: 1,
        modified: 0,
        cancelled: 0,
        unchanged: 1,
        conflicts: 0,
        failed: 0,
      },
      runError: null,
      results: [{ bookingId: "Book-1", channel: "booking.com", code: "created" }],
    });
    expect(display.totals.created).toBe(1);
    expect(display.totals.unchanged).toBe(1);
    expect(JSON.stringify(display)).not.toContain("guest");
    expect(JSON.stringify(display)).not.toContain("amina@example.test");
  });

  it("fails readiness without mappings and passes when the required state is present", () => {
    const missing = aiosellWorkspaceView(input({ roomMappings: [], rateMappings: [] }));
    expect(missing.readiness.level).toBe("not_ready");
    expect(missing.readiness.reasons.join(" ")).toContain("room mapping");
    const ready = aiosellWorkspaceView(input());
    expect(ready.readiness.level).toBe("ready");
    expect(ready.channels.map((channel) => channel.code)).toEqual(["booking.com"]);
    expect(ready.productionActivation.allowed).toBe(false);
    expect(missing.productionActivation.allowed).toBe(false);
    expect(missing.productionActivation.message).toContain("cannot be activated");
  });

  it("shows the stale-fetch warning and incomplete webhook readiness", () => {
    const view = aiosellWorkspaceView(input({ publicBaseUrl: null }));
    expect(view.staleFetchWarning).toBe(AIOSELL_STALE_FETCH_WARNING);
    expect(aiosellWebhookReadiness(null)).toEqual({ ready: false, url: null });
    expect(view.webhook.ready).toBe(false);
    expect(aiosellWebhookReadiness("https://hotel.example").url).toBe(
      "https://hotel.example/api/pms/distribution/aiosell/reservations",
    );
  });

  it("clears a stale validation error after a newer success and keeps the history", () => {
    const raw = '{"success":false,"message":"Authentication Required!"}';
    const succeeded = aiosellWorkspaceView(
      input({
        events: [
          {
            operation: "property_details",
            direction: "outbound",
            status: "success",
            channel: null,
            bookingId: null,
            message: "ok",
            createdAt: "2026-10-15T08:14:21.777Z",
          },
          {
            operation: "property_details",
            direction: "outbound",
            status: "failed",
            channel: null,
            bookingId: null,
            message: "Aiosell response did not match the contract.",
            createdAt: "2026-10-15T08:10:00.000Z",
          },
          {
            operation: "property_details",
            direction: "outbound",
            status: "failed",
            channel: null,
            bookingId: null,
            message: raw,
            createdAt: "2026-10-15T08:00:00.000Z",
          },
        ],
      }),
    );
    expect(succeeded.sync.lastValidation?.createdAt).toBe("2026-10-15T08:14:21.777Z");
    expect(succeeded.sync.lastValidation?.status).toBe("success");
    expect(succeeded.sync.latestError).toBeNull();
    expect(succeeded.sync.recent.map((event) => event.status)).toEqual([
      "success",
      "failed",
      "failed",
    ]);
    expect(succeeded.sync.recent.map((event) => event.message)).toEqual([
      "ok",
      "Aiosell response did not match the contract.",
      "withheld",
    ]);
    expect(JSON.stringify(succeeded.sync.recent)).not.toContain("Authentication Required");

    const failedAgain = aiosellWorkspaceView(
      input({
        events: [
          {
            operation: "property_details",
            direction: "outbound",
            status: "failed",
            channel: null,
            bookingId: null,
            message: "AIOSELL_RESPONSE_INVALID",
            createdAt: "2026-10-15T08:20:00.000Z",
          },
          {
            operation: "property_details",
            direction: "outbound",
            status: "success",
            channel: null,
            bookingId: null,
            message: "ok",
            createdAt: "2026-10-15T08:14:21.777Z",
          },
        ],
      }),
    );
    expect(failedAgain.sync.latestError?.message).toBe("AIOSELL_RESPONSE_INVALID");
    expect(failedAgain.sync.recent).toHaveLength(2);

    const laterOperation = aiosellWorkspaceView(
      input({
        events: [
          {
            operation: "inventory_push",
            direction: "outbound",
            status: "failed",
            channel: null,
            bookingId: null,
            message: "AIOSELL_HTTP_ERROR",
            createdAt: "2026-10-15T08:30:00.000Z",
          },
          {
            operation: "property_details",
            direction: "outbound",
            status: "success",
            channel: null,
            bookingId: null,
            message: "ok",
            createdAt: "2026-10-15T08:14:21.777Z",
          },
        ],
      }),
    );
    expect(laterOperation.sync.latestError?.operation).toBe("inventory_push");
    expect(laterOperation.sync.latestError?.message).toBe("AIOSELL_HTTP_ERROR");
    expect(laterOperation.sync.lastValidation?.status).toBe("success");
  });

  it("keeps authorization, secrets, and the local no-show command out of the operator surface", () => {
    const functions = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/aiosell-workspace.functions.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(process.cwd(), "src/packages/pms/components/workspaces/aiosell-workspace-panel.tsx"),
      "utf8",
    );
    const frontOffice = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/fo-cancel-noshow.functions.ts"),
      "utf8",
    );
    const nav = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/pms-module-nav.ts"),
      "utf8",
    );
    expect(functions.match(/requireDistributionManager/g)?.length).toBeGreaterThanOrEqual(7);
    expect(functions).not.toContain("details:");
    expect(panel).toContain("AIOSELL_STALE_FETCH_WARNING");
    expect(panel).not.toContain('type="password"');
    expect(panel).not.toContain("mark_hotel_reservation_no_show");
    expect(panel).not.toContain("notifyAiosellReservationNoShow");
    expect(frontOffice).not.toContain("notifyAiosell");
    expect(nav).toContain("Exactly ten destinations");
  });
});
