-- AIOS-03: Aiosell connection metadata on the existing integration row,
-- plus the room context a nested Aiosell rate plan needs.
-- partner_slug and external_property_code are not secrets and are not hotelCode aliases of each other.
-- external_property_code is the Aiosell hotelCode. It is not hotel_reservations.external_reference.
-- Room and rate rows stay on distribution_room_mappings and distribution_rate_mappings.
-- distribution_rate_mappings.external_room_code is the Aiosell room_id that rateplan is nested under.
-- Connected OTA rows can store one channel property code and a list of operation names.
-- Per-operation rate_multiplier is not stored. Channel multiplier stays later.
-- pms_integration_config_is_safe is unchanged.
-- Dual-lane: byte-identical copies. Do not apply from an agent.

ALTER TABLE public.pms_integrations
  ADD COLUMN IF NOT EXISTS partner_slug text,
  ADD COLUMN IF NOT EXISTS external_property_code text,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.pms_integrations
  DROP CONSTRAINT IF EXISTS pms_integrations_partner_slug_check;
ALTER TABLE public.pms_integrations
  ADD CONSTRAINT pms_integrations_partner_slug_check
  CHECK (partner_slug IS NULL OR char_length(partner_slug) > 0);

ALTER TABLE public.pms_integrations
  DROP CONSTRAINT IF EXISTS pms_integrations_external_property_code_check;
ALTER TABLE public.pms_integrations
  ADD CONSTRAINT pms_integrations_external_property_code_check
  CHECK (external_property_code IS NULL OR char_length(external_property_code) > 0);

ALTER TABLE public.pms_integrations
  DROP CONSTRAINT IF EXISTS pms_integrations_last_error_check;
ALTER TABLE public.pms_integrations
  ADD CONSTRAINT pms_integrations_last_error_check
  CHECK (last_error IS NULL OR char_length(last_error) <= 400);

CREATE UNIQUE INDEX IF NOT EXISTS pms_integrations_aiosell_active_unique
  ON public.pms_integrations (restaurant_id, provider, environment)
  WHERE provider = 'aiosell' AND enabled = true AND status <> 'disabled';

COMMENT ON COLUMN public.pms_integrations.partner_slug IS
  'Non-secret partner id, such as the Aiosell {pms} slug. Not the property hotelCode and not a password.';
COMMENT ON COLUMN public.pms_integrations.external_property_code IS
  'Non-secret provider property code. For Aiosell this is hotelCode.';
COMMENT ON COLUMN public.pms_integrations.last_validated_at IS
  'When local connection metadata was last checked. Not an Aiosell handshake.';
COMMENT ON COLUMN public.pms_integrations.last_error IS
  'Last local validation error. Not a credential and not a webhook body.';

ALTER TABLE public.distribution_rate_mappings
  ADD COLUMN IF NOT EXISTS external_room_code text;

ALTER TABLE public.distribution_rate_mappings
  DROP CONSTRAINT IF EXISTS distribution_rate_mappings_external_room_code_check;
ALTER TABLE public.distribution_rate_mappings
  ADD CONSTRAINT distribution_rate_mappings_external_room_code_check
  CHECK (external_room_code IS NULL OR char_length(external_room_code) > 0);

COMMENT ON COLUMN public.distribution_rate_mappings.external_room_code IS
  'Aiosell room_id the external rate plan is nested under. A room type code, not a physical room.';

CREATE UNIQUE INDEX IF NOT EXISTS distribution_room_mappings_external_code_unique
  ON public.distribution_room_mappings (channel_id, external_room_code)
  WHERE external_room_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS distribution_rate_mappings_external_code_unique
  ON public.distribution_rate_mappings (channel_id, external_room_code, external_rate_code)
  WHERE external_room_code IS NOT NULL AND external_rate_code IS NOT NULL;

ALTER TABLE public.distribution_channels
  ADD COLUMN IF NOT EXISTS channel_property_code text,
  ADD COLUMN IF NOT EXISTS external_operations text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.distribution_channels
  DROP CONSTRAINT IF EXISTS distribution_channels_channel_property_code_check;
ALTER TABLE public.distribution_channels
  ADD CONSTRAINT distribution_channels_channel_property_code_check
  CHECK (channel_property_code IS NULL OR char_length(channel_property_code) > 0);

COMMENT ON COLUMN public.distribution_channels.channel_property_code IS
  'OTA property code from Aiosell connected_channels.hotel_code. Not the Aiosell hotelCode.';
COMMENT ON COLUMN public.distribution_channels.external_operations IS
  'Operation names seen for this channel, such as inventory, rates, or reservation. Not a per-operation multiplier.';
