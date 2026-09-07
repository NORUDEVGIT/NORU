# Phase 8H9 — Standalone POS ownership + route cleanup

The audit is done. The two tills are already cleanly separated in code, addresses and data. This phase is a small, low-risk correction pass: remove one dead screen, fix wording that is now untrue, and rewrite the two architecture documents so nobody later assumes the wrong thing. No new features, no behaviour changes, no database changes.

## Audit result (already verified, nothing to change)

Independent till (canonical, all live and correctly gated):

```text
/restaurant/pos                       Home
/restaurant/pos/dashboard             Dashboard
/restaurant/pos/sell                  Sell
/restaurant/pos/catalog               Catalog
/restaurant/pos/transactions          Transactions
/restaurant/pos/transactions/:saleId  Transaction detail
/restaurant/pos/registers             Registers
/restaurant/pos/shifts                Registers & shifts
/restaurant/pos/reports               Reports
/restaurant/pos/settings              Settings
```

- Restaurant till stays at `/restaurant/restaurant-management/pos-sales`, keeping the restaurant menu, orders, restaurant payments, restaurant cashier shifts and the existing charge-to-room.
- `/restaurant/pos/new` is already a compatibility redirect to the restaurant till. Historical meaning is correct — it will be left exactly as it is.
- Every internal link was checked: no screen sends a user to the wrong till. Back Office deep links already require the till package to be on *and* the reader's own till access; summary visibility alone grants nothing.
- Property Home shows the two tills as separate tiles with no duplicate labels.
- No dead routes found.

## Changes to make

1. **Remove one dead screen.** `src/components/workspaces/standalone-pos/foundation-page.tsx` is a "not built yet" placeholder with zero remaining users — every area it covered now exists. Delete it.
2. **Fix the Property Home tile wording.** The independent till tile still reads "Catalog · Settings · Selling coming next", which is untrue. Replace with the real module list (Sell · Catalog · Transactions · Registers & Shifts · Reports · Settings).
3. **Fix the stale note at the top of the till home screen** (`pos-home.tsx`) that says only Catalog and Settings work.
4. **Rewrite `docs/standalone-pos-architecture.md` status.** Replace the "architecture freeze, documentation only / not built yet" framing with current state: final live route map, module status, ownership table, package-vs-module naming distinction, deferred bridges, and a recommended move map for the next phase.
5. **Update `docs/architecture-ownership.md`.** Mark independent-till operational ownership complete and correct the stale lines that still describe it as a future add-on to Restaurant Management.

## Naming ambiguity to record (not to fix now)

Deliberately left alone, and documented so a later phase does not collapse them:

| Key | Meaning today |
| --- | --- |
| package `pos` | the independent till commercial package |
| module `pos` | access to the *restaurant* till inside Restaurant Management |
| module `standalone_pos` | access to the independent till |

Also recorded for the next phase, not touched now: `src/lib/pos.functions.ts` and `pos.server.ts` actually serve the **restaurant** till despite their generic names, and sit next to `standalone-pos.*`. Recommended future rename to `rm-pos.*`, plus moving `src/components/pos/*` under a restaurant-owned folder. Both are rename-only work and belong to the next phase.

## Bridge status to be stated plainly in the docs

- Back Office reporting and finance — live, read-only.
- Stock depletion from till sales — deferred.
- Independent till charge-to-room — deferred.
- Restaurant till charge-to-room — unchanged and live.

No screen currently implies the deferred ones work; this will be re-checked.

## Verification

- Type check and production build.
- Signed-in browser pass over all ten independent-till screens, the restaurant till, the Back Office finance and reports till sources, and `/restaurant/pos/new`.
- Package-combination behaviour will be confirmed by reading the guards rather than switching packages on and off, so no entitlement rows are touched.
- No database changes at all.
