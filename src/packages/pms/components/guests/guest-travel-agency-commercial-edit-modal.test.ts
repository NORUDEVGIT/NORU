import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

describe("NORU PMS — Travel Agency Commercial Terms & Rates Workspace Editor Modal", () => {
  const modalCode = readRel("./guest-travel-agency-commercial-edit-modal.tsx");
  const commViewCode = readRel("./guest-travel-agent-commercial-commission-view.tsx");

  it("1. Exports GuestTravelAgencyCommercialEditModal component", () => {
    assert.match(
      modalCode,
      /export function GuestTravelAgencyCommercialEditModal/,
      "Must export GuestTravelAgencyCommercialEditModal",
    );
  });

  it("2. Loads Step 3 config and saves via saveTravelAgencyCommissionRates", () => {
    assert.match(
      modalCode,
      /getTravelAgencyCommissionRatesConfig/,
      "Must load existing agency rates configuration",
    );
    assert.match(
      modalCode,
      /saveTravelAgencyCommissionRates/,
      "Must persist updates via canonical saveTravelAgencyCommissionRates",
    );
  });

  it("3. Mounts GuestTravelAgencyCommissionRatesStep and CommercialSummaryPanel", () => {
    assert.match(
      modalCode,
      /<GuestTravelAgencyCommissionRatesStep/,
      "Must mount the canonical Step 3 rates editor",
    );
    assert.match(
      modalCode,
      /<CommercialSummaryPanel/,
      "Must render the live commercial summary preview panel",
    );
  });

  it("4. Supports both Commissionable and Net Rate draft initializations", () => {
    assert.match(
      modalCode,
      /commercialModel:\s*"net_rate"/,
      "Must properly initialize Net Rate draft when existingAgreement is present",
    );
    assert.match(
      modalCode,
      /commercialModel:\s*"commissionable"/,
      "Must properly initialize Commissionable draft when commission plan or rules are present",
    );
  });

  it("5. GuestTravelAgentCommercialCommissionView integrates edit modal and triggers", () => {
    assert.match(
      commViewCode,
      /GuestTravelAgencyCommercialEditModal/,
      "Commercial view must import and render GuestTravelAgencyCommercialEditModal",
    );
    assert.match(
      commViewCode,
      /edit-net-rate-agreement-button/,
      "Net Rate card must provide an Edit Terms trigger button",
    );
    assert.match(
      commViewCode,
      /edit-commission-rules-button/,
      "Granular rules card must provide an Edit Rules trigger button",
    );
    assert.match(
      commViewCode,
      /edit-commission-plan-button/,
      "Active plan card must provide an Edit Commercial Terms trigger button",
    );
  });
});
