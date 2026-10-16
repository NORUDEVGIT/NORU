# DB-00 — Reservation Deployed Schema Truth

Verification record for 2026-09-23. This is the accepted **non-prod CURRENT** baseline for later Reservation DB work. It does **not** approve production apply, persist-flag flips, or new Reservation tables.

No migrations were applied. No `schema_migrations` rows were inserted. Production was not inferred from non-prod.

---

## A. Executive Result

**Inspectable environment:** Supabase project `qcwptraosaudcbjasmul` (`NORUDEVGIT's Project`, `eu-west-1`), linked in `supabase/config.toml`, `.env`, and `.env.local`. Direct schema, constraints, RPCs, RLS, and `supabase_migrations.schema_migrations` were inspectable. No development branches. One organization (`NORUDEVGIT's Org`) and **one** authorized project.

**Staging:** not a separate inspectable project.

**Production:** **UNKNOWN — ACCESS LIMIT.** Programme docs already treat this project as **non-prod** and production 0053/0059/0060/0061 as Abel-gated. This agent could not query a second database. Do not infer production from non-prod.

**Local Docker:** not inspectable (no local migration history table on the remote; local env points at the same non-prod URL).

**Definitely live on `qcwptraosaudcbjasmul`:**
- Core `hotel_reservations` including pricing snapshot columns, six-status CHECK, channel-origin `source` CHECK.
- History table + event-type CHECK matching `RESERVATION_EVENT_TYPES`.
- Priced create/amend/reprice RPCs, `price_hotel_stay`, `assert_room_assignable`, `assert_reservation_capacity`.
- Guest masters + reservation FKs: `company_master_id`, `travel_agent_master_id`, `group_account_master_id`.
- FO labels `company_name` / `group_name`.
- Section 7 columns: `commercial_booking_source`, `market_segment`, `external_reference`, `guarantee_method`.
- Applied names: `pms_guest_profile_wave4`, `pms_create_reservation_company_ta`, `pms_create_reservation_individual_associations`, `pms_create_reservation_guarantee_confirm`, `fo_amd1_companions_catalogue`, `fo_search1_company_group`.
- Create RPCs accept optional company/TA + Section 7 params (defaults NULL). Dual company+TA allowed.
- `fo_stay_companions`, folio tables, `open_folio_for_reservation`, and partial unique index
  `guest_folios_one_per_reservation` for non-null reservation links.
- Rate plans, calendar, restrictions, `pms_source_codes`, `pms_market_segments`, `pms_packages`.
- 0095-class **objects** (blocks, events, availability/assignment RPCs) **without** a `schema_migrations` row named 0095.

**Definitely not provided:**
- Create/amend RPC param for `group_account_master_id`.
- Amend RPCs for company/TA/Section 7.

**Held in application persist constants:**
- `CREATE_RESERVATION_SECTION7_APPLY = "HELD"` — Case B on this project (0061 applied, persist still fail-closed). **Kept HELD** because production 0061 is unknown.
- Section 2 / 2A `APPLY = "HELD"` constants are documentation-only; create still sends company/TA ids.

**0095 ledger:** repository file remains PROPOSAL ONLY. Runtime objects exist. **Do not re-apply the file.** See §G.

---

## B. Environment Matrix

| Capability | Dev (`qcwptraosaudcbjasmul`) | Staging | Prod | Notes |
|---|---|---|---|---|
| Direct schema inspect | Yes | UNKNOWN | UNKNOWN | MCP returned one project |
| Migration history | Yes | UNKNOWN | UNKNOWN | Timestamp versions, not drizzle `0013` |
| Core reservation | Live | UNKNOWN | UNKNOWN | Greenfield + later FO/PMS files |
| 0053/0059/0060/0061 | Applied by name | UNKNOWN | UNKNOWN | Repo SQL still says APPLY HELD |
| 0045/0046 | Applied by name | UNKNOWN | UNKNOWN | Repo “PR only” comments stale here |
| 0095 ledger | Missing row | UNKNOWN | UNKNOWN | Objects/RPCs present |
| Inventory engine | Canonical RPCs present | UNKNOWN | UNKNOWN | App still has legacy fallback |
| Section 7 persist | DB live / code HELD | UNKNOWN | UNKNOWN | Case B; persist not flipped |
| Local/dev Docker | Same URL as this project | — | — | Not a second schema |

---

## C. Migration State Matrix

