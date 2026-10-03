-- Step 3 Booking Details: purpose catalogue + reservation commercial references.
-- Dual-lane: supabase/migrations and drizzle/migrations — byte-identical.
-- IN THE PR ONLY. APPLY AFTER MERGE.

-- Rollback:
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS commercial_sales_channel,
--     DROP COLUMN IF EXISTS purpose_of_stay,
--     DROP COLUMN IF EXISTS billing_rule_id,
--     DROP COLUMN IF EXISTS company_contact_id,
--     DROP COLUMN IF EXISTS travel_agent_contact_id,
--     DROP COLUMN IF EXISTS booker_guest_id;
--   DROP TABLE IF EXISTS public.pms_purpose_of_stay;

CREATE TABLE IF NOT EXISTS public.pms_purpose_of_stay (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_purpose_of_stay_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_purpose_of_stay_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_purpose_of_stay_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_purpose_of_stay_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS pms_purpose_of_stay_restaurant_idx
  ON public.pms_purpose_of_stay(restaurant_id, code);

COMMENT ON TABLE public.pms_purpose_of_stay IS
  'Settings catalogue for reservation purpose of stay. Travel Purpose reuses this master.';

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS commercial_sales_channel text,
  ADD COLUMN IF NOT EXISTS purpose_of_stay text,
  ADD COLUMN IF NOT EXISTS billing_rule_id uuid,
  ADD COLUMN IF NOT EXISTS company_contact_id uuid,
  ADD COLUMN IF NOT EXISTS travel_agent_contact_id uuid,
  ADD COLUMN IF NOT EXISTS booker_guest_id uuid;

COMMENT ON COLUMN public.hotel_reservations.commercial_sales_channel IS
  'SET6 pms_sales_channel_labels code. Distinct from commercial_booking_source and source origin.';
COMMENT ON COLUMN public.hotel_reservations.purpose_of_stay IS
  'pms_purpose_of_stay code. Not a second travel-purpose catalogue.';
COMMENT ON COLUMN public.hotel_reservations.billing_rule_id IS
  'Settings Card 3 billing rule hint. Cashiering/FO still opens and posts the folio.';
COMMENT ON COLUMN public.hotel_reservations.company_contact_id IS
  'guest_company_contacts row on the company master. Not a parallel contact master.';
COMMENT ON COLUMN public.hotel_reservations.travel_agent_contact_id IS
  'guest_company_contacts row on the travel-agent master.';
COMMENT ON COLUMN public.hotel_reservations.booker_guest_id IS
  'Optional Guest Profile for a booker distinct from guest_id. Null means same as guest.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_reservations_billing_rule_same_property'
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_billing_rule_same_property
      FOREIGN KEY (billing_rule_id, restaurant_id)
      REFERENCES public.pms_billing_rules(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_reservations_company_contact_same_property'
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_company_contact_same_property
      FOREIGN KEY (company_contact_id)
      REFERENCES public.guest_company_contacts(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_reservations_ta_contact_same_property'
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_ta_contact_same_property
      FOREIGN KEY (travel_agent_contact_id)
      REFERENCES public.guest_company_contacts(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_reservations_booker_guest_same_property'
  ) THEN
    ALTER TABLE public.hotel_reservations
      ADD CONSTRAINT hotel_reservations_booker_guest_same_property
      FOREIGN KEY (booker_guest_id, restaurant_id)
      REFERENCES public.guest_profiles(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
