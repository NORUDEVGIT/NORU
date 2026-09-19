-- PMS Property Setup Card 4 — Guest & Services, Phase 3: Identity Documents.
-- Sequential after 0078. Dual-lane copies live in
--   supabase/migrations/0079_pms_card4_identity_documents.sql
--   drizzle/migrations/0079_pms_card4_identity_documents.sql
--
-- Extends the existing property ID-type catalogue. Configuration only:
-- no guest document values, images, OCR data, or operational workflow changes.

ALTER TABLE public.pms_guest_id_types
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS issuing_country_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_date_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_number_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scan_image_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_at_check_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valid_for_profile_type_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY restaurant_id ORDER BY display_order, name, id
  )::integer AS next_order
  FROM public.pms_guest_id_types
)
UPDATE public.pms_guest_id_types AS target
SET display_order = ordered.next_order
FROM ordered
WHERE target.id = ordered.id;

ALTER TABLE public.pms_guest_id_types
  DROP CONSTRAINT IF EXISTS pms_guest_id_types_inactive_not_required,
  DROP CONSTRAINT IF EXISTS pms_guest_id_types_display_order_positive;

ALTER TABLE public.pms_guest_id_types
  ADD CONSTRAINT pms_guest_id_types_inactive_not_required
    CHECK (NOT (active = false AND required_at_check_in = true)),
  ADD CONSTRAINT pms_guest_id_types_display_order_positive
    CHECK (display_order > 0);

CREATE INDEX IF NOT EXISTS pms_guest_id_types_restaurant_order_idx
  ON public.pms_guest_id_types(restaurant_id, display_order, name);

COMMENT ON TABLE public.pms_guest_id_types IS
  'Property identity-document type configuration shared by Card 4 and SET3. Contains no guest identity data.';
