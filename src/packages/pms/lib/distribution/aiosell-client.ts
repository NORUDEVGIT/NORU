/**
 * Server-only Aiosell HTTP client.
 * Credentials stay in the request header and are never returned.
 * Channel multiplier and messaging are not methods.
 */
import {
  parseAiosellFetchRequest,
  parseAiosellInventoryPush,
  parseAiosellNoShow,
  parseAiosellPropertyDetails,
  parseAiosellRatePush,
  parseAiosellReservationFetchList,
  parseAiosellResponse,
  type AiosellFetchRequest,
  type AiosellInventoryPush,
  type AiosellNoShowRequest,
  type AiosellPropertyDetails,
  type AiosellRatePush,
  type AiosellResponse,
} from "./aiosell-contract";
import { aiosellOutboundSyncEvent, aiosellSafeSyncMessage } from "./aiosell-ari";
import type { DistributionSyncEventInsert } from "./distribution-sync-event";

export const AIOSELL_BASE_URL = "https://live.aiosell.com/api/v2/cm";
export const AIOSELL_TIMEOUT_MS = 15_000;

export type AiosellTransportRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type AiosellTransportResponse = { status: number; body: string };

export type AiosellTransport = (
  request: AiosellTransportRequest,
) => Promise<AiosellTransportResponse>;

export type AiosellCallSuccess<T> = { ok: true; data: T; message: string | null };
export type AiosellCallFailure = {
  ok: false;
  code: string;
  message: string;
  httpStatus: number | null;
};
export type AiosellCallResult<T> = AiosellCallSuccess<T> | AiosellCallFailure;

export function resolveAiosellBasicAuth(
  env: Record<string, string | undefined>,
): { username: string; password: string } | { error: "AIOSELL_CREDENTIALS_MISSING" } {
  const username = env.AIOSELL_BASIC_AUTH_USERNAME ?? "";
  const password = env.AIOSELL_BASIC_AUTH_PASSWORD ?? "";
  if (username === "" || password === "") return { error: "AIOSELL_CREDENTIALS_MISSING" };
  return { username, password };
}

function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

async function defaultTransport(
  request: AiosellTransportRequest,
  timeoutMs: number,
): Promise<AiosellTransportResponse> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await response.text() };
}

