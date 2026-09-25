# Rate & Revenue — Phase 5A promotion engine (P5A-02)

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Prompt** | **P5A-02 COMPLETE** |
| **Migration** | `0105_pms_commercial_promotion_engine.sql` (dual-lane) |
| **Pricing** | `price_hotel_stay` body unchanged in `0016` |

## 1. V1 eligibility

A selected activation is eligible only when all of these hold:

- activation belongs to the property
- activation `active = true`
- master `pms_promotions` row exists and is active
- property `business_date` is inside `booking_from` / `booking_to`
- the stay is fully inside `valid_from` / `valid_to`
- room type is allowed
- rate plan is allowed
- kind is V1-executable (`percent` or `fixed`)
- value is valid

No LOS, DOW, source/channel, coupon, company, season, or stacking checks.

The user selects one eligible activation. Priority is informational. The engine never auto-picks a winner.

## 2. Full-stay window

Last occupied night is `departureDate - 1`.

Eligible only when:

`arrivalDate >= valid_from` AND `lastNight <= valid_to`

Partial-night discounts are not applied. A stay that overhangs the window is ineligible.

## 3. Booking window

`booking_from <= restaurants.business_date <= booking_to`

Browser local date is ignored.

## 4. Room-type and rate-plan scope

| Mapping | Empty rows mean |
|---|---|
| Activation room types | Inherit master `pms_promotion_room_types` (via snapshotted `master_room_type_ids`) |
| Master room types | All room types. Property Setup already labels this **All types (setup hint)**. |
| Activation rate plans | All property rate plans |
| Master rate plans | None. Do not infer any. |

Activation scope may narrow master room types. Broaden checks stay on the later apply RPC.

## 5. Percent and fixed

Percent: `0 < promoValue <= 100`. Discount = `round(baseRoomSubtotal * promoValue / 100, 2)`.

Fixed: `promoValue > 0`. Discount = `promoValue`, clamped to the room subtotal.

`roomSubtotalAfterPromotion = baseRoomSubtotal - discount`, never negative.

`baseRoomSubtotal` is the `price_hotel_stay` room subtotal. Money uses `Math.round(value * 100) / 100`.

## 6. Free night

`free_night` returns `PROMOTION_KIND_UNSUPPORTED`. No discount is calculated.

## 7. Quote compose

`quoteHotelStayCommercial`:

1. Call `price_hotel_stay`
2. Optionally evaluate the selected activation
3. Optionally list eligible activations
4. Return room quote plus commercial totals

P5A-02 left `packagesSubtotal` at 0. P5A-03 extends the same quote with selected packages. See [`rate-revenue-phase5-package-engine.md`](./rate-revenue-phase5-package-engine.md).

Promotion masters have no currency field. A fixed amount is implicitly the priced stay / property currency.

## 8. Room subtotal contract

`hotel_reservations.room_subtotal` and `nightly_rate_snapshot` stay pre-commercial. Discount lives on `hotel_reservation_promotions`.

## 9. Create

`promotionActivationId` is optional on `createReservation`.

Absent: existing `create_hotel_reservation_priced` path. Behavior unchanged.

Present: `create_hotel_reservation_priced_commercial` creates the reservation, then writes attribution in the same transaction. If eligibility fails, the create rolls back.

Trusted values come from the activation snapshot and the just-written room subtotal. Browser discount amounts are ignored.

Create permission stays `requireReservationManager`. Rate Manager is not required to book.

## 10. Reprice and priced amend

`reprice_hotel_reservation` and `amend_hotel_reservation_priced` now call `sync_hotel_reservation_promotion(..., 'reevaluate')` after the room snapshot write.

- Still eligible: rewrite attribution amounts/snapshot for the same activation
- No longer eligible (dates, room type, rate plan, inactive, unsupported): delete attribution
- Never substitute another promotion

## 11. FO unpriced amend caveat

Front Office `amend_hotel_reservation` (not the priced RPC) does not reevaluate promotions. Attribution can become stale until an explicit priced reprice or priced stay amend. This is documented, not silently changed.

## 12. Master and activation edits

Existing attribution is historical. Later edits to `pms_promotions` or activations do not rewrite reservation rows. Only explicit priced reprice/amend reevaluates.

## 13. No backfill

Reservations without an attribution row are excluded from promotion performance. No guessing.

## 14. Performance start

From attribution only:

- Promotion Bookings = distinct `reservation_id`
- Promotion Discount Amount = sum `discount_amount`
- Promotion Revenue = sum `room_subtotal_after_promotion`

Not pre-discount `room_subtotal`.

## 15. Cashiering gap

Folio open still uses pre-commercial `room_subtotal`. Settlement does not consume the promotion child amount yet. Do not change folio behavior in this prompt.

## 16. Official APIs

`quoteHotelStayCommercialFn`, `listEligiblePromotionActivations`, `getReservationPromotionAttribution`. Domain: `commercial-promotion.ts`.
