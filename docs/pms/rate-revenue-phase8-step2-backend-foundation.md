# Rate & Revenue Phase 8 — Step 2 & 2B: Backend Read Models, Unified Audit & CSV Export Foundation
**Document ID:** `docs/pms/rate-revenue-phase8-step2-backend-foundation.md`  
**Phase:** 8 (Analytics, Audit & Export) — Steps 2 & 2B  
**Status:** COMPLETE  
**Branch:** `feature/guest-preferences-workspace`

---

## 1. Overview & Purpose

P8-STEP-02 and P8-STEP-02B deliver the pure backend read models, query orchestrators, unified audit log, and RFC-4180 CSV export foundation for NORU PMS Phase 8.

Per the task specifications and review amendments, this step is **BACKEND & READ-MODEL ONLY**:
- Zero UI components created (`revenue-performance-view.tsx`, `revenue-audit-view.tsx`, `revenue-export-dialog.tsx` are deferred to P8-STEP-03).
- Zero workspace placeholder view flags modified (`implemented: false` preserved for UI-31 through UI-40 in `rate-revenue-workspace.ts`).
- Zero database migrations or pricing RPC changes (`0016` pricing function untouched).
- Zero fake metrics (no forecasts, competitor metrics, or promotion ROI).

---

## 2. Review Amendments & Correctness Fixes (P8-STEP-02B)

### 2.1 Complete Unified Audit Export Path
- **Dedicated Full-Result Reader:** `exportUnifiedRevenueAudit()` previously used the paginated UI reader which clamped results to `MAX_AUDIT_PAGE_SIZE = 100`. In P8-STEP-02B, a dedicated complete export loader `loadUnifiedRevenueAuditForExport(db, filter)` is implemented.
- **Safety Limits & Thresholds:**
  - UI Pagination remains clamped to `MAX_AUDIT_PAGE_SIZE = 100`.
  - Complete Export supports up to `MAX_AUDIT_EXPORT_ROWS = 10,000`.
  - Queries exceeding 10,000 matching rows strictly throw `AUDIT_EXPORT_TOO_LARGE` without silent truncation.
- **Regression Proved:** Datasets with >100 rows (e.g. 250 rows) export all 250 rows without boundary truncation.

### 2.2 Room-Type Breakdown Under Non-Inventory Filters
- **Invalidation of Inventory Denominators:** Non-inventory filters (`ratePlanId`, `marketSegmentId`, `commercialSourceId`, `technicalOrigin`, or combinations with `roomTypeId`) subset sold nights without subsetting physical room inventory.
- **Consistent Metric Nulling:** When `hasNonInventoryFilter === true`, Room Type breakdown rows strictly return:
  ```ts
  availableRoomNights: null
  occupancyPct: null
  revpar: null
  inventoryMetricSupport: "NOT_MEANINGFUL"
  ```
  ADR remains valid: $\text{ADR} = \frac{\text{bookedRoomRevenue}}{\text{soldRoomNights}}$.
- When filtering only by property or `roomTypeId`, Room Type breakdown inventory metrics remain fully supported (`SUPPORTED`).

### 2.3 Mixed-Currency Monetary Aggregation Defense
- **Zero Currency Blending:** NORU possesses no authoritative FX conversion layer.
- **Strict Error Guard:** If any included reservation with priced stay nights in range has a currency different from the property currency (e.g. ETB vs. USD), the engine aborts monetary aggregation and throws:
  ```ts
  REVENUE_ANALYTICS_MIXED_CURRENCY
  ```
  ("Revenue analytics cannot combine reservations in multiple currencies because no exchange-rate conversion is configured.")
- Prohibits summing incompatible monetary units into Booked Room Revenue, ADR, or RevPAR.

### 2.4 Sales Channel Filter Rejection
- `salesChannelId` exists in future schema plans, but no stable `hotel_reservations` column or mapping exists.
- Rather than silently ignoring the parameter and returning an unfiltered result, any non-null `salesChannelId` input is strictly rejected with:
  ```ts
  REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED
  ```
  ("Sales channel analytics is not currently supported.")
- Technical Origin (`source`) and Commercial Booking Source remain separate and supported.

