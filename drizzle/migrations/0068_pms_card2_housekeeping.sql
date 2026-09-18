-- PMS Property Setup Card 2 — Phase 3 Housekeeping.
-- Sequential after 0067. Dual-lane with
--   supabase/migrations/0068_pms_card2_housekeeping.sql
-- PM-approved normalized model. Additive schema plus constrained rule catalogues.
-- Applied to qcwptraosaudcbjasmul on 2026-09-18 after explicit user request.

CREATE TABLE IF NOT EXISTS public.pms_housekeeping_status_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  is_core boolean NOT NULL DEFAULT false,
  operational boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_housekeeping_status_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_housekeeping_status_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_housekeeping_status_code_check CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT pms_housekeeping_status_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT pms_housekeeping_status_domain_check CHECK (
    domain IN ('housekeeping','occupancy','restriction','task','derived','workflow','custom')
  ),
  CONSTRAINT pms_housekeeping_custom_shape_check CHECK (
    domain <> 'custom' OR (NOT is_core AND NOT operational)
  )
);

CREATE INDEX IF NOT EXISTS pms_housekeeping_status_restaurant_idx
  ON public.pms_housekeeping_status_catalog(restaurant_id, sort_order);

CREATE TABLE IF NOT EXISTS public.pms_housekeeping_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  default_housekeeping_status text NOT NULL DEFAULT 'dirty',
  clean_required boolean NOT NULL DEFAULT true,
  inspection_required boolean NOT NULL DEFAULT true,
  maintenance_clear_required boolean NOT NULL DEFAULT true,
  room_release_rule text NOT NULL DEFAULT 'after_inspection',
  supervisor_approval_required boolean NOT NULL DEFAULT true,
  automatic_status_change_enabled boolean NOT NULL DEFAULT true,
  manual_status_change_allowed boolean NOT NULL DEFAULT true,
  assignment_override_allowed boolean NOT NULL DEFAULT false,
  override_permission text,
  override_reason_required boolean NOT NULL DEFAULT false,
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_housekeeping_settings_default_status_fk
    FOREIGN KEY (restaurant_id, default_housekeeping_status)
    REFERENCES public.pms_housekeeping_status_catalog(restaurant_id, code),
  CONSTRAINT pms_housekeeping_release_rule_check CHECK (
    room_release_rule IN ('manual','after_cleaning','after_inspection')
  ),
  CONSTRAINT pms_housekeeping_override_permission_check CHECK (
    override_permission IS NULL OR
    override_permission IN ('owner_manager','housekeeping_supervisor','any_supervisor')
  ),
  CONSTRAINT pms_housekeeping_override_shape_check CHECK (
    assignment_override_allowed OR
    (override_permission IS NULL AND NOT override_reason_required)
  )
);

CREATE TABLE IF NOT EXISTS public.pms_housekeeping_transition_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  from_status_code text NOT NULL,
  to_status_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  approval_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_housekeeping_transition_event_unique UNIQUE (restaurant_id, event_code),
  CONSTRAINT pms_housekeeping_transition_from_fk
    FOREIGN KEY (restaurant_id, from_status_code)
    REFERENCES public.pms_housekeeping_status_catalog(restaurant_id, code),
  CONSTRAINT pms_housekeeping_transition_to_fk
    FOREIGN KEY (restaurant_id, to_status_code)
    REFERENCES public.pms_housekeeping_status_catalog(restaurant_id, code),
  CONSTRAINT pms_housekeeping_transition_event_check CHECK (
    event_code IN ('guest_check_in','guest_check_out','housekeeping_complete','inspection_complete')
  )
);

CREATE INDEX IF NOT EXISTS pms_housekeeping_transition_restaurant_idx
  ON public.pms_housekeeping_transition_rules(restaurant_id);

CREATE TABLE IF NOT EXISTS public.pms_housekeeping_priority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  priority_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_housekeeping_priority_event_unique UNIQUE (restaurant_id, event_code),
  CONSTRAINT pms_housekeeping_priority_rank_unique UNIQUE (restaurant_id, rank),
  CONSTRAINT pms_housekeeping_priority_event_check CHECK (
    event_code IN ('vip','arrival','departure','stayover','early_arrival','special_request','room_move')
  ),
  CONSTRAINT pms_housekeeping_priority_code_check CHECK (
    priority_code IN ('normal','high','urgent')
  ),
  CONSTRAINT pms_housekeeping_priority_rank_check CHECK (rank BETWEEN 1 AND 99)
);

