ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER set_restaurant_tables_updated_at
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_restaurant_lower_number_key
  ON public.restaurant_tables (restaurant_id, lower(table_number));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;

INSERT INTO public.restaurant_tables (restaurant_id, table_number, name, qr_token, active)
SELECT r.id,
       n::text,
       'Table ' || n::text,
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       true
FROM public.restaurants r
CROSS JOIN generate_series(1, 10) AS n
WHERE r.slug = 'the-garden'
  AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_tables t
    WHERE t.restaurant_id = r.id AND lower(t.table_number) = lower(n::text)
  );