# NORU PMS — Rate & Revenue Phase 1 Prompt 1 audit

| Field | Value |
|---|---|
| **Classification** | Architecture / regression-protection baseline. **Not** a Functional Spec. **Not** approval to implement UI-01–UI-40. |
| **Date** | 2026-09-24 |
| **Scope** | Read-only audit of current Rate & Revenue + Property Setup Card 3/6 + pricing engine. No redesign, no schema, no pricing-engine change. |
| **Code wins** | Where product language and code disagree, this file records the code. |

This record established a verified baseline before Prompt 2. **Prompt 2 (responsibility refactor) is implemented** in product copy and Rate & Revenue UI. Living ownership: [`rate-revenue-responsibility.md`](./rate-revenue-responsibility.md).

**Prompt 2 correction:** the Prompt 1 claim that Room & Inventory chrome/availability/calendar files do not exist was **stale relative to current main**. Prompt 3 treats those files as the layout reference and does not modify them.

**Prompt 3:** operational command chrome and primary/secondary navigation are implemented. Living IA: [`rate-revenue-workspace.md`](./rate-revenue-workspace.md). This audit remains the Prompt 1 baseline; later sections that describe the four-tab page are historical.

---

## 1. Executive summary

Current Rate & Revenue is still a **Phase 6G configuration workspace** (plans, calendar, restrictions, snapshot-based KPIs), not an operational Revenue-team working space.

Property Setup Card 3 already **duplicates** rate-category / rate-plan / calendar-override writes against the **same** `hotel_rate_*` tables. Card 3 commercial restrictions, promotions, seasons, and corporate contract rates are **separate catalogues** and are **not** consumed by the pricing engine.

The pricing engine (`price_hotel_stay` and companions in migration `0016`) is **protected infrastructure**. Reservation snapshots are stored on `hotel_reservations` and are **not** rewritten when calendar rates change — only explicit create / amend-with-stay-change / `reprice_hotel_reservation` rewrite them.

**Do not merge** `hotel_rate_restrictions` (enforced, date+plan operational rows) with `pms_commercial_restrictions` (Property Setup catalogue, not read by `price_hotel_stay`).

**Prompt-vs-code contradictions (do not guess):**

- Files `room-inventory-chrome.tsx`, `room-inventory-availability.tsx`, and `room-inventory-calendar.tsx` **do not exist**. Canonical Room & Inventory is `/restaurant/pms/room-inventory` → `RoomsWorkspace` (simple tabs). The mature operational chrome lives on **Front Office** (`PmsCommandChrome` / `FrontOfficeChrome`).
- UI-01–UI-40 identifiers are **absent** from this repository. Gaps below are inferred from the requested architecture vs CURRENT code, not from an in-repo screen catalogue.
- Property Setup **card numbers** in the hub match 1–8, but some **legacy programme ids** still name older SET domains (e.g. Card 4 id `housekeeping-maintenance` while the live title is Guest & Services). Ownership below is from **live titles + tables**, not those ids.
- Generated `src/integrations/supabase/types.ts` `hotel_reservations` row is **stale** versus later migrations (`company_master_id`, commercial fields). Runtime SQL/functions use the later columns.

---

## 2. Current Rate & Revenue architecture

| Layer | Location | Role today |
|---|---|---|
| Canonical route | `src/routes/restaurant/pms/rates-revenue.tsx` | Auth + `requireRoutePackage("pms")`. Search `?tab=`. **Prompt 2 default is overview.** `?tab=plans\|calendar\|restrictions` still work. `module="configuration"` deferred to Prompt 3. |
| Legacy redirect | `src/routes/restaurant/bookings/rates.tsx` | Redirects to canonical route. |
| Workspace | `src/packages/pms/components/workspaces/rates-workspace.tsx` | **PMS · Rate & Revenue** (operational copy). Four tabs. Owner/manager gate via `getRatesAccess`. |
| UI | `src/packages/pms/components/rates/rates-tabs.tsx` | Overview KPIs; **read-only** plan reference; calendar overrides; restriction grid. Master CRUD removed from RR UI (server fns kept). |
| Server writes | `src/packages/pms/lib/rates.functions.ts` | Categories, plans, calendar, restrictions, quote, reprice, revenue overview. |
| Helpers | `src/packages/pms/lib/rates.server.ts` | `requireRateManager`, `REVENUE_STATUSES`, error mapping, snapshot parse. |
| Module catalogue | `src/packages/pms/lib/pms-modules.ts` | `rates-revenue` key; `moduleKey: "configuration"`; status `existing`. |
| SET3 deep-link | `SET3_RATES_HREF` = `/restaurant/settings#financial-commercial` (configure). Operational: `SET3_RATES_REVENUE_HREF` = `/restaurant/pms/rates-revenue`. |