CREATE INDEX IF NOT EXISTS pms_housekeeping_priority_restaurant_idx
  ON public.pms_housekeeping_priority_rules(restaurant_id, rank);

COMMENT ON TABLE public.pms_housekeeping_settings IS
  'Card 2 Step 3 property rules only. Daily housekeeping remains in the operational module.';
COMMENT ON TABLE public.pms_housekeeping_status_catalog IS
  'Cross-dimension status registry. Only housekeeping-domain operational codes write hotel_rooms.housekeeping_status.';
COMMENT ON TABLE public.pms_housekeeping_transition_rules IS
  'Property event-transition configuration consumed by housekeeping and Front Office server flows.';
COMMENT ON TABLE public.pms_housekeeping_priority_rules IS
  'Property event priority policy. priority_code maps to housekeeping task severity.';

CREATE OR REPLACE FUNCTION public.protect_pms_housekeeping_core_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_core THEN
    RAISE EXCEPTION 'CORE_HOUSEKEEPING_STATUS_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_core AND (
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.domain IS DISTINCT FROM OLD.domain OR
    NEW.is_core IS DISTINCT FROM true OR
    NEW.operational IS DISTINCT FROM OLD.operational OR
    NEW.active IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'CORE_HOUSEKEEPING_STATUS_REQUIRED';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_pms_housekeeping_core_status
  ON public.pms_housekeeping_status_catalog;
CREATE TRIGGER protect_pms_housekeeping_core_status
  BEFORE UPDATE OR DELETE ON public.pms_housekeeping_status_catalog
  FOR EACH ROW EXECUTE FUNCTION public.protect_pms_housekeeping_core_status();

CREATE TRIGGER set_pms_housekeeping_status_updated_at
  BEFORE UPDATE ON public.pms_housekeeping_status_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_pms_housekeeping_settings_updated_at
  BEFORE UPDATE ON public.pms_housekeeping_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_pms_housekeeping_transition_updated_at
  BEFORE UPDATE ON public.pms_housekeeping_transition_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_pms_housekeeping_priority_updated_at
  BEFORE UPDATE ON public.pms_housekeeping_priority_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.pms_housekeeping_settings,
  public.pms_housekeeping_status_catalog,
  public.pms_housekeeping_transition_rules,
  public.pms_housekeeping_priority_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pms_housekeeping_settings,
  public.pms_housekeeping_status_catalog,
  public.pms_housekeeping_transition_rules,
  public.pms_housekeeping_priority_rules TO authenticated;
GRANT ALL ON public.pms_housekeeping_settings,
  public.pms_housekeeping_status_catalog,
  public.pms_housekeeping_transition_rules,
  public.pms_housekeeping_priority_rules TO service_role;

ALTER TABLE public.pms_housekeeping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_housekeeping_status_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_housekeeping_transition_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_housekeeping_priority_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read housekeeping settings" ON public.pms_housekeeping_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write housekeeping settings" ON public.pms_housekeeping_settings
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read housekeeping status catalog" ON public.pms_housekeeping_status_catalog
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write housekeeping status catalog" ON public.pms_housekeeping_status_catalog
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read housekeeping transitions" ON public.pms_housekeeping_transition_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write housekeeping transitions" ON public.pms_housekeeping_transition_rules
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read housekeeping priorities" ON public.pms_housekeeping_priority_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write housekeeping priorities" ON public.pms_housekeeping_priority_rules
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

INSERT INTO public.pms_housekeeping_status_catalog
  (restaurant_id, code, name, domain, is_core, operational, active, sort_order)
SELECT r.id, seed.code, seed.name, seed.domain, true, seed.operational, true, seed.sort_order
FROM public.restaurants r
CROSS JOIN (VALUES
  ('clean','Clean','housekeeping',true,10),
  ('dirty','Dirty','housekeeping',true,20),
  ('inspected','Inspected','housekeeping',true,30),
  ('pickup','Pick-up','housekeeping',true,40),
  ('ready','Ready','derived',false,50),
  ('occupied','Occupied','occupancy',false,60),
  ('vacant','Vacant','occupancy',false,70),
  ('out_of_service','Out of Service','restriction',false,80),
  ('out_of_order','Out of Order','restriction',false,90),
  ('cleaning_in_progress','Cleaning in Progress','task',false,100),
  ('inspection_required','Inspection Required','workflow',false,110)
) AS seed(code, name, domain, operational, sort_order)
ON CONFLICT (restaurant_id, code) DO NOTHING;

