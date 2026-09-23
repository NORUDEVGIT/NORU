-- Register New Company / Travel Agency drafts + optional account_operations intent.
-- Dual-lane with drizzle/migrations/0099_pms_account_create_drafts.sql.
-- Drafts are not account masters. account_operations is creation/ops intent,
-- not invoices, credit engines, commission settlement, or signed agreements.

CREATE TABLE IF NOT EXISTS public.pms_account_create_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by_membership_id uuid NOT NULL,
  account_kind text NOT NULL CHECK (account_kind IN ('company', 'travel_agent')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_account_create_drafts_staff_kind_unique
    UNIQUE (restaurant_id, created_by_membership_id, account_kind)
);

CREATE INDEX IF NOT EXISTS pms_account_create_drafts_restaurant_idx
  ON public.pms_account_create_drafts(restaurant_id, account_kind, updated_at DESC);

COMMENT ON TABLE public.pms_account_create_drafts IS
  'In-progress Register New Company / Travel Agency payloads. Not searchable account masters.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_account_create_drafts TO authenticated;
GRANT ALL ON public.pms_account_create_drafts TO service_role;
ALTER TABLE public.pms_account_create_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read account create drafts" ON public.pms_account_create_drafts;
CREATE POLICY "Managers read account create drafts" ON public.pms_account_create_drafts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP POLICY IF EXISTS "Managers write account create drafts" ON public.pms_account_create_drafts;
CREATE POLICY "Managers write account create drafts" ON public.pms_account_create_drafts
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_account_create_drafts_updated_at ON public.pms_account_create_drafts;
CREATE TRIGGER set_pms_account_create_drafts_updated_at
  BEFORE UPDATE ON public.pms_account_create_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS account_operations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.guest_account_masters.account_operations IS
  'Company/TA commercial defaults captured at creation. Not invoices, credit enforcement, or signed agreements.';