The workspace is **not** wired to Card 3 corporate rates, meal/package catalogues, promotions, seasons, distribution mappings, cashiering ledgers, or night-audit business date.

---

## 3. Property Setup ownership map

Verified from card modules, section UIs, and migrations — not from names alone.

### Card 1 — Property & Business (`pms-property-setup-card1.ts`)

| Topic | Owner? | Evidence |
|---|---|---|
| Property identity / branding / address | **Yes** | Card 1 steps identity, address, contacts, legal, tax docs. |
| Timezone | **Yes (CORE tenant + Card 1)** | `restaurants.timezone`; also used by `propertyToday`. |
| Currency | **Split** | Property `restaurants.currency_code` (CORE / Card 1). Card 3 domain **Currency & Financial Settings** is a **setup catalogue** (supported currencies / financial rules), not the live quote currency source for `hotel_rate_plans` (plan currency is copied from `restaurants.currency_code` on save). |
| Business date | **Policy vs live** | Card 1 step **Business Date** is configuration. Live house date is `restaurants.business_date`; Night Audit rolls it. Card 1 copy: Settings cannot roll the date. |
| Capacity | **Derived, not edited here** | Copy: capacity comes from Room Inventory. |

### Card 2 — Rooms & Operations

| Topic | Owner? | Evidence |
|---|---|---|
| Room types / physical rooms | **Yes (masters)** | Card 2 step Room Types & Rooms; also writable from Rate & Revenue? **No** — rates only FK `room_types`. Duplicate operational UI also exists on Room & Inventory tabs. |
| Amenities, HK rules, maintenance | **Yes (setup)** | Card 2 steps. |
| Sellability / inventory rules / overbooking | **Setup catalogue only** | `pms_inventory_rules` via Card 2 Inventory. Explicitly **does not** change `count_sellable_rooms` / `assert_reservation_capacity`. Overbooking policy is configured, **unenforced**. |
| OOO / OOS operational status | **Operational rooms**, not Card 2 catalogue | `hotel_rooms.status` / housekeeping; capacity RPC uses `status = 'available'`. |

### Card 3 — Financial & Commercial (eight domains)

| Domain | Masters owned | Consumed by pricing engine? |
|---|---|---|
| Currency & Financial Settings | Card 3 currency tables (0070) | **No** for `price_hotel_stay`. |
| Taxes & Fees | Card 3 tax masters (0071) | **No**. |
| Rates & Pricing | **Same** `hotel_rate_categories`, `hotel_rate_plans`, `hotel_rate_calendar` as Rate & Revenue | **Yes** (those tables). Card 3 does **not** write `hotel_rate_restrictions`. |
| Meal Plans & Packages | `pms_meal_plans`, `pms_packages` (+ 0072 component/rate-plan/room-type maps) | **No**. Create Reservation Section 8: catalogue detect only; no package bind on quote/create. |
| Payments & Deposits | Card 3 payment setup | **No**. |
| Billing & Invoicing | Card 3 billing setup | **No**. |
| Corporate & Contract Rates | `pms_corporate_agreements`, `pms_contract_rates` (0075). Company identity = Guest Profile `guest_account_masters`. | **No**. Tests forbid `price_hotel_stay` / reservations. |
| Revenue & Commercial Rules | `pms_commercial_restrictions`, `pms_promotions`, `pms_seasons` (+ room-type maps). Overbooking overlay **read** from Card 2 inventory rules. | **No**. Migration comment: does not replace `hotel_rate_restrictions` or `price_hotel_stay`. |

SET3 (`0049` / `pms-set3-rates-guest.*`) still owns meal/package JSON-era catalogues and **counts active `hotel_rate_plans`**, and deep-links to the Rate & Revenue workspace.

### Card 4 — Guest & Services (not “approvals”)

Prompt expectation of Card 4 as approval/automation **does not match** CURRENT Card 4: Guest Profile Rules, Guest Service Types, Notifications & Communication (including **automation rules** as **communication** defaults, not rate approvals). Revenue-relevant later: profile types, company/business, group types (Guest Profile masters).

### Card 5 — Organization & Facilities

Departments, outlets/facilities, sales & events **master** configuration. Relevant later for outlet/package applicability, not current Rate & Revenue.

### Card 6 — Connectivity & Distribution

| Topic | Owner? |
|---|---|
| Market segments / source codes / sales-channel labels | SET6 catalogues (`0052`: `pms_market_segments`, `pms_source_codes`, `pms_sales_channel_labels`, …) plus Card 6 distribution mapping (`0070`/`0071`) |
| Channel posture / mapping / sync **intent** | Card 6 + restaurant JSON posture. **Not** a live OTA/rate-push engine. Sync config includes rate/restriction flags that do **not** execute. |

