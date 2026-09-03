-- 1. Lock down SECURITY DEFINER functions: no anon/public execute.
DO $$
DECLARE
  fn record;
  keep_authenticated text[] := ARRAY[
    'has_restaurant_role','has_any_restaurant_role','has_kitchen_access',
    'is_restaurant_member','is_platform_admin','is_active_staff',
    'can_manage_restaurant_storage','count_sellable_rooms','count_reserved_rooms',
    'folio_balance'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.sig);
    IF fn.proname = ANY (keep_authenticated) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn.sig);
    END IF;
  END LOOP;
END $$;

-- 2. property-images storage bucket: explicit tenant-scoped policies (bucket stays private).
DROP POLICY IF EXISTS "Managers read their property images" ON storage.objects;
DROP POLICY IF EXISTS "Managers upload their property images" ON storage.objects;
DROP POLICY IF EXISTS "Managers update their property images" ON storage.objects;
DROP POLICY IF EXISTS "Managers delete their property images" ON storage.objects;

CREATE POLICY "Managers read their property images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers upload their property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers update their property images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name))
WITH CHECK (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers delete their property images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

-- 3. hotel_reservations: deletes stay denied (no DELETE policy) and updates can no longer
--    move a reservation to another property.
DROP POLICY IF EXISTS "Front office update reservations" ON public.hotel_reservations;
CREATE POLICY "Front office update reservations"
ON public.hotel_reservations FOR UPDATE TO authenticated
USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']))
WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));