# Phase 6C — Guest Profiles Foundation

Guest identity only. No reservations, availability, rates, folios, documents or CRM.

## Database (one migration)

Three new tenant-scoped tables, following the rooms/inventory pattern (GRANTs, RLS, owner/manager-only policies, `set_updated_at` triggers):

- `guest_profiles` — first_name (required), last_name, phone, email, nationality, language, date_of_birth, address_line1/2, city, region, country, postal_code, guest_status (`active`/`inactive`, default active), vip_status (default false), notes, linked_customer_user_id (nullable, no workflow), created_by_staff_membership_id, created_at, updated_at. Plus normalized helper columns `email_normalized` (lowercased) and `phone_normalized` (digits only), maintained by a trigger, with non-unique indexes on (restaurant_id, email_normalized) and (restaurant_id, phone_normalized) for duplicate lookup. No unique constraint — duplicates are warned about, never blocked or merged.
- `guest_preferences` — one row per guest: room, bed, floor, view, food, communication preferences, accessibility_requirements, special_requests. Unique on (restaurant_id, guest_id).
- `guest_profile_history` — immutable log: event_type (`created`, `profile_updated`, `vip_changed`, `status_changed`, `preference_updated`), previous_values/new_values jsonb, notes, actor_membership_id, created_at. Insert/update/delete denied to clients; written server-side.

No hard delete anywhere; deactivation sets `guest_status = 'inactive'`.

## Server layer

- `src/lib/guests.server.ts` — helpers mirroring `rooms.server.ts`: `requireGuestManager` (owner/manager via `callerMembership`), normalization helpers, duplicate lookup, history writer.
- `src/lib/guests.functions.ts` — server functions with `requireSupabaseAuth`: `getGuestsAccess`, `listGuests` (search by name/phone/email, filters for status and VIP, pagination), `getGuest` (profile + preferences + history), `findGuestDuplicates`, `createGuest`, `updateGuest`, `setGuestVip`, `setGuestStatus`, `upsertGuestPreferences`, `addGuestNote`.

Every function re-derives `restaurant_id` from the authenticated membership; a browser-supplied id is only ever used to select which membership to verify. Kitchen and waiter roles are rejected server-side. Guest PII is never referenced by public/QR routes.

## Duplicate detection

On create (and on email/phone change during edit), the server searches the same property for matching normalized email or normalized phone. Matches are returned to the UI, which shows a "possible existing guest" step listing them with a button to open the existing guest instead. Staff can still confirm and create a separate profile. Nothing merges automatically; name is never a duplicate signal.

## Routes and UI

- Activate the **Booking & Guest Management** card on `/restaurant/home` for owner/manager (link to `/restaurant/guests`); other roles keep it hidden as today.
- `src/components/restaurant-shell.tsx`: add a `guests` module with a single nav entry (Guests) plus the existing "← NORU Home" backlink.
- `/restaurant/guests` — search box, status/VIP filters, "+ New Guest" dialog, desktop table / mobile cards showing Guest, Phone, Email, Nationality, VIP, Status, Last Updated.
- `/restaurant/guests/$guestId` — header with name and VIP/status badges, Edit and Add Note actions, tabs: Overview (contact, address, nationality, language, DOB, notes), Preferences (editable form), History (immutable timeline in the property timezone). No reservations/stays/payments tabs.
- New components under `src/components/guests/`: guest list tab, guest dialogs (create/edit, duplicate warning, note), preferences form, history timeline. Existing NORU UI primitives only.

## Testing

Playwright with the owner session: create John Doe (Ethiopian, English, VIP false, King bed / non-smoking preference), verify list appearance, search by name/phone/email, edit, VIP toggle, preference save, history entries, duplicate warning on repeat email/phone, deactivation, and that kitchen/waiter are blocked. Build and typecheck must pass.

## Out of scope

Reservations, availability, rates, check-in, housekeeping, folios, loyalty, CRM, company/agent/group profiles, document uploads, customer-account linking workflow, receptionist role. No changes to restaurant, rooms, stock, staff, orders, kitchen, QR, settings or admin modules.