### Card 7 — Security, Data & Reports

| Topic | Owner? |
|---|---|
| Hotel roles / **approval rule catalogue** | Setup only. Live authz remains `STAFF_ROLES` / `restaurant_users.role`. |
| Report metric **definitions** | Maps occupancy/ADR/RevPAR **query keys** to `getRevenueOverview` / bookings dashboard. Does **not** reimplement formulas. |
| Import types | Configures `saveRateCategory` / `saveRatePlan` as **handler keys**. Tab does **not** run imports. |

### Card 8 — System & Go-Live

Readiness / go-live governance / canonical activation `pms_set1_live`. Business-date **confirmation** is a go-live checkbox, not the Night Audit roll.

---

## 4. Current DB / schema map

Dual-lane: `drizzle/migrations/` and `supabase/migrations/` copies for numbered PMS migrations.

### Operational rate engine (`0016_create_hotel_rates.sql`)

| Object | Purpose |
|---|---|
| `hotel_rate_categories` | Property-scoped category codes (e.g. BAR). Unique `(restaurant_id, code)`. |
| `hotel_rate_plans` | Plan per category + **one** `room_type_id`. `base_rate`, `currency`, `valid_from`/`valid_to`, `active`. |
| `hotel_rate_calendar` | Date-specific **nightly override**. Unique `(rate_plan_id, rate_date)`. Missing date ⇒ base rate. |
| `hotel_rate_restrictions` | Date-specific **enforced** CTA / CTD / stop sell / min / max stay. Unique `(rate_plan_id, restriction_date)`. |
| `hotel_reservations` pricing columns | `rate_plan_id`, `currency`, `room_subtotal`, `nightly_rate_snapshot` jsonb, `priced_at`. Nullable for legacy unpriced stays. |
| `hotel_reservation_history.event_type` | Adds `'repriced'`. |

RLS (0016): owner/manager CRUD. Later `0024_phase_7c_role_scoped_rls.sql` adds **front-office SELECT** on rate tables.

SQL functions (service_role execute; PUBLIC revoked):

- `price_hotel_stay(...)`
- `create_hotel_reservation_priced(...)`
- `amend_hotel_reservation_priced(...)`
- `reprice_hotel_reservation(...)`

`price_hotel_stay` is **not** replaced in later migrations (only create/amend priced wrappers gain extra params in 0059/0061).

### Property Setup additions (do not merge into engine)

| Migration | Tables / notes |
|---|---|
| `0049` | `pms_meal_plans`, `pms_packages`, guest ID/VIP, restaurant JSON rules. Rate-plan **count** uses existing `hotel_rate_plans.active`. |
| `0072` | Additive meal/package typed fields + `pms_package_rate_plans` / room types / components. Setup price is **not** a quote. |
| `0075` | `pms_corporate_agreements`, `pms_contract_rates`. Fence: does not touch snapshots or `hotel_rate_plans`. |
| `0076` | `pms_commercial_restrictions` (+ maps), `pms_promotions`, `pms_seasons`. Fence: does not touch `hotel_rate_restrictions` / calendar / `price_hotel_stay`. |
| `0052` / `0070` / `0071` | Sales catalogues; distribution mapping; sync **config**. |

### `hotel_rate_restrictions` vs `pms_commercial_restrictions`

| | `hotel_rate_restrictions` | `pms_commercial_restrictions` |
|---|---|---|
| Grain | One row per **rate plan + date** | Named catalogue row with date **window**, kind, optional room types |
| Written by | Rate & Revenue `saveRateRestriction` | Card 3 commercial `commercial-card3.functions.ts` |
| Read by `price_hotel_stay` | **Yes** | **No** |
| Kinds | Combined flags on one date row (min, max, CTA, CTD, stop sell) | One `restriction_kind` per row: min_stay, stop_sell, CTA, CTD |
| Product role | **Operational / enforced** | **Property Setup master / configuration catalogue** |

**Do not merge in Phase 1.** Future operational Rate & Revenue may *apply* catalogue templates onto `hotel_rate_restrictions` (or a new operational table) — that is Prompt 2+ work, not this audit.

---

## 5. Pricing engine — protected contracts

Implemented only in `0016` `price_hotel_stay`:

