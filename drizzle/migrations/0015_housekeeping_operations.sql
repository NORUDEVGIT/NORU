-- Phase 6F — Housekeeping operations.

ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;
ALTER TABLE public.restaurant_users
  ADD CONSTRAINT restaurant_users_role_check
  CHECK (role = ANY (ARRAY['owner','manager','kitchen','waiter','housekeeping']));

ALTER TABLE public.hotel_rooms
  ADD COLUMN IF NOT EXISTS housekeeping_status text NOT NULL DEFAULT 'dirty',
  ADD COLUMN IF NOT EXISTS restriction_reason text NULL,
  ADD COLUMN IF NOT EXISTS restriction_expected_return date NULL;

ALTER TABLE public.hotel_rooms DROP CONSTRAINT IF EXISTS hotel_rooms_hk_status_check;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_hk_status_check
  CHECK (housekeeping_status = ANY (ARRAY['dirty','clean','inspected','pickup']));

CREATE TABLE public.housekeeping_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'room_dirty','cleaning_task_created','task_assigned','cleaning_started','cleaning_completed',
    'task_cancelled','inspection_passed','inspection_failed','room_reclean_required',
    'room_ooo','room_oos','room_released','discrepancy_created','discrepancy_resolved',
    'maintenance_created','maintenance_updated','maintenance_resolved'
  ])),
  previous_values jsonb NULL,
  new_values jsonb NULL,
  notes text NULL,
  actor_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT housekeeping_history_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);
CREATE INDEX housekeeping_history_room_idx ON public.housekeeping_history (restaurant_id, room_id, created_at DESC);

GRANT SELECT ON public.housekeeping_history TO authenticated;
GRANT ALL ON public.housekeeping_history TO service_role;
ALTER TABLE public.housekeeping_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hk history readable by managers" ON public.housekeeping_history
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE TABLE public.housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  task_type text NOT NULL CHECK (task_type = ANY (ARRAY[
    'departure_cleaning','stayover_cleaning','touch_up','deep_cleaning','re_clean'
  ])),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY[
    'pending','assigned','in_progress','completed','cancelled'
  ])),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority = ANY (ARRAY['normal','high','urgent'])),
  assigned_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  notes text NULL,
  created_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT housekeeping_tasks_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);
CREATE UNIQUE INDEX housekeeping_tasks_one_open_per_room
  ON public.housekeeping_tasks (restaurant_id, room_id)
  WHERE status IN ('pending','assigned','in_progress');
CREATE INDEX housekeeping_tasks_board_idx ON public.housekeeping_tasks (restaurant_id, status, created_at DESC);

CREATE TRIGGER set_housekeeping_tasks_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.housekeeping_tasks TO authenticated;
GRANT ALL ON public.housekeeping_tasks TO service_role;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hk tasks readable by managers" ON public.housekeeping_tasks
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE TABLE public.housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  task_id uuid NULL REFERENCES public.housekeeping_tasks(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','passed','failed'])),
  inspector_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT housekeeping_inspections_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);
CREATE INDEX housekeeping_inspections_room_idx
  ON public.housekeeping_inspections (restaurant_id, room_id, created_at DESC);

GRANT SELECT ON public.housekeeping_inspections TO authenticated;
GRANT ALL ON public.housekeeping_inspections TO service_role;
ALTER TABLE public.housekeeping_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hk inspections readable by managers" ON public.housekeeping_inspections
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE TABLE public.housekeeping_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  reported_occupancy text NULL CHECK (reported_occupancy IS NULL OR reported_occupancy = ANY (ARRAY['vacant','occupied'])),
  actual_occupancy text NULL CHECK (actual_occupancy IS NULL OR actual_occupancy = ANY (ARRAY['vacant','occupied'])),
  reported_hk_status text NULL,
  actual_hk_status text NULL,
  reason text NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open','resolved'])),
  reported_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  resolved_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT housekeeping_discrepancies_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);
CREATE INDEX housekeeping_discrepancies_open_idx
  ON public.housekeeping_discrepancies (restaurant_id, status, created_at DESC);

GRANT SELECT ON public.housekeeping_discrepancies TO authenticated;
GRANT ALL ON public.housekeeping_discrepancies TO service_role;
ALTER TABLE public.housekeeping_discrepancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hk discrepancies readable by managers" ON public.housekeeping_discrepancies
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE TABLE public.housekeeping_maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['plumbing','electrical','furniture','equipment','other'])),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority = ANY (ARRAY['normal','high','urgent'])),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open','in_progress','resolved'])),
  created_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  resolved_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT housekeeping_maintenance_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);
CREATE INDEX housekeeping_maintenance_status_idx
  ON public.housekeeping_maintenance_requests (restaurant_id, status, created_at DESC);

