import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARKETING_NAV_HREFS, isAllowedMarketingHref, isRejectedAdminHref } from "./allowlist.ts";
import { FORBIDDEN_AVAILABLE_NOW } from "./claims.ts";
import { MARKETING_SEED } from "./seed.ts";
import { PROTECTED_NAV_ROLES } from "./types.ts";
import {
  collectAvailableNowText,
  getMarketingContent,
  publishedOf,
  validateMarketingContent,
  visibleNav,
  visiblePackages,
} from "./resolve.ts";

describe("marketing nav allowlist", () => {
  it("rejects /admin and does not include it", () => {
    assert.equal(isRejectedAdminHref("/admin"), true);
    assert.equal(isRejectedAdminHref("/admin/settings"), true);
    assert.equal(isRejectedAdminHref("/admin?next=/"), true);
    assert.equal(
      MARKETING_NAV_HREFS.some((href) => isRejectedAdminHref(href)),
      false,
    );
    assert.equal(isAllowedMarketingHref("/admin"), false);
  });

  it("allows public landing anchors and existing auth/customer entry", () => {
    assert.equal(isAllowedMarketingHref("#packages"), true);
    assert.equal(isAllowedMarketingHref("/restaurant/register"), true);
    assert.equal(isAllowedMarketingHref("/account"), true);
    assert.equal(isAllowedMarketingHref("/scan"), true);
  });
});

describe("honest marketing seed", () => {
  it("validates allowlisted CTAs and protected Sign In / Sign Up / Register", () => {
    validateMarketingContent(MARKETING_SEED);
    assert.equal(getMarketingContent().brand.siteName, MARKETING_SEED.brand.siteName);
    assert.equal(getMarketingContent(MARKETING_SEED).hero.headline, MARKETING_SEED.hero.headline);
    for (const role of PROTECTED_NAV_ROLES) {
      assert.equal(
        MARKETING_SEED.nav.some((item) => item.protectedRole === role && item.visible),
        true,
        `missing protected ${role}`,
      );
    }
  });

  it("has empty social proof, blog, and banners", () => {
    assert.deepEqual(MARKETING_SEED.partners, []);
    assert.deepEqual(MARKETING_SEED.testimonials, []);
    assert.deepEqual(MARKETING_SEED.caseStudies, []);
    assert.deepEqual(MARKETING_SEED.blogPosts, []);
    assert.deepEqual(MARKETING_SEED.promoBanners, []);
    assert.deepEqual(MARKETING_SEED.faq, []);
    assert.deepEqual(MARKETING_SEED.footer.socials, []);
    assert.equal(publishedOf(MARKETING_SEED.partners).length, 0);
  });

  it("never uses RMS and does not oversell Available now", () => {
    const text = [
      collectAvailableNowText(MARKETING_SEED),
      MARKETING_SEED.hero.headline,
      MARKETING_SEED.hero.description,
      MARKETING_SEED.brand.seoDescription,
    ].join("\n");
    assert.equal(/\bRMS\b/.test(text), false);
    for (const rule of FORBIDDEN_AVAILABLE_NOW) {
      assert.equal(rule.pattern.test(text), false, rule.label);
    }
    const ota = MARKETING_SEED.packages
      .flatMap((pkg) => pkg.features)
      .find((feature) => /OTA/i.test(feature.label));
    assert.ok(ota);
    assert.equal(ota.status, "coming_soon");
  });

  it("hides hidden packages and honors nav placement", () => {
    const withHidden: typeof MARKETING_SEED = {
      ...MARKETING_SEED,
      packages: [
        ...MARKETING_SEED.packages,
        {
          id: "hidden-card",
          title: "Hidden card",
          blurb: "Not shown",
          status: "hidden",
          icon: "restaurant",
          order: 99,
          features: [],
        },
      ],
    };
    assert.equal(
      visiblePackages(withHidden).some((pkg) => pkg.id === "hidden-card"),
      false,
    );
    assert.deepEqual(
      visibleNav(MARKETING_SEED, "page").map((item) => item.label),
      ["Home", "Packages", "How It Works", "Pricing", "Contact"],
    );
  });
});
