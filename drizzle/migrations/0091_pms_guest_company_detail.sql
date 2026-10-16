-- Company Detail workspace — contacts + Card 4 contact-role catalogue.
-- Dual-lane with drizzle/migrations/0091_pms_guest_company_detail.sql.
-- No second company, guest, reservation, or link table.

CREATE TABLE IF NOT EXISTS public.pms_business_contact_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_business_contact_roles_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_business_contact_roles_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9]{1,11}$'
  ),
  CONSTRAINT pms_business_contact_roles_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS pms_business_contact_roles_restaurant_idx
  ON public.pms_business_contact_roles(restaurant_id, name);

COMMENT ON TABLE public.pms_business_contact_roles IS
  'Card 4 contact-role catalogue for company contact persons. Not guest profile types.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_business_contact_roles TO authenticated;
GRANT ALL ON public.pms_business_contact_roles TO service_role;
ALTER TABLE public.pms_business_contact_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read business contact roles" ON public.pms_business_contact_roles;
CREATE POLICY "Members read business contact roles" ON public.pms_business_contact_roles
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert business contact roles" ON public.pms_business_contact_roles;
CREATE POLICY "Managers insert business contact roles" ON public.pms_business_contact_roles
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update business contact roles" ON public.pms_business_contact_roles;
CREATE POLICY "Managers update business contact roles" ON public.pms_business_contact_roles
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete business contact roles" ON public.pms_business_contact_roles;
CREATE POLICY "Managers delete business contact roles" ON public.pms_business_contact_roles
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_business_contact_roles_updated_at ON public.pms_business_contact_roles;
CREATE TRIGGER set_pms_business_contact_roles_updated_at
  BEFORE UPDATE ON public.pms_business_contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  company_master_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  position text,
  department_id uuid REFERENCES public.pms_departments(id) ON DELETE SET NULL,
  phone text,
  email text,
  phone_normalized text,
  email_normalized text,
  photo_storage_path text,
  status text NOT NULL DEFAULT 'active',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_company_contacts_company_same_property FOREIGN KEY (company_master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id),
  CONSTRAINT guest_company_contacts_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT guest_company_contacts_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS guest_company_contacts_company_idx
  ON public.guest_company_contacts(restaurant_id, company_master_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS guest_company_contacts_one_primary
  ON public.guest_company_contacts(company_master_id)
  WHERE is_primary;

COMMENT ON TABLE public.guest_company_contacts IS
  'Operational contact persons for a Guest Company master. One primary contact per company.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_company_contacts TO authenticated;
GRANT ALL ON public.guest_company_contacts TO service_role;
ALTER TABLE public.guest_company_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read company contacts" ON public.guest_company_contacts;
CREATE POLICY "Managers read company contacts" ON public.guest_company_contacts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert company contacts" ON public.guest_company_contacts;
CREATE POLICY "Managers insert company contacts" ON public.guest_company_contacts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update company contacts" ON public.guest_company_contacts;
CREATE POLICY "Managers update company contacts" ON public.guest_company_contacts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete company contacts" ON public.guest_company_contacts;
CREATE POLICY "Managers delete company contacts" ON public.guest_company_contacts
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_guest_company_contacts_updated_at ON public.guest_company_contacts;
CREATE TRIGGER set_guest_company_contacts_updated_at
  BEFORE UPDATE ON public.guest_company_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_company_contact_roles (
  contact_id uuid NOT NULL REFERENCES public.guest_company_contacts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.pms_business_contact_roles(id) ON DELETE RESTRICT,
  PRIMARY KEY (contact_id, role_id)
);

CREATE INDEX IF NOT EXISTS guest_company_contact_roles_role_idx
  ON public.guest_company_contact_roles(role_id);

COMMENT ON TABLE public.guest_company_contact_roles IS
  'Assigned Card 4 contact roles. Inactive roles stay readable on existing contacts.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_company_contact_roles TO authenticated;
GRANT ALL ON public.guest_company_contact_roles TO service_role;
ALTER TABLE public.guest_company_contact_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read company contact roles" ON public.guest_company_contact_roles;
CREATE POLICY "Managers read company contact roles" ON public.guest_company_contact_roles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.guest_company_contacts c
      WHERE c.id = contact_id
        AND (public.has_restaurant_role(c.restaurant_id, 'owner') OR public.has_restaurant_role(c.restaurant_id, 'manager'))
    )
  );
DROP POLICY IF EXISTS "Managers write company contact roles" ON public.guest_company_contact_roles;
CREATE POLICY "Managers write company contact roles" ON public.guest_company_contact_roles
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.guest_company_contacts c
      WHERE c.id = contact_id
        AND (public.has_restaurant_role(c.restaurant_id, 'owner') OR public.has_restaurant_role(c.restaurant_id, 'manager'))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.guest_company_contacts c
      WHERE c.id = contact_id
        AND (public.has_restaurant_role(c.restaurant_id, 'owner') OR public.has_restaurant_role(c.restaurant_id, 'manager'))
    )
  );

ALTER TABLE public.guest_account_history DROP CONSTRAINT IF EXISTS guest_account_history_event_check;
ALTER TABLE public.guest_account_history
  ADD CONSTRAINT guest_account_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'status_changed',
      'logo_updated',
      'credit_account_changed',
      'imported',
      'note_added',
      'contact_created',
      'contact_updated',
      'primary_contact_changed'
    )
  );
