import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveBookingSourceOptions } from "./create-reservation-phase1";
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution";
import { overviewChannelLabel } from "./reservation-detail-overview";
import {
  commercialSalesChannelDisplay,
  reservationChannelCreateValue,
  reservationCreateChannelForm,
  reservationCreateEnvironment,
  reservationSourceChannelDecision,
  reservationSourcePickOptions,
  selectReservationOtaChannels,
  type ReservationChannelRow,
  type ReservationCreateChannel,
  type ReservationSourceOption,
} from "./reservation-source-channel";

const property = "8e56bce2-dbd1-479c-a459-bc261bd6c17d";
const otherProperty = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const integrationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11";
const bookingId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function channel(overrides: Partial<ReservationChannelRow> = {}): ReservationChannelRow {
  return {
    id: bookingId,
    restaurantId: property,
    code: "booking.com",
    name: "Booking.com",
    channelType: "ota",
    status: "active",
    environment: "sandbox",
    integrationId,
    ...overrides,
  };
}

const sources: PmsSet6CatalogueItem[] = [
  {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    code: "OTA",
    name: "OTA",
    description: "",
    active: true,
  },
  {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    code: "BOOKING",
    name: "Booking.com",
    description: "",
    active: true,
  },
  {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    code: "DIRECT",
    name: "Direct",
    description: "",
    active: true,
  },
];

function listed() {
  return selectReservationOtaChannels({
    restaurantId: property,
    environment: "sandbox",
    enabledIntegrationIds: [integrationId],
    channels: [
      channel(),
      channel({
        id: "11111111-1111-1111-1111-111111111111",
        code: "aiosell.sandbox",
        name: "Aiosell sandbox",
        channelType: "direct",
      }),
      channel({
        id: "22222222-2222-2222-2222-222222222222",
        code: "aiosell.production",
        name: "Aiosell production",
        channelType: "ota",
        environment: "production",
      }),
      channel({
        id: "33333333-3333-3333-3333-333333333333",
        code: "expedia",
        name: "Expedia",
        status: "inactive",
      }),
      channel({
        id: "44444444-4444-4444-4444-444444444444",
        code: "direct",
        name: "Direct booking",
        channelType: "direct",
      }),
      channel({
        id: "55555555-5555-5555-5555-555555555555",
        restaurantId: otherProperty,
        code: "booking.com",
        name: "Booking.com",
      }),
      channel({
        id: "66666666-6666-6666-6666-666666666666",
        code: "agoda",
        name: "Agoda",
        integrationId: null,
      }),
    ],
  });
}

describe("reservation source and channel read", () => {
  it("returns the active Booking.com OTA channel and hides anchors and other properties", () => {
    const rows = listed();
    expect(rows).toEqual([
      {
        id: bookingId,
        code: "booking.com",
        name: "Booking.com",
        channelType: "ota",
        integrationId,
      },
    ]);
    expect(rows.map((row) => row.code)).not.toContain("aiosell.sandbox");
    expect(JSON.stringify(rows)).not.toMatch(/password|secret|credential|config/i);
  });

  it("drops credential fields that arrive on a channel row", () => {
    const rows = selectReservationOtaChannels({
      restaurantId: property,
      environment: "sandbox",
      enabledIntegrationIds: [integrationId],
      channels: [
        {
          ...channel(),
          notes: "api-secret",
          config: { password: "hidden" },
        } as ReservationChannelRow,
      ],
    });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "channelType",
      "code",
      "id",
      "integrationId",
      "name",
    ]);
    expect(JSON.stringify(rows)).not.toContain("api-secret");
    expect(JSON.stringify(rows)).not.toContain("hidden");
  });

  it("keeps source options independent of distribution channels", () => {
    const picks = reservationSourcePickOptions(sources);
    expect(picks.map((row) => row.label)).toEqual(["OTA", "Booking.com", "Direct"]);
    expect(picks).toEqual(resolveBookingSourceOptions(sources));
    expect(picks.map((row) => row.value)).not.toContain(bookingId);
    const withChannels = reservationSourcePickOptions(sources);
    expect(withChannels).toEqual(picks);
  });

  it("requires an OTA channel only when the source category is OTA", () => {
    const channels = listed();
    const ota = sources[0];
    const brand = sources[1];
    expect(ota && brand).toBeTruthy();
    expect(
      reservationSourceChannelDecision({
        source: { code: ota!.code, name: ota!.name },
        channelId: null,
        channels,
      }).code,
    ).toBe("OTA_CHANNEL_REQUIRED");
    expect(
      reservationSourceChannelDecision({
        source: { code: ota!.code, name: ota!.name },
        channelId: bookingId,
        channels,
      }),
    ).toMatchObject({ accepted: true, otaChannelRequired: true });
    expect(
      reservationSourceChannelDecision({
        source: { code: ota!.code, name: ota!.name },
        channelId: "99999999-9999-9999-9999-999999999999",
        channels,
      }).code,
    ).toBe("OTA_CHANNEL_UNKNOWN");
    expect(
      reservationSourceChannelDecision({
        source: { code: brand!.code, name: brand!.name },
        channelId: null,
        channels,
      }),
    ).toEqual({ otaChannelRequired: false, accepted: true, code: "ok" });
    expect(reservationChannelCreateValue(channels[0]!)).toBe(bookingId);
    expect(bookingId.length).toBeLessThanOrEqual(40);
  });

  it("leaves the Aiosell inbound reservation path unchanged", () => {
    const inbound = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/distribution/aiosell-reservation.server.ts"),
      "utf8",
    );
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0164_external_reservation_ingest.sql"),
      "utf8",
    );
    const contract = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/reservation-source-channel.ts"),
      "utf8",
    );
    expect(inbound).not.toContain("reservation-source-channel");
    expect(sql).toContain("'future_online'");
    expect(contract).not.toContain("receiveAiosellReservation");
    expect(contract).not.toContain("apply_external_reservation_event");
  });
});

