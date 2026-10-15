import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openCompanyTransferLink } from "./cashiering-transfer-company-link.ts";

const profile = [
  { masterId: "bill", role: "bill_to" as const },
  { masterId: "employer", role: "employer" as const },
];

describe("open company transfer link", () => {
  it("labels an open stay company and an open profile company", () => {
    assert.deepEqual(
      openCompanyTransferLink({
        masterId: "stay",
        accountOpen: true,
        stayMasterId: "stay",
        profileLinks: profile,
      }),
      { linked: true, label: "Linked company · this stay", rank: 0 },
    );
    assert.equal(
      openCompanyTransferLink({
        masterId: "bill",
        accountOpen: true,
        stayMasterId: "stay",
        profileLinks: profile,
      }).label,
      "Linked company · Bill-to",
    );
    assert.equal(
      openCompanyTransferLink({
        masterId: "employer",
        accountOpen: true,
        stayMasterId: null,
        profileLinks: profile,
      }).label,
      "Linked company · Employer",
    );
  });

  it("does not label a closed account or an unrelated open account", () => {
    assert.equal(
      openCompanyTransferLink({
        masterId: "stay",
        accountOpen: false,
        stayMasterId: "stay",
        profileLinks: profile,
      }).linked,
      false,
    );
    assert.equal(
      openCompanyTransferLink({
        masterId: "other",
        accountOpen: true,
        stayMasterId: "stay",
        profileLinks: profile,
      }).label,
      null,
    );
  });
});
