# NORU PMS — Check-In Backend Gap Audit

Read-only audit of the repository. No application code, schema, or remote data was changed. Production environment: UNKNOWN. A non-production project id has appeared in prior notes (`qcwptraosaudcbjasmul`); this audit does not treat that id as production and did not query it.

Classifications: SUPPORTED, PARTIAL, MISSING, WRONG OWNER / DUPLICATED, UNSAFE, UNKNOWN.

## 1. Executive Summary

The five-step Check-In workspace cannot be built with zero backend changes. Steps 1, 2, 3, and 5 have substantial existing pieces. Step 4 does not.

Strongest existing areas:

- Unit status flip in `check_in_hotel_reservation` (`supabase/migrations/0156_room_unit_front_office.sql`): one confirmed unit can become `checked_in`, siblings stay on their own status, history includes `reservation_room_id`, and the reservation row is locked with `FOR UPDATE`.
- Guest Profile already stores name, contact, address, nationality, date of birth, gender, middle name, and normalized identity documents with verification columns.
- Property Setup already drives check-in field rules and identity-document requirements through `validateGuestCheckInRequirements`.
- Cashiering already opens a folio and posts a deposit through `open_folio_for_reservation` and `callPostFolioTransaction`.
- Room eligibility for the current stepper uses `listAssignableRooms` with the selected unit’s type and dates. Readiness uses Housekeeping policy via `isRoomReady`.

Largest gaps:

- No guest agreement, agreement version, acknowledgement snapshot, or guest signature record. Email `signature` columns are sender copy. Profile consent is marketing and data-processing consent, not a stay registration card.
- Check-in progress, waivers, folio, and registration snapshot are one row per reservation (`fo_checkin_progress.reservation_id` is unique). They are not unit-scoped.
- The deposit gate counts folio `payment` lines and ignores `deposit` lines (`netPaymentTowardRequirement`, pinned by `fo-check-in.test.ts`). `postCheckInDeposit` writes `transaction_type: "deposit"`. The amount that was just posted does not satisfy the gate.
- `postCheckInDeposit` then reads `ledgerMethod`, which is not declared in that handler (`fo-check-in.functions.ts`). After a successful folio post, progress update throws.
- `getCheckInContext` and registration save use the reservation booker (`hotel_reservations.guest_id`) and master occupancy, not the unit primary occupant.
- `completeFoCheckIn` hard-codes loaded documents as `status: "valid"` and does not require `guest_documents.verification_status`.
- There is no single readiness object (`blockers`, `warnings`, `overrides`, `canCheckIn`) for the five proposed stages. Gates are split across the stepper snapshot, Guest Profile rules, housekeeping readiness, and the SQL transition.

Schema changes appear necessary for an auditable agreement/signature and for unit-scoped registration, waiver, and completion state. The existing final command is safe for a single confirmed unit’s status flip and room clash check. It is not safe, as-is, as the only server gate for the proposed five-step workspace.

Multi-room status is PARTIAL: the SQL transition is unit-aware; the Check-In workspace reads and waivers are not.

Highest-risk finding: a check-in deposit can be posted to the folio and then fail to record, while the completion gate looks at payments rather than that deposit, and one reservation-level waiver covers every room unit.

## 2. Current Check-In Architecture

```
Reservation (hotel_reservations + hotel_reservation_rooms)
  ↓
Front Office stepper  fo-check-in-stepper.tsx
  ↓
getCheckInContext     master stay, booker profile, master room, fo_checkin_progress, folio strip
listAssignableRooms   selected unit type and dates, eligible-only, forCheckIn not set
  ↓
saveCheckInRegistration / waiveCheckInRegistration
ensureCheckInFolio / postCheckInDeposit / waiveCheckInDeposit
recordCheckInKey / waiveCheckInKey
  ↓
completeFoCheckIn
  guest field rules + guest_documents expiry
  isRoomReady (housekeeping policy)
  registration snapshot or waiver
  payment-net vs deposit snapshot
  key record or waiver
  ↓
check_in_hotel_reservation   unit status, room assert, history, folio open once, housekeeping transition
  ↓
fo_checkin_progress.completed_at
```

Current stepper stages in `fo-check-in.ts` are Stay & room, Registration, Deposit, Key, Complete. They are not the five proposed stages. Key issuance has no counterpart in the proposed workspace and must not be dropped silently if operations still require it; it is also not a Guest Agreement.

`getCheckInContext` does not accept `reservationRoomId`. The stepper keeps the selected unit in React state and passes `reservationRoomId` only into `completeFoCheckIn` when `stay.roomUnits.length > 1` (`fo-check-in-stepper.tsx`, `...(multiRoom ? { reservationRoomId, roomId } : {})`).

## 3. Five-Step Capability Matrix

| Step | Capability | Owner | Existing Source | Existing Service/Command | Status | Evidence | Gap |
|------|------------|-------|-----------------|--------------------------|--------|----------|-----|
| 1 | Reservation id, confirmation, status, source, dates, nights, special requests | Reservations | `hotel_reservations` | `getCheckInContext` / `loadStay` | SUPPORTED | `fo-check-in.functions.ts` `FrontOfficeStay` | Master row, not the selected unit |
| 1 | Rate plan, room subtotal, packages, company, agency, group, operational notes | Reservations | `hotel_reservations`, `hotel_reservation_rooms`, `hotel_reservation_packages` | Reservation detail reads; not `getCheckInContext` | PARTIAL | `loadStay` selects `rate_plan_id` and `room_subtotal` only to set `rateMissing` | Check-In DTO omits them |
| 1 | Booker profile id, name, phone, email, VIP | Guest Profile | `guest_profiles` via `guest_id` | `loadStay`, `getCheckInContext` | SUPPORTED | join `guest_profiles!hotel_reservations_guest_same_property` | Booker, not unit primary |
| 1 | Profile number, guest type, returning guest, prior stays, tags | Guest Profile | profile history exists | not on `CheckInContext` | PARTIAL | `guests.functions.ts` history events | No check-in read model |
| 1 | Unit id, status, type, room, occupants, adults, children, rate, subtotal, unit packages | Reservations | `hotel_reservation_rooms`, `hotel_reservation_room_guests` | Reservation detail; stepper `RoomUnitTargetSelect` | PARTIAL | `fo-check-in-stepper.tsx` `selectedUnit` | Context loader ignores the unit |
| 1 | Sibling units stay unchecked-in | Reservations / FO | `hotel_reservation_rooms.status` | `check_in_hotel_reservation` | SUPPORTED | 0156 updates one unit, then `rollup_hotel_reservation_status` | Master becomes `checked_in` if any unit is |
| 1 | Room number, floor, HK, OOO/OOS, eligibility | Room & Inventory | `hotel_rooms`, `pms_evaluate_room_assignment` | `listAssignableRooms`, `listReservationRoomDisplay` | SUPPORTED | stepper query uses unit type and dates; display read explains holds | Check-In context room is the master `room_id` |
| 1 | Assign / change room / occupants / open profile | FO consumes Reservations and Guest Profile | existing commands | `assignReservationRoom`, `manageReservationRoomGuest` | PARTIAL | Rooms tab and stepper assign path | Stepper registration still edits the booker |
| 2 | First, middle, last, gender, DOB, nationality, residence | Guest Profile | `guest_profiles` | `guests.functions.ts`; check-in save writes a subset | PARTIAL | greenfield `date_of_birth`; 0057 `middle_name`, `gender` | `saveCheckInRegistration` splits one full name and does not write middle name, gender, or DOB |
| 2 | ID type, number, country, issue, expiry, image | Guest Profile | `guest_documents` | `reviewGuestDocument`; files in `property-images` | PARTIAL | 0051, 0087 | Check-in save writes scalar `id_document_*` on the profile instead |
| 2 | Verification status, verifier, timestamp | Guest Profile | `verification_status`, `verified_by_membership_id`, `verified_at` | `reviewGuestDocument` | PARTIAL | 0051; `guests.functions.ts` | `completeFoCheckIn` forces `status: "valid"` and does not read verification |
| 2 | Required fields and expired ID | Property Setup | `pms_guest_id_types`, workspace config | `validateGuestCheckInRequirements` | SUPPORTED | `guest-field-rules.ts` | Enforced at complete, not as a registration-step read model; stepper snapshot is a second rule |
| 2 | Duplicate detection | Guest Profile | `findGuestDuplicates` | create-guest flows | PARTIAL | `guests.functions.ts` | Not called by check-in functions |
| 2 | Scan / OCR | — | — | — | MISSING | no check-in scanner or OCR writer | Upload/storage exists; extraction does not |
| 2 | Accompanying guests | Reservations | `hotel_reservation_room_guests` | `manageReservationRoomGuest` | PARTIAL | 0161 | Check-in copy says registration stays on the booker |
| 3 | Room and package charges | Reservations pricing; Cashiering folio | unit `room_subtotal`; folio lines | `price_hotel_stay`; folio reads | PARTIAL | room-type confirm; `loadFolioStrip` | Check-In strip is deposit snapshot vs payments, not a charge summary |
| 3 | Deposit required | Reservations snapshot | `deposit_requirement_snapshot.computed_amount` | `snapshotRequiredAmount` | PARTIAL | `fo-check-in.ts` | Snapshot, not a live Cashiering rule |
| 3 | Deposit received | Cashiering | `folio_transactions` `deposit` | `postCheckInDeposit` | WRONG OWNER / DUPLICATED | posts `type: "deposit"`; gate sums `payment` | Posted deposit does not satisfy the gate |
| 3 | Guarantee method | Reservations | `hotel_reservations.guarantee_method` | create/amend reservation | PARTIAL | `loadStay` exposes it | No guarantee-satisfied evaluator |
| 3 | Folio status and balance | Cashiering | `guest_folios` | `ensureCheckInFolio`, `open_folio_for_reservation` | PARTIAL | reservation-scoped folio | Not unit-scoped; check-in posts money |
| 3 | Authorization / card hold | — | copy only | — | MISSING | `fo-arrival.ts` states card authorization is not available | Waiver and deposit post are the live gates |
| 3 | Open Cashiering / collect | Cashiering | folio post | `postCheckInDeposit`, `requireCashierOperator` | PARTIAL | cashier shift required | `ledgerMethod` is undefined after post |
| 3 | Company or group billing changes readiness | Reservations commercial | `company_master_id`, group rooms | not in check-in gates | MISSING | no branch in `completeFoCheckIn` | — |
| 4 | Agreement text, version, terms, privacy, incidental auth | Property Setup / Guest Profile consent | consent columns; communication signature | `updateGuestConsent` area in `guests.functions.ts` | MISSING | 0093/0094 `signature` is email sender text | No stay agreement record |
| 4 | Acknowledgements at signing time | — | — | — | MISSING | — | — |
| 4 | Signature image, signer, time, staff, unit | — | — | — | MISSING | — | — |
| 4 | Print registration form | — | — | — | MISSING | no check-in print command found | — |
| 5 | Combined blockers, warnings, overrides, canCheckIn | Front Office | split gates | `canCompleteCheckIn` plus guest rules plus SQL | PARTIAL | four booleans, not the five stages | No agreement input |
| 5 | Revalidate and flip one unit | Front Office | `check_in_hotel_reservation` | `completeFoCheckIn` | PARTIAL | 0156 `FOR UPDATE`, `ROOM_UNIT_REQUIRED` | Gates above the RPC are reservation-scoped |
| 5 | Duplicate check-in of the same unit | Front Office | unit must be `confirmed` | SQL `INVALID_TRANSITION` | SUPPORTED | 0156 | Not an idempotent success; second call errors |
| 5 | Room still eligible at commit | Room & Inventory | `assert_reservation_room_unit_room` | inside check-in RPC | PARTIAL | 0156 | Not the same call as `pms_evaluate_room_assignment`; HK readiness is a separate TS gate |

