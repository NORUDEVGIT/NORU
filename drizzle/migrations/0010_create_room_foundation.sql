-- Room types
CREATE TABLE public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  max_occupancy integer NOT NULL DEFAULT 2,
  adult_capacity integer NOT NULL DEFAULT 2,
  child_capacity integer NOT NULL DEFAULT 0,
  bed_type text,
  bed_count integer,
  room_size text,
  room_view text,
  sellable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT room_types_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT room_types_capacity_check CHECK (max_occupancy > 0 AND adult_capacity >= 0 AND child_capacity >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_types TO authenticated;
GRANT ALL ON public.room_types TO service_role;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read room types" ON public.room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers insert room types" ON public.room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update room types" ON public.room_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_room_types_updated_at BEFORE UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rooms
CREATE TABLE public.hotel_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  room_number text NOT NULL,
  floor text,
  building text,
  wing text,
  smoking boolean NOT NULL DEFAULT false,
  accessible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rooms_number_unique UNIQUE (restaurant_id, room_number),
  CONSTRAINT hotel_rooms_status_check CHECK (status IN ('available','out_of_order','out_of_service')),
  CONSTRAINT hotel_rooms_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

CREATE INDEX hotel_rooms_restaurant_idx ON public.hotel_rooms(restaurant_id);
CREATE INDEX hotel_rooms_type_idx ON public.hotel_rooms(room_type_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rooms TO authenticated;
GRANT ALL ON public.hotel_rooms TO service_role;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read rooms" ON public.hotel_rooms
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers insert rooms" ON public.hotel_rooms
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update rooms" ON public.hotel_rooms
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_rooms_updated_at BEFORE UPDATE ON public.hotel_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Amenities
CREATE TABLE public.room_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_amenities_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT room_amenities_id_restaurant_unique UNIQUE (id, restaurant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_amenities TO authenticated;
GRANT ALL ON public.room_amenities TO service_role;
ALTER TABLE public.room_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read amenities" ON public.room_amenities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write amenities" ON public.room_amenities
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TABLE public.room_type_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  amenity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_type_amenities_unique UNIQUE (room_type_id, amenity_id),
  CONSTRAINT room_type_amenities_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT room_type_amenities_amenity_fk FOREIGN KEY (amenity_id, restaurant_id)
    REFERENCES public.room_amenities(id, restaurant_id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_amenities TO authenticated;
GRANT ALL ON public.room_type_amenities TO service_role;
ALTER TABLE public.room_type_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read room type amenities" ON public.room_type_amenities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write room type amenities" ON public.room_type_amenities
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

-- Room type images (metadata only; binaries live in Storage)
CREATE TABLE public.room_type_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  alt_text text,
  uploaded_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_type_images_path_unique UNIQUE (storage_path),
  CONSTRAINT room_type_images_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX room_type_images_type_idx ON public.room_type_images(room_type_id, display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_images TO authenticated;
GRANT ALL ON public.room_type_images TO service_role;
ALTER TABLE public.room_type_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read room type images" ON public.room_type_images
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write room type images" ON public.room_type_images
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );