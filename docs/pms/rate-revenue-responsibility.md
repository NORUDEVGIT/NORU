# Rate & Revenue — ownership boundary (Phase 1 Prompt 2)

**Enforced in product copy and Rate & Revenue UI as of Prompt 2.** Server writers for rate masters are **not** deleted. Pricing engine and snapshots are unchanged.

## PROPERTY SETUP OWNS

- Rate categories and rate plan **masters** (code, name, room type, validity, catalogue `active`)
- Commercial master definitions (`pms_commercial_restrictions`, promotions, seasons)
- Packages and meal-plan catalogues
- Corporate agreement and contract-rate masters
- Source / segment / sales-channel catalogues (Card 6 / SET6)
- Currency, tax, payment, and billing **configuration** on Card 3

Canonical configure-rates destination: `/restaurant/settings#financial-commercial` (`CARD3_HREF`). Card 3 opens on Currency first; Rates & Pricing is a domain inside that workspace.

## RATE & REVENUE OWNS

- Operational daily rate calendar overrides (`hotel_rate_calendar` via `saveRateOverride`)
- Date-level restrictions on `hotel_rate_restrictions` (min/max stay, CTA, CTD, stop sell)
- Operational revenue monitoring (`getRevenueOverview` / Overview tab)
- Future commercial activation/application, demand/forecast, analytics, approval, and audit **workflows** (not built in Prompt 2)

## RESERVATIONS OWNS

Reservation lifecycle and **repricing execution** (`create_hotel_reservation_priced`, `amend_hotel_reservation_priced`, `repriceReservation`).

## FRONT OFFICE OWNS

Stay lifecycle (check-in / check-out / walk-in / in-house).

## CASHIERING OWNS

Financial postings (folios, room charge from snapshot at folio open).

## DISTRIBUTION OWNS

External connectivity (Card 6 mappings / sync intent — not a live OTA engine).

## Prompt 2 implementation notes

- Rate Plans tab in Rate & Revenue is a **read-only** operational reference.
- `hotel_rate_plans.active` meaning is unchanged; the RR **toggle is removed**.
- `pms_commercial_restrictions` is **not** applied onto `hotel_rate_restrictions`.
- Card 3 still has a **duplicate** calendar writer (`saveRateOverrideCard3`). Not removed.
- Route still uses `RestaurantShell` `module="configuration"` so the existing left rail works. Prompt 3 owns chrome/moduleKey restructure.
- Room & Inventory chrome files (`room-inventory-chrome.tsx`, availability, calendar) are Prompt 3 layout references. This Prompt 2 checkout may not list them; **do not modify RI**.
