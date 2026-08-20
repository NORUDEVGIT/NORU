-- 1. Restrict public/authenticated column access to restaurant contact details.
REVOKE SELECT ON public.restaurants FROM anon, authenticated;

GRANT SELECT (
  id, name, slug, address, city, postcode, country, logo_url,
  approved, active, approved_at, approved_by, rejection_reason,
  suspension_reason, status_updated_at, created_at, updated_at
) ON public.restaurants TO anon, authenticated;

-- Owners/managers still update contact details (row access is policy-gated).
GRANT UPDATE ON public.restaurants TO authenticated;
GRANT ALL ON public.restaurants TO service_role;

-- 2. Lock down SECURITY DEFINER functions to the roles that actually need them.
-- Trigger-only functions: never called directly through the API.
REVOKE ALL ON FUNCTION public.enforce_profile_account_type() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_restaurant_protected_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Legacy staff check: not referenced by any policy or client code.
REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon, authenticated;

-- Policy helpers: required by RLS for signed-in users, never for anonymous.
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_restaurant_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_restaurant_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_kitchen_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_restaurant_storage(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_restaurant_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_kitchen_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant_storage(text) TO authenticated;