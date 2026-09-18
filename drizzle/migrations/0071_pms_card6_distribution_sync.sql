-- PMS Property Setup Card 6 — Connectivity & Distribution, Phase 3.
-- Stores operational intent only. This migration does not create an OTA sync
-- worker, claim a provider handshake, or manufacture sync history.

ALTER TABLE public.distribution_channels
  ADD COLUMN IF NOT EXISTS sync_config jsonb NOT NULL DEFAULT '{
    "inventory":{"enabled":false,"direction":"outbound","availability":true,"roomStatus":false,"outOfOrder":false,"outOfService":false},
    "rates":{"enabled":false,"direction":"outbound","rateUpdates":true,"baseRates":true,"derivedRates":false},
    "restrictions":{"enabled":false,"minimumStay":false,"maximumStay":false,"closedToArrival":false,"closedToDeparture":false,"stopSell":false},
    "frequency":"manual","automaticSync":false,"retryEnabled":false,"maxRetries":0
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

ALTER TABLE public.distribution_channels
  DROP CONSTRAINT IF EXISTS distribution_channels_sync_config_object_check;
ALTER TABLE public.distribution_channels
  ADD CONSTRAINT distribution_channels_sync_config_object_check
  CHECK (jsonb_typeof(sync_config) = 'object');

COMMENT ON COLUMN public.distribution_channels.sync_config IS
  'Card 6 synchronization preferences. Credentials and mappings are stored elsewhere.';
COMMENT ON COLUMN public.distribution_channels.sync_active IS
  'Operational activation intent. It does not claim that an external provider is connected.';
COMMENT ON COLUMN public.distribution_channels.activated_at IS
  'When Card 6 operational activation was last enabled; not a provider sync timestamp.';
