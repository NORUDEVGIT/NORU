-- Reservation no-show snapshot. The selected rate plan is the source.
-- hotel_reservations.deposit_policy_id and deposit_requirement_snapshot stay.
--
-- Sequential after 0146. Dual-lane: byte-identical copies live in
--   supabase/migrations/0147_hotel_reservation_no_show_policy_snapshot.sql
--   drizzle/migrations/0147_hotel_reservation_no_show_policy_snapshot.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Does not edit 0146 or earlier migrations.
-- Does not change cancellation_policy_snapshot, refundability_snapshot,
-- room price, or Front Office no-show charging.
-- Does not add Early Departure or Additional Policy.
--
-- Same-property key already exists from 0146:
--   pms_no_show_policies_id_restaurant_unique UNIQUE (id, restaurant_id)
--
-- Rollback:
--   ALTER TABLE public.hotel_reservations
--     DROP CONSTRAINT IF EXISTS hotel_reservations_no_show_same_property;
--   DROP INDEX IF EXISTS public.hotel_reservations_no_show_policy_idx;
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS no_show_policy_id,
--     DROP COLUMN IF EXISTS no_show_policy_snapshot;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS no_show_policy_id uuid,
  ADD COLUMN IF NOT EXISTS no_show_policy_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_reservations_no_show_same_property'
      AND conrelid = 'public.hotel_reservations'::regclass
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_no_show_same_property
      FOREIGN KEY (no_show_policy_id, restaurant_id)
      REFERENCES public.pms_no_show_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotel_reservations_no_show_policy_idx
  ON public.hotel_reservations (restaurant_id, no_show_policy_id);

COMMENT ON COLUMN public.hotel_reservations.no_show_policy_id IS
  'Rate-plan no-show policy copied at reservation create. Null when the rate plan has no no-show policy. Historical terms live in no_show_policy_snapshot.';
COMMENT ON COLUMN public.hotel_reservations.no_show_policy_snapshot IS
  'Immutable no-show terms from the rate-plan policy at create. Later edits to pms_no_show_policies do not change this snapshot.';
