import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MARKETING_NAV_HREFS } from "./allowlist.ts";
import { findForbiddenAvailableNowClaims, forbiddenClaimsForAvailableNowField } from "./claims.ts";
import {
  canHideOrUnpublishNavItem,
  canRemoveNavItem,
  missingProtectedNavRoles,
  parseMarketingHref,
  removeNavItem,
  setNavItemHref,
  setNavItemVisible,
  validateMarketingEditorContent,
} from "./editor.ts";
import {
  MarketingMockStore,
  createInitialMarketingSnapshot,
  resetMarketingMockStoreForTests,
} from "./mock-store.ts";
import { MARKETING_SEED } from "./seed.ts";
import { PROTECTED_NAV_ROLES } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

function draftFromSeed() {
  return structuredClone(MARKETING_SEED);
}

describe("marketing editor href allowlist", () => {
  it("rejects /admin and unknown free-typed paths", () => {
    const admin = parseMarketingHref("/admin");
    assert.equal(typeof admin === "string", false);
    if (typeof admin !== "string") assert.equal(admin.code, "admin_href");

    const nested = parseMarketingHref("/admin/marketing");
    assert.equal(typeof nested === "string", false);
    if (typeof nested !== "string") assert.equal(nested.code, "admin_href");

    const unknown = parseMarketingHref("/totally-made-up");
    assert.equal(typeof unknown === "string", false);
    if (typeof unknown !== "string") assert.equal(unknown.code, "unknown_href");
  });

  it("accepts only allowlisted public targets", () => {
    for (const href of MARKETING_NAV_HREFS) {
      assert.equal(parseMarketingHref(href), href);
    }
  });

  it("refuses to write an admin href onto a nav item", () => {
    assert.throws(() => setNavItemHref(MARKETING_SEED.nav, "packages", "/admin"), /Admin paths/);
  });
});

describe("protected Sign In / Sign Up / Register", () => {
  it("blocks remove and hide for every protected role", () => {
    for (const role of PROTECTED_NAV_ROLES) {
      const item = MARKETING_SEED.nav.find((entry) => entry.protectedRole === role);
      assert.ok(item, role);
      const remove = canRemoveNavItem(item);
      const hide = canHideOrUnpublishNavItem(item);
      assert.ok(remove);
      assert.ok(hide);
      assert.match(remove.message, /cannot be removed/);
      assert.match(hide.message, /cannot be unpublished or hidden/);
    }
  });

  it("throws when a caller tries to remove or hide a protected item", () => {
    const signIn = MARKETING_SEED.nav.find((item) => item.protectedRole === "sign_in");
    assert.ok(signIn);
    assert.throws(() => removeNavItem(MARKETING_SEED.nav, signIn.id), /cannot be removed/);
    assert.throws(() => setNavItemVisible(MARKETING_SEED.nav, signIn.id, false), /cannot be unpublished/);
  });

  it("reports missing protected roles", () => {
    const stripped = MARKETING_SEED.nav.filter((item) => item.protectedRole !== "register");
    const issues = missingProtectedNavRoles(stripped);
    assert.equal(
      issues.some((issue) => issue.code === "protected_nav_missing" && issue.path === "register"),
      true,
    );
  });
});

describe("forbidden Available-now claims", () => {
  it("blocks live OTA sync, digital invoicing, payroll, finance suite, and enterprise multi-property", () => {
    const samples = [
      "Live OTA channel sync",
      "digital invoicing",
      "BO payroll",
      "full finance suite",
      "enterprise multi-property",
    ];
    for (const sample of samples) {
      const hits = forbiddenClaimsForAvailableNowField("available_now", sample, "test");
      assert.ok(hits.length > 0, sample);
    }
    assert.equal(forbiddenClaimsForAvailableNowField("coming_soon", "Live OTA channel sync", "test").length, 0);
  });

  it("flags a draft that marks a forbidden claim Available now", () => {
    const draft = draftFromSeed();
    const ota = draft.packages.flatMap((pkg) => pkg.features).find((feature) => /OTA/i.test(feature.label));
    assert.ok(ota);
    ota.status = "available_now";
    const hits = findForbiddenAvailableNowClaims(draft);
    assert.ok(hits.some((hit) => hit.id === "live_ota"));
    const report = validateMarketingEditorContent(draft);
    assert.equal(report.ok, false);
    assert.equal(
      report.errors.some((error) => error.code === "forbidden_available_now"),
      true,
    );
  });
});

describe("marketing mock store", () => {
  it("starts from the honest seed and keeps social proof empty", () => {
    const store = new MarketingMockStore(createInitialMarketingSnapshot());
    assert.deepEqual(store.draft.partners, []);
    assert.deepEqual(store.draft.testimonials, []);
    assert.deepEqual(store.draft.caseStudies, []);
    assert.deepEqual(store.draft.blogPosts, []);
    assert.deepEqual(store.published.promoBanners, []);
  });

  it("publishes a valid draft and refuses an overselling Available-now draft", () => {
    const store = resetMarketingMockStoreForTests();
    store.updateDraft((draft) => {
      draft.hero.headline = "Run hotels on NORU — draft";
    });
    const published = store.publish();
    assert.equal(published.ok, true);
    assert.equal(store.published.hero.headline, "Run hotels on NORU — draft");

    store.updateDraft((draft) => {
      const ota = draft.packages.flatMap((pkg) => pkg.features).find((feature) => /OTA/i.test(feature.label));
      if (ota) ota.status = "available_now";
    });
    const blocked = store.publish();
    assert.equal(blocked.ok, false);
    assert.equal(store.published.hero.headline, "Run hotels on NORU — draft");
  });

  it("never mentions entitlement APIs in the stub store, editor, or Admin marketing UI", () => {
    const files = [
      "mock-store.ts",
      "editor.ts",
      "claims.ts",
      join(here, "../../components/admin/marketing-packages-form.tsx"),
      join(here, "../../components/admin/marketing-editor-provider.tsx"),
      join(here, "../../components/admin/marketing-overview.tsx"),
    ];
    for (const file of files) {
      const src = readFileSync(file.includes("/") ? file : join(here, file), "utf8");
      assert.equal(
        /from ["'][^"']*package-entitlements|setPropertyPackageEntitlement/.test(src),
        false,
        file,
      );
    }
  });
});
