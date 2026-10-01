import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CARD4_COMPATIBILITY_STEPS,
  CARD4_STEPS,
  card4StepById,
  evaluateCard4StepStatus,
  nextCard4Step,
  previousCard4Step,
} from "./pms-property-setup-card4";

describe("Card 4 Guest & Service Top Navigation Omission & Compatibility", () => {
  it("omits Required Fields, Identity Documents, and Preferences from visible top navigation", () => {
    assert.equal(CARD4_STEPS.length, 3);
    const stepIds = CARD4_STEPS.map((s) => s.id);
    assert.deepEqual(stepIds, ["profile-types", "company-business", "group-types"]);

    // Explicitly verify the 3 omitted steps are NOT in visible CARD4_STEPS
    assert.equal(stepIds.includes("required-fields" as never), false);
    assert.equal(stepIds.includes("identity-documents" as never), false);
    assert.equal(stepIds.includes("preferences" as never), false);
  });

  it("retains backward-compatible definitions in CARD4_COMPATIBILITY_STEPS", () => {
    const compatIds = CARD4_COMPATIBILITY_STEPS.map((s) => s.id);
    assert.deepEqual(compatIds, ["required-fields", "identity-documents", "preferences"]);
  });

  it("resolves both canonical steps and compatibility steps via card4StepById", () => {
    assert.equal(card4StepById("profile-types").title, "Profile Types");
    assert.equal(card4StepById("company-business").title, "Company & Business");
    assert.equal(card4StepById("group-types").title, "Group Types");

    // Compatibility step resolution
    assert.equal(card4StepById("required-fields").title, "Required Fields");
    assert.equal(card4StepById("identity-documents").title, "Identity Documents");
    assert.equal(card4StepById("preferences").title, "Preferences");

    // Unknown step fallback
    assert.equal(card4StepById("unknown-step").id, "profile-types");
  });

  it("correctly traverses visible step navigation", () => {
    assert.equal(previousCard4Step("profile-types"), null);
    assert.equal(nextCard4Step("profile-types"), "company-business");

    assert.equal(previousCard4Step("company-business"), "profile-types");
    assert.equal(nextCard4Step("company-business"), "group-types");

    assert.equal(previousCard4Step("group-types"), "company-business");
    assert.equal(nextCard4Step("group-types"), null);
  });

  it("evaluates readiness for canonical steps and preserves compatibility evaluations", () => {
    // Canonical steps
    assert.equal(evaluateCard4StepStatus("profile-types", undefined, true), "complete");
    assert.equal(evaluateCard4StepStatus("profile-types", undefined, false), "not_started");
    assert.equal(evaluateCard4StepStatus("profile-types", "in_progress", false), "in_progress");

    assert.equal(
      evaluateCard4StepStatus("company-business", undefined, true, false, false, false, true),
      "complete",
    );
    assert.equal(
      evaluateCard4StepStatus("group-types", undefined, true, false, false, false, false, true),
      "complete",
    );

    // Compatibility aliases
    assert.equal(evaluateCard4StepStatus("required-fields", undefined, true, true), "complete");
    assert.equal(
      evaluateCard4StepStatus("identity-documents", undefined, true, false, true),
      "complete",
    );
    assert.equal(
      evaluateCard4StepStatus("preferences", undefined, true, false, false, true),
      "complete",
    );
  });
});
