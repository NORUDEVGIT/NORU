-- Step 4 Policies & Guarantee: deposit policy reference + booking-time snapshot.
-- Dual-lane: supabase/migrations and drizzle/migrations — byte-identical.
-- IN THE PR ONLY. APPLY AFTER MERGE.
-- Consumes Settings pms_deposit_policies. Not a folio line. Cashiering posts deposits.

-- Rollback:
--   ALTER TABLE public.hotel_reservations
--     DROP CONSTRAINT IF EXISTS hotel_reservations_deposit_policy_same_property;
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS deposit_policy_id,
--     DROP COLUMN IF EXISTS deposit_requirement_snapshot;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS deposit_policy_id uuid,
  ADD COLUMN IF NOT EXISTS deposit_requirement_snapshot jsonb;

COMMENT ON COLUMN public.hotel_reservations.deposit_policy_id IS
  'Settings pms_deposit_policies id at booking. Requirement reference only. Cashiering posts deposits.';
COMMENT ON COLUMN public.hotel_reservations.deposit_requirement_snapshot IS
  'Booking-time deposit requirement snapshot (type, value, currency, computed_amount, optional tender code). Not a folio line; Cashiering posts deposits.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_reservations_deposit_policy_same_property'
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_deposit_policy_same_property
      FOREIGN KEY (deposit_policy_id, restaurant_id)
      REFERENCES public.pms_deposit_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