## 4. Step 1 — Guest & Reservation Findings

SUPPORTED

- Reservation identity needed for a single stay is on `hotel_reservations`: `id`, `confirmation_number`, `status`, `source`, `arrival_date`, `departure_date`, `adults`, `children`, `special_requests`, `guarantee_method`. `loadStay` maps these into `FrontOfficeStay` and computes nights with `nightsBetween`.
- Booker name, phone, email, and `vip_status` come from `guest_profiles`.
- Physical room number, housekeeping, maintenance, and status load when `hotel_reservations.room_id` is set (`CheckInRoomState`).
- Eligible rooms for assignment use `listAssignableRooms` with the stepper’s selected unit type and dates (`fo-check-in-stepper.tsx`). The function stays eligible-only and does not receive `forCheckIn: true` (same contract as create-reservation). Overlap, OOO, OOS, and blocks remain inside `pms_evaluate_room_assignment` (`0168_room_assignment_eligibility_qualification.sql`).
- One unit check-in does not update sibling unit rows. `rollup_hotel_reservation_status` sets the master to `checked_in` when any unit is `checked_in` (0156). That does not mean every unit is in house.

PARTIAL

- Rate plan name, nightly amount, packages, company, travel agency, group, reservation notes, profile number, nationality on the summary card, returning-guest, and prior-stay summary are not on `CheckInContext`. They exist elsewhere: reservation detail, `hotel_reservation_packages.reservation_room_id`, and guest history.
- Unit occupants and unit primary guest exist on `hotel_reservation_room_guests` (`0160`, `manage_reservation_room_guest` in `0161`). The check-in loader never reads them. The stepper shows `RoomUnitOccupantContext` and the source string `Registration stays on the Primary Guest / Booker.` (`reservation-room-occupants.test.ts`).
- Floor and building are on `hotel_rooms` and on `listAssignableRooms` DTOs. `CheckInRoomState` does not include them.
- Assign and change-room during check-in can use the existing assign command. A unit that is already `checked_in` must use the Front Office room move (`assignReservationRoom` throws when that unit’s status is `checked_in`).

UNSAFE / WRONG OWNER

- `saveCheckInRegistration` calls `amend_hotel_reservation` with master `room_type_id`, `room_id`, dates, and the posted adults/children when those counts differ from the master stay. On a multi-room reservation that amends the master stay, not the selected unit.
- Context room readiness follows the master room. A second unit’s assigned room is not the room `getCheckInContext` evaluates unless the client passes it only at complete time.

## 5. Step 2 — Registration Findings

Personal information lives on `guest_profiles`: `first_name`, `last_name`, `middle_name`, `gender`, `date_of_birth`, `nationality`, `country`, `phone`, `email`, `address_line1`, `city` (greenfield guest table; `0057_pms_individual_form_enrichment.sql` for middle name and gender). Guest Profile is the owner. `guests.functions.ts` reads and writes `date_of_birth`.

`saveCheckInRegistration` updates the booker row: split full name, phone, email, nationality, address, city, country, and the scalar columns `id_document_type`, `id_document_number`, `id_document_expiry`. It records `profile_updated` on `guest_profile_history` via `recordGuestEvent` when those columns change, and `amended` on `hotel_reservation_history` with the registration snapshot. It does not write `guest_documents`. It does not call `findGuestDuplicates`.

Identity documents are normalized. `guest_documents` (`0051_pms_guest_profile_wave2.sql`, extended by `0087`) has `kind`, `id_type_id`, `document_number`, `issuing_country`, `issue_date`, `expiry_date`, `storage_path`, `back_storage_path`, `verification_status` default `unverified`, `verified_by_membership_id`, `verified_at`, `rejection_reason`, `uploaded_by_membership_id`. Types are `pms_guest_id_types` (`0079`, `0119`) with `required_at_check_in`, `document_number_required`, `issuing_country_required`, `expiry_date_required`. Storage comments point at the `property-images` bucket. `reviewGuestDocument` is the verify/reject command and writes `document_verified` or `document_rejected`.

`completeFoCheckIn` loads `guest_documents` but sets every document `status: "valid"` before `validateGuestCheckInRequirements`. That function enforces property check-in field rules and unexpired matching documents. It does not read `verification_status`. Expired documents fail when an expiry is present and earlier than the property business date (`restaurants.business_date` through `resolvePropertyBusinessDate`). A missing expiry fails only when the document type requires it.

Required fields are property-driven for the complete command (`loadGuestWorkspaceConfig`, context `"check_in"`). The stepper’s own `isRegistrationComplete` is hard-coded: non-empty name, phone or email, id type, id number (`fo-check-in.ts`). Both must pass. A registration waiver skips only the snapshot check. It does not skip `validateGuestCheckInRequirements`, which runs first and has no waiver argument.

`promptPassportExpiry` is a UI hint for passport expiry. It is not the server rule.

Scanner, device capture, and OCR were not found on the check-in path. Document upload and file reference exist. Those are different capabilities.

Optional fields already on the guest (language, employment position, department, phone alt) or reservation (`purpose_of_stay` is selected by reservation amend, not by check-in save) must not be invented as new check-in columns. Custom fields can be stored with `persistGuestCustomFieldValues` when the client sends `customFields`.

Accompanying guests: adding a name uses `manageReservationRoomGuest` and an existing profile. Check-in registration does not update those occupant rows. Creating a guest from the Rooms card was removed; create stays on Guest Profile. Check-in itself does not search duplicates.

## 6. Step 3 — Payment & Guarantee Findings

Folio ownership is Cashiering. `guest_folios` is opened per reservation by `open_folio_for_reservation`. `check_in_hotel_reservation` calls that RPC only when there is no unit or the master status was not already `checked_in`, so a later unit does not open a second folio or re-append the first room charge (comment in 0156). Folio linkage is reservation-scoped, not unit-scoped.

Deposit requirement shown to check-in is `hotel_reservations.deposit_requirement_snapshot` via `snapshotRequiredAmount` (`computed_amount`). That is a reservation snapshot, not a live Cashiering balance. Property settings also store `deposit_required`, `deposit_type`, and `deposit_value` on `restaurants` (`pms-set1-foundation.functions.ts`, `fo-arrival.functions.ts`). Check-in completion does not recompute the requirement from those columns.

`loadFolioStrip` sums `folio_transactions` of type `payment` and subtracts refunds tied to those payments (`netPaymentTowardRequirement`). A line with type `deposit` is ignored. The test name is explicit: “sums payment lines against the snapshot and ignores deposit credit” (`fo-check-in.test.ts`).

`postCheckInDeposit` requires `requireReservationManager` and `requireCashierOperator`, opens the folio, resolves a tender with `folioTenderFromCatalogue`, and posts `type: "deposit"` through `callPostFolioTransaction` with an idempotency key. It then writes `deposit_method: ledgerMethod`. `ledgerMethod` is not declared or imported in that function. The folio post can succeed and the progress update can throw. That is UNSAFE.

`isDepositSatisfied` is true when waived, when the snapshot amount is null or ≤ 0, or when payment-net ≥ snapshot. Partial payment blocks. There is no separate warn-only mode in `completeFoCheckIn`. Company, group, and currency do not change this function. `guarantee_method` is displayed on the stay and is not evaluated.

`fo-arrival.ts` states that card authorization is not available and that deposit posting and manager waiver are the live financial gates. No payment-evidence table was found on the check-in path. Receipts and invoices remain Cashiering modules and are not invoked by `completeFoCheckIn`.

There is no single financial-readiness service. Front Office duplicates a snapshot-versus-payment comparison and also posts money. Ownership concern: check-in should read Cashiering and call a Cashiering command; it should not treat payments as deposits or deposits as payments.

Multi-room: one folio and one snapshot for the reservation. A deposit waiver on `fo_checkin_progress` covers every unit. Unit package and room subtotals are not inputs to the check-in gate.

## 7. Step 4 — Agreement & Signature Findings

Searches for registration card, guest agreement, terms acceptance, signature capture, and consent found three unrelated mechanisms:

1. `guest_profiles.data_processing_consent` and `marketing_consent`, with `*_recorded_at` and `*_recorded_by` (`guests.functions.ts` `GUEST_COLUMNS_W2`). History event `consent_updated`. This is profile consent, not a versioned hotel registration agreement, and it has no reservation or unit id.
2. `pms_communication_sender_settings.signature` and `pms_communication_defaults.signature` (`0093`, `0094`). These are outbound email signatures, length-capped text, not a guest signature.
3. `fo_checkin_progress.registration_snapshot` jsonb. This is the last registration form payload. It has no agreement id, version, acknowledgement booleans, signature bytes, or signer.

No table or RPC was found that stores:

- which agreement text or version was shown
- which guest signed
- which reservation or room unit
- signed_at and captured_by
- the signature image or an external device reference
- acknowledgement values frozen at signing time

`guest_documents` can store an uploaded file. Nothing marks a document as the signed registration card.

Print, clear, and re-capture of a signature have no backend commands.

This step is MISSING. A boolean on the progress row would not prove the agreement version. The minimum concept is an immutable registration-agreement record owned by Front Office, referencing Guest Profile and the reservation unit, with the agreement version supplied by Property Setup.

## 8. Step 5 — Review & Check-In Findings

`completeFoCheckIn` (`fo-check-in.functions.ts`):

1. `requireReservationManager` (owner, manager, receptionist).
2. `loadStay` from the master reservation.
3. Target room: if `reservationRoomId` is set, `data.roomId ?? master room`; otherwise master `room_id`.
4. Status: with a unit id, master may be `confirmed` or `checked_in`. Without a unit id, master must be `confirmed`.
5. `validateGuestCheckInRequirements` using property business date. Failure throws. No waiver.
6. `isRoomReady` using `evaluateRoomReadinessWithPolicy` and Card 2 housekeeping settings. Failure throws. No waiver.
7. Registration, deposit, and key from the single `fo_checkin_progress` row. `canCompleteCheckIn` requires all four booleans.
8. `check_in_hotel_reservation`.
9. Sets `completed_at` on the same progress row.

SQL `check_in_hotel_reservation` (0156):

- Locks `hotel_reservations` `FOR UPDATE`.
- `resolve_reservation_room_unit`: explicit id, or the only unit, or `ROOM_UNIT_REQUIRED` when several units exist and the id is omitted, or null when no unit rows exist.
- Unit path: unit status must be `confirmed`; dates ordered; room required; `assert_reservation_room_unit_room`; update that unit to `checked_in`; roll up master status.
- Legacy path (no units): master must be `confirmed`; `assert_room_assignable`; set master `room_id` and `status`.
- History: `room_assigned` or `room_changed` when the room changes; always `check_in`, with `reservation_room_id` and `unit_sequence` when a unit exists.
- Folio open only for the first in-house transition.
- Locks the physical room and may set housekeeping through `pms_housekeeping_transition_target` for `guest_check_in`. It does not write a second occupancy flag. Occupancy for assignment remains the stay overlap used by the evaluator.

Concurrency: the reservation lock serializes two completes. The second sees the unit already `checked_in` and raises `INVALID_TRANSITION`. That prevents a double status flip. It is not an idempotent replay. Progress `completed_at` is written after the RPC, so a crash between them leaves the stay in house without `completed_at`.

The command does not re-read agreement, signature, verification status, or unit occupant identity. Room eligibility at the SQL boundary is `assert_reservation_room_unit_room`, not a fresh `pms_evaluate_room_assignment` call. Housekeeping readiness is enforced in TypeScript before the RPC and is not re-checked inside the RPC.

