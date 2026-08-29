# Phase 4 — Restaurant Settings + Timezone Foundation

Give owners/managers one place to set timezone, currency and opening hours, then make the restaurant's timezone the single source of truth for shift logic and operational time display.

## 1. Database

One migration:

- `restaurants.timezone text NOT NULL DEFAULT 'Europe/London'` (IANA names only)
- `restaurants.currency_code text NOT NULL DEFAULT 'GBP'`
- New table `restaurant_opening_hours`: `id`, `restaurant_id`, `day_of_week` (0–6), `is_closed`, `open_time`, `close_time`, `created_at`, `updated_at`, unique on `(restaurant_id, day_of_week)`, `updated_at` trigger.
- Grants + RLS: members of the restaurant may read; only owner/manager may insert/update/delete; `anon` gets read access only in line with how other public restaurant data is exposed today (no anonymous writes).
- Both new `restaurants` columns are additive with defaults, so nothing existing breaks. The protected-fields trigger stays as is — timezone and currency are editable by owner/manager, approval fields are not.

Seed one row per weekday for The Garden defaults (09:00–22:00, open) as part of the settings page's first save rather than a data migration.

## 2. /restaurant/settings

Extend the existing page (keeps current auth gate and `RestaurantShell`):

- **Restaurant Details** — existing name/contact form, unchanged.
- **Regional Settings** — timezone selector (curated IANA list incl. Europe/London, Africa/Addis_Ababa, America/New_York, plus the rest from `Intl.supportedValuesOf('timeZone')`), currency selector (GBP, EUR, USD, ETB, and a short common list).
- **Opening Hours** — Monday–Sunday rows with closed toggle and open/close time inputs.

New server functions in `src/lib/restaurant.functions.ts` (`updateRestaurantRegionalSettings`, `getOpeningHours`, `updateOpeningHours`), each re-deriving owner/manager membership server-side before writing. Viewers with other roles see the values read-only.

## 3. Shared timezone helper

New `src/lib/restaurant-time.ts` (client-safe) with:

- `zonedShiftMoment(shiftDate, time, timeZone)` — converts a restaurant-local date+time into the correct UTC instant using `Intl.DateTimeFormat` offset lookup (no new dependency, DST-correct).
- `formatInZone(iso, timeZone, opts)` / `formatClockInZone` / `localDateInZone` — for display and for restaurant-local date grouping.
- `formatMoney(amount, currencyCode)` — replaces the hardcoded GBP `formatPrice` for restaurant-facing screens; `src/data/menu.ts` keeps a thin GBP-defaulted wrapper so customer screens keep compiling, and tenant screens pass the restaurant's `currency_code`.

`src/lib/workforce-rules.ts` `shiftMoment` becomes a wrapper over `zonedShiftMoment` and now requires a timezone — that is the actual fix for the check-in/no-running-shift bug.

## 4. Workforce updated to use it

Every place that currently builds a shift timestamp loads the restaurant's timezone once and passes it through:

- `src/lib/workforce.server.ts` — `scheduledHours`, lateness helpers
- `src/lib/workforce.functions.ts` — createShift, listShifts, checkIn, checkOut, attendance summary
- `src/lib/waiter-orders.functions.ts` — `currentShift` (single shared resolver, exported from one module)
- `src/lib/order-core.server.ts` — assigned-waiter resolution

One resolver rule everywhere: a shift is current when its local start–end window contains now **or** attendance shows `check_in_at IS NOT NULL AND check_out_at IS NULL` for a scheduled shift today. Checkout ends waiter ordering immediately.

## 5. Friendly shift states

`my-shift-card` and `/restaurant/waiter` render, using restaurant-local times: "No shift scheduled today", "Your shift starts at HH:MM", "You haven't checked in yet", "Your shift is active", "Your shift ended at HH:MM", "Your shift has been completed".

## 6. Order timestamp display

Timestamps stay UTC in the database. Presentation only, converted with the restaurant timezone: restaurant Orders list and detail, status timeline, Kitchen cards and elapsed time, Dashboard live/recent orders, and customer order history/tracking (which reads the restaurant's timezone from the order's restaurant). Restaurant-local date filtering (Today / 7d / 30d) uses the same helper so "today" means the restaurant's day, not the browser's.

## 7. Out of scope this phase

Opening hours are configuration only — no ordering block. No payments, payroll, tax, themes, integrations or notifications.

## 8. Testing (The Garden)

Save/reload timezone and currency; opening hours persist; owner and manager can edit, waiter cannot (server rejects a forged call). Then the workforce loop: schedule a shift in local time, waiter sees the local time, checks in, `/restaurant/waiter` recognises the active shift, assigned tables show, a waiter-assisted order succeeds, checkout blocks further orders, lateness matches the same timezone. The prior checked-in/no-running-shift case is retested explicitly.

## Known limitation

Shifts created before this change were interpreted as UTC. Once The Garden is set to a non-UTC timezone, those historical rows read as shifted by the offset. Existing local time strings are not rewritten — going forward every shift is interpreted in the restaurant's timezone.
