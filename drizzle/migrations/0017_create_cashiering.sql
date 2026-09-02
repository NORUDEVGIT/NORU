-- Phase 6H — Cashiering & Guest Folios. Tenant-scoped, owner/manager only.

ALTER TABLE public.restaurant_users
  ADD CONSTRAINT restaurant_users_id_restaurant_unique UNIQUE (id, restaurant_id);

CREATE TABLE public.guest_folio_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_folio_counters TO authenticated;
GRANT ALL ON public.guest_folio_counters TO service_role;
ALTER TABLE public.guest_folio_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read folio counters" ON public.guest_folio_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TABLE public.guest_folios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  reservation_id uuid,
  folio_number text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  currency text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folios_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_folios_number_unique UNIQUE (restaurant_id, folio_number),
  CONSTRAINT guest_folios_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT guest_folios_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT guest_folios_reservation_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id)
);

CREATE UNIQUE INDEX guest_folios_one_per_reservation
  ON public.guest_folios(restaurant_id, reservation_id)
  WHERE reservation_id IS NOT NULL;
CREATE INDEX guest_folios_status_idx ON public.guest_folios(restaurant_id, status);

GRANT SELECT, INSERT, UPDATE ON public.guest_folios TO authenticated;
GRANT ALL ON public.guest_folios TO service_role;
ALTER TABLE public.guest_folios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read folios" ON public.guest_folios
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert folios" ON public.guest_folios
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update folios" ON public.guest_folios
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_guest_folios_updated_at BEFORE UPDATE ON public.guest_folios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable ledger: no UPDATE/DELETE policies, ever.
CREATE TABLE public.folio_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid NOT NULL,
  transaction_type text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  posted_by_membership_id uuid REFERENCES public.restaurant_users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folio_transactions_type_check CHECK (
    transaction_type IN ('charge','payment','deposit','refund','adjustment','discount')
  ),
  CONSTRAINT folio_transactions_category_check CHECK (
    category IN ('room','manual','payment','deposit','refund','adjustment','discount','future_restaurant')
  ),
  CONSTRAINT folio_transactions_amount_check CHECK (amount <> 0),
  CONSTRAINT folio_transactions_folio_same_property FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id)
);

CREATE INDEX folio_transactions_folio_idx ON public.folio_transactions(folio_id, posted_at);
CREATE INDEX folio_transactions_property_date_idx ON public.folio_transactions(restaurant_id, posted_at);
CREATE UNIQUE INDEX folio_transactions_room_charge_once
  ON public.folio_transactions(restaurant_id, reference_type, reference_id)
  WHERE reference_type = 'reservation_room_charge';

GRANT SELECT, INSERT ON public.folio_transactions TO authenticated;
GRANT ALL ON public.folio_transactions TO service_role;
ALTER TABLE public.folio_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read folio transactions" ON public.folio_transactions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TABLE public.cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric(12,2),
  closing_cash numeric(12,2),
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashier_shifts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT cashier_shifts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT cashier_shifts_membership_same_property FOREIGN KEY (membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id)
);

CREATE UNIQUE INDEX cashier_shifts_one_open
  ON public.cashier_shifts(restaurant_id, membership_id)
  WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE ON public.cashier_shifts TO authenticated;
GRANT ALL ON public.cashier_shifts TO service_role;
ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read cashier shifts" ON public.cashier_shifts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert cashier shifts" ON public.cashier_shifts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update cashier shifts" ON public.cashier_shifts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

-- Append-only financial audit trail.
CREATE TABLE public.folio_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid,
  cashier_shift_id uuid,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folio_history_event_check CHECK (event_type IN (
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received','deposit_received',
    'refund_posted','adjustment_posted','discount_posted','folio_closed',
    'cashier_shift_opened','cashier_shift_closed'
  )),
  CONSTRAINT folio_history_folio_same_property FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id),
  CONSTRAINT folio_history_shift_same_property FOREIGN KEY (cashier_shift_id, restaurant_id)
    REFERENCES public.cashier_shifts(id, restaurant_id)
);

CREATE INDEX folio_history_property_idx ON public.folio_history(restaurant_id, created_at DESC);

GRANT SELECT ON public.folio_history TO authenticated;
GRANT ALL ON public.folio_history TO service_role;
ALTER TABLE public.folio_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read folio history" ON public.folio_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.folio_balance(_folio_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(amount), 0)::numeric(12,2)
  FROM public.folio_transactions WHERE folio_id = _folio_id;
$$;

CREATE OR REPLACE FUNCTION public.open_folio_for_reservation(
  _restaurant_id uuid, _reservation_id uuid, _membership_id uuid
) RETURNS guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  next_number bigint;
  prop_currency text;
  charge_amount numeric(12,2);
