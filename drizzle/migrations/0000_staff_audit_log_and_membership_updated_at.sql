-- Additive: track when a membership last changed (nullable, no default backfill needed).
ALTER TABLE public.restaurant_users ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Focused audit trail for staff/membership changes, tenant scoped.
CREATE TABLE IF NOT EXISTS public.restaurant_staff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_role text,
  new_role text,
  old_active boolean,
  new_active boolean,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_staff_audit_log_restaurant_created_idx
  ON public.restaurant_staff_audit_log (restaurant_id, created_at DESC);

GRANT SELECT ON public.restaurant_staff_audit_log TO authenticated;
GRANT ALL ON public.restaurant_staff_audit_log TO service_role;

ALTER TABLE public.restaurant_staff_audit_log ENABLE ROW LEVEL SECURITY;

-- Only owners/managers of that exact restaurant may read its staff audit trail.
CREATE POLICY "Owners and managers can read staff audit log"
ON public.restaurant_staff_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_role(restaurant_id, 'owner')
  OR public.has_restaurant_role(restaurant_id, 'manager')
);