Early arrival versus property check-in time is a stepper banner (`etaTiming`, `earlyCheckinAllowed`, `earlyCheckinNeedsApproval`). The banner says there is no approval inbox. `completeFoCheckIn` does not reject an early arrival.

Classification: PARTIAL for the status transition, UNSAFE as the only gate for the proposed Review screen, because financial, registration-waiver, and completion flags are reservation-scoped and agreement is absent.

## 9. Readiness Rule Matrix

| Requirement | Source of Truth | Existing Rule | Blocking? | Overrideable? | Server Enforced? | Status |
|-------------|-----------------|---------------|-----------|---------------|------------------|--------|
| Reservation / unit status | `hotel_reservation_rooms.status` or master if no units | must be `confirmed` | Yes | No | Yes, SQL | SUPPORTED |
| Master already in house | `rollup_hotel_reservation_status` | another unit may still be confirmed; TS allows master `checked_in` only when a unit id is sent | No for the sibling | No | Yes | SUPPORTED |
| Business date / early arrival | `restaurants.check_in_time`, `early_checkin_*` | banner only | No | Copy says approval, no inbox | No | PARTIAL |
| Guest required fields | Guest workspace rules, context `check_in` | `validateGuestCheckInRequirements` | Yes | No | Yes, at complete | SUPPORTED |
| Stepper registration snapshot | `fo_checkin_progress` | name, phone or email, id type, id number | Yes | Registration waiver | Yes | PARTIAL |
| ID document present / unexpired | `guest_documents` + `pms_guest_id_types` | property business date | Yes, when type required | Registration waiver does not skip this | Yes | SUPPORTED |
| ID verification | `guest_documents.verification_status` | stored, not read by check-in | No | — | No | PARTIAL |
| Assigned room | unit or master `room_id` | `ROOM_REQUIRED` | Yes | No | Yes | SUPPORTED |
| Room eligibility / overlap | Room & Inventory | `assert_reservation_room_unit_room` at commit; evaluator on the assign list | Yes | No | Yes, different functions | PARTIAL |
| Room readiness | Housekeeping policy | `isRoomReady` | Yes | No | Yes, TypeScript only | PARTIAL |
| Deposit amount | reservation snapshot | payment-net ≥ snapshot, or snapshot empty | Yes | Deposit waiver | Yes | WRONG OWNER / DUPLICATED |
| Deposit posted by check-in | folio `deposit` | not counted | No | — | The post does not affect the gate | UNSAFE |
| Guarantee | `guarantee_method` | stored, not evaluated | No | — | No | MISSING |
| Payment authorization | — | documented absent | No | — | No | MISSING |
| Agreement | — | none | No | — | No | MISSING |
| Signature | — | none | No | — | No | MISSING |
| Key | `fo_checkin_progress` | type and identifier, or waiver | Yes for current command | Key waiver | Yes | SUPPORTED for current stepper; not in the proposed five steps |

## 10. Multi-Room / Unit Safety Audit

1. One unit can check in independently. PASS. SQL updates one `hotel_reservation_rooms` row when `_reservation_room_id` is set. The stepper sends it when `roomUnits.length > 1`. Omitting it when several units exist raises `ROOM_UNIT_REQUIRED`.
2. A sibling remains pending or confirmed. PASS for status. The sibling row is not updated.
3. Only the target room is treated as the in-house room for that call. PASS for the unit `room_id` and history. PARTIAL for occupancy: the room’s operational occupied state is still derived from stay overlap, and housekeeping may change on that room only.
4. Occupants are taken from the correct unit. FAIL for registration. Check-in loads `hotel_reservations.guest_id`.
5. Primary guest comes from the correct unit. FAIL. Unit primary exists on `hotel_reservation_room_guests`. Check-in uses the booker.
6. Financial readiness is correctly scoped. FAIL. Folio, snapshot, and deposit waiver are reservation-scoped.
7. Agreement and signature can be associated to the unit. FAIL. No record exists.
8. Room move after check-in uses Front Office. PASS. `assignReservationRoom` rejects a `checked_in` unit and tells the caller to use the room move. The move RPC takes `_reservation_room_id` (0156, asserted in `reservation-room-units.test.ts`).
9. Changing a sibling cannot by itself flip the checked-in unit. PASS for assign and room-type commands that take a unit id. FAIL risk for `saveCheckInRegistration` calling `amend_hotel_reservation` on the master.
10. Master `checked_in` does not mean every unit is checked in. PASS as a fact of `rollup_hotel_reservation_status`. Callers that read only master status will still misread it. PARTIAL.
11. Later check-out can target one unit. PASS. `check_out_hotel_reservation` takes `_reservation_room_id` and requires that unit to be `checked_in`.
12. History identifies the unit. PASS for `check_in` and `check_out` events that include `reservation_room_id`. FAIL for registration, deposit, and key events, which store only `reservation_id`.

Overall: PARTIAL.

## 11. Permission & Security Matrix

| Action | Permission | Frontend Gate | Server Enforcement | Audit | Status |
|--------|------------|---------------|--------------------|-------|--------|
| Open check-in | reservation manage role | route and sheet | `requireReservationManager`: owner, manager, receptionist (`RESERVATION_MANAGE_ROLES`) | none on read | SUPPORTED |
| Edit guest during check-in | same | stepper | `saveCheckInRegistration` | `profile_updated`, reservation `amended` | PARTIAL |
| Edit or verify identity document | guest manager for verify | Guest Profile UI | `reviewGuestDocument` uses `requireGuestManager` | `document_verified` / `document_rejected` | SUPPORTED on Guest Profile; not used by check-in |
| Assign room | reservation manage | stepper | `assignReservationRoom` | `room_assigned` / `room_changed` inside the unit RPC | SUPPORTED |
| View folio strip | reservation manage | deposit step | service role read in `loadFolioStrip` | none | PARTIAL |
| Post deposit | cashier operator as well as reservation manage | deposit step | `requireCashierOperator`; shift errors mapped | reservation `amended` if progress update runs | PARTIAL |
| Waive registration, deposit, or key | UI loads `front_office.check_in.override` | `fo-check-in-stepper.tsx` approval query | `requireSupervisor` checks `MANAGE_ROLES` owner or manager only. It does not read `pms_approval_rules` or the permission code | reason, `*_waived_by`, `*_waived_at` on `fo_checkin_progress`; reservation `amended` | PARTIAL |
| Capture signature | — | — | — | — | MISSING |
| Complete check-in | reservation manage | button when client gates pass | `completeFoCheckIn` rechecks gates, then SQL | `check_in` history | PARTIAL |
| View documents | receptionist RLS and guest managers | Guest Profile | policies in 0087 | upload history event `document_uploaded` | SUPPORTED for profile; check-in reads with service role |

`FO_AUTHORIZATION_META["front_office.check_in.override"]` (`fo-approvals.ts`) says the waiver uses the live owner or manager role and that `pms_approval_rules` is setup, not an inbox (`fo-phase8.test.ts`). The UI gate is not the server gate. A receptionist cannot waive. An owner or manager can waive any of the three typed flags without a second authorizer id. The requester and the authorizer are the same membership (`me.id`).

Receptionist RLS on `fo_checkin_progress` allows select, insert, and update (`0041_fo_checkin_stepper.sql`). Server writes use the service role after the role check, so RLS is not the enforcement point.

## 12. Audit / History Coverage

Persisted today:

- `hotel_reservation_history.event_type` `check_in` and optional `room_assigned` / `room_changed`, with unit context when a unit is used (0156).
- `hotel_reservation_history` `amended` for registration save, registration waiver, deposit post, deposit waiver, key record, and key waiver (`fo-check-in.functions.ts`). Notes distinguish them. Payloads are not a typed check-in audit schema.
- `guest_profile_history` `profile_updated` when registration changes profile columns.
- `guest_profile_history` `document_verified` / `document_rejected` from Guest Profile review, not from check-in.
- `housekeeping_history` `room_dirty` when the check-in housekeeping transition lands on dirty (0156).
- `fo_checkin_progress` stores waiver reason, waived-by membership, and waived-at. It does not store a before/after of the requirement that was waived.

Not persisted: agreement version, signature, verification requirement outcome, financial readiness snapshot at the moment of check-in, or which unit the waiver applied to.

`recordReservationEvent` inserts history and does not fail the command when the insert fails (existing helper behavior). The SQL check-in history insert is in the same function as the status update.

## 13. Property Setup Dependencies

| Setting | Source | Check-in use | Status |
|---------|--------|--------------|--------|
| Business date | `restaurants.business_date`, timezone | document expiry in `completeFoCheckIn` | SUPPORTED |
| Check-in time | `restaurants.check_in_time` | context and early banner | PARTIAL |
| Check-out time | `restaurants.check_out_time` | foundation settings; not a check-in gate | PARTIAL |
| Early check-in allowed / needs approval | `early_checkin_allowed`, `early_checkin_needs_approval` | banner only | PARTIAL |
| Late check-out | `late_checkout_*` | not part of check-in | SUPPORTED as unused here |
| Guest required fields | guest workspace config, context `check_in` | `validateGuestCheckInRequirements` | SUPPORTED |
| ID types and required-at-check-in | `pms_guest_id_types` | same validator | SUPPORTED |
| Deposit required / type / value | `restaurants.deposit_*` | arrival settings; check-in gate uses the reservation snapshot instead | PARTIAL |
| Housekeeping readiness | Card 2 settings | `isRoomReady` | SUPPORTED |
| Guarantee rules | `guarantee_method` plus company contract copy | not evaluated at check-in | MISSING |
| Agreement / policy / signature requirement | — | — | MISSING |
| Override rules | `front_office.check_in.override` metadata | role check, not a rule engine | PARTIAL |

Do not copy these settings into a Front Office table.

## 14. Database Gaps

Proven gaps only. No SQL.

1. Check-in progress is unique on `reservation_id` (`0041_fo_checkin_stepper.sql`). One registration snapshot, one deposit waiver, one key waiver, and one `completed_at` cannot represent two room units. A unit foreign key, or one progress row per unit, is required before multi-room check-in state is honest.
2. No agreement or signature relation exists that can store version, guest, reservation, unit, time, employee, acknowledgements, and signature reference together. Profile consent columns cannot.
3. Identity is stored twice: scalar `guest_profiles.id_document_*` (`0041`) and `guest_documents` (`0051`, `0087`). Check-in writes the scalar and validates the document table. The scalar is not the document model.
4. `guest_documents.verification_status` is not a check-in input. If the product requires “verified”, the complete command must read it. That is a service gap more than a missing column.
5. Financial readiness has no stored unit scope. The folio is per reservation by design in 0156. A unit charge breakdown can stay on folio lines that already have `reservation_room_id` (`0157`). The check-in gate does not read those lines. No new money table is required for a reservation-level deposit. A unit-level guarantee would be a new concept and is not proven necessary until product rules say so.
6. `postCheckInDeposit`’s `ledgerMethod` bug is code, not a missing column. `deposit_method` already exists.

## 15. Service/API Gaps

