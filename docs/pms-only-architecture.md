# NORU PMS-only architecture

This is the permanent operational architecture after PRODUCT-RETIRE-01 through
PRODUCT-RETIRE-15. Historical Phase 8E3 notes in `docs/architecture-ownership.md`
describe an earlier multi-package world and must not be used as the runtime
contract.

## Operational product

NORU has **one operational commercial package: PMS**.

Runtime registry:

```text
PACKAGE_KEYS = ["pms"]
```

Staff, Inventory, Procurement, Workforce/HR, Accounting/Finance presentation,
Reports, Configuration, and Property Settings are **retained shared PMS
capabilities**. They are not a second commercial package.

## Marketing vs runtime

Public marketing may advertise four products:

- PMS
- Restaurant Management (RMS)
- Standalone POS
- Back Office

Marketing CMS, seed copy, and public site cards are independent of
`PACKAGE_KEYS`. Advertising a product does **not** authorize a runtime package,
route tree, entitlement toggle, or database domain.

Platform Admin operational entitlement controls are PMS-only.
Marketing CMS may still manage the four advertised product cards.

## Domain ownership

| Domain | Owner |
|---|---|
| Front Office, Reservations, Rooms & Inventory, Housekeeping | PMS |
| Guest Profiles / hotel guest identity | PMS (`guest_profiles`, guest accounts) |
| Cashiering / hotel folios / money movement | PMS (`hotel_cashier_shifts`, `folio_transactions`, folio RPCs) |
| Tax / fee / service-charge configuration | PMS (`pms_taxes`, `pms_tax_groups`, `pms_service_charges`, `pms_fees`) |
| Night Audit, Rates & Revenue, Distribution, Direct Booking | PMS |
| Guest Services, Maintenance, Integrations, Administration | PMS |
| Inventory, Procurement, Assets, Suppliers | Shared PMS capability |
| Workforce / HR / Staff membership | Shared PMS capability (`restaurant_users`, roles, shifts) |
| Property identity (`restaurants`, settings) | Shared / platform |
| Public marketing / CMS | Platform marketing, not a tenant package |
| Staff login identity (`profiles`, `auth.users`) | Shared authorization, not diner identity |

Property/staff tables whose names originated in restaurant operations remain
because they are the current property architecture:

- `restaurants`
- `restaurant_users`
- `restaurant_tables`
- `staff_table_assignments`

`restaurant_tables.qr_token` is an unused leftover column on a retained staff
table. It is **not** a QR-ordering runtime. PMS fiscal `signed_qr` on fiscal
registration rows is unrelated and stays.

## Retained staff roles

Staff roles are not renamed for PMS cosmetics. In particular:

- `kitchen` — KEEP. Inventory/Procurement module access.
- `waiter` — KEEP. Selectable Staff/Workforce role.

Do not delete either role because the name originated in restaurant operations.

## Retired systems

These systems are gone from runtime source, routes, entitlements, and deployed
schema. They may remain only in historical migrations, archives, tests, and
explicitly identified docs:

1. RMS operational application (menus, orders, kitchen display, restaurant till)
2. Standalone POS application and `pos_*` schema
3. Back Office operational shell and `back_office` package key
4. QR table-ordering / public menu / `/scan` / `/r/$restaurantSlug`
5. Consumer diner account (`/login`, `/register`, `/account`, customer RPCs)
6. RMS room-charge bridge (`post_order_room_charge` and related)
7. RMS tax owner columns on `restaurants`
8. RMS/POS financial, order, and menu databases
9. `menu-images` storage
10. Consumer profile identity (`guest_token_hash`, `linked_customer_user_id`)

Historical SQL lives under `drizzle/migrations/` and `supabase/migrations/`.
Do not rewrite old migrations to erase retired names.

## Generated types

`src/integrations/supabase/types.ts` must not claim dropped RMS/POS/customer
objects exist. Retirement-sensitive tables, functions, and columns in that file
must match deployed `public` schema.

## Invariants

1. PMS is the only operational package.
2. Marketing product catalogue is independent of runtime packages.
3. Cashiering owns hotel folios/money.
4. PMS tax tables own tax/fee configuration.
5. Guest Profiles own hotel guest identity.
6. Inventory/Procurement/Workforce are retained shared PMS capabilities.
7. No consumer diner identity/auth surface.
8. No QR restaurant ordering surface.
9. No Standalone POS runtime/schema.
10. No RMS order/menu/cashier runtime/schema.
11. Retired systems may exist only in historical migrations/archives/tests/docs
    where explicitly identified.

## Guardrails against re-entry

Permanent regression: `src/core/lib/pms-only-architecture.test.ts`.

Do not:

- add `restaurant_management`, `pos`, or `back_office` to `PACKAGE_KEYS`
- add `food_and_beverage`, `pos`, or `standalone_pos` to `MODULE_KEYS`
- restore `/restaurant/restaurant-management`, `/restaurant/pos`,
  `/restaurant/back-office`, `/scan`, consumer `/login`/`/register`/`/account`
- import `src/packages/restaurant-management`, `standalone-pos`, or `back-office`
- recreate `orders` / `menu_*` / `pos_*` / `cashier_shifts` as live objects
- treat marketing cards as entitlement switches
- drop `kitchen` or `waiter` for naming cleanliness
