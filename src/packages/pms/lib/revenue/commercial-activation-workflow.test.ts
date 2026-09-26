import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMERCIAL_ABSENT_VERSION } from "./commercial-engine.ts";
import {
  ACTIVATION_FREE_NIGHT_COPY,
  ACTIVATION_OVERLAP_COPY,
  ACTIVATION_PROMOTION_DUPLICATE_COPY,
  ACTIVATION_STEPS,
  activationErrorCopy,
  activationWizardStatus,
  canApplyReviewedPreview,
  clientDatesValid,
  emptyPackageDraft,
  emptyPromotionDraft,
  isDuplicateActivationError,
  isStaleActivationError,
  packageApplyPayload,
  packageDatesCanAdvance,
  packageDraftFingerprint,
  packageDraftIsDirty,
  packagePreviewPayload,
  packageSelectCanAdvance,
  previewStillMatchesPromotion,
  promotionApplyPayload,
  promotionDatesCanAdvance,
  promotionDraftFingerprint,
  promotionDraftIsDirty,
  promotionPreviewPayload,
  promotionSelectCanAdvance,
} from "./commercial-activation-workflow.ts";
import type { PromotionActivationPreview } from "./commercial-promotion-activation.ts";
import type { PackageActivationPreview } from "./commercial-package-activation.ts";
import { REVENUE_UI_SCREEN_MAP } from "../rate-revenue-workspace.ts";
import { CARD3_PACKAGES_HREF, CARD3_PROMOTIONS_HREF, card3DomainFromSearch, card3DomainHref } from "../pms-property-setup-card3.ts";
import { SET1_HUB_HREF } from "../pms-set1-foundation.ts";
import { buildPromotionMasterRow, filterPromotionRows, type PromotionWorkspaceMaster } from "./commercial-overview.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function promotionPreview(overrides: Partial<PromotionActivationPreview> = {}): PromotionActivationPreview {
  return {
    operation: "CREATE",
    master: null,
    currentActivation: null,
    proposedActivation: {
      promotionId: "22222222-2222-4222-8222-222222222222",
      validFrom: "2026-09-20",
      validTo: "2026-10-10",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
      priority: 100,
      active: true,
      reason: null,
      promotionCode: "SPRING10",
      promotionName: "Spring 10",
      promoKind: "percent",
      promoValue: 10,
      masterValidFrom: "2026-09-01",
      masterValidTo: "2026-12-31",
      masterRoomTypeIds: [],
      roomTypeIds: [],
      ratePlanIds: [],
    },
    roomTypeScope: { selected: [], effective: [], all: true },
    ratePlanScope: { selected: [], effective: [], all: true },
    warnings: [],
    errors: [],
    expectedVersion: COMMERCIAL_ABSENT_VERSION,
    changedFields: [],
    before: null,
    after: null,
    actionType: "promotion_activation_created",
    ...overrides,
  };
}

