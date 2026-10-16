-- Public website leads. Request Demo and Contact submissions.
-- No anon or authenticated policies. Inserts and admin reads go through the
-- service role after server validation and requirePlatformAdmin where required.
-- These rows are not package entitlements.
-- Dual-lane: byte-identical copies. Do not apply from an agent.

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  phone text,
  message text,
  property_type text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text,
  CONSTRAINT leads_source_check CHECK (source = ANY (ARRAY['request_demo'::text, 'contact'::text])),
  CONSTRAINT leads_property_type_check CHECK (property_type = ANY (ARRAY['Hotel'::text, 'Restaurant'::text, 'Guest House'::text, 'Resort'::text])),
  CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'closed'::text])),
  CONSTRAINT leads_name_length_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT leads_email_length_check CHECK (char_length(btrim(email)) BETWEEN 3 AND 200),
  CONSTRAINT leads_company_length_check CHECK (char_length(btrim(company)) BETWEEN 1 AND 160)
);

CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX leads_email_created_at_idx ON public.leads (email, created_at DESC);

COMMENT ON TABLE public.leads IS
  'Public Request Demo and Contact submissions. Service-role access only. Not package entitlements.';

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.leads TO service_role;
