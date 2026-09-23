-- PMS Property Setup Card 8 — Offline & Sync policy schema (Phase 1).
--
-- Sequential after 0089. Dual-lane: byte-identical copies live in
--   supabase/migrations/0090_pms_card8_offline_policy.sql
--   drizzle/migrations/0090_pms_card8_offline_policy.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM apply approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0090_pms_card8_offline_policy.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_offline_capabilities;
--   DROP TABLE IF EXISTS public.pms_offline_policies;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurants.pms_offline_enablement_posture
--   restaurants.pms_offline_sync_posture
--   SET6 savePmsOfflineEnablementPosture / savePmsOfflineSyncPosture
--   guest_folios / folio_transactions / post_folio_transaction / folio_history
--   hotel_reservations / createReservation / hotel_reservation_history
--   housekeeping_tasks / housekeeping_history
--   guest_profiles / guest_profile_history
--   pms_payment_methods / payment gateways / Stripe
--   Card 6 distribution mapping / OTA sync
--   Card 7 security / audit / reports / import tables
--   restaurant_staff_audit_log / pms_audit_events (none created)
--   service workers / IndexedDB / offline queues / device registry
--   types.ts
--
-- Setup/policy only. Saving a row does not ship an offline runtime.
-- Must never read Offline Ready. No operational event rows.
-- No types.ts regen. No privileged functions. No runtime declaration table.

-- 1. Tenant-scoped parent policy. One row per property.
CREATE TABLE IF NOT EXISTS public.pms_offline_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  offline_mode_enabled boolean NOT NULL DEFAULT false,
  configured boolean NOT NULL DEFAULT false,
  cache_previous_days integer NOT NULL DEFAULT 0,
  cache_future_days integer NOT NULL DEFAULT 0,
  sync_mode text NOT NULL DEFAULT 'manual',
  sync_interval_minutes integer NOT NULL DEFAULT 15,
  retry_interval_minutes integer NOT NULL DEFAULT 5,
  maximum_retry_attempts integer NOT NULL DEFAULT 0,
  conflict_policy text NOT NULL DEFAULT 'server_authoritative',
  failed_event_policy text NOT NULL DEFAULT 'hold',
  financial_offline_policy text NOT NULL DEFAULT 'forbidden',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_offline_policies_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_offline_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_offline_policies_cache_previous_check CHECK (
    cache_previous_days >= 0 AND cache_previous_days <= 365
  ),
  CONSTRAINT pms_offline_policies_cache_future_check CHECK (
    cache_future_days >= 0 AND cache_future_days <= 365
  ),
  CONSTRAINT pms_offline_policies_sync_mode_check CHECK (
    sync_mode IN ('automatic', 'manual')
  ),
  CONSTRAINT pms_offline_policies_sync_interval_check CHECK (
    sync_interval_minutes > 0 AND sync_interval_minutes <= 10080
  ),
  CONSTRAINT pms_offline_policies_retry_interval_check CHECK (
    retry_interval_minutes > 0 AND retry_interval_minutes <= 1440
  ),
  CONSTRAINT pms_offline_policies_retry_attempts_check CHECK (
    maximum_retry_attempts >= 0 AND maximum_retry_attempts <= 20
  ),
  CONSTRAINT pms_offline_policies_conflict_check CHECK (
    conflict_policy IN (
      'server_authoritative',
      'version_check',
      'business_rule',
      'manual_review'
    )
  ),
  CONSTRAINT pms_offline_policies_failed_event_check CHECK (
    failed_event_policy IN ('hold', 'retry_then_hold', 'discard_non_financial')
  ),
  CONSTRAINT pms_offline_policies_financial_check CHECK (
    financial_offline_policy IN ('forbidden', 'cash_pending_only')
  ),
  CONSTRAINT pms_offline_policies_no_gateway_success CHECK (
    financial_offline_policy NOT IN (
      'gateway_success',
      'gateway_captured',
      'external_success',
      'settled_offline'
    )
  )
);

CREATE INDEX IF NOT EXISTS pms_offline_policies_restaurant_idx
  ON public.pms_offline_policies(restaurant_id);

COMMENT ON TABLE public.pms_offline_policies IS
  'Card 8 Offline & Sync tenant policy. Setup only. Saving does not ship a runtime and must never read Offline Ready. SET6 JSONB posture is not dropped.';
COMMENT ON COLUMN public.pms_offline_policies.offline_mode_enabled IS
  'Intent that offline mode is desired when a runtime exists. Does not enable a local engine.';
COMMENT ON COLUMN public.pms_offline_policies.configured IS
  'True after Card 8 saves this policy. Not a runtime health or Offline Ready flag.';
COMMENT ON COLUMN public.pms_offline_policies.cache_previous_days IS
  'Policy cache window behind today. Not an IndexedDB store.';
COMMENT ON COLUMN public.pms_offline_policies.cache_future_days IS
  'Policy cache window ahead of today. Not an IndexedDB store.';
COMMENT ON COLUMN public.pms_offline_policies.sync_mode IS
  'automatic or manual preference only. Not a sync worker.';
COMMENT ON COLUMN public.pms_offline_policies.sync_interval_minutes IS
  'Preferred interval when a runtime exists. Not a scheduler.';
