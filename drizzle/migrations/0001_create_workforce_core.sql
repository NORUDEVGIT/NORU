-- Shifts
CREATE TABLE public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_shifts_status_check CHECK (status IN ('scheduled','cancelled')),
  CONSTRAINT staff_shifts_time_order CHECK (end_time > start_time),
  CONSTRAINT staff_shifts_unique_slot UNIQUE (staff_membership_id, shift_date, start_time)
);

CREATE INDEX staff_shifts_restaurant_date_idx ON public.staff_shifts (restaurant_id, shift_date);
CREATE INDEX staff_shifts_membership_date_idx ON public.staff_shifts (staff_membership_id, shift_date);

GRANT SELECT ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers can view shifts"
ON public.staff_shifts FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own shifts"
ON public.staff_shifts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_shifts.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));

CREATE TRIGGER set_staff_shifts_updated_at
BEFORE UPDATE ON public.staff_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Attendance
CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'checked_in',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_attendance_status_check CHECK (status IN ('checked_in','completed','late','absent','missing_checkout')),
  CONSTRAINT staff_attendance_unique_shift_member UNIQUE (shift_id, staff_membership_id)
);

CREATE INDEX staff_attendance_shift_idx ON public.staff_attendance (shift_id);
CREATE INDEX staff_attendance_membership_idx ON public.staff_attendance (staff_membership_id);

GRANT SELECT ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers can view attendance"
ON public.staff_attendance FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own attendance"
ON public.staff_attendance FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_attendance.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));

CREATE TRIGGER set_staff_attendance_updated_at
BEFORE UPDATE ON public.staff_attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table assignments
CREATE TABLE public.staff_table_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  restaurant_table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_table_assignments_unique UNIQUE (shift_id, restaurant_table_id)
);

CREATE INDEX staff_table_assignments_shift_idx ON public.staff_table_assignments (shift_id);
CREATE INDEX staff_table_assignments_table_idx ON public.staff_table_assignments (restaurant_table_id);

GRANT SELECT ON public.staff_table_assignments TO authenticated;
GRANT ALL ON public.staff_table_assignments TO service_role;
ALTER TABLE public.staff_table_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers can view table assignments"
ON public.staff_table_assignments FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own table assignments"
ON public.staff_table_assignments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_table_assignments.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));
