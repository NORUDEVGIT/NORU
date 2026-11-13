# NORU-UI-01 — Reservations Workspace UI/UX Audit

Scope: presentation, navigation, efficiency and consistency of every user-facing Reservations screen.
Out of scope: database, server functions, lifecycle rules, permissions model, Guest Profile.

No application code or database was changed for this audit. Every recommendation keeps all existing operational functions reachable.

Severity scale (UI/UX only):

| Level | Meaning |
|---|---|
| P0 | Function effectively unusable |
| P1 | Major operational UX issue |
| P2 | Important professional-quality improvement |
| P3 | Minor polish |

---

## 1. Executive Summary

The Reservations module covers a lot of functionality. The desk, the four-step booking wizard, the six-tab detail workspace, and the dedicated amend, cancel and no-show workspaces all cover real operational needs. They also have good loading, error and empty handling on the main desk table. The problems are mostly about **discoverability, consistency and scoping**, not missing capability:

1. **The desk table is silently scoped to the visible week.** Search, arrival filters and status filters only return stays that overlap the week or horizon shown in the toolbar. A front-desk agent who types a confirmation number for a stay next month gets "No reservations match these filters". This is the single most impactful issue.
2. **Important navigation is hidden.** There is no page title. The five Reservations sections (All, Groups & Blocks, Waitlist, Arrivals & Departures, Exceptions) sit behind a 50%-opacity burger icon. The backend-supported operational views (Arrivals, Departures, In-House, Unassigned, Pending, Groups) are fully built, and their KPI counts are already shown, but the view rail is never rendered and the KPI cards are not clickable.
3. **The same task has different UIs depending on the entry point.** Cancelling from the desk opens a full-screen three-step workspace with a blue stepper. Cancelling from the reservation detail opens a 640px front-office stepper dialog. No-show follows the same split. Amendment has three paths: the edit workspace, the `AmendDialog`, and inline editing on the Stay tab.
4. **The action hierarchy is flat.** The detail header has no visible primary CTA. Check In, Check Out and Confirm are buried in a "More" menu next to Print and Copy. Final commit buttons (Confirm / Guarantee, Confirm Changes) use the default theme primary instead of NORU gold. The cancel stepper uses an off-brand blue.
5. **Visual-system drift.** There are around 90 micro-font usages (`text-[10px]`/`text-[11px]`) in the detail tabs and about 80 in the booking flow. Native date inputs appear in at least ten places, and there are a few native selects, checkboxes and `window.confirm`/`window.alert` calls. Radii, field heights, borders and workspace backgrounds are mixed (`#F7F4EE` vs `#fbfbfb`, `#DDD4C5` vs `#e9dfd0`).

No P0 issues were found. Every function is reachable, although some only through non-obvious paths.

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 9 |
| P2 | 24 |
| P3 | 15 |

---

## 2. Current Screen Inventory

| # | Screen / surface | Host | Primary file(s) |
|---|---|---|---|
| S1 | Reservations workspace shell (KPI row, toolbar, section burger) | Route `/restaurant/pms/reservations` in `RoomInventoryChrome` | `workspaces/reservations-workspace.tsx` |
| S2 | Reservation Desk table (search, filters, chips, pagination, row ⋮) | S1, section `desk` | `reservations-workspace.tsx` (`ReservationTable` 1702–1845) |
| S3 | Filter cascade menu | Popover from S1 toolbar | `reservations/reservation-filter-menu.tsx`, `pms-filter-menu.tsx` |
| S4 | Row context menu | Dropdown | `reservations/reservation-context-menu.tsx`, `reservation-context-actions.ts` |
| S5 | Export PDF dialog | Dialog | `guests/guest-export-pdf.tsx`, `reservations/reservation-export-pdf.tsx` |
| S6 | Booking Calendar (room lanes, drag-amend review) | S1, section `calendar` | `reservations/booking-calendar.tsx` |
| S7 | Groups & Blocks list, Group detail, Create Group wizard | S1 section + overlays | `reservations/groups-workspace.tsx`, `group-detail-workspace.tsx`, `create-group-wizard.tsx` |
| S8 | Waitlist list, new request, detail | S1 section + dialogs | `reservations/waitlist-workspace.tsx` |
| S9 | Arrivals & Departures | S1 section | `workspaces/arrivals-departures-workspace.tsx`, `arrivals-departures-dialogs.tsx` |
| S10 | Exceptions (Reservation Control) | S1 section + drawer | `workspaces/reservation-control-workspace.tsx` |
| S11 | Overlay host (Dialog ≥1280px, bottom Sheet <1280px) | — | `reservations/reservation-workspace-overlay.tsx` |
| S12 | New Reservation wizard (4 steps) + Confirmation | S11 `wide`, or route `/restaurant/bookings/new` | `bookings/create-reservation-page.tsx` + 22 mounted sub-components |
| S13 | Guest selection / create guest | Inside S12 step 1, nested `GuestFormDialog`, profile peek Sheet | `bookings/create-reservation-guest.tsx` |
| S14 | Availability, room type, rate, selected-room panel, alternatives | Inside S12 step 1 | `create-reservation-room-type.tsx`, `-rate.tsx`, `-selected-room.tsx`, `-alternatives.tsx`, `-availability-filters.tsx` |
| S15 | Reservation Detail workspace (6 primary tabs, nested sections) | S11 `workspace`, or route `/reservations/$id` | `workspaces/reservation-detail-workspace.tsx` + `reservation-detail-*.tsx` |
| S16 | Amendment: Edit workspace (Edit → Review → Confirm) | S11 | `workspaces/reservation-edit-workspace.tsx` |
| S17 | Amendment: `AmendDialog` (standalone detail route) | Dialog `max-w-2xl` | `reservation-detail-workspace.tsx` 1601–2103 |
| S18 | Room type change dialog | Dialog `max-w-lg` | `workspaces/reservation-room-type-change.tsx` |
| S19 | Cancellation workspace (Review → Confirm → Complete) | S11 | `workspaces/reservation-cancel-workspace.tsx` |
| S20 | Cancellation stepper (from detail) | Dialog `max-w-[640px]` | `frontoffice/fo-cancel-noshow-stepper.tsx` |
| S21 | No-show workspace | S11 | `workspaces/reservation-noshow-workspace.tsx` |
| S22 | No-show dialog (from detail) | Dialog | `frontoffice/front-office-dialogs.tsx` |
| S23 | Assign room / Room move / Check-in / Check-out dialogs | Dialogs launched from desk and detail | `frontoffice/front-office-dialogs.tsx` |
| S24 | Print reservation / print amendment | Portaled print documents | `bookings/reservation-print-document.tsx`, `reservation-amendment-print.tsx` |

