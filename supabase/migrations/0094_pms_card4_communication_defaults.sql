-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 6: Communication Defaults.
-- Sequential after 0093. Dual-lane copies live in
--   supabase/migrations/0094_pms_card4_communication_defaults.sql
--   drizzle/migrations/0094_pms_card4_communication_defaults.sql
--
-- Property-level communication defaults. Channels, senders, templates,
-- events, automation, delivery engines, and SET5 catalogues stay outside.

CREATE TABLE IF NOT EXISTS public.pms_communication_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  default_guest_channel_id uuid,
  default_internal_channel_id uuid,
  default_marketing_channel_id uuid,
  default_language text NOT NULL DEFAULT 'en',
  timezone text NOT NULL,
  date_format text NOT NULL DEFAULT 'yyyy-mm-dd',
  time_format text NOT NULL DEFAULT '24h',
  default_sender_id uuid,
  reply_to_email text,
  signature text,
  guest_notifications_enabled boolean NOT NULL DEFAULT true,
  internal_notifications_enabled boolean NOT NULL DEFAULT true,
  marketing_communications_enabled boolean NOT NULL DEFAULT false,
  use_guest_language boolean NOT NULL DEFAULT true,
  attach_branding boolean NOT NULL DEFAULT false,
  currency_code text NOT NULL,
  template_category text NOT NULL DEFAULT 'reservation',
  delivery_time text NOT NULL DEFAULT '09:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_communication_defaults_restaurant_unique
    UNIQUE (restaurant_id),
  CONSTRAINT pms_communication_defaults_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_defaults_language_check CHECK (
    default_language ~ '^[a-z]{2,8}$'
  ),
  CONSTRAINT pms_communication_defaults_timezone_check CHECK (
    length(btrim(timezone)) BETWEEN 1 AND 64
  ),
  CONSTRAINT pms_communication_defaults_date_format_check CHECK (
    date_format IN ('yyyy-mm-dd', 'dd/mm/yyyy', 'mm/dd/yyyy')
  ),
  CONSTRAINT pms_communication_defaults_time_format_check CHECK (
    time_format IN ('24h', '12h')
  ),
  CONSTRAINT pms_communication_defaults_reply_email_check CHECK (
    reply_to_email IS NULL OR reply_to_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pms_communication_defaults_signature_check CHECK (
    signature IS NULL OR length(signature) <= 4000
  ),
  CONSTRAINT pms_communication_defaults_currency_check CHECK (
    currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT pms_communication_defaults_category_check CHECK (
    template_category IN ('reservation', 'pre_arrival', 'stay', 'departure', 'internal')
  ),
  CONSTRAINT pms_communication_defaults_delivery_time_check CHECK (
    delivery_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  CONSTRAINT pms_communication_defaults_guest_channel_fk
    FOREIGN KEY (default_guest_channel_id, restaurant_id)
    REFERENCES public.pms_communication_channels(id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_communication_defaults_internal_channel_fk
    FOREIGN KEY (default_internal_channel_id, restaurant_id)
    REFERENCES public.pms_communication_channels(id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_communication_defaults_marketing_channel_fk
    FOREIGN KEY (default_marketing_channel_id, restaurant_id)
    REFERENCES public.pms_communication_channels(id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_communication_defaults_sender_fk
    FOREIGN KEY (default_sender_id, restaurant_id)
    REFERENCES public.pms_communication_sender_settings(id, restaurant_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pms_communication_defaults_restaurant_idx
  ON public.pms_communication_defaults(restaurant_id);

COMMENT ON TABLE public.pms_communication_defaults IS
  'Card 4 property communication defaults. Does not store secrets or drive delivery.';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pms_communication_defaults TO authenticated;
GRANT ALL ON public.pms_communication_defaults TO service_role;
ALTER TABLE public.pms_communication_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication defaults"
  ON public.pms_communication_defaults;
CREATE POLICY "Members read communication defaults"
  ON public.pms_communication_defaults
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication defaults"
  ON public.pms_communication_defaults;
CREATE POLICY "Managers insert communication defaults"
  ON public.pms_communication_defaults
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication defaults"
  ON public.pms_communication_defaults;
CREATE POLICY "Managers update communication defaults"
  ON public.pms_communication_defaults
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication defaults"
  ON public.pms_communication_defaults;
CREATE POLICY "Managers delete communication defaults"
  ON public.pms_communication_defaults
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_defaults_updated_at
  ON public.pms_communication_defaults;
CREATE TRIGGER set_pms_communication_defaults_updated_at
  BEFORE UPDATE ON public.pms_communication_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