1. Reject `departure <= arrival` → `INVALID_DATES`.
2. Load plan for restaurant; else `RATE_PLAN_NOT_FOUND`.
3. Inactive → `RATE_PLAN_INACTIVE`.
4. Room type mismatch → `RATE_PLAN_TYPE_MISMATCH`.
5. Validity: arrival before `valid_from` or last night after `valid_to` → `RATE_PLAN_OUT_OF_RANGE`.
6. **CTA / min / max** read restriction on **arrival date only**.
7. **CTD** reads restriction on **departure date**.
8. Each night `[arrival, departure)`: **stop sell** on that night → `STOP_SELL`.
9. Nightly rate: calendar override if present, else `plan.base_rate`.
10. Return jsonb: plan id/code/name, currency, nights, subtotal, nightly `[{date, rate}]`.

**Not in the engine:** promotions, seasons, corporate contract amounts, meal/package prices, Card 3 commercial restrictions, occupancy-based yield, taxes, channel markups, overbooking.

`rates.server.ts` maps SQL exception codes to user copy (including `MIN_STAY_n` / `MAX_STAY_n`).

---

## 6. Reservation pricing snapshot behaviour

| Event | Behaviour |
|---|---|
| Create with `_rate_plan_id` | After `create_hotel_reservation`, `price_hotel_stay` then UPDATE snapshot columns. |
| Create without rate plan | Snapshot stays null (unpriced pending; manager-only policy in create UX). |
| Amend | Stay/type/plan change (`stay_changed`) **and** `_rate_plan_id` not null → reprice + `repriced` history. Notes-only amend does **not** reprice. |
| `reprice_hotel_reservation` | Always reprices current stay dates/type against **current** engine rates; writes history. |
| Calendar/base change **without** reprice | Existing snapshots **unchanged**. New quotes/creates see new rates. |

Cashiering `open_folio_for_reservation` posts a **one-time** room charge from `COALESCE(room_subtotal, 0)` (`reference_type = reservation_room_charge`). That is financial posting of the **snapshot total**, not nightly accrual, and is **not** what Revenue Overview uses.

---

## 7. Current responsibility conflicts

Target: Property Setup = masters; Rate & Revenue = daily commercial operations.

| Current Rate & Revenue capability | Code | Actual master owner today | Remain operational? | Move/remove from RR UI later? | Backend reusable? | Future operational replacement |
|---|---|---|---|---|---|---|
| Add / edit rate category | `saveRateCategory` + `rates-tabs` | Dual: RR **and** Card 3 `saveRateCategoryCard3` | No (master) | **Yes — remove from RR UI** | Yes, preferably **one** writer | Card 3 only; RR reads catalogue |
| Add / edit rate plan (code, name, base, validity, type, category) | `saveRatePlan` | Dual with `saveRatePlanCard3` (Card 3 omits validity dates) | Base/validity = master; **daily price** may stay operational | **Yes for master fields**; keep read + maybe base-rate ops TBD | Yes | Card 3 masters; RR calendar/yield later |
| Activate / deactivate plan | `setRatePlanActive` | Same `hotel_rate_plans.active` used by SET3 readiness and engine | Selling-status could be operational **or** master | **Likely move master activate to Card 3**; RR may need **stop-sell** instead | Yes | Distinguish catalogue `active` vs date stop-sell |
| Rate calendar override | `saveRateOverride` | Dual with `saveRateOverrideCard3` | **Yes — operational** | Keep in RR; **remove duplicate Card 3 calendar writes** or make Card 3 seed-only | Yes | RR calendar as working surface |
| Date restrictions CTA/CTD/min/max/stop sell | `saveRateRestriction` | **RR only** (Card 3 does not write this table) | **Yes — operational** | Keep in RR | Yes | May later apply Card 3 catalogue templates |
| Revenue Overview KPIs | `getRevenueOverview` | Reporting, not setup | **Yes — operational** | Keep; later split booked vs posted | Yes | UI-01 style dashboard |
| Quote stay | `quoteStay` | Reservations / FO / public booking consumer | **Yes** (decision support for booking) | Keep as API; not a RR config screen | Yes | Unchanged engine |
| Manual reprice | `repriceReservation` | Reservation detail, not RR tabs | Stay in Reservations (execution) | Not a RR config control | Yes | Approval later may **authorise**; Reservations still executes |

**Duplicate writers (conflict):** two server-fn families mutate the same `hotel_rate_*` rows with different auth helpers (`requireRateManager` vs Card 3 `requireRoomManager` / `requireFrontOfficeAccess` for reads).

---

## 8. Cross-module dependency map

Classification: **MASTER** = Property Setup / Guest Profile config. **LIVE** = operational rows. **DERIVED** = computed. **FINANCIAL** = folio/posted truth. **AUDIT** = history.

### Reservations (`hotel_reservations` + RPCs)