BEGIN
  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF res.status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_BILLABLE';
  END IF;

  SELECT currency_code INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;

  SELECT * INTO folio FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.guest_folio_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 0) ON CONFLICT (restaurant_id) DO NOTHING;

    SELECT last_number INTO next_number FROM public.guest_folio_counters
    WHERE restaurant_id = _restaurant_id FOR UPDATE;

    next_number := next_number + 1;
    UPDATE public.guest_folio_counters
    SET last_number = next_number, updated_at = now() WHERE restaurant_id = _restaurant_id;

    INSERT INTO public.guest_folios (
      restaurant_id, guest_id, reservation_id, folio_number, status, currency, created_by_membership_id
    ) VALUES (
      _restaurant_id, res.guest_id, res.id, 'FL-' || lpad(next_number::text, 6, '0'), 'open',
      COALESCE(res.currency, prop_currency, 'GBP'), _membership_id
    ) RETURNING * INTO folio;

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'folio_opened',
      jsonb_build_object('folio_number', folio.folio_number, 'reservation_id', res.id,
                         'confirmation_number', res.confirmation_number, 'currency', folio.currency),
      _membership_id
    );
  END IF;

  charge_amount := COALESCE(res.room_subtotal, 0);

  IF charge_amount > 0 AND NOT EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
  ) THEN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'charge', 'room',
      'Room charge — reservation ' || res.confirmation_number, charge_amount,
      'reservation_room_charge', res.id, _membership_id
    );

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'room_charge_posted',
      jsonb_build_object('reservation_id', res.id, 'amount', charge_amount,
                         'currency', folio.currency, 'nightly', res.nightly_rate_snapshot),
      _membership_id
    );
  END IF;

  RETURN folio;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_transaction(
  _restaurant_id uuid, _folio_id uuid, _type text, _category text,
  _description text, _amount numeric, _reference_type text, _reference_id uuid,
  _membership_id uuid
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  signed numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  settled numeric(12,2);
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
BEGIN
  IF _type NOT IN ('charge','payment','deposit','refund','adjustment','discount') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;

  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF _type = 'adjustment' THEN
    IF _amount = 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := _amount;
  ELSE
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := CASE _type
      WHEN 'charge' THEN _amount
      WHEN 'refund' THEN _amount
      ELSE -_amount
    END;
  END IF;

  IF _type = 'refund' THEN
    SELECT COALESCE(-sum(amount), 0) INTO settled
    FROM public.folio_transactions
    WHERE folio_id = folio.id AND transaction_type IN ('payment','deposit','refund');

    IF _amount > settled THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_SETTLED';
    END IF;
  END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, _type, _category, clean_desc, signed,
    _reference_type, _reference_id, _membership_id
  ) RETURNING * INTO txn;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id,
    CASE _type
      WHEN 'charge' THEN 'manual_charge_posted'
      WHEN 'payment' THEN 'payment_received'
      WHEN 'deposit' THEN 'deposit_received'
      WHEN 'refund' THEN 'refund_posted'
      WHEN 'discount' THEN 'discount_posted'
      ELSE 'adjustment_posted'
    END,
    jsonb_build_object('transaction_id', txn.id, 'amount', signed, 'category', _category,
                       'reference_type', _reference_type),
    clean_desc, _membership_id
  );

  RETURN txn;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_guest_folio(
  _restaurant_id uuid, _folio_id uuid, _membership_id uuid
) RETURNS guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  balance numeric(12,2);
BEGIN
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  IF folio.status = 'closed' THEN
    RETURN folio;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO balance
  FROM public.folio_transactions WHERE folio_id = folio.id;

  IF abs(balance) >= 0.01 THEN
    RAISE EXCEPTION 'BALANCE_NOT_ZERO';
  END IF;

  UPDATE public.guest_folios
  SET status = 'closed', closed_at = now()
  WHERE id = folio.id
  RETURNING * INTO folio;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'folio_closed',
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed', 'balance', balance),
    _membership_id
  );

  RETURN folio;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cashier_shift(
  _restaurant_id uuid, _membership_id uuid, _opening_cash numeric, _notes text
) RETURNS cashier_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.cashier_shifts%ROWTYPE;
BEGIN
  SELECT * INTO shift FROM public.cashier_shifts
  WHERE restaurant_id = _restaurant_id AND membership_id = _membership_id AND status = 'open'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_OPEN';
  END IF;

  INSERT INTO public.cashier_shifts (restaurant_id, membership_id, opening_cash, notes)
  VALUES (_restaurant_id, _membership_id, _opening_cash, NULLIF(btrim(COALESCE(_notes, '')), ''))
  RETURNING * INTO shift;

  INSERT INTO public.folio_history (
    restaurant_id, cashier_shift_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'cashier_shift_opened',
    jsonb_build_object('opening_cash', _opening_cash), _membership_id
  );

  RETURN shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cashier_shift(
  _restaurant_id uuid, _shift_id uuid, _closing_cash numeric, _notes text, _membership_id uuid
) RETURNS cashier_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.cashier_shifts%ROWTYPE;
BEGIN
  SELECT * INTO shift FROM public.cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  IF shift.status = 'closed' THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED';
  END IF;

  UPDATE public.cashier_shifts
  SET status = 'closed', closed_at = now(), closing_cash = _closing_cash,
      notes = COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = shift.id
  RETURNING * INTO shift;

  INSERT INTO public.folio_history (
    restaurant_id, cashier_shift_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'cashier_shift_closed',
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed', 'closing_cash', _closing_cash),
    _membership_id
  );

  RETURN shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation(_restaurant_id uuid, _reservation_id uuid, _room_id uuid, _membership_id uuid)
 RETURNS hotel_reservations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  target_room uuid;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.departure_date <= existing.arrival_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  target_room := COALESCE(_room_id, existing.room_id);
  IF target_room IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  PERFORM public.assert_room_assignable(
    _restaurant_id, target_room, existing.room_type_id,
    existing.arrival_date, existing.departure_date, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_id = target_room, status = 'checked_in'
  WHERE id = existing.id
  RETURNING * INTO updated;

  IF existing.room_id IS DISTINCT FROM target_room THEN
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, existing.id,
      CASE WHEN existing.room_id IS NULL THEN 'room_assigned' ELSE 'room_changed' END,
      jsonb_build_object('room_id', existing.room_id),
      jsonb_build_object('room_id', target_room),
      _membership_id
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_in',
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', 'checked_in', 'room_id', target_room),
    _membership_id
  );

  PERFORM public.open_folio_for_reservation(_restaurant_id, existing.id, _membership_id);

  RETURN updated;
END;
$function$;