These components exist but are **not mounted** in any live Reservations screen, so they were reviewed only for drift risk: `ReservationQuickViewPanel`, `ReservationDeskMoreFilters`, the `DeskDisplayMenu`/`DeskExceptionsMenu`/`DeskAvailabilityMenu` toolbar menus, `CreateReservationSearchCriteria`, `CreateReservationPendingFields`, `CreateReservationAssociations`, `CreateReservationExtraRooms`, and, inside the workspace files, `OperationalViewsRail`, `SectionTab`, `ModeButton`, `FilterSelect`, `RESERVATION_SECTIONS`, `PricingSection` and `NotesEditor`.

---

## 3. Workspace Structure

| Element | Rating | Notes |
|---|---|---|
| Page header / title | **MISSING** | No H1 or title. `RoomInventoryChrome` renders module navigation only, and the desk starts directly with KPI cards. Staff have no "Reservations › All Reservations" anchor. |
| Subtitle / context | **MISSING** | The visible week window that silently scopes the table is not stated as a scope ("Showing stays 9–15 Nov"). |
| Primary CTA | **GOOD** | "New Reservation" uses gold `SHELL_PRIMARY_BUTTON` and sits on the right of the toolbar. It is shown only for Desk and Calendar. Other sections inject their own primary ("New Group", "New Request") into the same slot, which is consistent. |
| Section navigation | **NEEDS IMPROVEMENT** | A 32px burger at `opacity-50`, placed inside the toolbar's left padding (`reservations-workspace.tsx` 1458–1527). Section names are only visible after opening it. Table and Calendar is a separate icon-only switcher. |
| KPI row | **NEEDS IMPROVEMENT** | There are six cards: Total, Arrivals, Departures, In-House, Unassigned, Available Rooms. They are informative but not interactive, although the matching server views exist. The tones (blue, amber, emerald, orange, indigo) are off-palette, and "Available Rooms" means physical vacant rooms, not sellable availability. |
| Operational views | **MISSING (built, not rendered)** | `VIEWS` and `OperationalViewsRail` (1578–1670) support All / Arrivals / Departures / In-House / Unassigned / Pending / Groups with counts. `view` is permanently `"all"`. |
| Search | **NEEDS IMPROVEMENT** | It works: debounced, minimum two characters, matches confirmation, external reference, guest name, phone, email and room. However, it is constrained by the week window (see §5). |
| Filters | **GOOD with gaps** | One cascade menu with an active-count badge, removable chips and "Clear all". Gaps are in §5. |
| Week / horizon control | **NEEDS IMPROVEMENT** | It suits the calendar, but on the table it acts as a hidden mandatory filter that competes with the Arrival From/To filter. |
| Table | **NEEDS IMPROVEMENT** | See §4. |
| Pagination | **GOOD** | "Page x of y · n total · 25 per page" with Previous/Next. Page-size choice and jump-to-page are absent (P3). |
| Bulk actions | **N/A on desk** | They exist only in Arrivals & Departures ("Set expected arrival"). |
| Secondary actions | **GOOD** | Refresh (spinner while fetching) and Export PDF are icon buttons with tooltips. |
| Contextual actions | **GOOD** | Row ⋮ with grouped menu, and row click opens the detail. |
| Duplicated | — | The `RoomInventoryChrome` search prop is wired (`onRoomSearch`) but hidden, so it is harmless. In the detail: Print appears as a header icon and in the More menu; Assign/Change Room appears in the More menu and on the Rooms tab. |
| Unnecessary | — | Placeholder detail tabs "Communication" and "Linked Reservations", and the Alternatives panel with three permanently disabled "View" buttons. |

---

## 4. Reservation Table

### Current columns (`reservations-workspace.tsx` 1720–1745)

| Column | Visible at | Assessment |
|---|---|---|
| Res. No. | always | ESSENTIAL. Good: gold-brown link, truncates with a title tooltip. |
| Guest Name | always | ESSENTIAL. The VIP flag (`guestVip`) exists on the row but is not shown. |
| Room Type, with the room number as a 10px subline | always | ESSENTIAL. Room number is operationally as important as type and should be its own column. "Unassigned" should read as a status-like marker, not grey 10px text. |
| Arrival | always | ESSENTIAL |
| Departure | always | ESSENTIAL |
| Nights | always | ESSENTIAL (narrow) |
| Adults / Children | `2xl` only | SECONDARY. Better combined as "2 / 1" in a single Pax column. |
| Status | always | ESSENTIAL |
| Source | `lg` only, hidden at `xl`, shown again at `2xl` | SECONDARY |
| Rate Plan | `lg` only, hidden at `xl`, shown again at ≥1760px | SECONDARY |
| Total Amount (room subtotal) | `lg` only, hidden at `xl`, shown again at ≥1760px | SECONDARY |
| Actions ⋮ | always | ESSENTIAL. Good. |

**The responsive rule is inverted.** Between 1280px and 1535px (the most common desktop and laptop widths), Source, Rate Plan and Total are hidden. They reappear at the narrower `lg` width (1024–1279px) and at very wide screens. This looks like compensation for the toolbar or layout at `xl` and should be replaced by a deliberate priority order (P1).

