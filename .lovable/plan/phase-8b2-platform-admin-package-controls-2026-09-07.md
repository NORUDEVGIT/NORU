# Phase 8B2 — Platform Admin Package Controls

Give NORU Platform Admin one place to switch the four commercial packages on or off per property, with every change recorded in the existing admin audit trail. Nothing a tenant sees or can do changes in this phase.

## What gets added

A new **Package entitlements** section on the existing property review page in the admin area (below Actions, above Audit history). For each of the four packages — Restaurant Management, PMS, Standalone POS, Back Office — it shows:

- the package name and whether it is currently on or off
- where that state comes from: "Compatibility default" (never configured) or "Explicit entitlement" (an admin set it)
- when it was last activated, and any expiry date
- an Enable / Disable control, plus an optional expiry date-time field with a Clear option

Merely opening the page never creates a record — a property with no configuration keeps showing "Compatibility default" until an admin actually changes something.

## Safety and wording

- Turning a package off asks for confirmation and says plainly that it prepares the package to become unavailable once enforcement is switched on later; it does not claim the tenant loses access today.
- Turning a package on does not claim it grants any staff member permission — staff permissions stay a separate control, and the section says so in one line.
- Expiry must be in the future when set; a past or invalid value is rejected with a clear message. An entitlement whose expiry has passed already resolves as off through the existing resolver.
- "Reset to compatibility default" is included as a separate, clearly-labelled action distinct from Disable, since removing the record is what returns a package to the untouched state.

## Activation timing

`activated_at` records the most recent time the package was switched on. Enabling sets it, re-enabling after a disable refreshes it, disabling leaves the previous value in place. It is a record only — it never decides access.

## Technical notes

- New `src/lib/package-entitlements.functions.ts` additions: `getPackageEntitlementsAdmin({ restaurantId })` and `setPropertyPackageEntitlement({ restaurantId, packageKey, enabled, expiresAt })`, plus `clearPropertyPackageEntitlement({ restaurantId, packageKey })` for the reset action. All use `createServerFn` + `requireSupabaseAuth` + `requirePlatformAdmin(context)` from `src/lib/admin-authz.ts`, with Zod validation of the UUID, the package key against `PACKAGE_KEYS`, and the ISO expiry.
- The mutation flow: authorize → confirm the restaurant exists via `supabaseAdmin` → read the previous row → upsert on the `(restaurant_id, package_key)` unique constraint → insert an `admin_audit_log` row → return the recomputed `PackageState` from the existing resolver.
- Audit rows reuse the current convention (`admin_user_id`, `action`, `restaurant_id`, `reason`, `metadata`), with actions `package_entitlement_enabled` / `_disabled` / `_reset` and metadata carrying package key, previous and new enabled state, previous and new expiry, and previous source.
- All writes are service-role inside the handler (`await import("@/integrations/supabase/client.server")`). No browser write path, no new RLS policy, no grant change — `authenticated` stays read-only on the table.
- UI lives in a new `src/components/admin/package-entitlements-panel.tsx` rendered by `src/routes/admin/restaurants/$restaurantId.tsx`, following the existing card/confirm-step pattern on that page.

## Explicitly not in this phase

No Property Home filtering, no navigation gating, no route blocking, no package checks inside business server functions or RLS, no changes to `staff_module_access`, no POS/HR/Inventory split, no Back Office build, no file moves or module-key renames. Setting PMS to off will make the resolver return false while PMS keeps working exactly as it does today — enforcement arrives in Phase 8C.

## Verification

Admin can enable Restaurant Management, disable PMS, set a POS expiry and clear a Back Office expiry; an ordinary owner and an ordinary manager are both rejected by the mutation; a user of one property cannot alter another's; invalid package keys, unknown properties and past expiries are all refused; every successful change appears in the audit log. Then typecheck, production build, an admin browser pass and a tenant pass over Property Home, PMS, F&B, POS, Inventory, Staff, Reports and the public ordering and booking pages to confirm nothing tenant-facing moved.
