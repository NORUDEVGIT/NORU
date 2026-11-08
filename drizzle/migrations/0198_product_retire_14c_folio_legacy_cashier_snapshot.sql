-- PRODUCT-RETIRE-14C — snapshot legacy RMS cashier-shift audit context into folio_history.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0198_product_retire_14c_folio_legacy_cashier_snapshot.sql
--   drizzle/migrations/0198_product_retire_14c_folio_legacy_cashier_snapshot.sql
--
-- Approved strategy: SNAPSHOT INTO FOLIO_HISTORY.
-- Copies identity and lifecycle timestamps from cashier_shifts onto the
-- historical folio_history rows that still reference that table, then
-- removes the foreign key. Does not drop cashier_shifts. Does not rewrite
-- event_type, created_at, previous_values, or new_values.
--
-- In scope:
--   folio_history legacy snapshot columns
--   backfill from cashier_shifts
--   DROP CONSTRAINT folio_history_shift_same_property (constraint only)
--
-- Out of scope (must remain):
--   cashier_shifts table and rows
--   RMS order/payment/refund/menu tables
--   Staff/Workforce: restaurant_tables, staff_table_assignments
--   Customer/auth: profiles, guest_profiles, auth.users
--   PMS cashiering owner tables and RPCs
--   Entitlement/module/role keys, legacy tax/room-charge columns, menu-images

-- ---------------------------------------------------------------------------
-- 1. Add legacy snapshot columns.
-- ---------------------------------------------------------------------------

ALTER TABLE public.folio_history
  ADD COLUMN IF NOT EXISTS legacy_cashier_shift_id uuid,
  ADD COLUMN IF NOT EXISTS legacy_cashier_shift_status text,
  ADD COLUMN IF NOT EXISTS legacy_cashier_shift_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_cashier_shift_closed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Backfill from cashier_shifts. Preserve original cashier_shift_id.
--    Only the four snapshot columns are written.
-- ---------------------------------------------------------------------------

UPDATE public.folio_history AS fh
SET
  legacy_cashier_shift_id = fh.cashier_shift_id,
  legacy_cashier_shift_status = cs.status,
  legacy_cashier_shift_opened_at = cs.opened_at,
  legacy_cashier_shift_closed_at = cs.closed_at
FROM public.cashier_shifts AS cs
WHERE fh.cashier_shift_id IS NOT NULL
  AND cs.id = fh.cashier_shift_id
  AND cs.restaurant_id = fh.restaurant_id;

-- ---------------------------------------------------------------------------
-- 3. Assert every linked history row resolved. Fail closed on orphans.
--    Open shifts may have NULL closed_at; that is valid historical state.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  unresolved integer;
BEGIN
  SELECT count(*)::integer INTO unresolved
  FROM public.folio_history fh
  WHERE fh.cashier_shift_id IS NOT NULL
    AND (
      fh.legacy_cashier_shift_id IS NULL
      OR fh.legacy_cashier_shift_id IS DISTINCT FROM fh.cashier_shift_id
      OR fh.legacy_cashier_shift_status IS NULL
      OR fh.legacy_cashier_shift_opened_at IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.cashier_shifts cs
        WHERE cs.id = fh.cashier_shift_id
          AND cs.restaurant_id = fh.restaurant_id
      )
    );

  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14C: % folio_history row(s) with cashier_shift_id could not be snapshotted from cashier_shifts',
      unresolved;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Remove the RMS cashier_shifts foreign key. Keep the column.
-- ---------------------------------------------------------------------------

ALTER TABLE public.folio_history
  DROP CONSTRAINT folio_history_shift_same_property;

-- ---------------------------------------------------------------------------
-- 5. Deprecate the old column and document snapshot fields.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.folio_history.cashier_shift_id IS
  'DEPRECATED PRODUCT-RETIRE-14C — legacy RMS cashier shift identifier; historical only';

COMMENT ON COLUMN public.folio_history.legacy_cashier_shift_id IS
  'PRODUCT-RETIRE-14C historical RMS cashier shift identity. Read-only. Not used by current PMS cashiering.';

COMMENT ON COLUMN public.folio_history.legacy_cashier_shift_status IS
  'PRODUCT-RETIRE-14C historical RMS cashier shift status. Read-only. Not used by current PMS cashiering.';

COMMENT ON COLUMN public.folio_history.legacy_cashier_shift_opened_at IS
  'PRODUCT-RETIRE-14C historical RMS cashier shift opened_at. Read-only. Not used by current PMS cashiering.';

COMMENT ON COLUMN public.folio_history.legacy_cashier_shift_closed_at IS
  'PRODUCT-RETIRE-14C historical RMS cashier shift closed_at. Read-only. Not used by current PMS cashiering. NULL when the referenced shift was still open.';
