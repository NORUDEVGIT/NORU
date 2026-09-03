# Phase 7B Cleanup — Module Header / Top Nav Consistency

Presentation, labels and page-level navigation only. No schema, RLS, auth, or business-logic changes. No route renames or removals — every existing URL keeps working. Sidebars are already correct and stay as-is.

Verified current state: shell module titles (`MODULE_TITLE`) are already correct ("Front Office", "Food & Beverage", "Inventory", "Procurement", "Human Resources", "Reports & Analytics", "Configuration", "Property Settings & Integrations"). The staleness lives in page-level h1s, head() meta, one error message and the rooms/inventory tab bars.

## 1. Front Office

**`src/routes/restaurant/rooms/index.tsx`**
- h1 "Rooms & Front Office" → "Front Office" (both the access-denied block and the main header), with subtitle "Manage arrivals, in-house guests, departures and reservations for {property name}."
- head(): title/og:title "Rooms & Front Office — NORU" → "Front Office — NORU"; description updated to daily hotel operations.
- Top tabs: the page today shows Dashboard / Room Types / Rooms to everyone. Change so the tab bar is context-aware:
  - Front Office context (`tab=dashboard` or no tab): header "Front Office", only the Dashboard trigger shown (no Room Types / Rooms triggers).
  - Configuration context (`tab=room-types` or `tab=rooms`, already passed as `module="configuration"`): header "Configuration" with a "Rooms" subheading, only the Room Types / Rooms triggers shown.
  - Tab values and `?tab=` URLs are unchanged, so all existing links (sidebar, Configuration page, Property Home tiles) work exactly as before.

**`src/routes/restaurant/rooms/arrivals.tsx`, `in-house.tsx`, `departures.tsx`**
- head() titles "… — Rooms & Front Office — NORU" → "… — Front Office — NORU". Page h1s ("Arrivals", "In-House Guests", "Departures") already correct.

**Guest/booking pages** — replace the stale module name "Booking & Guest Management" with "Front Office" where it is used as the module header:
- `src/routes/restaurant/guests/index.tsx`: denied-state h1 → "Front Office" (the "Guests" content h1 stays); head title "Guests — Booking & Guest Management — NORU" → "Guests — Front Office — NORU".
- `src/routes/restaurant/guests/$guestId.tsx`: denied-state h1 → "Front Office".
- `src/routes/restaurant/bookings/index.tsx`: denied-state h1 → "Front Office"; head title → "Booking Dashboard — Front Office — NORU".
- `src/routes/restaurant/bookings/new.tsx`, `reservations.tsx`, `$reservationId.tsx`: head titles "… — Booking & Guest Management — NORU" → "… — Front Office — NORU".
- `bookings/new.tsx` helper text "Add them in Rooms & Front Office." → "Add them in Configuration → Rooms." (matches where Room Types now live).
- `src/lib/reservations.server.ts` user-facing error "You don't have access to Booking & Guest Management…" → "…Front Office…" (display text only; no logic change).

## 2. Configuration context labels

Pages already render inside the Configuration module via the shell; add/confirm a small "Configuration" context line (eyebrow above the h1) so the page itself shows where it lives:
- `src/routes/restaurant/menu.tsx` (h1 "Menu" stays; add "Configuration" eyebrow; head meta otherwise unchanged).
- `src/routes/restaurant/tables.tsx` (h1 "Tables & QR Codes" stays; add "Configuration" eyebrow).
- `src/routes/restaurant/bookings/rates.tsx` (h1 "Rates & Revenue" stays; add "Configuration" eyebrow; its Overview/Plans/Calendar/Restrictions tabs stay — Phase 7B kept the Rates Overview tab by design).
- `src/routes/restaurant/bookings/distribution.tsx` (h1 "Distribution" stays; add "Configuration" eyebrow).
- `rooms/index.tsx` in `room-types`/`rooms` context as described in section 1.

## 3. Food & Beverage

- No literal "Restaurant Management" strings remain in `src/` (grep-verified). Dashboard (`dashboard.tsx`) shows the property name as h1 — add a "Food & Beverage" eyebrow/subtitle so the module header matches the sidebar and tile. Kitchen, Orders, Take Order headers already match their nav labels.
- No Menu / Tables & QR entries exist in any Food & Beverage tab bar (the F&B pages have no such tabs) — nothing to remove.

## 4. Inventory / Procurement

**`src/routes/restaurant/inventory/index.tsx`**
- Header is context-aware: Inventory tabs (overview/ingredients/consumables/operating assets/equipment) show h1 "Inventory" with the existing subtitle; Procurement tabs (suppliers/purchasing) show h1 "Procurement" with a suppliers/purchasing subtitle. The shell sidebar/header already switch via the existing `module` prop.
- Tab bar left intact (the tabs are the page's content switcher and existing `?tab=` links from the sidebar, Property Home and Configuration depend on them).

**`src/routes/restaurant/inventory/purchasing/$purchaseOrderId.tsx`** — already renders under the Procurement module; no label change needed.

## 5. Human Resources

**`src/routes/restaurant/staff.tsx`**
- Access-denied h1 "Staff management" → "Human Resources".
- "Staff & roles" stays — it is the heading of the Staff tab's content, not module terminology (semantically correct per the instructions).
- head() title updated to "Human Resources — NORU" if it still says otherwise (verify during implementation).

## 6. Settings

**`src/routes/restaurant/settings.tsx`**
- h1 "Settings" → "Property Settings & Integrations".
- head() title/og:title "Restaurant Settings — NORU" → "Property Settings & Integrations — NORU".

## 7. Reports

- `src/routes/restaurant/reports.tsx` already shows h1 "Reports & Analytics" — verify head() meta matches and adjust if stale.

## 8. Explicitly not touched

- `src/lib/rooms.server.ts` code comment "Rooms & Front Office foundation" — internal comment, not user-facing; leaving it avoids a needless diff (will update the one-line comment only if the file is otherwise touched).
- Sidebar nav, `MODULE_NAV`, `MODULE_TITLE`, `LABEL_MODULE`, Property Home tiles — already correct.
- All route paths, `?tab=` values, server functions, RLS.

## Verification

- `bunx tsgo --noEmit` and production build clean.
- Playwright walkthrough on The Garden (owner): Front Office dashboard/arrivals/in-house/departures/reservations/new/guests headers say Front Office with no Room Types/Rooms tabs; Configuration sidebar shows Menu, Tables & QR, Room Types, Rooms, Rate Plans, Rate Calendar, Restrictions, Distribution and each target page shows Configuration context; Inventory vs Procurement headers switch correctly; HR and Settings headers renamed; Property Home tiles unchanged; mobile + desktop widths; console clean.
- Report the corrected stale labels per file.