Core 0013/0014/0016/0017 exist only under `drizzle/migrations/`. Supabase lane starts from `noru_greenfield_schema`.

| Migration | Repo state | Dev | Staging | Prod | Runtime objects | App dependency |
|---|---|---|---|---|---|---|
| 0013 reservations | Drizzle file | VERIFIED APPLIED | UNKNOWN | UNKNOWN | `hotel_reservations` + counters | Create/list/detail |
| 0014 FO ops | Drizzle only | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Statuses, FO writers | FO + reservation status |
| 0016 rates | Drizzle only | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Rate plans, `price_hotel_stay` | `quoteStay` / priced create |
| 0017 cashiering | Drizzle only | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Folios + `open_folio_for_reservation` | Cashiering |
| 0045 companions | Both lanes | VERIFIED APPLIED | UNKNOWN | UNKNOWN | `fo_stay_companions` | FO, not create-reservation |
| 0046 company/group names | Both lanes | VERIFIED APPLIED | UNKNOWN | UNKNOWN | `company_name`, `group_name` | FO search labels |
| 0053 guest wave4 | APPLY HELD comment | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Masters + FKs | Guest + create bind |
| 0059 company/TA RPC | APPLY HELD comment | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Optional master params | `createReservation` sends IDs |
| 0060 dual bind | APPLY HELD comment | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Company **and** TA | App no longer XOR-rejects |
| 0061 guarantee/confirm | APPLY HELD comment | VERIFIED APPLIED | UNKNOWN | UNKNOWN | Section 7 columns + RPC params | Persist gated HELD |
| 0095 inventory foundation | PROPOSAL ONLY | PARTIALLY APPLIED / DRIFT | UNKNOWN | UNKNOWN | Blocks, events, availability RPCs | Compat prefers canonical |

---

## D. Current Runtime `hotel_reservations` Schema (`qcwptraosaudcbjasmul`)

Columns: `id`, `restaurant_id`, `guest_id`, `confirmation_number`, `arrival_date`, `departure_date`, `adults` (default 1), `children` (default 0), `room_type_id`, `room_id` (nullable), `status` (default `pending`), `source` (default `staff`), `special_requests`, `notes`, `cancellation_reason`, `created_by_staff_membership_id`, `created_at`, `updated_at`, `rate_plan_id`, `currency`, `room_subtotal`, `nightly_rate_snapshot`, `priced_at`, `special_request_category`, `company_name`, `group_name`, `company_master_id`, `group_account_master_id`, `travel_agent_master_id`, `commercial_booking_source`, `market_segment`, `external_reference`, `guarantee_method`.

Constraints:
- `departure_date > arrival_date`; `adults >= 1 AND children >= 0`
- Status CHECK: `pending`, `confirmed`, `cancelled`, `checked_in`, `checked_out`, `no_show` — matches `reservation-dates.ts`
- Source CHECK: `staff`, `walk_in`, `direct_booking`, `future_online` (channel origin, not commercial booking source)
- Unique `(restaurant_id, confirmation_number)` and `(id, restaurant_id)`
- Same-property FKs onto guest, room type, optional room, optional rate plan, company/TA/group masters

**History:** `id`, `restaurant_id`, `reservation_id`, `event_type`, `previous_values`, `new_values`, `notes`, `actor_membership_id`, `created_at`. Event CHECK equals `RESERVATION_EVENT_TYPES`. RLS SELECT only; inserts via SECURITY DEFINER RPCs.

---

## E. RPC Signature Matrix

| RPC | App signature | Dev DB | Staging | Prod | Compatible? |
|---|---|---|---|---|---|
| `create_hotel_reservation_priced` | Core + optional company/TA; Section 7 only if persist applied | Accepts Section 7 + masters (defaults NULL) | UNKNOWN | UNKNOWN | Yes on this env; persist still gated |
| `create_hotel_reservation` | Unused by current create | Same extras minus rate | UNKNOWN | UNKNOWN | Unused |
| `amend_hotel_reservation_priced` | Stay + rate + room | No commercial/master args | UNKNOWN | UNKNOWN | Match for current amend |
| `reprice_hotel_reservation` | `requireRateManager` | 4 args | UNKNOWN | UNKNOWN | Match; receptionist cannot reprice |
| `price_hotel_stay` | `quoteStay` | 5 args STABLE | UNKNOWN | UNKNOWN | Match |
| `pms_room_type_availability` | untyped then typed after regen | Live | UNKNOWN | UNKNOWN | Runtime yes |
| `pms_evaluate_room_assignment` | untyped then typed after regen | Live | UNKNOWN | UNKNOWN | Runtime yes |
| `open_folio_for_reservation` | cashiering | Live | UNKNOWN | UNKNOWN | Match |

