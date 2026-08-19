ALTER TABLE public.orders
  ALTER COLUMN table_number TYPE text USING table_number::text;