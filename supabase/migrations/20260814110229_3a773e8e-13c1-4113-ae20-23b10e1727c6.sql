CREATE OR REPLACE FUNCTION public.enforce_profile_account_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF jwt_role <> 'service_role' AND NEW.account_type IS DISTINCT FROM 'customer' THEN
      NEW.account_type := 'customer';
    END IF;
    IF NEW.account_type IS NULL THEN
      NEW.account_type := 'customer';
    END IF;
  ELSE
    IF NEW.account_type IS DISTINCT FROM OLD.account_type
       AND jwt_role <> 'service_role'
       AND NOT public.is_platform_admin() THEN
      NEW.account_type := OLD.account_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_account_type_ins ON public.profiles;
CREATE TRIGGER enforce_profile_account_type_ins
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_account_type();

DROP TRIGGER IF EXISTS enforce_profile_account_type_upd ON public.profiles;
CREATE TRIGGER enforce_profile_account_type_upd
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_account_type();

CREATE INDEX IF NOT EXISTS orders_customer_id_created_at_idx
  ON public.orders (customer_id, created_at DESC);