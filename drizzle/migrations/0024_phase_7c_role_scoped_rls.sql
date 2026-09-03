CREATE OR REPLACE FUNCTION public.has_any_restaurant_role(_restaurant_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = _restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.active
      AND ru.role = ANY(_roles)
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_any_restaurant_role(uuid, text[]) TO authenticated;

-- Front office (receptionist) reads
CREATE POLICY "Front office read reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert reservations" ON public.hotel_reservations FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update reservations" ON public.hotel_reservations FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office read reservation history" ON public.hotel_reservation_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office read reservation counters" ON public.hotel_reservation_counters FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Front office read guests" ON public.guest_profiles FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier']));
CREATE POLICY "Front office insert guests" ON public.guest_profiles FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update guests" ON public.guest_profiles FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office read guest preferences" ON public.guest_preferences FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office read guest history" ON public.guest_profile_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Front office read rate plans" ON public.hotel_rate_plans FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));
CREATE POLICY "Front office read rate categories" ON public.hotel_rate_categories FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));
CREATE POLICY "Front office read rate calendar" ON public.hotel_rate_calendar FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));
CREATE POLICY "Front office read rate restrictions" ON public.hotel_rate_restrictions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));

-- Cashiering / accounting reads
CREATE POLICY "Cashiers read folios" ON public.guest_folios FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Cashiers read folio transactions" ON public.folio_transactions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Cashiers read folio history" ON public.folio_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Cashiers read folio counters" ON public.guest_folio_counters FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Cashiers read cashier shifts" ON public.cashier_shifts FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Cashiers read reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Accountants read night audit runs" ON public.night_audit_runs FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Accountants read night audit exceptions" ON public.night_audit_exceptions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

-- Housekeeping roles
CREATE POLICY "Housekeeping read tasks" ON public.housekeeping_tasks FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));
CREATE POLICY "Housekeeping update tasks" ON public.housekeeping_tasks FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));
CREATE POLICY "Housekeeping insert tasks" ON public.housekeeping_tasks FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));
CREATE POLICY "Housekeeping read inspections" ON public.housekeeping_inspections FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));
CREATE POLICY "Housekeeping read discrepancies" ON public.housekeeping_discrepancies FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));
CREATE POLICY "Housekeeping read history" ON public.housekeeping_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));
CREATE POLICY "Housekeeping read maintenance" ON public.housekeeping_maintenance_requests FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor','maintenance']));
CREATE POLICY "Housekeeping update maintenance" ON public.housekeeping_maintenance_requests FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor','maintenance']));
CREATE POLICY "Housekeeping read hk reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));
