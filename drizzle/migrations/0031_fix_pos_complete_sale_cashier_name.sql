CREATE OR REPLACE FUNCTION public.pos_complete_sale(
  _restaurant_id uuid,
  _sale_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _subtotal numeric(12,2);
  _tax numeric(12,2);
  _discount numeric(12,2);
  _total numeric(12,2);
  _paid numeric(12,2);
  _number bigint;
  _name text;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status <> 'open' THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;
  IF _sale.shift_id IS NULL THEN RAISE EXCEPTION 'POS_SHIFT_REQUIRED'; END IF;

  PERFORM 1 FROM public.pos_cashier_shifts
    WHERE id = _sale.shift_id AND restaurant_id = _restaurant_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SHIFT_NOT_OPEN'; END IF;

  SELECT COALESCE(SUM(line_subtotal), 0), COALESCE(SUM(tax_amount), 0),
         COALESCE(SUM(discount_amount), 0), COALESCE(SUM(line_total), 0)
    INTO _subtotal, _tax, _discount, _total
    FROM public.pos_sale_items WHERE sale_id = _sale_id;

  IF _total <= 0 THEN RAISE EXCEPTION 'POS_SALE_EMPTY'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.pos_payments
    WHERE sale_id = _sale_id AND status = 'captured';
  IF _paid + 0.001 < _total THEN RAISE EXCEPTION 'POS_PAYMENT_INSUFFICIENT'; END IF;

  INSERT INTO public.pos_sale_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 1)
    ON CONFLICT (restaurant_id) DO UPDATE
      SET last_number = public.pos_sale_counters.last_number + 1, updated_at = now()
    RETURNING last_number INTO _number;

  SELECT NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
    INTO _name
    FROM public.restaurant_users ru
    LEFT JOIN public.profiles p ON p.id = ru.user_id
    WHERE ru.id = _membership_id;

  UPDATE public.pos_sales SET
    status = 'completed',
    subtotal = _subtotal,
    discount_amount = _discount,
    tax_amount = _tax,
    total = _total,
    sale_number = _number,
    sale_reference = 'POS-' || lpad(_number::text, 6, '0'),
    completed_at = now(),
    completed_by_membership_id = _membership_id,
    cashier_name_snapshot = COALESCE(_sale.cashier_name_snapshot, _name)
  WHERE id = _sale_id AND restaurant_id = _restaurant_id AND status = 'open'
  RETURNING * INTO _sale;

  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;

  UPDATE public.pos_payments SET shift_id = COALESCE(shift_id, _sale.shift_id)
    WHERE sale_id = _sale_id AND restaurant_id = _restaurant_id;

  RETURN _sale;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) TO service_role;