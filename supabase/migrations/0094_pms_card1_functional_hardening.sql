-- PMS Property Setup Card 1 — functional hardening (PM approved schema).
-- Sequential after 0093. Dual-lane: byte-identical copies live in
--   supabase/migrations/0094_pms_card1_functional_hardening.sql
--   drizzle/migrations/0094_pms_card1_functional_hardening.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0094_pms_card1_functional_hardening.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.hotel_floors DROP CONSTRAINT IF EXISTS hotel_floors_wing_fk;
--   ALTER TABLE public.hotel_floors
--     ADD CONSTRAINT hotel_floors_wing_fk
--     FOREIGN KEY (wing_id) REFERENCES public.hotel_wings(id) ON DELETE SET NULL;
--   ALTER TABLE public.restaurants
--     DROP CONSTRAINT IF EXISTS restaurants_checkin_ops_object_check,
--     DROP CONSTRAINT IF EXISTS restaurants_checkin_ops_typed_check,
--     DROP CONSTRAINT IF EXISTS restaurants_legal_upload_refs_array_check,
--     DROP CONSTRAINT IF EXISTS restaurants_tax_upload_refs_array_check;
--   DROP TABLE IF EXISTS public.pms_property_department_contacts;
--   DROP TABLE IF EXISTS public.pms_property_areas;
--
-- Scope fence — this migration explicitly does NOT:
--   create a second department master (Card 5 pms_departments stays authority)
--   drop restaurants.department_contacts or restaurants.property_areas
--   add a second business-date column/table (restaurants.business_date stays canonical)
--   change check_in_time / check_out_time storage
--   create a DMS or a new storage bucket
--   cascade-delete hotel structure or hotel_rooms (Card 2 remains room master)
--   create a second audit-event store — reuse public.restaurant_staff_audit_log
--   invent runtime booking enforcement
--   create SECURITY DEFINER functions
--   No SECURITY DEFINER
--   No pms_card1_live
--
-- Additive. Safe name-match backfill only. No guessed mapping. No types.ts regen.

