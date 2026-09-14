-- PMS Polish Wave 1 — Payment methods and shift definitions (Issue #106).
--
-- Sequential after 0055. Dual-lane with
--   supabase/migrations/0056_pms_polish1_payment_methods_admin_fee_presets.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No sample payment methods or shifts.
-- RLS on new tables matches rooms: members read; owner/manager write.
-- Fee presets reuse cancel_fee_basis / noshow_fee_basis + fo_* fee defaults.
-- No new fee-preset posture table or second live flag.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — Abel authorized 2026-09-14. Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0056_pms_polish1_payment_methods_admin_fee_presets.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_shift_definitions;
--   DROP TABLE IF EXISTS public.pms_payment_methods;

CREATE TABLE IF NOT EXISTS public.pms_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type_class text,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_payment_methods_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_payment_methods_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_payment_methods_restaurant_idx
  ON public.pms_payment_methods(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_payment_methods TO authenticated;
GRANT ALL ON public.pms_payment_methods TO service_role;
ALTER TABLE public.pms_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read payment methods" ON public.pms_payment_methods;
CREATE POLICY "Members read payment methods" ON public.pms_payment_methods
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert payment methods" ON public.pms_payment_methods;
CREATE POLICY "Managers insert payment methods" ON public.pms_payment_methods
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update payment methods" ON public.pms_payment_methods;
CREATE POLICY "Managers update payment methods" ON public.pms_payment_methods
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete payment methods" ON public.pms_payment_methods;
CREATE POLICY "Managers delete payment methods" ON public.pms_payment_methods
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_payment_methods_updated_at ON public.pms_payment_methods;
CREATE TRIGGER set_pms_payment_methods_updated_at BEFORE UPDATE ON public.pms_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_payment_methods IS
  'PMS Polish Wave 1 accepted-tenders catalogue. Not payment gateways. Empty is a Warning, not a go-live block. No sample seed.';

CREATE TABLE IF NOT EXISTS public.pms_shift_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type_class text,
  notes text NOT NULL DEFAULT '',
  start_time text,
  end_time text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_shift_definitions_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_shift_definitions_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_shift_definitions_restaurant_idx
  ON public.pms_shift_definitions(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_shift_definitions TO authenticated;
GRANT ALL ON public.pms_shift_definitions TO service_role;
ALTER TABLE public.pms_shift_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read shift definitions" ON public.pms_shift_definitions;
CREATE POLICY "Members read shift definitions" ON public.pms_shift_definitions
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert shift definitions" ON public.pms_shift_definitions;
CREATE POLICY "Managers insert shift definitions" ON public.pms_shift_definitions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update shift definitions" ON public.pms_shift_definitions;
CREATE POLICY "Managers update shift definitions" ON public.pms_shift_definitions
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete shift definitions" ON public.pms_shift_definitions;
CREATE POLICY "Managers delete shift definitions" ON public.pms_shift_definitions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_shift_definitions_updated_at ON public.pms_shift_definitions;
CREATE TRIGGER set_pms_shift_definitions_updated_at BEFORE UPDATE ON public.pms_shift_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_shift_definitions IS
  'PMS Polish Wave 1 shift-definition catalogue. Not a roster table and not jsonb-only. Empty is a Warning, not a go-live block. No sample seed.';
