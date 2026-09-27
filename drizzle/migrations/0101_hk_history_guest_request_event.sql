-- Phase 7 — Housekeeping history event_type CHECK growth.
-- Dual-lane. No new table. Adds guest_request_updated so GS execution
-- writes the same housekeeping_history store as cleaning/inspect/WO/restriction.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.housekeeping_history'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.housekeeping_history DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.housekeeping_history
  ADD CONSTRAINT housekeeping_history_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'room_dirty','cleaning_task_created','task_assigned','cleaning_started','cleaning_completed',
    'task_cancelled','inspection_passed','inspection_failed','room_reclean_required',
    'room_ooo','room_oos','room_released','discrepancy_created','discrepancy_resolved',
    'maintenance_created','maintenance_updated','maintenance_resolved',
    'guest_request_updated'
  ]));
