-- Company contact WhatsApp method. Dual-lane with
-- drizzle/migrations/0092_pms_guest_company_contact_whatsapp.sql.
-- Extends guest_company_contacts. Does not add a second contact table.

ALTER TABLE public.guest_company_contacts
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS whatsapp_normalized text;

COMMENT ON COLUMN public.guest_company_contacts.whatsapp IS
  'Optional WhatsApp number for a company contact person. Counted in Contact Methods KPI only when stored.';
