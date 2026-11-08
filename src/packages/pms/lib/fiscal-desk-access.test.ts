import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fiscalDeskAccess } from "./fiscal-desk-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

describe("fiscalDeskAccess", () => {
  it("maps fiscal view and authorize grants", () => {
    const none = fiscalDeskAccess({ isOwner: false, codes: [] });
    assert.equal(none.canView, false);
    assert.equal(none.canRegister, false);
    assert.equal(none.canInspect, false);

    const viewOnly = fiscalDeskAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.FISCAL_VIEW],
    });
    assert.equal(viewOnly.canView, true);
    assert.equal(viewOnly.canRegister, false);
    assert.equal(viewOnly.canInspect, true);

    const register = fiscalDeskAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE],
    });
    assert.equal(register.canView, false);
    assert.equal(register.canRegister, true);

    const owner = fiscalDeskAccess({ isOwner: true, codes: [] });
    assert.equal(owner.canView, true);
    assert.equal(owner.canRegister, true);
    assert.equal(owner.canInspect, true);
  });
});
