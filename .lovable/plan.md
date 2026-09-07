# Phase 8B1 — Package Entitlement Backend Foundation

Backend only. Nothing on screen changes: no tiles hidden, no navigation change, no route blocking, no change to who can do what today.

## What this adds

A record of which of the four commercial packages a property has — Restaurant Management, PMS, POS, Back Office — plus one authoritative place in the code that answers "does this property have package X?".

NORU Core is not sellable and is always available to an active property member.

## Safety rule (the important part)

No property has package records today. So absence means enabled: if a property has no record for a package, the package resolves as ON. Only an explicit record can turn something off, and even then nothing is blocked in this phase — the resolver simply reports it. This makes the change impossible to lock anyone out with.

A package is enabled when there is no record (compatibility), or the record says enabled and either has no expiry or the expiry is still in the future.

## Database

One additive migration, `0027_package_entitlements`, creating `public.restaurant_package_entitlements`:

- `id` uuid PK default `gen_random_uuid()`
- `restaurant_id` uuid not null → `restaurants(id)` on delete cascade
- `package_key` text not null, CHECK in (`restaurant_management`, `pms`, `pos`, `back_office`)
- `enabled` boolean not null default true
- `activated_at`, `expires_at` timestamptz nullable
- `created_at`, `updated_at` timestamptz not null default now()
- UNIQUE (`restaurant_id`, `package_key`), index on `restaurant_id`

Grants and RLS, following the existing project pattern:

- `GRANT SELECT ON ... TO authenticated`, `GRANT ALL ... TO service_role`. No insert/update/delete grant to ordinary users.
- RLS enabled. One SELECT policy: members of that property (`public.is_restaurant_member(restaurant_id)`) may read their own property's rows. No write policies at all, so browsers cannot switch packages on or off — writes stay with the trusted server layer in Phase 8B2.
- No existing table, policy or function is touched. No rows are seeded.

Generated database types are refreshed after the migration.

## Code

`src/lib/package-entitlements.ts` (client-safe):
- `PACKAGE_KEYS` / `PackageKey` type — the single definition of the four names
- `PACKAGE_LABELS`
- `PACKAGE_MODULE_MAP` — documentation-only mapping of today's module keys to their future package owner (Restaurant Management: food_and_beverage and current POS use; PMS: pms, front_office, housekeeping, configuration, plus temporary use of reports/finance/property settings; Standalone POS: current `pos` key bound to restaurant POS until the split; Back Office: human_resources, inventory, procurement, accounting_finance). Nothing reads it for enforcement.
- Pure helpers: `isEntitlementActive(row, now)` and `resolvePackages(rows, now)` returning the four states with a `source` of `"explicit"` or `"default_compatibility"`.

`src/lib/package-entitlements.server.ts`:
- `getPropertyPackageEntitlements(client, restaurantId)` — reads rows, returns all four resolved states with source
- `propertyHasPackage(client, restaurantId, key)`
- `requirePropertyPackage(client, restaurantId, key)` — throws a plain-language error; defined now, deliberately not called anywhere yet
- `getPackageStatesForAdmin(restaurantId)` — service-role read for Phase 8B2's admin screen, keeping the explicit-vs-default distinction

`src/lib/package-entitlements.functions.ts`:
- `getMyPackageEntitlements({ restaurantId })` — authenticated; re-derives the caller's active membership with the existing `callerMembership` helper before reading, so a browser-supplied property id is never trusted; returns only the four booleans plus source.

Existing module access (`getMyModuleAccess`, `requireModuleAccess`, `requireModuleRole`) is untouched.

## Verification

- Resolver unit checks: no rows → all four true/compatibility; explicit `pms=false` → false/explicit; explicit true → true; enabled row with a past `expires_at` → false.
- Live checks against the database: an ordinary member cannot insert/update/delete an entitlement row; a member of one property reads zero rows for another property; an unauthenticated client reads nothing.
- Typecheck, production build, and a browser smoke pass over Property Home, F&B, PMS, POS, Inventory, Procurement, Staff, Reports, plus the public ordering and booking pages to confirm nothing changed.

## Deferred to 8B2

Platform Admin package controls with `admin_audit_log` entries, Property Home and navigation filtering, route blocking, server-function and RLS enforcement, and any module-level entitlement redesign.