### 2.5 Reservation Count Rule
For all summaries, daily trends, and dimensional breakdowns:
$$\text{reservationCount} = \text{COUNT}(\text{DISTINCT } \text{reservation\_id})$$
- Nightly snapshot rows are never counted as reservations.
- A multi-night stay contributes multiple `soldRoomNights` but exactly **one** distinct reservation count.

---

## 3. Implemented Modules

### 3.1 Revenue Analytics
- [`revenue-analytics.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.ts): Pure domain engine containing stay-date allocation from `nightly_rate_snapshot`, `computeRevenuePerformanceOverview`, `computeCommercialPerformance`, and 90-day maximum range limit validation (`REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX`). Enforces mixed currency defense, sales channel rejection, and room type breakdown nulling.
- [`revenue-analytics.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.server.ts): Server data loader querying active inventory, room types, rate plans, and reservations in range.
- [`revenue-analytics.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-analytics.functions.ts): TanStack React Start server functions (`getRevenuePerformanceOverview`, `getCommercialPerformance`) guarded by `requireSupabaseAuth` and `requireRateManager`.

### 3.2 Unified Revenue Audit
- [`revenue-audit.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.ts): Domain normalization (`normalizeRateEvent`, `normalizeRestrictionEvent`, `normalizeCommercialEvent`, `normalizeApprovalEvent`), global sorting (`sortAuditEntriesGlobally`), filtering (`filterAuditEntries`), and bounded pagination (`paginateAuditEntries`).
- [`revenue-audit.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.server.ts): Multi-source query orchestrator across all 4 tables, complete export loader (`loadUnifiedRevenueAuditForExport`), bounded merge pagination (`loadUnifiedRevenueAudit`), and operation detail diff loader (`loadAuditOperationDetail`).
- [`revenue-audit.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-audit.functions.ts): TanStack React Start server functions (`getUnifiedRevenueAudit`, `getAuditOperationDetail`).

### 3.3 CSV Export Foundation
- [`revenue-export.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.ts): RFC-4180 CSV serializer with formula injection defense (prefixing `=`, `+`, `-`, `@` with `'`). Report serializers: `buildRevenuePerformanceCsv` (with safe nullable room type formatting), `buildCommercialPerformanceCsv`, `buildUnifiedAuditCsv`.
- [`revenue-export.server.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.server.ts): Server export generators using `loadUnifiedRevenueAuditForExport` to enforce 10,000 row safety bounds without UI pagination truncation.
- [`revenue-export.functions.ts`](file:///c:/Users/user/Desktop/Noru-Project/NORU/src/packages/pms/lib/revenue/revenue-export.functions.ts): Server functions (`exportRevenuePerformanceCsv`, `exportCommercialPerformanceCsv`, `exportUnifiedRevenueAuditCsv`).

---

## 4. Test Suite Verification

All new Phase 8 unit and integration test suites pass with 100% success using Node's native test runner (`node --test`):

| Test Suite | Tests | Result | Coverage |
| :--- | :---: | :---: | :--- |
| `revenue-analytics.test.ts` | 8 | PASS | 90-day range validation, nightly snapshot allocation, partial stay overlap, unpriced stays & warnings, room-type breakdown nulling under non-inventory filters, mixed currency rejection (`REVENUE_ANALYTICS_MIXED_CURRENCY`), unsupported sales channel rejection (`REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED`), distinct reservation counting, commercial attributions |
| `revenue-audit.test.ts` | 6 | PASS | 4-source normalization, global `timestamp DESC, id DESC` tie-breaking, global pagination boundaries across 16 interleaved multi-source events, keyword filtering, complete export with 250 rows unconstrained by 100-row UI limit, 10,001-row overflow error (`AUDIT_EXPORT_TOO_LARGE`) |
| `revenue-export.test.ts` | 8 | PASS | RFC-4180 escaping, formula injection protection (`=, +, -, @`), CRLF line endings, N/A formatting for non-inventory filters in Room Types, commercial export, 12-column audit export, 10,000-row bounds, complete 250-row CSV generation |

**Full Revenue Regression Test Suite:**
187 passed tests across 32 suites (0 failures).

**Linter & Code Quality:**
- ESLint: 0 errors, 0 warnings.
