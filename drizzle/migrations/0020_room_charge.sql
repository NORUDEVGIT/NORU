-- Phase 7A — Restaurant charge to room. Additive only.

ALTER TABLE public.orders
  ADD COLUMN billing_method text,
  ADD COLUMN room_charge_folio_id uuid,
  ADD COLUMN room_charge_reservation_id uuid,
  ADD COLUMN room_charge_posted_at timestamptz,
  ADD COLUMN room_charge_posted_by_membership_id uuid REFERENCES public.restaurant_users(id),
  ADD CONSTRAINT orders_billing_method_check CHECK (billing_method IS NULL OR billing_method IN ('direct','room_charge')),
  ADD CONSTRAINT orders_room_charge_folio_fkey FOREIGN KEY (room_charge_folio_id) REFERENCES public.guest_folios(id),
  ADD CONSTRAINT orders_room_charge_reservation_fkey FOREIGN KEY (room_charge_reservation_id) REFERENCES public.hotel_reservations(id);

CREATE INDEX orders_room_charge_folio_idx ON public.orders(room_charge_folio_id) WHERE room_charge_folio_id IS NOT NULL;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT folio_transactions_category_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_category_check CHECK (
    category IN ('room','manual','payment','deposit','refund','adjustment','discount','future_restaurant','restaurant')
  );

CREATE UNIQUE INDEX folio_transactions_restaurant_order_once
  ON public.folio_transactions(restaurant_id, reference_type, reference_id)
  WHERE reference_type = 'restaurant_order';

-- Post a restaurant order to a guest folio. Idempotent: a second call returns
-- the existing posting untouched.
CREATE OR REPLACE FUNCTION public.post_order_room_charge(
  _restaurant_id uuid, _order_id uuid, _folio_id uuid, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  res public.hotel_reservations%ROWTYPE;
  prop_currency text;
  txn public.folio_transactions%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM public.orders
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  IF ord.room_charge_folio_id IS NOT NULL AND ord.room_charge_posted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already', true,
      'folio_id', ord.room_charge_folio_id,
      'order_id', ord.id,
      'amount', ord.total
    );
  END IF;

  IF ord.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF ord.status <> 'served' THEN RAISE EXCEPTION 'ORDER_NOT_ELIGIBLE'; END IF;
  IF ord.total IS NULL OR ord.total <= 0 THEN RAISE EXCEPTION 'ORDER_NOT_ELIGIBLE'; END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  IF folio.reservation_id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN'; END IF;

  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = folio.reservation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN'; END IF;
  IF res.status <> 'checked_in' OR res.room_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN';
  END IF;
  IF res.guest_id <> folio.guest_id THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;

  SELECT COALESCE(currency_code, 'GBP') INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;
  IF prop_currency IS DISTINCT FROM folio.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'charge', 'restaurant',
    'Restaurant Order #' || ord.order_number, ord.total,
    'restaurant_order', ord.id, _membership_id
  )
  RETURNING * INTO txn;

  UPDATE public.orders SET
    billing_method = 'room_charge',
    room_charge_folio_id = folio.id,
    room_charge_reservation_id = res.id,
    room_charge_posted_at = now(),
    room_charge_posted_by_membership_id = _membership_id,
    updated_at = now()
  WHERE id = ord.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'room_charge_posted', NULL,
    jsonb_build_object(
      'order_id', ord.id, 'order_number', ord.order_number, 'amount', ord.total,
      'reservation_id', res.id, 'room_id', res.room_id, 'guest_id', folio.guest_id,
      'transaction_id', txn.id
    ),
    'Restaurant Order #' || ord.order_number || ' charged to room.', _membership_id
  );

  RETURN jsonb_build_object(
    'already', false,
    'folio_id', folio.id,
    'order_id', ord.id,
    'transaction_id', txn.id,
    'amount', ord.total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_order_room_charge(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_order_room_charge(uuid, uuid, uuid, uuid) TO service_role;

-- Reverse a mistaken room charge with an opposite ledger entry. The original
-- transaction is never touched.
CREATE OR REPLACE FUNCTION public.reverse_order_room_charge(
  _restaurant_id uuid, _order_id uuid, _reason text, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  original public.folio_transactions%ROWTYPE;
  reversal public.folio_transactions%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED'; END IF;

  SELECT * INTO ord FROM public.orders
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF ord.room_charge_folio_id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  SELECT * INTO original FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND reference_type = 'restaurant_order' AND reference_id = ord.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND reference_type = 'restaurant_order_reversal' AND reference_id = ord.id
  ) THEN
    RAISE EXCEPTION 'CHARGE_ALREADY_REVERSED';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = ord.room_charge_folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'adjustment', 'restaurant',
    'Reversal — Restaurant Order #' || ord.order_number || ' (' || clean_reason || ')',
    -original.amount, 'restaurant_order_reversal', ord.id, _membership_id
  )
  RETURNING * INTO reversal;

  UPDATE public.orders SET
    billing_method = 'direct',
    room_charge_folio_id = NULL,
    room_charge_reservation_id = NULL,
    room_charge_posted_at = NULL,
    room_charge_posted_by_membership_id = NULL,
    updated_at = now()
  WHERE id = ord.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'room_charge_reversed',
    jsonb_build_object('transaction_id', original.id, 'amount', original.amount),
    jsonb_build_object(
      'order_id', ord.id, 'order_number', ord.order_number,
      'reversal_transaction_id', reversal.id, 'amount', reversal.amount
    ),
    clean_reason, _membership_id
  );

  RETURN jsonb_build_object('order_id', ord.id, 'reversal_transaction_id', reversal.id, 'amount', reversal.amount);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_room_charge(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_order_room_charge(uuid, uuid, text, uuid) TO service_role;