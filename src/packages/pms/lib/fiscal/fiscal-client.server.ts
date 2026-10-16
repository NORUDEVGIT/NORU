/**
 * Server-only fiscal HTTP client. TLS verification stays on. This module
 * never disables certificate checks and never reads credentials from the browser.
 *
 * P1 implements authenticate. P2 posts a guest B2C INV to receive_request.
 */
import {
  FISCAL_REQUEST_TIMEOUT_MS,
  FiscalError,
  fiscalNonJsonBody,
  redactFiscalPayload,
  type FiscalAuthRequest,
} from "./fiscal.types.ts";

export type FiscalFetch = (input: string, init: RequestInit) => Promise<Response>;

export type FiscalAuthSuccess = {
  accessToken: string;
  expiresIn: number;
  httpStatus: number;
  latencyMs: number;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fiscalNonJsonBody({
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      rawText: text,
    });
  }
}

export async function authenticateFiscal(input: {
  baseUrl: string;
  username: string;
  password: string;
  tinNo: string;
  client: string;
  fetchImpl?: FiscalFetch;
  timeoutMs?: number;
}): Promise<FiscalAuthSuccess> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? FISCAL_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const body: FiscalAuthRequest = { tin_no: input.tinNo, client: input.client };
  const basic = Buffer.from(`${input.username}:${input.password}`, "utf8").toString("base64");
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(input.baseUrl, "authenticate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new FiscalError(
      aborted ? "FISCAL_TIMEOUT" : "FISCAL_NETWORK_ERROR",
      aborted
        ? "The fiscal service did not respond in time."
        : "NORU could not reach the fiscal service.",
    );
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const payload = await readBody(response);
  if (!response.ok) {
    throw new FiscalError(
      "FISCAL_AUTH_FAILED",
      "Authentication was rejected by the fiscal service.",
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FiscalError(
      "FISCAL_AUTH_RESPONSE_INVALID",
      "The fiscal service returned an unexpected authentication response.",
    );
  }
  const record = payload as Record<string, unknown>;
  const data = record.data;
  const token =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).access_token
      : null;
  const expiresIn =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).expires_in
      : null;
  const status = record.status;
  if (status !== 0 || typeof token !== "string" || token.trim().length === 0) {
    throw new FiscalError(
      "FISCAL_AUTH_RESPONSE_INVALID",
      "The fiscal service returned an unexpected authentication response.",
    );
  }
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new FiscalError(
      "FISCAL_AUTH_RESPONSE_INVALID",
      "The fiscal service returned an unexpected authentication response.",
    );
  }
  return { accessToken: token, expiresIn, httpStatus: response.status, latencyMs };
}

export type FiscalReceiveResult = {
  httpStatus: number;
  body: unknown;
  latencyMs: number;
};

export async function postFiscalReceiveRequest(input: {
  baseUrl: string;
  accessToken: string;
  payload: unknown;
  fetchImpl?: FiscalFetch;
  timeoutMs?: number;
  path?: string;
}): Promise<FiscalReceiveResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? FISCAL_REQUEST_TIMEOUT_MS;
  const path = input.path ?? "receive_request";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(input.baseUrl, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new FiscalError(
      aborted ? "FISCAL_TIMEOUT" : "FISCAL_NETWORK_ERROR",
      aborted
        ? "The fiscal service did not respond in time."
        : "NORU could not reach the fiscal service.",
    );
  } finally {
    clearTimeout(timer);
  }
  return {
    httpStatus: response.status,
    body: await readBody(response),
    latencyMs: Date.now() - started,
  };
}

export function safeAuthActivity(input: { httpStatus?: number | null; message: string }) {
  return redactFiscalPayload({
    httpStatus: input.httpStatus ?? null,
    message: input.message,
  });
}