**Balance** is not available on desk rows (`ReservationOperationalSummary` has no balance), so it is not requested here.

**Company / Travel Agent / Group name** and **external reference** exist on the row model but are not shown. They are candidates for a secondary "Account" column or a subline under Guest, not for the default view.

**Sorting:** the server accepts `sortBy` (arrival, departure, confirmation number, created) and `sortDirection`, but column headers are not sortable and the desk never sends a sort (P2).

**Density:** row padding `py-2.5` with `text-sm` is appropriate for a PMS. The header is `text-[10px]` uppercase with `0.11em` tracking, which is too small for sustained reading (P2).

### Recommended default column set

| Priority | Columns |
|---|---|
| ESSENTIAL | Status · Res. No. · Guest (+ VIP marker) · Arrival · Departure · Nights · Room Type · Room · ⋮ |
| SECONDARY (show from ~1440px, or via a column chooser) | Rate Plan · Total · Source · Pax (A/C) |
| REMOVE FROM DEFAULT VIEW | Separate Adults and Children columns (merge into Pax) |

---

## 5. Search & Filters

**Supported by the backend** (`search.server.ts` 30–65, `reservation-desk-filters.ts`):

- Search: confirmation number (exact and prefix), external reference, guest name, phone and email, room number.
- Filters: status (multi), arrival and departure ranges, room type, room, unassigned, guest, VIP, source, commercial booking source, market segment, rate plan, company, travel agent, group, operational view, sort.

**Exposed in the UI:** everything above except **operational view**, **sort**, and the **departure range on the desk** (departure appears in the cascade "Arrival/Departure" submenu, and is otherwise only in the unused More Filters sheet).

| Finding | Severity |
|---|---|
| **Week-scoped search.** The desk always sends `stayOverlapStart`/`stayOverlapEnd` from the week control (`reservations-workspace.tsx` 506–507, applied in `search.server.ts` 382–383). Searching a confirmation number or guest outside the visible week returns an empty result, and the empty state blames "filters". | P1 |
| **Hidden important filters.** Arrivals, Departures, In-House, Unassigned, Pending and Groups views exist with counts but have no UI entry. Staff must rebuild them manually from the status and assignment filters. | P1 |
| **Overcrowded single menu.** One cascade menu holds 14 filter groups plus calendar display options. Status and Room Type, the two most-used filters, need two clicks each. | P2 |
| **Two competing date scopes** (week window and Arrival From/To) with no explanation of how they combine. | P2 (part of the P1 above) |
| **Native date inputs** inside the filter submenus (`reservation-filter-menu.tsx` ~499–515). | P2 |
| **Active state:** good. There is a count badge on the trigger, removable chips, and "Clear all". The week window is not shown as a chip, even though it filters. | P2 |
| **Inconsistent controls across sections.** The desk uses the cascade menu; Groups, Waitlist and Exceptions use `PmsFilterPopover`/`PmsFilterSelect` in a shell slot. Waitlist builds `filterChips` but never renders them. | P2 |
| The trigger label is a "Filter" icon button, and its test id says "more-filters" although it is the only filter control. Not user-facing; noted for implementation clarity. | P3 |

---

## 6. New Reservation

### Current flow (`create-reservation-page.tsx` 268–277, stepper 3703–3752)

1. **Guest, Stay & Availability**: Single/Group toggle → three cards (Guest Search | Selected Guest | Stay) → "Check Availability" → room types with an inline rate table, plus a 300px sticky "Selected Room & Rate" panel (`xl` and up).
2. **Booking Details**: source, channel, market segment, external reference; Company / Agent / Group tabs; packages; guest requests; special requests; internal notes; room assignment.
3. **Policies & Payment**: guarantee type, method, reference, deposit due, card fields; read-only cancellation, no-show and early-departure policies; price reminder.
4. **Review & Confirm**: summary cards, each with Edit; Print; footer actions "Save as Pending" and "Confirm / Guarantee".
5. **Confirmation**: replaces the wizard. It lists the details and offers Check-in, Print, Open reservation, Return to desk and Create another. "Send Confirmation" is disabled.

The flow is hosted in the overlay (Dialog up to 1680×1080 at ≥1280px, full-height bottom Sheet below that) or on a full route.

### What works

- A clear four-step stepper with a sticky footer (Cancel and Back on the left, gold Continue on the right).
- The selected-room summary stays visible while browsing rates on desktop.
- Stale-availability messaging appears when dates change after a search.
- Review cards deep-link back to their step.
- AlertDialogs are used for discard and type changes instead of `window.confirm`.

### Friction points

| Issue | Where | Severity |
|---|---|---|
| **Continue disabled without a visible reason** when the room-type or rate preference filters do not match the selection (`page.tsx` ~1956–1959). Some blockers (group issue, source channel) do show helper text; this one does not. | Step 1 footer | P1 |
| **Stepper allows jumping to any step** without validation (`3725–3727`), so staff can reach Review with gaps and then bounce back. | Stepper | P2 |
| **Step 1 is very long.** Guest + stay + (group rooming) + availability + rates are stacked, and the footer Continue is far below. "Modify Search" and "Change" are scroll jumps. | Step 1 | P2 |
| **Two gold primaries on one screen**: "Check Availability" in the Stay card and "Continue" in the footer. | Step 1 | P2 |
| **Special requests entered twice.** A single-line input on the Stay card and a textarea on step 2 share the same state, so staff are unsure where to type. | Steps 1 and 2 | P2 |
| **Alternatives panel is not actionable**: three cards with disabled "View" and placeholder copy. | No-availability state | P2 |
| **Occupancy soft warning contradicts itself.** One message says creation is blocked; the soft-warn UI says you can continue (`room-type.tsx` 120–122 vs `phase1-section4.ts` 94–95). | Step 1 | P2 |
| **Final commit uses the default theme primary** ("Confirm / Guarantee"), not NORU gold, while every earlier Continue is gold. | Step 4 footer | P2 |
| **Native controls**: date inputs for arrival, departure and deposit due; number inputs for counts (no steppers); native select for currency and unit block; native checkboxes in the availability filters. | Steps 1 and 3 | P2 |
| **Jargon**: "Confirm / Guarantee", "Market Segment", "Unit block", "Pickup", and "deposit" vs "payment received" vs "guest deposit" side by side. | Steps 2 and 3 | P3 |
| **Developer copy on the confirmation screen**: "Not returned by the create writer" for created-at and created-by. | Confirmation | P2 |
| **Group: preferences per room unclear** on step 2. The rooming summary only offers "Edit in Step 1". | Step 2 | P3 |
| **Loading is text-only** ("Searching guests…", "Checking availability…"). No skeletons for room-type and rate results. | Step 1 | P3 |
| **Nested modal**: "Create New Guest" opens `GuestFormDialog` on top of the overlay Dialog. Acceptable, because the overlay blocks dismissal while a nested layer is open, but it is a modal-in-modal. | Step 1 | P3 |

