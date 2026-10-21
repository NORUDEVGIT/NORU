-- Property-scoped record of sensitive PMS report print and Excel export.
-- Stores the operation, not the report rows. Passport, phone, email, and
-- guest-row payloads are rejected at the snapshot check.
-- Do not apply from an agent until this file is reviewed with the app change.

CREATE TABLE IF NOT EXISTS public.pms_report_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  report_code text NOT NULL,
  action text NOT NULL,
  membership_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filters_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_access_events_membership_fk
    FOREIGN KEY (membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_report_access_events_action_check
    CHECK (action IN ('print', 'excel_export')),
  CONSTRAINT pms_report_access_events_report_code_check
    CHECK (report_code ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT pms_report_access_events_row_count_check
    CHECK (row_count >= 0),
  CONSTRAINT pms_report_access_events_snapshot_object_check
    CHECK (jsonb_typeof(filters_snapshot) = 'object'),
  CONSTRAINT pms_report_access_events_snapshot_privacy_check
    CHECK (
      NOT (
        filters_snapshot ?| ARRAY[
          'idDocumentNumber',
          'id_document_number',
          'phone',
          'email',
          'rows',
          'guestName',
          'guest_name',
          'passport',
          'nationalId',
          'national_id'
        ]
      )
    )
);

COMMENT ON TABLE public.pms_report_access_events IS
  'Who printed or exported a PMS report, for which property, with which filters and row count. Report rows are not stored.';

CREATE INDEX IF NOT EXISTS pms_report_access_events_property_created_idx
  ON public.pms_report_access_events (restaurant_id, created_at DESC);

ALTER TABLE public.pms_report_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own or managed report access events"
  ON public.pms_report_access_events;
CREATE POLICY "Read own or managed report access events"
  ON public.pms_report_access_events
  FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR membership_id IN (
      SELECT ru.id
      FROM public.restaurant_users ru
      WHERE ru.user_id = auth.uid()
        AND ru.restaurant_id = pms_report_access_events.restaurant_id
        AND ru.active
    )
  );

DROP POLICY IF EXISTS "Front office inserts own report access events"
  ON public.pms_report_access_events;
CREATE POLICY "Front office inserts own report access events"
  ON public.pms_report_access_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_restaurant_role(
      restaurant_id,
      ARRAY['owner', 'manager', 'receptionist']
    )
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
    AND membership_id IN (
      SELECT ru.id
      FROM public.restaurant_users ru
      WHERE ru.user_id = auth.uid()
        AND ru.restaurant_id = pms_report_access_events.restaurant_id
        AND ru.active
    )
  );

REVOKE ALL ON public.pms_report_access_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.pms_report_access_events TO authenticated;
GRANT ALL ON public.pms_report_access_events TO service_role;
