# NORU PMS — Guest Profile Module
## Phase 3: Individual Guest Detail Workspace Redesign

### Document Metadata
- **Module**: PMS / Guest Profiles
- **Phase**: Phase 3 of 8 (Individual Guest Detail Workspace Redesign)
- **Branch**: `feature/guest-preferences-workspace`
- **Route**: `/restaurant/pms/guests/$guestId`
- **Status**: Complete & Verified

---

### 1. Architectural Overview & Single-Shell Integration

The Individual Guest Detail workspace represents the primary operational interface for front-desk agents, duty managers, and guest services staff when viewing or managing a specific hotel guest. 

Prior to Phase 3, guest information was fragmented across multiple disconnected cards (`information`, `dashboard`, `identity`, `preferences`, `stay-history`, etc.) without a unified visual hierarchy. Phase 3 unifies this experience into a coherent operational workspace that shares the dark espresso PMS command chrome architecture established in Phase 2D:

- **Outer Shell**: Inherits `GuestProfileChrome` with shared PMS command navigation (Reservations, Room & Inventory, Rates & Revenue, Guest Profiles).
- **Context Preservation**: The selected profile remains anchored under the `Guests` operational section (`activeSection="guests"`).
- **Identity Header**: A compact operational header displays essential demographic, contact, and system metadata alongside primary actions.
- **Tab Hierarchy**: A streamlined text-tab strip with amber/gold underlines for primary operational views, combined with a `More ▾` dropdown for lower-frequency views.
- **Directory Return Integrity**: A prominent `← Back to Guest Profiles` link preserves all active search query parameters (`q`, `status`, `vip`, `lastStay`, `sort`, `page`).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ NORU PMS Command Chrome (Dark Espresso Navigation)                                       │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ← Back to Guest Profiles                                                                 │
│                                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ GUEST IDENTITY HEADER                                                                │ │
│ │ [Avatar/Photo] Guest Name [VIP] [Active]              [+ New Reservation] [Edit] [▾] │ │
│ │ Phone · Email · City, Country                                                        │ │
│ │ ID: 1042 · Nationality · DOB (Age) · Lang · Company · Member since                   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ [Overview]  [Personal & Contact]  [Identity & Docs]  [Preferences]  [Stays]  [More ▾]    │
│ ──────────────────────────────────────────────────────────────────────────────────────── │
│ Active View Container (e.g. 4-Row Operational Overview)                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Canonical Detail View Registry & URL Compatibility

The detail view registry is codified in `src/packages/pms/lib/guest-detail-view.ts`. It establishes a canonical view registry (`GuestDetailViewId`) that maps bidirectionally to legacy `card` and `nav` parameters:

| Canonical `view` / `tab` | Label | Navigation Group | Legacy `card` | Legacy `nav` | Purpose |
|:---|:---|:---|:---|:---|:---|
| `overview` | **Overview** | Primary (Tab) | `dashboard` | `overview` | Operational snapshot, 6-KPI strip, upcoming stay, alerts |
| `personal-contact` | **Personal & Contact** | Primary (Tab) | `information` | `personal` / `contact` | Consolidated demographics, channels, address, employment, emergency |
| `identity` | **Identity & Documents** | Primary (Tab) | `identity` | `identity` | Masked document numbers, official uploads, staff verification |
| `preferences` | **Preferences** | Primary (Tab) | `preferences` | `preferences` | Property setup room, sleep, food, and service preferences |
| `stays` | **Stays & Reservations** | Primary (Tab) | `stay-history` | `bookings` | Historical and upcoming stays, folio links, reservation actions |
| `relationships` | **Relationships** | More (Dropdown) | `relationships` | `business` | Associated Company, Travel Agency, and Group accounts |
| `services` | **Services** | More (Dropdown) | `services` | `services` | Operational service requests and delivery status |
| `communication-notes` | **Communication & Notes** | More (Dropdown) | `notes-comms` | `notes` | Operational notes and recorded guest interactions |
| `privacy` | **Privacy & Administration** | More (Dropdown) | `admin-privacy` | — | Consent flags, data export, profile anonymisation |
| `activity` | **Activity / History** | More (Dropdown) | `notes-comms` | `history` | Chronological audit trail and system event log |
| `loyalty` | **Loyalty & Value** | More (Dropdown) | `loyalty` | — | Derived stay counts, night counts, and VIP staff recognition |

#### URL Parsing & Synchronization
- `resolveGuestDetailView(search)`: Reads `view`, `tab`, `card`, and `nav` search params. Fully backward-compatible with legacy links.
- `legacyParamsForDetailView(view)`: Generates matching `card` and `nav` params to maintain compatibility with existing query parsers.
- Route updates use `guestProfileSearch({ view, tab, card, nav, ...directorySearch })`.

---

### 3. Operational Overview 4-Row Structure

The primary default view (`GuestIndividualOverview`) organizes operational data into a 4-row information hierarchy:

#### Row 1: Compact 6-KPI Summary Strip (Caution 1)
- **Constraint**: *Keep the six KPI items visually compact. They should read like a summary strip, not six big dashboard cards.*
- **Implementation**:
  - Rendered as a single horizontal band matching Reservations and Room & Inventory: `grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6 shadow-sm`.
  - Color palette: Warm NORU hospitality palette (`bg-white` cards, `#DDD4C5` warm borders, `#251605` dark espresso headings/values, `#756A5B` warm stone labels, and `#C89933` gold accents).
  - Metrics:
    1. **Status**: Active / Inactive indicator dot and text.
    2. **VIP Status**: Gold VIP badge with crown icon or Standard label.
    3. **Last Stay**: Departure date formatted via `formatStayDate` or `—`.
    4. **Upcoming Stay**: Arrival date formatted via `formatStayDate` or `—`.
    5. **Total Stays**: Total completed stay count from real read model.
    6. **Total Nights**: Total completed night count calculated using authoritative `nightsBetween` logic.

#### Row 2: Core Operational Cards (3 Columns)
- **Guest Information Card**:
  - Displays Profile No., Full Name, Guest Type, Nationality, Date of Birth with calculated Age (`dob (age yrs)`), Gender, Language, Status, VIP Status, Member Since, and Linked Company.
  - Action: Quick `Edit` button navigating to `Personal & Contact` view or launching `GuestFormDialog`.
- **Contact & Address Card**:
  - Mobile Phone, Alternate Phone, Email, Alternate Email, Preferred Contact Method, Preferred Contact Time.
  - Address Line 1, Address Line 2, City, State/Region, Postal Code, Country.
  - **Caution 2 Implementation**: "View on Map" external Google Maps link appears **only** if real geographical coordinates (`guest.geoLatitude != null && guest.geoLongitude != null`) are stored in the database. When absent, fake links are strictly omitted.
- **Upcoming Reservation Card**:
  - Displays earliest confirmed or pending upcoming stay from `overview.featuredStay`.
  - **Caution 3 Implementation**: Room type, room number, rate plan name, and booking source are only displayed when present in the existing `GuestStay` read model. Missing fields stay omitted or show `—`, never invented.
  - Action: `Open Reservation` link to `/restaurant/pms/reservations/$reservationId` plus contextual `GuestStayActions` (Check In, Assign Room, etc.).

#### Row 3: Secondary Operational Cards (3 Columns)
- **Key Preferences Card**:
  - Displays active preference chips from `listGuestPreferenceSummary`.
  - Quick action: `Edit` button navigating to full `Preferences` workspace.
- **Identity Status Card**:
  - Displays ID Document Type, Masked ID Number (`•••• 1234`), Issuing Country, Expiration Date, and Staff Verification badge.
  - Quick action: `View All` navigating to `Identity & Documents`.
- **Relationships Card**:
  - Lists linked corporate employer/bill-to accounts, travel agencies, and group affiliations from `listGuestAccountLinks`.
  - Quick action: `View All` navigating to `Relationships`.

#### Row 4: Important Notes, Alerts & Restrictions (Full Width)
- Displays active restrictions (e.g. `DO NOT RENT` warnings with reasons, VIP priority instructions).
- Displays profile notes and recent operational staff notes from guest history (`note_added`).
- Action: `Add Note` modal trigger and `View All` link to `Communication & Notes`.

---

### 4. Consolidated Personal & Contact View

Implemented in `GuestPersonalContactView`, replacing the previous split between separate `Personal` and `Contact` sub-tabs:
1. **Personal Information Panel**: Title, Full Name, Preferred Name, Middle Name, Gender, DOB & Calculated Age, Nationality, Language.
2. **Contact Channels Panel**: Mobile Phone, Alt Phone, Email, Alt Email, Preferred Contact Method, Preferred Contact Time.
3. **Residential Address Panel**: Street Address, Address 2, City, Region, Postal Code, Country, and truthful Google Maps link when coordinates exist.
4. **Employment & Corporate Affiliations Panel**: Position/Title, Department, Primary Company account, and list of secondary affiliations.
5. **Emergency Contacts Panel**: Full-width responsive grid listing emergency contacts with Name, Relationship, Phone, and Email.

---

### 5. Error Isolation & Resilience Strategy