---

## 7. Reservation Details

### Structure (`reservation-detail-workspace.tsx` 1024–1260)

- Dark header `#1F140A`: `{confirmation} · {guest}` + status badge + KPI pills; icons for Print, More and Close.
- Sub-bar: arrival → departure, nights, room, total, paid, deposit.
- Primary tabs: **Overview · Stay & Rooms (Stay / Room / Rates / Packages) · Guest · Folio & Payments · Requests & Notes (Requests / Notes & Traces / Communication) · History (History / Linked Reservations)**.
- Most tabs have a right summary rail (280–310px, sticky) from `xl`.

### Separation against the target model

| Domain | Present? | Assessment |
|---|---|---|
| Booking (source, segment, policies, guarantee) | Partially | Spread across Overview cards and amendment screens. There is no dedicated Booking section. |
| Guest | Yes | Guest tab plus an Overview card. |
| Stay / Rooms | Yes | Good split: Stay, Room and occupants. |
| Rate | Yes | The Rates tab is under "Stay & Rooms" and reachable only via the nested section dropdown. |
| Payment / Folio summary | **Over-built** | The Folio tab offers Post Charge, Post Payment, Create Invoice, Deposit credit, Refund, Discount, Adjustment and Close folio, which duplicates Cashiering posting. "Open in Cashiering" is available. |
| Notes / Traces | Yes | Requests & Notes tab. |
| History | Yes | A real audit table with coloured event dots. |
| Actions | Weak | Header "More" menu only. No visible primary action. |
| Communication / Linked Reservations | Placeholder | Visible tabs with "deferred" copy. |

### Findings

| Issue | Severity |
|---|---|
| **No visible primary action.** The contextual next step (Confirm, Check In or Check Out) is a menu item in "More", listed next to Copy and Print. | P1 |
| **Folio tab duplicates Cashiering posting.** Keep access, but present it as a summary (balance, paid, deposit, last postings) and move posting actions behind one "Folio actions" menu that clearly hands off to Cashiering's dialogs. Access must not be removed. | P2 |
| **Nested sections hidden in a dropdown** (`DetailSectionMenu`). Rates and Packages are two clicks away. | P2 |
| **No Booking / commercial section.** Source, segment, guarantee and policies are only read on Overview and edited elsewhere. | P2 |
| **Placeholder tabs visible** (Communication, Linked). | P2 |
| Save buttons on tabs use dark brown `#251605`; Folio Post Charge and the amend confirm use the default primary. Inconsistent commit styling. | P2 |
| The Overview card "edit" affordance is disabled (`onEditTab`/`editable` voided in `overview.tsx` 216–217), so there is no jump from a card to its tab. | P3 |
| Print appears twice (header icon and menu). | P3 |
| About 90 micro-font usages (30 × `text-[10px]`, 60 × `text-[11px]`) across `reservation-detail*.tsx`. | P2 (counted in §13) |

---

## 8. Actions

### Inventory and classification

| Action | Where | Current style | Classification | Issue |
|---|---|---|---|---|
| New Reservation | Desk toolbar | Gold | PRIMARY | Good |
| New Group / New Request | Section toolbars | Gold (shell slot) | PRIMARY | Good |
| Open reservation | Row click, Res. No. link, ⋮ | Link / menu | ROW ACTION | Good |
| Edit reservation | ⋮, detail More | Menu item | ROW / CONTEXTUAL | Three different amendment UIs (see §9) |
| Assign room / Change room | ⋮, detail More, Rooms tab | Menu item | CONTEXTUAL | Duplicated in the detail (acceptable, but label consistently) |
| Confirm (pending → confirmed) | ⋮, detail More | Menu item, executes immediately | CONTEXTUAL / PRIMARY in detail | Should be the visible primary in the detail when pending |
| Check In / Check Out | ⋮, detail More, A&D inline (gold) | Menu item; gold in A&D | CONTEXTUAL / PRIMARY in detail | Gold in A&D but hidden in the detail |
| Copy stay | ⋮, detail More | Menu item, executes immediately and opens the copy | SECONDARY | Creates a reservation with no confirmation step (P2) |
| Reactivate | ⋮, detail More | Menu item | CONTEXTUAL | — |
| Cancel reservation | ⋮ (red), detail More (red) | `text-destructive` | DANGEROUS | Good in menus. The desk and detail flows differ (P1). The cancel workspace uses a blue stepper (P2). |
| Mark No-Show | ⋮ (**not red**), detail More (red) | Mixed | DANGEROUS | Inconsistent destructive styling (P2) |
| Open Folio | detail More, ⋮ (suppressed on desk) | Menu item | CONTEXTUAL | Wired as a no-op on the desk (`reservations-workspace.tsx` 749–750) and hidden by `allowOpenFolio`. Acceptable, but staff on the desk have no folio shortcut. |
| Print | detail header icon + More, review, edit confirm, cancel | Icon / outline | SECONDARY | Duplicated in the detail header |
| Export PDF | Desk toolbar icon | Outline icon | SECONDARY | Good |
| Save as Pending | New res. footer | Outline | SECONDARY | Good |
| Confirm / Guarantee | New res. footer | **Default primary** | PRIMARY | Should be gold |
| Review Changes / Confirm Changes | Edit workspace | **Default primary** | PRIMARY | Should be gold |
| Confirm Cancellation / Process No-Show | Cancel / no-show workspaces | `destructive` red | DANGEROUS | Good |
| Discard draft (AlertDialog) | New res. | Default action style | DANGEROUS | Should use destructive styling (P3) |
| Waive fee | Cancel / no-show confirm step | Inline | CONTEXTUAL | — |

