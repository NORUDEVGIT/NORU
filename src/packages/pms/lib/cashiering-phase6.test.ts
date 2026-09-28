import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { hotelDrawerExpected, hotelDrawerVariance } from "./cashiering.server.ts";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0114_cashiering_phase6_hotel_drawer.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0114_cashiering_phase6_hotel_drawer.sql",
    import.meta.url,
  ),
  "utf8",
);
const restaurantClose = readFileSync(
  new URL("../../../../drizzle/migrations/0037_rm_shift_close.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const desk = readFileSync(
  new URL("../components/cashiering/cashiering-desk.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 6 hotel drawer", () => {
  it("keeps restaurant expected cash on restaurant payments only", () => {
    assert.match(restaurantClose, /FROM public\.order_payments/);
    assert.match(restaurantClose, /FROM public\.order_refunds/);
    assert.doesNotMatch(restaurantClose, /folio_transactions/);
    assert.equal(sql, supabaseSql);
    assert.doesNotMatch(sql, /UPDATE public\.cashier_shifts/);
    assert.doesNotMatch(
      sql,
      /UPDATE public\.pos_cashier_shifts|ALTER TABLE public\.pos_cashier_shifts/,
    );
    assert.match(sql, /payment_method = 'cash'/);
    assert.match(sql, /hotel_cashier_shift_id/);
    assert.match(sql, /HOTEL_DRAWER_MOVEMENT_IMMUTABLE/);
  });

  it("counts a hotel cash payment in hotel variance and replays a drawer movement", () => {
    const expected = hotelDrawerExpected({ opening: 100, cashIn: 10, cashOut: 5, hotelCash: 40 });
    assert.equal(expected, 145);
    assert.equal(hotelDrawerVariance(150, expected), 5);
    assert.match(sql, /opening \+ cash_in - cash_out \+ hotel_cash/);
    assert.match(sql, /IF FOUND THEN/);
    assert.match(sql, /IDEMPOTENCY_KEY_REUSED/);
    const movement = poster.slice(poster.indexOf("export const postHotelDrawerMovement"));
    assert.match(movement, /idempotencyKey/);
    assert.match(movement, /post_hotel_drawer_movement/);
    assert.match(desk, /Hotel drawer expected/);
    assert.match(desk, /Restaurant sales are not included/);
    assert.doesNotMatch(desk, /expected_cash/);
  });
});
