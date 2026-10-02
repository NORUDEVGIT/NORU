-- PMS Property Setup Card 4 — Guest & Services: Granular Identity Document Field Controls
-- Sequential after 0118. Dual-lane copies live in:
--   supabase/migrations/0119_pms_card4_identity_document_field_controls.sql
--   drizzle/migrations/0119_pms_card4_identity_document_field_controls.sql
--
-- Adds active/visibility and requirement controls for identity document fields
-- on pms_guest_id_types, allowing properties to customize which fields appear
-- and which are mandatory per document type.

ALTER TABLE public.pms_guest_id_types
  ADD COLUMN IF NOT EXISTS document_number_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS issuing_country_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS issue_date_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS issue_date_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_date_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scan_image_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issuing_authority_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS issuing_authority_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pms_guest_id_types.document_number_active IS
  'Whether the document number field is visible for this document type.';

COMMENT ON COLUMN public.pms_guest_id_types.issuing_country_active IS
  'Whether the issuing country field is visible for this document type.';

COMMENT ON COLUMN public.pms_guest_id_types.issue_date_active IS
  'Whether the issue date field is visible for this document type.';

COMMENT ON COLUMN public.pms_guest_id_types.issue_date_required IS
  'Whether the issue date field is mandatory when this document type is selected.';

COMMENT ON COLUMN public.pms_guest_id_types.expiry_date_active IS
  'Whether the expiry date field is visible for this document type.';

COMMENT ON COLUMN public.pms_guest_id_types.scan_image_required IS
  'Whether document front scan/image upload is mandatory when scan images are allowed.';

COMMENT ON COLUMN public.pms_guest_id_types.issuing_authority_active IS
  'Whether the issuing authority field is visible for this document type.';

COMMENT ON COLUMN public.pms_guest_id_types.issuing_authority_required IS
  'Whether the issuing authority field is mandatory when this document type is selected.';
