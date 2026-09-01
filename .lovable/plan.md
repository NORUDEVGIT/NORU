# Phase 6B — Property + Room Foundation

Room setup only: room types, rooms, amenities, room-type images, and a basic overview. No reservations, guests, check-in, housekeeping, rates or folios.

## What the user gets

The "Rooms & Front Office" card on Property Home becomes active (owner/manager only) and opens `/restaurant/rooms`, a new module workspace with its own sidebar:

```text
← NORU Home
Rooms & Front Office
  Dashboard
  Room Types
  Rooms
```

**Dashboard** — counts from existing data only: Total Rooms, Active, Sellable (rooms whose type is sellable), Available, Out of Order, Out of Service, plus a simple "Rooms by Type" breakdown.

**Room Types** — searchable list with active/inactive filter showing cover image, code, name, capacity, bed, sellable, active and room count. Add / Edit / Images / View / Deactivate. Form covers code, name, description, max occupancy, adult & child capacity, bed type, bed count, room size, room view, amenities, sellable, active.

**Images** — a per-room-type gallery dialog: upload multiple JPG/PNG/WebP (size-validated), preview, set cover, reorder, delete. Images live in Storage; only metadata in the database.

**Rooms** — searchable by room number, filterable by type, floor, building, status and active. Shows room number, type, floor, building/wing, status, active. Add / Edit / View / Deactivate — never hard delete.

## Database

New tenant-scoped tables, all with GRANTs, RLS enabled and membership-based policies matching existing patterns (`is_restaurant_member` for read, owner/manager for write, enforced again server-side):

- `room_types` — code, name, description, max/adult/child capacity, bed type & count, room size, room view, sellable, active, creator membership, timestamps. Unique `(restaurant_id, code)`.
- `hotel_rooms` — room_type_id, room_number, floor, building, wing, smoking, accessible, status (`available` | `out_of_order` | `out_of_service`), active, notes, creator membership, timestamps. Unique `(restaurant_id, room_number)`. A composite foreign key ties the room's `(restaurant_id, room_type_id)` to the room type's own `(restaurant_id, id)`, so a room can never point at another property's type.
- `room_amenities` — restaurant-scoped name + active; seeded per property on first use from a standard list (Wi-Fi, Air Conditioning, TV, Minibar, Balcony, Bathtub, City View, Accessible Bathroom).
- `room_type_amenities` — join table, restaurant scoped.
- `room_type_images` — room_type_id, storage_path, display_order, is_cover, alt_text, uploader membership, created_at.

`updated_at` triggers reuse the existing `set_updated_at()` function. No existing table is renamed or altered.

## Storage

A new private bucket `property-images` with paths `property/{restaurant_id}/room-types/{room_type_id}/{uuid}.{ext}`. Storage RLS reuses the existing path-prefix check pattern (`can_manage_restaurant_storage`-style, first segment matched against the caller's owner/manager memberships). Uploads go through a server function that verifies membership and issues a signed upload URL; reads are signed URLs generated server-side. Delete removes the metadata row and the storage object together, so no orphans.

## Server functions

New `src/lib/rooms.functions.ts` + `src/lib/rooms.server.ts`, following the suppliers/inventory pattern:

- Room types: list (with room counts and cover URLs), get, create, update, set active, set amenities.
- Rooms: list (filters applied in SQL), get, create, update, set active.
- Images: create signed upload, register metadata, reorder, set cover, delete (metadata + object).
- Dashboard: one aggregate call returning the counts and rooms-by-type.

Every handler uses `requireSupabaseAuth`, resolves the caller's membership server-side via `callerMembership`, and rejects anyone who is not owner/manager for that restaurant. The browser never supplies a trusted restaurant id — it is validated against membership on every call.

## Routes / UI

- `src/routes/restaurant/rooms/index.tsx` — module page with Dashboard / Room Types / Rooms tabs, deep-linkable via the existing `?tab=` search-param pattern.
- `src/components/rooms/*` — room-type table + dialog, rooms table + dialog, image gallery dialog, dashboard cards.
- `src/components/restaurant-shell.tsx` — add a `rooms` workspace module with its nav entries and title; new `Rooms` nav label.
- `src/routes/restaurant/home.tsx` — flip the Rooms & Front Office card to active, linking to `/restaurant/rooms`, restricted to owner/manager.
- `head()` metadata on the new route.

Kitchen and waiter roles see no Rooms card and no Rooms nav; the server denies them regardless.

## Verification

Create Deluxe King (DLX-K, max 2, 2 adults, king bed, sellable, Wi-Fi + Minibar), upload several images and set a cover, then rooms 201 (available) and 202 (out of service). Check dashboard counts, room-type room count, gallery reorder/delete, duplicate code and duplicate room number rejection, and that kitchen/waiter are denied. Build and typecheck must pass. Test rows are left in place unless you'd like them removed.

## Out of scope

Reservations, guests, check-in/out, room assignment, housekeeping, folios/payments, rates, OTA, maintenance workflow, hotel-specific staff roles, and any change to Restaurant, Stock, Staff, ordering, kitchen or admin modules.
