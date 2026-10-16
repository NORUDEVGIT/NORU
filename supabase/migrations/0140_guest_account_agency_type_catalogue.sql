-- Travel agency create stores the property catalogue code (OTA, TRAD, custom codes)
-- on guest_account_masters.agency_type. The previous check only allowed
-- ota / local / online / other, so every catalogue selection failed on insert.
-- Dual-lane with drizzle.

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_check;

ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_agency_type_check CHECK (
    agency_type IS NULL
    OR agency_type ~ '^[A-Za-z][A-Za-z0-9_]{1,39}$'
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_other_check;

ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_agency_type_other_check CHECK (
    (
      agency_type IS DISTINCT FROM 'other'
      AND upper(coalesce(agency_type, '')) IS DISTINCT FROM 'OTHR'
    )
    OR btrim(coalesce(agency_type_other, '')) <> ''
  );
