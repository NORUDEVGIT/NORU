-- Cashiering Phase 12 — derived exceptions and report totals (read models only).
-- Dual-lane with supabase/migrations/0131_cashiering_phase12_exceptions_reports.sql.
-- No fake resolved flags. Reports sum canonical folio_transactions.

CREATE OR REPLACE FUNCTION public.list_cashiering_exceptions(
  _restaurant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unsettled jsonb;
  drawer_var jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kind', 'unsettled_checkout',
    'folio_id', gf.id,
    'folio_number', gf.folio_number,
    'balance', COALESCE(round(sum(ft.amount), 2), 0),
    'exception_kind', gf.settlement_exception_kind,
    'reason', gf.settlement_exception_reason,
    'at', gf.settlement_exception_at
  )), '[]'::jsonb) INTO unsettled
  FROM public.guest_folios gf
  LEFT JOIN public.folio_transactions ft ON ft.folio_id = gf.id
  WHERE gf.restaurant_id = _restaurant_id
    AND gf.status = 'open'
    AND gf.settlement_exception = 'unsettled_checkout'
  GROUP BY gf.id, gf.folio_number, gf.settlement_exception_kind,
           gf.settlement_exception_reason, gf.settlement_exception_at;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kind', 'drawer_variance',
    'shift_id', hs.id,
    'membership_id', hs.membership_id,
    'variance', (public.hotel_drawer_figures(_restaurant_id, hs.id)->>'variance')::numeric,
    'expected', (public.hotel_drawer_figures(_restaurant_id, hs.id)->>'expected')::numeric,
    'closed_at', hs.closed_at
  )), '[]'::jsonb) INTO drawer_var
  FROM public.hotel_cashier_shifts hs
  WHERE hs.restaurant_id = _restaurant_id
    AND hs.status = 'closed'
    AND hs.closed_at >= (now() - interval '7 days')
    AND abs((public.hotel_drawer_figures(_restaurant_id, hs.id)->>'variance')::numeric) >= 0.01;

  RETURN jsonb_build_object(
    'unsettled_checkouts', unsettled,
    'drawer_variances', drawer_var
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cashiering_report_totals(
  _restaurant_id uuid,
  _from timestamptz,
  _to timestamptz
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'charges', COALESCE(round(sum(amount) FILTER (WHERE transaction_type = 'charge'), 2), 0),
    'payments', COALESCE(round(-sum(amount) FILTER (WHERE transaction_type = 'payment'), 2), 0),
    'deposits', COALESCE(round(-sum(amount) FILTER (WHERE transaction_type = 'deposit'), 2), 0),
    'refunds', COALESCE(round(sum(amount) FILTER (WHERE transaction_type = 'refund'), 2), 0),
    'adjustments', COALESCE(round(sum(amount) FILTER (WHERE transaction_type = 'adjustment'), 2), 0),
    'discounts', COALESCE(round(-sum(amount) FILTER (WHERE transaction_type = 'discount'), 2), 0),
    'transfers_out', COALESCE(round(-sum(amount) FILTER (WHERE transaction_type = 'transfer_out'), 2), 0),
    'transfers_in', COALESCE(round(sum(amount) FILTER (WHERE transaction_type = 'transfer_in'), 2), 0),
    'line_count', count(*)
  )
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND posted_at >= _from
    AND posted_at <= _to;
$$;

GRANT EXECUTE ON FUNCTION public.list_cashiering_exceptions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cashiering_report_totals(uuid, timestamptz, timestamptz) TO authenticated, service_role;
