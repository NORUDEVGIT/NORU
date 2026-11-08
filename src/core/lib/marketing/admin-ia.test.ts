import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  MARKETING_ADMIN_SECTIONS,
  MARKETING_ADMIN_TAB_OWNERSHIP,
  RETIRED_PRIMARY_TAB_LABELS,
  animationFormValues,
  ctaFormValues,
  footerFormValues,
  landingInventory,
  patchFooterContact,
  patchSiteAnimation,
  patchSiteCta,
  previewMarketingAdmin,
  primaryMarketingTabLabels,
  snapshotLegacyKeys,
} from "./admin-ia.ts";
import { MARKETING_CMS_CONCURRENCY, createSeedMarketingSnapshot, evaluatePublish, isMarketingContent } from "./document.ts";
import { validateMarketingEditorContent } from "./editor.ts";
import { MARKETING_SEED } from "./seed.ts";
import {
  NORU_SITE_ANIMATION_DEFAULTS,
  NORU_SITE_CTA_DEFAULTS,
  NORU_SITE_FOOTER_DEFAULTS,
} from "./site-content.ts";
import type { MarketingContent } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const layoutSource = readFileSync(
  join(here, "../../components/admin/marketing-admin-layout.tsx"),
  "utf8",
);
const overviewSource = readFileSync(
  join(here, "../../components/admin/marketing-overview.tsx"),
  "utf8",
);

function marketingWithoutSite(): MarketingContent {
  const content = structuredClone(MARKETING_SEED);
  delete (content as { site?: unknown }).site;
  return content;
}

