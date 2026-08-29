ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'GBP';

CREATE TABLE public.restaurant_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '22:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, day_of_week)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_opening_hours TO authenticated;
GRANT SELECT ON public.restaurant_opening_hours TO anon;
GRANT ALL ON public.restaurant_opening_hours TO service_role;

ALTER TABLE public.restaurant_opening_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opening hours are publicly readable"
  ON public.restaurant_opening_hours FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "owners and managers insert opening hours"
  ON public.restaurant_opening_hours FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "owners and managers update opening hours"
  ON public.restaurant_opening_hours FOR UPDATE
  TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "owners and managers delete opening hours"
  ON public.restaurant_opening_hours FOR DELETE
  TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_restaurant_opening_hours_updated_at
  BEFORE UPDATE ON public.restaurant_opening_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_restaurant_opening_hours_restaurant ON public.restaurant_opening_hours(restaurant_id);