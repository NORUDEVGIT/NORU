import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARKETING_SEED } from "./marketing/seed.ts";
import { isMarketingDraftCurrent } from "./marketing/document.ts";
import { isNoruSiteContent } from "./marketing/site-content.ts";
import {
  currentNoruSiteContent,
  publicNoruSite,
} from "../components/noru-site/data/site-defaults.ts";
import { parseHash } from "../components/noru-site/lib/router.ts";

describe("noru site content", () => {
  it("accepts the built-in Beti copy", () => {
    assert.equal(isNoruSiteContent(currentNoruSiteContent()), true);
  });

  it("uses the built-in copy only when the published document has no site block", () => {
    const fallback = publicNoruSite(MARKETING_SEED);
    assert.equal(fallback.products.length, currentNoruSiteContent().products.length);
    const empty = structuredClone(MARKETING_SEED);
    empty.site = currentNoruSiteContent();
    empty.site.partners = [];
    assert.equal(publicNoruSite(empty).partners.length, 0);
  });

  it("renders the home page for an empty hash, which is the server snapshot", () => {
    assert.deepEqual(parseHash(""), { page: "home", anchor: undefined, detail: undefined });
    assert.equal(parseHash("#product/pms").page, "product");
    assert.equal(parseHash("#resources/blogs/article-1").detail, "article-1");
  });

  it("treats a newer draft timestamp as a conflict", () => {
    assert.equal(
      isMarketingDraftCurrent("2026-10-16T00:00:00.000Z", "2026-10-16T00:00:00.000Z"),
      true,
    );
    assert.equal(
      isMarketingDraftCurrent("2026-10-16T00:00:00.000Z", "2026-10-16T00:00:01.000Z"),
      false,
    );
  });
});