GRANT SELECT ON public.housekeeping_maintenance_requests TO authenticated;
GRANT ALL ON public.housekeeping_maintenance_requests TO service_role;
ALTER TABLE public.housekeeping_maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hk maintenance readable by managers" ON public.housekeeping_maintenance_requests
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE OR REPLACE FUNCTION public.housekeeping_create_task(
  _restaurant_id uuid,
  _room_id uuid,
  _task_type text,
  _priority text,
  _notes text,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  existing_id uuid;
  new_id uuid;
BEGIN
  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT id INTO existing_id FROM public.housekeeping_tasks
  WHERE restaurant_id = _restaurant_id
    AND room_id = _room_id
    AND status IN ('pending','assigned','in_progress')
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.housekeeping_tasks (
    restaurant_id, room_id, task_type, status, priority, notes, created_by_membership_id
  ) VALUES (
    _restaurant_id, _room_id, _task_type, 'pending', COALESCE(_priority, 'normal'),
    NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
  )
  RETURNING id INTO new_id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, _room_id, 'cleaning_task_created',
    jsonb_build_object('task_id', new_id, 'task_type', _task_type, 'priority', COALESCE(_priority,'normal')),
    _membership_id
  );

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(
  _restaurant_id uuid,
  _task_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task public.housekeeping_tasks%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
BEGIN
  SELECT * INTO task FROM public.housekeeping_tasks
  WHERE id = _task_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF task.status = 'completed' THEN
    RETURN;
  END IF;

  IF task.status = 'cancelled' THEN
    RAISE EXCEPTION 'INVALID_TASK_TRANSITION';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = task.room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  UPDATE public.housekeeping_tasks
  SET status = 'completed',
      completed_at = now(),
      started_at = COALESCE(started_at, now())
  WHERE id = task.id;

  UPDATE public.hotel_rooms
  SET housekeeping_status = 'clean'
  WHERE id = room.id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, room.id, 'cleaning_completed',
    jsonb_build_object('task_status', task.status, 'housekeeping_status', room.housekeeping_status),
    jsonb_build_object('task_id', task.id, 'housekeeping_status', 'clean'),
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
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  inspection_id uuid;
  reclean_id uuid;
BEGIN
  IF _result NOT IN ('passed','failed') THEN
    RAISE EXCEPTION 'INVALID_INSPECTION_RESULT';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF room.housekeeping_status NOT IN ('clean','pickup','inspected') THEN
    RAISE EXCEPTION 'ROOM_NOT_INSPECTABLE';
  END IF;

  IF _task_id IS NOT NULL THEN
    PERFORM 1 FROM public.housekeeping_tasks
    WHERE id = _task_id AND restaurant_id = _restaurant_id AND room_id = _room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;
  END IF;

  INSERT INTO public.housekeeping_inspections (
    restaurant_id, room_id, task_id, status, inspector_membership_id, notes, completed_at
  ) VALUES (
    _restaurant_id, _room_id, _task_id, _result, _membership_id,
    NULLIF(btrim(COALESCE(_notes, '')), ''), now()
  )
  RETURNING id INTO inspection_id;

  IF _result = 'passed' THEN
    UPDATE public.hotel_rooms SET housekeeping_status = 'inspected' WHERE id = room.id;

    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'inspection_passed',
      jsonb_build_object('housekeeping_status', room.housekeeping_status),
      jsonb_build_object('housekeeping_status', 'inspected', 'inspection_id', inspection_id),
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

    reclean_id := public.housekeeping_create_task(
      _restaurant_id, room.id, 're_clean', 'high', 'Re-clean after failed inspection', _membership_id
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

CREATE OR REPLACE FUNCTION public.housekeeping_set_room_restriction(
  _restaurant_id uuid,
  _room_id uuid,
  _status text,
  _reason text,
  _expected_return date,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF _status NOT IN ('available','out_of_order','out_of_service') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF _status <> 'available' AND clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF room.status = _status THEN
    RETURN;
  END IF;

  UPDATE public.hotel_rooms
  SET status = _status,
      restriction_reason = CASE WHEN _status = 'available' THEN NULL ELSE clean_reason END,
      restriction_expected_return = CASE WHEN _status = 'available' THEN NULL ELSE _expected_return END
  WHERE id = room.id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, room.id,
    CASE _status
      WHEN 'out_of_order' THEN 'room_ooo'
      WHEN 'out_of_service' THEN 'room_oos'
      ELSE 'room_released'
    END,
    jsonb_build_object('status', room.status),
    jsonb_build_object('status', _status, 'expected_return', _expected_return),
    clean_reason, _membership_id
  );
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
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
  task_id uuid;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  UPDATE public.hotel_reservations
  SET status = 'checked_out'
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_out',
    jsonb_build_object('status', existing.status, 'room_id', existing.room_id),
    jsonb_build_object('status', 'checked_out'),
    _membership_id
  );

  IF existing.room_id IS NOT NULL THEN
    SELECT * INTO room FROM public.hotel_rooms
    WHERE id = existing.room_id AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF FOUND THEN
      IF room.housekeeping_status <> 'dirty' THEN
        UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = room.id;

        INSERT INTO public.housekeeping_history (
          restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
        ) VALUES (
          _restaurant_id, room.id, 'room_dirty',
          jsonb_build_object('housekeeping_status', room.housekeeping_status),
          jsonb_build_object('housekeeping_status', 'dirty', 'reservation_id', existing.id),
          _membership_id
        );
      END IF;

      task_id := public.housekeeping_create_task(
        _restaurant_id, room.id, 'departure_cleaning', 'normal', NULL, _membership_id
      );
    END IF;
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_create_task(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.housekeeping_set_room_restriction(uuid, uuid, text, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.housekeeping_create_task(uuid, uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_set_room_restriction(uuid, uuid, text, text, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) TO service_role;