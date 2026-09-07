# Phase 8E2 — PMS server mutation enforcement

Make the hotel package a real server-side boundary: when a property's PMS package is switched off or expired, no hotel action can succeed on the server, even from a stale page, a direct call, or a bookmarked address. Nothing about how the hotel side works today changes for properties that have PMS.

## Approach

Mirror exactly what Phase 8E1 did for the restaurant package: one small guard file, wired into the *existing* PMS authorization helpers rather than sprinkled across hundreds of actions. Package check is an extra layer added after the current membership/role check and before the first write — existing rules stay untouched.

New file `src/lib/pms-package.server.ts`:
- `requirePmsPackage(restaurantId)` — staff wording, normal access-denied style.
- `requirePublicPms(restaurantId)` / `publicPmsAvailable(restaurantId)` — neutral "currently unavailable" wording for guests.
- Both delegate to the existing Phase 8D2 `publicPackageAvailable(restaurantId, "pms")`: compatibility default preserved, expiry honoured, fail-closed on lookup errors, failures never cached, no entitlement details exposed.

## Where the guard is attached

Because PMS access already funnels through a handful of shared role guards, adding the check inside them covers every action in that area at once:

- `reservations.server.ts` → `requireReservationManager` — covers reservation create/amend/reprice/cancel/restore/assign/status plus Front Office actions in `frontoffice.functions.ts` that use it.
- `cashiering.server.ts` guards — folios, charges, payments, deposits, refunds, reversals, closing, cashier shifts.
- `housekeeping.server.ts` guards — tasks, assignments, room statuses, inspections, discrepancies, maintenance requests.
- `rooms.server.ts` guards — room types, rooms, availability/out-of-order changes (hotel rooms only; warehouse inventory untouched).
- `rates.server.ts` guard — rate categories, plans, calendar, restrictions.
- `guests.server.ts` guard — guest profiles, preferences, notes, history.
- `distribution.server.ts` `requireDistributionManager` — channels, mappings, enable/disable.
- `nightaudit.functions.ts` — guard before checklist/exception resolution and before business-date close begins.
- `room-charge.functions.ts` — PMS-side posting/reversal callers audited so the dual-package rule (restaurant **and** hotel) cannot be bypassed from either side; 8E1 already covers the restaurant side.
- `public-booking.functions.ts` — availability search, booking submit, booking lookup, manage/cancel each re-check availability server-side before any write, with neutral guest wording.
- PMS-owned reporting reads (occupancy/ADR/RevPAR/arrivals/cashiering/night-audit/housekeeping summaries) gated where they are direct hotel endpoints.

Deliberately **not** gated in this phase, and documented in the report: shared staff/HR scheduling, generic membership creation, global property identity, warehouse inventory, procurement, restaurant/POS paths, and anything Back Office.

## Audits included

- Every hotel SQL function/RPC listed and classified: protected by its trusted server caller, needs SQL-side hardening later, or read-only/low risk. No broad rewrite of database functions.
- Search for hotel browser code writing straight to the database; anything found is either routed through a server action if it is small and safe, or reported as a blocker for the later database-rules phase.

## Verification

Test matrix run on a real property: no entitlement row (everything still works); PMS switched off and separately expired (reservation, check-in, folio/payment, housekeeping, night-audit close all rejected); public booking page left open then PMS switched off (submit rejected); role-denied case still behaves as before; lookup failure rejects; denied actions leave no half-written reservation, folio, task or audit state; Charge to Room only works with both packages on. Plus typecheck, production build, and authenticated + public smoke tests, then all temporary test rows removed. Restaurant ordering, POS, inventory, procurement and staff flows re-checked as unaffected.

Report delivered against all 29 points, and work stops at the PMS server boundary.
