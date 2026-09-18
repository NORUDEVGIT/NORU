-- PMS Property Setup Card 2 — Inventory Rules schema (Phase 4).
--
-- Sequential after 0065. Dual-lane with
--   supabase/migrations/0066_pms_card2_inventory_rules.sql
-- Two new property-scoped configuration tables only.
-- Does not alter count_sellable_rooms, assert_reservation_capacity,
-- reservation creation, hotel_rooms.sellable, room_types.sellable,
-- SET4 pms_ooo_oos_posture, pms_restriction_reasons, Amenities,
-- Housekeeping, Maintenance, Card 2 UI, or Card 2 completion JSON.
-- No pms_card1_live. No SECURITY DEFINER. No sample seed. No types.ts regen.
-- No virtual/shared/linked/complimentary inventory.
-- No dated operational room blocks. No per-type/date overbooking tables.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
-- Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0066_pms_card2_inventory_rules.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_inventory_block_type_rules;
--   DROP TABLE IF EXISTS public.pms_inventory_rules;

-- 1. Property-scoped inventory rules (one row per restaurant).
CREATE TABLE IF NOT EXISTS public.pms_inventory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  sellable_status_required boolean NOT NULL DEFAULT true,
  operational_availability_required boolean NOT NULL DEFAULT true,
  housekeeping_readiness_required boolean NOT NULL DEFAULT false,
  maintenance_clear_required boolean NOT NULL DEFAULT false,
  room_block_removes_inventory boolean NOT NULL DEFAULT false,
  out_of_order_removes_inventory boolean NOT NULL DEFAULT true,
  out_of_service_removes_inventory boolean NOT NULL DEFAULT true,
  maintenance_affects_availability boolean NOT NULL DEFAULT false,
  housekeeping_affects_assignment boolean NOT NULL DEFAULT false,

  automatic_assignment_allowed boolean NOT NULL DEFAULT false,
  manual_assignment_allowed boolean NOT NULL DEFAULT true,
  require_room_type_match boolean NOT NULL DEFAULT true,
  require_occupancy_match boolean NOT NULL DEFAULT false,
  require_bed_type_match boolean NOT NULL DEFAULT false,
  require_accessibility_match boolean NOT NULL DEFAULT false,
  require_connecting_room_match boolean NOT NULL DEFAULT false,
  use_floor_preference boolean NOT NULL DEFAULT false,
  use_building_preference boolean NOT NULL DEFAULT false,
  use_guest_preference boolean NOT NULL DEFAULT false,
  require_housekeeping_readiness boolean NOT NULL DEFAULT false,
  require_maintenance_availability boolean NOT NULL DEFAULT false,

  room_move_allowed boolean NOT NULL DEFAULT true,
  room_type_change_allowed boolean NOT NULL DEFAULT false,
  rate_recalculation_required boolean NOT NULL DEFAULT false,
  move_approval_required boolean NOT NULL DEFAULT false,
  move_reason_required boolean NOT NULL DEFAULT true,
  inventory_recalculation_required boolean NOT NULL DEFAULT false,
  housekeeping_update_required boolean NOT NULL DEFAULT false,
  maintenance_validation_required boolean NOT NULL DEFAULT false,

  overbooking_allowed boolean NOT NULL DEFAULT false,
  maximum_overbooking integer,
  percentage_limit numeric(5,2),
  room_type_limit_enabled boolean NOT NULL DEFAULT false,
  date_based_limit_enabled boolean NOT NULL DEFAULT false,
  manager_approval_required boolean NOT NULL DEFAULT false,
  override_permission_required boolean NOT NULL DEFAULT false,
  overbooking_reason_required boolean NOT NULL DEFAULT false,
  overbooking_alert_enabled boolean NOT NULL DEFAULT false,

  CONSTRAINT pms_inventory_rules_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_inventory_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_inventory_rules_assignment_mode_check CHECK (
    manual_assignment_allowed OR automatic_assignment_allowed
  ),
  CONSTRAINT pms_inventory_rules_move_off_check CHECK (
    room_move_allowed
    OR (
      NOT room_type_change_allowed
      AND NOT rate_recalculation_required
      AND NOT move_approval_required
      AND NOT move_reason_required
      AND NOT inventory_recalculation_required
      AND NOT housekeeping_update_required
      AND NOT maintenance_validation_required
    )
  ),
  CONSTRAINT pms_inventory_rules_maximum_overbooking_check CHECK (
    maximum_overbooking IS NULL OR maximum_overbooking >= 0
  ),
  CONSTRAINT pms_inventory_rules_percentage_limit_check CHECK (
    percentage_limit IS NULL OR percentage_limit BETWEEN 0 AND 100
  ),
  CONSTRAINT pms_inventory_rules_overbooking_off_check CHECK (
    overbooking_allowed
    OR (
      maximum_overbooking IS NULL
      AND percentage_limit IS NULL
      AND NOT room_type_limit_enabled
      AND NOT date_based_limit_enabled
      AND NOT manager_approval_required
      AND NOT override_permission_required
      AND NOT overbooking_reason_required
      AND NOT overbooking_alert_enabled
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_inventory_rules TO authenticated;
GRANT ALL ON public.pms_inventory_rules TO service_role;
ALTER TABLE public.pms_inventory_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read inventory rules" ON public.pms_inventory_rules;
CREATE POLICY "Members read inventory rules" ON public.pms_inventory_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert inventory rules" ON public.pms_inventory_rules;
CREATE POLICY "Managers insert inventory rules" ON public.pms_inventory_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update inventory rules" ON public.pms_inventory_rules;
CREATE POLICY "Managers update inventory rules" ON public.pms_inventory_rules
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete inventory rules" ON public.pms_inventory_rules;
CREATE POLICY "Managers delete inventory rules" ON public.pms_inventory_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_inventory_rules_updated_at ON public.pms_inventory_rules;
CREATE TRIGGER set_pms_inventory_rules_updated_at BEFORE UPDATE ON public.pms_inventory_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_inventory_rules IS
  'Card 2 Inventory Rules configuration only. Does not allow reservations beyond capacity, does not modify count_sellable_rooms, assert_reservation_capacity, or reservation creation. Current engine remains no-overbook. Do not represent an enabled overbooking policy as active overselling.';
COMMENT ON COLUMN public.pms_inventory_rules.sellable_status_required IS
  'Configuration corresponding to existing room_types.sellable behavior. 0066 does NOT wire hotel_rooms.sellable into reservation capacity.';
COMMENT ON COLUMN public.pms_inventory_rules.overbooking_allowed IS
  'Stored policy only. Does not change reservation capacity. Later API/UI/readiness must not treat true as live oversell.';
COMMENT ON COLUMN public.pms_inventory_rules.maximum_overbooking IS
  'Optional extra-rooms cap when overbooking_allowed. Configuration only; not used by booking RPCs in 0066.';
COMMENT ON COLUMN public.pms_inventory_rules.percentage_limit IS
  'Optional 0-100 percentage cap when overbooking_allowed. Configuration only; not used by booking RPCs in 0066.';
COMMENT ON COLUMN public.pms_inventory_rules.room_type_limit_enabled IS
  'Forward-compatible policy flag only. Not operational until a per-type overbooking model and engine change are approved.';
COMMENT ON COLUMN public.pms_inventory_rules.date_based_limit_enabled IS
  'Forward-compatible policy flag only. Not operational until a date-based overbooking model and engine change are approved.';

-- 2. Block type policy (not dated operational blocks).
CREATE TABLE IF NOT EXISTS public.pms_inventory_block_type_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.pms_inventory_rules(restaurant_id) ON DELETE CASCADE,
  block_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  inventory_impact text NOT NULL DEFAULT 'no_inventory_impact',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_inventory_block_type_rules_unique UNIQUE (restaurant_id, block_type),
  CONSTRAINT pms_inventory_block_type_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_inventory_block_type_rules_block_type_check CHECK (
    block_type IN (
      'temporary',
      'permanent',
      'maintenance',
      'vip',
      'group',
      'owner',
      'internal_use',
      'inspection',
      'renovation'
    )
  ),
  CONSTRAINT pms_inventory_block_type_rules_inventory_impact_check CHECK (
    inventory_impact IN (
      'remove_from_inventory',
      'assignment_only',
      'warning_only',
      'no_inventory_impact'
    )
  ),
  CONSTRAINT pms_inventory_block_type_rules_disabled_check CHECK (
    enabled
    OR (
      NOT approval_required
      AND inventory_impact = 'no_inventory_impact'
    )
  )
);

CREATE INDEX IF NOT EXISTS pms_inventory_block_type_rules_restaurant_idx
  ON public.pms_inventory_block_type_rules(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_inventory_block_type_rules TO authenticated;
GRANT ALL ON public.pms_inventory_block_type_rules TO service_role;
ALTER TABLE public.pms_inventory_block_type_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read inventory block type rules" ON public.pms_inventory_block_type_rules;
CREATE POLICY "Members read inventory block type rules" ON public.pms_inventory_block_type_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert inventory block type rules" ON public.pms_inventory_block_type_rules;
CREATE POLICY "Managers insert inventory block type rules" ON public.pms_inventory_block_type_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update inventory block type rules" ON public.pms_inventory_block_type_rules;
CREATE POLICY "Managers update inventory block type rules" ON public.pms_inventory_block_type_rules
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete inventory block type rules" ON public.pms_inventory_block_type_rules;
CREATE POLICY "Managers delete inventory block type rules" ON public.pms_inventory_block_type_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_inventory_block_type_rules_updated_at ON public.pms_inventory_block_type_rules;
CREATE TRIGGER set_pms_inventory_block_type_rules_updated_at BEFORE UPDATE ON public.pms_inventory_block_type_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_inventory_block_type_rules IS
  'Card 2 block TYPE policy only. No room_id, dates, block instances, or restriction-reason mapping. Inventory impact is configuration; 0066 does not change sellable counting.';
COMMENT ON COLUMN public.pms_inventory_block_type_rules.inventory_impact IS
  'remove_from_inventory | assignment_only | warning_only | no_inventory_impact. Not applied by booking RPCs in 0066.';
