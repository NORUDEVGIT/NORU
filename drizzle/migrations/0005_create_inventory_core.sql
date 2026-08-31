-- Units of measurement (platform reference data)
CREATE TABLE public.inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_units_type_check CHECK (unit_type IN ('weight','volume','count'))
);

GRANT SELECT ON public.inventory_units TO authenticated;
GRANT ALL ON public.inventory_units TO service_role;
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read units"
ON public.inventory_units FOR SELECT TO authenticated
USING (true);

INSERT INTO public.inventory_units (code, name, unit_type) VALUES
  ('kg', 'Kilogram', 'weight'),
  ('g', 'Gram', 'weight'),
  ('mg', 'Milligram', 'weight'),
  ('L', 'Litre', 'volume'),
  ('ml', 'Millilitre', 'volume'),
  ('piece', 'Piece', 'count'),
  ('pack', 'Pack', 'count'),
  ('box', 'Box', 'count'),
  ('bottle', 'Bottle', 'count'),
  ('can', 'Can', 'count'),
  ('bag', 'Bag', 'count'),
  ('tray', 'Tray', 'count'),
  ('roll', 'Roll', 'count'),
  ('case', 'Case', 'count');

-- Inventory items
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  inventory_type text NOT NULL,
  base_unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  current_quantity numeric(14,3) NOT NULL DEFAULT 0,
  minimum_stock_level numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_type_check CHECK (inventory_type IN ('ingredient','consumable')),
  CONSTRAINT inventory_items_min_level_check CHECK (minimum_stock_level >= 0)
);

CREATE UNIQUE INDEX inventory_items_unique_name_idx
  ON public.inventory_items (restaurant_id, lower(btrim(name)), inventory_type);
CREATE INDEX inventory_items_restaurant_idx ON public.inventory_items (restaurant_id, inventory_type);

GRANT SELECT ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view inventory items"
ON public.inventory_items FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable stock movement ledger
CREATE TABLE public.inventory_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  unit_cost numeric(12,2),
  reason text,
  balance_after numeric(14,3),
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_check CHECK (movement_type IN (
    'opening_balance','purchase_received','usage','waste','loss',
    'adjustment_in','adjustment_out','stocktake_adjustment'
  )),
  CONSTRAINT inventory_movements_quantity_nonzero CHECK (quantity <> 0)
);

CREATE INDEX inventory_movements_restaurant_idx
  ON public.inventory_stock_movements (restaurant_id, created_at DESC);
CREATE INDEX inventory_movements_item_idx
  ON public.inventory_stock_movements (inventory_item_id, created_at DESC);

GRANT SELECT ON public.inventory_stock_movements TO authenticated;
GRANT ALL ON public.inventory_stock_movements TO service_role;
ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view stock movements"
ON public.inventory_stock_movements FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

-- Atomic movement + balance update. Called only by the server (service role).
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _restaurant_id uuid,
  _item_id uuid,
  _movement_type text,
  _signed_quantity numeric,
  _unit_cost numeric,
  _reason text,
  _membership_id uuid,
  _allow_negative boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item public.inventory_items%ROWTYPE;
  new_balance numeric(14,3);
BEGIN
  IF _signed_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  SELECT * INTO item
  FROM public.inventory_items
  WHERE id = _item_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found for this restaurant.';
  END IF;

  new_balance := item.current_quantity + _signed_quantity;

  IF new_balance < 0 AND NOT _allow_negative THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  INSERT INTO public.inventory_stock_movements (
    restaurant_id, inventory_item_id, movement_type, quantity, unit_id,
    unit_cost, reason, balance_after, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, _item_id, _movement_type, _signed_quantity, item.base_unit_id,
    _unit_cost, _reason, new_balance, _membership_id
  );

  UPDATE public.inventory_items
  SET current_quantity = new_balance
  WHERE id = _item_id;

  RETURN new_balance;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) TO service_role;