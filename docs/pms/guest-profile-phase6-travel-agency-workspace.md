# NORU PMS — Guest Profile Module — Phase 6
## Travel Agency Operational Workspace Modernization

**Branch:** `feature/guest-preferences-workspace`  
**Status:** Complete  
**Test Suite:** `src/packages/pms/lib/guest-workspace-phase6-travel-agency.test.ts` (40 passing tests), `src/packages/pms/lib/guest-workspace-phase5-company.test.ts` (147 passing tests), `src/packages/pms/lib/guest-travel-agent-detail-workspace.test.ts` (10 passing tests) — **Total: 197 passing tests**

---

### Executive Summary

Phase 6 modernizes the PMS Travel Agency Account Profile workspace (`Guests → Travel Agencies`) to the modern operational standard established for Individual Guests and Companies. It refactors the legacy 10 flat tabs into a unified **5 Primary + 5 Overflow (More)** navigation structure, introduces a dedicated **Travel Agency Directory & Quick View Drawer**, implements a secure **Travel Agency → PMS Reservation handoff** (`/restaurant/pms/reservations?create=new&travelAgentId=<id>`), enforces strict **Allotment domain boundaries** (booking allocations without physical room duplication), prunes duplicate settings so **Agency Settings** owns strictly Booking Rules, Allotments, and Notifications, and enforces 100% truthful wording regarding commission operational settlement and folio-derived transactions without fabricated AR/AP ledgers.

---

### 1. Architectural Principles & Amendments

1. **Persistence Audit & Zero Unbacked Schemas (Amendment 1)**:
   - Zero new database migrations were introduced. All operations leverage existing Supabase tables: `guest_account_masters`, `guest_company_contacts`, `guest_account_links`, `hotel_reservations`, `folio_transactions`, `pms_corporate_agreements`, `pms_agency_commission_plans`, `pms_agency_commission_entries`, `pms_agency_allotments`, `pms_agency_notification_prefs`, `guest_company_documents`.
2. **Travel Agent Prefill Security (Amendment 2)**:
   - `travelAgentId` resolution in reservation creation is strictly validated via property-scoped Guest Account read.
   - Enforces:
     - `accountType === "travel_agent"`
     - Same restaurant/property boundary
     - Not anonymised (`anonymisedAt === null`)
     - Operational account (`accountStatus !== "deleted"` and `accountStatus !== "archived"`)
   - UUID validation alone is explicitly not sufficient.
3. **Truthful Reservation Type Model (Amendment 3)**:
   - No fabricated or forced reservation type is invented.
   - Prefills `travelAgentMaster` using the existing reservation model (`RESERVATION_TYPE_MODES.travel_agency`).
   - Guest selection remains completely separate; does not auto-select guests.
4. **Commission Configured KPI Truthfulness (Amendment 4)**:
   - Directory KPI "Commission Configured" is derived strictly from real active records in `pms_agency_commission_plans`.
   - Legacy `commission_label` is strictly a reference/backfill fallback, never the authoritative KPI source.
5. **Truthful Billing Read Model (Amendment 5)**:
   - Wording is strictly **"Folio-derived transactions"** rather than "transaction ledger".
   - Discloses clearly that Travel Agency does not own a separate AR/AP subledger.
6. **Operational Settlement Framing (Amendment 6)**:
   - Commission "settled" status reflects internal operational verification.
   - Does not imply bank payout, supplier payment, or external financial settlement unless an actual payment transaction exists.
7. **Agency Settings Ownership (Amendment 7)**:
   - Final visible Agency Settings tabs are strictly:
     1. **Booking Rules**
     2. **Allotment & Inventory**
     3. **Notifications**
   - General identity, contacts, and license have moved to canonical **Agency Details**.
   - Commission plans have moved to canonical **Commercial & Commission**.
   - Billing terms and folio transactions have moved to canonical **Commercial & Commission**.
   - Documents and certifications have moved to canonical **Documents**.
   - Legacy URL query parameters (`general`, `commission`, `billing`, `documents`) are gracefully handled with contextual redirect banners.
8. **Single Canonical Edit Flow (Amendment 8)**:
   - Agency Details is read-first by default.
   - `GuestTravelAgentFormDialog` remains the single canonical master edit flow.
   - Eliminates all inline duplicate edit forms.
9. **Allotment Domain Boundary (Amendment 9)**:
   - Travel Agency allotment represents booking allocation/limit.
   - It does not create, duplicate, or own physical room inventory.
   - Rooms & Inventory remains the physical inventory source of truth (`TA_ALLOTMENT_COPY`).
10. **Overview Must Stay Summary-Only (Amendment 10)**:
    - Overview features a 6-KPI strip, Primary summary cards, and Secondary summary cards.
    - Does not reintroduce full management of Agreements, Documents, Notes, Contacts, or Settings inside Overview.

---

### 2. View Registry & Navigation Topology (5 + 5 Structure)

The modernized Travel Agency Detail Workspace (`src/packages/pms/components/workspaces/guest-travel-agent-detail-workspace.tsx`) defines 10 canonical views partitioned into 5 primary tabs and a 5-item "More" dropdown:

