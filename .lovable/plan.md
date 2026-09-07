# Phase 8A — Four-Package Architecture Audit (complete)

This phase was audit-only. Nothing in the database, routes, components or permissions was changed. The full report is attached as a document; this page is the decision summary and what I recommend next.

## What the audit covered

- Every route in the app (canonical, legacy redirect, public, admin)
- Every workspace and major component, plus the navigation shell
- All 59 database tables, 44 database functions and 169 access policies
- All server functions and the current permission model

## Headline findings

1. **Core is clear and safe.** Property identity, user profiles and membership sit under one shared layer that every package needs. These must never be duplicated per package.
2. **PMS is the most complete package.** 12 of the 18 hotel submodules are fully built, 2 partial, 4 foundations. It already borrows shared Inventory, Procurement, HR and Settings through a documented link-card seam.
3. **Restaurant Management is largely built** for its core capabilities (ordering, QR, tables, kitchen, menu, recipes, stock, staff, POS sales). Most expansion items (loyalty, delivery, catering, waitlist, chain management) are missing.
4. **Standalone POS cannot run on its own today.** The till reads the restaurant menu and writes restaurant orders. A separate package needs its own catalogue, sale, payment, refund and receipt model. This is the single biggest new build.
5. **Back Office does not exist as a package.** Its future contents (stock, purchasing, HR, finance, consolidated reporting) currently live inside the restaurant area and are shared with the hotel side.
6. **Highest-risk collisions:** staff records (HIGH), stock ownership (HIGH), the POS split (HIGH), three parallel reporting surfaces (MEDIUM), guest vs customer records (MEDIUM).
7. **Duplicate surfaces to resolve:** two Reports pages, two Staff/Administration pages, and a set of older hotel pages that still work but have no redirect to their new address.

## Key recommendations

- Keep one physical database. Assign each table a logical owner only; splitting schemas now would be high risk with no product benefit.
- Never create a second employee record per package — reference the shared membership instead. Separate masters would fork identity, roles and every audit trail.
- Build entitlements as a layer **above** the existing permission keys, and enforce them on the server first. The existing access helpers already reach most of the app, so this is a small, contained change.
- Leave stock and purchasing where they are for now; move ownership labels before moving anything physical.

## Proposed Phase 8B — Package Entitlement Foundation

Backend and resolver only, with no visible change to any working screen:

1. Store which of the four packages each property has enabled (Core always on).
2. One server-side resolver that combines package entitlement with the existing per-person module access.
3. Platform Admin controls to switch packages on and off per property, recorded in the existing admin audit trail.
4. No navigation, route or workspace changes — those come in Phase 8C.

## Not to be changed yet

Property and membership naming, all existing permission keys, access policies, public web addresses, working hotel submodules, stock ownership, recipe costing, and the restaurant-charge-to-room bridge.
