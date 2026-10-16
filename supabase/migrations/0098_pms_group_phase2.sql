-- Group Phase 2 — reusable group templates (configuration, not group masters).
-- Dual-lane with drizzle/migrations/0098_pms_group_phase2.sql.
-- No invoice table, itinerary table, rooming table, or second group store.

CREATE TABLE IF NOT EXISTS public.pms_group_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_templates_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT pms_group_templates_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_group_templates_restaurant_idx
  ON public.pms_group_templates(restaurant_id, active, name);

COMMENT ON TABLE public.pms_group_templates IS
  'Reusable group creation defaults. Applying a template copies payload into a new group master.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_templates TO authenticated;
GRANT ALL ON public.pms_group_templates TO service_role;
ALTER TABLE public.pms_group_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read group templates" ON public.pms_group_templates;
CREATE POLICY "Members read group templates" ON public.pms_group_templates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write group templates" ON public.pms_group_templates;
CREATE POLICY "Managers write group templates" ON public.pms_group_templates
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_group_templates_updated_at ON public.pms_group_templates;
CREATE TRIGGER set_pms_group_templates_updated_at
  BEFORE UPDATE ON public.pms_group_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.guest_account_history DROP CONSTRAINT IF EXISTS guest_account_history_event_check;
ALTER TABLE public.guest_account_history
  ADD CONSTRAINT guest_account_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'status_changed',
      'logo_updated',
      'credit_account_changed',
      'imported',
      'note_added',
      'note_updated',
      'note_archived',
      'contact_created',
      'contact_updated',
      'primary_contact_changed',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_replaced',
      'agreement_created',
      'agreement_updated',
      'commission_configured',
      'commission_calculated',
      'commission_updated',
      'allotment_changed',
      'settings_changed',
      'member_imported',
      'reservation_linked',
      'reservation_unlinked',
      'room_assigned',
      'room_changed',
      'room_unassigned',
      'auto_assignment_failed',
      'document_generated',
      'template_applied',
      'duplicated'
    )
  );