-- 1. Normalized Card 1 department contacts. Card 5 remains the department catalogue.
CREATE TABLE IF NOT EXISTS public.pms_property_department_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  contact_name text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_property_department_contacts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_property_department_contacts_department_fk
    FOREIGN KEY (department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_property_department_contacts_name_check CHECK (
    contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_property_department_contacts_phone_check CHECK (
    phone IS NULL OR length(btrim(phone)) BETWEEN 1 AND 30
  ),
  CONSTRAINT pms_property_department_contacts_email_check CHECK (
    email IS NULL OR (
      length(btrim(email)) BETWEEN 3 AND 254
      AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  )
);

CREATE INDEX IF NOT EXISTS pms_property_department_contacts_restaurant_idx
  ON public.pms_property_department_contacts(restaurant_id, department_id, sort_order);

COMMENT ON TABLE public.pms_property_department_contacts IS
  'Card 1 contact channels for a Card 5 department. Not a second department catalogue. restaurants.department_contacts JSON remains for compatibility.';
COMMENT ON COLUMN public.pms_property_department_contacts.department_id IS
  'FK to public.pms_departments in the same restaurant. Card 5 owns the master row.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_property_department_contacts TO authenticated;
GRANT ALL ON public.pms_property_department_contacts TO service_role;
ALTER TABLE public.pms_property_department_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read property department contacts" ON public.pms_property_department_contacts;
CREATE POLICY "Members read property department contacts" ON public.pms_property_department_contacts
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert property department contacts" ON public.pms_property_department_contacts;
CREATE POLICY "Managers insert property department contacts" ON public.pms_property_department_contacts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update property department contacts" ON public.pms_property_department_contacts;
CREATE POLICY "Managers update property department contacts" ON public.pms_property_department_contacts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete property department contacts" ON public.pms_property_department_contacts;
CREATE POLICY "Managers delete property department contacts" ON public.pms_property_department_contacts
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_property_department_contacts_updated_at ON public.pms_property_department_contacts;
CREATE TRIGGER set_pms_property_department_contacts_updated_at
  BEFORE UPDATE ON public.pms_property_department_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Safe unique name match only. Ambiguous or unmatched JSON rows stay in department_contacts.
INSERT INTO public.pms_property_department_contacts (
  restaurant_id,
  department_id,
  contact_name,
  phone,
  email,
  sort_order
)
SELECT
  r.id,
  d.id,
  CASE
    WHEN length(btrim(COALESCE(elem.elem->>'name', ''))) BETWEEN 1 AND 120
      THEN btrim(elem.elem->>'name')
    ELSE NULL
  END,
  CASE
    WHEN length(btrim(COALESCE(elem.elem->>'phone', ''))) BETWEEN 1 AND 30
      THEN btrim(elem.elem->>'phone')
    ELSE NULL
  END,
  CASE
    WHEN btrim(COALESCE(elem.elem->>'email', '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND length(btrim(elem.elem->>'email')) BETWEEN 3 AND 254
      THEN btrim(elem.elem->>'email')
    ELSE NULL
  END,
  (elem.ordinality - 1)::integer
FROM public.restaurants r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.department_contacts, '[]'::jsonb))
  WITH ORDINALITY AS elem(elem, ordinality)
INNER JOIN public.pms_departments d
  ON d.restaurant_id = r.id
 AND lower(btrim(d.name)) = lower(btrim(COALESCE(elem.elem->>'department', '')))
WHERE jsonb_typeof(COALESCE(r.department_contacts, '[]'::jsonb)) = 'array'
  AND btrim(COALESCE(elem.elem->>'department', '')) <> ''
  AND (
    SELECT count(*)::integer
    FROM public.pms_departments d2
    WHERE d2.restaurant_id = r.id
      AND lower(btrim(d2.name)) = lower(btrim(elem.elem->>'department'))
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.pms_property_department_contacts existing
    WHERE existing.restaurant_id = r.id
      AND existing.department_id = d.id
      AND COALESCE(existing.contact_name, '') = COALESCE(NULLIF(btrim(elem.elem->>'name'), ''), '')
      AND COALESCE(existing.phone, '') = COALESCE(NULLIF(btrim(elem.elem->>'phone'), ''), '')
      AND COALESCE(existing.email, '') = COALESCE(NULLIF(btrim(elem.elem->>'email'), ''), '')
  );

-- 2. Typed check-in policy keys on existing restaurants.checkin_ops. No second policy table.
COMMENT ON COLUMN public.restaurants.checkin_ops IS
  'PMS Card 1 check-in extras. Legacy free-text keys (minLeadTime, earlyCheckinPolicy, lateCheckoutPolicy, sameDayCutoff, overstayGrace, childPolicy string) stay valid. Additive typed keys: minLeadTimeHours (1-24), overstayGraceMinutes (0-1440), earlyCheckin {allowed,feeBasis,feeValue}, lateCheckout {allowed,feeBasis,feeValue}, childPolicyConfig {summary,minAge,maxAge,optional freeUntilAge, optional chargeFromAge}. feeBasis in percent_stay, fixed, first_night. Setup only — not a booking engine. restaurants.business_date stays the Night Audit clock.';

UPDATE public.restaurants
SET checkin_ops = COALESCE(checkin_ops, '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'minLeadTimeHours',
    CASE
      WHEN checkin_ops ? 'minLeadTimeHours' THEN NULL
      WHEN btrim(COALESCE(checkin_ops->>'minLeadTime', '')) ~* '^([1-9]|1[0-9]|2[0-4])[[:space:]]*(h|hr|hrs|hour|hours)?$'
        THEN to_jsonb(
          substring(btrim(checkin_ops->>'minLeadTime') from '^([1-9]|1[0-9]|2[0-4])')::integer
        )
      ELSE NULL
    END,
    'overstayGraceMinutes',
    CASE
      WHEN checkin_ops ? 'overstayGraceMinutes' THEN NULL
      WHEN btrim(COALESCE(checkin_ops->>'overstayGrace', '')) ~* '^([0-9]|[1-9][0-9]|[1-9][0-9]{2}|1[0-3][0-9]{2}|14[0-3][0-9]|1440)[[:space:]]*(m|min|mins|minute|minutes)$'
        THEN to_jsonb(
          substring(btrim(checkin_ops->>'overstayGrace') from '^([0-9]+)')::integer
        )
      WHEN btrim(COALESCE(checkin_ops->>'overstayGrace', '')) ~* '^([0-9]|1[0-9]|2[0-4])[[:space:]]*(h|hr|hrs|hour|hours)$'
        THEN to_jsonb(
          (substring(btrim(checkin_ops->>'overstayGrace') from '^([0-9]+)')::integer * 60)
        )
      ELSE NULL
    END
  )
)
WHERE jsonb_typeof(COALESCE(checkin_ops, '{}'::jsonb)) = 'object';

UPDATE public.restaurants
SET checkin_ops = checkin_ops || jsonb_build_object(
  'childPolicyConfig',
  jsonb_build_object('summary', left(btrim(checkin_ops->>'childPolicy'), 200))
)
WHERE jsonb_typeof(COALESCE(checkin_ops, '{}'::jsonb)) = 'object'
  AND jsonb_typeof(checkin_ops->'childPolicy') = 'string'
  AND btrim(COALESCE(checkin_ops->>'childPolicy', '')) <> ''
  AND NOT (checkin_ops ? 'childPolicyConfig');

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_checkin_ops_object_check,
  DROP CONSTRAINT IF EXISTS restaurants_checkin_ops_typed_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_checkin_ops_object_check CHECK (jsonb_typeof(checkin_ops) = 'object'),
  ADD CONSTRAINT restaurants_checkin_ops_typed_check CHECK (
    (
      NOT (checkin_ops ? 'minLeadTimeHours')
      OR (
        jsonb_typeof(checkin_ops->'minLeadTimeHours') = 'number'
        AND (checkin_ops->>'minLeadTimeHours')::numeric = trunc((checkin_ops->>'minLeadTimeHours')::numeric)
        AND (checkin_ops->>'minLeadTimeHours')::integer BETWEEN 1 AND 24
      )
    )
    AND (
      NOT (checkin_ops ? 'overstayGraceMinutes')
      OR (
        jsonb_typeof(checkin_ops->'overstayGraceMinutes') = 'number'
        AND (checkin_ops->>'overstayGraceMinutes')::numeric = trunc((checkin_ops->>'overstayGraceMinutes')::numeric)
        AND (checkin_ops->>'overstayGraceMinutes')::integer BETWEEN 0 AND 1440
      )
    )
    AND (
      NOT (checkin_ops ? 'earlyCheckin')
      OR (
        jsonb_typeof(checkin_ops->'earlyCheckin') = 'object'
        AND (
          NOT (checkin_ops->'earlyCheckin' ? 'allowed')
          OR jsonb_typeof(checkin_ops->'earlyCheckin'->'allowed') = 'boolean'
        )
        AND (
          NOT (checkin_ops->'earlyCheckin' ? 'feeBasis')
          OR (checkin_ops#>>'{earlyCheckin,feeBasis}') IN ('percent_stay', 'fixed', 'first_night')
        )
        AND (
          NOT (checkin_ops->'earlyCheckin' ? 'feeValue')
          OR (
            jsonb_typeof(checkin_ops->'earlyCheckin'->'feeValue') = 'number'
            AND (checkin_ops#>>'{earlyCheckin,feeValue}')::numeric >= 0
          )
        )
      )
    )
    AND (
      NOT (checkin_ops ? 'lateCheckout')
      OR (
        jsonb_typeof(checkin_ops->'lateCheckout') = 'object'
        AND (
          NOT (checkin_ops->'lateCheckout' ? 'allowed')
          OR jsonb_typeof(checkin_ops->'lateCheckout'->'allowed') = 'boolean'
        )
        AND (
          NOT (checkin_ops->'lateCheckout' ? 'feeBasis')
          OR (checkin_ops#>>'{lateCheckout,feeBasis}') IN ('percent_stay', 'fixed', 'first_night')
        )
        AND (
          NOT (checkin_ops->'lateCheckout' ? 'feeValue')
          OR (
            jsonb_typeof(checkin_ops->'lateCheckout'->'feeValue') = 'number'
            AND (checkin_ops#>>'{lateCheckout,feeValue}')::numeric >= 0
          )
        )
      )
    )
    AND (
      NOT (checkin_ops ? 'childPolicy')
      OR jsonb_typeof(checkin_ops->'childPolicy') IN ('string', 'object')
    )
    AND (
      NOT (checkin_ops ? 'childPolicyConfig')
      OR (
        jsonb_typeof(checkin_ops->'childPolicyConfig') = 'object'
        AND (
          NOT (checkin_ops->'childPolicyConfig' ? 'summary')
          OR (
            jsonb_typeof(checkin_ops->'childPolicyConfig'->'summary') = 'string'
            AND length(checkin_ops#>>'{childPolicyConfig,summary}') <= 200
          )
        )
        AND (
          NOT (checkin_ops->'childPolicyConfig' ? 'minAge')
          OR (
            jsonb_typeof(checkin_ops->'childPolicyConfig'->'minAge') = 'number'
            AND (checkin_ops#>>'{childPolicyConfig,minAge}')::integer BETWEEN 0 AND 21
          )
        )
        AND (
          NOT (checkin_ops->'childPolicyConfig' ? 'maxAge')
          OR (
            jsonb_typeof(checkin_ops->'childPolicyConfig'->'maxAge') = 'number'
            AND (checkin_ops#>>'{childPolicyConfig,maxAge}')::integer BETWEEN 0 AND 21
          )
        )
        AND (
          NOT (
            (checkin_ops->'childPolicyConfig' ? 'minAge')
            AND (checkin_ops->'childPolicyConfig' ? 'maxAge')
          )
          OR (checkin_ops#>>'{childPolicyConfig,minAge}')::integer
            <= (checkin_ops#>>'{childPolicyConfig,maxAge}')::integer
        )
        AND (
          NOT (checkin_ops->'childPolicyConfig' ? 'freeUntilAge')
          OR (
            jsonb_typeof(checkin_ops->'childPolicyConfig'->'freeUntilAge') = 'number'
            AND (checkin_ops#>>'{childPolicyConfig,freeUntilAge}')::integer BETWEEN 0 AND 21
          )
        )
        AND (
          NOT (checkin_ops->'childPolicyConfig' ? 'chargeFromAge')
          OR (
            jsonb_typeof(checkin_ops->'childPolicyConfig'->'chargeFromAge') = 'number'
            AND (checkin_ops#>>'{childPolicyConfig,chargeFromAge}')::integer BETWEEN 0 AND 21
          )
        )
      )
    )
  );

-- 3. Legal / tax upload metadata on existing JSONB arrays. No new bucket.
COMMENT ON COLUMN public.restaurants.legal_upload_refs IS
  'PMS Card 1 legal document refs. Compatibility shape {name, kind}. Additive storage_path, mime_type, size_bytes. Kinds: certificate_of_incorporation, trade_license, tin_certificate, vat_certificate. Not a DMS. Uses existing property-images storage.';
COMMENT ON COLUMN public.restaurants.tax_upload_refs IS
  'PMS Card 1 tax document refs. Compatibility shape {name, kind}. Additive storage_path, mime_type, size_bytes. VAT certificate gated on vat_registered. Not a DMS.';

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_legal_upload_refs_array_check,
  DROP CONSTRAINT IF EXISTS restaurants_tax_upload_refs_array_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_legal_upload_refs_array_check CHECK (jsonb_typeof(legal_upload_refs) = 'array'),
  ADD CONSTRAINT restaurants_tax_upload_refs_array_check CHECK (jsonb_typeof(tax_upload_refs) = 'array');

-- 4. Tenant-scoped property areas. restaurants.property_areas JSON remains.
CREATE TABLE IF NOT EXISTS public.pms_property_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_property_areas_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_property_areas_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT pms_property_areas_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_property_areas_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_property_areas_restaurant_idx
  ON public.pms_property_areas(restaurant_id, active, sort_order);

COMMENT ON TABLE public.pms_property_areas IS
  'Card 1 named property areas. No FK cascade into rooms, outlets, or other modules. restaurants.property_areas JSON remains for compatibility.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_property_areas TO authenticated;
GRANT ALL ON public.pms_property_areas TO service_role;
ALTER TABLE public.pms_property_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read property areas" ON public.pms_property_areas;
CREATE POLICY "Members read property areas" ON public.pms_property_areas
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert property areas" ON public.pms_property_areas;
CREATE POLICY "Managers insert property areas" ON public.pms_property_areas
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update property areas" ON public.pms_property_areas;
CREATE POLICY "Managers update property areas" ON public.pms_property_areas
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete property areas" ON public.pms_property_areas;
CREATE POLICY "Managers delete property areas" ON public.pms_property_areas
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_property_areas_updated_at ON public.pms_property_areas;
CREATE TRIGGER set_pms_property_areas_updated_at
  BEFORE UPDATE ON public.pms_property_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_property_areas (restaurant_id, name, sort_order)
SELECT
  r.id,
  chip.value,
  (chip.ordinality - 1)::integer
FROM public.restaurants r
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.property_areas, '[]'::jsonb))
  WITH ORDINALITY AS chip(value, ordinality)
WHERE jsonb_typeof(COALESCE(r.property_areas, '[]'::jsonb)) = 'array'
  AND chip.value IN (
    'Lobby',
    'Reception',
    'Restaurant',
    'Bar',
    'Pool',
    'Parking',
    'Function',
    'Conference',
    'Spa',
    'Gym',
    'Garden',
    'Business Center',
    'Public'
  )
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- 5. Structure delete safety: floors that reference a wing must block wing delete.
-- hotel_rooms FKs stay RESTRICT (Card 2 room master). No cascading structure deletes.
ALTER TABLE public.hotel_floors DROP CONSTRAINT IF EXISTS hotel_floors_wing_fk;
ALTER TABLE public.hotel_floors
  ADD CONSTRAINT hotel_floors_wing_fk
    FOREIGN KEY (wing_id, restaurant_id)
    REFERENCES public.hotel_wings (id, restaurant_id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN public.hotel_floors.wing_id IS
  'Optional wing parent for a floor. RESTRICT on wing delete so an empty-looking wing cannot silently SET NULL child floors. Room rows stay Card 2 / hotel_rooms.';
