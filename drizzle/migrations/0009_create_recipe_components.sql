CREATE TABLE public.menu_item_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity_base numeric(14,4) NOT NULL,
  display_quantity numeric(14,4) NOT NULL,
  display_unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_components_quantity_positive CHECK (quantity_base > 0 AND display_quantity > 0)
);

CREATE UNIQUE INDEX menu_item_recipe_components_unique_idx
  ON public.menu_item_recipe_components (menu_item_id, inventory_item_id);
CREATE INDEX menu_item_recipe_components_restaurant_idx
  ON public.menu_item_recipe_components (restaurant_id, menu_item_id);
CREATE INDEX menu_item_recipe_components_ingredient_idx
  ON public.menu_item_recipe_components (restaurant_id, inventory_item_id);

GRANT SELECT ON public.menu_item_recipe_components TO authenticated;
GRANT ALL ON public.menu_item_recipe_components TO service_role;
ALTER TABLE public.menu_item_recipe_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view recipe components"
ON public.menu_item_recipe_components FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_menu_item_recipe_components_updated_at
BEFORE UPDATE ON public.menu_item_recipe_components
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();