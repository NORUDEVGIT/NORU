ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_token_hash text;

CREATE INDEX IF NOT EXISTS orders_guest_token_hash_idx ON public.orders (guest_token_hash) WHERE guest_token_hash IS NOT NULL;

-- The hash must never leave the server: revoke column access from every
-- browser-facing role. Server code uses the service role, which bypasses this.
REVOKE SELECT (guest_token_hash) ON public.orders FROM anon, authenticated;
REVOKE UPDATE (guest_token_hash) ON public.orders FROM anon, authenticated;

COMMENT ON COLUMN public.orders.guest_token_hash IS 'SHA-256 hash of the one-time guest tracking token. Raw token is returned once to the ordering browser and never stored.';