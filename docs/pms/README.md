# PMS documentation

Official NORU Property Management System (PMS) docs. Some pages record features that have completed a coordination cycle (Advisor → Spec → Developer → QA → Docs). Guest Profile Waves 1–5 are **IMPLEMENTED ON MAIN**. Wave 5 is **OPERATIONALLY ACCEPTED** / engineering exited. Gap-edit 1 (Company registration enrichment) is **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed. Gap-edit 2 (Individual form enrichment) is **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed. Programme is **READY FOR HOTEL UAT**. Module COMPLETE remains **NO**. Other Functional Specs stay **WAVE-GATED** until the named wave is accepted.

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
| [Guest Profile Module — programme overview](./guests.md) | **Functional Spec / programme** — Waves 1–5 **IMPLEMENTED ON MAIN**. Wave 1: issue [#66](https://github.com/NORUDEVGIT/NORU/issues/66) CLOSED · PR [#67](https://github.com/NORUDEVGIT/NORU/pull/67) MERGED. Wave 2: issue [#72](https://github.com/NORUDEVGIT/NORU/issues/72) CLOSED · PR [#76](https://github.com/NORUDEVGIT/NORU/pull/76) MERGED · PR [#79](https://github.com/NORUDEVGIT/NORU/pull/79) MERGED. Wave 3: issue [#81](https://github.com/NORUDEVGIT/NORU/issues/81) CLOSED completed · PRs [#85](https://github.com/NORUDEVGIT/NORU/pull/85) + [#87](https://github.com/NORUDEVGIT/NORU/pull/87) + [#90](https://github.com/NORUDEVGIT/NORU/pull/90) MERGED. Wave 4 **code LIVE on `main`** (PR [#97](https://github.com/NORUDEVGIT/NORU/pull/97) MERGED; issue [#95](https://github.com/NORUDEVGIT/NORU/issues/95) **CLOSED** completed). Wave 5 **IMPLEMENTED ON MAIN** (PR [#101](https://github.com/NORUDEVGIT/NORU/pull/101) MERGED 2026-09-14T14:22:35Z; issue [#98](https://github.com/NORUDEVGIT/NORU/issues/98) **CLOSED** completed — Rekik formal closure YES). ENGINEERING STATUS **COMPLETE / MERGED** (eng exited). **OPERATIONALLY ACCEPTED**. Gap-edit 1 **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed (PR [#105](https://github.com/NORUDEVGIT/NORU/pull/105) MERGED 2026-09-14T18:55:43Z; issue [#103](https://github.com/NORUDEVGIT/NORU/issues/103) **CLOSED** completed 2026-09-14T22:43:40Z). Gap-edit 2 **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed (PRs [#111](https://github.com/NORUDEVGIT/NORU/pull/111) + [#112](https://github.com/NORUDEVGIT/NORU/pull/112) MERGED; HOLD **cleared**; issue [#109](https://github.com/NORUDEVGIT/NORU/issues/109) **CLOSED** completed 2026-09-14T23:46:37Z). Programme **READY FOR HOTEL UAT**. Module COMPLETE remains **NO**. |
| [Functional Spec — Guest Profile Module](./specs/guest-profile-module.md) | **Functional Spec** — Waves 1–5 Spec **ACCEPTED** + **IMPLEMENTED ON MAIN**. Gap-edit 1 §8 **IMPLEMENTED ON MAIN** — ENGINEERING STATUS **COMPLETE / MERGED**; **OPERATIONALLY ACCEPTED** / closed. Gap-edit 2 (**§9**) **IMPLEMENTED ON MAIN**. ENGINEERING STATUS **COMPLETE / MERGED**. IMPLEMENTATION STATUS **PASS**. HOLD **cleared** via [#112](https://github.com/NORUDEVGIT/NORU/pull/112). **OPERATIONALLY ACCEPTED** / closed (Rekik formal closure YES / Advisor Outcome Review). Issue [#109](https://github.com/NORUDEVGIT/NORU/issues/109) **CLOSED** completed 2026-09-14T23:46:37Z. Does **not** reopen Waves 1–5 or rewrite Gap-edit 1. Non-prod `0057` **APPLY PASS** (`qcwptraosaudcbjasmul` / `20260914234317`). **Production 0057 NOT applied** (Abel-gated). Module COMPLETE remains **NO**. |

Wave 1–5 engineering gates exited after Independent QA PASS (Rekik), merge, and DER. Canonical routes: `/restaurant/pms/guests` and `/restaurant/pms/guests/$guestId`. Catalogue key `guest-profile` (`partial`). Guest Services (`guest-services`) was not repurposed. Wave 5 CURRENT: Notes / Comms / Activity hub LIVE; Admin & Privacy LIVE (export JSON, anonymise, unmerge or `unmerge_blocked`, privacy audit). Send only if SET5 email + Resend + from-address. Consent still on Information (+ Privacy). Directory-back + empty Open Directory inherit for the new LIVE cards. Gap-edit 1 CURRENT: sectioned Company form LIVE (Basic open); enrichment fields + default TA FK LIVE; Company-detail multi-guest link / list / unlink via `guest_account_links` LIVE; Individual Relationships remains; Group / TA forms stay thin. Gap-edit 2 Individual enrichment is **IMPLEMENTED ON MAIN** (#111 + #112; HOLD **cleared**; Independent QA **PASS** on #112). **OPERATIONALLY ACCEPTED** / closed (Rekik formal closure YES). Issue [#109](https://github.com/NORUDEVGIT/NORU/issues/109) **CLOSED** completed 2026-09-14T23:46:37Z. Non-prod `0057` **APPLY PASS** on `qcwptraosaudcbjasmul` (version `20260914234317` / `pms_individual_form_enrichment`; 16/16 columns; `guest_emergency_contacts` YES). **Production 0057 NOT applied** (Abel-gated). Production migrations `0051` / `0053` / `0054` / `0055` remain **held** (Abel / PM); non-prod applied (`qcwptraosaudcbjasmul`). Wave 4 residuals untouched (AC-W4-5 create-reservation master IDs; production 0053). Production 0054 hold untouched. Do **not** claim Wave 5 unimplemented. Do **not** reopen Waves 1–5. Programme is **READY FOR HOTEL UAT**. Module COMPLETE remains **NO** until hotel UAT PASS + this docs recon merge + Advisor module close.

## Gap-edit #3 — TA enrichment Spec Eng-ready (lean)

| Record | Classification |
|---|---|
| [Gap-edit #3 Spec (lean addendum)](./specs/guest-profile-gap-edit-3.md) | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik 2026-09-15). TA sectioned form + Linking (`guest_account_links` / `booker_ta`) + Company Payment Terms. **Not** implemented. Migration proposed **0058** APPLY HELD. Waves 1–5 + GE1 + GE2 stay closed. Module COMPLETE **NO**. |
| [Gap-edit #3 programme note](./guest-profile-gap-edit-3-programme.md) | Short CURRENT / status pointer (avoids rewriting full `guests.md` in this PR). |

## Create Reservation Phase 1 — Section 1 Spec Eng-ready (lean)

| Record | Classification |
|---|---|
| [Section 1 Spec — Context + Guest](./specs/create-reservation-phase1-section1.md) | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor; D1–D13 locked). Additive expansion of `/restaurant/bookings/new`. **AC-CR1-1…20**. ENGINEERING **NOT STARTED**. **Not** implemented. Section 1 is **not** full Create Reservation DONE. Guest Waves 1–5 + GE1–GE3 stay **OPERATIONALLY ACCEPTED** / closed. |
| [Section 1 programme note](./create-reservation-phase1-section1-programme.md) | Short CURRENT / status pointer (IN PROGRESS Spec). |

## Surfaces documented in this cycle

| Surface | Doc |
|---|---|
| PMS Dashboard (`/restaurant/pms/dashboard` → `RoomsDashboardTab`) | [dashboard.md](./dashboard.md) |
| Guest Profile (`/restaurant/pms/guests`, `/restaurant/pms/guests/$guestId`) | [guests.md](./guests.md) — Waves 1–5 **IMPLEMENTED ON MAIN**; Wave 5 **OPERATIONALLY ACCEPTED**; Gap-edit 1 **IMPLEMENTED ON MAIN** and **OPERATIONALLY ACCEPTED** / closed; Gap-edit 2 **IMPLEMENTED ON MAIN** (#111 + #112; HOLD **cleared**; **OPERATIONALLY ACCEPTED** / closed (Rekik formal closure YES)); programme **READY FOR HOTEL UAT**; module **not** COMPLETE |
| Create Reservation (`/restaurant/bookings/new`) — Phase 1 Section 1 | [specs/create-reservation-phase1-section1.md](./specs/create-reservation-phase1-section1.md) — **Eng-ready** / **IN PROGRESS Spec**. ENGINEERING **NOT STARTED**. Context + Guest only. **Not** CURRENT feature documentation for a completed create workspace |

Other PMS area docs (reservations, rates, housekeeping, cashiering, night audit, and the rest) will be added here as those features complete their own cycles. Absence of a file is not a claim that the surface does not exist in the product.

## This cycle

Issue [#15](https://github.com/NORUDEVGIT/NORU/issues/15) (CLOSED) and PR [#16](https://github.com/NORUDEVGIT/NORU/pull/16) (MERGED) removed the temporary dashboard process-test control. CURRENT Dashboard is operational-only.

The earlier **process test** (issue [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED · PR [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED) is historical — not a commercial product change. QA evidence for both cycles is in [qa/test-plan.md](./qa/test-plan.md).