### Rules to adopt

- **One gold primary per surface.** In the detail header, the gold button is the lifecycle next step (Confirm, Check In, or Check Out). On wizard and amendment footers, gold is the forward or commit action.
- **Dangerous actions** (Cancel, No-Show, Discard) always get destructive text in menus and a destructive confirm button. They are never gold and never the only prominent button.
- Row ⋮ group order stays as is (View & Edit · Reservation · Front Office · Cashiering), with a separator before the destructive group.

---

## 9. Modals & Drawers

| Surface | Type / size | Findings | Severity |
|---|---|---|---|
| Overlay host | Dialog `min(98vw,1680px) × min(94vh,1080px)` (`wide`), `min(90vw,1440px) × 92vh` (`workspace`); bottom Sheet `h-dvh` below 1280px | Near full-screen dialog for every workspace. Reasonable for a PMS. Below 1280px it becomes a bottom sheet, which is unusual on landscape tablets. | P2 |
| Overlay header | Hidden (`hideVisualHeader`) for detail, edit, cancel and no-show; the default ✕ is also hidden | Each workspace must provide its own close. **The Edit workspace's Edit Details step has no Close or Back button**, so dismissal relies on Escape or an outside click. | P1 |
| Edit close guard | `window.confirm("Close without saving…")`, also on multi-room unit switch | Native browser dialog inside a branded UI | P2 |
| Overlay chaining | detail → edit → cancel **replaces** the content; there is no back stack | After Edit → Confirm the user lands back in the detail via "Open reservation", which is fine. Cancel from Edit loses the edit context; acceptable but undocumented. | P3 |
| `AmendDialog` | `max-w-2xl max-h-[90vh] overflow-y-auto`, `z-[70]` | A second amendment UI that is only used on the standalone detail route. Native date inputs. | P1 (with S16) |
| `FoCancelStepper` (detail) vs `ReservationCancelWorkspace` (desk) | 640px dialog vs full overlay | Same task, two layouts, two stepper styles | P1 |
| `NoShowDialog` (detail) vs `ReservationNoShowWorkspace` (desk) | Dialog vs full overlay | Same as above | P1 (same finding) |
| `RoomTypeChangeDialog` | `max-w-lg`, Review Impact → Confirm | Good two-step pattern | — |
| Guest / notes / request / companion dialogs | `max-w-md`/`max-w-lg`, `rounded-2xl` | Consistent Cancel then Save order | — |
| `GuestFormDialog` in the booking flow | Nested over the overlay | Modal-in-modal; dismissal is protected | P3 |
| Calendar move review | `max-w-lg`, native date | Native date input | P2 (counted in §13) |
| Waitlist new / detail | 720px / 860px dialogs, dark header | A different header style from the reservation overlay | P3 |
| Group detail | Overlay `wide`, nested `max-w-lg` edit and allotment dialogs | Native `<select>` in the edit dialogs | P2 (counted in §13) |
| Button order | Footers are mostly Cancel/Back on the left and the primary on the right | Edit workspace details step: only "Review Changes", no Cancel. Cancel workspace header has outline View/Print buttons; no-show has a "More" dropdown for the same actions. | P3 |

---

## 10. Status Design

`ReservationStatusBadge` (`bookings/reservation-bits.tsx` 6–22): a `rounded-full px-2.5 py-1 text-xs font-semibold` pill.

| Status | Label | Colour | Issue |
|---|---|---|---|
| pending | Pending | amber `bg-amber-500/15 text-amber-700` | Raw Tailwind amber instead of a token |
| confirmed | Confirmed | `success` green | Good |
| checked_in | In-House | `primary` | Depends on the theme primary, which can read close to gold. Label is good. |
| checked_out | Checked Out | muted grey | Good |
| cancelled | Cancelled | destructive red | **Identical to No-Show** |
| no_show | No-Show | destructive red | **Identical to Cancelled** |

Findings:

- Cancelled and No-Show cannot be told apart by colour (P2). Recommendation: keep red for Cancelled and use a distinct dark rose or brown outline style for No-Show, with an icon or dot so colour is not the only cue.
- In the detail header the pill sits on dark `#1F140A`, where the translucent backgrounds (`/10`, `/15`) lose contrast (P2).
- The overlay description uses `status.replaceAll("_", " ")`, producing lowercase "checked in" instead of the badge label "In-House" (P3).
- Lifecycle logic is unchanged by these recommendations.

---

## 11. Empty / Loading / Error States

