-- Reservation early-departure snapshot. The selected rate plan is the source.
-- hotel_reservations.deposit and no-show columns stay.
--
-- Sequential after 0148. Dual-lane: byte-identical copies live in
--   supabase/migrations/0149_hotel_reservation_early_departure_policy_snapshot.sql
--   drizzle/migrations/0149_hotel_reservation_early_departure_policy_snapshot.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Does not edit 0148 or earlier migrations.
-- Does not change cancellation_policy_snapshot, refundability_snapshot,
-- deposit_requirement_snapshot, no_show_policy_snapshot, room price,
-- Front Office checkout, or Cashiering.
-- Does not add Additional Policy.
--
-- Same-property key already exists from 0148:
--   pms_early_departure_policies_id_restaurant_unique UNIQUE (id, restaurant_id)
--
-- Rollback:
--   ALTER TABLE public.hotel_reservations
--     DROP CONSTRAINT IF EXISTS hotel_reservations_early_departure_same_property;
--   DROP INDEX IF EXISTS public.hotel_reservations_early_departure_policy_idx;
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS early_departure_policy_id,
--     DROP COLUMN IF EXISTS early_departure_policy_snapshot;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS early_departure_policy_id uuid,
  ADD COLUMN IF NOT EXISTS early_departure_policy_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_reservations_early_departure_same_property'
      AND conrelid = 'public.hotel_reservations'::regclass
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_early_departure_same_property
      FOREIGN KEY (early_departure_policy_id, restaurant_id)
      REFERENCES public.pms_early_departure_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotel_reservations_early_departure_policy_idx
  ON public.hotel_reservations (restaurant_id, early_departure_policy_id);

COMMENT ON COLUMN public.hotel_reservations.early_departure_policy_id IS
  'Rate-plan early departure policy copied at reservation create. Null when the rate plan has no early departure policy. Historical terms live in early_departure_policy_snapshot.';
COMMENT ON COLUMN public.hotel_reservations.early_departure_policy_snapshot IS
  'Immutable early departure terms from the rate-plan policy at create. Later edits to pms_early_departure_policies do not change this snapshot.';
