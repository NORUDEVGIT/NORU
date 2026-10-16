# Rate & Revenue — Phase 5A commercial engine foundation

| Field | Value |
|---|---|
| **Classification** | Implementation record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Prompt** | **P5A-01 COMPLETE** — schema + domain types + immutable history |
| **Migration** | `0104_pms_commercial_engine_foundation.sql` (dual-lane) |
| **Pricing** | Unchanged. `price_hotel_stay` remains in `0016`. |

## 1. Objective

Create the persistent Rate & Revenue operational foundation for promotions and packages. Property Setup masters stay catalogues. This prompt does not apply activations, compose quotes, or change reservation create/reprice.

## 2. Ownership

| Owner | Tables |
|---|---|
| Property Setup | `pms_promotions`, `pms_packages`, `pms_package_components`, `pms_meal_plans`, `pms_seasons`, `pms_corporate_agreements`, `pms_contract_rates`, `pms_commercial_restrictions` |
| Rate & Revenue | `hotel_promotion_activations`, `hotel_package_activations`, their room-type/rate-plan mappings, reservation attribution, `hotel_commercial_change_events` |

Masters were not altered into operational tables. Rate & Revenue still only reads them until later apply RPCs snapshot execution fields.

## 3. Activation model

An activation is an operational stay-window instance of a master. It stores:

- stay validity (`valid_from` / `valid_to`)
- promotion booking window (`booking_from` / `booking_to`)
- `active`, `priority` (promotions), `reason`
- snapshotted execution fields
- optional narrower room-type / rate-plan scope

Packages use stay validity only. No booking window in V1.

## 4. Snapshot-on-activate versioning

Activation rows copy master execution fields at apply time (P5A-04). Later edits to `pms_promotions`, `pms_packages`, components, or master mappings do not rewrite existing activations. Editing an activation itself is allowed later through official domain and must write history.

## 5. Promotion schema

`hotel_promotion_activations` snapshots `promotion_code`, `promotion_name`, `promo_kind`, `promo_value`, and master stay dates / room-type ids.

Scope tables:

- `hotel_promotion_activation_room_types` — unique `(activation_id, room_type_id)`
- `hotel_promotion_activation_rate_plans` — unique `(activation_id, rate_plan_id)`

Empty room-type rows inherit master `pms_promotion_room_types`. Empty rate-plan rows allow all property rate plans. Do not store fake `ALL` rows. Activation scope may narrow, never broaden. Broaden checks belong in apply.

V1 kinds stored: `percent`, `fixed`, `free_night`. Executable later: `percent` and `fixed` only. `fixed` is amount off the stay room subtotal. `free_night` may be snapshotted; execution must mark it unsupported.

## 6. Package schema

`hotel_package_activations` snapshots `package_code`, `package_name`, `package_type`, `package_price`, `charge_basis = per_stay`, and `components_snapshot`.

Scope tables:

- `hotel_package_activation_room_types`
- `hotel_package_activation_rate_plans`

Empty room-type or rate-plan rows inherit the matching master mappings. Charge basis is constrained to `per_stay`. Do not add `per_person`, `per_night`, `per_room`, `inclusive`, or `rate_modifier` yet.

Component snapshot shape: `{ componentType, componentId, label, quantity }`. Only fields that exist on `pms_package_components` plus a denormalized label. No invented per-component price.

## 7. Attribution

`hotel_reservation_promotions` — at most one row per reservation (`UNIQUE reservation_id`).

Money:

- `base_room_subtotal` = existing pre-commercial room subtotal
- `discount_amount` = commercial promotion discount
- `room_subtotal_after_promotion` = `base_room_subtotal - discount_amount`, never negative

`hotel_reservation_packages` — zero-to-many. `applied_amount = unit_amount × quantity`. Additive outside room money.

Older reservations with no attribution rows are valid. No backfill.

## 8. Pre-commercial room subtotal

`hotel_reservations.room_subtotal` and `nightly_rate_snapshot` stay room-only. Demand, OTB, ADR, RevPAR, Night Audit, and cashiering continue to read those fields as they do today. Commercial money lives on child attribution rows.

## 9. History

`hotel_commercial_change_events` is Rate & Revenue operational history, not Property Setup staff audit.

- One full `before_state` / `after_state` snapshot per changed activation, including scope
- One `operation_id` per future apply request
- UPDATE and DELETE raise `COMMERCIAL_CHANGE_EVENT_IMMUTABLE`

Action types: created / edited / deactivated / scope_changed for promotion and package activations. No approval or publish states.

## 10. V1 policy locks

| Decision | V1 |
|---|---|
| Stacking | **No stacking.** No `stacking_policy` column. |
| Overlaps | Allowed with warning. Winner: lowest priority number, then largest computed discount, then earliest `created_at`. |
| Promotion selection | Explicit user selection from eligible promotions (eligibility later). |
| Day of week | Deferred. No weekday table. |
| Source / channel | Deferred. Identifiers are not stable enough. |
| Corporate / seasons / restriction templates | Separate domains. Not wired. |
| Free night | Snapshot-capable. Not executable. |

## 11. Access

Owner/manager SELECT via existing `has_restaurant_role`. Authenticated has no INSERT/UPDATE/DELETE. `service_role` writes later through trusted RPCs. Activation `updated_at` is ready for optimistic concurrency; apply concurrency is not built yet.

## 12. Not in this prompt

Eligibility, commercial quote compose, reservation create/reprice integration, preview/apply RPCs, UI-17–21, approvals, OTA sync, forecast impact.

## 13. Next

**P5A-02** — promotion eligibility + commercial quote compose + reservation attribution writers. `price_hotel_stay` stays the room quote. Compose around it.

Domain types: `src/packages/pms/lib/revenue/commercial-engine.ts`.
