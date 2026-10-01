-- PMS Property Setup Card 5 — Organization & Facilities: Pipeline Stage Form Fields
-- Sequential after 0117. Dual-lane copies live in:
--   supabase/migrations/0118_pms_card5_pipeline_stage_fields.sql
--   drizzle/migrations/0118_pms_card5_pipeline_stage_fields.sql
--
-- Adds description and default_probability columns to pms_sales_pipeline_stages.
-- Both columns are nullable to safely preserve all existing legacy rows without
-- inventing fake business values. New and edited rows require both fields via application validation.

ALTER TABLE public.pms_sales_pipeline_stages
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS default_probability integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pms_sales_pipeline_stages_probability_check'
  ) THEN
    ALTER TABLE public.pms_sales_pipeline_stages
      ADD CONSTRAINT pms_sales_pipeline_stages_probability_check
      CHECK (
        default_probability IS NULL
        OR (
          default_probability >= 0
          AND default_probability <= 100
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.pms_sales_pipeline_stages.description IS
  'Human-readable description of what this pipeline stage represents. Nullable for legacy records.';

COMMENT ON COLUMN public.pms_sales_pipeline_stages.default_probability IS
  'Default win probability percentage (0 to 100) associated with this sales pipeline stage. Nullable for legacy records.';
