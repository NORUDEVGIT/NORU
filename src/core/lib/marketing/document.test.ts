import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  applyMarketingMutation,
  assertMarketingAdmin,
  createSeedMarketingSnapshot,
  evaluatePublish,
  evaluateSaveDraft,
} from "./document.ts";
import { findDuplicateContentSlugs } from "./editor.ts";
import { getMarketingContent } from "./resolve.ts";
import { MARKETING_SEED } from "./seed.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function draftFromSeed() {
  return structuredClone(MARKETING_SEED);
}

describe("marketing CMS authorization", () => {
  it("rejects non-admin mutations", () => {
    assert.throws(() => assertMarketingAdmin(false), /Administrator access required/);
    assert.throws(
      () =>
        applyMarketingMutation({
          isAdmin: false,
          action: "saveDraft",
          draft: draftFromSeed(),
          current: createSeedMarketingSnapshot(),
        }),
      /Administrator access required/,
    );
    assert.throws(
      () =>
        applyMarketingMutation({
          isAdmin: false,
          action: "publish",
          current: createSeedMarketingSnapshot(),
        }),
      /Administrator access required/,
    );
  });
});

describe("marketing CMS allowlist and slugs", () => {
  it("refuses to persist a free-typed /admin nav href", () => {
    const draft = draftFromSeed();
    draft.nav[0]!.href = "/admin" as typeof draft.nav[0]["href"];
    const saved = evaluateSaveDraft(draft);
    assert.equal(saved.persist, false);
    assert.equal(saved.report.errors.some((error) => error.code === "admin_href"), true);

    const current = createSeedMarketingSnapshot();
    const result = applyMarketingMutation({
      isAdmin: true,
      action: "saveDraft",
      draft,
      current,
    });
    assert.equal(result.ok, false);
    assert.equal(result.snapshot.draft.nav[0]?.href, current.draft.nav[0]?.href);
  });

  it("rejects duplicate blog slugs", () => {
    const draft = draftFromSeed();
    draft.blogPosts = [
      {
        id: "a",
        slug: "same-story",
        title: "One",
        excerpt: "a",
        published: false,
        order: 1,
      },
      {
        id: "b",
        slug: "same-story",
        title: "Two",
        excerpt: "b",
        published: false,
        order: 2,
      },
    ];
    const issues = findDuplicateContentSlugs(draft);
    assert.equal(issues.some((issue) => issue.code === "slug_duplicate"), true);
    const saved = evaluateSaveDraft(draft);
    assert.equal(saved.persist, false);
  });
});

describe("forbidden Available-now is enforced server-side", () => {
  it("does not publish an overselling draft and keeps the last-good published document", () => {
    const current = createSeedMarketingSnapshot();
    current.published.hero.headline = "Last good headline";
    const draft = draftFromSeed();
    const ota = draft.packages.flatMap((pkg) => pkg.features).find((feature) => /OTA/i.test(feature.label));
    assert.ok(ota);
    ota.status = "available_now";

    const published = evaluatePublish(draft, current);
    assert.equal(published.ok, false);
    assert.equal(
      published.report.errors.some((error) => error.code === "forbidden_available_now"),
      true,
    );
    assert.equal(published.snapshot.published.hero.headline, "Last good headline");
  });
});

describe("honest seed fallback and empty social proof", () => {
  it("returns the seed when published is missing or invalid", () => {
    assert.equal(getMarketingContent().brand.siteName, "NORU");
    assert.equal(getMarketingContent(null).hero.headline, MARKETING_SEED.hero.headline);
    assert.equal(getMarketingContent({} as never).brand.siteName, MARKETING_SEED.brand.siteName);
  });

  it("keeps social proof empty on the seed snapshot", () => {
    const snapshot = createSeedMarketingSnapshot();
    assert.deepEqual(snapshot.draft.partners, []);
    assert.deepEqual(snapshot.draft.testimonials, []);
    assert.deepEqual(snapshot.published.caseStudies, []);
    assert.deepEqual(snapshot.published.blogPosts, []);
  });
});

describe("publish does not touch entitlements", () => {
  const importPattern = /from ["'][^"']*package-entitlements|setPropertyPackageEntitlement/;
  const mutatePattern =
    /\.(from|insert|update|upsert|delete)\(\s*["']restaurant_package_entitlements["']/;

  it("document helpers and server wiring never import or mutate entitlement APIs", () => {
    const files = [
      join(here, "document.ts"),
      join(here, "editor.ts"),
      join(here, "../marketing.functions.ts"),
      join(here, "../marketing.server.ts"),
      join(here, "../../components/admin/marketing-editor-provider.tsx"),
      join(repoRoot, "drizzle/migrations/0035_marketing_cms.sql"),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.equal(importPattern.test(src), false, file);
      assert.equal(mutatePattern.test(src), false, file);
    }
  });

  it("applyMarketingMutation publish only copies MarketingContent", () => {
    const current = createSeedMarketingSnapshot();
    const draft = draftFromSeed();
    draft.hero.headline = "Published from CMS";
    const result = applyMarketingMutation({
      isAdmin: true,
      action: "publish",
      draft,
      current,
    });
    assert.equal(result.ok, true);
    assert.equal(result.snapshot.published.hero.headline, "Published from CMS");
    assert.deepEqual(result.snapshot.published.partners, []);
    assert.equal("restaurant_package_entitlements" in result.snapshot, false);
  });
});
