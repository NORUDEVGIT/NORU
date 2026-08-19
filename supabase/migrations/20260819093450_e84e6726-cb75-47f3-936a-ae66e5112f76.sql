CREATE OR REPLACE FUNCTION public.has_kitchen_access(_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid()
      and restaurant_id = _restaurant_id
      and active = true
      and role in ('owner', 'manager', 'kitchen')
  );
$$;

DROP POLICY IF EXISTS "Kitchen staff can update their restaurant orders" ON public.orders;

CREATE POLICY "Kitchen staff can update their restaurant orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_kitchen_access(restaurant_id))
WITH CHECK (public.has_kitchen_access(restaurant_id));