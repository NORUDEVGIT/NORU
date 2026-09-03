# Phase 7B Final Cleanup — Inventory / Procurement Top Tabs

## Goal

The shared inventory screen already switches the sidebar module between Inventory and Procurement via the `?tab=` search param and the shell's `module` prop, but the top tab bar still renders one combined list. Make the top tabs context-aware so Inventory never shows Suppliers/Purchasing and Procurement never shows the stock tabs.

Presentation/navigation only. No schema, RLS, permissions, ledger, supplier, purchasing, or route changes. No component duplication.

## Changes — single file: `src/routes/restaurant/inventory/index.tsx`

### 1. Context-aware tab bar (`TabsList`, ~line 306-315)

Replace the fixed 7-trigger list with a conditional list driven by the existing `procurement` boolean:

- **Inventory context** (`!procurement`): Overview, Ingredients, Consumables, Operating Assets, Equipment.
- **Procurement context** (`procurement`): Suppliers, Purchasing.

The existing `TabsContent` blocks stay exactly as they are — only the visible triggers change. `Tabs` value/`onValueChange` and `allowed` search-tab sync list stay unchanged, so direct links like `/restaurant/inventory?tab=suppliers` and `/restaurant/inventory?tab=ingredient` keep working and switch context.

Also update the "New item" button condition (~line 291) so it keys off `!procurement` instead of the literal tab names (equivalent behavior, cleaner guard).

### 2. Procurement header copy (~line 276-284)

The header already flips between "Inventory" and "Procurement" and has a procurement-specific subtitle. Update the procurement subtitle to the concise wording:

> Manage suppliers and purchasing. Every receipt is recorded in the movement ledger.

(Already close to requested "Manage suppliers and purchasing for your property." — final copy: "Manage suppliers and purchasing for your property." to match the request, keeping the Inventory subtitle unchanged.)

## Verification

1. `bunx tsgo --noEmit -p tsconfig.json` — clean.
2. Check `/tmp/observability/build-errors.log` — build OK.
3. Playwright walkthrough on The Garden (owner session):
   - `/restaurant/inventory?tab=overview` → sidebar = Inventory module; top tabs = Overview, Ingredients, Consumables, Operating Assets, Equipment only.
   - `/restaurant/inventory?tab=suppliers` → sidebar = Procurement module; header "Procurement" + new subtitle; top tabs = Suppliers, Purchasing only.
   - `/restaurant/inventory?tab=purchasing` → same Procurement tabs.
   - Click between tabs and confirm content renders (Ingredients list, Suppliers tab, Purchasing tab) with no console errors.
4. Screenshot both contexts at desktop width.

## Out of scope

- No new procurement dashboard (Procurement keeps its two tabs, defaulting to Suppliers).
- No backend, business logic, or permission changes.
- No route renames or new routes.