export function createAiosellClient(options: {
  partnerSlug: string;
  username: string;
  password: string;
  transport?: AiosellTransport;
  timeoutMs?: number;
  baseUrl?: string;
}) {
  const timeoutMs = options.timeoutMs ?? AIOSELL_TIMEOUT_MS;
  const baseUrl = (options.baseUrl ?? AIOSELL_BASE_URL).replace(/\/$/, "");
  const transport =
    options.transport ??
    ((request: AiosellTransportRequest) => defaultTransport(request, timeoutMs));

  async function call<T>(
    request: AiosellTransportRequest,
    parse: (body: unknown) => T,
    messageFrom?: (data: T) => string | null,
  ): Promise<AiosellCallResult<T>> {
    let response: AiosellTransportResponse;
    try {
      response = await transport(request);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const timedOut = name === "TimeoutError" || name === "AbortError";
      return {
        ok: false,
        code: timedOut ? "AIOSELL_TIMEOUT" : "AIOSELL_NETWORK",
        message: timedOut ? "Aiosell request timed out." : "Aiosell request failed.",
        httpStatus: null,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      const code =
        response.status === 401 || response.status === 403
          ? "AIOSELL_AUTH_FAILED"
          : "AIOSELL_HTTP_ERROR";
      return {
        ok: false,
        code,
        message: code,
        httpStatus: response.status,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      return {
        ok: false,
        code: "AIOSELL_RESPONSE_INVALID",
        message: "Aiosell returned malformed JSON.",
        httpStatus: response.status,
      };
    }
    if (
      json &&
      typeof json === "object" &&
      "success" in json &&
      (json as { success: unknown }).success === false
    ) {
      const parsed = parseAiosellResponse(json);
      const code = /authentication required/i.test(parsed.message)
        ? "AIOSELL_AUTH_FAILED"
        : "AIOSELL_REJECTED";
      return {
        ok: false,
        code,
        message: code,
        httpStatus: response.status,
      };
    }
    try {
      const data = parse(json);
      return { ok: true, data, message: messageFrom ? messageFrom(data) : null };
    } catch {
      return {
        ok: false,
        code: "AIOSELL_RESPONSE_INVALID",
        message: "Aiosell response did not match the contract.",
        httpStatus: response.status,
      };
    }
  }

  function headers(json: boolean): Record<string, string> {
    const result: Record<string, string> = {
      Authorization: basicAuthorization(options.username, options.password),
    };
    if (json) result["Content-Type"] = "application/json";
    return result;
  }

  const partner = encodeURIComponent(options.partnerSlug);

  return {
    getPropertyDetails(hotelCode: string) {
      const url = `${baseUrl}/property_details/${encodeURIComponent(hotelCode)}?partnerId=${partner}`;
      return call({ method: "GET", url, headers: headers(false) }, (body) =>
        parseAiosellPropertyDetails(body),
      );
    },
    pushInventory(payload: AiosellInventoryPush) {
      return call(
        {
          method: "POST",
          url: `${baseUrl}/update/${partner}`,
          headers: headers(true),
          body: JSON.stringify(payload),
        },
        (body) => parseAiosellResponse(body),
        (data) => data.message,
      );
    },
    pushRates(payload: AiosellRatePush) {
      return call(
        {
          method: "POST",
          url: `${baseUrl}/update-rates/${partner}`,
          headers: headers(true),
          body: JSON.stringify(payload),
        },
        (body) => parseAiosellResponse(body),
        (data) => data.message,
      );
    },
    pushInventoryRestrictions(payload: unknown) {
      return call(
        {
          method: "POST",
          url: `${baseUrl}/update/${partner}`,
          headers: headers(true),
          body: JSON.stringify(payload),
        },
        (body) => parseAiosellResponse(body),
        (data) => data.message,
      );
    },
    pushRateRestrictions(payload: unknown) {
      return call(
        {
          method: "POST",
          url: `${baseUrl}/update-rates/${partner}`,
          headers: headers(true),
          body: JSON.stringify(payload),
        },
        (body) => parseAiosellResponse(body),
        (data) => data.message,
      );
    },
    fetchInventory(request: AiosellFetchRequest) {
      const body = parseAiosellFetchRequest({ ...request, type: "inventory" });
      return call(
        {
          method: "POST",
          url: `${baseUrl}/data/${partner}`,
          headers: headers(true),
          body: JSON.stringify(body),
        },
        (parsed) => parseAiosellInventoryPush(parsed),
      );
    },
    fetchRates(request: AiosellFetchRequest) {
      const body = parseAiosellFetchRequest({ ...request, type: "rates" });
      return call(
        {
          method: "POST",
          url: `${baseUrl}/data/${partner}`,
          headers: headers(true),
          body: JSON.stringify(body),
        },
        (parsed) => parseAiosellRatePush(parsed),
      );
    },
    fetchReservations(request: AiosellFetchRequest) {
      const body = parseAiosellFetchRequest({ ...request, type: "reservation" });
      return call(
        {
          method: "POST",
          url: `${baseUrl}/data/${partner}`,
          headers: headers(true),
          body: JSON.stringify(body),
        },
        (parsed) => parseAiosellReservationFetchList(parsed),
      );
    },
    markNoShow(payload: AiosellNoShowRequest) {
      const body = parseAiosellNoShow(payload);
      return call(
        {
          method: "POST",
          url: `${baseUrl}/marknoshow/${partner}`,
          headers: headers(true),
          body: JSON.stringify(body),
        },
        (parsed) => parseAiosellResponse(parsed),
        (data) => data.message,
      );
    },
  };
}

export type AiosellClient = ReturnType<typeof createAiosellClient>;

export async function runAiosellOutbound<T>(input: {
  restaurantId: string;
  operation: string;
  channel?: string | null;
  secrets: { username: string; password: string };
  call: () => Promise<AiosellCallResult<T>>;
  record: (event: DistributionSyncEventInsert) => void | Promise<void>;
}): Promise<AiosellCallResult<T>> {
  let result: AiosellCallResult<T>;
  try {
    result = await input.call();
  } catch {
    result = {
      ok: false,
      code: "AIOSELL_NETWORK",
      message: "Aiosell request failed.",
      httpStatus: null,
    };
  }
  const message = aiosellSafeSyncMessage({
    ok: result.ok,
    code: result.ok ? "ok" : result.code,
    message: result.ok ? result.message : result.code,
    secrets: [input.secrets.username, input.secrets.password],
  });
  await input.record(
    aiosellOutboundSyncEvent({
      restaurantId: input.restaurantId,
      operation: input.operation,
      channel: input.channel,
      success: result.ok,
      responseMessage: message,
    }),
  );
  return result.ok ? result : { ...result, message };
}
