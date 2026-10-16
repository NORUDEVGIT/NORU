-- Public marketing images for the Noru site CMS.
-- The bucket is world-readable so published logo and solution image URLs work
-- on the homepage. Uploads are service-role signed URLs after requirePlatformAdmin.
-- Type and size limits are also enforced in createMarketingUploadUrl.
-- Dual-lane: byte-identical copies. Do not apply from an agent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-media',
  'marketing-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