| Responsibility | Closest implementation | Why it is not enough | Owner |
|----------------|------------------------|----------------------|-------|
| Check-in workspace read | `getCheckInContext` | No unit, packages, rate, occupants, documents, verification, or agreement | Front Office, reading other owners |
| Registration update | `saveCheckInRegistration` | Booker scalars, master amend, no document row, no duplicate check | Guest Profile command should be the writer |
| Verify identity | `reviewGuestDocument` | Not called by check-in; complete ignores status | Guest Profile |
| Financial status | `loadFolioStrip` | Counts payments; ignores deposit credits; uses a snapshot | Cashiering read |
| Collect deposit | `postCheckInDeposit` | Undefined `ledgerMethod`; result not visible to the gate | Cashiering |
| Agreement read/save | none | — | Front Office record; text from Property Setup |
| Capture signature | none | — | Front Office |
| Readiness evaluation | `canCompleteCheckIn` + guest rules + SQL | No agreement, no verification, no unit financial scope, no blocker list | Front Office |
| Typed override | three booleans and `requireSupervisor` | Not tied to a requirement id or unit; UI permission code is not what the server checks | Security role check stays; Front Office stores the waiver |
| Complete | `completeFoCheckIn` | Reuses the right SQL flip, then stamps a reservation-level progress row | Front Office |

## 16. Existing Logic We Must Reuse

- `pms_evaluate_room_assignment` and `listAssignableRooms` for eligible rooms. Do not reimplement overlap, blocks, or housekeeping in the new UI. Assignment lists stay eligible-only. Check-in readiness stays `isRoomReady` / housekeeping settings, which is a different question from assignment eligibility.
- `listReservationRoomDisplay` when the desk needs occupied-until, OOO, OOS, blocked, and sibling-held labels.
- `assign_hotel_reservation_room_unit` through `assignReservationRoom`, including the unit-status gate.
- Front Office room move for a unit that is already `checked_in`.
- `manage_reservation_room_guest` for add, remove, and primary. Do not create a second guest master.
- `price_hotel_stay` and the unit package review / `release_hotel_reservation_room_package` path. Check-in must not reprice.
- `check_in_hotel_reservation` and `check_out_hotel_reservation` for the status flip, history, folio-open-once rule, and unit lock behavior.
- `validateGuestCheckInRequirements`, `loadGuestWorkspaceConfig`, and `pms_guest_id_types` for required profile and document fields.
- `reviewGuestDocument` and `guest_documents` for verification and files.
- `findGuestDuplicates` if check-in searches for an existing person.
- `open_folio_for_reservation`, `callPostFolioTransaction`, and `requireCashierOperator` for money. Do not post a second ledger.
- `resolvePropertyBusinessDate` and `restaurants.business_date`. Do not use the browser clock.
- `recordGuestEvent` and the SQL `hotel_reservation_history` insert inside the check-in RPC.

## 17. Existing Logic We Must NOT Reuse

- Treating `getCheckInContext` as a unit workspace. It is the booker and the master room.
- `saveCheckInRegistration`’s `amend_hotel_reservation` call for occupancy on a multi-room stay.
- Writing `guest_profiles.id_document_*` as the identity system of record.
- Mapping every `guest_documents` row to `status: "valid"` inside `completeFoCheckIn`.
- `netPaymentTowardRequirement` as the definition of “deposit received”.
- `postCheckInDeposit` until `ledgerMethod` is a defined tender value and the gate reads `deposit` lines.
- `fo_checkin_progress` waiver flags as if they were per unit.
- Email `signature` columns and marketing consent as a guest registration signature.
- The early-check-in banner as a server policy. It does not block.
- Assuming master `status = checked_in` means every unit is in house.
- Key waiver as a substitute for agreement and signature. Key is a different step.

## 18. Test Coverage Matrix

| Capability | Coverage | Evidence |
|------------|----------|----------|
| Registration snapshot gate and waiver flag | Partial | `fo-check-in.test.ts` “registration incomplete blocks Continue unless waived” |
| Deposit gate uses payments and ignores deposit credits | Adequate for current policy A; conflicts with Cashiering deposit credits | same file, “sums payment lines against the snapshot and ignores deposit credit” |
| Key gate | Partial | “key missing blocks unless waived” |
| Room readiness helper | Partial | “only available + clean/inspected rooms are ready” |
| Stepper has no void, settle, or refund | Partial | “stepper source has no Void / settle / refund actions” |
| Walk-in does not call check-in | Partial | “walk-in create path must not invoke check-in” |
| Check-in RPC accepts a unit id | Partial, source assertion | `reservation-room-units.test.ts` expects `_reservation_room_id` on the check-in function file |
| Stepper sends unit id and keeps registration on the booker | Partial, source assertion | `reservation-room-occupants.test.ts` |
| Override permission metadata | Partial | `fo-phase8.test.ts` |
| Guest document verify, duplicate search | Present on Guest Profile tests, not on check-in | `guest-create-workspace.test.ts`, `create-reservation-phase1.test.ts` |
| Agreement, signature, verification required at check-in, unit-scoped waiver, `ledgerMethod`, deposit post satisfying the gate | Untested | — |
| Concurrent double check-in | Untested beyond the SQL status predicate | 0156 |

## 19. Minimum Required Backend Additions

B01 — Unit-scoped check-in read. Front Office. Schema: yes if progress must be per unit; the read itself can start by taking `reservationRoomId` and loading that unit, its occupants, and its room. Depends on existing unit tables. Risk: medium. The new screen should not call `getCheckInContext` as the unit contract. Frontend of Guest & Reservation can layout against reservation detail DTOs first, but it should not ship against the current check-in context.

B02 — Registration through Guest Profile. Front Office calls Guest Profile writes and `reviewGuestDocument`. Stop writing scalar identity as the source of truth. Schema: no, if `guest_documents` remains the document. Depends on B01 for the correct guest id (unit primary versus booker). Risk: high if the booker and the occupant differ. Frontend registration should wait.

B03 — Financial readiness adapter. Cashiering. Read snapshot or property rule explicitly, sum `deposit` credits, and return required, received, outstanding, and folio status for the reservation. Repair or replace `postCheckInDeposit` so the posted tender is defined and counted. Schema: no. Depends on existing folio. Risk: high. Payment step should wait.

B04 — Agreement and signature persistence. Front Office record, Property Setup text and version. Schema: yes. Depends on B01 for unit and guest ids. Risk: high for audit claims. Agreement step cannot be real without it.

B05 — Readiness evaluator. Front Office. Returns blockers, warnings, overrides, and whether complete is allowed, using B02–B04 plus `isRoomReady`, the assignment assert, and unit status. Schema: no. Depends on B01–B04. Risk: medium. Review step should wait for this rather than copy stepper booleans.

B06 — Override hardening. Security role check stays server-side. Store requirement, unit, reason, actor, and time on the unit progress or the new agreement record. Do not let a registration waiver skip identity rules unless product rules say so. Schema: only if B01’s progress row cannot store it. Depends on B01 and B05. Risk: medium.

B07 — Complete hardening. Keep `check_in_hotel_reservation`. Call it only after B05, always with the unit id when unit rows exist, and do not stamp a reservation-level `completed_at` as the unit result. Schema: no beyond B01. Risk: high if B07 ships alone. The status RPC can be reused now for a single-unit stay; the five-step complete action should wait.

Key issuance can remain an operational side record. It is not one of the five proposed stages. Do not delete it as part of this audit.

## 20. Final Verdict

1. Can the five-step UI be built today with zero backend changes? No.
2. Which steps are fully supported today? None. Step 1 is the closest for a single-room stay.
3. Which steps are only partially supported? Step 1 Guest & Reservation, Step 2 Registration, Step 3 Payment & Guarantee, Step 5 Review & Check-In.
4. Which step has the largest backend gap? Step 4 Agreement & Signature.
5. Are migrations required? Yes, for an auditable agreement/signature and for unit-scoped check-in progress. Not for room eligibility or the status flip.
6. Is the existing final Check-In command safe? PARTIAL. The SQL transition is safe for one confirmed unit. The TypeScript wrapper is not a sufficient server gate for the proposed workflow.
7. Is Check-In correctly unit-aware for multi-room reservations? PARTIAL. Status, history, and check-out are. Guest, money, waivers, and completion flags are not.
8. Are payment and deposit rules authoritative from Cashiering? No. The folio is Cashiering. The gate is a Front Office comparison of payments to a reservation snapshot, and it ignores deposit credits.
9. Are guest identity updates authoritative from Guest Profile? PARTIAL. The profile and `guest_documents` are the masters. Check-in save writes a parallel scalar on the profile and does not verify the document row.
10. Are agreement and signature records auditably persisted? No.
11. Is readiness enforced server-side or mainly in the UI? Server-side for guest field rules, document expiry, room readiness, registration snapshot, payment-net, key, and the SQL status flip. UI-only for early check-in. Unenforced for verification status, guarantee, and agreement.
12. What must be built before frontend implementation should begin? B01 and B05’s contract (even if B04 is still empty and reported as a blocker), plus a decision to keep key as a side step. Agreement UI and payment UI should not be built as if the current progress row and deposit gate are the model.

CHECK-IN BACKEND AUDIT: COMPLETE

# Check-In Backend Implementation Plan

This plan converts only the proven gaps in the audit above into backend work. It does not replace those findings. Check-In is unit-scoped: when `hotel_reservation_rooms` rows exist, the operational target is that unit. The reservation master stays the commercial container.

## 1. Implementation objective

The backend must let Front Office load one unit, register that unit’s guest through Guest Profile, read Cashiering deposit readiness, store an auditable agreement and signature for that unit, evaluate blockers on the server, and complete check-in by calling the existing `check_in_hotel_reservation` transition.

It must not create a second guest master, a second folio ledger, a second room-eligibility engine, a second price engine, or a second status transition. Reservations keeps the stay, units, occupants, and commercial fields. Guest Profile keeps identity and `guest_documents`. Room & Inventory keeps assignment eligibility. Housekeeping keeps cleaning workflow; Front Office only consumes `isRoomReady`. Cashiering keeps folio, deposit, and payment posting. Property Setup keeps field rules, identity-type rules, business date, and agreement text. Security keeps the owner/manager role check. Front Office orchestrates the unit check-in and owns progress, waivers, the signed agreement instance, and the readiness result.

Unit scope is required because the audit showed the status flip is already per unit while `getCheckInContext`, `saveCheckInRegistration`, `fo_checkin_progress`, and the deposit gate are reservation-scoped. One waiver or one `completed_at` on a reservation would mark every sibling finished.

## 2. Implementation principles

- The selected room unit is the Check-In target whenever unit rows exist.
- The reservation remains the commercial and folio container.
- Guest Profile remains the identity owner. `guest_documents` remains the identity-document owner.
- Cashiering remains the financial owner. Front Office reads a readiness result and calls existing post commands.
- Room & Inventory remains the assignment and eligibility owner. Front Office does not reimplement overlap, blocks, or housekeeping.
- Property Setup remains the policy owner for required fields, document types, business date, and agreement text.
- The server readiness result is authoritative. The UI must not decide eligibility.
- Permissions are enforced on the server. The `front_office.check_in.override` query in the stepper is not the authorization check.
- Sensitive writes record history. A registration waiver does not skip guest-field or document-expiry rules.
- Legacy reservations with zero unit rows keep the existing no-unit path. Do not invent a second reservation model.
- Key issuance stays an operational side requirement. It is not a sixth user-facing stage and it is not a signature.

## 3. Dependency order

```
B01.1 unit aggregate read
  ├─ B01.2 unit progress row
  │    ├─ B06 unit-scoped waivers
  │    └─ B07 complete (needs B05 and B06)
  ├─ B02 registration through Guest Profile
  ├─ B03.1 deposit tender repair (no schema; can ship beside B01.1)
  ├─ B03.2 deposit-credit readiness read
  └─ B04 agreement and signature
        └─ B05 readiness evaluator (needs B01.2, B02, B03.2, B04, key side state)
              └─ B07 complete
```

B01–B07 from the audit stay. They are split so a read can land before a migration, and so the deposit write bug is not blocked on agreement work.

