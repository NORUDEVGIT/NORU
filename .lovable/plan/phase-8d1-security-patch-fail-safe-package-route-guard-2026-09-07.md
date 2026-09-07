# Phase 8D1 security patch — fail-safe package route guard

Narrow correction to the error behaviour of the authenticated package guard. No refactor of Phase 8D1, no route changes, no schema/RLS/business-logic changes.

## What changes for a user

Today, if the package check itself fails (server hiccup, session or membership lookup problem), the page opens anyway. After this patch it does not: the person lands back on Property Home with "Package access could not be verified. Please try again." A property that has never been configured keeps working exactly as before — that is a successful answer, not an error.

## Behaviour table (`src/lib/route-package-guard.ts`)

| Resolver outcome | Before | After |
| --- | --- | --- |
| enabled (explicit) | allow | allow |
| enabled (no row, compatibility default) | allow | allow |
| disabled / expired | redirect `?blocked=<key>` | unchanged |
| throw / network / auth / membership error | **allow** | redirect `?verify=failed` |

Nothing about the entitlement semantics moves: the compatibility default still lives in the existing resolver and still resolves as enabled. Only the catch branch changes.

## Implementation

`src/lib/route-package-guard.ts`
- `isAllowed()` returns a small result (`"allowed" | "blocked" | "unverified"`) instead of a bare boolean; the `catch` returns `"unverified"` instead of `true`.
- Only `"allowed"` and `"blocked"` are cached. Errors are never written to the cache, so a transient failure cannot become a cached allow, and a cached `blocked` can never be overwritten by a fallback.
- Cache key becomes `${userId}:${packageKey}`. The user id comes from the local Supabase session (`supabase.auth.getUser()`) inside the guard — no extra network round trip, and a different signed-in user or a re-linked property can never read another tenant's cached result. If the user id cannot be read, no cache entry is read or written for that call.
- `clearRoutePackageCache()` stays and is still called on sign-out from `src/components/restaurant-shell.tsx`; a defensive clear is added when the observed user id differs from the last one seen.
- `requireRoutePackage`: `"blocked"` → existing redirect to `/restaurant/home?blocked=<key>`; `"unverified"` → `redirect({ to: "/restaurant/home", search: { verify: "failed" }, replace: true })`. Property Home is never package-gated, so neither path can loop.

`src/routes/restaurant/home.tsx`
- `validateSearch` also accepts an optional `verify` value.
- The existing notice component shows the generic "Package access could not be verified. Please try again." line for `verify=failed`, keeping the current wording for `blocked`. No error text, database detail, dates or billing metadata is shown.

Authentication is untouched: unauthenticated users still hit the existing sign-in redirect before the package check runs.

## Documentation correction (no code change)

The Phase 8D1 report wording is corrected: `/restaurant/staff` and the shared Settings/Configuration routes are classified as SHARED_TEMPORARY / transitional, not NORU Core. Their guard status is unchanged.

## Verification

Typecheck, production build, and a browser pass on a test property: (A) no entitlement row → loads; (B) explicit false → blocked; (C) expired → blocked; (D) resolver forced to throw → protected route blocked with the generic notice, page never renders; (E) membership lookup failure → blocked; (F) sign out and back in → no cached result reused; (G) different user/property → no leak between tenants; (H) normal enabled package → unchanged. Test entitlement rows are removed afterwards.
