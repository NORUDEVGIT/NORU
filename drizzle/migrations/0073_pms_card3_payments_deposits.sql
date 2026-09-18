-- PMS Property Setup Card 3 — Payments & Deposits schema (Phase 5).
--
-- Sequential after 0072. Dual-lane: byte-identical copies live in
--   supabase/migrations/0073_pms_card3_payments_deposits.sql
--   drizzle/migrations/0073_pms_card3_payments_deposits.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0073_pms_card3_payments_deposits.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_deposit_policies;
--   ALTER TABLE public.pms_payment_methods
--     DROP CONSTRAINT IF EXISTS pms_payment_methods_type_class_check;
--
-- SET1 / 0056 remain the owning migration for pms_payment_methods.
-- This migration is additive only on that table (type_class CHECK).
-- SET1 restaurants.deposit_required / deposit_type / deposit_value stay as-is.
-- Nothing here reads from or writes those columns. No backfill.
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurants.deposit_*, cancel_*, fo_*_fee_*, tax_*, service_*
--   folio_transactions, post_folio_transaction, guest_folios, folio_history
--   fo_checkin_progress deposit posting / waive
--   pms_integrations or any payment gateway / PCI / card vault
--   hotel_reservations.guarantee_method or a guarantee-policy catalogue
--   order_payments, pos_payments
--   Card 1 identity, Card 2 inventory, Card 3 taxes/rates/meals tables
--   restaurants.pms_property_setup_status or any programme / go-live status
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- No seed. No types.ts regen.

-- 1. Closed type_class list on the existing tenders catalogue.
--    ADD CONSTRAINT has no IF NOT EXISTS spelling. Do not DROP: live rows may
--    already use the column, and Polish Wave 1 keeps writing this table.
--    NULL remains valid so blank type_class rows are unchanged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pms_payment_methods_type_class_check'
      AND conrelid = 'public.pms_payment_methods'::regclass
  ) THEN
    ALTER TABLE public.pms_payment_methods
      ADD CONSTRAINT pms_payment_methods_type_class_check CHECK (
        type_class IS NULL
        OR type_class IN (
          'cash',
          'card',
          'bank_transfer',
          'mobile_money',
          'voucher',
          'city_ledger',
          'other'
        )
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT pms_payment_methods_type_class_check
  ON public.pms_payment_methods IS
  'Card 3 closed tender class. Not a folio_transactions.payment_method enum and not a gateway.';

-- 2. Card 3 deposit policy catalogue. Setup only.
CREATE TABLE IF NOT EXISTS public.pms_deposit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT false,
  deposit_type text NOT NULL,
  deposit_value numeric(12,2) NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_deposit_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_deposit_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_deposit_policies_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,20}$'
  ),
  CONSTRAINT pms_deposit_policies_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_deposit_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_deposit_policies_type_check CHECK (
    deposit_type IN ('none', 'percent', 'fixed', 'first_night')
  ),
  CONSTRAINT pms_deposit_policies_value_check CHECK (
    deposit_value >= 0
    AND (
      (deposit_type = 'none' AND deposit_value = 0)
      OR (deposit_type = 'percent' AND deposit_value <= 100)
      OR deposit_type IN ('fixed', 'first_night')
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_deposit_policies_default_unique
  ON public.pms_deposit_policies (restaurant_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS pms_deposit_policies_restaurant_idx
  ON public.pms_deposit_policies(restaurant_id, code);

COMMENT ON TABLE public.pms_deposit_policies IS
  'Card 3 deposit-policy catalogue. Setup only. Not a folio row, check-in deposit, or reservation link. Does not replace restaurants.deposit_*.';
COMMENT ON COLUMN public.pms_deposit_policies.deposit_type IS
  'none | percent | fixed | first_night. Stored setup rule, not a computed quote.';
COMMENT ON COLUMN public.pms_deposit_policies.deposit_value IS
  'Stored setup figure in restaurants.currency_code. Percent is 0–100. Not a posted deposit.';
COMMENT ON COLUMN public.pms_deposit_policies.is_default IS
  'At most one default policy per property. Not a go-live or programme flag.';
COMMENT ON COLUMN public.pms_deposit_policies.required IS
  'Setup flag that a deposit is expected. Not enforced by cashiering in Phase 5.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_deposit_policies TO authenticated;
GRANT ALL ON public.pms_deposit_policies TO service_role;

ALTER TABLE public.pms_deposit_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms deposit policies" ON public.pms_deposit_policies;
CREATE POLICY "Members read pms deposit policies" ON public.pms_deposit_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms deposit policies" ON public.pms_deposit_policies;
CREATE POLICY "Managers insert pms deposit policies" ON public.pms_deposit_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms deposit policies" ON public.pms_deposit_policies;
CREATE POLICY "Managers update pms deposit policies" ON public.pms_deposit_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms deposit policies" ON public.pms_deposit_policies;
CREATE POLICY "Managers delete pms deposit policies" ON public.pms_deposit_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_deposit_policies_updated_at ON public.pms_deposit_policies;
CREATE TRIGGER set_pms_deposit_policies_updated_at
  BEFORE UPDATE ON public.pms_deposit_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