| State | Desk | Calendar | Groups / Waitlist / A&D / Exceptions | New reservation | Detail | Edit / Cancel / No-show |
|---|---|---|---|---|---|---|
| No reservations | ✅ "No reservations in this view" | ✅ | ✅ | — | — | — |
| No search results | ⚠️ Present, but blames "filters" when the cause is the week window | ✅ | ✅ (Waitlist chips missing) | ✅ guest search "No matching guests" | — | — |
| No availability | — | Popover only | — | ⚠️ Alternatives panel is non-functional | — | Edit shows availability errors inline |
| Loading | ✅ Skeleton rows + "Updating results…" | ✅ Skeleton | ✅ Skeletons | ⚠️ Text only | ⚠️ "Loading reservation…" text only | ⚠️ Centered text only |
| Failed load | ✅ Inline error + Try again | ✅ Error + retry | ✅ Error + retry | ⚠️ Toast | ✅ Not-found card | ✅ Destructive text, **no retry** |
| Failed save | — | Toast | Toast | ⚠️ Toast only, form not annotated | ⚠️ Toast dominant | ⚠️ Toast plus some inline banners |
| Validation | ✅ Date-range error under the toolbar | — | ✅ Inline (wizard) | ⚠️ Mixed: inline helper, disabled Continue without reason, toasts | Inline in AmendDialog | ✅ Review-step validation banner (Edit) |
| Permission denied | ✅ `PmsRouteGate` | ✅ | ✅ | ✅ Denied card | ✅ Denied card | ❌ **Edit workspace has no denied UI** and may stay on "Loading" |
| Placeholder / deferred | — | — | — | Disabled "Send Confirmation" | Communication / Linked tabs | Disabled communication checkboxes (Cancel) |

Missing or weak:

1. Search-out-of-window empty state (P1, tied to §5).
2. Edit workspace permission-denied state (P2).
3. Skeletons for detail, edit, cancel and no-show, and for availability results (P2).
4. Retry on failed load in edit, cancel and no-show (P2).
5. Inline error persistence after a failed save; toasts disappear (P2).
6. A proper "No availability" state with clear next steps (change dates, change occupancy, open the calendar) instead of disabled alternatives (P2).

---

## 12. Desktop / Tablet

| Area | Desktop (≥1280) | Tablet (768–1279) | Severity |
|---|---|---|---|
| Desk table | Fixed layout, no horizontal scroll. Source, Rate and Total hidden at 1280–1535 (and Rate and Total up to 1759). | `min-w-[760px]` with `overflow-x-auto` below `lg`. Acceptable. | P1 (inverted priority) |
| KPI row | 6 columns | 3 columns on `sm`, 2 on mobile. Takes two rows on tablet portrait and pushes the table down. | P3 |
| Toolbar | Single row | Wraps (week, horizon, search, filter, refresh, export, view, CTA). The CTA can wrap to a second line. | P2 |
| Section nav | Burger | Same burger | (P1 in §3) |
| Overlay | Dialog | **Bottom Sheet, full height**, including landscape tablets (1024–1279) | P2 |
| New reservation | 3-column guest/stay row; 300px sticky summary at `xl` | Summary stacks below the results, so on tablet staff scroll away from the selection | P2 |
| Detail | Rails at `xl` | Rails stack; primary tabs scroll horizontally (`overflow-x-auto`) without an edge fade, so hidden tabs are not obvious | P2 |
| Tables in the detail | Folio `min-w-[760px]`, History `max-lg:min-w-[720px]` | Horizontal scroll | P3 |
| Edit workspace | 320px aside at `xl` | Aside hidden; the change summary is only visible on the Review step | P3 |
| Sticky actions | Wizard footer and tab save bars are sticky | Same | — (good) |
| Booking calendar | `min-w-[720px]` board, sticky room column | Horizontal scroll | — (acceptable) |

There is no dedicated mobile layout, and none is recommended for this staff PMS.

---

## 13. NORU Consistency

| Rule | Status | Evidence |
|---|---|---|
| Warm off-white workspace | ⚠️ Mixed | `#F7F4EE` (desk, overlay, cancel) vs `#fbfbfb` (edit, no-show) |
| Dark brown primary typography | ⚠️ Mixed | `#251605` vs `#4a2c1a` headings (edit, no-show) vs default `foreground` |
| Gold primary CTA | ⚠️ Mixed | Gold for New Reservation, Continue, Check Availability, A&D Check-in, Quick view. Default primary for Confirm / Guarantee, Confirm Changes, Exceptions drawer, Folio Post Charge. Dark brown for tab Save buttons. Gold variants `#c9a24a`, `#B98B2D` and `#D3A13B` also appear. |
| Green success | ✅ Mostly | `success` token; the no-show completion banner is gold instead of green |
| Custom dropdowns | ⚠️ | Native `<select>` in currency, unit block, Packages room unit, group detail edit and allotment dialogs, and the mobile module nav |
| Custom date pickers | ❌ | Native `type="date"` in Stay, Guarantee, Edit, AmendDialog, Stay tab edit, guest companion, filter menu, calendar move, waitlist, group wizard and detail |
| Native browser dialogs | ❌ | `window.confirm` (edit close, multi-room switch), `window.alert` (PDF popup blocked) |
| Consistent table style | ⚠️ | Header `text-[10px]` (desk, waitlist) vs `text-[11px]` (groups, exceptions); `PMS_OP_TABLE_SHELL` used in groups only |
| Consistent field height | ❌ | `h-7`, `h-8`, `h-9`, `!h-9`, `h-10`, `min-h-10` all present |
| Consistent radius | ❌ | `rounded-[6px]`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` on equivalent surfaces |
| Consistent borders | ⚠️ | `#DDD4C5` vs `#e9dfd0` vs `#efe7d8` vs `border-border` |
| Consistent modal / drawer style | ⚠️ | Overlay (light, hidden header), waitlist (dark header + gold rule), create group (`headerTone="noru"`), cancel stepper (blue) |
| `⋮` row actions | ⚠️ | Desk and calendar use `MoreHorizontal` (horizontal ⋯), waitlist uses `MoreHorizontal`, groups have none, A&D use inline buttons, Exceptions has no row action column. Pick one icon (⋮ `MoreVertical` per the NORU rule) and use it everywhere. |
| No duplicate CTAs | ⚠️ | Two gold primaries on booking step 1; Print ×2 in the detail; group detail "Add Allotment" in the header and the tab |
| Micro typography | ❌ | About 90 (detail) + about 80 (booking flow) + desk/filter/menu usages of `text-[10px]`/`text-[11px]`, plus `text-[9px]` in the calendar and views rail |

---

## 14. Prioritized Findings

