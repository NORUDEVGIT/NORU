-- PMS RBAC phase 2.5.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0194_pms_rbac_phase25.sql
--   drizzle/migrations/0194_pms_rbac_phase25.sql
--
-- Inactivates duplicate permission codes that are already covered by the
-- typed catalogue. Does not delete rows.
-- Card 7 writes go through service-role server functions, so authenticated
-- manager write policies are removed. Member SELECT stays.

UPDATE public.pms_permissions
SET active = false
WHERE code IN (
  'cashiering.folio.create',
  'cashiering.room_charge.post',
  'front_office.fee.post',
  'front_office.guest_request.edit',
  'guest.document.edit',
  'housekeeping.discrepancy.edit',
  'reports.pms.print'
);

DROP POLICY IF EXISTS "Managers insert hotel roles" ON public.pms_hotel_roles;
DROP POLICY IF EXISTS "Managers update hotel roles" ON public.pms_hotel_roles;
DROP POLICY IF EXISTS "Managers delete hotel roles" ON public.pms_hotel_roles;
DROP POLICY IF EXISTS "Managers insert role permissions" ON public.pms_role_permissions;
DROP POLICY IF EXISTS "Managers update role permissions" ON public.pms_role_permissions;
DROP POLICY IF EXISTS "Managers delete role permissions" ON public.pms_role_permissions;
DROP POLICY IF EXISTS "Managers insert approval rules" ON public.pms_approval_rules;
DROP POLICY IF EXISTS "Managers update approval rules" ON public.pms_approval_rules;
DROP POLICY IF EXISTS "Managers delete approval rules" ON public.pms_approval_rules;

REVOKE INSERT, UPDATE, DELETE ON public.pms_hotel_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pms_role_permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pms_approval_rules FROM authenticated;
