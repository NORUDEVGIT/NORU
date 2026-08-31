CREATE TABLE public.restaurant_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('operating_asset','equipment')),
  name text NOT NULL,
  asset_code text,
  quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('excellent','good','fair','damaged')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','under_maintenance','out_of_service','disposed')),
  location text,
  purchase_date date,
  purchase_cost numeric(14,2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  serial_number text,
  warranty_expiry date,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX restaurant_assets_code_unique
  ON public.restaurant_assets (restaurant_id, lower(asset_code))
  WHERE asset_code IS NOT NULL;

CREATE INDEX restaurant_assets_tenant_idx
  ON public.restaurant_assets (restaurant_id, asset_type, status);

CREATE TRIGGER set_restaurant_assets_updated_at
  BEFORE UPDATE ON public.restaurant_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.restaurant_assets TO authenticated;
GRANT ALL ON public.restaurant_assets TO service_role;

ALTER TABLE public.restaurant_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read restaurant assets"
  ON public.restaurant_assets FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

CREATE TABLE public.restaurant_asset_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.restaurant_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('asset_created','asset_updated','condition_changed','status_changed','location_changed','quantity_changed','disposed')),
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX restaurant_asset_history_asset_idx
  ON public.restaurant_asset_history (asset_id, created_at DESC);

GRANT SELECT ON public.restaurant_asset_history TO authenticated;
GRANT ALL ON public.restaurant_asset_history TO service_role;

ALTER TABLE public.restaurant_asset_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read restaurant asset history"
  ON public.restaurant_asset_history FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));