import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  draftWithGeneratedCode,
  friendlySetupError,
  setupCodeFromName,
} from "./setup-form-errors.ts";

describe("setup code from name", () => {
  it("turns a display name into an uppercase code", () => {
    assert.equal(setupCodeFromName("Market Segment"), "MARKET_SEGMENT");
    assert.equal(setupCodeFromName("Corporate Group", { style: "compact", max: 12 }), "CORPORATEGRO");
  });

  it("fills the code while creating until the code is edited", () => {
    const created = draftWithGeneratedCode(
      { id: null, name: "", code: "" },
      "name",
      "Late checkout",
      { codeTouched: false },
    );
    assert.equal(created.code, "LATE_CHECKOUT");
    const edited = draftWithGeneratedCode(
      { id: "row-1", name: "Late checkout", code: "LATE" },
      "name",
      "Early checkout",
      { codeTouched: false },
    );
    assert.equal(edited.code, "LATE");
  });
});

describe("friendly setup errors", () => {
  it("turns a Zod payload into a field message", () => {
    const raw = JSON.stringify([
      {
        code: "too_small",
        minimum: 1,
        type: "string",
        inclusive: true,
        exact: false,
        message: "String must contain at least 1 character(s)",
        path: ["name"],
      },
    ]);
    assert.equal(friendlySetupError(new Error(raw)), "Name is required.");
  });

  it("hides a duplicate-key database error", () => {
    assert.equal(
      friendlySetupError(
        new Error(
          'duplicate key value violates unique constraint "pms_market_segments_restaurant_id_code_key"',
        ),
      ),
      "That code is already used. Change the name or code and try again.",
    );
  });

  it("keeps a message that is already written for staff", () => {
    assert.equal(
      friendlySetupError(new Error("Enter a name before saving.")),
      "Enter a name before saving.",
    );
  });
});
