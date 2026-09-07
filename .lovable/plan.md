# Phase 8E3 — Transitional shared services: ownership + selective enforcement

Goal: decide who owns the shared areas (stock, purchasing, staff, reports, settings), add package checks only where ownership is beyond doubt, and write everything else down as "shared for now". Expect few code changes.

## What gets classified

Audit and record ownership for every action in: inventory + assets, purchasing + suppliers, staff/workforce, reports, accounting-facing screens, settings/configuration. Labels used: CORE, RM, PMS, BO, SHARED_TEMPORARY, LEGACY.

Current findings that shape the decisions:
- Stock items and movements are wired into restaurant recipe costing; hotel screens link to stock but never write it.
- Purchasing and suppliers are usable today by a restaurant-only property, so they cannot require a future Back Office.
- Staff runs on one identity chain (account → profile → property membership → module access). There is one staff implementation shared by the restaurant staff page and hotel Administration.
- Property settings edit tenant identity (name, contact, timezone, currency) — Core, never package-gated.
- No browser code writes to the database directly in these areas; everything already goes through server actions.

## Enforcement to add (only where certain)

1. Restaurant-only stock actions — create/update a stock item, record a stock movement (usage, waste, adjustment, count), and the restaurant stock reports/dashboard: add the restaurant-package check after the existing role check.
2. Recipe-linked costing: already covered in 8E1, verified not double-guarded.
3. Restaurant reports and the reports route: restaurant-package check on restaurant report reads; hotel report reads keep the hotel check from 8E2.
4. Purchasing, suppliers, goods receiving, purchase-order status: treated as restaurant-operational today, so they get the restaurant-package check only if the audit confirms no hotel caller. If any hotel caller exists, they stay shared and unguarded, documented as such.
5. Equipment/assets: left shared (used across departments) — no new guard.
6. Staff, membership, module access, shifts, attendance: left as Core/shared. No package guard on generic membership administration or on hotel Administration.
7. Settings and configuration: Core identity stays open; only clearly package-owned configuration inside those screens (restaurant menu/table setup, hotel room/rate setup) keeps its existing package check.

Every added check is: existing role check first, then the package check, before the first write. Wording stays as today — normal access-denied for signed-in staff, neutral unavailable for guests. No property with no package setting changes behaviour.

## Routes

No route moves. `/restaurant/reports` gains no hard guard (it hosts both worlds); the data behind each section is guarded instead. `/restaurant/settings`, `/restaurant/configuration`, `/restaurant/staff`, inventory and purchasing routes stay as they are, with reasons recorded.

## Documentation

Add `docs/architecture-ownership.md` with the ownership matrix (feature / route / function, current owner, target owner, current guard, future guard, status, risk, notes), plus lists of items deferred to later split phases and tables/functions that will need database-rule hardening later.

## Explicitly not done

No table moves or copies, no separate staff master, no payroll or ledger, no Back Office build, no POS split, no renames, no folder moves, no broad database-rule changes, no business-logic changes, no dead-code or legacy cleanup.

## Verification

Typecheck, production build, then on a real property: with no package setting everything works; with the restaurant package off the newly guarded restaurant stock/report actions reject while hotel operation continues; with the hotel package off hotel actions reject while restaurant operation continues; nothing breaks because Back Office is absent; role denial still behaves as before; a lookup failure rejects. Temporary test settings removed afterwards. Final answer covers all 25 report points.
