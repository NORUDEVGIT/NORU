# Rate & Revenue Phase 8 — Step 2: Backend Read Models, Unified Audit & CSV Export Foundation
**Document ID:** `docs/pms/rate-revenue-phase8-step2-backend-foundation.md`  
**Phase:** 8 (Analytics, Audit & Export) — Step 2 of 3  
**Status:** COMPLETE  
**Branch:** `feature/guest-preferences-workspace`

---

## 1. Overview & Purpose

P8-STEP-02 delivers the pure backend read models, query orchestrators, unified audit log, and RFC-4180 CSV export foundation for NORU PMS Phase 8.

Per the task specifications and review amendments, this step is **BACKEND & READ-MODEL ONLY**:
- Zero UI components created (`revenue-performance-view.tsx`, `revenue-audit-view.tsx`, `revenue-export-dialog.tsx` are deferred to P8-STEP-03).
- Zero workspace placeholder view flags modified (`implemented: false` preserved for UI-31 through UI-40 in `rate-revenue-workspace.ts`).
- Zero database migrations or pricing RPC changes (`0016` pricing function untouched).
- Zero fake metrics (no forecasts, competitor metrics, or promotion ROI).

---

## 2. Review Amendments Incorporated

### 2.1 Non-Inventory Dimension Filter Semantics
When Revenue Performance is filtered by any non-inventory dimension:
- `ratePlanId`
- `marketSegmentId`
- `commercialSourceId`
- `technicalOrigin`
- `salesChannelId`

The system guarantees:
```ts
occupancyPct = null
revpar = null
availableRoomNights = null
inventoryMetricSupport = "NOT_MEANINGFUL"
```
**Rationale:** The filtered reservation numerator no longer corresponds to a valid physical inventory denominator. Occupancy and RevPAR are only valid when the active filtering scope is:
- **Property-wide** (`active hotel_rooms count × days`)
- **Room Type** (`active rooms of type × days`)

A combined filter of `roomTypeId` + `ratePlanId` strictly returns `occupancyPct = null` and `revpar = null`, because the rate-plan filter subsets sold nights without subsetting physical inventory.

ADR remains valid for all dimensional filters:
$$\text{ADR} = \frac{\text{filtered booked room revenue}}{\text{filtered sold room nights}}$$

### 2.2 Reservation Count Rule
For all summaries, daily trends, and dimensional breakdowns:
$$\text{reservationCount} = \text{COUNT}(\text{DISTINCT } \text{reservation\_id})$$
- Nightly snapshot rows are never counted as reservations.
- A reservation spanning multiple stay dates contributes multiple `soldRoomNights` and nightly booked revenue, but exactly **one** `reservationCount` within the applicable breakdown.

### 2.3 Unified Audit Global Pagination Correctness
Pagination operates over the combined logical result set across all four immutable audit sources:
1. `hotel_rate_change_events`
2. `hotel_rate_restriction_change_events`
3. `hotel_commercial_change_events`
4. `hotel_revenue_approval_events` (joined with `hotel_revenue_approval_requests`)

**Implementation Guarantees:**
1. Filters are applied consistently across all active sources.
2. Events are uniformly normalized into `UnifiedRevenueAuditEntry`.
3. Authoritative global ordering is enforced: `timestamp DESC, id DESC`.
4. Pagination is mathematically applied to the globally sorted result set.
5. `total` and `totalPages` accurately reflect the entire multi-source match.
6. Batch resolution of actor names (`restaurant_users` + `profiles`) and approval linkages (`applied_operation_id`) is performed strictly on the sliced page.

---

## 3. Implemented Modules

### 3.1 Revenue Analytics
- [`revenue-analytics.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.ts): Pure calculation engine containing `computeRevenuePerformanceOverview`, `computeCommercialPerformance`, `validateAnalyticsRange` (90-day maximum limit), and `parseSnapshot`. Client/server safe.
- [`revenue-analytics.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.server.ts): Server data loader querying reservations, active rooms, room types, rate plans, and commercial attributions.
- [`revenue-analytics.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.functions.ts): TanStack React Start server functions (`getRevenuePerformanceOverview`, `getCommercialPerformance`) protected by `requireSupabaseAuth` and `requireRateManager`.

### 3.2 Unified Revenue Audit
- [`revenue-audit.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.ts): Pure domain helpers for normalization (`normalizeRateEvent`, `normalizeRestrictionEvent`, `normalizeCommercialEvent`, `normalizeApprovalEvent`), global sorting (`sortAuditEntriesGlobally`), filtering (`filterAuditEntries`), and bounded pagination (`paginateAuditEntries`).
- [`revenue-audit.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.server.ts): Server query orchestrator querying the 4 immutable tables, executing bounded merge, and loading operation details (`loadAuditOperationDetail`).
- [`revenue-audit.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.functions.ts): TanStack React Start server functions (`getUnifiedRevenueAudit`, `getAuditOperationDetail`).

### 3.3 CSV Export Foundation
- [`revenue-export.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.ts): RFC-4180 CSV serializer with spreadsheet formula injection defense (`=, +, -, @` prefixed with `'`). Pure report builders: `buildRevenuePerformanceCsv`, `buildCommercialPerformanceCsv`, `buildUnifiedAuditCsv`.
- [`revenue-export.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.server.ts): Server export generators enforcing a strict 10,000 row safety bound (`AUDIT_EXPORT_TOO_LARGE`).
- [`revenue-export.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.functions.ts): Server functions (`exportRevenuePerformanceCsv`, `exportCommercialPerformanceCsv`, `exportUnifiedRevenueAuditCsv`).

---

## 4. Test Suite Verification

All new Phase 8 unit and integration test suites pass with 100% success using Node's native test runner (`node --test`):

| Test Suite | Tests | Result | Coverage |
| :--- | :---: | :---: | :--- |
| `revenue-analytics.test.ts` | 6 | PASS | 90-day range validation, nightly snapshot allocation, partial stay overlap, unpriced stays & warnings, non-inventory filter disabling occupancy/revpar, distinct reservation counting, commercial attributions |
| `revenue-audit.test.ts` | 4 | PASS | 4-source normalization, global `timestamp DESC, id DESC` tie-breaking, global pagination boundaries across 16 interleaved events, keyword search & filter |
| `revenue-export.test.ts` | 7 | PASS | RFC-4180 escaping, formula injection protection (`=, +, -, @`), CRLF line endings, N/A formatting for non-inventory filters, commercial export, 12-column audit export, 10,000 row bounds |

**Full Revenue Regression Test Suite:**
181 passed tests across 32 suites.

**Linter & Code Quality:**
- ESLint: 0 errors, 0 warnings.
