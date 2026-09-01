DROP POLICY IF EXISTS "Authenticated users can read units" ON public.inventory_units;

CREATE POLICY "Restaurant staff can read units"
ON public.inventory_units
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid()
      AND ru.active = true
  )
);