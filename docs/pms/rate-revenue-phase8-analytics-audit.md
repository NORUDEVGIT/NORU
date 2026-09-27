# Rate & Revenue Phase 8 — Analytics, Audit & Export Capability Audit (Amended)
**Document ID:** `docs/pms/rate-revenue-phase8-analytics-audit.md`  
**Phase:** 8 (Step 1 of 3 — P8-STEP-01)  
**Status:** COMPLETE  
**Branch:** `feature/guest-preferences-workspace`

---

## 0. Pre-Flight Verification
- **Phase 5 (Commercial Engine):** COMPLETE. Operational promotion and package activations, attribution tables (`hotel_reservation_promotions`, `hotel_reservation_packages`), and `hotel_commercial_change_events` are deployed and verified.
- **Phase 6 (Competitor Setup & Rate Shopping):** ON HOLD. Competitor setup (`hotel_competitors`, `hotel_competitor_room_types`) is implemented in UI-24. Rate shopping and market intelligence (UI-22, UI-23, UI-25) are ON HOLD pending an inbound live rate shopping provider.
- **Phase 7 (Approval Engine & UI):** COMPLETE. The approval engine (`0109_pms_revenue_approvals.sql`) and UI (`approvals-view.tsx`, UI-26–30) are fully operational.
  - *Known Phase 7 follow-up:* Historical approval actor filter has a 500-row query limit limitation. Intentionally not addressed in this phase.
- **Current Workspace Scaffolding in `src/packages/pms/lib/rate-revenue-workspace.ts`:**
  - `revenue-performance`: `implemented: false`, `section: "more"`, sources: `["Reservations", "Reports"]`, context: `["dateRange", "roomType", "ratePlan", "segment", "source", "channel"]`.
  - `audit-control`: `implemented: false`, `section: "more"`, sources: `["Rate Calendar", "Restrictions"]`, context: `["dateRange", "roomType", "ratePlan"]`.
  - `export`: `implemented: false`, `section: "more"`, sources: `["Control Center", "Reports"]`, context: `["dateRange"]`.
- **Pre-flight Status:** PASS.

---

## 1. UI-31–40 Source-of-Truth Status
The original NORU Rate & Revenue source documentation has been located and incorporated into Phase 8:

| Screen Code | Screen Name | Classification | Primary Workspace View | Implemented Subview / Tab |
| :--- | :--- | :--- | :--- | :--- |
| **UI-31** | **Revenue Performance** | Analytics / Management Workspace | `revenue-performance` | Overview tab (UI-31) |
| **UI-32** | **Occupancy / ADR / RevPAR** | Analytics / KPI Detail | `revenue-performance` | KPI Detail tab (UI-32) |
| **UI-33** | **Revenue by Segment** | Analytics / Breakdown | `revenue-performance` | Segments tab (UI-33) |
| **UI-34** | **Revenue by Source** | Analytics / Breakdown | `revenue-performance` | Sources tab (UI-34) |
| **UI-35** | **Revenue Trends** | Analytics / Trend Analysis | `revenue-performance` | Trends tab (UI-35) |
| **UI-36** | **Revenue Control History** | History / Audit / Control | `audit-control` | Control History tab (UI-36) |
| **UI-37** | **Rate Audit** | Audit / Detailed History | `audit-control` | Rate Audit tab (UI-37) |
| **UI-38** | **Restriction Audit** | Audit / Detailed History | `audit-control` | Restriction Audit tab (UI-38) |
| **UI-39** | **Override Audit** | Audit / Commercial Exceptions | `audit-control` | Override Audit tab (UI-39) |
| **UI-40** | **Revenue Export** | Export / Reporting Control | `export` | Revenue Export (UI-40) |

