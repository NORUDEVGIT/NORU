# PMS documentation

Official NORU Property Management System (PMS) docs. Some pages record features that have completed a coordination cycle (Advisor → Spec → Developer → QA → Docs). Guest Profile Waves 1–3 are on `main`; Wave 4 **code is LIVE**; Wave 5 Spec is **ACCEPTED for Engineering** (implementation in progress, **not** implemented). Gap-edit 1 (Company registration enrichment) is **READY FOR ENGINEERING** (additive; does not reopen Waves 1–5). Other Functional Specs stay **WAVE-GATED** until the named wave is accepted.

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This tree does not redefine them. PMS source lives under `src/packages/pms/` per [`../code-organization.md`](../code-organization.md).

## Advisory — READY FOR PM REVIEW

| Record | Classification |
|---|---|
| [Commercial Readiness & Gap Analysis (2026-09-11)](./commercial-readiness.md) | **ADVISORY ONLY** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create backlog items, or authorise a Phase 1 Spec / issue / developer handoff. |
| [S1 + M1 Product Plan — Option A (2026-09-14)](./product-roadmap-s1-m1.md) | **PRODUCT PLAN** / **OPTION A LOCKED** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create GitHub issues, or authorise a Developer handoff from that document alone. First cycle **E-S01** remains **AWAITING PM APPROVAL**. |

The commercial-readiness record is advice from a read-only review of `main`. The Option A product plan packages that baseline into an S1 + M1 programme. Neither file is CURRENT feature documentation for each PMS area.

## Guest Profile Module — Waves 1–3 on main; Wave 4 code LIVE; Wave 5 ACCEPTED for Engineering

| Record | Classification |
|---|---|
| [Guest Profile Module — programme overview](./guests.md) | **Functional Spec / programme** — Waves 1–3 **IMPLEMENTED ON MAIN**. Wave 1: issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED. Wave 2: issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED. Wave 3: issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed · PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Wave 4 **code LIVE on `main`** (PR [#97](https://github.com/NORUDEVGIT/NORU/pull/97) MERGED; issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) **CLOSED** completed). Wave 5 Spec **ACCEPTED for Engineering** (gate OPENED; Rekik plan APPROVED 2026-09-14; issue [#98](https://github.com/NORUDEVGIT/NORU/issues/98) OPEN; implementation **IN PROGRESS** on `feature/98-guest-profile-wave-5`). Wave 5 is **not** implemented. Gap-edit 1 **READY FOR ENGINEERING** (Company registration enrichment; additive; Waves 1–5 not reopened). Module is **not** COMPLETE. |
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | **Functional Spec** — Waves 1–3 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN**. Wave 4 **code LIVE**. Wave 5 Spec **ACCEPTED for Engineering**. Gap-edit 1 **READY FOR ENGINEERING** (§8 Company registration enrichment). |

Wave 1, Wave 2, and Wave 3 engineering gates exited after Independent QA PASS (Rekik), merge, and DER. Canonical routes: `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue key `guest-profile` (`partial`). Guest Services (`guest-services`) was not repurposed. Wave 3 CURRENT: Stay History LIVE, Dashboard KPIs LIVE (honest), quick actions, guest-context naming (#87), Directory-back on guest-required cards (#90 / #88 CLOSED), empty-state Open Directory CTA (#91 / #93 CLOSED); profile History remains separate. No Wave 3 migration. RLS not weakened. Production migration `0051_pms_guest_profile_wave2` remains **held** (Abel / PM); non-prod applied. Wave 4 **code LIVE** on `main` via [#97](https://github.com/NORUDEVGIT/NORU/pull/97) — issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) **CLOSED** completed; do **not** claim unimplemented. Wave 5 Spec gate **OPENED** 2026-09-14 by Rekik via Advisor; tech plan **APPROVED**; ENGINEERING **IMPLEMENTATION IN PROGRESS** on [#98](https://github.com/NORUDEVGIT/NORU/issues/98). Do **not** claim Wave 5 implemented / PASS / LIVE / COMPLETE. Gap-edit 1 Company enrichment Spec is **READY FOR ENGINEERING** (Rekik APPROVED 2026-09-14) — additive on Wave 4 Company masters; does **not** reopen Waves 1–5; Wave 5 docs recon may still be in flight ([#102](https://github.com/NORUDEVGIT/NORU/pull/102)). Hotel UAT is still required for module COMPLETE. Migration apply still held for Abel/PM if a Wave 5 or Gap-edit 1 migration is needed.

## Surfaces documented in this cycle

| Surface | Doc |
|---|---|
| PMS Dashboard (`/restaurant/pms/dashboard` → `RoomsDashboardTab`) | [dashboard.md](./dashboard.md) |
| Guest Profile (`/restaurant/pms/guests`, `/restaurant/pms/guests/$guestId`) | [guests.md](./guests.md) — Waves 1–3 CURRENT on `main`; Wave 4 **code LIVE** (#97); Wave 5 Spec **ACCEPTED for Engineering** (implementation in progress; not implemented); Gap-edit 1 **READY FOR ENGINEERING** (Company enrichment; Waves 1–5 not reopened); module **not** COMPLETE |

Other PMS area docs (reservations, rates, housekeeping, cashiering, night audit, and the rest) will be added here as those features complete their own cycles. Absence of a file is not a claim that the surface does not exist in the product.

## This cycle

Issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15) (CLOSED) and PR [#16](https://github.com/NORUDEVGIT/NORU/pull/16) (MERGED) removed the temporary dashboard process-test control. CURRENT Dashboard is operational-only.

The earlier **process test** (issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED · PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED) is historical — not a commercial product change. QA evidence for both cycles is in [qa/test-plan.md](./qa/test-plan.md).
