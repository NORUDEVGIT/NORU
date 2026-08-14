# placeOrder security review (report only — no changes made)

## 1. Where the privileged client runs
Server-side only. `placeOrder` is a TanStack Start server function; its handler executes in the app's backend runtime (Cloudflare Worker), never in the browser. The privileged client is loaded *inside* the handler via `await import("@/integrations/supabase/client.server")`, and `client.server.ts` is excluded from client bundles by the build's server-only rule.

Verified: the module the browser actually downloads for `src/lib/orders.functions.ts` contains only RPC stubs —
```text
export const placeOrder = createServerFn({method:"POST"}).handler(createClientRpc("<id>"))
```
No Supabase client, no key, no handler body.

## 2. Service-role key exposure
- Not in any React/frontend file — the only references are in `src/integrations/supabase/client.server.ts`, read as `process.env['SUPABASE_SERVICE_ROLE_KEY']` inside a function.
- Not in any `VITE_` variable. `.env` contains only project id, URL, and the publishable key (`sb_publishable_...`), which is safe to ship.
- Not sent to the browser and not present in the client bundle (confirmed above).
- Not exposed in client network requests: the browser only POSTs to the server-function RPC endpoint; the Supabase call with the secret key happens server→Supabase.

Caveat: in the dev server the inline sourcemap still carries the original file text (normal Vite behaviour, dev only) — it contains no secret value, only the variable name.

## 3. File that handles placeOrder
`src/lib/orders.functions.ts` → exported `placeOrder` server function (POST). Privileged client: `src/integrations/supabase/client.server.ts`. Caller: `src/state/order-store.tsx` → used by `src/routes/review.tsx`.

## 4. Where the key is stored
As a backend environment variable `SUPABASE_SERVICE_ROLE_KEY`, injected into the server runtime by Lovable Cloud. It is not in the repo's `.env`, not in git, and not readable from the browser.

## 5. Browser access
Confirmed. The customer browser calls only the server-function endpoint with `{ tableNumber, lines }`. It has no service-role key and cannot reach Supabase with elevated rights; direct browser Supabase calls use the publishable key under RLS.

## 6. Server-side validation — current status

Enforced today (Zod `inputValidator`, runs before the handler):
- table number: required, integer, positive
- cart not empty: `lines` array, min 1
- quantities: integer, positive
- item name required; price must be a non-negative number
- `menu_item_id` only stored when it matches a UUID shape, else null

NOT enforced today (real gaps):
- Prices are trusted from the browser. `total` is recomputed server-side, but from client-supplied `price` values, so a crafted request can create an order at any price.
- Menu items are not verified against `menu_items`: no check that the id exists, that the name matches, or that `available = true`.
- No upper bounds on quantity, line count, or special-instructions length.
- The endpoint is public and unauthenticated with no rate limiting (expected for guest ordering, but worth noting).

## Recommended hardening (not implemented — awaiting your go-ahead)
1. In the `placeOrder` handler, fetch the referenced `menu_items` rows server-side and build every line from the database row: authoritative `price`, `item_name`, and `available = true` check. Reject unknown/unavailable ids.
2. Compute `total` only from those database prices; ignore the browser's `price` entirely.
3. Add sane caps: quantity <= 20, lines <= 50, special instructions <= 500 chars.
4. Decide the fallback rule for the mock/local menu items that have no database row — either block them or keep a server-side price table for them.

Nothing in the codebase is changed until you approve.
