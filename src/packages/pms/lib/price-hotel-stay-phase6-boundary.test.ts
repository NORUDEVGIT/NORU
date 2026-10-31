/**
 * Phase 6: live extra-person surcharge lives only in price_hotel_stay (0192).
 * Room Type defaults must never be read by the quote engine.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = readFileSync(
  join(here, "../../../../drizzle/migrations/0192_price_hotel_stay_occupancy_surcharge.sql"),
  "utf8",
);
const supabase = readFileSync(
  join(here, "../../../../supabase/migrations/0192_price_hotel_stay_occupancy_surcharge.sql"),
  "utf8",
);

describe("Phase 6 price_hotel_stay occupancy surcharge", () => {
  it("replaces the engine in dual-lane 0192 and uses Rate Plan fields only", () => {
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(drizzle, /plan\.included_occupancy/);
    assert.match(drizzle, /plan\.extra_adult_rate/);
    assert.match(drizzle, /plan\.extra_child_rate/);
    assert.match(drizzle, /rate := rate \+ occupancy_surcharge/);
    assert.doesNotMatch(drizzle, /extra_adult_rate_default/);
    assert.doesNotMatch(drizzle, /extra_child_rate_default/);
    assert.doesNotMatch(drizzle, /base_nightly_rate/);
    assert.doesNotMatch(drizzle, /extra_guest_allowed/);
    assert.match(drizzle, /Room Type defaults are NEVER read/);
    assert.match(drizzle, /NULL included_occupancy keeps historical no-surcharge pricing/);
  });

  it("applies surcharge after the effective night rate, not Room Type base", () => {
    const nightLoop = drizzle.slice(drizzle.indexOf("WHILE night < _departure"));
    assert.match(nightLoop, /hotel_rate_calendar/);
    assert.match(nightLoop, /rate := plan\.base_rate/);
    assert.match(nightLoop, /rate := rate \+ occupancy_surcharge/);
    assert.ok(
      nightLoop.indexOf("rate := plan.base_rate") < nightLoop.indexOf("rate := rate + occupancy_surcharge"),
    );
  });
});
