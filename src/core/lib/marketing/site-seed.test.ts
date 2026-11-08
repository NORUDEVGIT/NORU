import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicNoruSite } from "../../components/noru-site/data/site-defaults.ts";
import { applyMarketingMutation, createSeedMarketingSnapshot, isMarketingContent } from "./document.ts";
import { currentNoruSiteContent } from "./noru-site-defaults.ts";
import { getMarketingContent } from "./resolve.ts";
import { MARKETING_SEED } from "./seed.ts";
import {
  NORU_SITE_ANIMATION_DEFAULTS,
  NORU_SITE_CTA_DEFAULTS,
  NORU_SITE_FOOTER_DEFAULTS,
  isNoruSiteContent,
  resolveSiteAnimationConfig,
  resolveSiteCta,
  resolveSiteFooter,
} from "./site-content.ts";
import type { MarketingContent } from "./types.ts";

const LEGACY_KEYS = [
  "brand",
  "hero",
  "nav",
  "packagesSection",
  "packages",
  "pricing",
  "partners",
  "testimonials",
  "caseStudies",
  "blogPosts",
  "footer",
  "faq",
  "promoBanners",
  "contact",
] as const;

function marketingWithoutSite(): MarketingContent {
  const content = structuredClone(MARKETING_SEED);
  delete (content as { site?: unknown }).site;
  return content;
}

describe("MARKETING_SEED includes the current public site", () => {
  it("1. MARKETING_SEED now contains site", () => {
    assert.equal(MARKETING_SEED.site != null, true);
  });

  it("2. MARKETING_SEED.site passes isNoruSiteContent", () => {
    assert.equal(isNoruSiteContent(MARKETING_SEED.site), true);
  });

  it("3. full MARKETING_SEED passes isMarketingContent", () => {
    assert.equal(isMarketingContent(MARKETING_SEED), true);
  });

  it("4. MARKETING_SEED.site represents the canonical current site defaults", () => {
    assert.deepEqual(MARKETING_SEED.site, currentNoruSiteContent());
    assert.deepEqual(publicNoruSite(MARKETING_SEED).products.map((item) => item.id), currentNoruSiteContent().products.map((item) => item.id));
  });
});

describe("Reset to Seed writes a complete current document", () => {
  it("5. Reset to Seed result contains site", () => {
    const result = applyMarketingMutation({
      isAdmin: true,
      action: "resetToSeed",
      current: createSeedMarketingSnapshot(),
    });
    assert.equal(result.ok, true);
    assert.equal(isNoruSiteContent(result.snapshot.draft.site), true);
    assert.equal(isNoruSiteContent(result.snapshot.published.site), true);
  });

  it("6. Reset result does not require later site injection", () => {
    const snapshot = createSeedMarketingSnapshot();
    assert.equal(snapshot.draft.site != null, true);
    assert.equal(snapshot.published.site != null, true);
    assert.deepEqual(snapshot.draft.site, currentNoruSiteContent());
  });

  it("7. Reset retains all existing legacy MarketingContent keys", () => {
    const snapshot = createSeedMarketingSnapshot();
    for (const key of LEGACY_KEYS) {
      assert.equal(key in snapshot.draft, true, key);
      assert.equal(key in snapshot.published, true, key);
      assert.deepEqual(snapshot.draft[key], MARKETING_SEED[key]);
    }
  });
});

describe("legacy documents without site remain supported", () => {
  it("8. an old MarketingContent object with no site still validates", () => {
    const legacy = marketingWithoutSite();
    assert.equal(legacy.site, undefined);
    assert.equal(isMarketingContent(legacy), true);
  });

  it("9. publicNoruSite(oldDocumentWithoutSite) still falls back to current site defaults", () => {
    const resolved = publicNoruSite(marketingWithoutSite());
    assert.deepEqual(
      resolved.products.map((item) => item.id),
      currentNoruSiteContent().products.map((item) => item.id),
    );
    assert.equal(resolved.hero.tagline, currentNoruSiteContent().hero.tagline);
  });

  it("10. an existing partial site document remains supported", () => {
    const partial = structuredClone(MARKETING_SEED);
    partial.site = currentNoruSiteContent();
    partial.site.partners = [];
    assert.equal(isNoruSiteContent(partial.site), true);
    assert.equal(publicNoruSite(partial).partners.length, 0);
  });
});

describe("MKT-LP01 optional chrome stays absent on the seed", () => {
  it("11. seed remains valid when animation, cta, and footer extras are absent", () => {
    const site = MARKETING_SEED.site;
    assert.ok(site);
    assert.equal(site.animation, undefined);
    assert.equal(site.cta, undefined);
    assert.equal(site.footerContact.tagline, undefined);
    assert.equal(site.footerContact.socialLinks, undefined);
    assert.equal(isNoruSiteContent(site), true);
  });

  it("12. resolvers still return the same defaults", () => {
    const site = MARKETING_SEED.site;
    assert.deepEqual(resolveSiteAnimationConfig(site), NORU_SITE_ANIMATION_DEFAULTS);
    assert.deepEqual(resolveSiteCta(site), NORU_SITE_CTA_DEFAULTS);
    assert.equal(resolveSiteFooter(site).tagline, NORU_SITE_FOOTER_DEFAULTS.tagline);
  });
});

describe("public fallback after seed alignment", () => {
  it("missing published row returns MARKETING_SEED including site", () => {
    const published = getMarketingContent();
    assert.equal(isNoruSiteContent(published.site), true);
    assert.deepEqual(published.site, MARKETING_SEED.site);
  });
});
