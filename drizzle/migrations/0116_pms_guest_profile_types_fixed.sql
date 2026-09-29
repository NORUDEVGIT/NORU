-- PMS Property Setup Card 4 — Fixed Profile Types Hardening & Cleanup.
-- Sequential after 0115. Dual-lane copies live in
--   supabase/migrations/0116_pms_guest_profile_types_fixed.sql
--   drizzle/migrations/0116_pms_guest_profile_types_fixed.sql
--
-- NORU supports exactly four operational Guest Profile domains:
--   IND: Individual Guest
--   COM: Company
--   TRA: Travel Agency
--   GRP: Group
--
-- 1. Ensure the four canonical profile types exist for every restaurant with profile type configuration.
-- 2. Remap guest_profiles.profile_type_id referencing non-canonical types to canonical IND.
-- 3. Strip non-canonical UUIDs from pms_guest_id_types.valid_for_profile_type_ids.
-- 4. Remap non-canonical profile type IDs in pms_communication_automation_rules.conditions to canonical IND.
-- 5. Safely delete non-canonical profile type rows.
-- 6. Constrain code to the four canonical values.

-- 1. Seed missing canonical profile types for any restaurant that has profile types configured
INSERT INTO public.pms_guest_profile_types (restaurant_id, name, code, description, icon, active)
SELECT r.restaurant_id, 'Individual Guest', 'IND', 'Single guest or individual traveler.', 'user', true
FROM (SELECT DISTINCT restaurant_id FROM public.pms_guest_profile_types) r
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_guest_profile_types t
  WHERE t.restaurant_id = r.restaurant_id AND t.code = 'IND'
);

INSERT INTO public.pms_guest_profile_types (restaurant_id, name, code, description, icon, active)
SELECT r.restaurant_id, 'Company', 'COM', 'Corporate account or company booking.', 'building', true
FROM (SELECT DISTINCT restaurant_id FROM public.pms_guest_profile_types) r
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_guest_profile_types t
  WHERE t.restaurant_id = r.restaurant_id AND t.code = 'COM'
);

INSERT INTO public.pms_guest_profile_types (restaurant_id, name, code, description, icon, active)
SELECT r.restaurant_id, 'Travel Agency', 'TRA', 'Travel agency booking on behalf of guests.', 'briefcase', true
FROM (SELECT DISTINCT restaurant_id FROM public.pms_guest_profile_types) r
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_guest_profile_types t
  WHERE t.restaurant_id = r.restaurant_id AND t.code = 'TRA'
);

INSERT INTO public.pms_guest_profile_types (restaurant_id, name, code, description, icon, active)
SELECT r.restaurant_id, 'Group', 'GRP', 'Group master for multi-guest stays.', 'users', true
FROM (SELECT DISTINCT restaurant_id FROM public.pms_guest_profile_types) r
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_guest_profile_types t
  WHERE t.restaurant_id = r.restaurant_id AND t.code = 'GRP'
);

-- 2. Remap guest_profiles referencing non-canonical profile types to canonical IND
UPDATE public.guest_profiles g
SET profile_type_id = ind.id
FROM public.pms_guest_profile_types noncanon
JOIN public.pms_guest_profile_types ind
  ON ind.restaurant_id = noncanon.restaurant_id AND ind.code = 'IND'
WHERE g.profile_type_id = noncanon.id
  AND noncanon.code NOT IN ('IND', 'COM', 'TRA', 'GRP');

-- 3. Strip non-canonical UUIDs from pms_guest_id_types.valid_for_profile_type_ids
UPDATE public.pms_guest_id_types idt
SET valid_for_profile_type_ids = ARRAY(
  SELECT elem
  FROM unnest(idt.valid_for_profile_type_ids) AS elem
  WHERE elem IN (
    SELECT canon.id
    FROM public.pms_guest_profile_types canon
    WHERE canon.restaurant_id = idt.restaurant_id
      AND canon.code IN ('IND', 'COM', 'TRA', 'GRP')
  )
)
WHERE EXISTS (
  SELECT 1 FROM public.pms_guest_profile_types noncanon
  WHERE noncanon.restaurant_id = idt.restaurant_id
    AND noncanon.code NOT IN ('IND', 'COM', 'TRA', 'GRP')
    AND noncanon.id = ANY(idt.valid_for_profile_type_ids)
);

-- 4. Remap non-canonical profile type conditions in communication automation rules
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pms_communication_automation_rules'
  ) THEN
    UPDATE public.pms_communication_automation_rules car
    SET conditions = (
      SELECT jsonb_agg(
        CASE
          WHEN cond->>'field' = 'guest_profile_type'
            AND EXISTS (
              SELECT 1 FROM public.pms_guest_profile_types noncanon
              WHERE noncanon.restaurant_id = car.restaurant_id
                AND noncanon.code NOT IN ('IND', 'COM', 'TRA', 'GRP')
                AND noncanon.id::text = cond->>'value'
            )
          THEN jsonb_set(
            cond,
            '{value}',
            to_jsonb(COALESCE(
              (SELECT ind.id::text FROM public.pms_guest_profile_types ind
               WHERE ind.restaurant_id = car.restaurant_id AND ind.code = 'IND' LIMIT 1),
              cond->>'value'
            ))
          )
          ELSE cond
        END
      )
      FROM jsonb_array_elements(car.conditions) AS cond
    )
    WHERE car.conditions IS NOT NULL
      AND jsonb_typeof(car.conditions) = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(car.conditions) AS c
        JOIN public.pms_guest_profile_types noncanon
          ON noncanon.restaurant_id = car.restaurant_id
          AND noncanon.code NOT IN ('IND', 'COM', 'TRA', 'GRP')
          AND noncanon.id::text = c->>'value'
        WHERE c->>'field' = 'guest_profile_type'
      );
  END IF;
END $$;

-- 5. Safely delete non-canonical profile types
DELETE FROM public.pms_guest_profile_types
WHERE code NOT IN ('IND', 'COM', 'TRA', 'GRP');

-- 6. Add constraint enforcing only the four canonical codes
ALTER TABLE public.pms_guest_profile_types
  DROP CONSTRAINT IF EXISTS pms_guest_profile_types_canonical_code_check;

ALTER TABLE public.pms_guest_profile_types
  ADD CONSTRAINT pms_guest_profile_types_canonical_code_check
  CHECK (code IN ('IND', 'COM', 'TRA', 'GRP'));

COMMENT ON CONSTRAINT pms_guest_profile_types_canonical_code_check ON public.pms_guest_profile_types IS
  'Profile types are fixed system types: IND (Individual), COM (Company), TRA (Travel Agency), GRP (Group).';
