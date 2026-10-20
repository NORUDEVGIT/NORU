import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("sync_hotel_reservation_promotion activation_id qualification", () => {
  const supabase = readRel(
    "../../../../../supabase/migrations/0173_sync_hotel_reservation_promotion_activation_id.sql",
  );
  const drizzle = readRel(
    "../../../../../drizzle/migrations/0173_sync_hotel_reservation_promotion_activation_id.sql",
  );
  const historical = readRel(
    "../../../../../supabase/migrations/0105_pms_commercial_promotion_engine.sql",
  );
  const remove = readRel(
    "../../../../../supabase/migrations/0172_unit_rate_plan_and_promotion_remove.sql",
  );
  const applyFn = readRel("../reservation-detail-controls.functions.ts");

  it("qualifies the scope-table activation_id that collided with the PL/pgSQL variable", () => {
    assert.equal(drizzle, supabase);
    const sync = functionBody(supabase, "sync_hotel_reservation_promotion");
    assert.match(sync, /activation_id uuid := _promotion_activation_id/);
    assert.match(
      sync,
      /FROM public\.hotel_promotion_activation_room_types AS activation_room\s+WHERE activation_room\.activation_id = activation\.id/,
    );
    assert.match(
      sync,
      /FROM public\.hotel_promotion_activation_rate_plans AS activation_plan\s+WHERE activation_plan\.activation_id = activation\.id/,
    );
    assert.doesNotMatch(sync, /WHERE activation_id =/);
    assert.doesNotMatch(sync, /column reference "activation_id" is ambiguous/);
    const delivered = functionBody(historical, "sync_hotel_reservation_promotion");
    assert.match(delivered, /WHERE activation_id = activation\.id/);
  });

  it("keeps one reservation snapshot and does not write room or unit prices", () => {
    const sync = functionBody(supabase, "sync_hotel_reservation_promotion");
    assert.match(sync, /INSERT INTO public\.hotel_reservation_promotions/);
    assert.match(sync, /discount_amount/);
    assert.match(sync, /base := COALESCE\(reservation\.room_subtotal, 0\)/);
    assert.match(sync, /ON CONFLICT \(reservation_id\) DO UPDATE SET/);
    assert.match(sync, /promotion_activation_id = EXCLUDED\.promotion_activation_id/);
    assert.doesNotMatch(sync, /UPDATE public\.hotel_reservations/);
    assert.doesNotMatch(sync, /UPDATE public\.hotel_reservation_rooms/);
    assert.doesNotMatch(sync, /nightly_rate_snapshot/);
    assert.doesNotMatch(
      sync,
      /INSERT INTO public\.hotel_reservation_promotions[\s\S]*INSERT INTO public\.hotel_reservation_promotions/,
    );
    const apply = applyFn.slice(
      applyFn.indexOf("export const applyReservationPromotion"),
      applyFn.indexOf("export const removeReservationPromotion"),
    );
    assert.match(apply, /rpc\("sync_hotel_reservation_promotion"/);
    assert.match(apply, /_mode: "apply"/);
    assert.doesNotMatch(apply, /\.update\(|room_subtotal:/);
  });

  it("leaves promotion removal on the existing delete that does not change room_subtotal", () => {
    const sync = functionBody(supabase, "sync_hotel_reservation_promotion");
    assert.doesNotMatch(sync, /remove_hotel_reservation_promotion/);
    const removed = functionBody(remove, "remove_hotel_reservation_promotion");
    assert.match(removed, /DELETE FROM public\.hotel_reservation_promotions/);
    assert.match(removed, /'promotion_removed'/);
    assert.doesNotMatch(removed, /UPDATE public\.hotel_reservations/);
    assert.doesNotMatch(removed, /UPDATE public\.hotel_reservation_rooms/);
    assert.doesNotMatch(removed, /nightly_rate_snapshot/);
  });
});
