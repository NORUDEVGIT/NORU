-- P5A-01 — Commercial Engine schema + immutable operational history.
-- Dual-lane with supabase/migrations/0104_pms_commercial_engine_foundation.sql.
-- Does not edit 0016, 0072, 0075, or 0076.
-- Does not replace price_hotel_stay or priced reservation RPCs.
-- Does not add apply_hotel_promotion_activation or apply_hotel_package_activation.
-- Property Setup masters stay owners. These tables are Rate & Revenue operational.
-- History starts at this migration; no reservation attribution backfill.
-- V1 locks (enforced later in domain, documented here):
--   promotion fixed = amount off stay room subtotal
--   free_night is snapshot-capable but not executable
--   no stacking; lowest priority number wins, then largest discount, then earliest created_at
--   overlapping promotions allowed with warning
--   packages are additive per_stay outside room_subtotal
--   room_subtotal / nightly_rate_snapshot remain pre-commercial
--   empty activation room-type rows inherit master room-type scope
--   promotion empty rate-plan rows allow all property rate plans
--   package empty rate-plan rows inherit master package rate-plan scope
--   no day-of-week, source/channel, coupon, seasons, or corporate wiring

CREATE TABLE public.hotel_promotion_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  booking_from date NOT NULL,
  booking_to date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  reason text,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  promotion_code text NOT NULL,
  promotion_name text NOT NULL,
  promo_kind text NOT NULL,
  promo_value numeric(12,2) NOT NULL,
  master_valid_from date,
  master_valid_to date,
  master_room_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_promotion_activations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_promotion_activations_promotion_fk
    FOREIGN KEY (promotion_id, restaurant_id)
    REFERENCES public.pms_promotions (id, restaurant_id),
  CONSTRAINT hotel_promotion_activations_stay_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT hotel_promotion_activations_booking_dates_check CHECK (booking_to >= booking_from),
  CONSTRAINT hotel_promotion_activations_priority_check CHECK (priority >= 0),
  CONSTRAINT hotel_promotion_activations_kind_check CHECK (promo_kind IN ('percent', 'fixed', 'free_night')),
  CONSTRAINT hotel_promotion_activations_value_check CHECK (promo_value >= 0),
  CONSTRAINT hotel_promotion_activations_code_check CHECK (length(btrim(promotion_code)) BETWEEN 1 AND 20),
  CONSTRAINT hotel_promotion_activations_name_check CHECK (length(btrim(promotion_name)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.hotel_promotion_activations IS
  'Operational promotion activation. Snapshots master execution fields at apply time. Master edits do not rewrite existing rows. Empty room-type mappings inherit master scope. Empty rate-plan mappings allow all plans. free_night may be stored; V1 pricing must not execute it.';

COMMENT ON COLUMN public.hotel_promotion_activations.priority IS
  'Lower number wins. V1 no stacking: lowest priority, then largest computed discount, then earliest created_at.';

COMMENT ON COLUMN public.hotel_promotion_activations.promo_kind IS
  'Snapshotted master kind. V1 executable kinds are percent and fixed. free_night is unsupported for execution.';

CREATE INDEX hotel_promotion_activations_range_idx
  ON public.hotel_promotion_activations (restaurant_id, valid_from, valid_to);

CREATE INDEX hotel_promotion_activations_promotion_idx
  ON public.hotel_promotion_activations (restaurant_id, promotion_id);

CREATE INDEX hotel_promotion_activations_active_idx
  ON public.hotel_promotion_activations (restaurant_id, active);

CREATE TABLE public.hotel_promotion_activation_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_promotion_activation_room_types_unique UNIQUE (activation_id, room_type_id),
  CONSTRAINT hotel_promotion_activation_room_types_activation_fk
    FOREIGN KEY (activation_id, restaurant_id)
    REFERENCES public.hotel_promotion_activations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_promotion_activation_room_types_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
);

COMMENT ON TABLE public.hotel_promotion_activation_room_types IS
  'Activation room-type scope. May narrow master pms_promotion_room_types. Must not broaden. Empty set inherits master scope.';

CREATE TABLE public.hotel_promotion_activation_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_promotion_activation_rate_plans_unique UNIQUE (activation_id, rate_plan_id),
  CONSTRAINT hotel_promotion_activation_rate_plans_activation_fk
    FOREIGN KEY (activation_id, restaurant_id)
    REFERENCES public.hotel_promotion_activations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_promotion_activation_rate_plans_plan_fk
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans (id, restaurant_id)
);

COMMENT ON TABLE public.hotel_promotion_activation_rate_plans IS
  'Operational rate-plan scope. Promotion masters have no rate-plan join. Empty set allows all property rate plans.';