**V1 Capability Adaptations (Source Document vs. Current Engine):**
- **Forecast & Budget:** Not available in NORU. No fake numbers or charts are rendered.
- **Segment / Source Occupancy & RevPAR:** Marked `NOT_MEANINGFUL` in accordance with P8-STEP-02B; physical inventory cannot be partitioned by segment or booking source.
- **Sales Channel:** Unsupported in NORU reservation linkages. Will not be exposed as an active analytics filter.
- **Commission / Net Revenue:** Not configured in NORU; omitted.
- **Export Formats:** CSV only. No buttons for XLSX, PDF, JSON, or scheduling are rendered.
- **Phase 6 & Forecast Status:** Competitor live rate shopping and forecast remain intentionally on hold/unavailable per prior architecture decisions.

---

## 2. Booked Room Revenue — Semantic Preservation

> [!IMPORTANT]
> **Booked Room Revenue uses the existing Rate & Revenue / Control Center reservation pricing semantics. Phase 8 must preserve that formula rather than redefine it.**

Audit of existing implementation in `src/packages/pms/lib/rates.functions.ts` (`getRevenueOverview`), `src/packages/pms/lib/revenue/revenue-control.ts`, and `revenue-metrics.ts`:

1. **Reservation-Level Total vs. Stay-Date Allocation:**
   - `hotel_reservations.room_subtotal`: Stores the static reservation-level booked room revenue total across the entire stay length, recorded when priced (`priced_at`).
   - `hotel_reservations.nightly_rate_snapshot`: Stores an array of nightly rates `[{ date: "YYYY-MM-DD", rate: number }]`. For time-bounded analytics across a date range `[from, to]`, this snapshot is the authoritative source for stay-date revenue allocation. Stays spanning outside the range contribute only the nights falling within `[from, to]`.
2. **Unpriced Bookings Handling:**
   - If a reservation has no pricing snapshot (`nightly_rate_snapshot` empty or null), its stay nights are still counted in `soldRoomNights`, but contribute 0 to `bookedRoomRevenue` and 0 to `pricedNights`. This legitimately understates ADR (`bookedRoomRevenue / soldRoomNights`) and reduces `pricedShare` (`pricedNights / soldRoomNights * 100`), reflecting honest data completeness.
3. **Reservation Statuses:**
   - Strictly `REVENUE_STATUSES` (`'confirmed'`, `'checked_in'`, `'checked_out'`).
   - Excludes `'pending'`, `'cancelled'`, and `'no_show'`.
4. **Date Semantics:**
   - Strictly **Stay Date** (the calendar night of the stay). Departure date is exclusive.

---

## 3. Cashiering — Ownership vs. Read-Only Consumption

### Architectural Ownership
Cashiering remains the sole authoritative author and owner of:
- Folio transactions (`folio_transactions`)
- Room charge postings (`category = 'room'`)
- Taxes and service charges
- Adjustments, refunds, and discounts
- Payments, settlements, and deposits
- Posted revenue and collected funds
Rate & Revenue will NEVER duplicate these calculations or maintain a secondary cashiering ledger.

### Read-Only Consumption Audit
- **Joins Available:**
  - `folio_transactions.folio_id` → `guest_folios.id`
  - `guest_folios.reservation_id` → `hotel_reservations.id` (optional; null for non-room or walk-in folios)
  - `guest_folios.restaurant_id` → `restaurants.id`
- **Posting-Date Semantics vs. Stay-Date Semantics:**
  - `folio_transactions` records `posted_at timestamptz`. It does NOT have a native `stay_date` column. Room charges are posted when Night Audit runs (or at manual staff check-in/posting).
  - Advance deposits, post-checkout dispute adjustments, cross-folio billing routings, and non-room folios distort stay-date room yield.
- **Verdict for Phase 8:**
  - For **V1 Revenue Performance**, rate yield and stay analytics must remain strictly based on **Booked Room Revenue**.
  - Cashiering data can be consumed read-only as separate, property-level cashiering reconciliation metrics (Posted Room Revenue, Collected Payments, Outstanding Balance), but must NEVER be merged into stay-date rate performance.