describe("RR-P5-UI-03 commercial activation workflow", () => {
  it("keeps UI-20 as an overlay, not a workspace view", () => {
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-20")?.view, null);
    const workspace = readRel("../rate-revenue-workspace.ts");
    assert.doesNotMatch(workspace, /view=activation|view: "activation"/);
    assert.equal(ACTIVATION_STEPS.length, 6);
  });

  it("gates select, dates, and free-night", () => {
    assert.equal(promotionSelectCanAdvance({ kind: "percent", active: true }), true);
    assert.equal(promotionSelectCanAdvance({ kind: "free_night", active: true }), false);
    assert.equal(promotionSelectCanAdvance({ kind: "percent", active: false }), false);
    assert.equal(packageSelectCanAdvance({ active: true }), true);
    assert.equal(packageSelectCanAdvance({ active: false }), false);
    assert.equal(clientDatesValid("2026-09-20", "2026-09-10"), false);
    assert.equal(clientDatesValid("2026-09-20", "2026-09-20"), true);
    const promo = emptyPromotionDraft("22222222-2222-4222-8222-222222222222");
    assert.equal(promotionDatesCanAdvance(promo), false);
    assert.equal(promotionDatesCanAdvance({
      ...promo,
      validFrom: "2026-09-20",
      validTo: "2026-10-10",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
    }), true);
    assert.equal(packageDatesCanAdvance({
      ...emptyPackageDraft(),
      validFrom: "2026-09-20",
      validTo: "2026-09-22",
    }), true);
    assert.equal(activationErrorCopy("PROMOTION_KIND_UNSUPPORTED"), ACTIVATION_FREE_NIGHT_COPY);
  });

  it("treats overlap as warning and duplicate as block", () => {
    assert.equal(activationWizardStatus([], 1), "warnings");
    assert.equal(activationWizardStatus(["PROMOTION_ACTIVATION_DUPLICATE"], 1), "blocked");
    assert.equal(isDuplicateActivationError("PROMOTION_ACTIVATION_DUPLICATE"), true);
    assert.equal(isDuplicateActivationError("PACKAGE_ACTIVATION_DUPLICATE"), true);
    assert.equal(isDuplicateActivationError("PROMOTION_ACTIVATION_OVERLAP"), false);
    assert.equal(activationErrorCopy("PROMOTION_ACTIVATION_DUPLICATE"), ACTIVATION_PROMOTION_DUPLICATE_COPY);
    assert.match(ACTIVATION_OVERLAP_COPY, /overlaps this stay window/);
  });

  it("invalidates preview after material draft edits and refuses apply", () => {
    const draft = {
      ...emptyPromotionDraft("22222222-2222-4222-8222-222222222222"),
      validFrom: "2026-09-20",
      validTo: "2026-10-10",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
    };
    const fingerprint = promotionDraftFingerprint(draft);
    assert.equal(previewStillMatchesPromotion(fingerprint, draft), true);
    const edited = { ...draft, validTo: "2026-10-20" };
    assert.equal(previewStillMatchesPromotion(fingerprint, edited), false);
    assert.equal(canApplyReviewedPreview(fingerprint, promotionDraftFingerprint(edited), true), false);
    assert.equal(canApplyReviewedPreview(fingerprint, fingerprint, true), true);
    assert.equal(canApplyReviewedPreview(fingerprint, fingerprint, false), false);
    const reasonOnly = { ...draft, reason: "Seasonal" };
    assert.equal(promotionDraftFingerprint(reasonOnly), fingerprint);
    assert.equal(promotionDraftIsDirty(draft, draft.promotionId), true);
    assert.equal(packageDraftIsDirty(emptyPackageDraft(), null), false);
    assert.notEqual(packageDraftFingerprint(emptyPackageDraft("a")), packageDraftFingerprint(emptyPackageDraft("b")));
  });

  it("applies from proposed preview state and absent version", () => {
    const preview = promotionPreview();
    const payload = promotionApplyPayload("11111111-1111-4111-8111-111111111111", preview, "Launch");
    assert.deepEqual(payload, {
      restaurantId: "11111111-1111-4111-8111-111111111111",
      operation: "CREATE",
      promotionId: preview.proposedActivation?.promotionId,
      validFrom: "2026-09-20",
      validTo: "2026-10-10",
      bookingFrom: "2026-09-01",
      bookingTo: "2026-09-30",
      priority: 100,
      roomTypeIds: [],
      ratePlanIds: [],
      reason: "Launch",
      expectedVersion: COMMERCIAL_ABSENT_VERSION,
    });
    assert.equal(promotionPreviewPayload("11111111-1111-4111-8111-111111111111", emptyPromotionDraft()).expectedVersion, COMMERCIAL_ABSENT_VERSION);
    const packagePreview: PackageActivationPreview = {
      operation: "CREATE",
      master: null,
      currentActivation: null,
      proposedActivation: {
        packageId: "33333333-3333-4333-8333-333333333333",
        validFrom: "2026-09-20",
        validTo: "2026-10-10",
        active: true,
        reason: null,
        packageCode: "BB",
        packageName: "Bed & Breakfast",
        packageType: "meal",
        packagePrice: 25,
        chargeBasis: "per_stay",
        components: [{ label: "Breakfast", componentType: "meal_plan", quantity: 2, componentId: null }],
        masterRoomTypeIds: [],
        masterRatePlanIds: [],
        roomTypeIds: [],
        ratePlanIds: [],
      },
      roomTypeScope: { selected: [], effective: [], all: true },
      ratePlanScope: { selected: [], effective: [], all: true },
      warnings: [],
      errors: [],
      expectedVersion: COMMERCIAL_ABSENT_VERSION,
      changedFields: [],
      before: null,
      after: null,
      actionType: "package_activation_created",
    };
    const packagePayload = packageApplyPayload("11111111-1111-4111-8111-111111111111", packagePreview, "");
    assert.equal(packagePayload?.operation, "CREATE");
    assert.equal(packagePayload?.expectedVersion, COMMERCIAL_ABSENT_VERSION);
    assert.equal(packagePayload?.packageId, packagePreview.proposedActivation?.packageId);
    assert.equal(packagePreviewPayload("11111111-1111-4111-8111-111111111111", emptyPackageDraft()).operation, "CREATE");
    assert.equal(isStaleActivationError("COMMERCIAL_ACTIVATION_STALE"), true);
  });

  it("builds promotion master-only rows and filters Not Activated", () => {
    const master: PromotionWorkspaceMaster = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "SPRING10",
      name: "Spring 10",
      kind: "percent",
      value: 10,
      validFrom: "2026-09-01",
      validTo: "2026-12-31",
      active: true,
      roomTypeIds: [],
    };
    const row = buildPromotionMasterRow(master, { roomNames: new Map(), planNames: new Map() });
    assert.equal(row.rowKind, "master");
    assert.equal(row.displayStatus, "not_activated");
    assert.equal(filterPromotionRows([row], { status: "not_activated" }).length, 1);
    assert.equal(filterPromotionRows([row], { status: "active" }).length, 0);
  });

  it("wires entry points, preview/apply CREATE, deep links, and no forbidden UI", () => {
    const overview = readRel("../../components/rates/commercial-overview/commercial-overview-view.tsx");
    const promotions = readRel("../../components/rates/promotions/promotions-view.tsx");
    const packages = readRel("../../components/rates/packages/packages-view.tsx");
    const promoFlow = readRel("../../components/rates/commercial-activation/promotion-activation-flow.tsx");
    const packageFlow = readRel("../../components/rates/commercial-activation/package-activation-flow.tsx");
    const workflow = readRel("../../components/rates/commercial-activation/commercial-activation-workflow.tsx");
    const review = readRel("../../components/rates/commercial-activation/activation-review.tsx");
    const validation = readRel("../../components/rates/commercial-activation/activation-validation.tsx");
    const card3 = readRel("../pms-property-setup-card3.ts");
    const section = readRel("../../components/settings/pms-property-setup-card3-section.tsx");
    const promoDrawer = readRel("../../components/rates/promotions/promotion-detail-drawer.tsx");
    const packageDrawer = readRel("../../components/rates/packages/package-detail-drawer.tsx");

    assert.match(overview, /Create Activation/);
    assert.match(overview, /CommercialActivationWorkflow/);
    assert.match(overview, /source="overview"/);
    assert.match(promotions, /Activate Promotion/);
    assert.match(promotions, /initialKind="promotion"/);
    assert.match(promotions, /initialPromotionId/);
    assert.match(promotions, /onActivate/);
    assert.match(packages, /Activate Package/);
    assert.match(packages, /initialKind="package"/);
    assert.match(packages, /initialPackageId/);
    assert.match(promoFlow, /previewPromotionActivation/);
    assert.match(promoFlow, /applyPromotionActivation/);
    assert.match(promoFlow, /promotionPreviewPayload|promotionApplyPayload/);
    assert.match(promoFlow, /Promotion activated/);
    assert.match(packageFlow, /previewPackageActivation/);
    assert.match(packageFlow, /applyPackageActivation/);
    assert.match(packageFlow, /packagePreviewPayload|packageApplyPayload/);
    assert.match(packageFlow, /Package activated/);
    assert.match(readRel("./commercial-activation-workflow.ts"), /operation: "CREATE"/);
    assert.match(workflow, /Activate Commercial Item/);
    assert.match(validation, /PROMOTION_ACTIVATION_OVERLAP|ACTIVATION_OVERLAP_COPY/);
    assert.match(validation, /Blocked/);
    assert.match(review, /Components Snapshot/);
    assert.match(review, /Breakfast|packageComponentLabel/);
    assert.doesNotMatch(review, /Expected Bookings|Expected Revenue|Expected Occupancy|Expected RevPAR|Revenue Uplift|ROI/);
    assert.doesNotMatch(workflow, /OTA|Market Segment|Coupon|Day of week|Approve|Publish to Channels/);
    assert.match(card3, /CARD3_PROMOTIONS_HREF/);
    assert.match(card3, /CARD3_PACKAGES_HREF/);
    assert.match(section, /card3DomainFromSearch/);
    assert.match(promoDrawer, /CARD3_PROMOTIONS_HREF/);
    assert.match(packageDrawer, /CARD3_PACKAGES_HREF/);
    assert.equal(CARD3_PROMOTIONS_HREF, `${SET1_HUB_HREF}?card3Domain=revenue-commercial-rules#financial-commercial`);
    assert.equal(CARD3_PACKAGES_HREF, `${SET1_HUB_HREF}?card3Domain=meal-plans-packages#financial-commercial`);
    assert.equal(card3DomainFromSearch("?card3Domain=meal-plans-packages"), "meal-plans-packages");
    assert.equal(card3DomainHref("revenue-commercial-rules"), CARD3_PROMOTIONS_HREF);
  });
});
