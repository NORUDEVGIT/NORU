-- Reservation Detail controls: assignment notes, rate notes, note pin,
-- release of one room-unit package, and reservation traces.
-- History stays on hotel_reservation_history. Housekeeping tasks are unchanged.
-- Dual-lane with supabase/migrations/0167_reservation_detail_controls.sql.
-- Do not apply from an agent.

ALTER TABLE public.hotel_reservation_rooms
  ADD COLUMN IF NOT EXISTS assignment_notes text;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS rate_notes text;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS notes_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed',
    'no_show','repriced','expected_arrival_updated','late_checkout_updated',
    'room_guest_added','room_guest_removed','room_primary_guest_changed',
    'external_reservation_created','external_reservation_modified','external_reservation_cancelled',
    'package_applied','package_removed','promotion_applied',
    'note_pinned','trace_created','trace_updated',
    'assignment_notes_updated','rate_notes_updated'
  ));

CREATE OR REPLACE FUNCTION public.release_hotel_reservation_room_package(
  _restaurant_id uuid,
  _reservation_id uuid,
  _package_row_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;

  DELETE FROM public.hotel_reservation_packages
  WHERE id = package_row.id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'package_removed',
    jsonb_build_object(
      'package_id', package_row.package_id,
      'package_name', package_row.package_name,
      'reservation_room_id', package_row.reservation_room_id,
      'applied_amount', package_row.applied_amount
    ),
    jsonb_build_object('package_id', null, 'reservation_room_id', package_row.reservation_room_id),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.reservation_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  task text NOT NULL,
  assignee_name text,
  department text,
  priority text NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_traces_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT reservation_traces_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT reservation_traces_task_check
    CHECK (char_length(btrim(task)) > 0 AND char_length(task) <= 500)
);

CREATE INDEX IF NOT EXISTS reservation_traces_reservation_idx
  ON public.reservation_traces (restaurant_id, reservation_id, created_at);

COMMENT ON TABLE public.reservation_traces IS
  'Follow-up traces for one reservation. Overdue is a past due date, not a stored status. Housekeeping tasks stay in their own table.';

GRANT SELECT ON public.reservation_traces TO authenticated;
GRANT ALL ON public.reservation_traces TO service_role;
ALTER TABLE public.reservation_traces ENABLE ROW LEVEL SECURITY;
