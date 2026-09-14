# PMS documentation

Official NORU Property Management System (PMS) docs. Some pages record features that have completed a coordination cycle (Advisor → Spec → Developer → QA → Docs). Guest Profile Waves 1–4 are on `main` and OPERATIONALLY ACCEPTED. Wave 5 gate is **OPENED** and engineering is **IN PROGRESS** on [#98](https://github.com/NORUDEVGIT/NORU/issues/98) — Wave 5 is **not** implemented; the module is **not** COMPLETE.

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This tree does not redefine them. PMS source lives under `src/packages/pms/` per [`../code-organization.md`](../code-organization.md).

## Advisory — READY FOR PM REVIEW

| Record | Classification |
|---|---|
| [Commercial Readiness & Gap Analysis (2026-09-11)](./commercial-readiness.md) | **ADVISORY ONLY** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create backlog items, or authorise a Phase 1 Spec / issue / developer handoff. |
| [S1 + M1 Product Plan — Option A (2026-09-14)](./product-roadmap-s1-m1.md) | **PRODUCT PLAN** / **OPTION A LOCKED** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create GitHub issues, or authorise a Developer handoff from that document alone. First cycle **E-S01** remains **AWAITING PM APPROVAL**. |

The commercial-readiness record is advice from a read-only review of `main`. The Option A product plan packages that baseline into an S1 + M1 programme. Neither file is CURRENT feature documentation for each PMS area.

## Guest Profile Module — Waves 1–4 on main; Wave 5 gate OPENED / IN PROGRESS (#98)

| Record | Classification |
|---|---|
| [Guest Profile Module — programme overview](./guests.md) | **Functional Spec / programme** — Waves 1–4 **IMPLEMENTED ON MAIN**. Wave 1: issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED. Wave 2: issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED. Wave 3: issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed · PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Wave 4: Spec [#96](https://github.com/NORUDEVGIT/NORU/pull/96) MERGED · PR [#97](https://github.com/NORUDEVGIT/NORU/pull/97) MERGED · issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) **CLOSED** completed 2026-09-14T13:53:12Z. Wave 4 is OPERATIONALLY ACCEPTED / closed. IMPLEMENTATION STATUS **PASS** (AC-W4-5 **PARTIAL** residual). Wave 5 gate **OPENED**; engineering **IN PROGRESS** on [#98](https://github.com/NORUDEVGIT/NORU/issues/98) — **not** implemented. Module is **not** COMPLETE. |
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | **Functional Spec** — Waves 1–4 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN**. Wave 5 gate **OPENED** / Eng **IN PROGRESS** on #98 — **not** implemented. |

Wave 1–4 engineering gates exited after Independent QA PASS (Rekik), merge, and DER. Canonical routes: `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue key `guest-profile` (`partial`). Guest Services (`guest-services`) was not repurposed. Wave 4 CURRENT: Company / Group / TA masters LIVE; Relationships LIVE (employer / bill-to / booker TA / group member); Loyalty & Value LIVE (real-derived only); profile-type switcher LIVE. Residual AC-W4-5: create-reservation does not take master IDs (attach on reservation detail); FO typed labels stay labels. Non-prod migration `0053_pms_guest_profile_wave4` **APPLY PASS** on `qcwptraosaudcbjasmul` (`20260914134631`); production 0053 **Abel-gated NOT applied**. Production `0051` remains held. RLS not weakened. Wave 5 gate **OPENED**; engineering **IN PROGRESS** on [#98](https://github.com/NORUDEVGIT/NORU/issues/98) — Wave 5 is **not** implemented. Hotel UAT is still required for module COMPLETE.

## Surfaces documented in this cycle

| Surface | Doc |
|---|---|
| PMS Dashboard (`/restaurant/pms/dashboard` → `RoomsDashboardTab`) | [dashboard.md](./dashboard.md) |
| Guest Profile (`/restaurant/pms/guests`, `/restaurant/pms/guests/$guestId`) | [guests.md](./guests.md) — Waves 1–4 CURRENT on `main`; Wave 5 gate OPENED / IN PROGRESS (#98), not implemented; module **not** COMPLETE |

Other PMS area docs (reservations, rates, housekeeping, cashiering, night audit, and the rest) will be added here as those features complete their own cycles. Absence of a file is not a claim that the surface does not exist in the product.

## This cycle

Issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15) (CLOSED) and PR [#16](https://github.com/NORUDEVGIT/NORU/pull/16) (MERGED) removed the temporary dashboard process-test control. CURRENT Dashboard is operational-only.

The earlier **process test** (issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED · PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED) is historical — not a commercial product change. QA evidence for both cycles is in [qa/test-plan.md](./qa/test-plan.md).