Group master column exists; create/amend RPCs do not accept it.

---

## F. Generated Type Drift Matrix

`src/integrations/supabase/types.ts` was regenerated on 2026-09-23 from `qcwptraosaudcbjasmul`.

| DB object | Actual runtime | Generated TS after regen | Match? | Risk |
|---|---|---|---|---|
| `hotel_reservations` masters + Section 7 + FO names | Columns exist | Present on `Row`/`Insert`/`Update` | Yes | LOW on this env |
| `create_hotel_reservation(_priced)` Args | Optional Section 7 + company/TA | Present | Yes | LOW |
| `pms_room_type_availability` / `pms_evaluate_room_assignment` | Live | Present | Yes | LOW |
| Production types | UNKNOWN | Not generated from prod | N/A | HIGH if prod schema differs |

---

## G. Current Inventory Engine Mode

**Inspected env: canonical 0095 RPCs exist.** App tries canonical first; fallback only on missing-function errors.

**Ledger:** `schema_migrations` has **no** `pms_room_inventory_operational_foundation` / 0095 row. Objects were created out-of-band. Dual-lane `0095_*.sql` files remain PROPOSAL ONLY and now carry a DB-00 do-not-re-apply note. **Do not apply 0095 from an agent. Do not insert a fake history row.**

Fallback (if RPCs absent on another env): `count_sellable_rooms` − `count_reserved_rooms`; assignment = room `status === available` and no overlapping pending/confirmed/checked_in stay. Lost in fallback: blocks, HK/maintenance rules, nightly limiting date, occupancy/preference scoring.

`listAssignableRooms` does not pass occupancy/preference args into the canonical RPC. `evaluateRoomAssignment` does.

---

## H. Current Reservation Feature Readiness (inspected env)

| Feature | Status |
|---|---|
| Create reservation | VERIFIED LIVE |
| Pricing | VERIFIED LIVE; reprice LIVE WITH LIMITATIONS (owner/manager) |
| Room assignment | LIVE WITH LIMITATIONS |
| Amendments | LIVE WITH LIMITATIONS (stay/rate/room only) |
| Cancellation / no-show | VERIFIED LIVE |
| Company / TA links | VERIFIED LIVE on create |
| Group master | HELD / unused |
| Guarantee / source / segment | DB LIVE / CODE GATED |
| Companions | VERIFIED LIVE as FO table; create not wired |
| Folio | VERIFIED LIVE; partial UNIQUE `(restaurant_id, reservation_id)` where reservation link is non-null |
| History | VERIFIED LIVE |

---

## I. P0 Drift / Runtime Risks

| Rank | Finding |
|---|---|
| CRITICAL | Production not inspected. APPLY HELD comments are false for this project and may still be true for production. |
| HIGH | Section 7 Case B: persist remains HELD on purpose until prod 0061 is verified. |
| HIGH | 0095 objects live without a migration ledger row. Re-applying the proposal file can fail or drift. |
| MEDIUM | Group column live but create/amend cannot set it. |
| LOW | Section 2/2A APPLY HELD constants vs applied 0059/0060 on this env (docs/tests). |
| LOW | SET6 accessor names vs Card 5/7 ownership (compatibility debt). |

---

## J. Baseline Freeze Recommendation

Accepted **dev baseline** is **`qcwptraosaudcbjasmul` runtime objects**, not the APPLY HELD comments in SQL files.

1. Treat production as UNKNOWN until Abel provides inspect access or apply confirmation.
2. Do not re-apply 0095. Do not insert a history row claiming it was applied via the file.
3. Types regenerated against non-prod. Regen again if production is ever inspectable.
4. Keep `CREATE_RESERVATION_SECTION7_APPLY = "HELD"` until production 0061 is verified.
5. Do not design multi-room, waitlist, links, packages-on-stay, traces, comms persistence, or status redesign in this freeze.
6. Later DB-05: `fo_stay_companions` is Front Office-owned.

Next: [DB-01 / DB-02 kickoff](./db-01-db-02-reservation-freeze-kickoff.md).
