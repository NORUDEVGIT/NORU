# NORU PMS — Guest Profile Module — Phase 5
## Company Operational Workspace Modernization

**Branch:** `feature/guest-preferences-workspace`  
**Status:** Complete  
**Test Suite:** `src/packages/pms/lib/guest-workspace-phase5-company.test.ts` (90 passing tests) & `src/packages/pms/lib/guest-company-detail-workspace.test.ts` (11 passing tests)

---

### Executive Summary

Phase 5 modernizes the PMS Company Account Profile workspace from an initial functional layout into an enterprise-grade, high-density operational center. It establishes a unified **5 Primary + 5 Overflow (More)** view topology, an integrated **Quick View Drawer** within the directory, seamless **Company → Reservation handoff** with strict master validation, an authentic **Commercial & Billing read model** derived directly from reservation folios without phantom ledger engines, combined **Contacts & Travelers** management, and explicit **Default Travel Agency governance**.

---

### 1. Architectural Principles & Invariants

1. **Strict Table & Migration Immutability**:
   - Zero new database migrations. Phase 5 utilizes existing canonical tables (`guest_account_masters`, `guest_company_contacts`, `guest_account_links`, `hotel_reservations`, `folio_transactions`, `pms_corporate_agreements`).
2. **Authentic Commercial Billing Read Model**:
   - Discloses clearly that corporate folios are read directly from reservation folio transactions (`folio_transactions`).
   - No fabricated AR sub-ledgers, phantom invoice write-offs, or unbacked double-entry engines are introduced.
3. **Property & Account Scoping**:
   - Company accounts are strictly verified by `accountType === "company"`, operational status (not soft-deleted), non-anonymized state, and active property membership.
4. **Backward Compatibility & Legacy URL Normalization**:
   - Historical route navigation query parameters (`corporate`, `contacts`, `travelers`, `credit`, `notes`, `history`, `travel-agent-settings`) seamlessly resolve to their modernized canonical counterparts without breaking bookmarks or tests.

---

### 2. View Registry & Navigation Topology (5 + 5 Structure)

The modernized Company Detail Workspace (`src/packages/pms/components/workspaces/guest-company-detail-workspace.tsx`) defines 10 canonical views cleanly partitioned into 5 primary tabs and a 5-item "More" dropdown:

| # | View ID | Label | Placement | Canonical Component | Description |
|---|---|---|---|---|---|
| 1 | `overview` | Overview | Primary | `GuestCompanyOverviewView` | Compact company identity, operational summary, upcoming reservation, commercial snapshot, linked travelers, and recent activity. |
| 2 | `details` | Company Details | Primary | `GuestCompanyDetailsView` | Read-first corporate identity, registration, tax, contact, address, corporate assignment, and commercial references. |
| 3 | `contacts-travelers` | Contacts & Travelers | Primary | `GuestCompanyContactsTravelersView` | Contact Persons and Linked Travelers operational workspace. |
| 4 | `reservations` | Reservations | Primary | `GuestCompanyReservationsView` | Active, upcoming, and historical reservations linked to the company master. |
| 5 | `commercial-billing` | Commercial & Billing | Primary | `GuestCompanyCommercialBillingView` | Commercial terms and folio-derived billing information without a separate AR ledger. |
| 6 | `contracts` | Contracts & Agreements | More Dropdown | `GuestCompanyContractsView` | Corporate agreements, validity dates, status, and negotiated-rate references. |
| 7 | `documents` | Documents | More Dropdown | `GuestCompanyDocumentsView` | Company documents, verification, expiry, and review. |
| 8 | `communication-notes` | Communication & Notes | More Dropdown | `GuestCompanyCommunicationNotesView` | Structured company notes and internal communication records. |
| 9 | `activity` | Activity / History | More Dropdown | `GuestCompanyActivityView` | Audit trail and Company account activity. |
| 10 | `administration` | Administration | More Dropdown | `GuestCompanyAdministrationView` | Account governance, privacy/admin actions, and export. |

#### Legacy Nav Resolution Mapping
```typescript
resolveCanonicalCompanyNavId(nav):
  "corporate"              -> "details"
  "contacts"               -> "contacts-travelers" (initialSubTab: "contacts")
  "travelers"              -> "contacts-travelers" (initialSubTab: "travelers")
  "credit"                 -> "commercial-billing"
  "notes"                  -> "communication-notes"
  "history"                -> "activity"
  "travel-agent-settings"  -> "details"
  unknown / null           -> "overview"
```

---

### 3. Company Quick View Drawer

Located in `src/packages/pms/components/guests/guest-company-quick-view-drawer.tsx`:
- Triggered by clicking any company row in the directory.
- Restricts content scope to fast operational checks:
  1. **Overview**: Key company metadata, default travel agency, active contracts, and quick stats.
  2. **Contacts**: Primary contact person, phone, email, WhatsApp, and department list.
  3. **Travelers**: Quick list of linked travelers with VIP status and role.
  4. **Commercial**: Credit eligibility, payment terms, and architectural billing disclosure.
- Header actions:
  - **New Reservation**: Directly hands off to `/restaurant/pms/reservations?create=new&companyId=<uuid>`.
  - **Full Workspace**: Navigates cleanly to `/restaurant/pms/guests/$companyId?section=companies&type=company&nav=overview`.

---

### 4. Company → Reservation Handoff

- **Entry Points**:
  - Company Detail Header ("New Reservation" button)
  - Company Overview View ("Book Reservation" button)
  - Company Reservations View ("New Corporate Booking" button)
  - Company Quick View Drawer Header ("New Reservation" button)
- **Handoff Contract**:
  - Navigates to `/restaurant/pms/reservations?create=new&companyId=<companyMasterId>`.
  - The `ReservationsWorkspaceOverlay` detects `initialCompanyMasterId` and passes it to `CreateReservationPage`.
  - `CreateReservationPage` fetches the account master and verifies:
    1. `accountType === "company"`
    2. `status !== "deleted"` (operational)
    3. `anonymizedAt === null`
  - Automatically sets `companyMaster` in the form state and switches `reservationType` to `"corporate"`.
  - Preserves user overrides and standard corporate booking rules.

---

### 5. Combined Contacts & Travelers Architecture

Component: `src/packages/pms/components/guests/guest-company-contacts-travelers-view.tsx`
- Features a segmented tab bar toggling between **Contact Persons** and **Linked Travelers**.
- **Contact Persons**:
  - Displays contact KPIs (total contacts, phone, email, WhatsApp, departments).
  - Enforces property setup role & department catalogues (`pms_departments`, `pms_business_contact_roles`).
  - Guards against removing or deactivating the last active primary contact when required by business type rules.
- **Linked Travelers**:
  - Displays traveler KPIs (total linked, active, VIPs, group leaders, upcoming stays).
  - Supports linking existing individual guest accounts via `linkGuestAccount`.
  - Supports registering new travelers via canonical `GuestFormDialog` with automatic company employer link (`guest_account_links`).

---

### 6. Default Travel Agency Governance

- Displayed within the **Company Details** (`details`) view.
- Allows corporate accounts to designate an associated Default Travel Agency for bookings.
- **Governance Rules**:
  - Travel agency picker strictly filters `accountType === "travel_agent"`.
  - Company or group accounts cannot be selected as travel agents.
  - Allows clearing the assignment back to direct corporate booking.
  - Saved via canonical `updateGuestAccount` mutation updating `defaultTravelAgentMasterId`.
