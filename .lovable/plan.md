# Phase 7D.2F1 Patch 2 — Reservation detail + guest profile inside PMS Reservations

Reservations already live at `/restaurant/pms/reservations`, but clicking a row still jumps to the old booking/front-office address. This patch gives reservation detail and guest profile their own canonical PMS addresses and keeps the whole workflow inside the Reservations context. Route ownership and component reuse only — no reservation, availability, pricing, amendment, cancellation, check-in or guest logic changes, no schema, permission or access changes.

## New canonical addresses

- Reservation detail: `/restaurant/pms/reservations/$reservationId`
- Guest profile in reservation context: `/restaurant/pms/reservations/guests/$guestId`

Both render inside the PMS shell with header context "PMS · Reservations" and breadcrumb Property Home → PMS → Reservations → Reservation / Guest Profile.

## What the user will see

- Clicking any reservation in Individual (table row or mobile card), in Amendments, or in Cancellations opens the reservation inside PMS Reservations. The sidebar stays the PMS sidebar with Reservations active.
- "All reservations" / back links on the detail page return to the Reservations landing page, keeping the tab the user came from where a tab is known (Amendments and Cancellations links return to their tab).
- On a reservation with a linked guest, "View guest profile" opens the guest inside PMS Reservations, with the same guest information available today (identity/contact, preferences, stay history, profile history, notes). Its back link returns to the reservation.
- The old addresses keep working: opening `/restaurant/bookings/<id>` or `/restaurant/guests/<id>` lands on the same screen at the canonical PMS address (single permanent redirect, query string preserved, no loop).
- Front Office stays a separate submodule for arrivals, check-in, room assignment, in-house and departures; its own lists keep opening reservation detail — now at the canonical PMS address.

## Technical approach

1. Extract bodies into reusable workspace components, following the existing `src/components/workspaces/*` pattern:
   - `src/components/workspaces/reservation-detail-workspace.tsx` — the current `ReservationDetailPage` body from `src/routes/restaurant/bookings/$reservationId.tsx`, taking `{ membership, reservationId, backTo? }`. Same queries (`getBookingsAccess`, `getReservation`, `listAssignableRooms`, `getRoomTypeAvailability`, `listRatePlans`) and same mutations (`amendReservation`, `assignReservationRoom`, `setReservationStatus`, `repriceReservation`).
   - `src/components/workspaces/guest-detail-workspace.tsx` — the current `GuestDetail` body from `src/routes/restaurant/guests/$guestId.tsx`, taking `{ membership, guestId }` instead of reading params, so it can mount under either route family. Same `guests.functions` calls, same `GuestFormDialog`.
   - Guest-list badge helpers (`StatusBadge`, `VipBadge`) currently imported from the guests index route move into a small shared module so both routes can use them without importing a route file.
2. New routes `src/routes/restaurant/pms/reservations.$reservationId.tsx` and `src/routes/restaurant/pms/reservations.guests.$guestId.tsx`, each with the existing `ssr: false` + `supabase.auth.getUser()` gate (redirect target = its own path), route-specific `head()`, and `RestaurantShell ... module="rooms" pms pmsModule="reservations"` so breadcrumb/sidebar/header context come from the shell as on the other PMS routes.
3. Link/navigation audit — point at the canonical routes:
   - `src/components/workspaces/reservations-workspace.tsx` (row/card `open()`)
   - `src/components/bookings/reservation-amendments.tsx`, `reservation-cancellations.tsx`
   - `src/components/workspaces/arrivals-workspace.tsx`, `src/components/frontoffice/stay-lists.tsx`, `src/routes/restaurant/rooms/in-house.tsx`, `src/routes/restaurant/rooms/departures.tsx`, `src/routes/restaurant/bookings/index.tsx` (Front Office / dashboard lists → canonical reservation detail)
   - guest links in the same files → canonical guest profile when the user is in PMS Reservations context; the standalone Guests list keeps its own address.
4. Legacy compatibility: `src/routes/restaurant/bookings/$reservationId.tsx` and `src/routes/restaurant/guests/$guestId.tsx` become thin `beforeLoad` redirects to the canonical PMS routes (same pattern as the existing `bookings/reservations.tsx` redirect), keeping their params. No route deletions.
5. Permissions untouched: same `getBookingsAccess` / `getGuestsAccess` checks, same server functions, same module access and tenant/RLS enforcement. The new URLs grant nothing extra.

## Verification

Typecheck, production build, and an authenticated browser pass: open Reservations, click several Individual rows, open the linked guest profile, use browser back, check Amendments and Cancellations links, and hit the legacy reservation and guest URLs to confirm they land on the canonical pages with no console errors.
