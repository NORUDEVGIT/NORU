import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentNoruSiteContent } from "../../components/noru-site/data/site-defaults.ts";
import { isAllowedNoruSiteHref } from "./allowlist.ts";
import { isMarketingContent } from "./document.ts";
import { validateMarketingEditorContent } from "./editor.ts";
import { MARKETING_SEED } from "./seed.ts";
import {
  NORU_SITE_ANIMATION_DEFAULTS,
  NORU_SITE_CTA_DEFAULTS,
  NORU_SITE_FOOTER_DEFAULTS,
  clampNoruSiteAnimationDuration,
  isNoruSiteContent,
  resolveSiteAnimationConfig,
  resolveSiteCta,
  resolveSiteFooter,
  siteAnimationIssues,
  siteContentIssues,
  siteCtaIssues,
  siteFooterExtraIssues,
} from "./site-content.ts";
import type { MarketingContent, NoruSiteContent } from "./types.ts";

function liveSite(): NoruSiteContent {
  return currentNoruSiteContent();
}

function marketingWithoutSite(): MarketingContent {
  const content = structuredClone(MARKETING_SEED);
  delete (content as { site?: unknown }).site;
  return content;
}

function withSite(mutator: (site: NoruSiteContent) => void): MarketingContent {
  const content = structuredClone(MARKETING_SEED);
  const site = liveSite();
  mutator(site);
  content.site = site;
  return content;
}

describe("backward compatibility", () => {
  it("1. old MarketingContent with no site remains valid", () => {
    const legacy = marketingWithoutSite();
    assert.equal(legacy.site, undefined);
    assert.equal(isMarketingContent(legacy), true);
    assert.equal(validateMarketingEditorContent(legacy).ok, true);
  });

  it("2. site with no animation remains valid", () => {
    const site = liveSite();
    assert.equal(site.animation, undefined);
    assert.equal(isNoruSiteContent(site), true);
    assert.equal(siteContentIssues(site).length, 0);
  });

  it("3. site with no CTA remains valid", () => {
    const site = liveSite();
    assert.equal(site.cta, undefined);
    assert.equal(isNoruSiteContent(site), true);
  });

  it("4. site with existing footerContact only remains valid", () => {
    const site = liveSite();
    assert.equal(site.footerContact.tagline, undefined);
    assert.equal(site.footerContact.socialLinks, undefined);
    assert.equal(isNoruSiteContent(site), true);
    assert.equal(siteFooterExtraIssues(site.footerContact).length, 0);
  });

  it("22. a legacy published MarketingContent fixture remains valid without modification", () => {
    const legacy = marketingWithoutSite();
    assert.equal("animation" in (legacy.site ?? {}), false);
    assert.equal(isMarketingContent(legacy), true);
    assert.equal(validateMarketingEditorContent(legacy).ok, true);
  });
});