- **Explicit Statuses:**
  - **Booked Revenue:** SUPPORTED (Authoritative in Rate & Revenue; stay-date basis)
  - **Posted Revenue:** PARTIAL (Cashiering owns it; readable via `folio_transactions` charges, but posting-date timing differs from stay dates)
  - **Collected Revenue:** PARTIAL (Cashiering owns it; readable via `folio_transactions` payments, settlement timing)

---

## 4. Available Room Nights — Preserving the Existing Denominator

> [!IMPORTANT]
> Phase 8 must NOT invent a new inventory denominator. It must preserve the exact denominator used by Control Center and `rates.functions.ts`.

1. **Existing Formula:**
   - `availableRoomNights = (count of active hotel_rooms) × (number of days in range)`.
2. **Operational Status & Known Limitations:**
   - The query filters `hotel_rooms` where `active = true`.
   - It does **not** dynamically deduct Out-of-Order (OOO) or Out-of-Service (OOS) rooms on specific stay dates (`hotel_rooms.restriction_reason`).
   - As documented in `REVENUE_METRIC_KNOWN_GAPS[0]`: *"Available room nights currently count active hotel_rooms × days and may include OOO/OOS rooms."*
   - Phase 8 preserves this operational baseline rather than silently modifying the formula.

---

## 5. Absolute Prohibition of Fake Inventory Denominators

Inventory in NORU exists ONLY at the property level and room-type level (`hotel_rooms.room_type_id`).

**Inventory Denominators DO NOT EXIST for:**
- Rate Plan
- Market Segment
- Commercial Booking Source
- Sales Channel
- Promotion
- Package
- Company Master
- Travel Agency Master

### Metric Rules for Non-Inventory Dimensions:
- **Valid to Report:**
  - Booked Room Revenue (Sum of stay-date rates)
  - Sold Room Nights (Count of stay nights)
  - ADR (`booked revenue / sold nights`)
  - Reservation Count
  - Share of Booked Revenue % (`dimension revenue / total revenue * 100`)
- **Strictly Prohibited / NOT MEANINGFUL:**
  - **Occupancy %** (No denominator exists)
  - **RevPAR** (No denominator exists)

---

## 6. Export Infrastructure Audit

1. **Existing Mechanism:**
   - Standard NORU export pattern across Guest and Front Office modules is **native CSV generation** using browser `Blob` (`text/csv;charset=utf-8`) and download anchor triggers.
2. **Dataset Size & Generation Strategy:**
   - **Small already-loaded datasets:** Client-side CSV generation is acceptable for bounded summary tables.
   - **Large / Paginated operational datasets:** (Unified Revenue Audit, long-range rate/restriction histories, large breakdown tables) MUST be generated via server-filtered complete queries prior to CSV creation.
   - **Critical Rule:** Never export only the currently visible table page while labeling it as the complete filtered result.
3. **Format Scope:**
   - **CSV:** SUPPORTED / REUSABLE (RFC-4180 compliant).
   - **XLSX:** DEFERRED (No `xlsx`, `sheetjs`, or `exceljs` library in repository).
   - **PDF:** DEFERRED (No PDF report generator in repository).

---

## 7. Operational Integrity & Guardrails

1. **Purely Descriptive Analytics:**
   - Strictly prohibited: Automated pricing recommendations, "best-rate" suggestions, demand forecasting, promotion optimization scoring, or automated price change triggers.
2. **No Gap-Filling from Other Phases:**
   - **Phase 4:** No fake forecast metrics or forecast accuracy calculations.
   - **Phase 6:** No competitor rate metrics (ARI, MPI, RGI, Market Share) while live shopping is on hold.
   - **Phase 7:** Do not fix the known 500-row historical approval actor limit in this phase.
3. **Period Aggregation Arithmetic:**
   - **ADR** = `total booked room revenue / total sold room nights` (Weighted; NEVER average of daily ADRs).
   - **RevPAR** = `total booked room revenue / total available room nights` (Weighted; NEVER average of daily RevPARs).
   - **Occupancy %** = `total sold room nights / total available room nights * 100`.

---

## 8. Explicit Date & Currency Semantics

