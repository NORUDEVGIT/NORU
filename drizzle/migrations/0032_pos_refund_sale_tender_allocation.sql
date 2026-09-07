-- Phase 8H6 — tender-allocated refunds for Standalone POS.
--
-- Additive: the original pos_refund_sale stays in place. This version
-- requires the refund to be allocated to one of the sale's own captured
-- tenders, caps it per tender as well as per sale, and puts cash impact on
-- the shift the refund is actually processed in (never a closed historical
-- shift).
CREATE OR REPLACE FUNCTION public.pos_refund_sale_allocated(
  _restaurant_id uuid,
  _sale_id uuid,
  _payment_id uuid,
  _amount numeric,
  _reason text,
  _shift_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _payment public.pos_payments;
  _payment_refunded numeric(12,2);
  _remaining numeric(12,2);
  _new_refunded numeric(12,2);
  _status text;
  _shift public.pos_cashier_shifts;
  _use_shift uuid;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status NOT IN ('completed','partially_refunded') THEN RAISE EXCEPTION 'POS_SALE_NOT_REFUNDABLE'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'POS_INVALID_AMOUNT'; END IF;

  SELECT * INTO _payment FROM public.pos_payments
    WHERE id = _payment_id AND sale_id = _sale_id AND restaurant_id = _restaurant_id;
  IF _payment.id IS NULL OR _payment.status <> 'captured' THEN
    RAISE EXCEPTION 'POS_REFUND_PAYMENT_MISMATCH';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO _payment_refunded
    FROM public.pos_refunds WHERE payment_id = _payment_id AND restaurant_id = _restaurant_id;
  IF _amount > (_payment.amount - _payment_refunded) + 0.001 THEN
    RAISE EXCEPTION 'POS_REFUND_EXCEEDS_PAYMENT';
  END IF;

  _remaining := _sale.total - _sale.refunded_amount;
  IF _amount > _remaining + 0.001 THEN RAISE EXCEPTION 'POS_REFUND_EXCEEDS_REMAINING'; END IF;

  -- Cash leaves a real drawer: it must be the drawer open right now.
  IF _payment.payment_method = 'cash' THEN
    IF _shift_id IS NULL THEN RAISE EXCEPTION 'POS_REFUND_SHIFT_REQUIRED'; END IF;
    SELECT * INTO _shift FROM public.pos_cashier_shifts
      WHERE id = _shift_id AND restaurant_id = _restaurant_id AND status = 'open';
    IF _shift.id IS NULL THEN RAISE EXCEPTION 'POS_REFUND_SHIFT_REQUIRED'; END IF;
    _use_shift := _shift.id;
  ELSE
    _use_shift := NULL;
  END IF;

  INSERT INTO public.pos_refunds (
    restaurant_id, sale_id, payment_id, shift_id, amount, method, reason,
    authorized_by_membership_id, processed_by_membership_id
  ) VALUES (
    _restaurant_id, _sale_id, _payment_id, _use_shift, round(_amount, 2),
    _payment.payment_method, _reason, _membership_id, _membership_id
  );

  _new_refunded := round(_sale.refunded_amount + _amount, 2);
  _status := CASE WHEN _new_refunded + 0.001 >= _sale.total THEN 'refunded' ELSE 'partially_refunded' END;

  UPDATE public.pos_sales SET refunded_amount = _new_refunded, status = _status
    WHERE id = _sale_id AND restaurant_id = _restaurant_id
    RETURNING * INTO _sale;

  RETURN _sale;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid) TO service_role;
