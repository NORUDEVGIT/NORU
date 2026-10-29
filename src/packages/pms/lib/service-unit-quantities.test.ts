import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("0189 service unit quantities", () => {
  const sql = read("../../../../supabase/migrations/0189_service_unit_quantities.sql");
  const drizzle = read("../../../../drizzle/migrations/0189_service_unit_quantities.sql");

  it("keeps the migration dual-lane and lets per_room take 1-99", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /price\.pricing_unit IN \('per_room', 'per_item', 'per_person', 'per_night'\)/);
    assert.match(sql, /_quantity < 1 OR _quantity > 99/);
    assert.match(sql, /price\.pricing_unit = 'per_service'/);
    assert.match(sql, /WHEN p\.pricing_unit IN \('per_room', 'per_item', 'per_person', 'per_night'\) THEN 'editable'/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS quantity integer/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS pricing_unit text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS unit_amount numeric\(12,2\)/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS folio_transaction_id uuid/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS posted_at timestamptz/);
    assert.match(sql, /post_reservation_service_requests/);
    assert.match(sql, /'svc-req-' \|\| replace\(request\.id::text, '-', ''\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.post_reservation_service_requests\(uuid, uuid, uuid\) TO service_role/);
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.post_reservation_service_requests\(uuid, uuid, uuid\) TO authenticated/);
  });
});
