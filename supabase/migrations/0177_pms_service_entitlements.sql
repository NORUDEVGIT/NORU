-- Operational service entitlements.
-- One row is one reservation room unit + one service + one service date.
-- This is not a folio charge and must not post, refund, or change invoices.
-- Meal dates come from pms_meal_applicability_policies, not from meal-plan type names.
--
-- Explicit seeded defaults (not inferred from hotel practice in report code):
--   Breakfast: not arrival morning, yes after each occupied night, yes departure morning.
--   Lunch: arrival and in-stay days, not departure day.
--   Dinner: arrival and in-stay days, not departure day.
--   Infants are not counted in meal pax.
-- Package components stay financial-only until requires_fulfillment is set.
-- Do not apply from an agent until this file is reviewed with the app change.

CREATE TABLE IF NOT EXISTS public.pms_meal_applicability_policies (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  breakfast_include_arrival boolean NOT NULL DEFAULT false,
  breakfast_include_stay boolean NOT NULL DEFAULT true,
  breakfast_include_departure boolean NOT NULL DEFAULT true,
  lunch_include_arrival boolean NOT NULL DEFAULT true,
  lunch_include_stay boolean NOT NULL DEFAULT true,
  lunch_include_departure boolean NOT NULL DEFAULT false,
  dinner_include_arrival boolean NOT NULL DEFAULT true,
  dinner_include_stay boolean NOT NULL DEFAULT true,
  dinner_include_departure boolean NOT NULL DEFAULT false,
  count_infants boolean NOT NULL DEFAULT false,
  breakfast_department_id uuid,
  lunch_department_id uuid,
  dinner_department_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pms_meal_applicability_policies IS
  'Explicit per-property meal date rules. Reports must not invent meal dates.';

INSERT INTO public.pms_meal_applicability_policies (restaurant_id)
SELECT id FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;

ALTER TABLE public.pms_package_components
  ADD COLUMN IF NOT EXISTS requires_fulfillment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfillment_department_id uuid,
  ADD COLUMN IF NOT EXISTS service_date_rule text;

ALTER TABLE public.pms_package_components
  DROP CONSTRAINT IF EXISTS pms_package_components_service_date_rule_check;
ALTER TABLE public.pms_package_components
  ADD CONSTRAINT pms_package_components_service_date_rule_check
  CHECK (
    service_date_rule IS NULL
    OR service_date_rule IN ('ON_ARRIVAL', 'ON_DEPARTURE', 'EACH_STAY_DATE', 'ONCE_PER_STAY')
  );

COMMENT ON COLUMN public.pms_package_components.requires_fulfillment IS
  'Operational delivery task. Financial-only components stay false and create no entitlement.';

CREATE TABLE IF NOT EXISTS public.pms_reservation_service_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  reservation_room_id uuid NOT NULL,
  guest_id uuid,
  service_kind text NOT NULL,
  meal_code text,
  service_reference_id uuid NOT NULL,
  service_name_snapshot text NOT NULL,
  service_date date NOT NULL,
  adult_quantity integer NOT NULL DEFAULT 0,
  child_quantity integer NOT NULL DEFAULT 0,
  infant_quantity integer NOT NULL DEFAULT 0,
  total_quantity integer NOT NULL DEFAULT 0,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  component_id uuid,
  department_id uuid,
  meal_plan_name_snapshot text,
  room_number_snapshot text NOT NULL DEFAULT '',
  guest_name_snapshot text NOT NULL DEFAULT '',
  building_snapshot text,
  floor_snapshot text,
  notes_snapshot text,
  status text NOT NULL DEFAULT 'PENDING',
  generation_key text NOT NULL,
  fulfilled_at timestamptz,
  fulfilled_by_membership_id uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_service_entitlements_room_fk
    FOREIGN KEY (reservation_room_id, restaurant_id)
    REFERENCES public.hotel_reservation_rooms (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_service_entitlements_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_service_entitlements_generation_unique
    UNIQUE (restaurant_id, generation_key),
  CONSTRAINT pms_service_entitlements_kind_check
    CHECK (service_kind IN ('MEAL', 'PACKAGE_COMPONENT')),
  CONSTRAINT pms_service_entitlements_meal_check
    CHECK (meal_code IS NULL OR meal_code IN ('BREAKFAST', 'LUNCH', 'DINNER')),
  CONSTRAINT pms_service_entitlements_source_check
    CHECK (source_type IN ('RATE_PLAN_MEAL', 'PACKAGE')),
  CONSTRAINT pms_service_entitlements_status_check
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT pms_service_entitlements_qty_check
    CHECK (
      adult_quantity >= 0
      AND child_quantity >= 0
      AND infant_quantity >= 0
      AND total_quantity >= 0
    )
);

COMMENT ON TABLE public.pms_reservation_service_entitlements IS
  'Room-unit operational entitlement. Separate from folio posting. guest_service_history stays the ad-hoc request log.';

CREATE INDEX IF NOT EXISTS pms_service_entitlements_date_idx
  ON public.pms_reservation_service_entitlements (restaurant_id, service_date, service_kind, status);
CREATE INDEX IF NOT EXISTS pms_service_entitlements_department_idx
  ON public.pms_reservation_service_entitlements (restaurant_id, department_id, service_date);
CREATE INDEX IF NOT EXISTS pms_service_entitlements_room_idx
  ON public.pms_reservation_service_entitlements (restaurant_id, reservation_room_id);

ALTER TABLE public.pms_meal_applicability_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_reservation_service_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Front office reads meal applicability"
  ON public.pms_meal_applicability_policies;
CREATE POLICY "Front office reads meal applicability"
  ON public.pms_meal_applicability_policies
  FOR SELECT TO authenticated
  USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager', 'receptionist'])
  );

DROP POLICY IF EXISTS "Managers write meal applicability"
  ON public.pms_meal_applicability_policies;
CREATE POLICY "Managers write meal applicability"
  ON public.pms_meal_applicability_policies
  FOR ALL TO authenticated
  USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "Front office reads service entitlements"
  ON public.pms_reservation_service_entitlements;
CREATE POLICY "Front office reads service entitlements"
  ON public.pms_reservation_service_entitlements
  FOR SELECT TO authenticated
  USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager', 'receptionist'])
  );

DROP POLICY IF EXISTS "Front office updates service entitlements"
  ON public.pms_reservation_service_entitlements;
CREATE POLICY "Front office updates service entitlements"
  ON public.pms_reservation_service_entitlements
  FOR UPDATE TO authenticated
  USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager', 'receptionist'])
  )
  WITH CHECK (
    public.has_any_restaurant_role(restaurant_id, ARRAY['owner', 'manager', 'receptionist'])
  );

GRANT SELECT, INSERT, UPDATE ON public.pms_meal_applicability_policies TO authenticated;
GRANT SELECT, UPDATE ON public.pms_reservation_service_entitlements TO authenticated;
GRANT ALL ON public.pms_meal_applicability_policies TO service_role;
GRANT ALL ON public.pms_reservation_service_entitlements TO service_role;