### Date Semantics
Every metric must declare its exact date basis:
- **Stay Date:** Date of the night stayed. Used for Booked Room Revenue, Sold Nights, Available Nights, ADR, RevPAR, Room Type Yield.
- **Booking-Created Date:** Timestamp when reservation was created (`created_at`). Used for Booking Lead Time and booking production.
- **Posting Date:** Timestamp when cashiering folio transaction was posted (`posted_at`). Used for Cashiering Posted Room Revenue.
- **Payment / Settlement Date:** Timestamp when payment transaction was recorded. Used for Cashiering Collections.
- **Snapshot As-Of Date:** Closed business date when OTB was captured. Used for Pickup & Pace.
- **Event Timestamp:** Exact time an operational action was logged (`created_at`). Used for Audit History.

### Currency Safety
- Single property base currency (`restaurants.currency_code`, default `'GBP'` / `'USD'`).
- NORU does not have a real-time FX conversion engine.
- Aggregation across multiple foreign currencies is unsafe. Multi-currency reservations must be flagged or reported in property base with a data quality warning.

### Tax & Surcharge Basis
- `room_subtotal` and `nightly_rate_snapshot` represent **pre-tax room rates** as defined in rate plans.
- Taxes and service charges are calculated at cashiering posting time via `taxes-card3`.
- All rate & revenue metrics are labeled neutrally as **"Pre-tax Booked Room Revenue"**. Never label as "Gross" or "Net" without qualification.

---

## 9. Unified Revenue Audit Architecture

### Source Tables (Immutable & Append-Only)
1. Rates: `hotel_rate_change_events` (`0101`)
2. Restrictions: `hotel_rate_restriction_change_events` (`0102`)
3. Commercial: `hotel_commercial_change_events` (`0104`)
4. Approvals: `hotel_revenue_approval_events` & `hotel_revenue_approval_requests` (`0109`)

### Unified Read Model Schema
Step 2 will construct a unified read model over these tables without duplicating underlying data:
```typescript
export type UnifiedRevenueAuditEntry = {
  id: string;
  restaurantId: string;
  timestamp: string; // ISO 8601
  domain: "rate" | "restriction" | "commercial" | "approval";
  action: string;
  entity: string;
  scope: string; // e.g. "Standard King · 2026-10-01 to 2026-10-07"
  actorId: string | null;
  actorName: string;
  reason: string | null;
  operationId: string;
  approvalRequestId: string | null;
  status: string | null;
  sourceTable: string;
};
```

### Approval & Domain Event Relationship
- Connected via `applied_operation_id`.
- Lifecycle presentation:
  `Approval Request Submitted` → `Approval Approved` → `Domain Changes Applied (X records)`.
- Applied changes are never double-counted in business analytics.

---

## 10. Step 2 Architecture Evaluation

Comparison of read-model approaches for Step 2:
- **A. Live Server Aggregation:** Querying `hotel_reservations` for a 30–90 day range executes in sub-100ms given existing indexes (`restaurant_id`, `arrival_date`, `departure_date`).
- **B. Focused Read Models:** Highly recommended. Separate server readers for Performance Overview, Breakdown Slices, Unified Audit, and CSV export.
- **C. SQL / RPC Aggregation:** Useful if stay-date unpacking in TypeScript becomes a bottleneck for multi-year queries.
- **D. Materialized Daily Fact Table:** NOT recommended for V1. Introduces synchronization risks and cache invalidation overhead when reservations are amended or cancelled.
- **E. Recommended Architecture:** **B (Focused Server Read Models)** with strict date range clamping (max 90 days for live stay queries).

---

## 11. Support Matrices

### Analytics Support Matrix

