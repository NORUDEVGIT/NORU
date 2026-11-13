-- Individual guest profiles store a free-text employer or company name.
-- Company master records keep their own catalogue fields.

alter table public.guest_profiles
  add column if not exists employer_name text;

comment on column public.guest_profiles.employer_name is
  'Free-text company or employer name entered on an individual guest profile.';