B03.1 is ordered beside B01.1 because `ledgerMethod` throws after a successful folio post. That repair does not change the payment-versus-deposit gate. B03.2 changes the gate and must update the test that pins “ignores deposit credit” in `fo-check-in.test.ts`. Do not ship B03.2’s contract to the UI before that test expectation is part of the same increment.

B05 cannot be final until B02, B03.2, and B04 exist. A temporary B05 may run after B01.1 and report agreement and deposit as explicit blockers. That temporary result is not the Step 5 contract.

B06 follows B01.2 because waivers live on the unit progress row. B07 follows B05 and B06. It does not rewrite `check_in_hotel_reservation`.

## 4. Implementation increments

The field-by-field records for B01 through B07 are sections 5–11. Shared rules for every increment:

- Owner is Front Office unless a row says another module remains the writer.
- Server enforcement reuses `requireReservationManager` (owner, manager, receptionist). Waivers reuse `requireSupervisor` (`MANAGE_ROLES`: owner, manager). Deposit posting reuses `requireCashierOperator`. No new permission code.
- Multi-room safety: every write takes `reservationRoomId` when unit rows exist, and a sibling row is not updated.
- Legacy: zero unit rows keep master `guest_id`, master `room_id`, and a progress row with a null unit id.
- Frontend must not stub a later increment’s rule. Gates are in section 17.

## 5. B01 — Unit-scoped Check-In foundation

### B01.1 — Unit aggregate read

#### Goal

Return one Check-In target: the selected unit, its primary guest, occupants, room, commercial facts, sibling list, and room display. Do not use `getCheckInContext` as this contract.

#### Why this is required

Audit section 4: `loadStay` reads the booker and `hotel_reservations.room_id`. The stepper already holds `reservationRoomId` only in React and passes it to `completeFoCheckIn` when more than one unit exists.

#### Owner

Front Office orchestration. Reservations remains owner of units and occupants. Room & Inventory remains owner of eligibility.

#### Existing logic to reuse

`hotel_reservation_rooms`, `hotel_reservation_room_guests`, `manage_reservation_room_guest` (read the rows it writes; do not add a guest table), `listAssignableRooms`, `listReservationRoomDisplay`, `pms_evaluate_room_assignment`, reservation package rows where `reservation_room_id` is the unit, `price_hotel_stay` only as already stored subtotal (do not reprice).

#### Existing logic that must not be reused

`getCheckInContext` / `loadStay` as the unit workspace. Master `room_id` as the selected unit’s room when a unit row exists.

#### Database impact

NONE.

#### Read-model impact

Input: `restaurantId`, `reservationId`, and `reservationRoomId` when any unit row exists. Output: target unit id, sequence, status, dates, adults, children, room type, physical room, rate plan, subtotal, unit packages, occupants, primary guest id and a `guestSource` of `unit_primary` or `booker`, sibling units (id, sequence, status, room only), and the existing display rows for that unit’s type and dates. If several units exist and the id is omitted, return the same failure as `ROOM_UNIT_REQUIRED`. If one unit exists, resolve it. If none exist, return the legacy master room and booker and set `guestSource` to `booker`.

#### Command impact

None. Assign, change room, unassign, and occupant edits stay on `assignReservationRoom` and `manageReservationRoomGuest`.

#### Permission impact

`requireReservationManager` on the read.

#### Audit/history impact

None. This increment does not write.

#### Multi-room safety

The read selects one unit id. Sibling packages and sibling occupants are not copied onto the target. The room list uses that unit’s type and dates.

#### Backward compatibility

Zero unit rows: master fields, as `resolve_reservation_room_unit` does when the count is zero.

#### Tests required

One unit resolves without an explicit id. Two units without an id fail. Two units return only the requested primary guest. A sibling room is not presented as the target room. A unit with no primary guest falls back to the booker and is labeled `booker`. A sibling does not inherit that booker as its primary.

#### Acceptance criteria

1. The read never uses master `room_id` as the target room when the target unit has its own `room_id`.
2. Primary guest is the unit primary occupant when one exists.
3. Booker fallback is labeled and is not applied to a different unit.
4. Missing unit id with multiple units fails closed.
5. `listAssignableRooms` remains eligible-only and is not passed `forCheckIn: true`.

#### Dependencies

None.

#### Risks

Reservation detail and this read can disagree if a caller still uses `getCheckInContext`. Keep that function for the current stepper until the new workspace replaces it.

#### Frontend dependency

Step 1 can start after B01.1 for display only. It must not save registration, money, agreement, or completion against this read.

### B01.2 — Unit progress row

#### Goal

Store registration snapshot, deposit waiver, key waiver, and completion cache per unit.

#### Why this is required

Audit section 14: `fo_checkin_progress` is unique on `reservation_id` (`0041_fo_checkin_stepper.sql`). One `completed_at` cannot represent two units.

#### Owner

Front Office. The reservation remains the parent.

#### Existing logic to reuse

Columns already on `fo_checkin_progress`: registration snapshot, three waiver triples (flag, reason, by, at), key fields, `completed_at`. `patchProgress` and `loadProgress` are the writers to retarget, not to copy into a new service.

#### Existing logic that must not be reused

A lookup by `reservation_id` alone when unit rows exist. Sharing one waiver across siblings.

#### Database impact

MIGRATION REQUIRED. Concept only: allow one progress row per unit. Uniqueness becomes reservation plus unit. A null unit id is allowed only when the reservation has no unit rows. A reservation that has units must not keep a second null-unit progress row. Backfill: if the reservation has exactly one unit, attach the existing progress row to that unit. If it has several units, do not copy waiver or `completed_at` onto every unit; leave the legacy row readable for audit and stop using it as the live unit state. New unit check-ins insert their own row.

#### Read-model impact

B01.1’s payload gains the progress fields for that unit only.

#### Command impact

Later increments write this row. B01.2 only creates the shape and the read.

#### Permission impact

Same as today: service-role writes after `requireReservationManager`. RLS in `0041` is not the enforcement point.

#### Audit/history impact

No new event in this increment. The migration must not delete historical progress rows.

#### Multi-room safety

Sibling units do not share a progress row after backfill.

#### Backward compatibility

Single-unit stays keep their current flags by attaching them to that unit. Zero-unit stays keep a null unit id.

#### Tests required

Two units cannot read each other’s waiver. Single-unit backfill preserves the existing waiver. A multi-unit legacy row is not treated as completion of unit 2. A null unit id is rejected when unit rows exist.

#### Acceptance criteria

1. Uniqueness is no longer reservation-only for unit-backed stays.
2. Backfill does not mark every sibling waived or complete.
3. The read for unit 2 does not return unit 1’s `completed_at`.

#### Dependencies

B01.1.

#### Risks

A partial backfill that copies one waiver onto all units would be worse than today’s bug. The migration concept forbids that copy.

#### Frontend dependency

Frontend must wait for B01.2 before persisting any check-in step state.

## 6. B02 — Registration through Guest Profile

### B02 — Registration command and document read

#### Goal

Edit the target guest and read normalized identity documents. Stop writing scalar identity as the Check-In source of truth. Stop amending master occupancy from registration save.

#### Why this is required

Audit section 5: `saveCheckInRegistration` updates the booker, writes `id_document_*`, calls `amend_hotel_reservation` for adults and children, and does not write `guest_documents`. `completeFoCheckIn` then forces every document to `status: "valid"`.

#### Owner

Front Office orchestration. Guest Profile remains the writer of `guest_profiles` and `guest_documents`.

#### Existing logic to reuse

`validateGuestCheckInRequirements`, `loadGuestWorkspaceConfig`, `pms_guest_id_types`, `reviewGuestDocument`, `findGuestDuplicates` as an explicit search, `recordGuestEvent`, `guest_documents` columns from `0051` and `0087` (number, country, issue, expiry, storage, `verification_status`, `verified_by_membership_id`, `verified_at`). Profile columns `middle_name`, `gender`, `date_of_birth` from the guest table and `0057`.

#### Existing logic that must not be reused

Scalar `id_document_*` writes from Check-In. `amend_hotel_reservation` inside registration save. Hard-coded `isRegistrationComplete` as a second required-field engine. Forcing document status to `valid`. Silent duplicate merge. Creating a guest from the check-in command.

#### Database impact

NONE. Do not drop `id_document_*`. Check-In stops using them.

#### Read-model impact

Input: target from B01, including `guestSource`. Output: profile fields the property rules mark for `check_in`, document list with real `verification_status`, expiry, issuing country, and file presence. Duplicate search is a separate call with the same inputs `findGuestDuplicates` already accepts. It returns candidates; it does not attach them.

#### Command impact

A Check-In registration command updates the target guest through the existing guest update path and records `profile_updated`. Document create/update uses the existing document commands, not a new document table. Verification uses `reviewGuestDocument` and records `document_verified` or `document_rejected`. Occupancy changes are out of this command. Accompanying guests stay on `manage_reservation_room_guest`. Upload remains `property-images` via the existing storage path. No scanner or OCR command.

DECISION REQUIRED — verification as a blocker. Evidence: `verification_status` exists and Check-In ignores it; `validateGuestCheckInRequirements` blocks missing and expired documents and does not read verification. Options: (1) recommended — unverified is a warning unless an existing identity-type rule already requires staff verification; (2) always block until `verified`. Consequence of (1): desks can check in with an unexpired document that staff have not marked verified. Consequence of (2): a new hard gate the property settings do not express today. Do not add a new settings flag in this increment.

#### Permission impact

Registration: `requireReservationManager`. Verify/reject: existing `requireGuestManager` on `reviewGuestDocument`. Do not weaken that to receptionist unless that command already allows it. It does not.

#### Audit/history impact

`profile_updated` and document review events, with the actor membership. Reservation history may note that registration was saved for `reservation_room_id`. It must not store a second copy of the identity number as the source of truth.

#### Multi-room safety

The command uses the target unit’s guest id from B01. Saving unit 2 does not update unit 1’s guest or the master adult/child counts.

#### Backward compatibility

Legacy stays with no unit use the booker. Existing scalar identity values remain readable for old screens but are not what Check-In validates.

#### Tests required

Update writes the unit primary, not a sibling. No `amend_hotel_reservation` from this command. Expired document fails `validateGuestCheckInRequirements`. `completeFoCheckIn` no longer maps documents to `valid`. Duplicate search returns candidates and does not insert a profile. Accompanying guest add still goes through `manage_reservation_room_guest`.

#### Acceptance criteria

1. Check-In validation reads `guest_documents`.
2. Registration save does not change master occupancy.
3. Booker is updated only when `guestSource` is `booker`.
4. Verification status is returned as stored.
5. Scanner and OCR are not claimed.

#### Dependencies

B01.1. Progress snapshot of the registration, if still stored, waits for B01.2 and is a cache of the profile, not a second identity store.

#### Risks

Guest-manager versus receptionist on `reviewGuestDocument` can block a desk that can open Check-In. Do not bypass it inside Front Office.

#### Frontend dependency

Step 2 waits for B02. Step 1 can show the guest from B01.1 before edits exist.

## 7. B03 — Payment and guarantee

### B03.1 — Repair the deposit tender write

#### Goal

`postCheckInDeposit` stores the tender it actually posted.

#### Why this is required

Audit section 6: after `callPostFolioTransaction` with `type: "deposit"`, the handler assigns `deposit_method: ledgerMethod`. `ledgerMethod` is not declared. The folio row can commit and the progress update can throw.

#### Owner

Front Office orchestration. Cashiering remains the poster through `callPostFolioTransaction` and `requireCashierOperator`.

#### Existing logic to reuse

