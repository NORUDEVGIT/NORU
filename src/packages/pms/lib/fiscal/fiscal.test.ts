import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { authenticateFiscal, postFiscalReceiveRequest } from "./fiscal-client.server.ts";
import { dispatchFiscalDocument, processFiscalOutbox } from "./fiscal-outbox.server.ts";
import { getValidFiscalToken } from "./fiscal-token.server.ts";
import {
  FISCAL_RAW_BODY_LIMIT,
  FISCAL_RETRY_DELAYS_MS,
  FiscalError,
  canTransitionFiscalStatus,
  classifyFiscalFailure,
  fiscalReadiness,
  maskTin,
  nextFiscalRetryAt,
  normalizeFiscalConnection,
  redactFiscalPayload,
  requireExternalCode,
} from "./fiscal.types.ts";
import { guestInvoiceTrnxId } from "./fiscal-guest-invoice.ts";
import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";

const migration = readFileSync(
  new URL(
    "../../../../../drizzle/migrations/0152_pms_fiscal_integration_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const fiscalSources = [
  "fiscal.types.ts",
  "fiscal-client.server.ts",
  "fiscal-secrets.server.ts",
  "fiscal-token.server.ts",
  "fiscal-outbox.server.ts",
  "fiscal-guest-invoice.ts",
  "fiscal-guest-invoice.server.ts",
  "fiscal-credit-note.ts",
  "fiscal-credit-note.server.ts",
  "fiscal-exchange.ts",
  "fiscal-exchange.server.ts",
  "fiscal.functions.ts",
]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("fiscal foundation invariants", () => {
  it("does not touch the financial ledger", () => {
    assert.equal(migration.includes("folio_transactions"), false);
    assert.equal(migration.includes("guest_payment_invoice_allocations"), false);
    assert.equal(migration.includes("financial_account_payment_allocations"), false);
    assert.equal(fiscalSources.includes("post_folio_transaction"), false);
    assert.equal(fiscalSources.includes("folio_transactions"), false);
  });

  it("stores credentials through the service-role vault bridge", () => {
    const secrets = readFileSync(new URL("./fiscal-secrets.server.ts", import.meta.url), "utf8");
    assert.match(secrets, /fiscal_store_api_credentials/);
    assert.match(secrets, /fiscal_read_api_credentials/);
    assert.equal(secrets.includes('schema("vault")'), false);
  });

  it("claims the outbox with skip locked and keeps attempts immutable", () => {
    assert.match(migration, /FOR UPDATE SKIP LOCKED/);
    assert.match(migration, /FISCAL_ATTEMPT_IMMUTABLE/);
    assert.match(migration, /FISCAL_IRN_IMMUTABLE/);
    assert.match(
      migration,
      /REVOKE ALL ON public\.fiscal_integration_tokens FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe("fiscal connection validation", () => {
  it("requires https and strips a trailing slash", () => {
    const saved = normalizeFiscalConnection({
      environment: "TEST",
      baseUrl: "https://example.test/trcp/",
      taxpayerTin: " 123 ",
      client: " ERP ",
      deviceId: " 42 ",
      enabled: true,
    });
    assert.equal(saved.baseUrl, "https://example.test/trcp");
    assert.equal(saved.taxpayerTin, "123");
  });

  it("rejects production http and credentials in the URL", () => {
    assert.throws(
      () =>
        normalizeFiscalConnection({
          environment: "PRODUCTION",
          baseUrl: "http://example.test",
          taxpayerTin: "1",
          client: "ERP",
          deviceId: "1",
          enabled: true,
        }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_CONFIG_MISSING",
    );
  });

  it("masks a taxpayer TIN", () => {
    assert.equal(maskTin("0026716178"), "0026******");
  });
});

describe("fiscal authentication client", () => {
  const base = {
    baseUrl: "https://example.test",
    username: "user",
    password: "secret-value",
    tinNo: "123",
    client: "ERP",
  };

  it("accepts a valid token response", async () => {
    const result = await authenticateFiscal({
      ...base,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 0,
            message: "success",
            data: { access_token: "tok", expires_in: 90 },
          }),
          {
            status: 200,
          },
        ),
    });
    assert.equal(result.accessToken, "tok");
    assert.equal(result.expiresIn, 90);
  });

  it("rejects a missing token, bad expiry, 401, 500, and a timeout", async () => {
    await assert.rejects(
      authenticateFiscal({
        ...base,
        fetchImpl: async () =>
          new Response(JSON.stringify({ status: 0, data: { expires_in: 10 } }), { status: 200 }),
      }),
      (error: unknown) =>
        error instanceof FiscalError && error.code === "FISCAL_AUTH_RESPONSE_INVALID",
    );
    await assert.rejects(
      authenticateFiscal({
        ...base,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ status: 0, data: { access_token: "tok", expires_in: 0 } }),
            { status: 200 },
          ),
      }),
      (error: unknown) =>
        error instanceof FiscalError && error.code === "FISCAL_AUTH_RESPONSE_INVALID",
    );
    await assert.rejects(
      authenticateFiscal({ ...base, fetchImpl: async () => new Response("no", { status: 401 }) }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_AUTH_FAILED",
    );
    await assert.rejects(
      authenticateFiscal({ ...base, fetchImpl: async () => new Response("no", { status: 500 }) }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_AUTH_FAILED",
    );
    await assert.rejects(
      authenticateFiscal({
        ...base,
        timeoutMs: 20,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_TIMEOUT",
    );
  });
});

describe("fiscal token cache", () => {
  it("reuses a valid token and does not return it from a status shape", async () => {
    const db = {
      rpc: async () => ({
        data: {
          needsRefresh: false,
          accessToken: "hidden-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        error: null,
      }),
      from: () => {
        throw new Error("should not refresh");
      },
      schema: () => {
        throw new Error("should not read secrets");
      },
    };
    const token = await getValidFiscalToken(db, {
      integrationId: "00000000-0000-4000-8000-000000000001",
      restaurantId: "00000000-0000-4000-8000-000000000002",
      config: { baseUrl: "https://example.test", taxpayerTin: "1", client: "ERP" },
    });
    assert.equal(token.accessToken, "hidden-token");
    const status = { hasToken: true, expiresAt: token.expiresAt };
    assert.equal("accessToken" in status, false);
  });
});

describe("fiscal redaction, retry, and state", () => {
  it("redacts secrets", () => {
    const redacted = redactFiscalPayload({
      password: "x",
      nested: { Authorization: "Basic abc", client: "ERP" },
    }) as {
      password: string;
      nested: { Authorization: string; client: string };
    };
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.nested.Authorization, "[redacted]");
    assert.equal(redacted.nested.client, "ERP");
  });

  it("classifies retryable failures and spaces retries", () => {
    assert.equal(classifyFiscalFailure({ code: "FISCAL_TIMEOUT" }).outcome, "timeout");
    assert.equal(classifyFiscalFailure({ httpStatus: 500 }).retryable, true);
    assert.equal(classifyFiscalFailure({ code: "FISCAL_HANDLER_NOT_ENABLED" }).retryable, false);
    const first = nextFiscalRetryAt(1, new Date("2026-01-01T00:00:00.000Z"));
    assert.equal(first?.toISOString(), "2026-01-01T00:01:00.000Z");
    assert.equal(nextFiscalRetryAt(6), null);
  });

  it("keeps registered terminal except cancellation", () => {
    assert.equal(canTransitionFiscalStatus("REGISTERED", "PENDING"), false);
    assert.equal(canTransitionFiscalStatus("REGISTERED", "CANCEL_PENDING"), true);
    assert.equal(canTransitionFiscalStatus("FAILED", "PENDING"), true);
  });

  it("rejects an empty external code and reports incomplete document readiness", () => {
    assert.throws(() => requireExternalCode("  ", "Item code"), FiscalError);
    const ready = fiscalReadiness({
      baseUrl: "https://example.test",
      taxpayerTin: "1",
      client: "ERP",
      deviceId: "",
      credentialsConfigured: true,
      taxMapped: 0,
      taxTotal: 2,
      roomMapped: false,
      buyerMapped: 0,
    });
    assert.equal(ready.authReady, true);
    assert.equal(ready.documentReady, false);
    assert.equal(ready.registrationEnabled, false);
  });

  it("does not send documents from the outbox dispatcher", async () => {
    assert.throws(
      () => dispatchFiscalDocument("WITHHOLDING", "guest_invoice"),
      (error: unknown) => error instanceof FiscalError,
    );
    assert.doesNotThrow(() => dispatchFiscalDocument("WITHHOLDING", "withholding"));
    assert.doesNotThrow(() => dispatchFiscalDocument("INV", "guest_invoice"));
    assert.doesNotThrow(() => dispatchFiscalDocument("CRE", "credit_note"));
    assert.doesNotThrow(() => dispatchFiscalDocument("DEB", "debit_note"));
    assert.doesNotThrow(() => dispatchFiscalDocument("SALES_RECEIPT", "guest_allocation"));
    assert.doesNotThrow(() => dispatchFiscalDocument("INV", "account_invoice"));
    assert.doesNotThrow(() => dispatchFiscalDocument("SALES_RECEIPT", "account_allocation"));
    const db = {
      rpc: async () => ({ data: [], error: null }),
      from: () => ({
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const result = await processFiscalOutbox(db, 10);
    assert.deepEqual(result, { processed: 0 });
  });
});

describe("fiscal non-JSON provider responses", () => {
  const payload = { Type: "INV", trnx_id: guestInvoiceTrnxId("invoice-1"), TaxCode: "VAT15" };

  it("keeps a valid JSON body unchanged and sends the given payload", async () => {
    let sent = "";
    const result = await postFiscalReceiveRequest({
      baseUrl: "https://example.test",
      accessToken: "secret-token",
      payload,
      fetchImpl: async (_url, init) => {
        sent = String(init?.body ?? "");
        return new Response(JSON.stringify({ status: "A", irn: "IRN-1", documentNumber: "9" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    assert.equal(sent, JSON.stringify(payload));
    assert.equal(sent.includes("secret-token"), false);
    assert.deepEqual(result.body, { status: "A", irn: "IRN-1", documentNumber: "9" });
    assert.equal("nonJson" in (result.body as object), false);
  });

  it("preserves plain text and HTML from an HTTP 500", async () => {
    const text = await postFiscalReceiveRequest({
      baseUrl: "https://example.test",
      accessToken: "secret-token",
      payload,
      fetchImpl: async () =>
        new Response("provider failed", { status: 500, headers: { "content-type": "text/plain" } }),
    });
    assert.deepEqual(text.body, {
      nonJson: true,
      httpStatus: 500,
      contentType: "text/plain",
      rawBody: "provider failed",
      rawBodyTruncated: false,
    });
    const html = await postFiscalReceiveRequest({
      baseUrl: "https://example.test",
      accessToken: "secret-token",
      payload,
      fetchImpl: async () =>
        new Response("<html>password=hello Authorization: Bearer abc.def</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        }),
    });
    const body = html.body as {
      contentType: string;
      rawBody: string;
      httpStatus: number;
    };
    assert.equal(body.httpStatus, 500);
    assert.equal(body.contentType, "text/html");
    assert.equal(body.rawBody.includes("hello"), false);
    assert.equal(body.rawBody.includes("abc.def"), false);
    assert.equal(body.rawBody.includes("[redacted]"), true);
  });

  it("truncates a long raw body and flags the cut", async () => {
    const result = await postFiscalReceiveRequest({
      baseUrl: "https://example.test",
      accessToken: "secret-token",
      payload,
      fetchImpl: async () => new Response("x".repeat(FISCAL_RAW_BODY_LIMIT + 25), { status: 503 }),
    });
    const body = result.body as { rawBody: string; rawBodyTruncated: boolean; httpStatus: number };
    assert.equal(body.rawBody.length, FISCAL_RAW_BODY_LIMIT);
    assert.equal(body.rawBodyTruncated, true);
    assert.equal(body.httpStatus, 503);
  });

  it("shows the stored non-JSON body in the exchange and redacts secrets again", () => {
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg",
        source_type: "guest_invoice",
        source_id: "invoice-1",
        fiscal_document_type: "INV",
        status: "FAILED",
        trnx_id: guestInvoiceTrnxId("invoice-1"),
        response_snapshot: {
          nonJson: true,
          httpStatus: 500,
          contentType: "text/html",
          rawBody: "password=hello",
          rawBodyTruncated: false,
        },
      },
      attempts: [],
      invoiceNumber: "INV-1",
    });
    const response = exchange.registration.responseSnapshot as {
      rawBody: string;
      nonJson: boolean;
    };
    assert.equal(exchange.registration.responseState, "ready");
    assert.equal(response.nonJson, true);
    assert.equal(response.rawBody.includes("hello"), false);
  });

  it("keeps a connection failure and a timeout free of a fake provider body", async () => {
    await assert.rejects(
      postFiscalReceiveRequest({
        baseUrl: "https://example.test",
        accessToken: "secret-token",
        payload,
        fetchImpl: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
      (error: unknown) =>
        error instanceof FiscalError && error.code === "FISCAL_NETWORK_ERROR" && !("body" in error),
    );
    await assert.rejects(
      postFiscalReceiveRequest({
        baseUrl: "https://example.test",
        accessToken: "secret-token",
        payload,
        timeoutMs: 20,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_TIMEOUT",
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 500 }).retryable,
      true,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 500 }).outcome,
      "retryable_error",
    );
    assert.equal(classifyFiscalFailure({ code: "FISCAL_TIMEOUT" }).outcome, "timeout");
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_PROVIDER_REJECTED", httpStatus: 400 }).retryable,
      false,
    );
    assert.deepEqual(FISCAL_RETRY_DELAYS_MS, [60_000, 300_000, 900_000, 3_600_000, 14_400_000]);
    assert.equal(guestInvoiceTrnxId("invoice-1"), "gi-invoice-1");
    const builder = readFileSync(new URL("./fiscal-guest-invoice.ts", import.meta.url), "utf8");
    assert.equal(builder.includes("fiscalNonJsonBody"), false);
    assert.equal(builder.includes("FISCAL_HTTP_ERROR"), false);
  });
});