describe("MKT-LP03 marketing admin IA", () => {
  it("1. new visible tab names exist", () => {
    const labels = primaryMarketingTabLabels();
    for (const label of [
      "Overview",
      "Header & Navigation",
      "Hero & Animation",
      "Partners",
      "Events",
      "Product Highlights",
      "Property Solutions",
      "FAQ",
      "Final CTA",
      "Footer",
      "Advanced / Legacy",
    ]) {
      assert.equal(labels.includes(label), true, label);
    }
    assert.equal(MARKETING_ADMIN_SECTIONS[0]?.to, "/admin/marketing");
  });

  it("2. retired legacy primary tab names are no longer shown", () => {
    const labels = primaryMarketingTabLabels();
    for (const label of RETIRED_PRIMARY_TAB_LABELS) {
      assert.equal(labels.includes(label), false, label);
      assert.equal(layoutSource.includes(`"${label}"`), false, label);
    }
    assert.match(layoutSource, /MARKETING_ADMIN_SECTIONS/);
  });

  it("3. Overview still renders", () => {
    assert.match(overviewSource, /export function MarketingOverview/);
    assert.match(overviewSource, /Publish status/);
    assert.match(overviewSource, /landingInventory/);
    assert.equal(primaryMarketingTabLabels()[0], "Overview");
  });

  it("4. Publish / Revert / Reset remain", () => {
    assert.match(layoutSource, /Publish/);
    assert.match(layoutSource, /Revert Draft/);
    assert.match(layoutSource, /Reset to Seed/);
    assert.match(overviewSource, /Publish/);
    assert.match(overviewSource, /Revert Draft/);
    assert.match(overviewSource, /Reset to Seed/);
  });

  it("5. Header & Navigation maps to current nav data", () => {
    const owned = MARKETING_ADMIN_TAB_OWNERSHIP["Header & Navigation"];
    assert.equal(owned.includes("nav"), true);
    assert.equal(owned.includes("brand"), true);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(inventory.headerNavItems, MARKETING_SEED.nav.length);
  });

  it("6. Hero & Animation reads resolved animation fallback when absent", () => {
    const legacy = marketingWithoutSite();
    assert.deepEqual(animationFormValues(legacy), NORU_SITE_ANIMATION_DEFAULTS);
    const seeded = structuredClone(MARKETING_SEED);
    if (seeded.site) delete seeded.site.animation;
    assert.deepEqual(animationFormValues(seeded), NORU_SITE_ANIMATION_DEFAULTS);
  });

  it("7. editing animation writes only site.animation", () => {
    const content = structuredClone(MARKETING_SEED);
    const products = structuredClone(content.site!.products);
    const legacy = snapshotLegacyKeys(content);
    patchSiteAnimation(content, { enabled: false, sceneVariant: "logo-only" });
    assert.equal(content.site?.animation?.enabled, false);
    assert.equal(content.site?.animation?.sceneVariant, "logo-only");
    assert.equal(content.site?.cta, undefined);
    assert.deepEqual(content.site?.products, products);
    assert.deepEqual(snapshotLegacyKeys(content), legacy);
  });

  it("8. Partners uses existing partner data", () => {
    assert.deepEqual(MARKETING_ADMIN_TAB_OWNERSHIP.Partners, ["site.partners"]);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(
      inventory.partners,
      MARKETING_SEED.site!.partners.filter((item) => item.published).length,
    );
  });

  it("9. Events uses existing event data", () => {
    assert.deepEqual(MARKETING_ADMIN_TAB_OWNERSHIP.Events, ["site.events"]);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(
      inventory.events,
      MARKETING_SEED.site!.events.filter((item) => item.published).length,
    );
  });

  it("10. Product Highlights uses existing product/site card data", () => {
    assert.deepEqual(MARKETING_ADMIN_TAB_OWNERSHIP["Product Highlights"], ["site.products"]);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(
      inventory.productHighlights,
      MARKETING_SEED.site!.products.filter((item) => item.visible).length,
    );
  });

  it("11. Property Solutions uses existing solution data", () => {
    assert.deepEqual(MARKETING_ADMIN_TAB_OWNERSHIP["Property Solutions"], ["site.solutions"]);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(
      inventory.propertySolutions,
      MARKETING_SEED.site!.solutions.filter((item) => item.visible).length,
    );
  });

  it("12. FAQ still edits existing FAQ data", () => {
    assert.deepEqual(MARKETING_ADMIN_TAB_OWNERSHIP.FAQ, ["site.faq"]);
    const inventory = landingInventory(MARKETING_SEED);
    assert.equal(
      inventory.faqItems,
      MARKETING_SEED.site!.faq.filter((item) => item.active).length,
    );
  });

  it("13. Final CTA reads fallback when absent", () => {
    const legacy = marketingWithoutSite();
    const values = ctaFormValues(legacy);
    assert.equal(values.stored, undefined);
    assert.deepEqual(values.resolved, NORU_SITE_CTA_DEFAULTS);
    assert.equal(values.displayTitle, "");
    assert.equal(values.placeholders.title, NORU_SITE_CTA_DEFAULTS.title);
  });

  it("14. Final CTA edit writes site.cta", () => {
    const content = structuredClone(MARKETING_SEED);
    assert.equal(content.site?.cta, undefined);
    patchSiteCta(content, { title: "Talk to NORU", target: "#resources/contact" });
    assert.equal(content.site?.cta?.title, "Talk to NORU");
    assert.equal(content.site?.cta?.target, "#resources/contact");
    assert.equal(content.site?.animation, undefined);
  });

  it("15. Footer reads current footer/contact data", () => {
    const values = footerFormValues(MARKETING_SEED);
    assert.equal(values.stored.email, MARKETING_SEED.site!.footerContact.email);
    assert.equal(values.stored.phone, MARKETING_SEED.site!.footerContact.phone);
    assert.equal(values.stored.address, MARKETING_SEED.site!.footerContact.address);
    assert.equal(values.resolved.tagline, NORU_SITE_FOOTER_DEFAULTS.tagline);
  });

  it("16. Footer extras write to site.footerContact, not a separate site.footer", () => {
    const content = structuredClone(MARKETING_SEED);
    patchFooterContact(content, {
      tagline: "Edited tagline",
      privacyTarget: "#",
      copyrightText: "© NORU",
    });
    assert.equal(content.site?.footerContact.tagline, "Edited tagline");
    assert.equal(content.site?.footerContact.privacyTarget, "#");
    assert.equal(content.site?.footerContact.copyrightText, "© NORU");
    assert.equal("footer" in (content.site ?? {}), false);
  });

  it("17. legacy MarketingContent keys survive unrelated edits", () => {
    const content = structuredClone(MARKETING_SEED);
    const before = snapshotLegacyKeys(content);
    patchSiteAnimation(content, { speedPreset: "fast" });
    patchSiteCta(content, { buttonLabel: "Book a demo" });
    patchFooterContact(content, { email: "hello@example.com" });
    assert.deepEqual(snapshotLegacyKeys(content), before);
    assert.ok(Array.isArray(content.packages));
    assert.ok(Array.isArray(content.partners));
    assert.equal(typeof content.hero.headline, "string");
  });

  it("18. Publish validation still blocks invalid targets", () => {
    const content = structuredClone(MARKETING_SEED);
    patchSiteCta(content, { target: "/admin/settings" });
    const report = validateMarketingEditorContent(content);
    assert.equal(report.ok, false);
    assert.equal(report.errors.some((error) => error.code === "site_cta_target"), true);
    const snapshot = createSeedMarketingSnapshot();
    const published = evaluatePublish(content, snapshot);
    assert.equal(published.ok, false);
  });

  it("19. old documents with no site still render admin safely", () => {
    const legacy = marketingWithoutSite();
    assert.equal(legacy.site, undefined);
    assert.equal(isMarketingContent(legacy), true);
    const preview = previewMarketingAdmin(legacy);
    assert.equal(legacy.site, undefined);
    assert.equal(preview.hasSite, false);
    assert.deepEqual(preview.animation, NORU_SITE_ANIMATION_DEFAULTS);
    assert.deepEqual(preview.cta.resolved, NORU_SITE_CTA_DEFAULTS);
    assert.equal(validateMarketingEditorContent(legacy).ok, true);
  });

  it("20. no migration is required", () => {
    assert.equal(MARKETING_CMS_CONCURRENCY, "optimistic-draft");
    assert.equal(isMarketingContent(MARKETING_SEED), true);
    assert.equal(evaluatePublish(MARKETING_SEED, createSeedMarketingSnapshot()).ok, true);
    const iaSource = readFileSync(join(here, "admin-ia.ts"), "utf8");
    assert.doesNotMatch(iaSource, /CREATE TABLE/i);
    assert.doesNotMatch(iaSource, /alter table/i);
  });

  it("opening animation/CTA/footer helpers does not persist resolver defaults", () => {
    const content = marketingWithoutSite();
    previewMarketingAdmin(content);
    animationFormValues(content);
    ctaFormValues(content);
    footerFormValues(content);
    landingInventory(content);
    assert.equal(content.site, undefined);
  });

  it("tabs scroll horizontally instead of shrinking text", () => {
    assert.match(layoutSource, /overflow-x-auto/);
    assert.match(layoutSource, /whitespace-nowrap/);
    assert.doesNotMatch(layoutSource, /zoom/);
  });
});