`open_folio_for_reservation`, `folioTenderFromCatalogue`, `tender.stored`, `callPostFolioTransaction`, idempotency key, `mapCashierShiftError`.

#### Existing logic that must not be reused

The `ledgerMethod` identifier. Any second ledger write.

#### Database impact

NONE. `deposit_method` already exists.

#### Read-model impact

None beyond returning the folio strip after a successful progress update.

#### Command impact

Set `deposit_method` from `tender.stored`. If the folio post succeeds and the progress update fails, return an error that names the posted transaction id and do not post again for the same idempotency key.

#### Permission impact

Unchanged: reservation manager and cashier operator.

#### Audit/history impact

Keep the reservation `amended` note only after the progress update succeeds. The folio transaction itself is the financial audit.

#### Multi-room safety

The post stays on the reservation folio. It does not open a second folio and does not change sibling unit status. The progress row written must be the target unit’s row once B01.2 exists. Until B01.2 ships, do not change which progress row is updated except to fix the tender value on the current reservation row. Ship B03.1’s tender fix in a way that still compiles against the current unique reservation row, then point the write at the unit row in B01.2.

#### Backward compatibility

Existing deposit transactions remain. New writes store a real method string.

#### Tests required

The method persisted equals `tender.stored`. A missing identifier cannot throw after post. The same idempotency key does not create a second deposit.

#### Acceptance criteria

1. `ledgerMethod` is gone from this handler.
2. A successful response means both the folio post and the progress method write succeeded, or the error includes the existing transaction id.

#### Dependencies

None for the tender fix. Unit targeting of the progress row depends on B01.2.

#### Risks

Shipping the unit-row write before B01.2 will fail the current unique constraint. Keep those two changes ordered.

#### Frontend dependency

Do not start the payment step on B03.1. The gate is still wrong until B03.2.

### B03.2 — Deposit-credit readiness

#### Goal

Report required, received, outstanding, folio status, and guarantee method from Cashiering and the reservation snapshot. Received means `deposit` credits, not `payment` lines.

#### Why this is required

`loadFolioStrip` uses `netPaymentTowardRequirement`, which ignores `type: "deposit"`. `fo-check-in.test.ts` pins that behavior (“sums payment lines against the snapshot and ignores deposit credit”). `postCheckInDeposit` writes `deposit`, so the posted amount does not satisfy `isDepositSatisfied`.

#### Owner

Cashiering owns the lines. Front Office owns the check-in read that sums them.

#### Existing logic to reuse

`guest_folios`, `folio_transactions`, `snapshotRequiredAmount` on `deposit_requirement_snapshot`, `isDepositSatisfied` once its input is deposit-received, `open_folio_for_reservation` (already once per reservation in `0156`).

#### Existing logic that must not be reused

`netPaymentTowardRequirement` as “deposit received”. A new money table. A unit-level guarantee model. Inventing a guarantee-satisfied rule.

#### Database impact

NONE.

#### Read-model impact

Input: `restaurantId`, `reservationId`. Output: folio id and status, currency as stored on the folio or reservation, required amount from the snapshot (null means no snapshot amount), received amount as the net of `deposit` lines, outstanding, satisfied flag, `guaranteeMethod` from `hotel_reservations.guarantee_method`, and `guaranteeSatisfied: null` with a reason that no rule exists. Company and group ids may be echoed from the reservation. They do not change the numbers. Partial deposit leaves satisfied false. Zero or null required amount leaves satisfied true, matching today’s empty-snapshot behavior, but the amount compared is deposit-received.

DECISION REQUIRED — guarantee. The audit found `guarantee_method` stored and not evaluated. Options: (1) recommended — return it as information and do not block; (2) block when the method is empty. Consequence of (2): a new rule with no settings source. Do not implement (2) in this increment.

#### Command impact

No new post command. B03.1 remains the collector.

#### Permission impact

Read: `requireReservationManager`. Post: unchanged cashier rule.

#### Audit/history impact

None on the read. The compared amounts are not a second ledger.

#### Multi-room safety

The folio remains reservation-scoped, as `0156` designed. The result is labeled reservation-level so a unit screen does not pretend the sibling has a separate deposit. A unit deposit waiver, once B06 exists, applies only to that unit’s readiness, not by editing the sibling’s numbers.

#### Backward compatibility

Historical `payment` lines no longer count as the check-in deposit. Call that out in release notes for the test change. Do not delete payment rows.

#### Tests required

A `deposit` line of the required amount satisfies the gate. A `payment` line alone does not. A partial deposit does not. A waiver still satisfies when the waiver increment allows it. Cashier permission is still required to post. `ledgerMethod` stays absent.

#### Acceptance criteria

1. The readiness sum uses `transaction_type = deposit`.
2. The pinned payment-only test is replaced in the same increment that changes the helper.
3. Guarantee does not block.
4. No second folio is opened for a second unit.

#### Dependencies

B03.1. Unit waiver display depends on B01.2 and B06, not on this sum.

#### Risks

Properties that satisfied the old gate with payments and never posted a deposit will show an unsatisfied deposit. That is the audited bug, not a new rule. Surface received and required so the desk can see it.

#### Frontend dependency

Step 3 waits for B03.2.

## 8. B04 — Agreement and signature

### B04 — Signed registration instance

#### Goal

Persist which agreement version a guest accepted for one unit, with acknowledgements, time, staff, and a signature reference.

#### Why this is required

Audit section 7: no stay agreement record exists. Profile `data_processing_consent` / `marketing_consent` and communication `signature` columns are different things.

#### Owner

Property Setup owns agreement text and version. Front Office owns the signed instance for the stay. Guest Profile is only the guest id on that instance.

#### Existing logic to reuse

None of the consent or email-signature writers. Guest id, reservation id, and unit id from B01. `recordReservationEvent` may point at the instance id. It must not be the only copy of the signature.

#### Existing logic that must not be reused

`guest_profiles` consent columns. `pms_communication_sender_settings.signature` and `pms_communication_defaults.signature`. `fo_checkin_progress.registration_snapshot` as the agreement. A boolean `terms_accepted` with no version.

#### Database impact

MIGRATION REQUIRED. Two concepts, no SQL here.

Property agreement version: stable id, property id, version label, the text or a reference to text that was shown, and an active flag. The audit found no agreement-template table. This row is the minimum Property Setup concept. Do not overload email settings.

Front Office signed instance: property id, agreement version id, reservation id, unit id (null only for a legacy stay with no units), guest profile id, acknowledgement values captured at sign time, signed-at, captured-by membership, signature storage reference, and signature method (`drawn` now; hardware later). The instance is immutable. A re-sign inserts a new row and does not update the signed payload. Uniqueness: one current signed instance per unit and agreement version is enough; older rows stay.

#### Read-model impact

Input: target unit and guest from B01. Output: active agreement version (id, label, text), and the current signed instance if any (version id, acknowledgements, signed-at, captured-by, whether a signature reference exists). Missing version is a blocker, not an empty success.

#### Command impact

Save agreement: allowed only before a signature exists for that version; it records the version id and acknowledgements. Capture signature: writes the reference, method, guest, unit, time, and staff, then the row no longer accepts edits. Clear and re-sign means a new instance, not an update. Print and PDF rendering are not this increment.

#### Permission impact

`requireReservationManager` to read and capture. No new permission code.

#### Audit/history impact

Reservation history records agreement version id, guest id, unit id, and instance id. The signature bytes or object path live on the instance, not only inside a history JSON note.

#### Multi-room safety

The instance requires the target unit id when units exist. Signing unit 1 does not create a row for unit 2.

#### Backward compatibility

Stays with no units use a null unit id, same rule as progress. Existing stays have no instance and remain unsigned until the desk signs.

#### Tests required

The stored version id matches the version shown. Guest id is the target guest, not a sibling primary. Unit id is the target unit. Acknowledgements are the values submitted at sign time. An update of a signed row fails. Email signature and marketing consent are not read or written.

#### Acceptance criteria

1. A signed row identifies version, guest, reservation, unit, staff, and time.
2. Consent columns are untouched.
3. Re-sign does not mutate the previous row.

Implementation status: migration `0170_checkin_agreement_signature.sql` is written and is not applied from an agent. Apply it manually. Step 4 UI is not started.

#### Dependencies

B01.1 for ids. B01.2 is not required to store the instance. Readiness in B05 needs this read.

#### Risks

If Property Setup text is edited in place, old signatures lie. The version row must be immutable once any instance points at it. A text change creates a new version id.

#### Frontend dependency

Step 4 waits for B04. Do not draw a signature that is only stored in component state.

## 9. B05 — Unified Check-In readiness

### B05 — Server readiness result

#### Goal

One server result for the target unit: registration, identity, room, financial, agreement, signature, key, blockers, warnings, overrides, and whether completion is allowed.

#### Why this is required

Audit section 8: gates are split across `validateGuestCheckInRequirements`, `isRoomReady`, `canCompleteCheckIn`, and the SQL transition. There is no blocker list. Agreement is absent. Early arrival is a banner only.

#### Owner

Front Office orchestration. Each section reads the owning module. The evaluator does not reimplement those modules.

#### Existing logic to reuse

`validateGuestCheckInRequirements`, `isRoomReady` / `evaluateRoomReadinessWithPolicy`, `listReservationRoomDisplay` or `pms_evaluate_room_assignment` for eligibility, unit status from `hotel_reservation_rooms`, B03.2 financial read, B04 agreement read, key fields on the unit progress row, `resolvePropertyBusinessDate`.

#### Existing logic that must not be reused

`canCompleteCheckIn` as the only result. The early-check-in banner as a server policy. `netPaymentTowardRequirement` for the deposit section. Document `status: "valid"`. Master status as proof that this unit is still `confirmed`.

#### Database impact

NONE.

#### Read-model impact

Input: `restaurantId`, `reservationId`, `reservationRoomId` under the B01 rules. Output groups, not a fixed TypeScript name: target unit and guest source; registration and identity result; room assigned, eligible, and ready; financial result from B03.2; agreement and signature result; key recorded or waived; blockers; warnings; applied overrides; `canCheckIn`. `canCheckIn` is true only when blockers are empty. Overrides remove a blocker only when B06 says that requirement is waivable and a valid unit waiver exists.

Suggested blocker codes, aligned with current errors: `ROOM_UNIT_REQUIRED`, `INVALID_TRANSITION`, `GUEST_FIELDS`, `IDENTITY_DOCUMENT`, `ROOM_REQUIRED`, `ROOM_NOT_ELIGIBLE`, `ROOM_NOT_READY`, `DEPOSIT_REQUIRED`, `AGREEMENT_REQUIRED`, `SIGNATURE_REQUIRED`, `KEY_REQUIRED`. Warnings: unverified document under the B02 decision, early arrival, guarantee present but unevaluated.

Early arrival: if `early_checkin_allowed` is false, warning only, matching today’s non-blocking banner, unless a later product rule says otherwise. Do not invent an approval inbox. The audit says there is none.

Key: remain a side requirement inside this result, under the Review step, not a sixth stage. `recordCheckInKey` and `waiveCheckInKey` stay. Key missing is a blocker until recorded or waived. It is not an agreement.

#### Command impact

None. Completion calls this result in B07.

#### Permission impact

`requireReservationManager`.

#### Audit/history impact

The read does not write history. B07 records the result codes it acted on.

#### Multi-room safety

Room eligibility and readiness use the target unit’s room and dates. A sibling `checked_in` does not satisfy this unit. Financial numbers are reservation-level and labeled as such. Agreement and key are unit-level.

#### Backward compatibility

No unit rows: evaluate the master room and booker, and key/agreement on the null-unit progress and agreement rows.

