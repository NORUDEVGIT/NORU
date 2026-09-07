# Phase 8J — Database + dead-code cleanup

Remove only what is proven unused. No behaviour, ownership, route, security or schema-design changes.

## Step 1 — Full audit (no deletions)

Build a classified inventory (A safe to remove, B active, C compatibility, D transitional, E security/dependency, F needs decision) covering:

- Database from the live schema: tables, functions/RPCs, triggers, indexes, RLS policies, check constraints, storage buckets.
- Source: routes, components, workspaces, hooks, lib helpers, server functions, types, registries, guards, redirects, wrappers.
- Docs: stale statements in the three architecture notes.

Every database candidate is cross-checked against source references, RPC bodies, triggers, foreign keys, policies and row counts. Every source candidate is cross-checked for static imports, lazy imports, string/registry references and route usage.

### Early findings already confirmed

- `staff_users`: 1 row, no inbound foreign keys, no source references outside the generated types file and one historical migration. Still to verify: references inside live function bodies and policy expressions before classifying it A.
- Empty Standalone POS and entitlement tables are new and active — they stay regardless of zero rows.
- Inventory, procurement, RM, PMS, Core and POS table families are preserved as instructed.

## Step 2 — Source cleanup

Delete only A-classified files, in small batches, with a recorded reason each. Preserved without discussion: compatibility redirects (including `/restaurant/pos/new` and the legacy RM/PMS redirects), shared inventory logic, shared workforce code, the transitional `/restaurant/reports` implementation, security helpers, and active cross-package bridges. Typecheck and build after each batch.

## Step 3 — Database cleanup

Only if objects are proven dead: one narrow migration, `0032_phase8j_verified_cleanup.sql`, with a comment per object explaining the proof. It may drop verified dead tables/functions plus their own policies, triggers and indexes. No renames, no schema splits, no RLS simplification, no migration squashing. Row counts and a data classification are recorded before any drop; anything holding meaningful operational or financial data is kept.

Regenerate the database types afterwards, then typecheck and build.

## Step 4 — Verification

- Security: RLS enabled, tenant isolation, anonymous access, route/package/module guards all unchanged.
- Package matrix: each package works alone; no new hidden dependency.
- Bridges: charge to room, procurement receiving producing exactly one stock movement, Back Office till figures matching till reports, recipe costing reading stock.
- Signed-in browser pass over Core, Restaurant Management, PMS, Standalone POS and Back Office screens, plus the public ordering, scan and stay flows.
- Controlled test transactions, cleaned up afterwards.

## Step 5 — Documentation and report

Refresh the three architecture notes to match reality, keeping historical decisions. Deliver the 41-point implementation report.

## Boundaries

Stops at verified cleanup. No Phase 8K closure work, no ownership/hosting migration, no schema redesign, no new features. Anything uncertain is documented as deferred rather than deleted.
