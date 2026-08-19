ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_menu_categories_updated_at ON public.menu_categories;
CREATE TRIGGER set_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_restaurant_active_name_key
  ON public.menu_categories (restaurant_id, lower(name)) WHERE active;

-- Menu image storage: tenant-scoped writes for owners/managers only.
CREATE OR REPLACE FUNCTION public.can_manage_restaurant_storage(_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.restaurant_users ru
    where ru.user_id = auth.uid()
      and ru.active = true
      and ru.role in ('owner','manager')
      and ru.restaurant_id::text = split_part(_path, '/', 1)
  );
$$;

DROP POLICY IF EXISTS "Managers can read their menu images" ON storage.objects;
CREATE POLICY "Managers can read their menu images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

DROP POLICY IF EXISTS "Managers can upload their menu images" ON storage.objects;
CREATE POLICY "Managers can upload their menu images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

DROP POLICY IF EXISTS "Managers can update their menu images" ON storage.objects;
CREATE POLICY "Managers can update their menu images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name))
  WITH CHECK (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

DROP POLICY IF EXISTS "Managers can delete their menu images" ON storage.objects;
CREATE POLICY "Managers can delete their menu images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

-- The Garden menu migration (idempotent by restaurant + lower(name)).
INSERT INTO public.menu_categories (restaurant_id, name, sort_order, active)
SELECT '2610521b-53b9-4f75-83c9-741ac84254d0', c.name, c.sort_order, true
FROM (VALUES
  ('Starters',0),('Main Courses',10),('Burgers',20),('Pizza',30),
  ('Sides',40),('Desserts',50),('Drinks',60)
) AS c(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_categories mc
  WHERE mc.restaurant_id = '2610521b-53b9-4f75-83c9-741ac84254d0'
    AND lower(mc.name) = lower(c.name)
);

INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, category, image_url, available)
SELECT '2610521b-53b9-4f75-83c9-741ac84254d0',
       mc.id, i.name, i.description, i.price, i.category, i.image_url, true
