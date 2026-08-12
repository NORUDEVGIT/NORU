# The Garden Table — Ordering Prototype

A frontend-only, mobile-first ordering site for diners at the table. No backend, no accounts, no payments: everything runs on mock data and local state, structured so a backend can slot in later.

## Flow

```text
Menu -> Item detail -> Cart -> Table number -> Review -> Confirmation -> Order status
```

## Screens

- **Menu (/)** — sticky header (logo "The Garden Table", menu, search, cart with item count + running total), hero strip with name and one-line description, horizontally scrollable category rail (Starters, Main Courses, Burgers, Pizza, Sides, Desserts, Drinks), item cards with image, name, short description, price, dietary tags, and a large Add button. Search filters items live.
- **Item detail (modal / bottom sheet on mobile)** — large image, name, description, price, dietary info, quantity stepper, special instructions field, "Add to order" with live line total.
- **Cart (/cart)** — line items with image, name, price, quantity controls, remove, special instructions; subtotal and total; empty state with a link back to the menu; large "Continue to Order".
- **Table number (/table)** — "Where are you sitting?", numeric input, validation (required, 1-99), Continue.
- **Review (/review)** — table number (editable), items with quantities and instructions, subtotal, total, prominent "Place Order".
- **Confirmation (/confirmation)** — "Order Confirmed!", mock order number (#1042-style), table number, items, total, estimated prep time; buttons for "Back to Menu" and "Track order".
- **Order status (/status)** — vertical progress indicator Order Received -> Preparing -> Ready -> Served, with a demo control to advance/reset the status manually.

## Rules and validation

- Cart persists across screens via shared state; badge and total visible on every menu screen.
- Checkout blocked with an empty cart; Place Order blocked without a valid table number, with inline messages.
- Guarded routes: /review and /confirmation redirect back if their prerequisites are missing.

## Design

Premium garden-restaurant look: deep forest green and warm cream base, muted terracotta accent, elegant serif display headings paired with a clean sans for body text, generous rounded cards, soft shadows, subtle fade/slide transitions on the sheet and route changes. Touch targets at least 48px. Mobile is the primary layout; tablet and desktop widen into a multi-column menu grid with a persistent cart panel.

## Technical notes

- TanStack Start routes per screen; no hash-only sections. Each route gets its own head() metadata.
- `src/data/menu.ts` holds typed menu items (id, name, description, price, category, image, dietaryTags) — 4+ per category across 7 categories.
- `src/state/order-store.tsx` — a React context + reducer holding cart lines, table number, placed order, and order status; the only place mutating order data, so it can later be swapped to server calls without touching UI.
- Components split under `src/components/` (header, category rail, item card, item sheet, cart line, progress tracker).
- Food imagery generated as local assets; design tokens added to `src/styles.css`, no hardcoded color utilities.
