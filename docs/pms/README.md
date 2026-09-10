# PMS documentation

Official NORU Property Management System (PMS) docs for features that have completed a coordination cycle (Advisor → Spec → Developer → QA → Docs).

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This tree does not redefine them. PMS source lives under `src/packages/pms/` per [`../code-organization.md`](../code-organization.md).

## Surfaces documented in this cycle

| Surface | Doc |
|---|---|
| PMS Dashboard (`/restaurant/pms/dashboard` → `RoomsDashboardTab`) | [dashboard.md](./dashboard.md) |

Other PMS area docs (reservations, rates, housekeeping, cashiering, night audit, and the rest) will be added here as those features complete their own cycles. Absence of a file is not a claim that the surface does not exist in the product.

## This cycle

Issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) (CLOSED) and PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) (MERGED) recorded a **process test** on the dashboard — not a commercial product change. QA evidence for that cycle is in [qa/test-plan.md](./qa/test-plan.md).
