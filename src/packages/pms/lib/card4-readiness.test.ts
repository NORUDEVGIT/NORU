import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyPropertySetupStatus, evaluateProgrammeCardStatus } from "./pms-property-setup-card1.ts";
import {
  CARD4_PROGRAMME_CARD_ID,
  evaluateCard4OverallStatus,
  mergeCard4Status,
} from "./pms-property-setup-card4.ts";

const hubSrc = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const sectionSrc = readFileSync(
  new URL("../components/settings/pms-property-setup-card4-section.tsx", import.meta.url),
  "utf8",
);

describe("Card 4 Programme Status & Readiness", () => {
  it("uses the housekeeping-maintenance legacy programme id", () => {
    assert.equal(CARD4_PROGRAMME_CARD_ID, "housekeeping-maintenance");
  });

  it("merges Card 4 status into property setup cards", () => {
    const initial = emptyPropertySetupStatus({
      cards: { "property-business": "complete" },
    });
    const mergedComplete = mergeCard4Status(initial, "complete");
    assert.equal(mergedComplete.cards["housekeeping-maintenance"], "complete");
    assert.equal(mergedComplete.cards["property-business"], "complete");
    assert.equal(
      evaluateProgrammeCardStatus(CARD4_PROGRAMME_CARD_ID, mergedComplete, "complete"),
      "complete",
    );

    const mergedInProgress = mergeCard4Status(initial, "in_progress");
    assert.equal(mergedInProgress.cards["housekeeping-maintenance"], "in_progress");
    assert.equal(
      evaluateProgrammeCardStatus(CARD4_PROGRAMME_CARD_ID, mergedInProgress, "complete"),
      "in_progress",
    );
  });

  it("evaluates overall status accurately across all domains", () => {
    // Complete when all domains configured
    const complete = evaluateCard4OverallStatus({
      profileTypesConfigured: true,
      requiredFieldsConfigured: true,
      identityDocumentsConfigured: true,
      preferencesConfigured: true,
      companyBusinessConfigured: true,
      groupTypesConfigured: true,
      travelAgencyTypesConfigured: true,
      serviceCategoriesConfigured: true,
      serviceTypesConfigured: true,
      servicePricingConfigured: true,
      serviceDepartmentAssignmentsConfigured: true,
      serviceSlaRulesConfigured: true,
      serviceAvailabilityConfigured: true,
      communicationChannelsConfigured: true,
      communicationTemplatesConfigured: true,
      notificationEventsConfigured: true,
      automationRulesConfigured: true,
      senderSettingsConfigured: true,
      communicationDefaultsConfigured: true,
    });
    assert.equal(complete, "complete");

    // In progress when partially configured
    const inProgress = evaluateCard4OverallStatus({
      profileTypesConfigured: true,
      requiredFieldsConfigured: false,
    });
    assert.equal(inProgress, "in_progress");

    // In progress when only services are configured
    const servicesOnly = evaluateCard4OverallStatus({
      profileTypesConfigured: false,
      serviceCategoriesConfigured: true,
      serviceTypesConfigured: true,
    });
    assert.equal(servicesOnly, "in_progress");

    // Not started when nothing is configured
    const notStarted = evaluateCard4OverallStatus({
      profileTypesConfigured: false,
    });
    assert.equal(notStarted, "not_started");
  });

  it("integrates with hub dashboard statuses and section persistence", () => {
    assert.match(hubSrc, /getPmsCard4Status/);
    assert.match(hubSrc, /card4StatusQuery/);
    assert.match(hubSrc, /card\.number === 4/);
    assert.match(sectionSrc, /persistPmsCard4Status/);
    assert.match(sectionSrc, /evaluateCard4OverallStatus/);
  });
});
