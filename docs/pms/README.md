# PMS documentation

Official NORU Property Management System (PMS) docs. Some pages record features that have completed a coordination cycle (Advisor → Spec → Developer → QA → Docs). Guest Profile Waves 1–5 are **IMPLEMENTED ON MAIN**. Wave 5 is **OPERATIONALLY ACCEPTED** / engineering exited. Gap-edit 1 (Company registration enrichment) is **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed. Gap-edit 2 Spec is **Eng-ready** / ENGINEERING **IN PROGRESS** (Independent QA **HELD** until staged-create; **not** implemented). Programme is **READY FOR HOTEL UAT**. Module COMPLETE remains **NO**. Other Functional Specs stay **WAVE-GATED** until the named wave is accepted.

Package boundaries, route ownership, and shared-service rules live in [`../architecture-ownership.md`](../architecture-ownership.md). This tree does not redefine them. PMS source lives under `src/packages/pms/` per [`../code-organization.md`](../code-organization.md).

## Advisory — READY FOR PM REVIEW

| Record | Classification |
|---|---|
| [Commercial Readiness & Gap Analysis (2026-09-11)](./commercial-readiness.md) | **ADVISORY ONLY** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create backlog items, or authorise a Phase 1 Spec / issue / developer handoff. |
| [S1 + M1 Product Plan — Option A (2026-09-14)](./product-roadmap-s1-m1.md) | **PRODUCT PLAN** / **OPTION A LOCKED** — **READY FOR PM REVIEW**. Not an engineering Spec. Does not approve development, create GitHub issues, or authorise a Developer handoff from that document alone. First cycle **E-S01** remains **AWAITING PM APPROVAL**. |

The commercial-readiness record is advice from a read-only review of `main`. The Option A product plan packages that baseline into an S1 + M1 programme. Neither file is CURRENT feature documentation for each PMS area.

## Guest Profile Module — Waves 1–5 IMPLEMENTED ON MAIN

| Record | Classification |
|---|---|
| [Guest Profile Module — programme overview](./guests.md) | **Functional Spec / programme** — Waves 1–5 **IMPLEMENTED ON MAIN**. Wave 1: issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED. Wave 2: issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED. Wave 3: issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed · PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Wave 4 **code LIVE on `main`** (PR [#97](https://github.com/NORUDEVGIT/NORU/pull/97) MERGED; issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) **CLOSED** completed). Wave 5 **IMPLEMENTED ON MAIN** (PR [#101](https://github.com/NORUDEVGIT/NORU/pull/101) MERGED 2026-09-14T14:22:35Z; issue [#98](https://github.com/NORUDEVGIT/NORU/issues/98) **CLOSED** completed — Rekik formal closure YES). ENGINEERING STATUS **COMPLETE / MERGED** (eng exited). **OPERATIONALLY ACCEPTED**. Gap-edit 1 **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed (PR [#105](https://github.com/NORUDEVGIT/NORU/pull/105) MERGED 2026-09-14T18:55:43Z; issue [#103](https://github.com/NORUDEVGIT/NORU/issues/103) **CLOSED** completed 2026-09-14T22:43:40Z). Gap-edit 2 Spec **Eng-ready** / ENGINEERING **IN PROGRESS** (Independent QA **HELD** until staged-create; **not** implemented). Programme **READY FOR HOTEL UAT**. Module COMPLETE remains **NO**. |
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | **Functional Spec** — Waves 1–5 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN**. Gap-edit 1 §8 **IMPLEMENTED ON MAIN** — ENGINEERING STATUS **COMPLETE / MERGED**; **OPERATIONALLY ACCEPTED** / closed. Gap-edit 2 (**§9**) **Eng-ready** (Rekik HOLD 2026-09-15 — staged-create); ENGINEERING **IMPLEMENTATION IN PROGRESS** on [#109](https://github.com/NORUDEVGIT/NORU/issues/109) / PR [#111](https://github.com/NORUDEVGIT/NORU/pull/111). Independent QA **HELD** until staged-create (Linking **AC-GE2-9…13**, Identity **AC-GE2-14**). **Not** implemented / PASS / LIVE / COMPLETE. Does **not** reopen Waves 1–5 or Gap-edit 1. Migration `0057` Abel/PM gated (0056 is Polish Wave 1). Module COMPLETE remains **NO**. |

Wave 1–5 engineering gates exited after Independent QA PASS (Rekik), merge, and DER. Canonical routes: `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue key `guest-profile` (`partial`). Guest Services (`guest-services`) was not repurposed. Wave 5 CURRENT: Notes / Comms / Activity hub LIVE; Admin & Privacy LIVE (export JSON, anonymise, unmerge or `unmerge_blocked`, privacy audit). Send only if SET5 email + Resend + from-address. Consent still on Information (+ Privacy). Directory-back + empty Open Directory inherit for the new LIVE cards. Gap-edit 1 CURRENT: sectioned Company form LIVE (Basic open); enrichment fields + default TA FK LIVE; Company-detail multi-guest link / list / unlink via `guest_account_links` LIVE; Individual Relationships remains; Group / TA forms stay thin. Gap-edit 2 Spec **Eng-ready** / ENGINEERING **IN PROGRESS**; Independent QA **HELD** until staged-create; **not** implemented / PASS / LIVE / COMPLETE. Production migrations `0051` / `0053` / `0054` / `0055` remain **held** (Abel / PM); non-prod applied (`qcwptraosaudcbjasmul`). Migration `0057` Abel/PM gated (0056 is Polish Wave 1). Wave 4 residuals untouched (AC-W4-5 create-reservation master IDs; production 0053). Production 0054 hold untouched. Do **not** claim Wave 5 unimplemented. Do **not** reopen Waves 1–5. Programme is **READY FOR HOTEL UAT**. Module COMPLETE remains **NO** until hotel UAT PASS + Advisor module close.

## Surfaces documented in this cycle

| Surface | Doc |
|---|---|
| PMS Dashboard (`/restaurant/pms/dashboard` → `RoomsDashboardTab`) | [dashboard.md](./dashboard.md) |
| Guest Profile (`/restaurant/pms/guests`, `/restaurant/pms/guests/$guestId`) | [guests.md](./guests.md) — Waves 1–5 **IMPLEMENTED ON MAIN**; Wave 5 **OPERATIONALLY ACCEPTED**; Gap-edit 1 **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed; Gap-edit 2 Spec **Eng-ready** / ENGINEERING **IN PROGRESS** (Independent QA **HELD** until staged-create; not implemented); programme **READY FOR HOTEL UAT**; module **not** COMPLETE |

Other PMS area docs (reservations, rates, housekeeping, cashiering, night audit, and the rest) will be added here as those features complete their own cycles. Absence of a file is not a claim that the surface does not exist in the product.

## This cycle

Issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15) (CLOSED) and PR [#16](https://github.com/NORUDEVGIT/NORU/pull/16) (MERGED) removed the temporary dashboard process-test control. CURRENT Dashboard is operational-only.

The earlier **process test** (issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED · PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED) is historical — not a commercial product change. QA evidence for both cycles is in [qa/test-plan.md](./qa/test-plan.md).
