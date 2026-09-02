# Phase 6C — Guest Profiles Foundation

Guest identity only. No reservations, rates, folios, or documents.

## Database (one migration, `0012_create_guest_profiles.sql`)

- `guest_profiles` — tenant-scoped, `first_name` required, everything else nullable: last name, phone, email, nationality, language, date_of_birth, address_line1/2, city, region, country, postal_code, `guest_status` ('active' | 'inactive', default active), `vip_status` boolean default false, notes, `linked_customer_user_id` (nullable, no workflow yet), `created_by_staff_membership_id`, timestamps. Adds normalized helper columns `email_normalized` (lowercased) and `phone_normalized` (digits only), maintained by a trigger, indexed per restaurant for duplicate lookup. No unique constraint — duplicates are warned about, never blocked or merged.
- `guest_preferences` — one row per guest: room, bed, floor, view, food, communication preference, accessibility requirements, special requests, timestamps.
- `guest_profile_history` — immutable append-only log: event_type (`created`, `profile_updated`, `vip_changed`, `status_changed`, `preference_updated`), previous_values / new_values jsonb, notes, actor_membership_id, created_at. No update/delete policies.
- GRANTs to `authenticated` and `service_role`, RLS enabled on all three, policies restricted to owner/manager members of the same restaurant (reuse `has_restaurant_role`-style membership checks). No `anon` grant — guest PII stays off public/QR routes.
- `updated_at` triggers reuse `set_updated_at`.

## Server layer

- `src/lib/guests.server.ts` — mirrors `rooms.server.ts`: `requireGuestManager(context, restaurantId)` re-derives the membership from `restaurant_users` and allows owner/manager only; normalization helpers; history writer.
- `src/lib/guests.functions.ts` — `createServerFn` + `requireSupabaseAuth`:
  `listGuests` (search by name/phone/email, filters active/inactive/VIP, paginated), `getGuest` (profile + preferences + history), `findGuestDuplicates` (normalized email/phone match within the property), `createGuest`, `updateGuest`, `setGuestVip`, `setGuestStatus`, `upsertGuestPreferences`, `addGuestNote`.
  Every handler resolves `restaurant_id` through the caller's membership; a browser-supplied id is only ever used to select which of the caller's memberships applies. No hard delete.

## Duplicate detection

On submit of the New Guest form, the client calls `findGuestDuplicates` with the trimmed email/phone. Matches (same property only) are shown in a dialog listing name, phone, email and status, with "Open existing guest" or "Create anyway". Name alone never triggers a warning; nothing is auto-merged.

## Routes and UI

- `/restaurant/guests` — list: search box, active/inactive and VIP filters, "+ New Guest". Desktop table (Guest, Phone, Email, Nationality, VIP, Status, Last Updated) and mobile cards; row click opens detail.
- `/restaurant/guests/$guestId` — header with name plus VIP/status badges, Edit and Add Note actions, tabs Overview (contact, address, nationality, language, DOB, notes), Preferences (editable form), History (timeline, restaurant-timezone timestamps). No reservation/stay/payment tabs.
- Dialogs in `src/components/guests/` following the rooms/inventory dialog patterns.
- `restaurant-shell.tsx`: add a `guests` workspace module titled "Booking & Guest Management" with a single nav entry (Guests) plus the existing "← NORU Home" backlink.
- `restaurant/home.tsx`: flip "Booking & Guest Management" from coming-soon to active, linking to `/restaurant/guests`, visible to owner/manager only.

## Permissions and security

Owner and manager: full access. Kitchen and waiter: no access — hidden in UI, rejected server-side, and blocked by RLS. Service-role client only inside server handlers. Cross-property reads/writes impossible because both the membership check and RLS scope by restaurant.

## Verification

Against The Garden with an owner session: create John Doe (Ethiopian, English, VIP false, king-bed preference), search by name/phone/email, edit, toggle VIP, save preferences, confirm history entries, trigger a duplicate warning on the same email/phone and confirm no merge, deactivate, confirm kitchen/waiter are blocked, confirm another tenant cannot read the record, and run build + typecheck. Nothing about The Garden is hardcoded.

## Out of scope

Reservations, availability, rates, check-in, housekeeping, folios, loyalty, CRM, companies/agents/groups, ID document upload, customer-account linking workflow. No changes to restaurant, rooms, stock, staff, orders, kitchen, QR, settings, or admin modules.