#### Tests required

Each blocker above can be produced alone. A warning does not clear `canCheckIn` by itself. Stale room: display or evaluator rejection becomes `ROOM_NOT_ELIGIBLE`. Unverified document follows the B02 decision. Key waiver clears only `KEY_REQUIRED`.

#### Acceptance criteria

1. The client can render blockers from this object without local business rules.
2. `canCheckIn` is false when any blocker remains.
3. Key is present and is not a new stage.
4. Agreement missing is a blocker after B04, not a silent pass.

Implementation status: `getCheckInReadiness` returns this result. Completion still uses `completeFoCheckIn` until B07. Step 5 is not wired.

#### Dependencies

B01.1, B01.2, B02, B03.2, B04. Key state can be read from B01.2.

#### Risks

Calling this before B04 and treating a missing agreement reader as success. The temporary mode must return `AGREEMENT_REQUIRED` until B04 is live.

#### Frontend dependency

Step 5 display of this object waits for B05. The complete button waits for B07.

## 10. B06 — Override and waiver hardening

### B06 — Unit-scoped waivers

#### Goal

Store a waiver for one requirement on one unit, authorized by an owner or manager, without bypassing hard rules.

#### Why this is required

Audit section 11: the stepper loads `front_office.check_in.override`, but the server only checks `requireSupervisor`. Waivers are three booleans on the reservation progress row. The authorizer and the requester are the same membership. A registration waiver does not currently skip `validateGuestCheckInRequirements`, and it must stay that way.

#### Owner

Front Office stores the waiver. Security remains the owner/manager role check. Do not add a permission code.

#### Existing logic to reuse

`requireSupervisor`, `MANAGE_ROLES`, `FO_AUTHORIZATION_META["front_office.check_in.override"]`, existing waiver columns (reason, by, at) moved onto the unit progress row.

#### Existing logic that must not be reused

UI-only approval as authorization. One reservation waiver for every unit. A registration waiver that skips field rules, document expiry, room eligibility, or unit status.

#### Database impact

NONE beyond B01.2, if that row already has the three waiver triples. Add a requirement code on the history event, not a new permission table. If one row cannot store a future fourth requirement, add a child waiver row later. Do not add it now. The three current requirements fit the existing columns.

#### Read-model impact

B05 lists overrides only when the matching unit flag is true. Each entry has requirement, reason, actor, and time.

#### Command impact

Waive registration, deposit, or key for one `reservationRoomId`. Validate the reason is non-empty, the actor is owner or manager, and the target unit belongs to the reservation. Persist flag, reason, membership, and time on that unit row. Record reservation history with the unit id and requirement. Requester and authorizer stay the same person, matching today’s `me.id`, until a separate requester column exists. Do not block on that split.

Waivable: registration snapshot completeness only (the old hard-coded name/phone/id snapshot), deposit outstanding, key missing.

Not waivable: `validateGuestCheckInRequirements`, document expiry, `verification` if it is ever a blocker, room eligibility, room readiness, unit must be `confirmed`, agreement version, signature. Agreement has no waiver in this plan.

Invalidation: a waiver does not survive a change in the underlying fact for a fresh evaluation of non-waivable rules. A deposit waiver remains a recorded decision even if a deposit is later posted; readiness treats waived as satisfied. If the unit is no longer `confirmed`, completion fails in SQL regardless of waivers. Do not auto-delete the waiver row.

#### Permission impact

Server `requireSupervisor`. Receptionist calls fail. The stepper’s approval query is not sufficient.

#### Audit/history impact

History includes requirement, unit id, reason, and actor. The progress columns keep by and at.

#### Multi-room safety

The update’s predicate includes the unit id. Unit 1’s deposit waiver does not clear unit 2.

#### Backward compatibility

B01.2 backfill attaches old flags to the single unit only. Multi-unit legacy flags are not copied.

#### Tests required

Receptionist waiver fails. Owner waiver on unit 1 does not change unit 2. Registration waiver does not clear an expired-document blocker. Deposit waiver clears only the deposit blocker. Room-not-eligible stays a blocker.

#### Acceptance criteria

1. Authorization is the server role check.
2. Waivers are unit-scoped.
3. The non-waivable list above cannot be cleared by any of the three flags.

Implementation status: waivers are stored on the target unit by an owner or manager. The three existing waive commands use that writer. No migration.

#### Dependencies

B01.2. B05 consumes the flags. B06 can ship before B05 if tests hit the command directly.

#### Risks

Leaving the old reservation-level waive commands callable will keep the bug. Retire their reservation-only path when the unit command exists, or make them require a unit id.

#### Frontend dependency

Waiver controls wait for B06. Step 5 can show blockers from B05 before waivers exist; those blockers simply have no override action yet.

## 11. B07 — Complete Check-In hardening

### B07 — Complete command

#### Goal

Revalidate on the server, reject blockers, and call `check_in_hotel_reservation` for the target unit without rewriting that function.

#### Why this is required

Audit section 8: `completeFoCheckIn` checks reservation-level progress, then calls the RPC, then stamps `completed_at` on the reservation progress row. The SQL transition itself is the part to keep.

#### Owner

Front Office orchestration. The status transition remains `check_in_hotel_reservation`.

#### Existing logic to reuse

B05 result, B06 waivers, `check_in_hotel_reservation` (`0156`): `FOR UPDATE` on the reservation, `resolve_reservation_room_unit`, `ROOM_UNIT_REQUIRED`, unit must be `confirmed`, `assert_reservation_room_unit_room`, one-unit update, `rollup_hotel_reservation_status`, `check_in` history with `reservation_room_id`, folio open only when the master was not already `checked_in`, housekeeping transition on that room.

#### Existing logic that must not be reused

A second status update in TypeScript. Master `room_id` when the unit has a room. Calling the RPC when B05 has blockers. Stamping every unit from one `completed_at`. Rewriting the SQL function to update `fo_checkin_progress`.

#### Database impact

NONE for the recommended transaction option. Option B below is a new function, not this increment’s default.

#### Read-model impact

The command returns the resulting unit status, room number, and a completion outcome: `completed` or `checked_in_stamp_pending`.

#### Command impact

Require the unit id when unit rows exist. Run B05 immediately before the RPC. If blockers remain, do not call the RPC. If the RPC returns `INVALID_TRANSITION` because the unit is already `checked_in`, do not treat that as a new check-in; return the duplicate-check-in error. On RPC success, attempt the unit progress `completed_at` stamp.

#### Permission impact

`requireReservationManager`. Waivers already stored are not re-authorized at complete beyond B05’s reading of them. A receptionist still cannot create a waiver.

#### Audit/history impact

The RPC writes `check_in` with unit context. The command does not write a second status history row. It may write a note that lists blocker codes that were clear at call time only when the RPC succeeds. That note is not the completion fact.

#### Multi-room safety

The RPC updates one unit. Rollup may set the master to `checked_in`. The command must not update sibling progress rows. The response includes the target unit id so the client does not assume every unit is in house.

#### Backward compatibility

No unit rows: call the RPC without `_reservation_room_id`, as today, and stamp the null-unit progress row.

#### Tests required

One confirmed unit becomes `checked_in` and the sibling stays `confirmed`. A second complete on that unit fails without another history pair from a second successful transition. Missing unit id with two units never calls the RPC. Blockers skip the RPC and leave the unit `confirmed`. History on success includes `reservation_room_id`. Stamp failure after RPC success does not call the RPC again and returns `checked_in_stamp_pending`. A later read fills `completed_at` idempotently.

#### Acceptance criteria

1. `check_in_hotel_reservation` is still the only status writer.
2. Blockers prevent the RPC.
3. Sibling unit status and progress are unchanged.
4. Duplicate complete does not double-apply the transition.
5. The transaction decision below is implemented as option A unless option B is explicitly chosen later.

#### Dependencies

B05 and B06. B01.2 for the stamp row.

#### Risks

The crash window in the decision below. Hiding it by returning success before the stamp, or by retrying the RPC, is worse.

#### Frontend dependency

The complete action waits for B07. Step 5 can show B05 before the button is wired.

### DECISION REQUIRED — B07 transactionality

`completeFoCheckIn` calls `check_in_hotel_reservation` and then updates `fo_checkin_progress.completed_at`. Those are two database transactions. Postgres runs one RPC in one transaction. A later supabase-js update is not inside that transaction. This plan does not claim the two writes can be made atomic while they stay separate calls. “Same success path” means the TypeScript command’s sequence, not one commit.

Options:

- **A. Recommended. Unit status is the completion fact. The progress stamp is reconcilable.** The unit row written by `check_in_hotel_reservation`, and its `check_in` history row, are authoritative. `completed_at` is a cache. If the RPC commits and the stamp fails, do not call the RPC again (`INVALID_TRANSITION` on a second attempt). Return `checked_in_stamp_pending`. A later read that sees that unit `checked_in` writes the missing stamp once. Siblings are untouched because the RPC updates one unit. The current function body stays unchanged. The crash window remains; it is visible and repairable.
- **B. One new wrapper RPC.** A new security-definer function calls `check_in_hotel_reservation` and then updates that unit’s progress row in the same function body. That is one transaction. It is not an edit of `check_in_hotel_reservation`. It is still a new migration. Do not describe it as the current TypeScript command’s single transaction.
- **C. Rejected. Rewrite `check_in_hotel_reservation` so it updates `fo_checkin_progress`.** The audit says not to rewrite that RPC unless necessary. Option A removes that necessity.

Implement A. Adopt B only if a later product requirement demands a single commit.

Implementation status: option A. `completeFoCheckIn` runs the readiness result before `check_in_hotel_reservation`. A stamp failure returns `checked_in_stamp_pending` and does not call the transition again. A later readiness read fills a missing stamp. The SQL function is unchanged.

## 12. Data migration plan

Only two migrations are required.

**Unit progress.** Purpose: one live progress row per unit. Concept: uniqueness on reservation plus unit; null unit id only when there are no unit rows. Backfill a one-unit reservation onto that unit. Do not copy waivers or `completed_at` onto every unit of a multi-unit reservation. Keep the old multi-unit row for history and exclude it from live reads. Rollback: restoring the old unique constraint fails if two unit rows already exist, so rollback must run before multiple unit rows are inserted, or it must merge by hand under an explicit operator step. Do not auto-merge siblings.

**Agreement version and signed instance.** Purpose: section 8. No backfill of signatures. Existing stays stay unsigned. Versions are immutable once referenced. Rollback before any signature: drop the new tables. Rollback after signatures: do not drop the instance table; stop writing and keep the rows for audit.

No migration for deposit, documents, or `check_in_hotel_reservation`.

## 13. Read model plan

| Read | Inputs | Owner | Sources | Unit scope | Staleness | Permission |
|------|--------|-------|---------|------------|-----------|------------|
| Workspace aggregate | restaurant, reservation, unit id per B01 | Front Office | units, occupants, room, packages, display read | Target unit; siblings are summary only | Refetch after assign, guest, or type change | `requireReservationManager` |
| Registration | target guest from B01 | Guest Profile via Front Office | profile, `guest_documents`, field rules | Guest of that unit | Refetch after save or `reviewGuestDocument` | reservation manager to read; guest manager to verify |
| Financial readiness | restaurant, reservation | Cashiering lines, Front Office projection | folio, `deposit` lines, snapshot, `guarantee_method` | Reservation folio, labeled as such | Refetch after post | reservation manager |
| Agreement state | target unit and guest | Property Setup version, Front Office instance | version row, signed instance | Unit | Refetch after sign | reservation manager |
| Final readiness | same as workspace | Front Office | the four reads plus room readiness and key | Unit, with reservation-level money labeled | Must be recomputed inside B07, not cached from page load | reservation manager |

