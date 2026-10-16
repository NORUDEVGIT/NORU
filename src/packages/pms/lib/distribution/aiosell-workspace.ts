/**
 * AIOS-07 Aiosell operator view.
 * Derived from current connection, mapping, and sync state.
 * Credential values, guest data, and raw provider payloads are not fields.
 */
import { isRawAiosellProviderText } from "./aiosell-ari";
import type { AiosellEnvironment } from "./aiosell-connection";

export const AIOSELL_WEBHOOK_PATH = "/api/pms/distribution/aiosell/reservations";

export const AIOSELL_STALE_FETCH_WARNING =
  "Fetched reservation state does not include authoritative ordering metadata. Reconciliation is idempotent for identical state but cannot independently prove that a differing fetched state is newer than the latest webhook state.";

export const AIOSELL_WINDOW_COPY =
  "The Aiosell fetch window date is provider-defined and is not documented precisely. One reconciliation run does not guarantee complete booking history.";

export const AIOSELL_ACTIVATION_COPY =
  "Production activation requires manual final approval/configuration.";

export type AiosellReadinessLevel = "ready" | "not_ready" | "attention";

export type AiosellSyncEventView = {
  operation: string;
  direction: "inbound" | "outbound";
  status: "success" | "failed" | "info";
  channel: string | null;
  bookingId: string | null;
  message: string | null;
  createdAt: string;
};

export type AiosellWorkspaceInput = {
  environment: AiosellEnvironment;
  connection: {
    partnerSlug: string;
    hotelCode: string;
    status: string;
    enabled: boolean;
    lastValidatedAt: string | null;
    lastError: string | null;
  } | null;
  credentialsConfigured: boolean;
  currencyCompatible: boolean | null;
  timezoneCompatible: boolean | null;
  roomTypes: { id: string; name: string; code: string | null }[];
  roomMappings: { roomTypeId: string; roomCode: string; active: boolean }[];
  ratePlans: { id: string; name: string; roomTypeId: string; roomTypeName: string }[];
  rateMappings: {
    ratePlanId: string;
    roomCode: string;
    rateplanCode: string;
    active: boolean;
    error: string | null;
  }[];
  channels: { code: string; operations: string[]; enabled: boolean }[];
  events: AiosellSyncEventView[];
  publicBaseUrl: string | null;
};

export type AiosellWorkspaceView = ReturnType<typeof aiosellWorkspaceView>;

function origin(value: string | null): string | null {
  const text = (value ?? "").trim().replace(/\/$/, "");
  if (!text.startsWith("https://") && !text.startsWith("http://")) return null;
  return text;
}

export function aiosellWebhookReadiness(publicBaseUrl: string | null): {
  ready: boolean;
  url: string | null;
} {
  const base = origin(publicBaseUrl);
  if (!base) return { ready: false, url: null };
  return { ready: true, url: `${base}${AIOSELL_WEBHOOK_PATH}` };
}

function withhold(message: string | null): string | null {
  if (!message) return null;
  if (isRawAiosellProviderText(message)) return "withheld";
  if (/@|password|authorization|creditcard|cardnumber|\b\d{13,19}\b/i.test(message)) {
    return "withheld";
  }
  return message;
}

function latest(events: AiosellSyncEventView[], match: (event: AiosellSyncEventView) => boolean) {
  return events.find(match) ?? null;
}

function currentLatestError(events: AiosellSyncEventView[]): AiosellSyncEventView | null {
  const newest = [...events].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0];
  if (!newest || newest.status !== "failed") return null;
  return newest;
}