CREATE TABLE public.hotel_package_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  reason text,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  package_code text NOT NULL,
  package_name text NOT NULL,
  package_type text,
  package_price numeric(12,2) NOT NULL,
  charge_basis text NOT NULL DEFAULT 'per_stay',
  components_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  master_room_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  master_rate_plan_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_package_activations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_package_activations_package_fk
    FOREIGN KEY (package_id, restaurant_id)
    REFERENCES public.pms_packages (id, restaurant_id),
  CONSTRAINT hotel_package_activations_stay_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT hotel_package_activations_price_check CHECK (package_price >= 0),
  CONSTRAINT hotel_package_activations_charge_basis_check CHECK (charge_basis = 'per_stay'),
  CONSTRAINT hotel_package_activations_code_check CHECK (length(btrim(package_code)) BETWEEN 1 AND 40),
  CONSTRAINT hotel_package_activations_name_check CHECK (length(btrim(package_name)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.hotel_package_activations IS
  'Operational package activation. Snapshots package_price, charge_basis, and components. V1 charge_basis is per_stay only. Additive outside hotel_reservations.room_subtotal. No booking window in V1.';

CREATE INDEX hotel_package_activations_range_idx
  ON public.hotel_package_activations (restaurant_id, valid_from, valid_to);

CREATE INDEX hotel_package_activations_package_idx
  ON public.hotel_package_activations (restaurant_id, package_id);

CREATE INDEX hotel_package_activations_active_idx
  ON public.hotel_package_activations (restaurant_id, active);

CREATE TABLE public.hotel_package_activation_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_package_activation_room_types_unique UNIQUE (activation_id, room_type_id),
  CONSTRAINT hotel_package_activation_room_types_activation_fk
    FOREIGN KEY (activation_id, restaurant_id)
    REFERENCES public.hotel_package_activations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_package_activation_room_types_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
);

COMMENT ON TABLE public.hotel_package_activation_room_types IS
  'Activation room-type scope. May narrow master pms_package_room_types. Must not broaden. Empty set inherits master scope.';

CREATE TABLE public.hotel_package_activation_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_package_activation_rate_plans_unique UNIQUE (activation_id, rate_plan_id),
  CONSTRAINT hotel_package_activation_rate_plans_activation_fk
    FOREIGN KEY (activation_id, restaurant_id)
    REFERENCES public.hotel_package_activations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_package_activation_rate_plans_plan_fk
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans (id, restaurant_id)
);

COMMENT ON TABLE public.hotel_package_activation_rate_plans IS
  'Activation rate-plan scope. May narrow master pms_package_rate_plans. Must not broaden. Empty set inherits master rate-plan scope.';

CREATE TABLE public.hotel_reservation_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  promotion_activation_id uuid NOT NULL,
  promotion_id uuid NOT NULL,
  promotion_code text NOT NULL,
  promotion_name text NOT NULL,
  promo_kind text NOT NULL,
  promo_value numeric(12,2) NOT NULL,
  base_room_subtotal numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  room_subtotal_after_promotion numeric(12,2) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_promotions_reservation_unique UNIQUE (reservation_id),
  CONSTRAINT hotel_reservation_promotions_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_promotions_activation_fk
    FOREIGN KEY (promotion_activation_id, restaurant_id)
    REFERENCES public.hotel_promotion_activations (id, restaurant_id),
  CONSTRAINT hotel_reservation_promotions_promotion_fk
    FOREIGN KEY (promotion_id, restaurant_id)
    REFERENCES public.pms_promotions (id, restaurant_id),
  CONSTRAINT hotel_reservation_promotions_kind_check CHECK (promo_kind IN ('percent', 'fixed', 'free_night')),
  CONSTRAINT hotel_reservation_promotions_money_check CHECK (
    base_room_subtotal >= 0
    AND discount_amount >= 0
    AND room_subtotal_after_promotion >= 0
  )
);

COMMENT ON TABLE public.hotel_reservation_promotions IS
  'V1 at most one promotion per reservation. Stores commercial discount separately. Does not change hotel_reservations.room_subtotal. Missing row on older reservations is valid.';

CREATE INDEX hotel_reservation_promotions_activation_idx
  ON public.hotel_reservation_promotions (promotion_activation_id);

CREATE TABLE public.hotel_reservation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  package_activation_id uuid NOT NULL,
  package_id uuid NOT NULL,
  package_code text NOT NULL,
  package_name text NOT NULL,
  charge_basis text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_amount numeric(12,2) NOT NULL,
  applied_amount numeric(12,2) NOT NULL,
  components_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_packages_reservation_activation_unique UNIQUE (reservation_id, package_activation_id),
  CONSTRAINT hotel_reservation_packages_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_packages_activation_fk
    FOREIGN KEY (package_activation_id, restaurant_id)
    REFERENCES public.hotel_package_activations (id, restaurant_id),
  CONSTRAINT hotel_reservation_packages_package_fk
    FOREIGN KEY (package_id, restaurant_id)
    REFERENCES public.pms_packages (id, restaurant_id),
  CONSTRAINT hotel_reservation_packages_charge_basis_check CHECK (charge_basis = 'per_stay'),
  CONSTRAINT hotel_reservation_packages_quantity_check CHECK (quantity >= 1),
  CONSTRAINT hotel_reservation_packages_money_check CHECK (
    unit_amount >= 0
    AND applied_amount >= 0
  )
);

