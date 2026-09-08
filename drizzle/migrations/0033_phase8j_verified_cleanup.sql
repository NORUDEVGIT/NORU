-- Phase 8J verified cleanup.
-- is_active_staff(): legacy kitchen-auth helper. Verified dead:
--   * zero source references (only the generated types file mentions staff_users)
--   * not referenced by any RLS policy (pg_policies qual/with_check scan)
--   * not bound to any trigger (pg_trigger scan)
--   * not called by any other database function (pg_get_functiondef scan)
DROP FUNCTION IF EXISTS public.is_active_staff();