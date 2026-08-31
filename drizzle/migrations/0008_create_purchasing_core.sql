-- Suppliers
CREATE TABLE public.restaurant_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  tax_id text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX restaurant_suppliers_unique_name_idx
  ON public.restaurant_suppliers (restaurant_id, lower(btrim(name)));
CREATE INDEX restaurant_suppliers_restaurant_idx ON public.restaurant_suppliers (restaurant_id, active);

GRANT SELECT ON public.restaurant_suppliers TO authenticated;
GRANT ALL ON public.restaurant_suppliers TO service_role;
ALTER TABLE public.restaurant_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view suppliers"
ON public.restaurant_suppliers FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_restaurant_suppliers_updated_at
BEFORE UPDATE ON public.restaurant_suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Purchase orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.restaurant_suppliers(id) ON DELETE RESTRICT,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  expected_delivery_date date,
  notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ordered_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft','ordered','partially_received','received','cancelled'))
);

CREATE UNIQUE INDEX purchase_orders_unique_number_idx
  ON public.purchase_orders (restaurant_id, lower(btrim(po_number)));
CREATE INDEX purchase_orders_restaurant_idx ON public.purchase_orders (restaurant_id, status, order_date DESC);
CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders (supplier_id, order_date DESC);

GRANT SELECT ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view purchase orders"
ON public.purchase_orders FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Purchase order line items
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  item_name_snapshot text NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  ordered_quantity numeric(14,3) NOT NULL,
  received_quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_items_qty_check CHECK (ordered_quantity > 0),
  CONSTRAINT purchase_order_items_received_check CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity)
);

CREATE INDEX purchase_order_items_po_idx ON public.purchase_order_items (purchase_order_id);
CREATE INDEX purchase_order_items_item_idx ON public.purchase_order_items (inventory_item_id);

GRANT SELECT ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view purchase order items"
ON public.purchase_order_items FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_purchase_order_items_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable purchase order history
CREATE TABLE public.purchase_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_history_event_check CHECK (event_type IN (
    'po_created','po_updated','po_ordered','goods_received',
    'po_partially_received','po_received','po_cancelled'
  ))
);

CREATE INDEX purchase_order_history_po_idx ON public.purchase_order_history (purchase_order_id, created_at DESC);

GRANT SELECT ON public.purchase_order_history TO authenticated;
GRANT ALL ON public.purchase_order_history TO service_role;
ALTER TABLE public.purchase_order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view purchase order history"
ON public.purchase_order_history FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

-- Traceability on the existing ledger (additive, nullable)
ALTER TABLE public.inventory_stock_movements
  ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  ADD COLUMN supplier_id uuid REFERENCES public.restaurant_suppliers(id) ON DELETE SET NULL;

CREATE INDEX inventory_movements_po_idx ON public.inventory_stock_movements (purchase_order_id);

-- Transaction-safe goods receipt. Reuses apply_inventory_movement for balances.
CREATE OR REPLACE FUNCTION public.receive_purchase_order_goods(
  _restaurant_id uuid,
  _purchase_order_id uuid,
  _lines jsonb,
  _membership_id uuid,
  _notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  po public.purchase_orders%ROWTYPE;
  line jsonb;
  po_line public.purchase_order_items%ROWTYPE;
  qty numeric(14,3);
  received_any boolean := false;
  outstanding integer;
  new_status text;
  movement_id uuid;
BEGIN
  SELECT * INTO po FROM public.purchase_orders
  WHERE id = _purchase_order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('ordered','partially_received') THEN
    RAISE EXCEPTION 'PO_NOT_RECEIVABLE';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    qty := (line ->> 'quantity')::numeric;
    CONTINUE WHEN qty IS NULL OR qty = 0;

    IF qty < 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT * INTO po_line FROM public.purchase_order_items
    WHERE id = (line ->> 'lineId')::uuid
      AND purchase_order_id = po.id
      AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LINE_NOT_FOUND';
    END IF;

    IF po_line.received_quantity + qty > po_line.ordered_quantity THEN
      RAISE EXCEPTION 'EXCEEDS_REMAINING';
    END IF;

    PERFORM public.apply_inventory_movement(
      _restaurant_id,
      po_line.inventory_item_id,
      'purchase_received',
      qty,
      po_line.unit_cost,
      COALESCE(_notes, 'Goods received on ' || po.po_number),
      _membership_id,
      false
    );

    SELECT id INTO movement_id FROM public.inventory_stock_movements
    WHERE restaurant_id = _restaurant_id
      AND inventory_item_id = po_line.inventory_item_id
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE public.inventory_stock_movements
    SET purchase_order_id = po.id,
        purchase_order_item_id = po_line.id,
        supplier_id = po.supplier_id
    WHERE id = movement_id;

    UPDATE public.purchase_order_items
    SET received_quantity = po_line.received_quantity + qty
    WHERE id = po_line.id;

    -- MVP costing: latest received cost becomes the item's current unit cost.
    UPDATE public.inventory_items
    SET unit_cost = po_line.unit_cost
    WHERE id = po_line.inventory_item_id AND restaurant_id = _restaurant_id;

    received_any := true;
  END LOOP;

  IF NOT received_any THEN
    RAISE EXCEPTION 'NOTHING_TO_RECEIVE';
  END IF;

  SELECT count(*) INTO outstanding FROM public.purchase_order_items
  WHERE purchase_order_id = po.id AND received_quantity < ordered_quantity;

  new_status := CASE WHEN outstanding = 0 THEN 'received' ELSE 'partially_received' END;

  UPDATE public.purchase_orders SET status = new_status WHERE id = po.id;

  INSERT INTO public.purchase_order_history (
    restaurant_id, purchase_order_id, event_type, previous_values, new_values,
    notes, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, po.id, 'goods_received',
    jsonb_build_object('status', po.status),
    jsonb_build_object('status', new_status, 'lines', _lines),
    _notes, _membership_id
  );

  INSERT INTO public.purchase_order_history (
    restaurant_id, purchase_order_id, event_type, new_values, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, po.id,
    CASE WHEN new_status = 'received' THEN 'po_received' ELSE 'po_partially_received' END,
    jsonb_build_object('status', new_status), _membership_id
  );

  RETURN new_status;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) TO service_role;