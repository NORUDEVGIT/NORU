-- PRODUCT-RETIRE-14H — drop leftover RMS/customer schema columns.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0202_product_retire_14h_legacy_column_cleanup.sql
--   drizzle/migrations/0202_product_retire_14h_legacy_column_cleanup.sql
--
-- Drops only:
--   restaurants.tax_rate
--   restaurants.tax_inclusive
--   restaurants.service_enabled
--   restaurants.service_rate
--   restaurants.tax_name
--   guest_profiles.linked_customer_user_id
--   folio_history.cashier_shift_id
--
-- Preserves PMS tax/service catalogues, default_room_tax_group_id,
-- folio_history legacy cashier snapshot columns, hotel cashier shifts,
-- guest_profiles rows/RLS, and Staff/Workforce.

DO $$
DECLARE
  linked_n int;
  old_id_n int;
  match_n int;
  snap_id_n int;
  snap_opened_n int;
BEGIN
  SELECT count(*) INTO linked_n
    FROM public.guest_profiles
   WHERE linked_customer_user_id IS NOT NULL;
  IF linked_n <> 0 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14H: linked_customer_user_id populated=% (expected 0)',
      linked_n;
  END IF;

  SELECT
      count(*) FILTER (WHERE cashier_shift_id IS NOT NULL),
      count(*) FILTER (
        WHERE cashier_shift_id IS NOT NULL
          AND cashier_shift_id = legacy_cashier_shift_id
      ),
      count(*) FILTER (WHERE legacy_cashier_shift_id IS NOT NULL),
      count(*) FILTER (WHERE legacy_cashier_shift_opened_at IS NOT NULL)
    INTO old_id_n, match_n, snap_id_n, snap_opened_n
    FROM public.folio_history;

  IF old_id_n <> 5 OR match_n <> 5 OR snap_id_n <> 5 OR snap_opened_n <> 5 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14H: snapshot integrity old=% match=% snap_id=% opened=%',
      old_id_n, match_n, snap_id_n, snap_opened_n;
  END IF;
END
$$;

ALTER TABLE public.restaurants
  DROP CONSTRAINT restaurants_tax_rate_check;

ALTER TABLE public.restaurants
  DROP CONSTRAINT restaurants_service_rate_check;

ALTER TABLE public.restaurants
  DROP COLUMN tax_rate;

ALTER TABLE public.restaurants
  DROP COLUMN tax_inclusive;

ALTER TABLE public.restaurants
  DROP COLUMN service_enabled;

ALTER TABLE public.restaurants
  DROP COLUMN service_rate;

ALTER TABLE public.restaurants
  DROP COLUMN tax_name;

ALTER TABLE public.guest_profiles
  DROP COLUMN linked_customer_user_id;

ALTER TABLE public.folio_history
  DROP COLUMN cashier_shift_id;

DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ' ORDER BY table_name, column_name)
    INTO leftover
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (
       (table_name = 'restaurants' AND column_name IN (
         'tax_rate', 'tax_inclusive', 'service_enabled', 'service_rate', 'tax_name'
       ))
       OR (table_name = 'guest_profiles' AND column_name = 'linked_customer_user_id')
       OR (table_name = 'folio_history' AND column_name = 'cashier_shift_id')
     );
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14H: leftover columns %', leftover;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'folio_history'
       AND column_name = 'legacy_cashier_shift_id'
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14H: legacy_cashier_shift_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'restaurants'
       AND column_name = 'default_room_tax_group_id'
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14H: default_room_tax_group_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'folio_transactions'
       AND column_name = 'hotel_cashier_shift_id'
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14H: hotel_cashier_shift_id missing';
  END IF;
END
$$;
