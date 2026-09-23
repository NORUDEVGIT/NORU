-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 5: Sender Settings.
-- Sequential after 0092. Dual-lane copies live in
--   supabase/migrations/0093_pms_card4_sender_settings.sql
--   drizzle/migrations/0093_pms_card4_sender_settings.sql
--
-- Per-channel sender/provider store. Secrets stay session-only and are
-- rejected from provider_config by the existing Card 6 safety function.
-- Communication Defaults and delivery engines stay outside this migration.

CREATE TABLE IF NOT EXISTS public.pms_communication_sender_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  provider text NOT NULL,
  auth_method text NOT NULL DEFAULT 'none',
  sender_name text NOT NULL,
  sender_email text,
  reply_to_email text,
  signature text,
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_communication_sender_settings_type_unique
    UNIQUE (restaurant_id, channel_type),
  CONSTRAINT pms_communication_sender_settings_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_sender_settings_type_check CHECK (
    channel_type IN ('email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app')
  ),
  CONSTRAINT pms_communication_sender_settings_provider_check CHECK (
    provider ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT pms_communication_sender_settings_auth_check CHECK (
    auth_method IN ('api_key', 'oauth2', 'basic', 'bearer_token', 'certificate', 'none')
  ),
  CONSTRAINT pms_communication_sender_settings_sender_name_check CHECK (
    length(btrim(sender_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_communication_sender_settings_sender_email_check CHECK (
    sender_email IS NULL OR sender_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pms_communication_sender_settings_reply_email_check CHECK (
    reply_to_email IS NULL OR reply_to_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pms_communication_sender_settings_signature_check CHECK (
    signature IS NULL OR length(signature) <= 4000
  ),
  CONSTRAINT pms_communication_sender_settings_config_object_check CHECK (
    jsonb_typeof(provider_config) = 'object'
  ),
  CONSTRAINT pms_communication_sender_settings_config_no_secret_check CHECK (
    public.pms_integration_config_is_safe(provider_config)
  ),
  CONSTRAINT pms_communication_sender_settings_channel_fk
    FOREIGN KEY (restaurant_id, channel_type)
    REFERENCES public.pms_communication_channels(restaurant_id, channel_type)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_communication_sender_settings_restaurant_idx
  ON public.pms_communication_sender_settings(restaurant_id, active, channel_type);

COMMENT ON TABLE public.pms_communication_sender_settings IS
  'Card 4 per-channel sender settings. Provider secrets are never stored.';
COMMENT ON COLUMN public.pms_communication_sender_settings.provider_config IS
  'Non-secret provider fields only; credential-shaped keys are rejected.';

INSERT INTO public.pms_communication_sender_settings (
  restaurant_id,
  channel_type,
  provider,
  auth_method,
  sender_name,
  sender_email,
  reply_to_email,
  signature,
  provider_config,
  active
)
SELECT
  channel.restaurant_id,
  channel.channel_type,
  channel.provider,
  channel.auth_method,
  channel.sender_name,
  channel.sender_email,
  channel.reply_to_email,
  channel.signature,
  channel.provider_config,
  channel.active
FROM public.pms_communication_channels AS channel
ON CONFLICT (restaurant_id, channel_type) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pms_communication_sender_settings TO authenticated;
GRANT ALL ON public.pms_communication_sender_settings TO service_role;
ALTER TABLE public.pms_communication_sender_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication sender settings"
  ON public.pms_communication_sender_settings;
CREATE POLICY "Members read communication sender settings"
  ON public.pms_communication_sender_settings
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication sender settings"
  ON public.pms_communication_sender_settings;
CREATE POLICY "Managers insert communication sender settings"
  ON public.pms_communication_sender_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication sender settings"
  ON public.pms_communication_sender_settings;
CREATE POLICY "Managers update communication sender settings"
  ON public.pms_communication_sender_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication sender settings"
  ON public.pms_communication_sender_settings;
CREATE POLICY "Managers delete communication sender settings"
  ON public.pms_communication_sender_settings
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_sender_settings_updated_at
  ON public.pms_communication_sender_settings;
CREATE TRIGGER set_pms_communication_sender_settings_updated_at
  BEFORE UPDATE ON public.pms_communication_sender_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