### P0 — none

### P1 — major operational UX issues (9)

| ID | Finding | Screen | Evidence |
|---|---|---|---|
| P1-01 | Desk search and filters are silently restricted to the visible week or horizon. Searching outside it returns a misleading "no match". | S2 | `reservations-workspace.tsx` 506–507; `search.server.ts` 382–383; empty state 1123–1145 |
| P1-02 | Backend operational views (Arrivals, Departures, In-House, Unassigned, Pending, Groups) and their counts have no UI entry. KPI cards are not clickable. | S1, S2 | `VIEWS` 190–203, `OperationalViewsRail` 1578 (unused), `view` fixed at `"all"` |
| P1-03 | No page title. Section navigation is hidden behind a 50%-opacity burger icon. | S1 | 1458–1527 |
| P1-04 | Table column priority is inverted. Rate Plan, Total and Source are hidden at the most common desktop widths (1280–1535/1759px). | S2 | 1735–1743 |
| P1-05 | Cancel and No-Show have two different UIs depending on the entry point (desk workspace vs detail dialog). | S19–S22 | `reservation-detail-workspace.tsx` 592–649; `reservations-workspace.tsx` 763–768 |
| P1-06 | Three amendment UIs (Edit workspace, `AmendDialog`, inline Stay tab edit). | S15–S17 | detail 508–511, 1601–2103; edit workspace |
| P1-07 | The Edit workspace has no visible Close or Back on its first step; the overlay ✕ is hidden. | S16, S11 | overlay 205/223; edit 1593–1599 |
| P1-08 | The detail header has no visible primary action. Confirm, Check In and Check Out are buried in the "More" menu. | S15 | `reservation-actions.ts` 214–220; detail 1534–1598 |
| P1-09 | New reservation Continue can be disabled with no visible reason (preference filter mismatch). | S12 | `create-reservation-page.tsx` ~1956–1959, 3683–3686 |

### P2 — professional-quality improvements (24)

| ID | Finding |
|---|---|
| P2-01 | No sortable columns, although the server supports arrival, departure, confirmation and created sorting. |
| P2-02 | Room number is a 10px subline under room type; it needs its own column. VIP is not shown. |
| P2-03 | The single filter menu is overcrowded (14 groups). Status and Room Type need two clicks. |
| P2-04 | The week window is not shown as an active scope chip, and its interaction with Arrival From/To is unexplained. |
| P2-05 | Filter controls differ by section; Waitlist does not render filter chips. |
| P2-06 | Booking stepper allows jumping ahead without validation. |
| P2-07 | Booking step 1 is too long; two gold primaries on one step. |
| P2-08 | Special requests input is duplicated between steps 1 and 2. |
| P2-09 | Alternatives panel is non-functional (disabled View buttons). |
| P2-10 | Occupancy soft-warn messaging is contradictory. |
| P2-11 | Final commit buttons (Confirm / Guarantee, Review/Confirm Changes, Exceptions drawer, Folio Post Charge) are not gold; tab Save buttons are dark brown. |
| P2-12 | Developer copy is visible ("Not returned by the create writer"). |
| P2-13 | Folio & Payments tab duplicates Cashiering posting. Convert it to a summary plus a hand-off actions menu while keeping access. |
| P2-14 | Detail nested sections (Rates, Packages, Notes, Communication, Linked) are hidden in a dropdown; there is no Booking/commercial section. |
| P2-15 | Placeholder tabs (Communication, Linked Reservations) are visible. |
| P2-16 | Mark No-Show is not styled destructive in the row menu; the cancel stepper uses off-brand blue `#1F6FEB`. |
| P2-17 | Copy stay creates a reservation immediately with no confirmation step. |
| P2-18 | Cancelled and No-Show badges are identical; translucent badges lose contrast on the dark detail header. |
| P2-19 | Native date inputs (10+ places) and native selects (5 places) instead of NORU custom controls. |
| P2-20 | `window.confirm`/`window.alert` usage (edit close guard, multi-room switch, PDF popup). |
| P2-21 | Micro typography (`text-[9px]`–`text-[11px]`) is widespread. |
| P2-22 | Mixed radii, field heights, borders and workspace backgrounds across reservation screens. |
| P2-23 | Missing or weak states: Edit permission-denied, skeletons in detail/edit/cancel/no-show/availability, retry on failed load, inline errors after failed save, actionable "no availability". |
| P2-24 | Tablet: the overlay becomes a bottom sheet on landscape tablets; the booking summary rail stacks away from the results; detail tabs scroll without an edge affordance; the toolbar wraps the CTA. |

### P3 — minor polish (15)

| ID | Finding |
|---|---|
| P3-01 | KPI tones (blue, indigo, orange) are off-palette; "Available Rooms" label is ambiguous (physical vacant). |
| P3-02 | Pagination has no page size or jump-to-page. |
| P3-03 | Adults/Children should be one Pax column. |
| P3-04 | Print is duplicated in the detail header and menu. |
| P3-05 | Overview cards have no jump-to-tab edit affordance. |
| P3-06 | Overlay description shows a raw lowercase status ("checked in"). |
| P3-07 | Discard-draft AlertDialog action is not destructive-styled. |
| P3-08 | Cancel workspace header (outline buttons) vs no-show header (More menu) are inconsistent. |
| P3-09 | No-show completion banner is gold instead of success green. |
| P3-10 | Jargon labels ("Confirm / Guarantee", "Unit block", "Pickup", three deposit terms). |
| P3-11 | Text-only loading in booking guest search and availability. |
| P3-12 | Nested `GuestFormDialog` over the overlay. |
| P3-13 | Row action icon is ⋯ (`MoreHorizontal`) rather than the NORU ⋮, and sections use mixed patterns (inline buttons, none, ⋯). |
| P3-14 | Group detail "Add Allotment" CTA is duplicated in the header and tab; A&D and Exceptions compute KPIs that are never rendered. |
| P3-15 | Unmounted or duplicate UI components (Quick View, More Filters sheet, toolbar menus, search-criteria, pending-fields, associations, extra-rooms, PricingSection, NotesEditor, views rail) are a drift risk and should be wired or retired during implementation. |