describe("animation contract", () => {
  it("5. valid greeting-bow config passes", () => {
    const content = withSite((site) => {
      site.animation = { enabled: true, sceneVariant: "greeting-bow", walkDurationSec: 2.6 };
    });
    assert.equal(isMarketingContent(content), true);
    assert.equal(validateMarketingEditorContent(content).ok, true);
  });

  it("6. valid logo-only config passes", () => {
    const content = withSite((site) => {
      site.animation = { sceneVariant: "logo-only", idleLoop: false };
    });
    assert.equal(isNoruSiteContent(content.site), true);
    assert.equal(siteAnimationIssues(content.site?.animation).length, 0);
  });

  it("7. valid static config passes", () => {
    const content = withSite((site) => {
      site.animation = { sceneVariant: "static", reducedMotionFallback: "static-logo" };
    });
    assert.equal(isNoruSiteContent(content.site), true);
    assert.equal(siteContentIssues(content.site!).length, 0);
  });

  it("8. invalid sceneVariant fails validation", () => {
    const animation = { sceneVariant: "explode" };
    assert.equal(isNoruSiteContent({ ...liveSite(), animation }), false);
    assert.equal(
      siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_variant"),
      true,
    );
  });

  it("9. invalid reducedMotionFallback fails", () => {
    const animation = { reducedMotionFallback: "skip-all" };
    assert.equal(
      siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_reduced_motion"),
      true,
    );
  });

  it("10. invalid mobileFallback fails", () => {
    const animation = { mobileFallback: "webgl-force" };
    assert.equal(
      siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_mobile"),
      true,
    );
  });

  it("11. invalid speedPreset fails", () => {
    const animation = { speedPreset: "ludicrous" };
    assert.equal(
      siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_speed"),
      true,
    );
  });

  it("12. invalid intensityPreset fails", () => {
    const animation = { intensityPreset: "blinding" };
    assert.equal(
      siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_intensity"),
      true,
    );
  });

  it("13. negative durations fail validation and clamp in the resolver", () => {
    const animation = { walkDurationSec: -1, greetingDurationSec: -4 };
    assert.equal(siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_duration"), true);
    assert.equal(isNoruSiteContent({ ...liveSite(), animation }), false);
    assert.equal(clampNoruSiteAnimationDuration("walkDurationSec", -1), 0.5);
    assert.equal(
      resolveSiteAnimationConfig({ animation: { walkDurationSec: -1 } }).walkDurationSec,
      0.5,
    );
  });

  it("14. excessive durations fail validation and clamp in the resolver", () => {
    const animation = { holdDurationSec: 120, introDelaySec: 99 };
    assert.equal(siteAnimationIssues(animation).some((issue) => issue.code === "site_animation_duration"), true);
    assert.equal(clampNoruSiteAnimationDuration("holdDurationSec", 120), 30);
    assert.equal(resolveSiteAnimationConfig({ animation }).holdDurationSec, 30);
    assert.equal(resolveSiteAnimationConfig({ animation }).introDelaySec, 10);
  });
});

describe("CTA contract", () => {
  it("15. valid CTA passes", () => {
    const content = withSite((site) => {
      site.cta = {
        enabled: true,
        title: "Ready to run your property on one platform?",
        buttonLabel: "Request Demo",
        target: "#resources/contact",
      };
    });
    assert.equal(isMarketingContent(content), true);
    assert.equal(validateMarketingEditorContent(content).ok, true);
    assert.equal(isAllowedNoruSiteHref("#resources/contact"), true);
  });

  it("16. absent CTA passes", () => {
    const site = liveSite();
    assert.equal(site.cta, undefined);
    assert.equal(siteCtaIssues(site.cta).length, 0);
    assert.deepEqual(resolveSiteCta(site), NORU_SITE_CTA_DEFAULTS);
  });

  it("17. unsafe CTA target is rejected", () => {
    assert.equal(isAllowedNoruSiteHref("javascript:alert(1)"), false);
    assert.equal(isAllowedNoruSiteHref("/admin/marketing"), false);
    assert.equal(isAllowedNoruSiteHref("#packages"), false);
    assert.equal(
      siteCtaIssues({ target: "javascript:alert(1)" }).some((issue) => issue.code === "site_cta_target"),
      true,
    );
    assert.equal(
      siteCtaIssues({ target: "/admin" }).some((issue) => issue.code === "site_cta_target"),
      true,
    );
    const content = withSite((site) => {
      site.cta = { target: "/admin/marketing" };
    });
    assert.equal(validateMarketingEditorContent(content).ok, false);
  });
});

describe("footer extras", () => {
  it("18. old footer representation passes", () => {
    const site = liveSite();
    assert.equal(typeof site.footerContact.email, "string");
    assert.equal(siteFooterExtraIssues(site.footerContact).length, 0);
    assert.equal(resolveSiteFooter(site).tagline, NORU_SITE_FOOTER_DEFAULTS.tagline);
  });

  it("19. new footer extras pass", () => {
    const content = withSite((site) => {
      site.footerContact.tagline = "One Platform. Every Hotel Operation.";
      site.footerContact.copyrightText = "© Noru Digital Solutions. All rights reserved.";
      site.footerContact.privacyTarget = "https://noru.example/privacy";
      site.footerContact.termsTarget = "#";
      site.footerContact.socialLinks = [
        {
          id: "linkedin",
          platform: "linkedin",
          href: "https://www.linkedin.com/company/noru",
          active: true,
          order: 10,
        },
      ];
    });
    assert.equal(isNoruSiteContent(content.site), true);
    assert.equal(siteContentIssues(content.site!).length, 0);
    assert.equal(validateMarketingEditorContent(content).ok, true);
  });

  it("20. unsafe social URL is rejected", () => {
    const footer = {
      email: "a@b.c",
      phone: "1",
      address: "x",
      socialLinks: [{ id: "x", platform: "x", href: "javascript:alert(1)" }],
    };
    assert.equal(
      siteFooterExtraIssues(footer).some((issue) => issue.code === "site_footer_social_href"),
      true,
    );
    assert.equal(
      siteFooterExtraIssues({
        email: "a@b.c",
        phone: "1",
        address: "x",
        socialLinks: [{ id: "x", platform: "x", href: "http://insecure.example" }],
      }).some((issue) => issue.code === "site_footer_social_href"),
      true,
    );
  });

  it("21. optional missing social list passes", () => {
    const site = liveSite();
    assert.equal(site.footerContact.socialLinks, undefined);
    assert.equal(siteFooterExtraIssues(site.footerContact).length, 0);
    assert.deepEqual(resolveSiteFooter(site).socialLinks, []);
  });
});

describe("resolver fallbacks do not persist defaults", () => {
  it("absent animation resolves to the current greeting-bow defaults", () => {
    assert.deepEqual(resolveSiteAnimationConfig(undefined), NORU_SITE_ANIMATION_DEFAULTS);
    assert.deepEqual(resolveSiteAnimationConfig(liveSite()), NORU_SITE_ANIMATION_DEFAULTS);
    assert.equal(liveSite().animation, undefined);
  });

  it("does not treat obsolete landing hashes as live CTA targets", () => {
    assert.equal(isAllowedNoruSiteHref("#how-it-works"), false);
    assert.equal(isAllowedNoruSiteHref("#features"), false);
    assert.equal(isAllowedNoruSiteHref("#product/pms"), true);
    assert.equal(resolveSiteCta({ cta: { target: "#packages" } }).target, NORU_SITE_CTA_DEFAULTS.target);
  });
});
