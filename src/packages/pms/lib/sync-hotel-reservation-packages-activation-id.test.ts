import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("save as pending package activation_id qualification", () => {
  const drizzle = readRel(
    "../../../../drizzle/migrations/0150_sync_hotel_reservation_packages_activation_id.sql",
  );
  const supabase = readRel(
    "../../../../supabase/migrations/0150_sync_hotel_reservation_packages_activation_id.sql",
  );
  const historical = readRel(
    "../../../../drizzle/migrations/0106_pms_commercial_package_engine.sql",
  );
  const commercial = readRel(
    "../../../../drizzle/migrations/0126_pms_commercial_create_stay_args.sql",
  );
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const createFns = readRel("./reservations.functions.ts");
  const createStart = createFns.indexOf("export const createReservation");
  const createFn = createFns.slice(createStart, createFns.indexOf("export const copyReservation"));
  const syncStart = drizzle.indexOf(
    "CREATE OR REPLACE FUNCTION public.sync_hotel_reservation_packages",
  );
  const syncFn = drizzle.slice(syncStart);

  it("keeps the dual-lane replacement identical and qualifies activation_id", () => {
    assert.equal(drizzle, supabase);
    assert.match(historical, /WHERE activation_id = activation\.id/);
    assert.doesNotMatch(syncFn, /WHERE\s+activation_id\b/);
    assert.match(syncFn, /FROM public\.hotel_package_activation_room_types AS activation_room/);
    assert.match(syncFn, /WHERE activation_room\.activation_id = activation\.id/);
    assert.match(syncFn, /FROM public\.hotel_package_activation_rate_plans AS activation_plan/);
    assert.match(syncFn, /WHERE activation_plan\.activation_id = activation\.id/);
  });

  it("sends selected packages through the same writer for pending and confirmed", () => {
    assert.match(page, /create\.mutate\("pending"\)/);
    assert.match(page, /create\.mutate\("confirmed"\)/);
    assert.match(page, /packageActivationIds:\s*selectedCreatePackages\.length > 0/);
    assert.match(createFn, /_status: status/);
    assert.match(createFn, /hasCommercialSelection/);
    assert.match(createFn, /\(data\.packageActivationIds\?\.length \?\? 0\) > 0/);
    assert.match(createFn, /rpc\("create_hotel_reservation_priced_commercial"/);
    assert.match(createFn, /_package_activation_ids: data\.packageActivationIds \?\? null/);
    assert.match(createFn, /rpc\("create_hotel_reservation_priced", pricedArgs\)/);
    assert.match(commercial, /PERFORM public\.sync_hotel_reservation_packages\(/);
  });

  it("binds the selected activation and still rejects another property", () => {
    assert.match(syncFn, /package_activation_id,/);
    assert.match(syncFn, /activation\.id,/);
    assert.match(syncFn, /ON CONFLICT \(reservation_id, package_activation_id\) DO UPDATE/);
    assert.match(syncFn, /reason := 'PACKAGE_WRONG_PROPERTY'/);
    assert.match(syncFn, /IF _mode = 'apply' THEN\s+RAISE EXCEPTION '%', reason;/);
    assert.match(syncFn, /activation\.charge_basis IS DISTINCT FROM 'per_stay'/);
  });

  it("keeps package money off the room quote and does not post a folio", () => {
    assert.match(syncFn, /unit_amount := activation\.package_price/);
    assert.match(syncFn, /applied_amount := unit_amount/);
    assert.doesNotMatch(syncFn, /room_subtotal|nightly_rate_snapshot/);
    assert.doesNotMatch(syncFn, /folio|post_charge|hotel_folio/i);
    assert.doesNotMatch(commercial, /room_subtotal|folio/i);
  });

  it("rolls a failed package bind back with the reservation insert", () => {
    const body = commercial.slice(commercial.indexOf("AS $$"), commercial.indexOf("REVOKE ALL"));
    assert.equal(body.match(/create_hotel_reservation_priced\(/g)?.length, 1);
    assert.match(body, /PERFORM public\.sync_hotel_reservation_packages\(/);
    assert.doesNotMatch(body, /COMMIT|EXCEPTION/);
    const errorAt = createFn.indexOf("if (error) throw");
    const attachAt = createFn.indexOf("attachReservationToGroup");
    assert.ok(errorAt > 0 && attachAt > errorAt);
  });
});
