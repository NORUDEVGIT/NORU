-- P6-STEP-01 — Rate shopping foundation + competitor setup.
-- Dual-lane with drizzle/migrations/0108_pms_rate_shopping_foundation.sql.
-- Does not edit 0016, 0070, 0071, or 0104–0107.
-- Does not replace stay pricing RPCs.
-- Does not reuse outbound distribution mappings as competitor identity.
-- Rate-plan mapping table stays deferred until provider metadata exists.
-- Does not seed providers, competitors, or fake observations.
-- Live ingestion stays deferred until a licensed inbound provider exists.

CREATE TABLE public.hotel_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  location_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_competitors_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_competitors_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);

COMMENT ON TABLE public.hotel_competitors IS
  'Property-owned competitor master for future rate shopping. Setup only. No rank, tier, score, or market position.';

CREATE INDEX hotel_competitors_restaurant_idx
  ON public.hotel_competitors (restaurant_id, active, updated_at DESC);

CREATE TABLE public.hotel_competitor_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL,
  provider text NOT NULL,
  external_property_id text NOT NULL,
  external_property_name text,
  active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_competitor_provider_mappings_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_competitor_provider_mappings_competitor_fk
    FOREIGN KEY (competitor_id, restaurant_id)
    REFERENCES public.hotel_competitors (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_competitor_provider_mappings_provider_check CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  CONSTRAINT hotel_competitor_provider_mappings_external_id_check CHECK (length(btrim(external_property_id)) BETWEEN 1 AND 160),
  CONSTRAINT hotel_competitor_provider_mappings_competitor_provider_unique UNIQUE (competitor_id, provider),
  CONSTRAINT hotel_competitor_provider_mappings_provider_property_unique UNIQUE (restaurant_id, provider, external_property_id)
);

COMMENT ON TABLE public.hotel_competitor_provider_mappings IS
  'Generic inbound provider identity for a competitor. Provider is free text. Not outbound distribution_* mappings. No connection status.';

CREATE INDEX hotel_competitor_provider_mappings_competitor_idx
  ON public.hotel_competitor_provider_mappings (restaurant_id, competitor_id, active);

CREATE TABLE public.hotel_competitor_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL,
  provider text NOT NULL,
  our_room_type_id uuid NOT NULL,
  external_room_id text NOT NULL,
  external_room_name text,
  active boolean NOT NULL DEFAULT true,
  mapping_status text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_competitor_room_mappings_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_competitor_room_mappings_competitor_fk
    FOREIGN KEY (competitor_id, restaurant_id)
    REFERENCES public.hotel_competitors (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_competitor_room_mappings_room_type_fk
    FOREIGN KEY (our_room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id),
  CONSTRAINT hotel_competitor_room_mappings_provider_check CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  CONSTRAINT hotel_competitor_room_mappings_external_id_check CHECK (length(btrim(external_room_id)) BETWEEN 1 AND 160),
  CONSTRAINT hotel_competitor_room_mappings_status_check CHECK (mapping_status = 'manual'),
  CONSTRAINT hotel_competitor_room_mappings_exact_unique UNIQUE (
    competitor_id,
    provider,
    our_room_type_id,
    external_room_id
  )
);

COMMENT ON TABLE public.hotel_competitor_room_mappings IS
  'Manual mapping of a NORU room type to a competitor external room. Multiple external variants are allowed. No auto-match.';

CREATE INDEX hotel_competitor_room_mappings_competitor_idx
  ON public.hotel_competitor_room_mappings (restaurant_id, competitor_id, active);

CREATE TABLE public.hotel_rate_shopping_fetch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  requested_stay_from date NOT NULL,
  requested_stay_to date NOT NULL,
  competitor_count integer NOT NULL DEFAULT 0,
  observation_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_shopping_fetch_runs_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_shopping_fetch_runs_provider_check CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  CONSTRAINT hotel_rate_shopping_fetch_runs_status_check CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT hotel_rate_shopping_fetch_runs_stay_check CHECK (requested_stay_to >= requested_stay_from),
  CONSTRAINT hotel_rate_shopping_fetch_runs_counts_check CHECK (
    competitor_count >= 0
    AND observation_count >= 0
    AND error_count >= 0
  ),
  CONSTRAINT hotel_rate_shopping_fetch_runs_finished_check CHECK (
    finished_at IS NULL OR finished_at >= started_at
  )
);

COMMENT ON TABLE public.hotel_rate_shopping_fetch_runs IS
  'Inbound fetch-run ledger for a future licensed provider. No scheduler, cron, or production seed runs.';

CREATE INDEX hotel_rate_shopping_fetch_runs_restaurant_idx
  ON public.hotel_rate_shopping_fetch_runs (restaurant_id, started_at DESC);

