DROP POLICY IF EXISTS "opening hours are publicly readable" ON public.restaurant_opening_hours;

CREATE POLICY "opening hours are publicly readable"
ON public.restaurant_opening_hours
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_opening_hours.restaurant_id
      AND r.approved = true
      AND r.active = true
  )
  OR public.is_restaurant_member(restaurant_id)
);