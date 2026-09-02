# Phase 6J — Direct Booking Engine & Distribution Foundation

Public, login-free booking for a property, plus the minimal distribution tables and a Distribution workspace inside Booking & Guest Management. No OTA APIs, no payment gateway, no loyalty.

## Public booking experience

New public routes, no staff auth, SSR-friendly, tenant resolved server-side by slug:

- `/stay/$propertySlug` — search (check-in, check-out, adults, children) then results.
- `/stay/$propertySlug/book` — chosen room type + rate plan, guest details, review, confirm.
- `/stay/$propertySlug/confirmation` — confirmation screen (confirmation number, guest name, property, room type, dates, nights, guests, rate plan, total + currency, special requests, print button, "Book another stay"). No UUIDs shown.
- `/stay/$propertySlug/manage` — secure lookup by confirmation number + email or phone; view-only detail plus cancel (when allowed).

Flow: Search Stay → Room Types → Rate → Guest Details → Review → Confirm.

Only approved + active properties resolve; anything else renders "not found". Public property data is limited to name, logo, city, currency, timezone, configured contact details and an optional booking message.

## Availability, rates, restrictions

No new availability algorithm. Public search calls the existing Phase 6D engine (`count_sellable_rooms` / `count_reserved_rooms` semantics) through a new public server function, so active/sellable rooms, OOO/OOS and reservation overlap are respected exactly as for staff. Housekeeping status never gates future availability.

Pricing comes only from the Phase 6G server function `price_hotel_stay`: base rate, calendar overrides, min/max stay, CTA, CTD, stop sell. Rate plans that fail a restriction are either hidden or shown with the reason; the browser never computes an authoritative total.

Room type cards reuse Phase 6B images and amenities: cover image, gallery, name, description, capacity, bed, size, view, amenities, available count. Physical room numbers are never shown publicly.

## Guest matching and reservation creation

On submit, server-side only:

1. Normalize email/phone with the existing guest helpers and look for an exact match inside that property. Exact normalized email match, else exact normalized phone match, reuses the profile; otherwise a new guest profile is created. No merging, no match feedback to the browser, no public guest search endpoint.
2. Create the reservation through the same locked pipeline staff use (`create_hotel_reservation_priced`), with `source = 'direct_booking'`, status `confirmed`, no room assignment, pricing snapshot stored identically.
3. Overbooking protection is the database function's, not the earlier screen's. When the last room goes, the guest sees "This room is no longer available for those dates." and is returned to results.

Lookup verifies confirmation number **and** email or phone server-side, returns a fixed generic message on any mismatch (no existence leak), and exposes only guest-facing fields — no staff notes, history or audit. Cancellation is allowed before check-in via the existing cancellation path, with the notice "Cancellation charges are not yet automated." No public restore.

## Database (one migration)

- `hotel_reservations.source` check extended to `staff | walk_in | direct_booking | future_online` (existing values preserved).
- `restaurants`: additive nullable `direct_booking_enabled boolean default true`, `booking_contact_email`, `booking_contact_phone`, `booking_message`.
- `distribution_channels` — id, restaurant_id, channel_type (`direct` | `ota`), code, name, status (`active` | `inactive` | `not_connected`), timestamps; unique per (restaurant_id, code).
- `distribution_room_mappings` — id, restaurant_id, channel_id, room_type_id, external_room_code nullable, active, timestamps.
- `distribution_rate_mappings` — id, restaurant_id, channel_id, rate_plan_id, external_rate_code nullable, active, timestamps.
- `distribution_logs` — immutable: id, restaurant_id, channel_id nullable, event_type, status, message, reference_type/reference_id nullable, payload_summary jsonb nullable, created_at. Never stores secrets or full payloads.
- All new tables: GRANTs to `authenticated` and `service_role`, RLS on, owner/manager policies via `has_restaurant_role`, no `anon` grant, same-property foreign keys.
- Seed: a `DIRECT` / "NORU Direct Booking" active channel for every existing property, in the same migration.

Public reads never touch these tables directly — the anon role gets no grants; the public routes go exclusively through server functions.

## Distribution workspace

`/restaurant/bookings/distribution` (owner/manager) with tabs Overview, Channels, Room Mapping, Rate Mapping, Logs. DIRECT shows active with its public booking URL and the direct-booking settings (enabled toggle, contact details, optional booking message). OTA rows, if listed at all, show "Not Connected" — no fake integrations. Sidebar for Booking & Guest Management becomes: Dashboard, Reservations, New Reservation, Guests, Rates & Revenue, Distribution.

Reservation list and detail gain a booking-source label so direct bookings are visible to staff.

## Technical notes

- New files: `src/lib/public-booking.functions.ts` (public, unauthenticated server functions: property info, availability search, rate quotes, submit booking, lookup, cancel), `src/lib/public-booking.server.ts` (server-only helpers: slug resolution, rate limiting-friendly validation, guest match/create, log writer), `src/lib/distribution.server.ts` + `src/lib/distribution.functions.ts` (staff-side), route files under `src/routes/stay/`, `src/routes/restaurant/bookings/distribution.tsx`, components under `src/components/stay/` and `src/components/distribution/`.
- Public functions validate every input with zod, resolve `restaurant_id` from the slug only, and load the privileged client inside the handler after validation — never at module scope, never exposed to the browser.
- Each public route defines its own `head()` metadata (title, description, og tags) for shareable booking links.

## Verification (The Garden, test tenant only)

Public page without login; valid search; room types with images/amenities/capacity; correct rate and total; min/max/CTA/CTD/stop-sell behaviour; booking as a new guest; guest profile created; `direct_booking` reservation with pricing snapshot and confirmation number; visible in the staff dashboard; availability decreases; inventory exhaustion blocks the next booking; lookup by confirmation + email/phone; invalid lookup leaks nothing; cancellation returns availability; DIRECT channel and mappings present; no private PII in public payloads; typecheck, build, and a console-error check.

## Out of scope

OTA APIs, payment gateway/card data, loyalty, mandatory customer accounts, dynamic pricing, website builder. Restaurant ordering, kitchen, orders, stock, staff, housekeeping, folios, night audit and platform admin are untouched.
