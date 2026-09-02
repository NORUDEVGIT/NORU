# Phase 6G — Rates & Revenue Management

Adds hotel pricing to the Booking & Guest Management workspace: rate categories, rate plans per room type, daily rate overrides, stay restrictions, an authoritative server pricing engine, priced reservations with immutable snapshots, and a revenue overview (Occupancy / ADR / RevPAR).

## Navigation & routes

- New sidebar entry "Rates & Revenue" under Booking & Guest Management (owner/manager only).
- One new route `/restaurant/bookings/rates` with tabs: Overview, Rate Plans, Rate Calendar, Restrictions (tab kept in the `?tab=` search param, same pattern as Rooms/Housekeeping).

## Database (one migration)

- `hotel_rate_categories` — code, name, description, active; unique per property + code.
- `hotel_rate_plans` — category, room_type, code, name, description, currency (defaults to property currency), base_rate (>= 0), valid_from/valid_to, active; unique per property + code; room type must be in the same property.
- `hotel_rate_calendar` — rate_plan, rate_date, nightly_rate; unique per plan + date.
- `hotel_rate_restrictions` — rate_plan, restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell; unique per plan + date.
- `hotel_reservations` gains nullable pricing snapshot columns: `rate_plan_id`, `currency`, `room_subtotal`, `nightly_rate_snapshot` (jsonb), `priced_at`. Nullable so existing Phase 6D reservations keep working untouched.
- All tables: same-property foreign keys, GRANTs, RLS restricted to active members of the property, indexes on (restaurant_id, rate_plan_id, date).
- Pricing/restriction resolution and reservation pricing are implemented as SECURITY DEFINER SQL functions so create/amend stay in one transaction with availability checks; PUBLIC execute revoked, service_role only.

## Pricing engine

A single shared server routine takes property, arrival, departure, room type and rate plan and, for each stay night, resolves: plan active and inside validity window → calendar override if present → otherwise base rate. It returns nightly breakdown, nights, subtotal, currency and a restriction result.

Restrictions rejected with plain-language errors: nights below min stay, nights above max stay, arrival date closed to arrival, departure date closed to departure, any stay night on stop sell.

## Reservation integration

- New Reservation: after guest + dates + room type, list available rate plans with nightly/from price and stay total; selecting one shows the nightly breakdown and total. Create re-checks availability, rates and restrictions server-side inside the same transaction as the insert, then stores the snapshot.
- Amendment: when dates, room type or rate plan change, the server reprices, stores a fresh snapshot and writes a `repriced` history event with old/new total. Note/profile-only edits never reprice.
- Legacy reservations: unpriced ones display "Not priced" and owner/manager can price them from the detail page.
- Rate changes never alter existing reservation snapshots.

## UI

- Rate Plans: filter by room type and active status; table of code, name, category, room type, base rate, currency, validity, active; add / edit / deactivate dialogs.
- Rate Calendar: filter by room type, rate plan and date range; row per date showing base, override and effective rate with inline edit/save (property-local dates).
- Restrictions: row per date per plan with min/max stay, CTA, CTD, stop sell and quick edit.
- Overview: date range picker with Occupancy %, ADR, RevPAR, Room Revenue, Available Room Nights, Sold Room Nights.

## Revenue definitions

Room revenue comes from reservation nightly snapshots, counting nights of reservations in status confirmed, checked_in or checked_out; pending, cancelled and no_show are excluded. Available room nights = active sellable rooms x days in range. Occupancy = sold / available. ADR = revenue / sold. RevPAR = revenue / available. Restaurant revenue is never mixed in.

## Permissions & security

Owner and manager have full access; kitchen and waiter are denied at the server and the nav entry is hidden. Every handler re-derives membership from `restaurant_users` and revalidates rate plan, room type, calendar and reservation ids against the caller's property. No browser-supplied restaurant id or price is trusted.

## Test plan (The Garden)

Create BAR category and BAR-DLX plan on Deluxe King at 4000, add 5000 overrides, book across mixed nights, verify breakdown/total/snapshot, change the rate and confirm the existing reservation is unchanged while a new one uses the new rate, exercise min/max stay, CTA, CTD and stop sell rejections, amend dates and verify repricing plus history, check ADR/Occupancy/RevPAR, confirm kitchen/waiter denial and cross-tenant blocking, then typecheck and build.

## Files

New: rates migration, `src/lib/rates.server.ts`, `src/lib/rates.functions.ts`, `src/components/rates/*` tabs and dialogs, `src/routes/restaurant/bookings/rates.tsx`.
Edited: `src/lib/reservations.server.ts`, `src/lib/reservations.functions.ts`, `src/routes/restaurant/bookings/new.tsx`, `src/routes/restaurant/bookings/$reservationId.tsx`, `src/components/restaurant-shell.tsx`.

## Limitations

No occupancy-based pricing, promotions, group/corporate contracts, OTA distribution, forecasting, cashiering or payments in this phase.
