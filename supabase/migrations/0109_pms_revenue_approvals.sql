-- P7-STEP-02 — Rate & Revenue approval engine.
-- Dual-lane with drizzle/migrations/0109_pms_revenue_approvals.sql.
-- Does not edit 0101–0108. Does not replace stay pricing RPCs.
-- Does not reuse catalogue approval flags.

CREATE TABLE public.hotel_revenue_approval_policy (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hotel_revenue_approval_policy IS
  'Property-scoped Rate & Revenue approval switch. Missing row means disabled.';

CREATE TABLE public.hotel_revenue_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES public.restaurant_users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text,
  reviewed_by uuid REFERENCES public.restaurant_users(id),
  reviewed_at timestamptz,
  review_reason text,
  proposal_payload jsonb NOT NULL,
  display_snapshot jsonb,
  expected_version text,
  applied_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_revenue_approval_requests_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_revenue_approval_requests_domain_check CHECK (domain IN (
    'rate',
    'restriction',
    'promotion_activation',
    'package_activation'
  )),
  CONSTRAINT hotel_revenue_approval_requests_entity_check CHECK (entity_type IN (
    'rate_calendar',
    'rate_bulk',
    'restriction',
    'restriction_bulk',
    'promotion_activation',
    'package_activation'
  )),
  CONSTRAINT hotel_revenue_approval_requests_status_check CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  )),
  CONSTRAINT hotel_revenue_approval_requests_action_check CHECK (length(btrim(action_type)) BETWEEN 1 AND 80)
);

COMMENT ON TABLE public.hotel_revenue_approval_requests IS
  'One pending-or-terminal approval request per logical Rate & Revenue operation.';

CREATE INDEX hotel_revenue_approval_requests_status_idx
  ON public.hotel_revenue_approval_requests (restaurant_id, status, requested_at DESC);

CREATE INDEX hotel_revenue_approval_requests_domain_idx
  ON public.hotel_revenue_approval_requests (restaurant_id, domain, requested_at DESC);

CREATE INDEX hotel_revenue_approval_requests_requester_idx
  ON public.hotel_revenue_approval_requests (restaurant_id, requested_by, requested_at DESC);

CREATE INDEX hotel_revenue_approval_requests_reviewer_idx
  ON public.hotel_revenue_approval_requests (restaurant_id, reviewed_by, reviewed_at DESC);

CREATE TABLE public.hotel_revenue_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  approval_request_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  CONSTRAINT hotel_revenue_approval_events_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_revenue_approval_events_request_fk
    FOREIGN KEY (approval_request_id, restaurant_id)
    REFERENCES public.hotel_revenue_approval_requests (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_revenue_approval_events_type_check CHECK (event_type IN (
    'submitted',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  ))
);

COMMENT ON TABLE public.hotel_revenue_approval_events IS
  'Append-only Rate & Revenue approval lifecycle events. Does not replace domain history.';

CREATE INDEX hotel_revenue_approval_events_request_idx
  ON public.hotel_revenue_approval_events (restaurant_id, approval_request_id, created_at);

CREATE INDEX hotel_revenue_approval_events_created_idx
  ON public.hotel_revenue_approval_events (approval_request_id, created_at);

GRANT SELECT ON public.hotel_revenue_approval_policy TO authenticated;
GRANT SELECT ON public.hotel_revenue_approval_requests TO authenticated;
GRANT SELECT ON public.hotel_revenue_approval_events TO authenticated;

GRANT ALL ON public.hotel_revenue_approval_policy TO service_role;
GRANT ALL ON public.hotel_revenue_approval_requests TO service_role;
GRANT ALL ON public.hotel_revenue_approval_events TO service_role;

