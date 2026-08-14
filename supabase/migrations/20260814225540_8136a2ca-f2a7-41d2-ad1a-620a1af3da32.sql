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
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_restaurant_protected_fields_upd ON public.restaurants;
CREATE TRIGGER enforce_restaurant_protected_fields_upd
BEFORE UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.enforce_restaurant_protected_fields();