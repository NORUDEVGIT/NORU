-- PMS password lifecycle (Phase 5).
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0195_pms_password_lifecycle.sql
--   drizzle/migrations/0195_pms_password_lifecycle.sql
--
-- Apply after 0193. The column default stays false.
-- Authenticated sessions cannot change must_change_password.
-- Service role (staff create, reset access, and clearMyPasswordChange) can.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Password setup status cannot be changed from this session'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_must_change_password ON public.profiles;
CREATE TRIGGER protect_must_change_password
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_must_change_password();