COMMENT ON TABLE public.hotel_reservation_packages IS
  'Zero-to-many additive packages per reservation. applied_amount is commercial money outside hotel_reservations.room_subtotal. Missing rows on older reservations are valid.';

CREATE INDEX hotel_reservation_packages_reservation_idx
  ON public.hotel_reservation_packages (reservation_id);

CREATE INDEX hotel_reservation_packages_activation_idx
  ON public.hotel_reservation_packages (package_activation_id);

CREATE TABLE public.hotel_commercial_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  master_id uuid,
  action_type text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_commercial_change_events_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_commercial_change_events_entity_check CHECK (entity_type IN (
    'promotion_activation',
    'package_activation'
  )),
  CONSTRAINT hotel_commercial_change_events_action_check CHECK (action_type IN (
    'promotion_activation_created',
    'promotion_activation_edited',
    'promotion_activation_deactivated',
    'promotion_activation_scope_changed',
    'package_activation_created',
    'package_activation_edited',
    'package_activation_deactivated',
    'package_activation_scope_changed'
  )),
  CONSTRAINT hotel_commercial_change_events_source_check CHECK (source IN (
    'rate_revenue',
    'commercial_workspace'
  ))
);

COMMENT ON TABLE public.hotel_commercial_change_events IS
  'Immutable Rate & Revenue operational commercial history for UI-21. One full before/after snapshot per changed activation. One operation_id per apply. Not Property Setup staff audit. Begins at 0104; no backfill.';

CREATE INDEX hotel_commercial_change_events_created_idx
  ON public.hotel_commercial_change_events (restaurant_id, created_at DESC);

CREATE INDEX hotel_commercial_change_events_operation_idx
  ON public.hotel_commercial_change_events (operation_id);

CREATE INDEX hotel_commercial_change_events_entity_idx
  ON public.hotel_commercial_change_events (entity_type, entity_id);

GRANT SELECT ON public.hotel_promotion_activations TO authenticated;
GRANT SELECT ON public.hotel_promotion_activation_room_types TO authenticated;
GRANT SELECT ON public.hotel_promotion_activation_rate_plans TO authenticated;
GRANT SELECT ON public.hotel_package_activations TO authenticated;
GRANT SELECT ON public.hotel_package_activation_room_types TO authenticated;
GRANT SELECT ON public.hotel_package_activation_rate_plans TO authenticated;
GRANT SELECT ON public.hotel_reservation_promotions TO authenticated;
GRANT SELECT ON public.hotel_reservation_packages TO authenticated;
GRANT SELECT ON public.hotel_commercial_change_events TO authenticated;

GRANT ALL ON public.hotel_promotion_activations TO service_role;
GRANT ALL ON public.hotel_promotion_activation_room_types TO service_role;
GRANT ALL ON public.hotel_promotion_activation_rate_plans TO service_role;
GRANT ALL ON public.hotel_package_activations TO service_role;
GRANT ALL ON public.hotel_package_activation_room_types TO service_role;
GRANT ALL ON public.hotel_package_activation_rate_plans TO service_role;
GRANT ALL ON public.hotel_reservation_promotions TO service_role;
GRANT ALL ON public.hotel_reservation_packages TO service_role;
GRANT ALL ON public.hotel_commercial_change_events TO service_role;

ALTER TABLE public.hotel_promotion_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_promotion_activation_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_promotion_activation_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_package_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_package_activation_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_package_activation_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reservation_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reservation_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_commercial_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read promotion activations" ON public.hotel_promotion_activations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read promotion activation room types" ON public.hotel_promotion_activation_room_types
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read promotion activation rate plans" ON public.hotel_promotion_activation_rate_plans
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read package activations" ON public.hotel_package_activations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read package activation room types" ON public.hotel_package_activation_room_types
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read package activation rate plans" ON public.hotel_package_activation_rate_plans
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read reservation promotions" ON public.hotel_reservation_promotions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read reservation packages" ON public.hotel_reservation_packages
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read commercial change events" ON public.hotel_commercial_change_events
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_promotion_activations_updated_at
  BEFORE UPDATE ON public.hotel_promotion_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_package_activations_updated_at
  BEFORE UPDATE ON public.hotel_package_activations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_hotel_commercial_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'COMMERCIAL_CHANGE_EVENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_commercial_change_events_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_commercial_change_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_commercial_change_event_mutation();