Do not cache `canCheckIn` across the complete call.

## 14. Command plan

| Command | Owner | Validation | Unit scope | Audit | Reuse |
|---------|-------|------------|------------|-------|-------|
| Update registration | Guest Profile writer, Front Office orchestration | `validateGuestCheckInRequirements` inputs; no master occupancy amend | Target guest from B01 | `profile_updated` | Existing guest update. Not `saveCheckInRegistration`’s amend path |
| Verify identity | Guest Profile | `reviewGuestDocument` | Document’s guest id must be the target guest | `document_verified` / `document_rejected` | `reviewGuestDocument` |
| Post deposit | Cashiering | cashier operator, tender catalogue, idempotency key | Folio is reservation-level; progress method is the unit row | folio transaction; progress method | `postCheckInDeposit` after the `ledgerMethod` repair |
| Save agreement | Front Office | unsigned instance, known version id | Unit | history with version and unit | none |
| Capture signature | Front Office | instance not yet signed, guest and unit match | Unit | immutable instance | none |
| Authorize waiver | Front Office store, Security role | `requireSupervisor`, non-empty reason, waivable requirement only | Unit | history plus waiver columns | `waiveCheckInRegistration`, `waiveCheckInDeposit`, `waiveCheckInKey` retargeted |
| Complete | Front Office, SQL transition | B05 blockers empty | Unit id required when units exist | RPC `check_in` history | `check_in_hotel_reservation` |

## 15. Test plan

Unit targeting: one unit; two units; missing unit id fails closed; sibling status, guest, and progress stay unchanged; primary guest resolution; booker fallback labeled and not applied to the other unit.

Registration: required fields from `validateGuestCheckInRequirements`; update hits the target guest; no `amend_hotel_reservation`; document expiry blocks; verification status is not forced to `valid`; duplicate search does not insert.

Financial: a posted `deposit` counts; a `payment` does not; partial deposit blocks; full deposit satisfies; waiver satisfies only that unit after B06; cashier role required; `ledgerMethod` absent; one folio for the second unit.

Agreement: version id, guest id, and unit id match the target; acknowledgements are the submitted snapshot; signed row rejects update; consent and email signature unused.

Readiness: each blocker; warnings do not grant `canCheckIn`; overrides clear only waivable codes; stale room is `ROOM_NOT_ELIGIBLE`; key is a side blocker.

Overrides: receptionist denied; owner or manager allowed; unit 1 waiver does not clear unit 2; expired document still blocks.

Complete: one unit checks in; sibling stays `confirmed`; second complete does not transition again; blockers skip the RPC; history includes the unit; stamp failure returns `checked_in_stamp_pending` and does not retry the RPC; a later read fills the stamp; completion is not reservation-global.

## 16. Implementation sequence

Phase A — read the unit without a migration.

- B01.1 aggregate read and tests for target id, primary guest, and sibling room.

Phase B — progress shape.

- B01.2 migration concept applied in a later implementation prompt, plus read tests. No UI persistence before this.

Phase C — identity and the deposit write, independently testable.

- B02 registration and document read. Retire scalar identity use and the occupancy amend.
- B03.1 tender repair on `postCheckInDeposit`.

Phase D — money meaning.

- B03.2 deposit-credit sum and the replacement of the `fo-check-in.test.ts` payment-only assertion. Same change set. Do not leave the old test green by keeping the old helper.

Phase E — agreement.

- B04 version row and immutable signed instance. No Check-In UI signature before the read exists.

Phase F — decision object.

- B05 readiness, including key as a side section and agreement as a blocker.

Phase G — waivers, then complete.

- B06 unit waivers.
- B07 complete using option A. Do not start B07 until B05 is the gate inside the command.

Each item above is one implementation prompt. Do not combine B03.2 with B04, or B07 with a rewrite of `check_in_hotel_reservation`.

## 17. Frontend readiness gates

| UI Step | Backend prerequisite | Can frontend begin? | Notes |
|---------|----------------------|---------------------|-------|
| 1. Guest & Reservation | B01.1 | Yes, after B01.1 | Display and existing assign/occupant commands only. Do not persist check-in state. |
| 2. Registration | B02 | No until B02 | B01.1 can show the guest. Edits and document verification wait. |
| 3. Payment & Guarantee | B03.2 | No until B03.2 | B03.1 is not a sufficient contract. Guarantee stays informational. |
| 4. Agreement & Signature | B04 | No until B04 | Do not store a signature only in the browser. |
| 5. Review & Check-In | B05 and B07 | Review layout after B05. Complete action after B07 | Do not enable Complete on client-side booleans. Key appears inside this step, not as a sixth stage. Waiver actions wait for B06. |

## 18. Documentation updates during implementation

Do not edit these during this planning task. After each increment, update only the doc that already owns that behavior:

- This file, `docs/pms/check-in-backend-gap-audit.md`, with a short status note per shipped increment.
- `docs/pms/front-office-workspace-implementation-plan.md` when the check-in command contract changes.
- `docs/pms/cashiering-workspace-implementation-plan.md` when deposit-received for check-in is defined as deposit credits.
- `docs/pms/specs/guest-profile-module.md` when Check-In stops writing scalar identity and calls `reviewGuestDocument`.
- `docs/architecture-ownership.md` only if a new Front Office agreement instance is added, to record that Property Setup owns the version and Front Office owns the signed instance.

## 19. Deferred / not part of this implementation

Not required for the five-step backend, and not supported as existing Check-In capabilities:

- OCR or extraction from an identity image.
- A scanner or signature-pad driver. `guest_documents.storage_path` remains the upload reference. Signature method `drawn` is enough.
- Vendor identity verification.
- Online pre-check-in, kiosk, or mobile guest signing.
- Payment-terminal hardware. Card authorization stays absent, as `fo-arrival.ts` already states.
- A guarantee-satisfied rule, company billing changes to the deposit gate, or a per-unit folio.
- Redesign of Cashiering, Guest Profile, or Room & Inventory.
- Deleting `guest_profiles.id_document_*` or the key commands.
- Rewriting `check_in_hotel_reservation` (option C). Option B stays deferred unless a single commit is required later.

## 20. Final implementation checklist

### B01.1

- [ ] Unit aggregate read with required unit id when several units exist
- [ ] Primary guest from `hotel_reservation_room_guests`, booker fallback labeled
- [ ] Target room from the unit, not master `room_id`
- [ ] Sibling list does not copy sibling packages or occupants onto the target
- [ ] Room list still uses `listAssignableRooms` and `listReservationRoomDisplay`

### B01.2

- [ ] Progress uniqueness is reservation plus unit
- [ ] Null unit id only when there are no unit rows
- [ ] Single-unit backfill keeps existing flags
- [ ] Multi-unit legacy row is not copied onto every unit

### B02

- [ ] Registration updates the target guest through Guest Profile
- [ ] No `amend_hotel_reservation` from registration save
- [ ] Check-In validates `guest_documents` and does not force `status: "valid"`
- [ ] Scalar `id_document_*` are not the Check-In source of truth
- [ ] `reviewGuestDocument` and `findGuestDuplicates` are reused, not reimplemented
- [ ] Verification-as-blocker decision recorded; recommended warning unless an existing type rule requires verification

### B03.1

- [ ] `deposit_method` stores `tender.stored`
- [ ] `ledgerMethod` is not referenced
- [ ] Idempotency key still prevents a second post

### B03.2

- [ ] Received amount sums `deposit` lines
- [ ] `payment` lines do not satisfy the check-in deposit gate
- [ ] `fo-check-in.test.ts` payment-only assertion is updated in the same increment
- [ ] `guarantee_method` is informational and does not block
- [ ] Second unit does not open another folio

### B04

- [ ] Property Setup agreement version is immutable once signed
- [ ] Front Office signed instance stores version, guest, reservation, unit, acknowledgements, staff, time, and signature reference
- [ ] Re-sign inserts a new row
- [ ] Consent columns and email signature columns are unused

### B05

- [ ] One readiness result with blockers, warnings, overrides, and `canCheckIn`
- [ ] Key is a side blocker, not a sixth stage
- [ ] Early arrival does not pretend an approval inbox exists
- [ ] Missing agreement is a blocker

### B06

- [ ] Owner or manager required on the server
- [ ] Receptionist cannot waive
- [ ] Registration, deposit, and key waivers are stored on the target unit
- [ ] Field rules, document expiry, room eligibility, room readiness, unit status, agreement, and signature are not waivable

### B07

- [ ] B05 runs immediately before `check_in_hotel_reservation`
- [ ] Blockers skip the RPC
- [ ] The SQL function body is unchanged
- [ ] Sibling unit stays `confirmed`
- [ ] Duplicate complete does not transition again
- [ ] Option A: status is authoritative; stamp failure returns `checked_in_stamp_pending` and does not retry the RPC
- [ ] Option A stated as not database-atomic with the progress update
- [ ] Option B and C are not implemented

CHECK-IN IMPLEMENTATION PLAN: COMPLETE

## Check-In frontend Step 1

CHECK-IN FRONTEND STEP 1: PASS

Workspace: `src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx`

Read model: `getCheckInUnit`

Focused tests: `src/packages/pms/lib/fo-checkin-v2-workspace.test.ts` — 17 passed. Existing `fo-check-in-workspace.test.ts` — 19 passed.

ESLint: PASS on the touched frontend files.

Production build: PASS (`npm run build`).

Backend changes: NONE

Known remaining work: Step 2 — Registration

## Check-In frontend Step 2

CHECK-IN FRONTEND STEP 2: PASS

Workspace: `src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx`

Registration component: `src/packages/pms/components/frontoffice/fo-checkin-v2-registration.tsx`

Read: `getCheckInRegistration`

Commands: `saveCheckInUnitRegistration`, `searchCheckInGuestDuplicates`, `reviewGuestDocument`

Focused tests: `src/packages/pms/lib/fo-checkin-v2-registration.test.ts` — 20 passed.

ESLint: PASS on the touched frontend files.

Production build: PASS (`npm run build`).

Backend changes: NONE

Known remaining work: Step 3 — Payment & Guarantee

## Check-In frontend Step 3

CHECK-IN FRONTEND STEP 3: PASS

Workspace: `src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx`

Payment component: `src/packages/pms/components/frontoffice/fo-checkin-v2-payment.tsx`

Read: `getCheckInDepositReadiness`

Commands: `postCheckInDeposit`, `waiveCheckInDeposit`

Focused tests: `src/packages/pms/lib/fo-checkin-v2-payment.test.ts` — 24 passed. Existing Check-In v2 tests — 37 passed.

ESLint: PASS on the touched frontend files.

Production build: PASS (`npm run build`).

Backend changes: NONE

Known remaining work: Step 4 — Agreement & Signature

## Check-In frontend Step 4

CHECK-IN FRONTEND STEP 4: PASS

Workspace: `src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx`

Agreement component: `src/packages/pms/components/frontoffice/fo-checkin-v2-agreement.tsx`

Read: `getCheckInAgreement`

Commands: `saveCheckInAgreement`, `captureCheckInAgreementSignature`, `beginCheckInAgreementResign`

Signature path: `signatureStoragePrefix` on the existing `property-images` bucket. No dedicated signature upload server function exists.

Focused tests: `src/packages/pms/lib/fo-checkin-v2-agreement.test.ts` — 26 passed. Existing Check-In v2 tests — 61 passed.

ESLint: PASS on the touched frontend files.

Production build: PASS (`npm run build`).

Backend changes: NONE

Known remaining work: Step 5 — Review & Check-In
