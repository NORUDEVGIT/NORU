CREATE OR REPLACE FUNCTION public.enforce_profile_account_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  raw_claims text := NULLIF(current_setting('request.jwt.claims', true), '');
  jwt_role text := COALESCE(raw_claims::jsonb ->> 'role', '');
  -- No JWT claims at all means this is a direct/trusted database session
  -- (migration, service connection), not a browser request through the API.
  trusted boolean := raw_claims IS NULL OR jwt_role = 'service_role';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT trusted AND NEW.account_type IS DISTINCT FROM 'customer' THEN
      NEW.account_type := 'customer';
    END IF;
    IF NEW.account_type IS NULL THEN
      NEW.account_type := 'customer';
    END IF;
  ELSE
    IF NEW.account_type IS DISTINCT FROM OLD.account_type
       AND NOT trusted
       AND NOT public.is_platform_admin() THEN
      NEW.account_type := OLD.account_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;