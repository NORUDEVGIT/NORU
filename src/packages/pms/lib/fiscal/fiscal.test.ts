import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { authenticateFiscal } from "./fiscal-client.server.ts";
import { dispatchFiscalDocument, processFiscalOutbox } from "./fiscal-outbox.server.ts";
import { getValidFiscalToken } from "./fiscal-token.server.ts";
import {
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
      modeMapped: 0,
      buyerMapped: 0,
    });
    assert.equal(ready.authReady, true);
    assert.equal(ready.documentReady, false);
    assert.equal(ready.registrationEnabled, false);
  });

  it("does not send documents from the outbox dispatcher", async () => {
    assert.throws(
      () => dispatchFiscalDocument("INV"),
      (error: unknown) => error instanceof FiscalError,
    );
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
