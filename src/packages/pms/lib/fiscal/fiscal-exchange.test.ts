import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { loadFiscalRegistrationExchange } from "./fiscal-exchange.server.ts";
import {
  buildFiscalRegistrationExchange,
  collapseFiscalExchangeValues,
  fiscalExchangeCopyText,
  redactFiscalExchange,
} from "./fiscal-exchange.ts";
import {
  FiscalError,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REGISTRATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INVOICE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const roles = readFileSync(
  new URL("../../../../core/lib/cashiering-roles.ts", import.meta.url),
  "utf8",
);
const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
const exchangeSource = [
  readFileSync(new URL("./fiscal-exchange.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./fiscal-exchange.server.ts", import.meta.url), "utf8"),
].join("\n");
const viewer = readFileSync(
  new URL("../../components/cashiering/fiscal-json-viewer.tsx", import.meta.url),
  "utf8",
);
const payload = readFileSync(new URL("./fiscal-guest-invoice.ts", import.meta.url), "utf8");
const outbox = readFileSync(new URL("./fiscal-outbox.server.ts", import.meta.url), "utf8");

function handler(): string {
  const start = functions.indexOf("export const getFiscalRegistrationExchange");
  const end = functions.indexOf("export const registerGuestInvoiceFiscal");
  return functions.slice(start, end);
}

describe("fiscal exchange authorization", () => {
  it("lets an owner or manager read the exchange and keeps cashier and accountant out", () => {
    const manage = roles.slice(
      roles.indexOf("CASHIER_MANAGE_ROLES"),
      roles.indexOf("CASHIER_ALLOCATE_ROLES"),
    );
    assert.match(manage, /"owner"/);
    assert.match(manage, /"manager"/);
    assert.equal(manage.includes("cashier"), false);
    assert.equal(manage.includes("accountant"), false);
    assert.match(handler(), /requireCashierManager/);
    assert.equal(handler().includes("requireCashieringAccess"), false);
    assert.equal(handler().includes("logActivity"), false);
  });
});

describe("fiscal exchange snapshots", () => {
  it("returns the stored request and response and orders attempts", () => {
    const exchange = buildFiscalRegistrationExchange({
      registration: registrationRow({
        request_snapshot: { Type: "INV", TaxCode: "VAT15" },
        response_snapshot: { status: "A", documentNumber: "2190", irn: "IRN-1" },
        attempt_count: 2,
      }),
      attempts: [
        attemptRow({ id: "2", attempt_number: 2, outcome: "success", http_status: 200 }),
        attemptRow({ id: "1", attempt_number: 1, outcome: "retryable_error", http_status: 500 }),
      ],
      invoiceNumber: "INV-00125",
    });
    assert.equal(exchange.registration.invoiceNumber, "INV-00125");
    assert.equal(exchange.registration.requestState, "ready");
    assert.deepEqual(exchange.registration.requestSnapshot, { Type: "INV", TaxCode: "VAT15" });
    assert.equal(exchange.registration.responseState, "ready");
    assert.equal(
      (exchange.registration.responseSnapshot as { documentNumber: string }).documentNumber,
      "2190",
    );
    assert.deepEqual(
      exchange.attempts.map((attempt) => attempt.attemptNumber),
      [1, 2],
    );
    assert.equal(exchange.attempts[0]?.httpStatus, 500);
    assert.equal(exchange.attempts[1]?.httpStatus, 200);
    assert.equal(exchange.attempts[1]?.externalStatus, "A");
  });

  it("keeps a missing provider response empty", () => {
    const exchange = buildFiscalRegistrationExchange({
      registration: registrationRow({ response_snapshot: null, attempt_count: 0 }),
      attempts: [],
      invoiceNumber: "INV-00125",
    });
    assert.equal(exchange.registration.responseState, "empty");
    assert.equal(exchange.registration.responseSnapshot, null);
    assert.deepEqual(exchange.attempts, []);
    assert.equal(exchange.registration.requestState, "ready");
  });

  it("redacts secret keys at the root, in nested objects, and in arrays", () => {
    const original = {
      Authorization: "Bearer abc",
      password: "hello",
      nested: { access_token: "123", TaxCode: "VAT15" },
      lines: [{ Password: "hidden", ItemCode: "001" }],
    };
    const redacted = redactFiscalExchange(original) as {
      Authorization: string;
      password: string;
      nested: { access_token: string; TaxCode: string };
      lines: Array<{ Password: string; ItemCode: string }>;
    };
    assert.equal(redacted.Authorization, "[REDACTED]");
    assert.equal(redacted.password, "[REDACTED]");
    assert.equal(redacted.nested.access_token, "[REDACTED]");
    assert.equal(redacted.nested.TaxCode, "VAT15");
    assert.equal(redacted.lines[0]?.Password, "[REDACTED]");
    assert.equal(redacted.lines[0]?.ItemCode, "001");
    assert.equal(original.password, "hello");
  });

  it("redacts capitalization variants and keeps fiscal identifiers", () => {
    const redacted = redactFiscalExchange({
      authorization: "Basic abc",
      ACCESS_TOKEN: "tok",
      Password: "pw",
      username: "api-user",
      TaxCode: "VAT15",
      ItemCode: "001",
      device_id: "DEVICE-1",
      tax_payer_tin: "0026716178",
      trnx_id: "gi-1",
      IRN: "IRN-1",
      documentNumber: "2190",
    }) as Record<string, string>;
    assert.equal(redacted.authorization, "[REDACTED]");
    assert.equal(redacted.ACCESS_TOKEN, "[REDACTED]");
    assert.equal(redacted.Password, "[REDACTED]");
    assert.equal(redacted.username, "[REDACTED]");
    assert.equal(redacted.TaxCode, "VAT15");
    assert.equal(redacted.ItemCode, "001");
    assert.equal(redacted.device_id, "DEVICE-1");
    assert.equal(redacted.tax_payer_tin, "0026716178");
    assert.equal(redacted.trnx_id, "gi-1");
    assert.equal(redacted.IRN, "IRN-1");
    assert.equal(redacted.documentNumber, "2190");
  });

  it("copies the redacted snapshot and shortens only the on-screen large value", () => {
    const signed = "Q".repeat(4821);
    const value = { signedQR: signed, TaxCode: "VAT15", password: "hello" };
    const copied = fiscalExchangeCopyText(value);
    assert.equal(copied.includes("hello"), false);
    assert.equal(copied.includes("[REDACTED]"), true);
    assert.equal(copied.includes(signed), true);
    assert.match(viewer, /fiscalExchangeCopyText\(value\)/);
    const collapsed = collapseFiscalExchangeValues(redactFiscalExchange({ signedQR: signed })) as {
      signedQR: string;
    };
    assert.equal(collapsed.signedQR, "[large value — 4821 characters]");
  });
});

describe("fiscal exchange loader", () => {
  it("blocks a registration from another property", async () => {
    const db = memoryDb({
      fiscal_registrations: [registrationRow({ restaurant_id: OTHER })],
      fiscal_registration_attempts: [],
      guest_folio_invoices: [],
    });
    await assert.rejects(
      () =>
        loadFiscalRegistrationExchange(db, {
          restaurantId: PROPERTY,
          registrationId: REGISTRATION,
        }),
      (error: unknown) => error instanceof FiscalError && error.code === "FISCAL_NOT_ELIGIBLE",
    );
  });

  it("loads the property registration without writing", async () => {
    const db = memoryDb({
      fiscal_registrations: [registrationRow({ restaurant_id: PROPERTY })],
      fiscal_registration_attempts: [
        attemptRow({ registration_id: REGISTRATION, attempt_number: 1, outcome: "success" }),
      ],
      guest_folio_invoices: [{ id: INVOICE, restaurant_id: PROPERTY, issued_number: "INV-00125" }],
    });
    const exchange = await loadFiscalRegistrationExchange(db, {
      restaurantId: PROPERTY,
      registrationId: REGISTRATION,
    });
    assert.equal(exchange.registration.invoiceNumber, "INV-00125");
    assert.equal(exchange.registration.trnxId, `gi-${INVOICE}`);
    assert.equal(exchange.attempts.length, 1);
  });
});

describe("fiscal exchange boundaries", () => {
  it("does not read secrets, write the ledger, rebuild payloads, or change retries", () => {
    assert.equal(exchangeSource.includes("fiscal-secrets"), false);
    assert.equal(exchangeSource.includes("getValidFiscalToken"), false);
    assert.equal(exchangeSource.includes("getFiscalCredentials"), false);
    assert.equal(exchangeSource.includes("folio_transactions"), false);
    assert.equal(exchangeSource.includes("post_folio_transaction"), false);
    assert.equal(exchangeSource.includes(".insert("), false);
    assert.equal(exchangeSource.includes(".update("), false);
    assert.equal(payload.includes("redactFiscalExchange"), false);
    assert.equal(payload.includes("loadFiscalRegistrationExchange"), false);
    assert.equal(outbox.includes("fiscal-exchange"), false);
  });
});

function registrationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: REGISTRATION,
    restaurant_id: PROPERTY,
    source_type: "guest_invoice",
    source_id: INVOICE,
    fiscal_document_type: "INV",
    status: "REGISTERED",
    trnx_id: `gi-${INVOICE}`,
    external_status: "A",
    external_irn: "IRN-1",
    external_document_number: "2190",
    created_at: "2026-10-13T08:40:00.000Z",
    registered_at: "2026-10-13T08:42:00.000Z",
    acknowledged_at: "2026-10-13T08:42:00.000Z",
    attempt_count: 1,
    next_attempt_at: null,
    last_error_code: null,
    last_error_message: null,
    request_snapshot: { Type: "INV", device_id: "DEVICE-1", tax_payer_tin: "0026716178" },
    response_snapshot: { status: "A", irn: "IRN-1", documentNumber: "2190" },
    ...overrides,
  };
}

function attemptRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "attempt-1",
    registration_id: REGISTRATION,
    attempt_number: 1,
    started_at: "2026-10-13T08:42:00.000Z",
    completed_at: "2026-10-13T08:42:01.000Z",
    created_at: "2026-10-13T08:42:01.000Z",
    http_status: 200,
    outcome: "success",
    error_code: null,
    error_message: null,
    request_body: { Type: "INV" },
    response_body: { status: "A", documentNumber: "2190" },
    ...overrides,
  };
}

function memoryDb(tables: Record<string, Record<string, unknown>[]>): FiscalDb {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = Promise.resolve().then(() => {
        const data = (tables[table] ?? []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return { data, error: null } satisfies FiscalDbResult;
      }) as FiscalDbQuery;
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.insert = () => {
        throw new Error("inspector must not write");
      };
      query.update = () => {
        throw new Error("inspector must not write");
      };
      query.upsert = () => {
        throw new Error("inspector must not write");
      };
      query.maybeSingle = async () => {
        const result = await query;
        const data = Array.isArray(result.data) ? result.data : [];
        return { data: data[0] ?? null, error: null };
      };
      query.single = query.maybeSingle;
      return query;
    },
    rpc() {
      throw new Error("inspector must not call rpc");
    },
    schema() {
      throw new Error("inspector must not read vault");
    },
  };
}
