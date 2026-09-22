-- Guest Profile Services workspace — operational writes on guest_service_history.
-- Dual-lane with drizzle/migrations/0089_pms_guest_services_workspace.sql.
-- Catalogue remains Card 4 pms_guest_service_types. No second request table.

CREATE TABLE IF NOT EXISTS public.guest_service_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_service_counters TO authenticated;
GRANT ALL ON public.guest_service_counters TO service_role;
ALTER TABLE public.guest_service_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest service counters" ON public.guest_service_counters;
CREATE POLICY "Managers read guest service counters" ON public.guest_service_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

ALTER TABLE public.guest_service_history
  ADD COLUMN IF NOT EXISTS request_number text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS preferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_membership_id uuid REFERENCES public.restaurant_users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.guest_service_history
  DROP CONSTRAINT IF EXISTS guest_service_history_priority_check;
ALTER TABLE public.guest_service_history
  ADD CONSTRAINT guest_service_history_priority_check CHECK (
    priority IN ('normal', 'high', 'urgent')
  );

ALTER TABLE public.guest_service_history
  DROP CONSTRAINT IF EXISTS guest_service_history_request_number_unique;
ALTER TABLE public.guest_service_history
  ADD CONSTRAINT guest_service_history_request_number_unique UNIQUE (restaurant_id, request_number);

COMMENT ON COLUMN public.guest_service_history.request_number IS
  'Property-scoped display id for a guest service request. Not a stay number.';
COMMENT ON COLUMN public.guest_service_history.priority IS
  'Operational request priority. Not a Settings catalogue.';
COMMENT ON COLUMN public.guest_service_history.preferred_at IS
  'Guest-requested time. Availability is not guaranteed.';
COMMENT ON COLUMN public.guest_service_history.assigned_membership_id IS
  'Optional assigned restaurant_users membership. Card 4 department assignment is not live.';

CREATE OR REPLACE FUNCTION public.next_guest_service_number(_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number bigint;
BEGIN
  INSERT INTO public.guest_service_counters (restaurant_id, last_number, updated_at)
  VALUES (_restaurant_id, 1, now())
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_number = public.guest_service_counters.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO next_number;
  RETURN 'GS-' || lpad(next_number::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_guest_service_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_guest_service_number(uuid) TO service_role;

WITH numbered AS (
  SELECT
    id,
    restaurant_id,
    row_number() OVER (PARTITION BY restaurant_id ORDER BY requested_at, id) AS n
  FROM public.guest_service_history
  WHERE request_number IS NULL
)
UPDATE public.guest_service_history g
SET request_number = 'GS-' || lpad(numbered.n::text, 6, '0')
FROM numbered
WHERE g.id = numbered.id;

INSERT INTO public.guest_service_counters (restaurant_id, last_number, updated_at)
SELECT restaurant_id, count(*)::bigint, now()
FROM public.guest_service_history
GROUP BY restaurant_id
ON CONFLICT (restaurant_id) DO UPDATE
  SET last_number = GREATEST(public.guest_service_counters.last_number, EXCLUDED.last_number),
      updated_at = now();

ALTER TABLE public.guest_profile_history
  DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
ALTER TABLE public.guest_profile_history
  ADD CONSTRAINT guest_profile_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'vip_changed',
      'status_changed',
      'preference_updated',
      'note_added',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_updated',
      'document_deleted',
      'merged_from',
      'merged_into',
      'consent_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'unmerged',
      'unmerge_blocked',
      'restriction_set',
      'restriction_cleared',
      'restriction_lifted',
      'photo_updated',
      'service_request_created',
      'service_request_updated'
    )
  );