ALTER TABLE public.hotel_revenue_approval_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_revenue_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_revenue_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read revenue approval policy" ON public.hotel_revenue_approval_policy
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read revenue approval requests" ON public.hotel_revenue_approval_requests
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read revenue approval events" ON public.hotel_revenue_approval_events
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_revenue_approval_policy_updated_at
  BEFORE UPDATE ON public.hotel_revenue_approval_policy
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_revenue_approval_requests_updated_at
  BEFORE UPDATE ON public.hotel_revenue_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_hotel_revenue_approval_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'REVENUE_APPROVAL_EVENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_revenue_approval_events_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_revenue_approval_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_revenue_approval_event_mutation();

CREATE OR REPLACE FUNCTION public.enforce_hotel_revenue_approval_request_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_REQUEST_IMMUTABLE';
  END IF;
  IF NEW.proposal_payload IS DISTINCT FROM OLD.proposal_payload
     OR NEW.display_snapshot IS DISTINCT FROM OLD.display_snapshot
     OR NEW.domain IS DISTINCT FROM OLD.domain
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.expected_version IS DISTINCT FROM OLD.expected_version
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_REQUEST_IMMUTABLE';
  END IF;
  IF OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_PENDING';
  END IF;
  IF NEW.status NOT IN ('approved', 'rejected', 'cancelled', 'stale') THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_PENDING';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hotel_revenue_approval_requests_lifecycle
  BEFORE UPDATE OR DELETE ON public.hotel_revenue_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hotel_revenue_approval_request_lifecycle();