| # | View ID | Label | Placement | Canonical Component | Description |
|---|---|---|---|---|---|
| 1 | `overview` | Overview | Primary | `GuestTravelAgentOverviewView` | 6-KPI summary strip, Agency Identity, Primary Contact, Upcoming Reservation, Commercial Snapshot, Linked Travelers, Recent Activity. No permanent textareas. |
| 2 | `details` | Agency Details | Primary | `GuestTravelAgentDetailsView` | Read-first 7-section layout with `[Edit Agency]` button triggering `GuestTravelAgentFormDialog`. |
| 3 | `contacts-travelers` | Contacts & Travelers | Primary | `GuestTravelAgentContactsTravelersView` | Dense table-first sub-views for Agency Contacts and Linked Guests (`guest_account_links` with `booker_ta` role) with slide-over drawers. |
| 4 | `bookings` | Reservations | Primary | `GuestTravelAgentBookingsView` | Dense reservations table with status badges, reservation links, and PMS reservation handoff button. |
| 5 | `commercial-commission` | Commercial & Commission | Primary | `GuestTravelAgentCommercialCommissionView` | Unified commercial workspace: Commission plan configuration & entries (with approve/settle/void actions) + Commercial terms & Folio-derived billing table. |
| 6 | `agreements` | Agreements | More Dropdown | `GuestTravelAgentAgreementsView` | Corporate/agency contracts, validity periods, negotiated rate references, and right-side detail drawer. |
| 7 | `documents` | Documents | More Dropdown | `GuestTravelAgentDocumentsView` | Agency documentation, licensing, verification status, and right-side review drawer. |
| 8 | `communication-notes` | Communication & Notes | More Dropdown | `GuestTravelAgentCommunicationNotesView` | Dense chronological note log with search/category/visibility toolbar and modal Add Note dialog. Permanent textarea removed. |
| 9 | `activity` | Activity / History | More Dropdown | `GuestTravelAgentActivityView` | Agency Activity & Audit Log wrapping `GuestActivityHubCard`. |
| 10 | `settings` | Agency Settings | More Dropdown | `GuestTravelAgentSettingsView` | Scoped strictly to Booking Rules, Allotment & Inventory (booking limits), and Notifications. |

#### Legacy Nav Resolution Mapping
```typescript
resolveCanonicalTravelAgentNavId(nav):
  "details" / "agency-details"         -> "details"
  "contacts" / "travelers"             -> "contacts-travelers"
  "commission" / "payment" / "billing" -> "commercial-commission"
  "bookings" / "reservations"          -> "bookings"
  "notes"                              -> "communication-notes"
  "history" / "activity-log"           -> "activity"
  "agency-settings"                    -> "settings"
  unknown / null                       -> "overview"
```

---

### 3. Travel Agency Directory & Quick View Drawer

1. **Travel Agency Directory** (`src/packages/pms/components/guests/guest-travel-agent-directory.tsx`):
   - Integrated into `GuestAccountDirectory` when `accountType === "travel_agent"`.
   - Features 4 KPI cards: Total Agencies, Active Agencies, IATA Licensed, and **Commission Configured** (derived from `pms_agency_commission_plans`).
   - 300ms debounced search filtering by name, trade name, code, email, phone, contact name, IATA license, and tax ID.
   - Dense table presentation with status badges, country, agency type, and row click opening the Quick View Drawer.
2. **Quick View Drawer** (`src/packages/pms/components/guests/guest-travel-agent-quick-view-drawer.tsx`):
   - Side sheet drawer providing immediate access to agency operational summaries:
     - **Overview**: Core profile metadata, primary contact, active commission plan, and key counts.
     - **Contacts**: Agency representatives with phone, email, and WhatsApp.
     - **Travelers**: Linked guests with booker roles.
     - **Commercial**: Active commission rate, terms, and architectural billing disclaimer.
   - Header action buttons:
     - **New Booking**: Direct PMS reservation handoff (`/restaurant/pms/reservations?create=new&travelAgentId=<id>`).
     - **Full Workspace**: Navigates directly to the canonical detail workspace.
     - **Edit**: Triggers `GuestTravelAgentFormDialog`.

---

### 4. Travel Agency → Reservation Handoff

- **Target Route**: `/restaurant/pms/reservations?create=new&travelAgentId=<agencyMasterId>`
- **Route Acceptance**: `src/routes/restaurant/pms/reservations.index.tsx` accepts `travelAgentId` (with `travelAgentMasterId` fallback) and passes `initialTravelAgentId` through `ReservationWorkspaceOverlay` and `ReservationsWorkspace`.
- **Validation Pipeline in `CreateReservationPage`**:
  ```typescript
  const isTravelAgentType = account.accountType === "travel_agent";
  const isNotAnonymized = !account.anonymisedAt;
  const isOperational = account.accountStatus !== "deleted" && account.accountStatus !== "archived";

  if (isTravelAgentType && isNotAnonymized && isOperational) {
    setTravelAgentMaster(toPickedReservationMaster(account));
    setReservationType((prev) => (prev === "individual" ? "travel_agency" : prev));
  }
  ```
- **Legacy Elimination**: All links to `/restaurant/bookings/new` across travel agent components have been eliminated and replaced with the PMS reservation route.

---

### 5. Verification & Automated Test Coverage

The entire implementation is validated by comprehensive Node.js native test suites:
- `src/packages/pms/lib/guest-workspace-phase6-travel-agency.test.ts` (40 tests):
  - Section 1: Canonical View Registry & Navigation Topology (5 primary, 5 more, 10 views total).
  - Section 2: Backward-Compatible URL and Alias Resolution.
  - Section 3: Travel Agent Prefill Security & Reservation Integration.
  - Section 4: Travel Agent Directory & Quick View Drawer.
  - Section 5: Header Modernization & Single Edit Flow.
  - Section 6: Overview Must Stay Summary-Only.
  - Section 7: Commercial & Billing Domain Truthfulness.
  - Section 8: Allotment Domain Boundary.
  - Section 9: Agency Settings Ownership.
  - Section 10: Architectural Invariants & Non-Regression.
- `src/packages/pms/lib/guest-workspace-phase5-company.test.ts` (147 tests): 100% passing.
- `src/packages/pms/lib/guest-travel-agent-detail-workspace.test.ts` (10 tests): 100% passing.
- **Combined Test Total: 197 passing tests, 0 failures, 0 regressions.**
