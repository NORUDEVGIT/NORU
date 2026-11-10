-- Guest profile operational print & list CSV (not privacy JSON export).

INSERT INTO public.pms_permissions (
  code,
  module,
  function,
  action,
  name,
  description,
  sensitive,
  active
)
VALUES (
  'guest.profile.print',
  'guest',
  'profile',
  'print',
  'Print & Export Lists',
  'Print a guest profile sheet and download guest or stay lists as CSV.',
  false,
  true
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = true;
