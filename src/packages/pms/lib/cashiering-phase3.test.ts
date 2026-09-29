import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0111_cashiering_phase3_source_link.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0111_cashiering_phase3_source_link.sql",
    import.meta.url,
  ),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const page = readFileSync(
  new URL("../components/cashiering/guest-folio-page.tsx", import.meta.url),
  "utf8",
);
const dialogs = readFileSync(
  new URL("../components/cashiering/folio-dialogs.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 3 source linkage", () => {
  it("keeps the source-link migration dual-lane", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /original_transaction_id uuid/);
    assert.match(sql, /folio_transactions_original_same_folio/);
    assert.match(sql, /REFERENCES public\.folio_transactions \(id, restaurant_id, folio_id\)/);
    assert.match(sql, /original_transaction_id IS NULL OR original_transaction_id <> id/);
    assert.match(sql, /NEW\.original_transaction_id IS DISTINCT FROM OLD\.original_transaction_id/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
  });

  it("posts a correction without changing the source amount and replays the same row", () => {
    const replay = sql.slice(
      sql.indexOf("idempotency_key = clean_key"),
      sql.indexOf("IF folio.status"),
    );
    assert.match(replay, /RETURN txn/);
    assert.doesNotMatch(replay, /INSERT INTO public\.folio_transactions/);
    assert.match(sql, /IF _type = 'adjustment'/);
    assert.match(sql, /signed := _amount/);
    assert.match(sql, /SOURCE_NOT_ON_FOLIO/);
    assert.match(sql, /SOURCE_NOT_ALLOWED/);
    const reversal = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.reverse_order_room_charge"),
    );
    assert.match(reversal, /original\.id/);
    assert.match(reversal, /-original\.amount/);
    assert.doesNotMatch(reversal, /UPDATE public\.folio_transactions/);
  });

  it("stores a source link only on a correction and shows both lines in history", () => {
    const entry = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(entry, /originalTransactionId/);
    assert.match(entry, /data\.type === "refund"/);
    assert.doesNotMatch(entry, /\.update\(/);
    assert.match(poster, /sourceDescription/);
    assert.match(poster, /postedBy/);
    assert.doesNotMatch(page, /jsonb|post_folio_transaction|folio_history/);
    assert.match(page, /data-testid="folio-history"/);
    assert.match(page, /row\.sourceDescription/);
    assert.match(page, /row\.postedBy/);
    assert.match(dialogs, /originalTransactionId: sourceId/);
    assert.match(dialogs, /original line[\s\S]*stays as posted/);
  });
});
