-- FO-FS1 — Check-in stepper (Issue #33).
-- Do not apply to live Supabase until Abel instructs after merge.

ALTER TABLE public.guest_profiles
  ADD COLUMN IF NOT EXISTS id_document_type text,
  ADD COLUMN IF NOT EXISTS id_document_number text,
  ADD COLUMN IF NOT EXISTS id_document_expiry date;

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_id_document_type_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_id_document_type_check
  CHECK (id_document_type IS NULL OR id_document_type IN ('passport','national_id','driving_licence','other'));

CREATE TABLE IF NOT EXISTS public.fo_checkin_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  walk_in_incomplete boolean NOT NULL DEFAULT false,
  registration_snapshot jsonb,
  registration_waived boolean NOT NULL DEFAULT false,
  registration_waiver_reason text,
  registration_waived_by uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  registration_waived_at timestamptz,
  deposit_transaction_id uuid REFERENCES public.folio_transactions(id) ON DELETE SET NULL,
  deposit_amount numeric(10,2),
  deposit_method text,
  deposit_waived boolean NOT NULL DEFAULT false,
  deposit_waiver_reason text,
  deposit_waived_by uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  deposit_waived_at timestamptz,
  key_access_type text,
  key_identifier text,
  key_count integer DEFAULT 1,
  key_issued_at timestamptz,
  key_issued_by uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  key_waived boolean NOT NULL DEFAULT false,
  key_waiver_reason text,
  key_waived_by uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  key_waived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fo_checkin_progress_reservation_unique UNIQUE (reservation_id),
  CONSTRAINT fo_checkin_progress_reservation_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id),
  CONSTRAINT fo_checkin_progress_key_count_check CHECK (key_count IS NULL OR key_count >= 1)
);

CREATE INDEX IF NOT EXISTS fo_checkin_progress_restaurant_idx
  ON public.fo_checkin_progress (restaurant_id);
CREATE INDEX IF NOT EXISTS fo_checkin_progress_reservation_idx
  ON public.fo_checkin_progress (reservation_id);
CREATE INDEX IF NOT EXISTS fo_checkin_progress_walk_in_incomplete_idx
  ON public.fo_checkin_progress (restaurant_id, walk_in_incomplete)
  WHERE walk_in_incomplete = true;

GRANT SELECT, INSERT, UPDATE ON public.fo_checkin_progress TO authenticated;
GRANT ALL ON public.fo_checkin_progress TO service_role;
ALTER TABLE public.fo_checkin_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read fo checkin progress" ON public.fo_checkin_progress
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert fo checkin progress" ON public.fo_checkin_progress
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update fo checkin progress" ON public.fo_checkin_progress
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read fo checkin progress" ON public.fo_checkin_progress
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert fo checkin progress" ON public.fo_checkin_progress
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update fo checkin progress" ON public.fo_checkin_progress
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE TRIGGER set_fo_checkin_progress_updated_at BEFORE UPDATE ON public.fo_checkin_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
