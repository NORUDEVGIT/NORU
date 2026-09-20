-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 3: Notification Events.
-- Sequential after 0090. Dual-lane copies live in
--   supabase/migrations/0091_pms_card4_notification_events.sql
--   drizzle/migrations/0091_pms_card4_notification_events.sql
--
-- Event configuration only. SET5 notification catalogues stay untouched.

CREATE TABLE IF NOT EXISTS public.pms_communication_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  module text NOT NULL,
  category text NOT NULL,
  description text DEFAULT '',
  default_channel_type text NOT NULL DEFAULT 'email',
  default_template_id uuid,
  active boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_communication_notification_events_code_unique
    UNIQUE (restaurant_id, code),
  CONSTRAINT pms_communication_notification_events_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_notification_events_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_communication_notification_events_code_check CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_communication_notification_events_module_check CHECK (
    module IN (
      'reservations',
      'front_office',
      'guest_services',
      'housekeeping',
      'payments',
      'feedback'
    )
  ),
  CONSTRAINT pms_communication_notification_events_category_check CHECK (
    category IN ('reservation', 'pre_arrival', 'stay', 'departure', 'internal')
  ),
  CONSTRAINT pms_communication_notification_events_description_check CHECK (
    description IS NULL OR length(description) <= 500
  ),
  CONSTRAINT pms_communication_notification_events_channel_check CHECK (
    default_channel_type IN ('email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app')
  ),
  CONSTRAINT pms_communication_notification_events_template_tenant_fk
    FOREIGN KEY (default_template_id, restaurant_id)
    REFERENCES public.pms_communication_templates(id, restaurant_id)
    ON DELETE SET NULL (default_template_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_communication_notification_events_name_unique
  ON public.pms_communication_notification_events(restaurant_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS pms_communication_notification_events_restaurant_idx
  ON public.pms_communication_notification_events(restaurant_id, module, active);

COMMENT ON TABLE public.pms_communication_notification_events IS
  'Card 4 property notification-event configuration. Not a delivery engine or SET5 catalogue.';

INSERT INTO public.pms_communication_notification_events (
  restaurant_id,
  name,
  code,
  module,
  category,
  default_channel_type,
  default_template_id,
  active,
  is_system
)
SELECT
  restaurant.id,
  defaults.name,
  defaults.code,
  defaults.module,
  defaults.category,
  'email',
  NULL,
  false,
  true
FROM public.restaurants AS restaurant
CROSS JOIN (
  VALUES
    ('Reservation Confirmed', 'reservation_confirmed', 'reservations', 'reservation'),
    ('Reservation Modified', 'reservation_modified', 'reservations', 'reservation'),
    ('Reservation Cancelled', 'reservation_cancelled', 'reservations', 'reservation'),
    ('Pre-Arrival Reminder', 'pre_arrival', 'front_office', 'pre_arrival'),
    ('VIP Arrival', 'vip_arrival', 'front_office', 'stay'),
    ('Room Ready', 'room_ready', 'housekeeping', 'stay'),
    ('Room Not Ready', 'room_not_ready', 'housekeeping', 'stay'),
    ('Guest Request Created', 'guest_request_created', 'guest_services', 'stay'),
    ('Service Overdue', 'service_overdue', 'guest_services', 'stay'),
    ('Payment Received', 'payment_received', 'payments', 'stay'),
    ('Checkout Completed', 'checkout_completed', 'front_office', 'departure'),
    ('Guest Feedback Received', 'guest_feedback_received', 'feedback', 'departure')
) AS defaults(name, code, module, category)
ON CONFLICT (restaurant_id, code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_pms_card4_system_notification_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'System notification events cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system AND (
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.module IS DISTINCT FROM OLD.module OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.is_system IS DISTINCT FROM OLD.is_system
  ) THEN
    RAISE EXCEPTION 'System notification event identity cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_pms_card4_system_notification_event
  ON public.pms_communication_notification_events;
CREATE TRIGGER protect_pms_card4_system_notification_event
  BEFORE UPDATE OR DELETE ON public.pms_communication_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_pms_card4_system_notification_event();

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pms_communication_notification_events TO authenticated;
GRANT ALL ON public.pms_communication_notification_events TO service_role;
ALTER TABLE public.pms_communication_notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication notification events"
  ON public.pms_communication_notification_events;
CREATE POLICY "Members read communication notification events"
  ON public.pms_communication_notification_events
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication notification events"
  ON public.pms_communication_notification_events;
CREATE POLICY "Managers insert communication notification events"
  ON public.pms_communication_notification_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication notification events"
  ON public.pms_communication_notification_events;
CREATE POLICY "Managers update communication notification events"
  ON public.pms_communication_notification_events
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication notification events"
  ON public.pms_communication_notification_events;
CREATE POLICY "Managers delete communication notification events"
  ON public.pms_communication_notification_events
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_notification_events_updated_at
  ON public.pms_communication_notification_events;
CREATE TRIGGER set_pms_communication_notification_events_updated_at
  BEFORE UPDATE ON public.pms_communication_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