export function aiosellWorkspaceView(input: AiosellWorkspaceInput) {
  const webhook = aiosellWebhookReadiness(input.publicBaseUrl);
  const activeRooms = input.roomMappings.filter((row) => row.active);
  const activeRates = input.rateMappings.filter((row) => row.active && !row.error);
  const mappingErrors = input.rateMappings.filter((row) => row.error);
  const connection = input.connection;
  const validated =
    Boolean(connection?.lastValidatedAt) &&
    !connection?.lastError &&
    input.currencyCompatible === true &&
    input.timezoneCompatible === true;
  const reasons: string[] = [];
  if (!connection) reasons.push("Aiosell connection metadata is missing.");
  if (!connection?.partnerSlug) reasons.push("Partner slug is missing.");
  if (!connection?.hotelCode) reasons.push("External hotel code is missing.");
  if (!input.credentialsConfigured) reasons.push("Server credentials are missing.");
  if (!validated) reasons.push("Connection has not been validated for this property.");
  if (input.currencyCompatible === false) reasons.push("Currency does not match the property.");
  if (input.timezoneCompatible === false) reasons.push("Timezone does not match the property.");
  if (activeRooms.length === 0) reasons.push("No active room mapping.");
  if (mappingErrors.length > 0 || (activeRooms.length > 0 && activeRates.length === 0)) {
    reasons.push("Rate mappings are missing or invalid.");
  }
  if (!webhook.ready) reasons.push("Public webhook address is not configured.");
  const latestError = currentLatestError(input.events);
  let level: AiosellReadinessLevel = "ready";
  if (reasons.length > 0) level = "not_ready";
  else if (latestError) level = "attention";
  if (latestError && level !== "not_ready") reasons.push("A recent sync event failed.");
  const events = input.events.map((event) => ({
    ...event,
    message: withhold(event.message),
  }));
  return {
    provider: "Aiosell" as const,
    environment: input.environment,
    partnerSlug: connection?.partnerSlug ?? "",
    hotelCode: connection?.hotelCode ?? "",
    connectionState: connection ? connection.status : "not_configured",
    enabled: connection?.enabled ?? false,
    lastValidatedAt: connection?.lastValidatedAt ?? null,
    lastError: withhold(connection?.lastError ?? null),
    credentialStatus: input.credentialsConfigured ? ("configured" as const) : ("missing" as const),
    currencyCompatible: input.currencyCompatible,
    timezoneCompatible: input.timezoneCompatible,
    rooms: input.roomTypes.map((room) => {
      const mapped = input.roomMappings.find((row) => row.roomTypeId === room.id);
      return {
        roomTypeId: room.id,
        name: room.name,
        code: room.code,
        roomCode: mapped?.roomCode ?? "",
        active: mapped?.active ?? false,
        ready: Boolean(mapped?.active && mapped.roomCode),
      };
    }),
    rates: input.ratePlans.map((plan) => {
      const mapped = input.rateMappings.find((row) => row.ratePlanId === plan.id);
      return {
        ratePlanId: plan.id,
        name: plan.name,
        roomTypeName: plan.roomTypeName,
        roomCode: mapped?.roomCode ?? "",
        rateplanCode: mapped?.rateplanCode ?? "",
        active: mapped?.active ?? false,
        error: mapped?.error ?? null,
      };
    }),
    channels: input.channels,
    sync: {
      lastValidation: latest(events, (event) => event.operation === "property_details"),
      lastAri: latest(
        events,
        (event) => event.operation.includes("inventory") || event.operation.includes("rate"),
      ),
      lastInbound: latest(events, (event) => event.direction === "inbound"),
      lastReconciliation: latest(events, (event) => event.operation.startsWith("reconcile")),
      lastNoShow: latest(events, (event) => event.operation === "mark_no_show"),
      latestError: latestError ? { ...latestError, message: withhold(latestError.message) } : null,
      recent: events.slice(0, 8),
    },
    readiness: { level, reasons },
    webhook,
    productionActivation: {
      allowed: false,
      message:
        level === "ready"
          ? AIOSELL_ACTIVATION_COPY
          : "Production cannot be activated until readiness passes.",
    },
    staleFetchWarning: AIOSELL_STALE_FETCH_WARNING,
    windowCopy: AIOSELL_WINDOW_COPY,
  };
}

export function aiosellRateMappingError(input: {
  roomCode: string;
  mappedRoomCode: string | null;
}): string | null {
  if (!input.mappedRoomCode) return "ROOM_MAPPING_REQUIRED";
  if (input.mappedRoomCode !== input.roomCode) return "WRONG_ROOM_RATE_PLAN";
  return null;
}

export function aiosellValidationMessage(input: {
  ready: boolean;
  error: string | null;
  reasons: string[];
}): string | null {
  if (input.ready) return null;
  return input.reasons[0] ?? input.error ?? "AIOSELL_VALIDATION_FAILED";
}

export function aiosellReconcileDisplay(summary: {
  totals: {
    fetched: number;
    created: number;
    modified: number;
    cancelled: number;
    unchanged: number;
    conflicts: number;
    failed: number;
  };
  results: { bookingId: string | null; channel: string | null; code: string }[];
  runError: string | null;
}) {
  return {
    totals: summary.totals,
    runError: summary.runError,
    items: summary.results.map((item) => ({
      bookingId: item.bookingId,
      channel: item.channel,
      code: item.code,
    })),
  };
}
