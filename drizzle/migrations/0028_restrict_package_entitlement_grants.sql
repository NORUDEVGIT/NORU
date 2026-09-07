REVOKE ALL ON public.restaurant_package_entitlements FROM anon;
REVOKE ALL ON public.restaurant_package_entitlements FROM authenticated;
GRANT SELECT ON public.restaurant_package_entitlements TO authenticated;
GRANT ALL ON public.restaurant_package_entitlements TO service_role;