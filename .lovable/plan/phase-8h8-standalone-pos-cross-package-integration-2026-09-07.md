# Phase 8H8 — Standalone POS cross-package integration

Make the independent till a real, read-only source inside Back Office, without the till depending on Back Office in any way. Audit — and most likely defer — the stock and charge-to-room bridges.

## What changes for people using it

**Back Office · Accounting & Finance**
- The "Standalone POS" card stops saying "Planned" and shows real figures for today's property business date: gross recorded till sales, refunds processed today, net recorded sales, transaction count, cash/card/other tender activity and open cashier shifts.
- Wording stays honest: recorded operational till activity — not ledger revenue, not bank-settled money, not audited cash, not profit.

**Back Office · Reports & Intelligence**
- Revenue & Sales gains a real Standalone POS block (sales count, gross, refunds, net for today), clearly labelled as its own source.
- Restaurant Management, PMS and Standalone POS figures stay visually and numerically separate. No combined total is invented.

**Links**
- "Open Standalone POS reports" and "Open Standalone POS transactions" appear only when the till package is on AND the person has till access. Seeing a Back Office summary never grants till access.

**Unchanged**
- The till keeps working with Restaurant Management, PMS and Back Office all switched off. No sale can fail because Back Office is off.

## Audits (expected outcome: both deferred)

**Stock consumption** — the till's products have no link to inventory items, no unit/quantity mapping, no recipe-style multi-item mapping, and no idempotency marker for once-only posting. Name/SKU matching would silently consume the wrong stock. Decision: defer; record the exact requirements (explicit product↔item mapping with quantity and unit, once-only posting key, refund-does-not-restock rule, works with Back Office off) in the architecture doc.

**Charge to room** — the existing hotel bridge is built around restaurant orders (`post_order_room_charge` / `reverse_order_room_charge` keyed to `orders`), so it can't take a till receipt without changing Restaurant Management behaviour. Decision: defer; document the requirements (in-house guest lookup, folio reference, till-receipt source identifier, duplicate-posting prevention, refund reversal path, package/role rules).

## Technical notes

- New narrow read helper `getBackOfficePosSummary` in a new `src/lib/back-office-pos.functions.ts`, backed by `buildPosReport` in `standalone-pos-reporting.server.ts` so the formulas are never duplicated and figures reconcile exactly with the till's own reports. It returns summary + tender rows + open-shift count only; no receipt or line detail.
- Gating: `requireBackOfficeFinanceRead` (or reports equivalent) first, then `publicPackageAvailable(restaurantId, "pos")`. Never uses the till's operational guard, so a finance reader is not given till access — and a finance reader without till access still gets no operational links.
- Refund date semantics kept distinct: sales-cohort figures attribute refunds to the original receipt's business date (existing `buildPosReport` behaviour); "refunds processed today" uses `pos_refunds.created_at`. Both are documented; neither timestamp is dropped.
- Edits: `back-office-finance.functions.ts` (POS card planned → live), `accounting-pages.tsx`, `back-office/reports-page.tsx`, `back-office-modules.ts` descriptions.
- No database changes, no new tables, no copied transactions, no writes of any kind.
- Verification: typecheck, production build, and a browser pass on temporary till data checking Back Office gross/refunds/net match the till's own reports exactly, plus the package matrix (POS off + BO on, POS on + BO on, BO off + POS on) and regression on Restaurant Management, PMS and existing Back Office figures. Any test data removed afterwards.
- Docs updated: `docs/standalone-pos-architecture.md` and `docs/architecture-ownership.md`.
