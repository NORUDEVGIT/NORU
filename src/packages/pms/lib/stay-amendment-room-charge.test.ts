import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const supabase = read("../../../../supabase/migrations/0207_stay_amendment_room_charge_reconcile.sql");
const drizzle = read("../../../../drizzle/migrations/0207_stay_amendment_room_charge_reconcile.sql");

describe("stay amendment room charge reconcile", () => {
  it("keeps both migration lanes identical", () => {
    assert.equal(supabase, drizzle);
  });

  it("finds the reservation-wide room charge for the only active room", () => {
    const lookup = supabase.slice(
      supabase.indexOf("FUNCTION public.reservation_unit_live_room_charge"),
      supabase.indexOf("FUNCTION public.assert_reservation_unit_room_charge_reconcilable"),
    );
    assert.match(lookup, /folio_transactions\.folio_id = target_folio/);
    assert.match(lookup, /category = 'room'/);
    assert.match(lookup, /reference_id = _reservation_room_id/);
    assert.match(lookup, /reservation_room_id = _reservation_room_id/);
    assert.match(lookup, /reference_id = _reservation_id/);
    assert.match(lookup, /reservation_room_id IS NULL/);
    assert.match(lookup, /other\.id <> _reservation_room_id/);
    assert.match(lookup, /correctable_charge_remainder/);
  });

  it("reverses the live charge and posts the new room total with tax", () => {
    const reconcile = supabase.slice(
      supabase.indexOf("FUNCTION public.reconcile_reservation_unit_room_charge"),
    );
    assert.match(reconcile, /reservation_unit_live_room_charge/);
    assert.match(reconcile, /post_folio_charge_correction/);
    assert.match(reconcile, /'reverse_remaining'/);
    assert.match(reconcile, /'rmrev' \|\| replace\(charge\.id::text, '-', ''\)/);
    assert.match(reconcile, /post_folio_charge_with_tax/);
    assert.match(reconcile, /'rmrpl' \|\| replace\(charge\.id::text, '-', ''\)/);
    assert.match(reconcile, /next_amount/);
    assert.doesNotMatch(reconcile, /INSERT INTO public\.folio_transactions/);
    assert.match(reconcile, /CORRECTION_INVOICED|assert_reservation_unit_room_charge_reconcilable/);
  });

  it("grants the lookup and reconcile functions to service_role only", () => {
    for (const fn of [
      "reservation_unit_live_room_charge(uuid, uuid, uuid)",
      "assert_reservation_unit_room_charge_reconcilable(uuid, uuid, uuid)",
      "reconcile_reservation_unit_room_charge(uuid, uuid, uuid, uuid)",
    ]) {
      assert.ok(supabase.includes(`REVOKE ALL ON FUNCTION public.${fn}`), fn);
      assert.ok(supabase.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`), fn);
    }
    assert.match(supabase, /FROM PUBLIC, anon, authenticated;/);
    assert.match(supabase, /TO service_role;/);
    assert.doesNotMatch(supabase, /TO (anon|authenticated)/);
  });
});
