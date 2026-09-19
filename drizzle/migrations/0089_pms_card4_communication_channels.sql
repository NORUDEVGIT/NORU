-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 1: Communication Channels.
-- Sequential after 0088. Dual-lane copies live in
--   supabase/migrations/0089_pms_card4_communication_channels.sql
--   drizzle/migrations/0089_pms_card4_communication_channels.sql
--
-- Channel configuration only. Secrets remain session-only and are rejected
-- from provider_config by the existing Card 6 safety function.
-- Templates, events, automation rules, sender defaults, delivery, and queues
-- are deliberately outside this migration.

ALTER TABLE public.pms_integrations
  DROP CONSTRAINT IF EXISTS pms_integrations_category_check;
ALTER TABLE public.pms_integrations
  ADD CONSTRAINT pms_integrations_category_check CHECK (
    category IN (
      'payments',
      'sms',
      'email',
      'whatsapp',
      'accounting',
      'hospitality',
      'government',
      'distribution',
      'other'
    )
  );

CREATE TABLE IF NOT EXISTS public.pms_communication_channels (
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
  CONSTRAINT pms_communication_channels_type_unique
    UNIQUE (restaurant_id, channel_type),
  CONSTRAINT pms_communication_channels_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_channels_type_check CHECK (
    channel_type IN ('email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app')
  ),
  CONSTRAINT pms_communication_channels_provider_check CHECK (
    provider ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT pms_communication_channels_auth_check CHECK (
    auth_method IN ('api_key', 'oauth2', 'basic', 'bearer_token', 'certificate', 'none')
  ),
  CONSTRAINT pms_communication_channels_sender_name_check CHECK (
    length(btrim(sender_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_communication_channels_sender_email_check CHECK (
    sender_email IS NULL OR sender_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pms_communication_channels_reply_email_check CHECK (
    reply_to_email IS NULL OR reply_to_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pms_communication_channels_signature_check CHECK (
    signature IS NULL OR length(signature) <= 4000
  ),
  CONSTRAINT pms_communication_channels_config_object_check CHECK (
    jsonb_typeof(provider_config) = 'object'
  ),
  CONSTRAINT pms_communication_channels_config_no_secret_check CHECK (
    public.pms_integration_config_is_safe(provider_config)
  )
);

CREATE INDEX IF NOT EXISTS pms_communication_channels_restaurant_idx
  ON public.pms_communication_channels(restaurant_id, active, channel_type);

COMMENT ON TABLE public.pms_communication_channels IS
  'Card 4 property communication-channel configuration. Provider secrets are never stored.';
COMMENT ON COLUMN public.pms_communication_channels.provider_config IS
  'Non-secret provider fields only; credential-shaped keys are rejected.';

INSERT INTO public.pms_communication_channels (
  restaurant_id,
  channel_type,
  provider,
  auth_method,
  sender_name,
  active
)
SELECT
  restaurant.id,
  defaults.channel_type,
  defaults.provider,
  defaults.auth_method,
  restaurant.name,
  false
FROM public.restaurants AS restaurant
CROSS JOIN (
  VALUES
    ('email', 'smtp', 'basic'),
    ('sms', 'ethio_telecom_sms', 'basic'),
    ('whatsapp', 'dialog_360', 'api_key'),
    ('guest_portal', 'noru_pms', 'none'),
    ('pms_in_app', 'noru_pms', 'none')
) AS defaults(channel_type, provider, auth_method)
ON CONFLICT (restaurant_id, channel_type) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_communication_channels TO authenticated;
GRANT ALL ON public.pms_communication_channels TO service_role;
ALTER TABLE public.pms_communication_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication channels"
  ON public.pms_communication_channels;
CREATE POLICY "Members read communication channels"
  ON public.pms_communication_channels
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication channels"
  ON public.pms_communication_channels;
CREATE POLICY "Managers insert communication channels"
  ON public.pms_communication_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication channels"
  ON public.pms_communication_channels;
CREATE POLICY "Managers update communication channels"
  ON public.pms_communication_channels
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication channels"
  ON public.pms_communication_channels;
CREATE POLICY "Managers delete communication channels"
  ON public.pms_communication_channels
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_channels_updated_at
  ON public.pms_communication_channels;
CREATE TRIGGER set_pms_communication_channels_updated_at
  BEFORE UPDATE ON public.pms_communication_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
