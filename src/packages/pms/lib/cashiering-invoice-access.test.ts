import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cashieringInvoiceAccess } from "./cashiering-invoice-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

describe("cashieringInvoiceAccess", () => {
  it("maps invoice view, edit, and authorize grants", () => {
    const none = cashieringInvoiceAccess({ isOwner: false, codes: [] });
    assert.equal(none.canView, false);
    assert.equal(none.canEdit, false);
    assert.equal(none.canAuthorize, false);

    const edit = cashieringInvoiceAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.CASHIERING_INVOICE_EDIT],
    });
    assert.equal(edit.canEdit, true);
    assert.equal(edit.canAuthorize, false);

    const authorize = cashieringInvoiceAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.CASHIERING_INVOICE_AUTHORIZE],
    });
    assert.equal(authorize.canEdit, false);
    assert.equal(authorize.canAuthorize, true);

    const owner = cashieringInvoiceAccess({ isOwner: true, codes: [] });
    assert.equal(owner.canView, true);
    assert.equal(owner.canEdit, true);
    assert.equal(owner.canAuthorize, true);
  });
});
