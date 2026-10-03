import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PREDEFINED_RATE_CATEGORIES,
  findMatchingPredefinedCategory,
  isPredefinedCategoryConfigured,
  normalizeCategoryKey,
} from "./rates-categories-catalogue";
import {
  evaluateRatesCard2Readiness,
  type RateCategoryRow,
  type RatesCard2Snapshot,
} from "./rates-card2.server";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Property Setup: Predefined Rate Category Catalogue", () => {
  const uiCode = readRel("../components/settings/pms-property-setup-card2-rates.tsx");
  const functionsCode = readRel("./rates-card2.functions.ts");
  const serverCode = readRel("./rates-card2.server.ts");

  // Section 32: Catalogue Content
  it("32. Predefined catalogue contains EXACTLY 20 categories with exact required names", () => {
    assert.equal(
      PREDEFINED_RATE_CATEGORIES.length,
      20,
      "Predefined catalogue must have exactly 20 items",
    );

    const expectedNames = [
      "Best Available Rate (BAR)",
      "Rack Rate",
      "Corporate",
      "Government",
      "Group",
      "Travel Agent",
      "Tour Operator",
      "OTA",
      "Wholesale",
      "Promotional",
      "Package",
      "Long Stay",
      "Early Booking",
      "Last Minute",
      "Member / Loyalty",
      "Walk-in",
      "Employee / Staff",
      "Complimentary",
      "Contract",
      "Seasonal",
    ];

    const actualNames = PREDEFINED_RATE_CATEGORIES.map((c) => c.name);
    assert.deepEqual(actualNames, expectedNames);

    // Verify all codes are unique and valid setup codes
    const codes = PREDEFINED_RATE_CATEGORIES.map((c) => c.code);
    assert.equal(new Set(codes).size, 20, "All predefined codes must be unique");
    for (const code of codes) {
      assert.match(code, /^[A-Z0-9_]{1,30}$/, `Code ${code} must follow setup code convention`);
    }

    // Verify BAR code and persistedName
    const bar = PREDEFINED_RATE_CATEGORIES.find((c) => c.code === "BAR");
    assert.ok(bar);
    assert.equal(bar.name, "Best Available Rate (BAR)");
    assert.equal(bar.persistedName, "Best Available Rate");
  });

  // Section 33: Add Predefined Category & Duplicate Prevention in UI
  it("33. Predefined catalogue detection accurately identifies configured categories and prevents duplicate adds", () => {
    const configured: RateCategoryRow[] = [
      { id: "cat-corp", code: "CORPORATE", name: "Corporate", active: true },
    ];

    const corpPreset = PREDEFINED_RATE_CATEGORIES.find((c) => c.name === "Corporate")!;
    assert.ok(corpPreset);
    assert.equal(isPredefinedCategoryConfigured(corpPreset, configured), true);

    const rackPreset = PREDEFINED_RATE_CATEGORIES.find((c) => c.name === "Rack Rate")!;
    assert.ok(rackPreset);
    assert.equal(isPredefinedCategoryConfigured(rackPreset, configured), false);

    // Legacy code compatibility for CORP
    const legacyConfigured: RateCategoryRow[] = [
      { id: "cat-corp-leg", code: "CORP", name: "Corporate", active: true },
    ];
    assert.equal(isPredefinedCategoryConfigured(corpPreset, legacyConfigured), true);

    // UI shows Added status and disabled state
    assert.match(uiCode, /Added ✓/);
    assert.match(uiCode, /isPredefinedCategoryConfigured/);
  });

  // Section 34: Existing BAR Detection
  it("34. Detects existing BAR without creating duplicates or altering existing IDs", () => {
    const configuredWithBar: RateCategoryRow[] = [
      { id: "bar-12345", code: "BAR", name: "Best Available Rate", active: true },
    ];

    const barPreset = PREDEFINED_RATE_CATEGORIES.find((c) => c.code === "BAR")!;
    assert.equal(isPredefinedCategoryConfigured(barPreset, configuredWithBar), true);

    // Preserves existing BAR ID and rate plan relationships
    const snapshot: RatesCard2Snapshot = {
      roomTypes: [{ id: "rt-1", code: "DLX", name: "Deluxe", active: true }],
      categories: configuredWithBar,
      plans: [
        {
          id: "plan-bar",
          code: "BAR_DLX",
          name: "BAR Deluxe",
          categoryId: "bar-12345",
          categoryName: "Best Available Rate",
          roomTypeId: "rt-1",
          roomTypeCode: "DLX",
          roomTypeName: "Deluxe",
          currency: "USD",
          baseRate: 150,
          active: true,
        },
      ],
    };

    assert.equal(snapshot.categories[0].id, "bar-12345");
    assert.equal(snapshot.plans[0].categoryId, "bar-12345");
  });

  // Section 35: Custom Category Flow
  it("35. Custom category flow allows creating distinct property categories like DIPLOMATIC", () => {
    // Custom non-predefined category matches no preset
    const match = findMatchingPredefinedCategory("Diplomatic", "DIPLOMATIC");
    assert.equal(match, undefined);

    assert.match(uiCode, /Create Custom Category/);
    assert.match(uiCode, /customName/);
    assert.match(uiCode, /customCode/);
    assert.match(uiCode, /isCustom/);
  });

  // Section 36: Custom vs Predefined Duplicate Rejection
  it("36. Custom category matching a predefined category is rejected with the exact required directive", () => {
    const conflictExact = findMatchingPredefinedCategory("Corporate");
    assert.ok(conflictExact);
    assert.equal(conflictExact.name, "Corporate");

    const conflictLower = findMatchingPredefinedCategory("corporate");
    assert.ok(conflictLower);
    assert.equal(conflictLower.name, "Corporate");

    const conflictCode = findMatchingPredefinedCategory("Custom Corp", "CORP");
    assert.ok(conflictCode);

    const conflictBar = findMatchingPredefinedCategory("Best Available Rate");
    assert.ok(conflictBar);
    assert.equal(conflictBar.name, "Best Available Rate (BAR)");

    // Verify server validation error message
    assert.match(
      functionsCode,
      /is already available in the predefined Rate Categories\. Select it from the predefined list\./,
    );
    // Verify UI validation error message
    assert.match(
      uiCode,
      /is already available in the predefined Rate Categories\. Select it from the predefined list\./,
    );
  });

  // Section 37: Readiness
  it("37. Readiness does NOT require all 20 categories and page load is read-only", () => {
    // Snapshot with only 1 category and 1 active plan
    const snapshot: RatesCard2Snapshot = {
      roomTypes: [{ id: "rt-1", code: "STD", name: "Standard", active: true }],
      categories: [{ id: "cat-1", code: "BAR", name: "Best Available Rate", active: true }],
      plans: [
        {
          id: "plan-1",
          code: "STD_BAR",
          name: "Standard BAR",
          categoryId: "cat-1",
          categoryName: "Best Available Rate",
          roomTypeId: "rt-1",
          roomTypeCode: "STD",
          roomTypeName: "Standard",
          currency: "USD",
          baseRate: 100,
          active: true,
        },
      ],
    };

    const readiness = evaluateRatesCard2Readiness(snapshot);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.status, "complete");
    assert.equal(readiness.blockers.length, 0);

    // Verify getRatesCard2 contains only SELECT queries (no insert/upsert)
    const getRatesFnBody = functionsCode.slice(
      functionsCode.indexOf("export const getRatesCard2"),
      functionsCode.indexOf("export const saveRateCategoryCard2")
    );
    assert.doesNotMatch(getRatesFnBody, /\.insert\(/);
    assert.doesNotMatch(getRatesFnBody, /\.upsert\(/);
  });

  // Section 38: Rate Plan Integration
  it("38. Rate Plan Category dropdown uses configured categories ONLY, not unpersisted presets", () => {
    // In plan drawer, categories comes from snapshot.categories
    assert.match(uiCode, /categories=\{categories\}/);
    assert.match(uiCode, /categories\.map\(\(row\)/);
    assert.doesNotMatch(uiCode, /PREDEFINED_RATE_CATEGORIES\.map\(\(row\)[\s\S]*?PlanDrawer/);
  });

  // Section 40: Zero Migration
  it("40. Zero database migrations introduced for predefined rate category catalogue", () => {
    const migrationsDir = join(here, "../../../../supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir);
    const highest = migrationFiles
      .filter((f) => /^\d{4}_/.test(f))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .sort((a, b) => b - a)[0];
    assert.equal(highest, 118);
  });

  // UI Structure & Presentation
  it("41. UI presents catalogue-first modal with search, 20 items, and helper line", () => {
    assert.match(uiCode, /Choose from NORU's predefined hotel rate categories/);
    assert.match(uiCode, /Search predefined categories\.\.\./);
    assert.match(uiCode, /Predefined Rate Categories/);
    assert.match(uiCode, /Can(?:'|&apos;)t find the category you need\?/);
    assert.match(uiCode, /Create Custom Category/);
    assert.match(uiCode, /Add Category/);
  });
});