---

## 15. Recommended Target Design

### 15.1 Workspace shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Reservations                                               [+ New Reservation]│  ← H1 + one gold CTA
│ All Reservations · Groups & Blocks · Waitlist · Arrivals & Departures · Exceptions │  ← visible section tabs
├──────────────────────────────────────────────────────────────────────────────┤
│ [All 128] [Arrivals 14] [Departures 9] [In-House 42] [Unassigned 6] [Pending 3] [Groups 11] │  ← clickable view pills (existing server views)
├──────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search confirmation, guest, phone, email, room…  [Status ▾] [Room type ▾] [Dates ▾] [More filters (n)] │
│ Scope: Stays 9–15 Nov ✕ · Status: Confirmed ✕ · Clear all          [⟳] [⤓] [Table|Calendar] │
├──────────────────────────────────────────────────────────────────────────────┤
│ Status │ Res. No. │ Guest ★ │ Arrival ▾ │ Departure │ Nts │ Room type │ Room │ Rate │ Total │ ⋮ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The KPI row is replaced by (or merged into) the clickable view pills, so counts and filters become one thing.
- The week window becomes an explicit, removable **scope chip**. When a search term is entered, the UI offers "Search all dates" (or auto-widens if implementation allows within the existing API). No new backend field is needed: omitting `stayOverlapStart`/`stayOverlapEnd` is already supported.
- Status, Room Type and Dates get first-level filter buttons. Everything else stays in "More filters".

### 15.2 Reservation table

- Essential columns always visible; secondary columns ordered by priority (Rate → Total → Source → Pax), dropping in that order as width decreases. Never hide-then-show across breakpoints.
- Sortable headers for Arrival, Departure, Res. No. and Created (existing server sort).
- VIP star next to the guest. "Unassigned" shown as a subtle amber room-cell marker.
- Header at 11–12px, body at 13–14px, row height around 44px.
- Row ⋮ uses `MoreVertical`, keeps the current groups, and adds a separator and destructive text for both Cancel and No-Show.

### 15.3 New reservation

- Keep the four steps. The stepper only allows going back to completed steps or forward to the next valid step.
- Step 1: a two-row layout. A compact "Stay & Guest" bar (dates, nights, rooms, pax, guest chip with change and create) sits on top; availability and rates fill the main area; the selected-room summary is sticky on the right from `lg` (not only `xl`).
- "Check Availability" becomes a secondary/outline search button (or auto-search on valid input). Only the footer Continue is gold.
- A single special-requests field on step 2.
- Every disabled Continue shows a one-line reason next to it.
- A real "No availability" state: message plus "Change dates", "Change occupancy" and "Open Booking Calendar". The disabled alternatives cards are hidden until they are functional.
- Final "Confirm Reservation" (relabelled from "Confirm / Guarantee") in gold; "Save as Pending" outline to its left.
- NORU date-range picker and steppers for counts; custom select for currency and unit block.

### 15.4 Reservation detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ R-24017 · Ada Lovelace ★   [Confirmed]          [Check In]  [Edit]  [⋮]  [✕] │  ← gold = lifecycle next step
│ 12 Nov → 15 Nov · 3 nights · Deluxe King · Room 101 · Total £540 · Paid £0     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview │ Booking │ Guest │ Stay & Rooms │ Rates & Packages │ Folio Summary │ Notes & Requests │ History │
└──────────────────────────────────────────────────────────────────────────────┘
```

- A visible gold **next-step** button (Confirm, Check In or Check Out, per current lifecycle rules), an outline **Edit**, and ⋮ for the rest. Cancel and No-Show go in a separated destructive group at the bottom of ⋮.
- A new **Booking** tab that groups the existing source, segment, guarantee, policy and account-master fields (read-only, with the existing edit entry points).
- Rates & Packages promoted to a top-level tab; no nested section dropdown.
- **Folio Summary**: balance, paid, deposit and recent postings, plus a "Folio actions" menu (Post charge, Post payment, Invoice, Refund, …) that opens the existing Cashiering dialogs, and "Open in Cashiering". All access is retained.
- Communication and Linked tabs hidden until available, or shown as a disabled tab with a tooltip.
- Status badge on the dark header uses solid, high-contrast variants.

### 15.5 Amendment, cancellation, no-show

- **One UI per task** regardless of entry point. Desk ⋮ and detail ⋮ both open the same Edit, Cancel and No-Show workspaces in the overlay (or the same dialog, if the dialog is preferred). The business logic each calls stays unchanged.
- The Edit workspace gets a visible header ✕ and a "Cancel" button on every step, with the unsaved-changes guard rendered as a NORU AlertDialog.
- Cancel and no-show steppers use the same gold/brown stepper as Edit; the confirm button stays destructive red; the completion banner is success green.

### 15.6 Status palette

| Status | Treatment |
|---|---|
| Pending | Amber (token) |
| Confirmed | Green success |
| In-House | NORU brown solid with light text |
| Checked Out | Neutral grey |
| Cancelled | Red |
| No-Show | Dark rose or outlined red with an icon |

### 15.7 Visual tokens to enforce across Reservations

- Workspace background `#F7F4EE`; cards white with `#DDD4C5` border, one radius (`rounded-lg`, 8px) for cards, 6px for fields and buttons.
- Field and button height 36px (`h-9`) for toolbars and dense forms, 40px (`h-10`) for wizard forms. Pick one per context and apply it everywhere.
- Typography floor of 11px (labels and table headers) and 13px (body). Remove 9 and 10px.
- Gold `#C89933` only for the single primary per surface; dark brown `#251605` for text; destructive red only for dangerous confirms.
- NORU custom date picker, select and checkbox everywhere; no `window.confirm` or `window.alert`.
