-- RR-P4-01 — Immutable daily OTB snapshots for Demand pickup.
-- Dual-lane with supabase/migrations/0103_pms_revenue_otb_snapshots.sql.
-- Does not edit 0016 pricing, reservation snapshots, or Night Audit close_business_date.
-- These are on-the-books snapshots, not forecast snapshots. No forecast table.
-- History starts at this migration; no backfill. True historical OTB cannot be reconstructed.
-- Grain: one row per restaurant × as_of_business_date × stay_date × room_type.
-- Horizon: 90 stay dates beginning on the closed business date (inclusive).
-- Capture is server/internal after a successful Night Audit close. Insert-once; never update.

CREATE TABLE public.hotel_revenue_otb_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  as_of_business_date date NOT NULL,
  stay_date date NOT NULL,
  room_type_id uuid NOT NULL,
  rooms_on_books integer NOT NULL,
  rooms_available integer NOT NULL,
  rooms_remaining integer NOT NULL,
  booked_room_revenue numeric(12,2) NOT NULL DEFAULT 0,
  currency text,
  occupancy_percent numeric(7,2) NOT NULL DEFAULT 0,
  adr numeric(12,2) NOT NULL DEFAULT 0,
  revpar numeric(12,2) NOT NULL DEFAULT 0,
  priced_rooms integer NOT NULL DEFAULT 0,
  priced_share numeric(7,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_revenue_otb_snapshots_grain_unique
    UNIQUE (restaurant_id, as_of_business_date, stay_date, room_type_id),
  CONSTRAINT hotel_revenue_otb_snapshots_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

COMMENT ON TABLE public.hotel_revenue_otb_snapshots IS
  'Immutable daily OTB snapshots for UI-13 pickup. Begins at migration 0103; no backfill. Not forecast history. One row per property × closed business date × stay date × room type. 90-day forward horizon.';

CREATE INDEX hotel_revenue_otb_snapshots_as_of_idx
  ON public.hotel_revenue_otb_snapshots (restaurant_id, as_of_business_date);

CREATE INDEX hotel_revenue_otb_snapshots_stay_idx
  ON public.hotel_revenue_otb_snapshots (restaurant_id, stay_date);

GRANT SELECT ON public.hotel_revenue_otb_snapshots TO authenticated;
GRANT ALL ON public.hotel_revenue_otb_snapshots TO service_role;
ALTER TABLE public.hotel_revenue_otb_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read OTB snapshots" ON public.hotel_revenue_otb_snapshots
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.prevent_hotel_revenue_otb_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OTB_SNAPSHOT_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_revenue_otb_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_revenue_otb_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_revenue_otb_snapshot_mutation();