| Metric | Authoritative Source | Formula | Date Basis | Currency Basis | Historical Coverage | Known Limitation | Support Status | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Booked Room Revenue** | `hotel_reservations.nightly_rate_snapshot` | Sum of stay rates in range | Stay Date | Property Base | Full for priced stays | Unpriced stays contribute 0 | **SUPPORTED** | HIGH |
| **Sold Room Nights** | `hotel_reservations` | Count of overlapping stay dates | Stay Date | N/A | Full | Statuses `REVENUE_STATUSES` | **SUPPORTED** | HIGH |
| **Available Room Nights** | `hotel_rooms` | `activeRooms * days` | Stay Date | N/A | Full | Includes OOO/OOS rooms | **SUPPORTED** | HIGH |
| **Occupancy %** | Stays & Rooms | `soldNights / availableNights * 100` | Stay Date | N/A | Full | Denominator includes OOO | **SUPPORTED** | HIGH |
| **ADR** | Stays & Rates | `bookedRevenue / soldNights` | Stay Date | Property Base | Full | Understated by unpriced stays | **SUPPORTED** | HIGH |
| **RevPAR** | Stays & Rooms | `bookedRevenue / availableNights` | Stay Date | Property Base | Full | Denominator includes OOO | **SUPPORTED** | HIGH |
| **Room Type Perf.** | Stays, Types, Rooms | Grouped by `room_type_id` | Stay Date | Property Base | Full | Type assignment changes | **SUPPORTED** | HIGH |
| **Rate Plan Revenue/ADR**| Stays & Rate Plans | Grouped by `rate_plan_id` | Stay Date | Property Base | Full for priced | Unpriced in fallback row | **SUPPORTED** | HIGH |
| **Rate Plan Occupancy/RevPAR**| N/A | N/A | N/A | N/A | N/A | No rate-plan inventory | **NOT MEANINGFUL**| N/A |
| **Segment Performance** | `hotel_reservations.market_segment` | Grouped by segment label | Stay Date | Property Base | Post-0061 only | Pre-0061 in "Unassigned" | **PARTIAL** | MEDIUM |
| **Source Performance** | `commercial_booking_source` | Grouped by source label | Stay Date | Property Base | Post-0061 only | Pre-0061 in "Unassigned" | **PARTIAL** | MEDIUM |
| **Technical Origin Perf.** | `hotel_reservations.source` | Grouped by technical source (`staff`, `walk_in`, etc.) | Stay Date | Property Base | Full | Reservation entry vector | **SUPPORTED** | HIGH |
| **Sales Channel Perf.** | N/A | No sales channel column on `hotel_reservations` | N/A | N/A | None | No schema linkage | **BLOCKED** | N/A |
| **Promotion Performance**| `hotel_reservation_promotions` | Discount sum & stay counts | Stay Date | Property Base | Post-0104 only | Descriptive usage only | **PARTIAL** | HIGH |
| **Package Performance** | `hotel_reservation_packages` | Applied sum & unit count | Stay Date | Property Base | Post-0104 only | Booked value, not posting | **PARTIAL** | HIGH |
| **Lead Time** | Stays & timestamps | `arrival - created_at` | Booking Date | N/A | Full | Property timezone cast | **SUPPORTED** | HIGH |
| **Length of Stay** | Stays | `departure - arrival` | Stay Date | N/A | Full | Excludes cancelled/no-show | **SUPPORTED** | HIGH |
| **Cancellation Rate** | Current statuses | `cancelled / total` | Current state | N/A | Current only | Timing curve unavailable | **PARTIAL** | MEDIUM |
| **Posted Room Revenue** | `folio_transactions` | Sum room charges | Posting Date | Folio Currency | Full | Posting timing != stay date | **PARTIAL** | MEDIUM |
| **Total Posted Charges** | `folio_transactions` | Sum all charges | Posting Date | Folio Currency | Full | Cashiering ledger scope | **PARTIAL** | MEDIUM |
| **Collected Payments** | `folio_transactions` | Sum payment txns | Payment Date | Folio Currency | Full | Settlement timing != stay date| **PARTIAL** | MEDIUM |
| **Forecast Accuracy** | N/A | N/A | N/A | N/A | None | No forecast snapshot schema | **BLOCKED** | N/A |
| **Competitor Index** | N/A | N/A | N/A | N/A | None | Phase 6 rate shopping on hold| **BLOCKED** | N/A |

### Audit Support Matrix