INSERT INTO public.pms_housekeeping_settings
  (restaurant_id, enabled, default_housekeeping_status, clean_required,
   inspection_required, maintenance_clear_required, room_release_rule,
   supervisor_approval_required, automatic_status_change_enabled,
   manual_status_change_allowed, assignment_override_allowed,
   override_permission, override_reason_required)
SELECT id, true, 'dirty', true, true, true, 'after_inspection',
       true, true, true, false, NULL, false
FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;

INSERT INTO public.pms_housekeeping_transition_rules
  (restaurant_id, event_code, from_status_code, to_status_code, enabled, approval_required)
SELECT r.id, seed.event_code, seed.from_status, seed.to_status, true, seed.approval_required
FROM public.restaurants r
CROSS JOIN (VALUES
  ('guest_check_in','ready','occupied',false),
  ('guest_check_out','occupied','dirty',false),
  ('housekeeping_complete','dirty','clean',false),
  ('inspection_complete','clean','inspected',true)
) AS seed(event_code, from_status, to_status, approval_required)
ON CONFLICT (restaurant_id, event_code) DO NOTHING;

INSERT INTO public.pms_housekeeping_priority_rules
  (restaurant_id, event_code, priority_code, enabled, rank)
SELECT r.id, seed.event_code, seed.priority_code, true, seed.rank
FROM public.restaurants r
CROSS JOIN (VALUES
  ('vip','urgent',1),
  ('early_arrival','urgent',2),
  ('arrival','high',3),
  ('room_move','high',4),
  ('special_request','high',5),
  ('departure','normal',6),
  ('stayover','normal',7)
) AS seed(event_code, priority_code, rank)
ON CONFLICT (restaurant_id, event_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pms_housekeeping_transition_target(
  _restaurant_id uuid,
  _event_code text,
  _fallback text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.pms_housekeeping_settings WHERE restaurant_id = _restaurant_id
    ) THEN _fallback
    ELSE (
      SELECT CASE
        WHEN settings.saved_at IS NULL THEN _fallback
        WHEN NOT settings.automatic_status_change_enabled THEN NULL
        WHEN rule.enabled AND target.operational AND target.domain = 'housekeeping' THEN rule.to_status_code
        ELSE NULL
      END
      FROM public.pms_housekeeping_settings settings
      LEFT JOIN public.pms_housekeeping_transition_rules rule
        ON rule.restaurant_id = settings.restaurant_id
       AND rule.event_code = _event_code
      LEFT JOIN public.pms_housekeeping_status_catalog target
        ON target.restaurant_id = rule.restaurant_id
       AND target.code = rule.to_status_code
       AND target.active
      WHERE settings.restaurant_id = _restaurant_id
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.pms_housekeeping_event_priority(
  _restaurant_id uuid,
  _event_code text,
  _fallback text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN settings.saved_at IS NULL THEN _fallback
      WHEN rule.enabled THEN rule.priority_code
      ELSE _fallback
    END
    FROM public.pms_housekeeping_settings settings
    LEFT JOIN public.pms_housekeeping_priority_rules rule
      ON rule.restaurant_id = settings.restaurant_id
     AND rule.event_code = _event_code
    WHERE settings.restaurant_id = _restaurant_id
  ), _fallback)
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(
  _restaurant_id uuid,
  _task_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.housekeeping_tasks%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
  target_status text;
BEGIN
  SELECT * INTO task FROM public.housekeeping_tasks
  WHERE id = _task_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF task.status = 'completed' THEN RETURN; END IF;
  IF task.status = 'cancelled' THEN RAISE EXCEPTION 'INVALID_TASK_TRANSITION'; END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = task.room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  UPDATE public.housekeeping_tasks
  SET status = 'completed', completed_at = now(), started_at = COALESCE(started_at, now())
  WHERE id = task.id;

  target_status := public.pms_housekeeping_transition_target(
    _restaurant_id, 'housekeeping_complete', 'clean'
  );
  IF target_status IS NOT NULL THEN
    UPDATE public.hotel_rooms SET housekeeping_status = target_status WHERE id = room.id;
  END IF;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, room.id, 'cleaning_completed',
    jsonb_build_object('task_status', task.status, 'housekeeping_status', room.housekeeping_status),
    jsonb_build_object(
      'task_id', task.id,
      'housekeeping_status', COALESCE(target_status, room.housekeeping_status),
      'automatic_transition', target_status IS NOT NULL
    ),
    _membership_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_inspect_room(
  _restaurant_id uuid,
  _room_id uuid,
  _task_id uuid,
  _result text,
  _notes text,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  inspection_id uuid;
  reclean_id uuid;
  target_status text;
  reclean_priority text;
BEGIN
  IF _result NOT IN ('passed','failed') THEN RAISE EXCEPTION 'INVALID_INSPECTION_RESULT'; END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF room.housekeeping_status NOT IN ('clean','pickup','inspected') THEN
    RAISE EXCEPTION 'ROOM_NOT_INSPECTABLE';
  END IF;

  IF _task_id IS NOT NULL THEN
    PERFORM 1 FROM public.housekeeping_tasks
    WHERE id = _task_id AND restaurant_id = _restaurant_id AND room_id = _room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  END IF;

  INSERT INTO public.housekeeping_inspections (
    restaurant_id, room_id, task_id, status, inspector_membership_id, notes, completed_at
  ) VALUES (
    _restaurant_id, _room_id, _task_id, _result, _membership_id,
    NULLIF(btrim(COALESCE(_notes, '')), ''), now()
  )
  RETURNING id INTO inspection_id;

  IF _result = 'passed' THEN
    target_status := public.pms_housekeeping_transition_target(
      _restaurant_id, 'inspection_complete', 'inspected'
    );
    IF target_status IS NOT NULL THEN
      UPDATE public.hotel_rooms SET housekeeping_status = target_status WHERE id = room.id;
    END IF;
    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'inspection_passed',
      jsonb_build_object('housekeeping_status', room.housekeeping_status),
      jsonb_build_object(
        'housekeeping_status', COALESCE(target_status, room.housekeeping_status),
        'inspection_id', inspection_id,
        'automatic_transition', target_status IS NOT NULL
      ),
      NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
    );
  ELSE
    UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = room.id;
    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'inspection_failed',
      jsonb_build_object('housekeeping_status', room.housekeeping_status),
      jsonb_build_object('housekeeping_status', 'dirty', 'inspection_id', inspection_id),
      NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
    );
    reclean_priority := COALESCE(
      public.pms_housekeeping_event_priority(_restaurant_id, 'special_request', 'high'),
      'high'
    );
    reclean_id := public.housekeeping_create_task(
      _restaurant_id, room.id, 're_clean', reclean_priority,
      'Re-clean after failed inspection', _membership_id
    );
    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'room_reclean_required',
      jsonb_build_object('task_id', reclean_id), _membership_id
    );
  END IF;
  RETURN inspection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
  task_id uuid;
  target_status text;
  departure_priority text;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  IF existing.status <> 'checked_in' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;

  UPDATE public.hotel_reservations SET status = 'checked_out'
  WHERE id = existing.id RETURNING * INTO updated;
  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_out',
    jsonb_build_object('status', existing.status, 'room_id', existing.room_id),
    jsonb_build_object('status', 'checked_out'), _membership_id
  );

  IF existing.room_id IS NOT NULL THEN
    SELECT * INTO room FROM public.hotel_rooms
    WHERE id = existing.room_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF FOUND THEN
      target_status := public.pms_housekeeping_transition_target(
        _restaurant_id, 'guest_check_out', 'dirty'
      );
      IF target_status IS NOT NULL AND room.housekeeping_status <> target_status THEN
        UPDATE public.hotel_rooms SET housekeeping_status = target_status WHERE id = room.id;
        INSERT INTO public.housekeeping_history (
          restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
        ) VALUES (
          _restaurant_id, room.id, 'room_dirty',
          jsonb_build_object('housekeeping_status', room.housekeeping_status),
          jsonb_build_object(
            'housekeeping_status', target_status,
            'reservation_id', existing.id,
            'automatic_transition', true
          ),
          _membership_id
        );
      END IF;
      departure_priority := COALESCE(
        public.pms_housekeeping_event_priority(_restaurant_id, 'departure', 'normal'),
        'normal'
      );
      task_id := public.housekeeping_create_task(
        _restaurant_id, room.id, 'departure_cleaning', departure_priority, NULL, _membership_id
      );
    END IF;
  END IF;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_housekeeping_transition_target(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pms_housekeeping_event_priority(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_housekeeping_transition_target(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_housekeeping_event_priority(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) TO service_role;
