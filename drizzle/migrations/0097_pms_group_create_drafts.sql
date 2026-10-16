-- Register New Group drafts + optional group_operations intent.
-- Dual-lane with drizzle/migrations/0097_pms_group_create_drafts.sql.
-- Drafts are not group masters. group_operations is creation/ops intent,
-- not invoices, payments, or physical room assignments.

CREATE TABLE IF NOT EXISTS public.pms_group_create_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by_membership_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_create_drafts_staff_unique UNIQUE (restaurant_id, created_by_membership_id)
);

CREATE INDEX IF NOT EXISTS pms_group_create_drafts_restaurant_idx
  ON public.pms_group_create_drafts(restaurant_id, updated_at DESC);

COMMENT ON TABLE public.pms_group_create_drafts IS
  'In-progress Register New Group payloads. Not searchable group masters.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_create_drafts TO authenticated;
GRANT ALL ON public.pms_group_create_drafts TO service_role;
ALTER TABLE public.pms_group_create_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read group create drafts" ON public.pms_group_create_drafts;
CREATE POLICY "Managers read group create drafts" ON public.pms_group_create_drafts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP POLICY IF EXISTS "Managers write group create drafts" ON public.pms_group_create_drafts;
CREATE POLICY "Managers write group create drafts" ON public.pms_group_create_drafts
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_group_create_drafts_updated_at ON public.pms_group_create_drafts;
CREATE TRIGGER set_pms_group_create_drafts_updated_at
  BEFORE UPDATE ON public.pms_group_create_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS group_operations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.guest_account_masters.group_operations IS
  'Group travel/billing intent captured at creation. Not invoices, payments, or room assignments.';
