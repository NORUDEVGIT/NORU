import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fiscalInvoiceListStatus } from "./fiscal-invoice-list-status.ts";

describe("invoice list fiscal status", () => {
  it("reports cash and credit invoice registration without using settlement", () => {
    assert.equal(fiscalInvoiceListStatus([]), "not_registered");
    assert.equal(fiscalInvoiceListStatus(["CANCELLED"]), "not_registered");
    assert.equal(fiscalInvoiceListStatus(["REGISTERED"]), "registered");
    assert.equal(fiscalInvoiceListStatus(["FAILED"]), "error");
    assert.equal(fiscalInvoiceListStatus(["BLOCKED"]), "error");
    assert.equal(fiscalInvoiceListStatus(["PENDING"]), "queued");
    assert.equal(fiscalInvoiceListStatus(["FAILED", "REGISTERED"]), "registered");
  });
});
