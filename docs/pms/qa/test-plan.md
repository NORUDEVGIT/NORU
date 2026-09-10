# PMS Dashboard — QA evidence

Two related cycles:

| Cycle | Issue | PR | What it recorded |
|---|---|---|---|
| Historical process-test | [#12](https://github.com/NORUDEVGIT/NORU/issues/12) CLOSED | [#13](https://github.com/NORUDEVGIT/NORU/pull/13) MERGED | Temporary `PMS Workflow Test` control added (not a product capability). |
| Cleanup (CURRENT) | [#15](https://github.com/NORUDEVGIT/NORU/issues/15) CLOSED | [#16](https://github.com/NORUDEVGIT/NORU/pull/16) MERGED | That temporary control removed. Dashboard is operational-only again. |

This record does not certify other PMS surfaces.

**`NOT RUN` is not `PASS`.** A check that was not executed is left as `NOT RUN` even when Independent QA later passed the cycle.

---

## Cycle #15 / #16 — remove temporary control (CURRENT)

Approved cleanup Spec after Advisor acceptance of the #12 / #13 coordination loop. Do not reopen #12.

### Acceptance (Spec AC-1 – AC-5)

Recorded on the #15 Design Execution Report after Independent QA and merge:

| ID | Result | Evidence |
|---|---|---|
| AC-1 | PASS | No control/text labelled `PMS Workflow Test` on PMS Dashboard after PR #16. |
| AC-2 | PASS | Dashboard never displays `PMS workflow test passed`. |
| AC-3 | PASS | `FrontOfficeSummary`, room metric cards, and rooms-by-type still render (temporary section removed). |
| AC-4 | PASS | PR #16 touched only `rooms-dashboard.tsx` + `docs/pms/dashboard.md`. No DB / RLS / auth / entitlement / backend files. |
| AC-5 | PASS | New issue #15 (not a reopen of #12); PR #16 referenced #15. |

### Developer QA

**RESULT: PARTIAL** (cloud agent, recorded on #15 / #16).

| Check | Result | Notes |
|---|---|---|
| `tsc --noEmit` | PASS | Developer environment. |
| String-absence | PASS | `PMS Workflow Test`, `PMS workflow test passed`, `Temporary process test`, `workflowTestPassed`, `TEMPORARY` absent from `rooms-dashboard.tsx`. |
| Diff scope / AC-4 frontend-only | PASS | PR #16: `rooms-dashboard.tsx` + `docs/pms/dashboard.md` only. |
| Browser smoke `/restaurant/pms/dashboard` (QA-1 / QA-2 / QA-3) | **NOT RUN** | Requires a signed-in PMS session; not available in the developer environment that ran `tsc`. |
| Existing guard regression (SEC-T1 / SEC-T2) | **NOT RUN** | Guard code was not changed; checks were not re-executed. |

Developer QA was marked ready for Independent QA. PARTIAL does not become PASS because Independent QA later passed.

### Independent QA

**RESULT: PASS** (Rekik / Abel — Vice PM / PM Independent QA), recorded on #15 and #16 after the developer PARTIAL report.

Independent QA is the recorded browser / acceptance lane for this cycle. Developer browser smoke remains **NOT RUN**.

### Security / regression (as recorded)

Issue #15 required SEC-T1–SEC-T3 and REG-1–REG-3 per the approved Functional Spec, plus no new auth, RLS, entitlement, or weakened route guards.

| Item | Recorded result |
|---|---|
| No new auth / RLS / entitlement / tenant-boundary change | PASS (diff scope; AC-4) |
| Route guards unchanged | PASS (no guard files in #16) |
| Developer re-run of SEC-T1 / SEC-T2 | **NOT RUN** |
| Independent QA overall | PASS |

### Merge verification

PR #16 merged to `main` (2026-09-10). `main` no longer contains the temporary `PMS Workflow Test` control. Issue #15 closed via `Closes #15` (completed). Vice PM closure approved; Design Execution Report sent to Docs & Coordination.

---

## Cycle #12 / #13 — temporary process-test (historical)

This section is the closed #12 / #13 record. The temporary control is **not** CURRENT. It was removed by #15 / #16.

### Acceptance (Spec AC-1 – AC-5)

Recorded on the #12 Design Execution Report after Independent QA and merge:

| ID | Result | Evidence |
|---|---|---|
| AC-1 | PASS | Control labelled exactly `PMS Workflow Test` in `RoomsDashboardTab` after #13 (later removed by #16). |
| AC-2 | PASS | Activating the control showed exactly `PMS workflow test passed` via local `useState`. |
| AC-3 | PASS | PR #13 touched only `src/packages/pms/components/rooms/rooms-dashboard.tsx`. No DB / RLS / auth / entitlement / backend files. |
| AC-4 | PASS | `FrontOfficeSummary` and room metric cards unchanged; temporary block appended after rooms-by-type. |
| AC-5 | PASS | Helper `Temporary process test` plus `TEMPORARY` source comments; removal deferred after Advisor acceptance (later #15). |

### Developer QA

**RESULT: PARTIAL** (cloud agent, recorded on #12).

| Check | Result | Notes |
|---|---|---|
| `tsc --noEmit` | PASS | Developer environment. |
| Diff scope / AC-3 frontend-only | PASS | Single-file change; exact label and success strings; no secrets, env, migrations, or backend. |
| Browser smoke `/restaurant/pms/dashboard` (QA-1 / QA-2) | **NOT RUN** | Requires a signed-in PMS session; not available in the developer environment that ran `tsc`. |
| Existing guard regression (SEC-T1 / SEC-T2) | **NOT RUN** | Guard code was not changed; checks were not re-executed. |

Developer QA was marked ready for Independent QA. PARTIAL does not become PASS because Independent QA later passed.

### Independent QA

**RESULT: PASS** (Rekik / Abel — Vice PM / PM Independent QA), recorded on #12 and #13 after the developer PARTIAL report.

Independent QA is the recorded browser / acceptance lane for this cycle. Developer browser smoke remains **NOT RUN**.

### Security / regression (as recorded)

Issue #12 required SEC-T1–SEC-T3 and REG-1–REG-3 per the approved Functional Spec, plus no new auth, RLS, entitlement, or weakened route guards.

| Item | Recorded result |
|---|---|
| No new auth / RLS / entitlement / tenant-boundary change | PASS (diff scope; AC-3) |
| Route guards unchanged | PASS (no guard files in #13) |
| Developer re-run of SEC-T1 / SEC-T2 | **NOT RUN** |
| Independent QA overall | PASS |

### Merge verification

PR #13 merged to `main` (2026-09-10). After that merge, `main` contained the temporary `PMS Workflow Test` control. Issue #12 closed via `Closes #12`. Vice PM closure approved; Design Execution Report sent to Docs & Coordination. The control was later removed by #15 / #16.
