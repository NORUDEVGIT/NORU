# Rate & Revenue — Phase 5A package engine (P5A-03)

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Prompt** | **P5A-03 COMPLETE** |
| **Migration** | `0106_pms_commercial_package_engine.sql` (dual-lane) |
| **Pricing** | `price_hotel_stay` body unchanged in `0016` |

## 1. V1 eligibility

A selected package activation is eligible only when all of these hold:

- activation belongs to the property
- activation `active = true`
- master `pms_packages` row exists and is active
- the stay is fully inside `valid_from` / `valid_to`
- room type is allowed
- rate plan is allowed
- charge basis is V1-executable (`per_stay`)
- snapshotted `package_price` is valid (`> 0`)

No booking window, LOS, DOW, source/channel, company, coupon, or season checks.

The user selects zero or more eligible activations. The engine never auto-picks a package.

## 2. Full-stay window

Last occupied night is `departureDate - 1`.

Eligible only when:

`arrivalDate >= valid_from` AND `lastNight <= valid_to`

The package is not partially applied to only some nights. A stay that overhangs the window is ineligible.

## 3. Room-type scope

| Mapping | Empty rows mean |
|---|---|
| Activation room types | Inherit snapshotted master `master_room_type_ids` |
| Master room types | All room types. Card 3 already treats empty package room mappings as **All / none assigned**. |

Activation mappings may narrow master scope. They must never broaden it. A room type outside the master snapshot is always rejected, even if the activation list includes it.

## 4. Rate-plan scope

| Mapping | Empty rows mean |
|---|---|
| Activation rate plans | Inherit snapshotted master `master_rate_plan_ids` |
| Master rate plans | All rate plans, matching Card 3 empty-join semantics |

Activation mappings may narrow master scope. They must never broaden it.

## 5. Package price and charge basis

Price comes from the activation snapshot `package_price`, not live `pms_packages.package_price`.

V1 charge basis is `per_stay`. Quantity is `1` unless the domain is given a positive integer. Applied amount = `package_price × quantity`, rounded to 2 decimals, never negative.

Unsupported charge bases return `PACKAGE_CHARGE_BASIS_UNSUPPORTED`. No per-night, per-person, per-room, inclusive, or rate-modifier approximation.

## 6. Multiple packages

A reservation may select `0..n` packages. Each selected activation is evaluated independently. Duplicate `packageActivationId` values are rejected (`PACKAGE_DUPLICATE_SELECTION`). There is no package conflict / stacking engine. Promotion stacking rules do not apply to packages.

If one selected package is invalid on create/apply, the whole commercial write fails. Invalid selections are not silently dropped.

## 7. Promotion + package

Promotion discounts room money only. Packages are added after the promotion.

Example:

- Room subtotal: ETB 10,000
- Promotion: − ETB 1,000
- Room after promotion: ETB 9,000
- Packages: ETB 500 + ETB 1,200
- Grand commercial subtotal: ETB 10,700

## 8. Quote compose

`quoteHotelStayCommercial` now accepts optional `packageActivationIds` as well as `promotionActivationId`.

1. `price_hotel_stay` → `baseRoomSubtotal`
2. Optional selected promotion → `promotionDiscount`
3. `roomSubtotalAfterPromotion = baseRoomSubtotal - promotionDiscount`
4. Selected packages → `packages[]` / `packagesSubtotal`
5. `grandCommercialSubtotal = roomSubtotalAfterPromotion + packagesSubtotal`

The original room-pricing payload is preserved. `eligiblePackages` is listed without auto-selection. Components come from the activation snapshot.

If `packageActivationIds` is omitted: `packages = []`, `packagesSubtotal = 0`. Promotion-only quotes stay valid.

An invalid selected package throws the stable `PACKAGE_*` code instead of composing a partial quote.

## 9. Attribution

`hotel_reservation_packages` holds one row per selected activation. Trusted values:

`restaurant_id`, `reservation_id`, `package_activation_id`, `package_id`, `package_code`, `package_name`, `charge_basis`, `quantity`, `unit_amount`, `applied_amount`, `components_snapshot`, `snapshot`, `applied_at`

Browser-supplied price, components, code/name, and applied amount are ignored.

## 10. Create

`packageActivationIds` is optional on `createReservation`, alongside `promotionActivationId`.

Supported combinations:

- no commercial selection → existing `create_hotel_reservation_priced`
- promotion only
- packages only
- promotion + packages

Present commercial selection uses `create_hotel_reservation_priced_commercial`, which creates the reservation then writes promotion and package attribution in the same transaction. Eligibility failure rolls the whole create back. There is no browser/server insert loop after create.

Create permission stays `requireReservationManager`. Rate Manager is not required to select a valid package.

## 11. Reprice and priced amend

`reprice_hotel_reservation` and `amend_hotel_reservation_priced` call `sync_hotel_reservation_packages(..., 'reevaluate')` after the room snapshot write.

- Reevaluate the **current** attributed packages only
- Still eligible: rewrite attribution from the activation snapshot
- No longer eligible (dates, room type, rate plan, inactive, unsupported): delete that package row
- Never auto-add a newly eligible package
- Never substitute another package

Because V1 is `per_stay`, a changed room subtotal does not change the package amount.

Stay-changing priced amend and room-type / rate-plan changes use the same drop-if-ineligible rule.

Explicit later package removal uses `sync_hotel_reservation_packages(..., 'apply')` with the selected set so stale rows are deleted.

## 12. FO unpriced amend caveat

Front Office `amend_hotel_reservation` (not the priced RPC) does not reevaluate promotions or packages. Attribution can become stale until an explicit priced reprice or priced stay amend.

## 13. Master and activation edit safety

Later edits to `pms_packages`, `pms_package_components`, or master mappings do not rewrite activation snapshots or reservation package attribution.

Later activation edits do not rewrite existing reservation attribution. Only explicit priced reprice/amend reevaluates.

## 14. Room subtotal contract

`hotel_reservations.room_subtotal` and `nightly_rate_snapshot` stay pre-commercial. Package amounts live only on `hotel_reservation_packages`.

`grandCommercialSubtotal` is a quote/read helper. It does not reinterpret existing reservation or cashiering totals.

## 15. Cashiering gap

Folio / cashiering still uses pre-commercial `room_subtotal`. Package attribution is **not** a posted, paid, or collected folio charge. Commercial settlement / folio integration is a later prompt.

## 16. No backfill

Older reservations without package attribution are excluded from package performance. Do not infer package use from text or folio lines.

## 17. Performance start

Attribution enables later KPIs. Do not implement them here.

Recommended later attach-rate denominator, only if the scope is defined:

`reservations with ≥1 package / commercial-engine-era reservations`

First-implementation fields:

- Package Bookings = distinct `reservation_id`
- Package Revenue = sum `applied_amount`

## 18. Official APIs

`listEligiblePackageActivations`, `getReservationPackageAttributions`, `getReservationCommercialAttribution`.

Quote remains `quoteHotelStayCommercialFn`. Persist: `sync_hotel_reservation_packages`. Domain: `commercial-package.ts`.
