-- Night Audit warning review lifecycle.
-- An auditor acknowledges non-blocking warnings before business date closure.
-- Review does not mutate the source condition, which remains active.
-- If the source condition clears, the review is invalidated.
-- If the warning recurs, a fresh review is required.

CREATE TABLE public.night_audit_warning_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  night_audit_run_id uuid NOT NULL REFERENCES public.night_audit_runs(id) ON DELETE CASCADE,
  exception_id uuid NOT NULL REFERENCES public.night_audit_exceptions(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  reviewed_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  invalidated_at timestamptz NULL,
  invalidated_reason text NULL
);

CREATE INDEX night_audit_warning_reviews_run_idx
  ON public.night_audit_warning_reviews (night_audit_run_id, reviewed_at);

CREATE UNIQUE INDEX night_audit_warning_reviews_active_exception_idx
  ON public.night_audit_warning_reviews (exception_id)
  WHERE invalidated_at IS NULL;

ALTER TABLE public.night_audit_warning_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized staff read night audit warning reviews"
  ON public.night_audit_warning_reviews
  FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'cashier')
  );

GRANT SELECT ON public.night_audit_warning_reviews TO authenticated;
GRANT ALL ON public.night_audit_warning_reviews TO service_role;