| Need | Source | Class |
|---|---|---|
| Status | `status` (`pending`, `confirmed`, `cancelled`, `checked_in`, `checked_out`, `no_show`) | LIVE |
| Arrival / departure | `arrival_date`, `departure_date` | LIVE |
| Room type | `room_type_id` | LIVE (FK to Card 2 master) |
| Rate plan | `rate_plan_id` | LIVE snapshot link to master |
| Pricing snapshot | `room_subtotal`, `nightly_rate_snapshot`, `currency`, `priced_at` | LIVE / frozen quote |
| Created at | `created_at` | AUDIT |
| Channel origin | `source` (`staff`, `walk_in`, `direct_booking`, …) — **not** commercial source | LIVE |
| Commercial source / segment | `commercial_booking_source`, `market_segment` (0061; APPLY may be held) | LIVE labels |
| Company / TA / group | `company_master_id`, `travel_agent_master_id`, `group_account_master_id` (0053) | LIVE FKs to Guest Profile MASTER |
| Cancel / no-show | status + FO cancel/no-show flows | LIVE |

### Front Office

| Need | Source | Class |
|---|---|---|
| Checked in / out | reservation status + FO steppers | LIVE |
| Walk-ins | `source = walk_in` / FO walk-in mode of **same** `createReservation` | LIVE |
| Extensions / stay changes | `amendReservation` → priced amend | LIVE |
| In-house | status `checked_in` overlapping dates | DERIVED |

### Rooms & Inventory

| Need | Source | Class |
|---|---|---|
| Physical / sellable capacity | `hotel_rooms` + `room_types.sellable`; `count_sellable_rooms` = active + `status='available'` + type active/sellable | LIVE engine |
| Blocks / holds | Inventory rules **policy** vs actual room `status` | MASTER vs LIVE — **policy not applied to RPC** |
| Room-type availability | `getRoomTypeAvailability` = sellable − `count_reserved_rooms` (pending+confirmed overlap) | DERIVED |
| OOO/OOS | `hotel_rooms.status` (and HK dashboard counts) | LIVE |

### Housekeeping

| Need | Source | Class |
|---|---|---|
| Clean/dirty/inspection | `hotel_rooms.housekeeping_status` | LIVE |
| Readiness vs inventory | Card 2 flags `housekeepingAffectsAssignment` etc. | MASTER **not** applied to `count_sellable_rooms` |

### Guest Profile

| Need | Source | Class |
|---|---|---|
| Companies / TA / groups | `guest_account_masters` + links | MASTER |
| VIP | SET3 / Card 4 VIP catalogue + guest fields | MASTER |
| Corporate agreements | Card 3 `pms_corporate_agreements` | MASTER (unused by engine) |

### Cashiering

| Need | Source | Class |
|---|---|---|
| Posted room revenue | `folio_transactions` category `room` / `reservation_room_charge` | FINANCIAL |
| Dashboard charges | `getCashieringDashboard` | FINANCIAL |
| Snapshot total used at folio open | `room_subtotal` copy | FINANCIAL from LIVE snapshot |

Revenue Overview **does not read** folio_transactions.

### Distribution

| Need | Source | Class |
|---|---|---|
| Channels / mappings / sync intent | Card 6 + SET6 posture | MASTER |
| Live OTA rates | **Not implemented** | — |

### Night Audit / business date

| Need | Source | Class |
|---|---|---|
| House business date | `restaurants.business_date` | LIVE (rolled by Night Audit) |
| Closed dates | Night audit runs (`listNightAuditRuns`) | AUDIT |
| Rate KPI date picker | Property **calendar** `propertyToday(timezone)`, not business date | DERIVED calendar |

---

## 9. Metrics and definitions currently implemented

### Rate & Revenue Overview / Reports Revenue tab (`getRevenueOverview`)

Date range `[from, to]` inclusive via `eachDate` (max 400 days). Inverted range swapped.

| Metric | Formula | Data |
|---|---|---|
| Available room nights | `(count hotel_rooms where active) × days in range` | **Does not** require `status = available`. OOO/OOS **active** rooms still inflate availability. |
| Sold room nights | Nights of overlapping stays with `status ∈ {confirmed, checked_in, checked_out}` where night `< departure` and night in range | **Booked occupancy**, not posted. Pending / cancelled / no-show **excluded**. |
| Room revenue | Sum of `nightly_rate_snapshot[].rate` for nights in range | **Reservation snapshots only**. Unpriced nights add occupancy, **not** revenue (`pricedShare`). |
| Occupancy % | `sold / available × 100` | As above |
| ADR | `room revenue / sold room nights` (0 if sold=0) | Snapshot revenue; **includes unpriced nights in denominator** if they counted as sold — so ADR is understated when `pricedShare < 100`. |
| RevPAR | `room revenue / available room nights` | Snapshot revenue |
| Priced share | priced nights / sold nights | Honesty for legacy unpriced |

