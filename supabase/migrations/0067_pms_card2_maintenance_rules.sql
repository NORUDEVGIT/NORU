-- PMS Property Setup Card 2 — Maintenance Rules schema (Phase 5).
--
-- Sequential after 0066. Dual-lane with
--   supabase/migrations/0067_pms_card2_maintenance_rules.sql
-- Two new property-scoped configuration tables only.
-- Does not alter count_sellable_rooms, assert_reservation_capacity,
-- reservation creation, hotel_rooms.maintenance_status, hotel_rooms.status,
-- SET4 pms_ooo_oos_posture, pms_restriction_reasons, pms_maintenance_sla,
-- Inventory Rules (0066), Amenities, Housekeeping, Card 2 UI, or Card 2
-- completion JSON.
-- No pms_card1_live. No SECURITY DEFINER. No sample seed. No types.ts regen.
-- No work orders, live tickets, dated OOS/OOO instances, preventive schedules,
-- assets, technicians, or revenue-impact columns.
-- No generic parent requires_maintenance_clearance (Inventory owns global clear).
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
-- Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0067_pms_card2_maintenance_rules.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_maintenance_status_rules;
--   DROP TABLE IF EXISTS public.pms_maintenance_rules;

-- 1. Property-scoped maintenance rules (one row per restaurant).
CREATE TABLE IF NOT EXISTS public.pms_maintenance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  maintenance_management_enabled boolean NOT NULL DEFAULT true,
  requires_supervisor_approval boolean NOT NULL DEFAULT false,
  manual_status_change_allowed boolean NOT NULL DEFAULT true,
  maintenance_status_change_reason_required boolean NOT NULL DEFAULT true,
  maintenance_status_change_notes_required boolean NOT NULL DEFAULT false,

  operational_oos_enabled boolean NOT NULL DEFAULT true,
  operational_oos_reason_required boolean NOT NULL DEFAULT true,
  operational_oos_approval_required boolean NOT NULL DEFAULT false,
  operational_oos_supervisor_approval_required boolean NOT NULL DEFAULT false,
  operational_oos_assignment_restricted boolean NOT NULL DEFAULT true,
  operational_oos_maintenance_clearance_required boolean NOT NULL DEFAULT false,
  operational_oos_reopening_inspection_required boolean NOT NULL DEFAULT false,
  operational_oos_expected_completion_required boolean NOT NULL DEFAULT false,

  operational_ooo_enabled boolean NOT NULL DEFAULT true,
  operational_ooo_reason_required boolean NOT NULL DEFAULT true,
  operational_ooo_maintenance_ticket_required boolean NOT NULL DEFAULT false,
  operational_ooo_approval_required boolean NOT NULL DEFAULT false,
  operational_ooo_manager_approval_required boolean NOT NULL DEFAULT false,
  operational_ooo_assignment_restricted boolean NOT NULL DEFAULT true,
  operational_ooo_check_in_restricted boolean NOT NULL DEFAULT true,
  operational_ooo_maintenance_clearance_required boolean NOT NULL DEFAULT false,
  operational_ooo_reopening_inspection_required boolean NOT NULL DEFAULT false,

  preventive_maintenance_enabled boolean NOT NULL DEFAULT false,
  default_maintenance_frequency text NOT NULL DEFAULT 'monthly',
  preventive_inspection_required boolean NOT NULL DEFAULT false,
  preventive_reminder_enabled boolean NOT NULL DEFAULT false,
  preventive_reminder_lead_days integer,
  preventive_assigned_department_id uuid,

  CONSTRAINT pms_maintenance_rules_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_maintenance_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_maintenance_rules_department_fk
    FOREIGN KEY (preventive_assigned_department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_maintenance_rules_frequency_check CHECK (
    default_maintenance_frequency IN (
      'daily',
      'weekly',
      'monthly',
      'quarterly',
      'annual'
    )
  ),
  CONSTRAINT pms_maintenance_rules_reminder_lead_days_check CHECK (
    preventive_reminder_lead_days IS NULL OR preventive_reminder_lead_days >= 0
  ),
  CONSTRAINT pms_maintenance_rules_preventive_off_check CHECK (
    preventive_maintenance_enabled
    OR (
      NOT preventive_inspection_required
      AND NOT preventive_reminder_enabled
      AND preventive_reminder_lead_days IS NULL
      AND preventive_assigned_department_id IS NULL
    )
  ),
  CONSTRAINT pms_maintenance_rules_reminder_check CHECK (
    NOT preventive_reminder_enabled
    OR (
      preventive_maintenance_enabled
      AND preventive_reminder_lead_days IS NOT NULL
      AND preventive_reminder_lead_days >= 0
    )
  ),
  CONSTRAINT pms_maintenance_rules_oos_off_check CHECK (
    operational_oos_enabled
    OR (
      NOT operational_oos_reason_required
      AND NOT operational_oos_approval_required
      AND NOT operational_oos_supervisor_approval_required
      AND NOT operational_oos_assignment_restricted
      AND NOT operational_oos_maintenance_clearance_required
      AND NOT operational_oos_reopening_inspection_required
      AND NOT operational_oos_expected_completion_required
    )
  ),
  CONSTRAINT pms_maintenance_rules_ooo_off_check CHECK (
    operational_ooo_enabled
    OR (
      NOT operational_ooo_reason_required
      AND NOT operational_ooo_maintenance_ticket_required
      AND NOT operational_ooo_approval_required
      AND NOT operational_ooo_manager_approval_required
      AND NOT operational_ooo_assignment_restricted
      AND NOT operational_ooo_check_in_restricted
      AND NOT operational_ooo_maintenance_clearance_required
      AND NOT operational_ooo_reopening_inspection_required
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_maintenance_rules TO authenticated;
GRANT ALL ON public.pms_maintenance_rules TO service_role;
ALTER TABLE public.pms_maintenance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read maintenance rules" ON public.pms_maintenance_rules;
CREATE POLICY "Members read maintenance rules" ON public.pms_maintenance_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert maintenance rules" ON public.pms_maintenance_rules;
CREATE POLICY "Managers insert maintenance rules" ON public.pms_maintenance_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update maintenance rules" ON public.pms_maintenance_rules;
CREATE POLICY "Managers update maintenance rules" ON public.pms_maintenance_rules
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete maintenance rules" ON public.pms_maintenance_rules;
CREATE POLICY "Managers delete maintenance rules" ON public.pms_maintenance_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_maintenance_rules_updated_at ON public.pms_maintenance_rules;
CREATE TRIGGER set_pms_maintenance_rules_updated_at BEFORE UPDATE ON public.pms_maintenance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_maintenance_rules IS
  'Card 2 Maintenance configuration only. Does not change assignment, check-in, capacity RPCs, Inventory Rules, SET4, or Housekeeping. Not live OOS/OOO, work orders, or preventive schedules. Operational OOS/OOO columns apply to hotel_rooms.status, not hotel_rooms.maintenance_status. Example: operational status may remain available while maintenance_status is out_of_order. Inventory owns inventory removal, capacity, OOO/OOS inventory impact, and global maintenance_clear_required / maintenance_affects_availability. SET4 owns OOO/OOS meaning text, restriction reasons, catalogues, and SLA. Ops owns tickets, dates, technicians, instances, and actual PM schedules.';
COMMENT ON COLUMN public.pms_maintenance_rules.requires_supervisor_approval IS
  'Default for maintenance status-change workflow. Not Inventory overbooking manager_approval_required. Configuration only.';
COMMENT ON COLUMN public.pms_maintenance_rules.maintenance_status_change_reason_required IS
  'Applies to hotel_rooms.maintenance_status changes. Complementary to SET4 pms_ooo_oos_posture.reasonRequired; does not relax housekeeping_set_room_restriction REASON_REQUIRED.';
COMMENT ON COLUMN public.pms_maintenance_rules.maintenance_status_change_notes_required IS
  'Applies to hotel_rooms.maintenance_status change notes. Configuration only.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_enabled IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Policy only; no room_id, dates, or instances.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_reason_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_approval_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_supervisor_approval_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_assignment_restricted IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Independent of child prevents_room_assignment for maintenance_status = out_of_service.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_maintenance_clearance_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Not Inventory maintenance_clear_required.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_reopening_inspection_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_oos_expected_completion_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Policy that expected completion is required; does not store an actual date.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_enabled IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Policy only; no room_id, dates, ticket id, or revenue impact.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_reason_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_maintenance_ticket_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Policy that a ticket is required; does not store a ticket id.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_approval_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_manager_approval_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_assignment_restricted IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Independent of child prevents_room_assignment for maintenance_status = out_of_order.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_check_in_restricted IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Independent of child prevents_check_in for maintenance_status = out_of_order.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_maintenance_clearance_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status. Not Inventory maintenance_clear_required.';
COMMENT ON COLUMN public.pms_maintenance_rules.operational_ooo_reopening_inspection_required IS
  'Applies to hotel_rooms.status, not hotel_rooms.maintenance_status.';
COMMENT ON COLUMN public.pms_maintenance_rules.preventive_maintenance_enabled IS
  'Property-level preventive defaults only. No schedules, assets, work orders, or due dates.';
COMMENT ON COLUMN public.pms_maintenance_rules.default_maintenance_frequency IS
  'daily | weekly | monthly | quarterly | annual. Harmless stored default monthly when preventive_maintenance_enabled is false.';
COMMENT ON COLUMN public.pms_maintenance_rules.preventive_assigned_department_id IS
  'Optional SET5 pms_departments id. Tenant-safe composite FK with restaurant_id. ON DELETE SET NULL.';

-- 2. Per canonical maintenance_status policy (not operational hotel_rooms.status).
CREATE TABLE IF NOT EXISTS public.pms_maintenance_status_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.pms_maintenance_rules(restaurant_id) ON DELETE CASCADE,
  maintenance_status text NOT NULL,
  prevents_room_assignment boolean NOT NULL DEFAULT false,
  prevents_check_in boolean NOT NULL DEFAULT false,
  requires_supervisor_approval boolean NOT NULL DEFAULT false,
  requires_maintenance_clearance boolean NOT NULL DEFAULT false,
  requires_inspection_before_release boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_maintenance_status_rules_unique UNIQUE (restaurant_id, maintenance_status),
  CONSTRAINT pms_maintenance_status_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_maintenance_status_rules_status_check CHECK (
    maintenance_status IN (
      'normal',
      'maintenance_required',
      'in_progress',
      'out_of_service',
      'out_of_order',
      'inspection'
    )
  )
);

CREATE INDEX IF NOT EXISTS pms_maintenance_status_rules_restaurant_idx
  ON public.pms_maintenance_status_rules(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_maintenance_status_rules TO authenticated;
GRANT ALL ON public.pms_maintenance_status_rules TO service_role;
ALTER TABLE public.pms_maintenance_status_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read maintenance status rules" ON public.pms_maintenance_status_rules;
CREATE POLICY "Members read maintenance status rules" ON public.pms_maintenance_status_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert maintenance status rules" ON public.pms_maintenance_status_rules;
CREATE POLICY "Managers insert maintenance status rules" ON public.pms_maintenance_status_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update maintenance status rules" ON public.pms_maintenance_status_rules;
CREATE POLICY "Managers update maintenance status rules" ON public.pms_maintenance_status_rules
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete maintenance status rules" ON public.pms_maintenance_status_rules;
CREATE POLICY "Managers delete maintenance status rules" ON public.pms_maintenance_status_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_maintenance_status_rules_updated_at ON public.pms_maintenance_status_rules;
CREATE TRIGGER set_pms_maintenance_status_rules_updated_at BEFORE UPDATE ON public.pms_maintenance_status_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_maintenance_status_rules IS
  'Card 2 per-status maintenance policy. Applies to hotel_rooms.maintenance_status. Closed set: normal, maintenance_required, in_progress, out_of_service, out_of_order, inspection. Configuration only; 0067 does not change assignment, check-in, or capacity engines. No inventory-removal or revenue columns. Independent of parent operational OOS/OOO fields (hotel_rooms.status).';
COMMENT ON COLUMN public.pms_maintenance_status_rules.maintenance_status IS
  'Applies to hotel_rooms.maintenance_status. Not hotel_rooms.status. Not available, repair_complete, or reopened.';
COMMENT ON COLUMN public.pms_maintenance_status_rules.prevents_room_assignment IS
  'Applies to hotel_rooms.maintenance_status. Configuration only; not wired into listAssignableRooms in 0067.';
COMMENT ON COLUMN public.pms_maintenance_status_rules.prevents_check_in IS
  'Applies to hotel_rooms.maintenance_status. Configuration only; not wired into check-in in 0067.';
COMMENT ON COLUMN public.pms_maintenance_status_rules.requires_maintenance_clearance IS
  'Per maintenance_status clearance. Not Inventory global maintenance_clear_required.';
COMMENT ON COLUMN public.pms_maintenance_status_rules.requires_inspection_before_release IS
  'Applies to hotel_rooms.maintenance_status. Complementary to SET4 housekeeping inspectionGate.';