COMMENT ON COLUMN public.pms_offline_policies.retry_interval_minutes IS
  'Preferred retry spacing when a runtime exists. Not a retry engine.';
COMMENT ON COLUMN public.pms_offline_policies.maximum_retry_attempts IS
  'Preferred retry cap when a runtime exists. Not a queue.';
COMMENT ON COLUMN public.pms_offline_policies.conflict_policy IS
  'Intended conflict strategy. Not a conflict resolver.';
COMMENT ON COLUMN public.pms_offline_policies.failed_event_policy IS
  'Intended failed-event handling. Not an offline operation log.';
COMMENT ON COLUMN public.pms_offline_policies.financial_offline_policy IS
  'forbidden or cash_pending_only. External gateway success cannot be stored as an offline success state.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_offline_policies TO authenticated;
GRANT ALL ON public.pms_offline_policies TO service_role;
ALTER TABLE public.pms_offline_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read offline policies" ON public.pms_offline_policies;
CREATE POLICY "Members read offline policies" ON public.pms_offline_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert offline policies" ON public.pms_offline_policies;
CREATE POLICY "Managers insert offline policies" ON public.pms_offline_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update offline policies" ON public.pms_offline_policies;
CREATE POLICY "Managers update offline policies" ON public.pms_offline_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete offline policies" ON public.pms_offline_policies;
CREATE POLICY "Managers delete offline policies" ON public.pms_offline_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_offline_policies_updated_at ON public.pms_offline_policies;
CREATE TRIGGER set_pms_offline_policies_updated_at
  BEFORE UPDATE ON public.pms_offline_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tenant-scoped capability policy rows. Approved keys only.
CREATE TABLE IF NOT EXISTS public.pms_offline_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  policy_state text NOT NULL DEFAULT 'unavailable',
  sync_priority integer NOT NULL DEFAULT 3,
  controlled_financial boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_offline_capabilities_unique UNIQUE (restaurant_id, capability_key),
  CONSTRAINT pms_offline_capabilities_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_offline_capabilities_policy_fk
    FOREIGN KEY (restaurant_id) REFERENCES public.pms_offline_policies(restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_offline_capabilities_key_check CHECK (
    capability_key IN (
      'front_office',
      'reservations',
      'room_status',
      'housekeeping',
      'guest_profile',
      'cashiering_controlled',
      'basic_payments_controlled'
    )
  ),
  CONSTRAINT pms_offline_capabilities_state_check CHECK (
    policy_state IN ('unavailable', 'policy_configured')
  ),
  CONSTRAINT pms_offline_capabilities_no_runtime_supported CHECK (
    policy_state <> 'runtime_supported'
  ),
  CONSTRAINT pms_offline_capabilities_priority_check CHECK (
    sync_priority IN (1, 2, 3)
  ),
  CONSTRAINT pms_offline_capabilities_financial_flag_check CHECK (
    (
      capability_key IN ('cashiering_controlled', 'basic_payments_controlled')
      AND controlled_financial = true
    )
    OR (
      capability_key NOT IN ('cashiering_controlled', 'basic_payments_controlled')
      AND controlled_financial = false
    )
  )
);

CREATE INDEX IF NOT EXISTS pms_offline_capabilities_restaurant_idx
  ON public.pms_offline_capabilities(restaurant_id, capability_key);

COMMENT ON TABLE public.pms_offline_capabilities IS
  'Card 8 tenant offline capability policy. policy_configured is not runtime-supported. Not a device capability matrix.';
COMMENT ON COLUMN public.pms_offline_capabilities.capability_key IS
  'Approved later-safe functions only. Gateway, OTA, night audit, device and encryption keys are excluded.';
COMMENT ON COLUMN public.pms_offline_capabilities.policy_state IS
  'unavailable or policy_configured. runtime_supported is not a legal value.';
COMMENT ON COLUMN public.pms_offline_capabilities.sync_priority IS
  '1 = highest, 3 = lowest. Intent only; not a sync scheduler.';
COMMENT ON COLUMN public.pms_offline_capabilities.controlled_financial IS
  'Required true for cashiering_controlled and basic_payments_controlled. Does not authorise gateway capture.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_offline_capabilities TO authenticated;
GRANT ALL ON public.pms_offline_capabilities TO service_role;
ALTER TABLE public.pms_offline_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read offline capabilities" ON public.pms_offline_capabilities;
CREATE POLICY "Members read offline capabilities" ON public.pms_offline_capabilities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert offline capabilities" ON public.pms_offline_capabilities;
CREATE POLICY "Managers insert offline capabilities" ON public.pms_offline_capabilities
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update offline capabilities" ON public.pms_offline_capabilities;
CREATE POLICY "Managers update offline capabilities" ON public.pms_offline_capabilities
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete offline capabilities" ON public.pms_offline_capabilities;
CREATE POLICY "Managers delete offline capabilities" ON public.pms_offline_capabilities
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_offline_capabilities_updated_at ON public.pms_offline_capabilities;
CREATE TRIGGER set_pms_offline_capabilities_updated_at
  BEFORE UPDATE ON public.pms_offline_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