| Domain | Source Table | Immutable? | Grouping Key | Before/After State? | Reason Captured? | Actor Captured? | Detail Support |
|---|---|---|---|---|---|---|---|
| **Rates** | `hotel_rate_change_events` | YES | `operation_id` | Full before/after rates | Optional text | `actor_membership_id` | Full |
| **Restrictions** | `hotel_rate_restriction_change_events` | YES | `operation_id` | Full before/after state | Optional text | `actor_membership_id` | Full |
| **Commercial** | `hotel_commercial_change_events` | YES | `operation_id` | JSONB before/after state | Optional text | `actor_membership_id` | Full |
| **Approvals** | `hotel_revenue_approval_events` & requests | YES | `approval_request_id` | Proposal & review reason | Required on reject | `actor_id` | Full |

### Export Support Matrix

| Dataset | Exportable? | Format | Engine | Role Required | Known Limitations |
|---|---|---|---|---|---|
| **Revenue Performance Overview** | YES | CSV | Server/Client builder | Owner / Manager | Pre-tax stay-date revenue only |
| **Room Type Performance** | YES | CSV | Server/Client builder | Owner / Manager | Bounded by selected stay range |
| **Rate Plan Performance** | YES | CSV | Server/Client builder | Owner / Manager | Unpriced stays in fallback row |
| **Segment & Source Performance** | YES | CSV | Server/Client builder | Owner / Manager | Pre-0061 bookings unassigned |
| **Commercial Performance** | YES | CSV | Server/Client builder | Owner / Manager | Post-0104 data only |
| **Unified Revenue Audit Log** | YES | CSV | Server-filtered complete | Owner / Manager | Must export full filtered query |

---

## 12. Synthesis of Capabilities

### A. Verified Existing Capability
- Booked Room Revenue, Sold Nights, Available Nights, Occupancy %, ADR, RevPAR (Property & Room Type levels).
- Rate Plan Booked Revenue and ADR.
- Technical Reservation Origin (`hotel_reservations.source`: `staff`, `walk_in`, `direct_booking`, etc.) revenue and ADR.
- Booking Lead Time distribution and Length of Stay distribution.
- **Revenue audit source infrastructure: YES** (4 immutable audit event tables with operational before/after states and actor IDs exist).
- Client-side UTF-8 CSV download mechanism.

### B. Partially Supported Capability
- Market Segment & Commercial Booking Source breakdowns (Supported post-migration 0061; older stays reported as "Unassigned").
- Promotion & Package attribution (Supported post-migration 0104; descriptive usage only).
- Cancellation rate (Supported based on current reservation status; historical pacing curves omitted).
- Cashiering Posted Revenue & Collected Payments (Readable from `folio_transactions`, but represents posting/settlement dates rather than stay dates).

### C. Missing Backend Capability (To Build in Step 2)
- Unified Revenue Analytics server read model (`revenue-analytics.server.ts`).
- Commercial Attribution server read model (`revenue-analytics.server.ts`).
- **Unified Revenue Audit read model: REQUIRES BACKEND** (`revenue-audit.server.ts`, normalizing the 4 source tables with batched staff resolution and global pagination).
- Audit Operation Detail reader (`revenue-audit.server.ts`).
- Server-side complete CSV dataset generator for audit and performance exports (`revenue-export.server.ts`).

### D. Historically Impossible / Non-Reconstructable Data
- Pre-0101 rate changes and overrides.
- Pre-0102 restriction changes.
- Pre-0103 pickup and OTB snapshots.
- Pre-0104 commercial promotion/package usage.
- Pre-0109 approval requests and approval history.
- Pre-0061 reservation market segment and commercial source labels.

### E. Deferred Capability
- UI-31–40 exact mapping (Blocked until original source documentation/PDF is provided).
- Forecast accuracy and variance analytics (Requires forecast snapshot engine).
- Competitor market yield indices ARI, MPI, RGI (Requires live rate-shopping provider).
- XLSX / PDF export generation (Requires adding binary report dependencies).