Currency: `restaurants.currency_code`. Restaurant F&B never mixed.

**Not used:** folio_transactions, night-audit date, Card 3 promotions, taxes.

### Other occupancy (do not confuse)

| Surface | Formula |
|---|---|
| Bookings dashboard / Reports Occupancy tab | `stayingToday / sellableRooms` where sellable = `hotel_rooms.active` **and** `status='available'`; staying = pending+confirmed+checked_in overlapping **today** |
| FO exceptions `occupancyPercent` | occupied / sellable helper for rack exceptions |

Three occupancy definitions already coexist.

### Risks (unchanged this prompt)

- Booked snapshot revenue presented as “Room revenue” — **not** realized cashiering revenue.
- Available nights ignore OOO/OOS if room remains `active`.
- Confirmed future stays count as sold nights (on-the-books), including not-yet-arrived.
- Cancelled / no-show excluded (good for occupancy) but no forfeiture revenue.
- Unpriced legacy stays: occupancy yes, revenue no; ADR denominator still includes them.
- KPI range is timezone calendar dates, not `restaurants.business_date`.
- `checked_in` overlapping nights counted even if physically OOO assigned (assignment not in formula).

---

## 10. Permission / security map

| Control | Where | What |
|---|---|---|
| Sign-in | Route `beforeLoad` | Redirect login |
| Package entitlement | `requireRoutePackage("pms")` | Fail-closed |
| PMS package on mutations | `withPmsPackage` / `requirePmsPackage` | Additional to role |
| Workspace UI | `canManageRates` = owner \| manager | Receptionist **blocked** from entire RR workspace |
| Rate writes | `requireRateManager` = module `configuration` + owner/manager + PMS package | Server source of truth |
| Quote | `requireReservationManager` (owner/manager/**receptionist**) | Create/FO quoting |
| Revenue overview | `requireModuleRole(..., reports_analytics, REPORTS_ROLES)` + `requirePmsPackage` | Accountant can have reports module **but cannot open RR workspace** (`canManage` false). Reports workspace **reuses** `RevenueOverviewTab` under reports access. |
| Nav | `restaurant-shell` CONFIGURATION_NAV roles owner/manager | Browser hide only |
| RLS | Owner/manager write; FO SELECT on rate tables (0024) | Browser cannot bypass server fns; no component inserts found |
| Card 3 rates | Read: `requireFrontOfficeAccess`; write: `requireRoomManager` | **Different** gate than RR |
| Public booking | `price_hotel_stay` via admin/service RPC after public PMS gate | Unauthenticated quote path |

**Future `RevenueAccess`:** should sit **after** package + membership, **beside** (not replacing) `requireRateManager`, and must not assume the RR workspace `canManage` flag is the only reader of KPIs (Reports already shares Overview). Card 7 hotel-role/approval catalogues are **not** live authz.

There is **no** revenue-analyst role today.

---

## 11. UI / workspace comparison with Rooms & Inventory

### CURRENT Rate & Revenue

- Page heading + four `Tabs`.
- No command chrome, no PMS module escape bar, no business-date chip, no drawers/sheets pattern, no audit history surface (history exists only on reservations).
- Default tab **plans** (config-first).
- Configuration-module chrome in shell (`module="configuration"`).

### CURRENT Room & Inventory (`/restaurant/pms/room-inventory`)

- Same **simple tab workspace** as rates (`RoomsWorkspace`): dashboard / room-types / rooms.
- Named files in the Prompt 1 brief (**chrome / availability / calendar**) are **missing**.
- Mixes leftover “Front Office” copy on the dashboard tab with configuration room-type/rooms tabs.

### Mature operational pattern to reuse later (Front Office, not RI tabs)

| Pattern | FO source | Reuse in future RR shell? |
|---|---|---|
| Command chrome (top bar, search, overflow, help) | `pms-command-chrome.tsx`, `front-office-chrome.tsx` | Yes |
| Primary sections + secondary views | `FO_NAV_ITEMS` | Yes (Overview, Inventory/Rates, Restrictions, later Forecast) |
| Business date / house context | Night Audit + `displayedBusinessDate` | Yes — RR should show **business date**, not only calendar pickers |
| Large work surfaces + sheets | FO rack, steppers, side sheets | Yes for calendar/restriction grids |
| History / audit views | reservation/folio history, FO audit viewer | Yes as **read-only** |
| Responsive / phone overflow | FO chrome mobile menu | Yes |
| Honest empty / coming-soon | FO coming-soon panels | Yes for UI-01–UI-40 not yet built |

Do **not** copy Room Types CRUD into RR. Do **not** build the shell in this prompt.

---

## 12. What must remain unchanged

- `price_hotel_stay` resolution order and restriction semantics.
- Snapshot immutability except create / stay-changing amend / explicit reprice.
- `repriced` history events.
- Existing reservation rows when operators change calendar/base rates.
- Dual-lane migrations already applied; no rewrite of `0016` tables.
- Card 3 commercial/corporate/meal catalogues remaining **non-authoritative** for quotes until a later spec.
- `createReservation` → `create_hotel_reservation_priced` as the single priced writer (walk-in included).
- Public booking quoting through the same RPC.

---

## 13. What must move out of Rate & Revenue UI (later — not this prompt)

- Add/edit **rate category**.
- Add/edit **rate plan master** fields (code, name, category, room type, validity window) — Card 3 already has this.
- Possibly **activate/deactivate** as a catalogue action (if product keeps `active` as setup).
- Any implication that RR is “Configuration” (eyebrow copy, `module="configuration"` nav).
- SET3 “Open rates workspace” as the place to **create** masters (should open Card 3 Rates domain).

Keep in RR (operational): calendar overrides, date restrictions, KPI overview, later pickup/forecast **reads**.

---

## 14. What can be reused later

- `listRatePlans` / `listRateCalendar` / `listRateRestrictions` read models.
- `saveRateOverride` / `saveRateRestriction` as operational mutations.
- `quoteStay` + `rateError` mapping.
- `getRevenueOverview` until formulas are explicitly versioned.
- Card 3 snapshots as **master read** APIs (do not invent a second plan table).
- Card 6 segment/source catalogues as filters.
- Guest master IDs on reservations for commercial mix.
- FO `PmsCommandChrome` shell patterns.
- Card 7 metric **labels** pointing at existing query keys.
- Tests that lock “Card 3 commercial does not write `hotel_rate_restrictions`”.

---

## 15. Known gaps for UI-01–UI-40

No in-repo UI-01–UI-40 spec. Relative to the **requested** architecture, CURRENT is missing at least:

- Operational RR shell (command chrome, sections, business date).
- Separation of booked vs realized revenue.
- Forecast / pickup / pacing (decision-support only; must not auto-change rates).
- Rate shopping / market intelligence.
- Promotion **activation** (catalogue exists; engine ignore).
- Season application to calendar.
- Corporate contract **selling** vs rack `hotel_rate_plans`.
- Package/meal bind on quote (Section 8 gated).
- Channel-level rates/restrictions distribution (Card 6 sync is intent-only).
- Approval workflow that authorises without executing in RR.
- Read-only audit views for rate changes (calendar writes have `created_by_membership_id` but no RR history UI; Card 3 uses staff audit log).
- Inventory-aware availability in KPI available nights (OOO/OOS, overbooking policy).
- Central `RevenueAccess` model.

---

## 16. Recommended Phase 1 Prompt 2 change scope

Prompt 2 should stay **thin** and regression-safe:

1. **Documentation + IA only or UI copy:** stop calling RR “Configuration”; default tab Overview; document ownership in-product (link to Card 3). **Do not** delete writers yet if SET3 still deep-links here.
2. **Optional dual-write freeze:** stop adding new master fields to `saveRatePlan` in RR; Card 3 remains master editor. **Do not** remove RR category/plan dialogs until a Settings adapter exists (out of Prompt 1).
3. **Protect tests:** add a source-lock test that `price_hotel_stay` body still reads only `hotel_rate_restrictions` + calendar + plans (mirror commercial-card3 negative tests).
4. **Do not:** new tables, merge restriction catalogues, change KPI formulas, FO/RI chrome port, UI-01–UI-40 screens, permission redesign.

If Prompt 2 is allowed a **minimal** UI change: hide “Add category” / “Add rate plan” behind copy “Managed in Property Setup” **without** deleting server fns (import-card7 still names those handlers).

---

## 17. Tests / build results

Command:

`node --experimental-strip-types --test` on:

`rates-card3.test.ts`, `commercial-card3.test.ts`, `corporate-card3.test.ts`, `pms-set3-rates-guest.test.ts`, `pms-set6-sales-distribution.test.ts`, `distribution-card6.test.ts`, `create-reservation-phase1-section5.test.ts`, `create-reservation-phase1-section8.test.ts`, `meals-card3.test.ts`, `import-card7.test.ts`, `reports-card7.test.ts`, `inventory-rules-card2.test.ts`, `pms-property-setup-card3.test.ts`.

| Result | Count |
|---|---|
| Tests | 120 |
| Pass | 119 |
| Fail | **1 (pre-existing)** |

**Failure (not introduced by this audit):** `pms-property-setup-card3.test.ts` — “opens from the hub with Card 3 chrome…” asserts `doesNotMatch(section, /percent=\{/)` but Card 3 section now computes `progressPercent`. Unrelated to Rate & Revenue operational code.

No dedicated `rates.functions.ts` / `price_hotel_stay` SQL unit test file exists. Pricing contracts are locked indirectly via Create Reservation Section 5/8 source tests.

**Typecheck:** `npx tsc --noEmit` completed with **exit 2** after ~22 minutes. Failures are **pre-existing** and concentrated in Guest Profile, Card 4, FO chrome `exactOptionalPropertyTypes`, and stale `types.ts` (e.g. `reservations.functions.ts` `group_account_master_id`). **No errors** in `rates.functions.ts`, `rates.server.ts`, `rates-tabs.tsx`, `rates-workspace.tsx`, or `rates-revenue.tsx`. **Full `vite build` not run.**

**No rates.functions / SQL engine test suite** to execute.

---

## 18. Risks / open questions

1. **Dual master editors** can diverge (Card 3 plan save drops `valid_from`/`valid_to` on update payload).
2. **`types.ts` stale** vs 0053/0061 reservation columns — codegen drift.
3. **0061 APPLY HELD** in migration comments: commercial source/segment may be absent in some environments; create path fail-closes when claiming persist.
4. Should catalogue `hotel_rate_plans.active` remain the only “on sale” flag, or should RR use stop-sell only?
5. Should available room nights align with `count_sellable_rooms` (exclude OOO) — formula change needs an explicit product decision.
6. ADR denominator vs unpriced nights.
7. Booked vs posted room revenue for commercial reporting.
8. Future `RevenueAccess` vs accountant-on-Reports-tab already seeing Overview.
9. SET3 hub still trains users to configure rates inside RR.
10. Card 6 rate sync flags vs no distributor — risk of selling “connected rates”.
11. UI-01–UI-40 need a Spec in `docs/pms/specs/` before engineering; they are not in git today.
12. Programme id vs card title mismatch on Cards 4/6/7/8 — do not drive ownership from hub ids.

---

## Appendix A — Pricing / rate caller map

| Symbol | Callers |
|---|---|
| `price_hotel_stay` | `quoteStay`; `public-booking.functions.ts`; SQL `create_hotel_reservation_priced`, `amend_hotel_reservation_priced`, `reprice_hotel_reservation` (and later 0059/0061 replacements of create priced) |
| `saveRateOverride` | `rates-tabs` Rate Calendar |
| `saveRateOverrideCard3` | Card 3 rates UI |
| `saveRateRestriction` | `rates-tabs` Restrictions |
| `saveRatePlan` / `saveRateCategory` | RR tabs; Card 7 import **handler names only** |
| `saveRatePlanCard3` / `saveRateCategoryCard3` | Card 3 rates UI |
| `setRatePlanActive` | RR plans table |
| `reprice_hotel_reservation` / `repriceReservation` | `reservation-detail-workspace.tsx` PricingSection |
| `create_hotel_reservation_priced` | `reservations.functions.ts` `createReservation` |
| `amend_hotel_reservation_priced` | `reservations.functions.ts` `amendReservation` |

---

## Appendix B — Files inspected (minimum + material)

Routes: `rates-revenue.tsx`, `bookings/rates.tsx`, `room-inventory.tsx`.

Workspaces: `rates-workspace.tsx`, `rooms-workspace.tsx`, `pms-reports-workspace.tsx`, `reservation-detail-workspace.tsx`.

Rates: `rates-tabs.tsx`, `rates.functions.ts`, `rates.server.ts`.

Card 3: `pms-property-setup-card3*.ts(x)`, `rates-card3.*`, `commercial-card3.*`, `corporate-card3.*`, `pms-set3-rates-guest.*`.

Card 6: `pms-set6-sales-distribution.*`, `distribution-card6.*`.

FO chrome: `pms-command-chrome.tsx`, `front-office-chrome.tsx`, `front-office-shell.ts`.

Cross: `reservations.functions.ts`, `public-booking.functions.ts`, `cashiering.functions.ts`, `inventory-rules-card2.server.ts`, `pms-package.server.ts`, `route-package-guard.ts`, `module-access.ts`, `restaurant-shell.tsx`, `pms-modules.ts`.

Migrations: `0016`, `0013` (sellable RPC), `0017` (folio room charge), `0024`, `0049`, `0052`, `0053`, `0061`, `0070`–`0072`, `0075`, `0076`, `0071` Card 6 sync.

Docs: `docs/pms/README.md`, `architecture-ownership.md`, `.lovable/plan/phase-6g-rates-revenue-management-2026-09-02.md`.
