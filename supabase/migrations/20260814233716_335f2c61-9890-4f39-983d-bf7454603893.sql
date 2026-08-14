ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

UPDATE public.restaurants SET approved_at = COALESCE(approved_at, created_at), status_updated_at = COALESCE(status_updated_at, updated_at) WHERE approved = true;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read audit log" ON public.admin_audit_log;
CREATE POLICY "Platform admins can read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_restaurant_idx ON public.admin_audit_log (restaurant_id);

-- Platform admin read access
DROP POLICY IF EXISTS "Platform admins can view all restaurants" ON public.restaurants;
CREATE POLICY "Platform admins can view all restaurants" ON public.restaurants
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can view all memberships" ON public.restaurant_users;
CREATE POLICY "Platform admins can view all memberships" ON public.restaurant_users
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can view all profiles" ON public.profiles;
CREATE POLICY "Platform admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Menu gating: public may only browse menus of approved + active restaurants
DROP POLICY IF EXISTS "Anyone can view available menu items" ON public.menu_items;
CREATE POLICY "Public can view items of live restaurants" ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (
    available = true
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.approved = true AND r.active = true
    )
  );

-- Protected-field trigger: keep owners blocked, allow trusted service-role/platform-admin
CREATE OR REPLACE FUNCTION public.enforce_restaurant_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF jwt_role <> 'service_role' AND NOT public.is_platform_admin() THEN
    NEW.approved := OLD.approved;
    NEW.active := OLD.active;
    NEW.slug := OLD.slug;
    NEW.id := OLD.id;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.status_updated_at := OLD.status_updated_at;
  END IF;
  RETURN NEW;
END;
$function$;