In accordance with architectural standards:
- **Core Guest Query**: `getGuest` failure renders an isolated error state with a prominent back button to the Guest Directory, preventing white-screen crashes.
- **Secondary Queries**:
  - `getGuestStayOverview` (stay metrics, upcoming stay) failure displays an isolated inline error in the upcoming reservation panel while leaving all identity, demographic, and contact panels fully functional.
  - `listGuestAccountLinks` (corporate links) failure defaults to an empty relationship state.
  - `listGuestPreferenceSummary` (preference chips) failure displays an inline loading/retry state.
- **Write Actions**: Merge, deactivation, note creation, and identity uploads operate within standard optimistic mutation lifecycles with error toast notifications.

---

### 6. Phase 3 Test Matrix & Verification

A dedicated test suite `src/packages/pms/lib/guest-workspace-phase3.test.ts` validates all 41 operational criteria:

| # | Test Assertion Description | Status |
|:---|:---|:---|
| 1 | Open Full Profile opens individual guest detail workspace | Pass |
| 2 | Individual guest detail workspace renders inside shared PMS command chrome | Pass |
| 3 | Individual guest detail workspace preserves dark espresso command chrome styling | Pass |
| 4 | Compact identity header renders at top of individual guest detail | Pass |
| 5 | Avatar renders image when photoUrl is present, or initials when absent | Pass |
| 6 | Guest full name renders as primary heading (`h1`) | Pass |
| 7 | VIP badge renders when `guest.vipStatus === true` | Pass |
| 8 | Status badge renders with correct active/inactive styling | Pass |
| 9 | Restriction badges render when active restrictions exist | Pass |
| 10 | Contact sub-row displays phone, email, location with separator dots | Pass |
| 11 | Demographic sub-row displays ID, nationality, DOB with calculated age, language, member since | Pass |
| 12 | Company affiliation renders in header when linked | Pass |
| 13 | Primary action button is `+ New Reservation` linking to `/restaurant/bookings/new?guestId=...` | Pass |
| 14 | Secondary action button is `Edit Guest` | Pass |
| 15 | Tertiary action is `More ▾` dropdown containing secondary profile actions | Pass |
| 16 | Header back button returns to Guest Directory preserving active search/filter parameters | Pass |
| 17 | Tab strip renders 5 primary visible tabs: Overview, Personal & Contact, Identity & Documents, Preferences, Stays & Reservations | Pass |
| 18 | Tab strip renders `More ▾` dropdown for secondary views | Pass |
| 19 | `More ▾` dropdown contains: Relationships, Services, Communication & Notes, Privacy & Administration, Activity / History, Loyalty & Value | Pass |
| 20 | Active tab receives gold underline styling | Pass |
| 21 | When a secondary view is active, `More ▾` dropdown receives gold active styling | Pass |
| 22 | Default active view is `Overview` | Pass |
| 23 | Operational Overview Row 1 renders compact 6-KPI strip (Status, VIP, Last Stay, Upcoming Stay, Total Stays, Total Nights) | Pass |
| 24 | KPI strip items read like a compact summary strip, not large cards (Caution 1) | Pass |
| 25 | Operational Overview Row 2 renders 3 cards: Guest Information, Contact & Address, Upcoming Reservation | Pass |
| 26 | Guest Information card displays demographics and has Edit action | Pass |
| 27 | Contact & Address card displays phone, email, address, and View on Map only if coordinates are present (Caution 2) | Pass |
| 28 | Upcoming Reservation card displays reservation details truthfully with `—` for missing fields (Caution 3) | Pass |
| 29 | Operational Overview Row 3 renders 3 cards: Key Preferences, Identity Status, Relationships | Pass |
| 30 | Key Preferences card renders preference chips and Edit action | Pass |
| 31 | Identity Status card renders masked ID, expiration, verification badge, and View All action | Pass |
| 32 | Relationships card renders linked accounts and View All action | Pass |
| 33 | Operational Overview Row 4 renders Important Notes & Alerts card with Add Note action | Pass |
| 34 | Personal & Contact view consolidates Personal Information, Contact Channels, Residential Address, Emergency Contacts, and Employment | Pass |
| 35 | Emergency contacts render with name, relationship, phone, and email | Pass |
| 36 | URL parameters `view` and `tab` update on view switch | Pass |
| 37 | Legacy URL parameter `card=information` resolves to `personal-contact` | Pass |
| 38 | Legacy URL parameter `card=dashboard` resolves to `overview` | Pass |
| 39 | Legacy URL parameter `card=stay-history` resolves to `stays` | Pass |
| 40 | Secondary query failures (stays, links, prefs) do not crash the individual guest detail workspace | Pass |
| 41 | Company, Travel Agency, and Group detail workspaces remain untouched and route to their respective workspaces | Pass |

**Overall Test Results**: 425 passed across 61 test suites (100% green, 0 failures, 0 regressions).
