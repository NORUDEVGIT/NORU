-- Issue #20 — Restaurant Management till-native shift close / EOD cash-up.
--
-- Additive only. Extends public.close_cashier_shift so RM close recomputes
-- expected_cash at confirm (opening + cash payments − cash refunds for THIS
-- shift id), persists closing_cash + expected_cash, and records variance on
-- folio_history.new_values. Already-closed shifts are rejected.
--
-- Does NOT create, alter, or write Standalone POS pos_* / pos_cashier_shifts.
-- Does NOT change package entitlements or tenant approval.
-- Does NOT add night audit / Z-report behaviour.
-- PMS Cashiering still calls this same RPC; extra persisted fields are additive
-- (restaurant order_payments / order_refunds cash only — hotel folio cash is
-- unchanged and was never part of cashier_shifts.expected_cash).
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0037_rm_shift_close.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   Restore public.close_cashier_shift from drizzle/migrations/0017_create_cashiering.sql
--   (status/closed_at/closing_cash/notes + folio_history without expected/variance).
--   No columns were added by this migration.

CREATE OR REPLACE FUNCTION public.close_cashier_shift(
  _restaurant_id uuid, _shift_id uuid, _closing_cash numeric, _notes text, _membership_id uuid
) RETURNS cashier_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.cashier_shifts%ROWTYPE;
  _cash_in numeric(12,2);
  _cash_out numeric(12,2);
  _expected numeric(12,2);
  _variance numeric(12,2);
BEGIN
  IF _closing_cash IS NULL OR _closing_cash < 0 THEN
    RAISE EXCEPTION 'INVALID_CLOSING_CASH';
  END IF;

  SELECT * INTO shift FROM public.cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  IF shift.status = 'closed' THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED';
  END IF;

  -- Recompute at close. Do not trust a stale cashier_shifts.expected_cash.
  SELECT coalesce(sum(amount), 0) INTO _cash_in
    FROM public.order_payments
    WHERE cashier_shift_id = shift.id
      AND restaurant_id = _restaurant_id
      AND method = 'cash';
  SELECT coalesce(sum(amount), 0) INTO _cash_out
    FROM public.order_refunds
    WHERE cashier_shift_id = shift.id
      AND restaurant_id = _restaurant_id
      AND method = 'cash';

  _expected := round(coalesce(shift.opening_cash, 0) + _cash_in - _cash_out, 2);
  _variance := round(_closing_cash - _expected, 2);

  UPDATE public.cashier_shifts
  SET status = 'closed',
      closed_at = now(),
      closing_cash = _closing_cash,
      expected_cash = _expected,
      notes = COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = shift.id
  RETURNING * INTO shift;

  INSERT INTO public.folio_history (
    restaurant_id, cashier_shift_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'cashier_shift_closed',
    jsonb_build_object('status', 'open'),
    jsonb_build_object(
      'status', 'closed',
      'closing_cash', _closing_cash,
      'expected_cash', _expected,
      'cash_payments', _cash_in,
      'cash_refunds', _cash_out,
      'variance', _variance
    ),
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    _membership_id
  );

  RETURN shift;
END;
$$;