describe("reservation create source and channel form", () => {
  const ota: ReservationSourceOption = {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    code: "OTA",
    name: "OTA",
    otaCategory: true,
    origin: "set6",
  };
  const historical: ReservationSourceOption = {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    code: "BOOKING",
    name: "Booking.com",
    otaCategory: false,
    origin: "set6",
  };
  const direct: ReservationSourceOption = {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    code: "DIRECT",
    name: "Direct",
    otaCategory: false,
    origin: "set6",
  };
  const booking: ReservationCreateChannel = {
    id: bookingId,
    code: "booking.com",
    name: "Booking.com",
    channelType: "ota",
    integrationId,
  };

  it("keeps source options on the catalogue, including a historical Booking.com source", () => {
    const form = reservationCreateChannelForm({
      sources: [ota, historical, direct],
      channels: [booking],
      bookingSource: historical.id,
      salesChannel: bookingId,
    });
    expect(form.sourceOptions.map((row) => row.label)).toEqual(["OTA", "Booking.com", "Direct"]);
    expect(form.channelOptions).toEqual([]);
    expect(form.salesChannel).toBe("");
    expect(form.commercialSalesChannel).toBeNull();
    expect(form.channelEnabled).toBe(false);
  });

  it("requires Booking.com when the source category is OTA and clears it afterwards", () => {
    const selected = reservationCreateChannelForm({
      sources: [ota, historical],
      channels: [booking],
      bookingSource: ota.id,
      salesChannel: "",
    });
    expect(selected.channelEnabled).toBe(true);
    expect(selected.channelRequired).toBe(true);
    expect(selected.channelOptions).toEqual([{ value: bookingId, label: "Booking.com" }]);
    expect(selected.accepted).toBe(false);
    expect(selected.message).toBe("Channel is required to continue.");

    const submitted = reservationCreateChannelForm({
      sources: [ota, historical],
      channels: [booking],
      bookingSource: ota.id,
      salesChannel: bookingId,
    });
    expect(submitted.commercialSalesChannel).toBe(bookingId);
    expect(submitted.reviewChannel).toBe("Booking.com");
    expect(submitted.reviewChannel).not.toBe(bookingId);

    const cleared = reservationCreateChannelForm({
      sources: [ota, historical],
      channels: [booking],
      bookingSource: historical.id,
      salesChannel: bookingId,
    });
    expect(cleared.salesChannel).toBe("");
    expect(cleared.commercialSalesChannel).toBeNull();
  });

  it("blocks continue when OTA has no active distribution channel", () => {
    const form = reservationCreateChannelForm({
      sources: [ota, direct],
      channels: [],
      bookingSource: ota.id,
      salesChannel: bookingId,
    });
    expect(form.accepted).toBe(false);
    expect(form.channelEnabled).toBe(false);
    expect(form.message).toBe("No active OTA channel is configured for this property.");
    expect(form.commercialSalesChannel).toBeNull();
  });

  it("resolves a distribution channel id and still resolves a legacy sales-channel label", () => {
    expect(
      commercialSalesChannelDisplay({
        stored: bookingId,
        distributionName: "Booking.com",
        salesLabel: "Not configured",
        unresolvedUuid: "Not configured",
      }),
    ).toBe("Booking.com");
    expect(
      commercialSalesChannelDisplay({
        stored: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22",
        distributionName: null,
        salesLabel: "Phone",
        unresolvedUuid: "Not configured",
      }),
    ).toBe("Phone");
    expect(
      overviewChannelLabel("staff", bookingId, [], [{ id: bookingId, name: "Booking.com" }]),
    ).toBe("Booking.com");
    expect(
      overviewChannelLabel(
        "staff",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22",
        [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22", code: "PHONE", name: "Phone" }],
        [],
      ),
    ).toBe("Phone");
  });

  it("uses the single enabled integration environment", () => {
    expect(reservationCreateEnvironment(["sandbox"])).toBe("sandbox");
    expect(reservationCreateEnvironment(["production"])).toBe("production");
    expect(reservationCreateEnvironment(["sandbox", "production"])).toBeNull();
    const server = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/reservation-source-channel.server.ts"),
      "utf8",
    );
    expect(server).toContain('select("id, environment, enabled, status")');
    expect(server).not.toContain("partner_slug");
    expect(server).not.toContain('select("*")');
  });
});
