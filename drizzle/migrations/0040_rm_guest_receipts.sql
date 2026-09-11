-- Issue #27 — Restaurant Management guest receipt snapshots (view / print / reprint / email).
--
-- Additive only. Lives on the orders / order_receipts domain.
-- Does NOT create, alter, or write Standalone POS pos_* tables.
-- Does NOT change package entitlements or tenant approval.
-- Does NOT add thermal/ESC-POS, SMS, kitchen tickets, tips, or logo upload.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0040_rm_guest_receipts.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Abel applies this after merge.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_order_receipt_reprint(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.freeze_order_receipt(uuid, uuid, jsonb);
--   DROP POLICY IF EXISTS "Cash-handling staff read order receipts" ON public.order_receipts;
--   REVOKE ALL ON TABLE public.order_receipts FROM authenticated, service_role;
--   DROP TABLE IF EXISTS public.order_receipts;

CREATE TABLE IF NOT EXISTS public.order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  reprint_count integer NOT NULL DEFAULT 0,
  last_reprinted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_receipts_order_unique UNIQUE (order_id),
  CONSTRAINT order_receipts_reprint_count_check CHECK (reprint_count >= 0)
);

CREATE INDEX IF NOT EXISTS order_receipts_restaurant_idx
  ON public.order_receipts (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_receipts_order_idx
  ON public.order_receipts (order_id);

COMMENT ON TABLE public.order_receipts IS
  'Frozen guest bill for a paid or Complete (comped) restaurant sale. Snapshot is immutable after first insert.';
COMMENT ON COLUMN public.order_receipts.snapshot IS
  'Guest-safe JSON frozen at pay: hotel header, lines, discount/comp, tax/service/payable, tenders, refunds at freeze time.';

GRANT SELECT ON public.order_receipts TO authenticated;
GRANT ALL ON public.order_receipts TO service_role;

ALTER TABLE public.order_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash-handling staff read order receipts" ON public.order_receipts;
CREATE POLICY "Cash-handling staff read order receipts"
  ON public.order_receipts FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

-- Idempotent freeze. Never overwrites an existing snapshot.
CREATE OR REPLACE FUNCTION public.freeze_order_receipt(
  _restaurant_id uuid,
  _order_id uuid,
  _snapshot jsonb
) RETURNS public.order_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.order_receipts%ROWTYPE;
BEGIN
  IF _snapshot IS NULL OR jsonb_typeof(_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'RECEIPT_SNAPSHOT_REQUIRED';
  END IF;

  INSERT INTO public.order_receipts (restaurant_id, order_id, snapshot)
  VALUES (_restaurant_id, _order_id, _snapshot)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    SELECT * INTO _row FROM public.order_receipts
      WHERE order_id = _order_id AND restaurant_id = _restaurant_id;
  END IF;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_order_receipt(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_order_receipt(uuid, uuid, jsonb)
  TO service_role;

-- Cheap reprint audit. Does not mutate sale totals or the frozen snapshot.
CREATE OR REPLACE FUNCTION public.record_order_receipt_reprint(
  _restaurant_id uuid,
  _order_id uuid
) RETURNS public.order_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.order_receipts%ROWTYPE;
BEGIN
  UPDATE public.order_receipts
    SET reprint_count = reprint_count + 1,
        last_reprinted_at = now()
    WHERE order_id = _order_id AND restaurant_id = _restaurant_id
    RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEIPT_NOT_FOUND';
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_receipt_reprint(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_receipt_reprint(uuid, uuid)
  TO service_role;