CREATE TABLE public.hotel_competitor_rate_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL,
  provider text NOT NULL,
  provider_property_id text NOT NULL,
  fetch_run_id uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  stay_date date NOT NULL,
  external_room_id text,
  external_room_name text,
  external_rate_plan_id text,
  external_rate_plan_name text,
  occupancy_adults integer,
  occupancy_children integer,
  currency text,
  rate_amount numeric(12,2),
  tax_basis text NOT NULL DEFAULT 'unknown',
  availability_status text NOT NULL DEFAULT 'unknown',
  source_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_competitor_rate_observations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_competitor_rate_observations_competitor_fk
    FOREIGN KEY (competitor_id, restaurant_id)
    REFERENCES public.hotel_competitors (id, restaurant_id),
  CONSTRAINT hotel_competitor_rate_observations_fetch_run_fk
    FOREIGN KEY (fetch_run_id, restaurant_id)
    REFERENCES public.hotel_rate_shopping_fetch_runs (id, restaurant_id),
  CONSTRAINT hotel_competitor_rate_observations_provider_check CHECK (length(btrim(provider)) BETWEEN 1 AND 80),
  CONSTRAINT hotel_competitor_rate_observations_property_check CHECK (length(btrim(provider_property_id)) BETWEEN 1 AND 160),
  CONSTRAINT hotel_competitor_rate_observations_occupancy_check CHECK (
    (occupancy_adults IS NULL OR occupancy_adults >= 0)
    AND (occupancy_children IS NULL OR occupancy_children >= 0)
  ),
  CONSTRAINT hotel_competitor_rate_observations_rate_check CHECK (rate_amount IS NULL OR rate_amount >= 0),
  CONSTRAINT hotel_competitor_rate_observations_tax_check CHECK (tax_basis IN ('inclusive', 'exclusive', 'unknown')),
  CONSTRAINT hotel_competitor_rate_observations_availability_check CHECK (availability_status IN (
    'available',
    'sold_out',
    'not_returned',
    'unmapped',
    'unknown'
  )),
  CONSTRAINT hotel_competitor_rate_observations_currency_check CHECK (
    currency IS NULL OR length(btrim(currency)) = 3
  )
);

COMMENT ON TABLE public.hotel_competitor_rate_observations IS
  'Append-only inbound competitor rate observations. Source currency only. No FX. No ranking. UPDATE and DELETE are blocked.';

CREATE UNIQUE INDEX hotel_competitor_rate_observations_source_hash_idx
  ON public.hotel_competitor_rate_observations (restaurant_id, source_hash)
  WHERE source_hash IS NOT NULL;

CREATE INDEX hotel_competitor_rate_observations_stay_idx
  ON public.hotel_competitor_rate_observations (restaurant_id, competitor_id, stay_date, observed_at DESC);

CREATE INDEX hotel_competitor_rate_observations_run_idx
  ON public.hotel_competitor_rate_observations (fetch_run_id);

GRANT SELECT ON public.hotel_competitors TO authenticated;
GRANT SELECT ON public.hotel_competitor_provider_mappings TO authenticated;
GRANT SELECT ON public.hotel_competitor_room_mappings TO authenticated;
GRANT SELECT ON public.hotel_rate_shopping_fetch_runs TO authenticated;
GRANT SELECT ON public.hotel_competitor_rate_observations TO authenticated;

GRANT ALL ON public.hotel_competitors TO service_role;
GRANT ALL ON public.hotel_competitor_provider_mappings TO service_role;
GRANT ALL ON public.hotel_competitor_room_mappings TO service_role;
GRANT ALL ON public.hotel_rate_shopping_fetch_runs TO service_role;
GRANT ALL ON public.hotel_competitor_rate_observations TO service_role;

ALTER TABLE public.hotel_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_competitor_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_competitor_room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_rate_shopping_fetch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_competitor_rate_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read hotel competitors" ON public.hotel_competitors
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read competitor provider mappings" ON public.hotel_competitor_provider_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read competitor room mappings" ON public.hotel_competitor_room_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate shopping fetch runs" ON public.hotel_rate_shopping_fetch_runs
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read competitor rate observations" ON public.hotel_competitor_rate_observations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_competitors_updated_at
  BEFORE UPDATE ON public.hotel_competitors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_competitor_provider_mappings_updated_at
  BEFORE UPDATE ON public.hotel_competitor_provider_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_competitor_room_mappings_updated_at
  BEFORE UPDATE ON public.hotel_competitor_room_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_hotel_competitor_rate_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RATE_SHOPPING_OBSERVATION_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_competitor_rate_observations_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_competitor_rate_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_competitor_rate_observation_mutation();
