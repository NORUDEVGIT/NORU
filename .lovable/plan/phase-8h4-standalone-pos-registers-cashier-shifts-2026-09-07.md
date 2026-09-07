# Phase 8H4 — Standalone POS registers + cashier shifts

Make the independent till operationally ready: named tills, open/close shift with cash accountability, and a trusted "ready to sell" check. No selling screen.

## What the person will see

**Registers** (`/restaurant/pos/registers`, new)
- Compact table of tills: name, location label, active, and whether a shift is open on it right now.
- Owner/manager: add, edit, activate/deactivate. Cashier and accountant: read-only list of tills (buttons hidden and the server still refuses them).
- Deactivating a till with an open shift is refused with a clear message; shifts are never closed silently.

**Registers & Shifts** (`/restaurant/pos/shifts`, currently a placeholder)
- Top card = current state for the signed-in person: their open shift, which till, opened by, opened at, opening float, expected cash so far, and a Close shift action.
- No open shift: pick an active till and enter an opening float to open one. Tills already opened by someone else show as unavailable with the cashier's name; tills that are inactive are not offered.
- After closing, the result shows opening float, cash takings, expected cash, counted cash, variance, opened by, closed by and both timestamps — all values returned by the server.
- Below, recent shift history for this property only: till, cashier, opened, closed, opening float, expected, counted, variance, status. Closed shifts have no edit controls.

**POS Home** gains a truthful readiness strip: active till count, whether this person has an open shift, and whether the selling prerequisites are met. Sell stays marked as arriving in the next phase — no sell route is created.

## Rules already enforced by the backend (unchanged)

- **Uniqueness: one open shift per till** (`pos_shifts_one_open_per_register`, a unique index on property + till where status is open). There is no per-cashier restriction in the database, so one person could hold shifts on two different tills; the screen surfaces the person's own open shifts rather than blocking, and refuses a second shift on a till that is already open.
- Expected cash = opening float + captured **cash** payments − **cash** refunds for that shift. Card, manual and any future room charge never enter the drawer expectation.
- Variance = counted cash − expected cash, computed and stored server-side. The screen only displays what the server returns.
- Roles: entry/read owner, manager, cashier, accountant; open/close shift owner, manager, cashier; register setup owner, manager only. Every call re-checks membership, the `pos` package and `standalone_pos` module access.

## Technical notes

New files
- `src/components/workspaces/standalone-pos/registers-page.tsx` — till list plus create/edit dialog.
- `src/components/workspaces/standalone-pos/shifts-page.tsx` — current-shift card, open form, close dialog, history table.
- `src/routes/restaurant/pos/registers.tsx` — same guard shape as the other POS routes (`sign-in check` then `requireRoutePackage("pos")`), own `head()` metadata.

Edited files
- `src/routes/restaurant/pos/shifts.tsx` — swap the foundation placeholder for the real page.
- `src/lib/standalone-pos.functions.ts` — narrow additions only:
  - `listPosRegisters` extended to report `hasOpenShift` (and who) for setup screens.
  - `savePosRegister` refuses `active: false` while an open shift exists on that till.
  - `getPosShiftState` — current person's open shift(s), plus per-till open-shift occupancy and expected cash so far, derived from `pos_cashier_shifts` / `pos_payments` / `pos_refunds`.
  - `listPosShifts` — recent shift history for the property, joined to till name and cashier name.
  - `posSellReadiness` — reusable server check (package + module + selling role + an active till + an open shift owned by this person); returns a reason when not ready. Reused in 8H5.
  - `openPosShift` gains an active-till check and maps the unique-index violation to "That till already has an open shift."
- `src/lib/standalone-pos-modules.ts` — registers entry added, shifts/registers marked live.
- `src/components/restaurant-shell.tsx` — `posModule` sidebar gains the Registers entry.
- `src/components/workspaces/standalone-pos/pos-home.tsx` — readiness strip.
- `docs/standalone-pos-architecture.md`, `docs/architecture-ownership.md` — register and shift lifecycle, uniqueness rule, cash expectation, variance, selling prerequisites, and Standalone POS ownership of tills and cashier shifts.

Database: **no new tables**. `pos_registers` has `name`, `location_label`, `active` only — no code field and no hardware pairing, matching the frozen model. A corrective migration is only applied if a real constraint bug appears, and would be reported.

Money: opening float and counted cash are sent as numeric values, validated and rounded server-side; display uses the property currency formatter.

## Verification

- Typecheck and production build.
- Signed-in browser pass over `/restaurant/pos`, `/restaurant/pos/registers`, `/restaurant/pos/shifts` — no console or server errors.
- Lifecycle test on temporary data: create a till, edit it, open a shift with float 100, confirm a second shift on the same till is refused, confirm deactivating that till is refused, close with counted 100 (expected 100, variance 0), repeat with counted 95 (variance −5), confirm the closed shift has no edit controls, then deactivate/reactivate and delete the test records.
- Two tills with two cashiers, to prove shift state is per till and not property-global.
- Role matrix: owner, manager, cashier, accountant; POS off and `standalone_pos` removed both blocked back to Property Home; POS on with Restaurant Management, PMS and Back Office each off still fully works.
- Readiness test: no till → not ready; active till, no shift → not ready; open shift → ready; closed shift → not ready; no module access or package off → not ready.
- Regression: Restaurant Management till, its cashier shifts, payments and Charge to Room untouched; PMS Cashiering untouched.

## Deferred to 8H5

Sell screen and cart, payment UI, transactions browser, receipts, refunds UI, POS reports, inventory bridge, Charge to Room bridge, folder cleanup.