CREATE OR REPLACE FUNCTION public.count_eligible_revenue_approvers(_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM public.restaurant_users
  WHERE restaurant_id = _restaurant_id
    AND active
    AND role IN ('owner', 'manager');
$$;

CREATE OR REPLACE FUNCTION public.require_revenue_approval_manager(
  _restaurant_id uuid,
  _membership_id uuid
)
RETURNS public.restaurant_users
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  membership public.restaurant_users%ROWTYPE;
BEGIN
  SELECT * INTO membership
  FROM public.restaurant_users
  WHERE id = _membership_id
    AND restaurant_id = _restaurant_id
    AND active
    AND role IN ('owner', 'manager');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_FORBIDDEN';
  END IF;
  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_hotel_revenue_approval(
  _restaurant_id uuid,
  _membership_id uuid,
  _domain text,
  _action_type text,
  _entity_type text,
  _entity_id uuid,
  _request_reason text,
  _proposal_payload jsonb,
  _display_snapshot jsonb,
  _expected_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor public.restaurant_users%ROWTYPE;
  request_id uuid := gen_random_uuid();
BEGIN
  actor := public.require_revenue_approval_manager(_restaurant_id, _membership_id);
  IF _proposal_payload IS NULL OR jsonb_typeof(_proposal_payload) <> 'object' THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_INVALID_PROPOSAL';
  END IF;
  IF COALESCE(_proposal_payload->>'restaurantId', '') IS DISTINCT FROM _restaurant_id::text THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_WRONG_PROPERTY';
  END IF;

  INSERT INTO public.hotel_revenue_approval_requests (
    id,
    restaurant_id,
    domain,
    action_type,
    entity_type,
    entity_id,
    status,
    requested_by,
    request_reason,
    proposal_payload,
    display_snapshot,
    expected_version
  ) VALUES (
    request_id,
    _restaurant_id,
    _domain,
    _action_type,
    _entity_type,
    _entity_id,
    'pending',
    actor.id,
    NULLIF(btrim(COALESCE(_request_reason, '')), ''),
    _proposal_payload,
    _display_snapshot,
    _expected_version
  );

  INSERT INTO public.hotel_revenue_approval_events (
    restaurant_id,
    approval_request_id,
    event_type,
    actor_id,
    reason
  ) VALUES (
    _restaurant_id,
    request_id,
    'submitted',
    actor.id,
    NULLIF(btrim(COALESCE(_request_reason, '')), '')
  );

  RETURN jsonb_build_object('id', request_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_hotel_revenue_approval(
  _restaurant_id uuid,
  _request_id uuid,
  _membership_id uuid,
  _event_type text,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor public.restaurant_users%ROWTYPE;
  request public.hotel_revenue_approval_requests%ROWTYPE;
  next_status text;
  eligible integer;
BEGIN
  IF _event_type NOT IN ('cancelled', 'rejected', 'stale') THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_PENDING';
  END IF;
  actor := public.require_revenue_approval_manager(_restaurant_id, _membership_id);

  SELECT * INTO request
  FROM public.hotel_revenue_approval_requests
  WHERE id = _request_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_FOUND';
  END IF;
  IF request.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_PENDING';
  END IF;

  IF _event_type = 'cancelled' THEN
    IF request.requested_by IS DISTINCT FROM actor.id THEN
      RAISE EXCEPTION 'REVENUE_APPROVAL_CANCEL_FORBIDDEN';
    END IF;
    next_status := 'cancelled';
  ELSIF _event_type = 'rejected' THEN
    IF NULLIF(btrim(COALESCE(_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'REVENUE_APPROVAL_REVIEW_REASON_REQUIRED';
    END IF;
    eligible := public.count_eligible_revenue_approvers(_restaurant_id);
    IF eligible > 1 AND request.requested_by = actor.id THEN
      RAISE EXCEPTION 'REVENUE_APPROVAL_SELF_NOT_ALLOWED';
    END IF;
    next_status := 'rejected';
  ELSE
    next_status := 'stale';
  END IF;

  UPDATE public.hotel_revenue_approval_requests
  SET
    status = next_status,
    reviewed_by = actor.id,
    reviewed_at = now(),
    review_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
  WHERE id = request.id AND restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_revenue_approval_events (
    restaurant_id,
    approval_request_id,
    event_type,
    actor_id,
    reason
  ) VALUES (
    _restaurant_id,
    request.id,
    _event_type,
    actor.id,
    NULLIF(btrim(COALESCE(_reason, '')), '')
  );

  RETURN jsonb_build_object('id', request.id, 'status', next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_hotel_revenue_approval(
  _restaurant_id uuid,
  _request_id uuid,
  _membership_id uuid,
  _review_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor public.restaurant_users%ROWTYPE;
  request public.hotel_revenue_approval_requests%ROWTYPE;
  eligible integer;
  apply_result jsonb;
  operation_id uuid;
  apply_targets jsonb;
  apply_payload jsonb;
  stale_reason text;
BEGIN
  actor := public.require_revenue_approval_manager(_restaurant_id, _membership_id);

  SELECT * INTO request
  FROM public.hotel_revenue_approval_requests
  WHERE id = _request_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_FOUND';
  END IF;
  IF request.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_NOT_PENDING';
  END IF;

  eligible := public.count_eligible_revenue_approvers(_restaurant_id);
  IF eligible > 1 AND request.requested_by = actor.id THEN
    RAISE EXCEPTION 'REVENUE_APPROVAL_SELF_NOT_ALLOWED';
  END IF;

  BEGIN
    IF request.domain = 'rate' THEN
      operation_id := gen_random_uuid();
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'ratePlanId', t->>'ratePlanId',
          'date', t->>'date',
          'expectedVersion', COALESCE((
            SELECT e->>'expectedVersion'
            FROM jsonb_array_elements(COALESCE(request.proposal_payload->'expectedVersions', '[]'::jsonb)) e
            WHERE e->>'ratePlanId' = t->>'ratePlanId' AND e->>'date' = t->>'date'
            LIMIT 1
          ), 'absent')
        )
      ), '[]'::jsonb)
      INTO apply_targets
      FROM jsonb_array_elements(COALESCE(request.proposal_payload->'targets', '[]'::jsonb)) t;
      apply_result := public.apply_hotel_rate_changes(
        _restaurant_id,
        actor.id,
        operation_id,
        COALESCE(NULLIF(btrim(COALESCE(request.proposal_payload->>'source', '')), ''), 'rate_revenue'),
        request.proposal_payload->>'reason',
        request.proposal_payload->'rule',
        apply_targets
      );
    ELSIF request.domain = 'restriction' THEN
      operation_id := gen_random_uuid();
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'ratePlanId', t->>'ratePlanId',
          'date', t->>'date',
          'expectedVersion', COALESCE((
            SELECT e->>'expectedVersion'
            FROM jsonb_array_elements(COALESCE(request.proposal_payload->'expectedVersions', '[]'::jsonb)) e
            WHERE e->>'ratePlanId' = t->>'ratePlanId' AND e->>'date' = t->>'date'
            LIMIT 1
          ), 'absent')
        )
      ), '[]'::jsonb)
      INTO apply_targets
      FROM jsonb_array_elements(COALESCE(request.proposal_payload->'targets', '[]'::jsonb)) t;
      apply_result := public.apply_hotel_rate_restrictions(
        _restaurant_id,
        actor.id,
        operation_id,
        COALESCE(NULLIF(btrim(COALESCE(request.proposal_payload->>'source', '')), ''), 'rate_revenue'),
        request.proposal_payload->>'reason',
        request.proposal_payload->'operation',
        apply_targets
      );
    ELSIF request.domain = 'promotion_activation' THEN
      apply_payload := request.proposal_payload;
      apply_result := public.apply_hotel_promotion_activation(
        _restaurant_id,
        actor.id,
        apply_payload
      );
    ELSIF request.domain = 'package_activation' THEN
      apply_payload := request.proposal_payload;
      apply_result := public.apply_hotel_package_activation(
        _restaurant_id,
        actor.id,
        apply_payload
      );
    ELSE
      RAISE EXCEPTION 'REVENUE_APPROVAL_INVALID_PROPOSAL';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%RATE_CHANGE_STALE%'
         OR SQLERRM LIKE '%RESTRICTION_CHANGE_STALE%'
         OR SQLERRM LIKE '%COMMERCIAL_ACTIVATION_STALE%'
         OR SQLERRM LIKE '%PROMOTION_ACTIVATION_DUPLICATE%'
         OR SQLERRM LIKE '%PACKAGE_ACTIVATION_DUPLICATE%' THEN
        stale_reason := SQLERRM;
        UPDATE public.hotel_revenue_approval_requests
        SET
          status = 'stale',
          reviewed_by = actor.id,
          reviewed_at = now(),
          review_reason = stale_reason
        WHERE id = request.id AND restaurant_id = _restaurant_id;
        INSERT INTO public.hotel_revenue_approval_events (
          restaurant_id,
          approval_request_id,
          event_type,
          actor_id,
          reason,
          metadata
        ) VALUES (
          _restaurant_id,
          request.id,
          'stale',
          actor.id,
          stale_reason,
          jsonb_build_object('source', 'approve_revalidate')
        );
        RETURN jsonb_build_object(
          'status', 'stale',
          'reason', stale_reason,
          'id', request.id
        );
      END IF;
      RAISE;
  END;

  operation_id := COALESCE(
    NULLIF(apply_result->>'operationId', '')::uuid,
    operation_id
  );

  UPDATE public.hotel_revenue_approval_requests
  SET
    status = 'approved',
    reviewed_by = actor.id,
    reviewed_at = now(),
    review_reason = NULLIF(btrim(COALESCE(_review_reason, '')), ''),
    applied_operation_id = operation_id
  WHERE id = request.id AND restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_revenue_approval_events (
    restaurant_id,
    approval_request_id,
    event_type,
    actor_id,
    reason,
    metadata
  ) VALUES (
    _restaurant_id,
    request.id,
    'approved',
    actor.id,
    NULLIF(btrim(COALESCE(_review_reason, '')), ''),
    jsonb_build_object('appliedOperationId', operation_id)
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'id', request.id,
    'appliedOperationId', operation_id,
    'applyResult', apply_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_eligible_revenue_approvers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.require_revenue_approval_manager(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_hotel_revenue_approval(uuid, uuid, text, text, text, uuid, text, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_hotel_revenue_approval(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_hotel_revenue_approval(uuid, uuid, uuid, text) TO service_role;