FROM (VALUES
  ('Starters','Burrata & Heirloom Tomato','Creamy burrata, slow roasted tomatoes, basil oil.',11.5,'/__l5e/assets-v1/7e1d7c4e-af78-44e4-98f7-0e2b25d22ce2/starters-1.jpg'),
  ('Starters','Crispy Calamari','Golden fried squid, lemon and herb aioli.',10.0,'/__l5e/assets-v1/7730c37b-85d2-48ce-8496-baa85eeb7c24/starters-2.jpg'),
  ('Starters','Garden Bruschetta','Sourdough, marinated tomato, garlic, olive oil.',8.5,'/__l5e/assets-v1/7e1d7c4e-af78-44e4-98f7-0e2b25d22ce2/starters-1.jpg'),
  ('Starters','Salt & Pepper Prawns','Chilli, spring onion, lime crème fraîche.',12.5,'/__l5e/assets-v1/7730c37b-85d2-48ce-8496-baa85eeb7c24/starters-2.jpg'),
  ('Main Courses','Pan Seared Salmon','Green beans, lemon butter, fresh thyme.',21.0,'/__l5e/assets-v1/540be151-310a-460e-ad60-cd10630a1f1a/mains-1.jpg'),
  ('Main Courses','Grilled Ribeye','28 day aged ribeye, peppercorn sauce, rosemary.',29.5,'/__l5e/assets-v1/be845c28-e5d6-4313-9542-f344e0bc9e05/mains-2.jpg'),
  ('Main Courses','Herb Roast Chicken','Half chicken, garden herbs, pan jus.',19.0,'/__l5e/assets-v1/540be151-310a-460e-ad60-cd10630a1f1a/mains-1.jpg'),
  ('Main Courses','Wild Mushroom Risotto','Arborio rice, seasonal mushrooms, parmesan.',17.5,'/__l5e/assets-v1/be845c28-e5d6-4313-9542-f344e0bc9e05/mains-2.jpg'),
  ('Burgers','Garden Classic Cheeseburger','Aged cheddar, brioche bun, house sauce.',15.0,'/__l5e/assets-v1/c6f025a6-58bf-46c9-a7bc-dbd655470a3e/burgers-1.jpg'),
  ('Burgers','Smoked Bacon Stack','Double patty, smoked bacon, crispy onion.',17.0,'/__l5e/assets-v1/c6f025a6-58bf-46c9-a7bc-dbd655470a3e/burgers-1.jpg'),
  ('Burgers','Black Bean & Avocado','Plant based patty, avocado, rocket, tomato.',14.5,'/__l5e/assets-v1/c63afbc7-9226-4e73-b486-996ec7b64b04/burgers-2.jpg'),
  ('Burgers','Buttermilk Chicken Burger','Crisp chicken thigh, slaw, chipotle mayo.',15.5,'/__l5e/assets-v1/c63afbc7-9226-4e73-b486-996ec7b64b04/burgers-2.jpg'),
  ('Pizza','Margherita','San Marzano tomato, fior di latte, basil.',13.0,'/__l5e/assets-v1/e1f96d99-db55-4f48-bc82-1804d20a3196/pizza-1.jpg'),
  ('Pizza','Prosciutto & Rocket','Parma ham, rocket, shaved parmesan.',16.5,'/__l5e/assets-v1/5d39e927-ea5c-4b73-959e-07fa09e713f6/pizza-2.jpg'),
  ('Pizza','Garden Vegetable','Courgette, peppers, red onion, olives.',14.5,'/__l5e/assets-v1/e1f96d99-db55-4f48-bc82-1804d20a3196/pizza-1.jpg'),
  ('Pizza','Truffle Mushroom','Wild mushrooms, truffle oil, mozzarella.',16.0,'/__l5e/assets-v1/5d39e927-ea5c-4b73-959e-07fa09e713f6/pizza-2.jpg'),
  ('Sides','Truffle Parmesan Fries','Skin on fries, truffle oil, parmesan, parsley.',6.5,'/__l5e/assets-v1/bae49046-a8de-40e6-97e4-a8f4e70276b2/sides-1.jpg'),
  ('Sides','Garden Leaf Salad','Seasonal leaves, herbs, lemon dressing.',5.5,'/__l5e/assets-v1/ac05591b-6f4b-4acf-85a9-2a8c6f253298/sides-2.jpg'),
  ('Sides','Rosemary Potatoes','Crushed new potatoes, sea salt, rosemary.',5.0,'/__l5e/assets-v1/bae49046-a8de-40e6-97e4-a8f4e70276b2/sides-1.jpg'),
  ('Sides','Charred Tenderstem','Broccoli, chilli, garlic, olive oil.',6.0,'/__l5e/assets-v1/ac05591b-6f4b-4acf-85a9-2a8c6f253298/sides-2.jpg'),
  ('Desserts','Chocolate Fondant','Molten centre, vanilla bean ice cream.',8.5,'/__l5e/assets-v1/c308d993-e4e6-4231-997f-dbdbec8629f8/desserts-1.jpg'),
  ('Desserts','Baked Cheesecake','Vanilla cheesecake, berry compote.',8.0,'/__l5e/assets-v1/c4f422c0-d9c7-4af0-a17a-bd2c939b1b95/desserts-2.jpg'),
  ('Desserts','Sticky Toffee Pudding','Warm date sponge, toffee sauce, cream.',8.0,'/__l5e/assets-v1/c308d993-e4e6-4231-997f-dbdbec8629f8/desserts-1.jpg'),
  ('Desserts','Berry Sorbet','Seasonal berries, mint, light and fresh.',6.5,'/__l5e/assets-v1/c4f422c0-d9c7-4af0-a17a-bd2c939b1b95/desserts-2.jpg'),
  ('Drinks','Fresh Mint Lemonade','Pressed lemon, mint, sparkling water.',4.5,'/__l5e/assets-v1/8c9741ad-ad58-43af-ba83-b63dbbddb290/drinks-1.jpg'),
  ('Drinks','Flat White','Double espresso, silky steamed milk.',3.5,'/__l5e/assets-v1/8a31b81e-faa9-44da-93d4-5b0aed053c7f/drinks-2.jpg'),
  ('Drinks','Elderflower Spritz','Elderflower, soda, cucumber, ice.',5.0,'/__l5e/assets-v1/8c9741ad-ad58-43af-ba83-b63dbbddb290/drinks-1.jpg'),
  ('Drinks','Iced Matcha Latte','Ceremonial matcha, oat milk, ice.',4.8,'/__l5e/assets-v1/8a31b81e-faa9-44da-93d4-5b0aed053c7f/drinks-2.jpg')
) AS i(category, name, description, price, image_url)
JOIN public.menu_categories mc
  ON mc.restaurant_id = '2610521b-53b9-4f75-83c9-741ac84254d0'
 AND lower(mc.name) = lower(i.category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
  WHERE mi.restaurant_id = '2610521b-53b9-4f75-83c9-741ac84254d0'
    AND lower(mi.name) = lower(i.name)
);