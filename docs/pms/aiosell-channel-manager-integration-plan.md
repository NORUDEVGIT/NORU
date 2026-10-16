# Aiosell Channel Manager Integration Plan

| Field | Value |
|---|---|
| Status | Living implementation plan |
| This run | AIOS-07 Aiosell operator controls on the existing Distribution route. Property-details parsing matches the observed sandbox body. Connection validation runtime verification remains pending until the browser retest. |
| Migration | `0162`, `0163`, and `0164` are applied. The channel hotfix for `apply_external_reservation_event` is applied. No AIOS-06 migration. Next unused number is `0165`. |
| Contract | Supplied Aiosell context file. If that file does not state a behavior, the finding is: Not specified in supplied Aiosell contract. |

Do not start a later increment from this file until that increment is explicitly commissioned. AIOS-02 through AIOS-07 are implemented. `0162`, `0163`, and `0164` are applied. No AIOS-07 migration. AIOS-03 manual database verification was deferred and is not PASS. AIOS-04 real NORU → Aiosell HTTP verification was not run. AIOS-05 live core verification passed, with modify, cancel, multi-room, and Webhook Tester still deferred. AIOS-06 is implementation pass with external runtime verification debt. Overall status: IMPLEMENTATION COMPLETE / RUNTIME VERIFICATION PENDING. No phase after AIOS-07 was started.

## Architecture principles

Distribution is an adapter. It translates the Aiosell contract into existing NORU commands and reads.

- Distribution never owns inventory math. Availability stays `pms_room_type_availability`.
- Distribution never owns rate calculation. Nightly price stays the rate calendar, else the rate-plan base rate.
- Distribution never directly mutates reservation tables. Create, amend, cancel, and no-show go through the existing service-role commands.
- Distribution never posts Cashiering transactions. OTA amounts are booking metadata.
- One Aiosell booking with several rooms becomes one NORU master reservation plus N room units. The contract does not require child reservations.
- `bookingId` is idempotent inside restaurant, provider, `hotelCode`, and `channel`.
- An Aiosell modify is the complete new booking, not a patch.
- OTA nightly `sellRate` values are preserved. A modify must not silently replace them with the current NORU rate calendar.
- A guest-less OTA booking is an MVP backend gap and must be solved deliberately.
- Credit-card decryption and storage are out of MVP.
- Partner secrets must not go in `pms_integrations.config`.
- No FX conversion is part of the current Aiosell contract.
- No-show outbound is only for the channels the Aiosell file documents.
- Messaging is later scope.
- Do not create an 11th PMS module. Distribution stays the existing non-nav route. Settings Card 6 stays the connection surface.

## Aiosell identity hierarchy

These identities are separate. Do not store one in the column of another.

| Identity | Scope | Meaning |
|---|---|---|
| `partnerId` / `{pms}` | Partner | URL slug and the `partnerId` query on property details. `sample-pms` is the sample slug. |
| Basic Auth username and password | Partner secret | Issued after partner onboarding. One pair for the partner. Not specified as per-hotel. |
| `hotelCode` | Property | Value sent on pushes and webhooks. Property-details `hotel_id` is this code. `sandbox-pms` is the docs-sandbox hotel code, not the partner slug. |
| `roomCode` | Room type | Aiosell `room_id`. A room type, not a physical room. |
| `rateplanCode` | Rate plan | Aiosell `rateplan_id`, nested under that room. |
| `bookingId` | OTA booking | Required. Named idempotency key in the contract. |
| `cmBookingId` | Optional attribute | Channel-manager itinerary id. Cannot be the only key. |
| `channel` | OTA | Booking channel, restriction `toChannels`, and no-show body. Distinct from `commercial_sales_channel` and from `distribution_channels.code`. |

Auth is HTTP Basic only. There is no bearer token, JWT, or API key in the supplied contract. The inbound webhook must validate the same Basic Auth.

## Exact endpoint contract summary

Base URL in the supplied file: `https://live.aiosell.com/api/v2/cm`. Content type is JSON. A response body is `{ success, message }`. NORU does not call or host any of these yet.

| Contract | Method and path | NORU readiness |
|---|---|---|
| Get Property Details | `GET /property_details/{hotelCode}?partnerId={pms}` | MISSING |
| Inventory Push | `POST /update/{pms}` | MISSING |
| Rate Push | `POST /update-rates/{pms}` | MISSING |
| Inventory Restrictions | `POST /update/{pms}` | MISSING |
| Rate Restrictions | `POST /update-rates/{pms}` | MISSING |
| Mark No Show | `POST /marknoshow/{pms}` | LATER |
| Fetch Inventory | `POST /data/{pms}` with `type=inventory` | MISSING |
| Fetch Rates | `POST /data/{pms}` with `type=rates` | MISSING |
| Fetch Reservations | `POST /data/{pms}` with `type=reservation` | MISSING |
| Reservation webhook | One NORU URL. `action` is `book`, `modify`, or `cancel` | MISSING |
| Channel Multiplier | `POST /channel_multiplier/{pms}` | LATER |
| Message Webhook | NORU-hosted | OUT OF MVP |
| Message Reply | `POST /message-reply/{pms}` | OUT OF MVP |

## Property and mapping model

Get Property Details returns `hotel_id`, `currency`, `timezone`, `rooms[].room_id`, nested `rateplan_id`, and `connected_channels[]` with `partner_id`, OTA `hotel_code`, `operation`, and sometimes `rate_multiplier`. The sandbox body also returns `address.location.long` and `address.location.latt` as strings, empty contact strings, an empty `tax_id`, and `operation: null`. `connected_channels` is not unique. Currency and timezone are compared with the NORU property. A mismatch is a readiness failure, not an invalid response.

| Aiosell | NORU | Reuse |
|---|---|---|
| `hotel_id` / `hotelCode` | One `restaurants` row | No column yet. Non-secret connection metadata. |
| `room_id` / `roomCode` | `room_types.id` | `distribution_room_mappings.external_room_code`. One code, one room type. |
| `rateplan_id` / `rateplanCode` | `hotel_rate_plans.id` | `distribution_rate_mappings.external_rate_code`. |
| `connected_channels` | `distribution_channels` | Channel rows exist. OTA hotel code and operation are not columns. |
| `currency` | `restaurants.currency_code` | Compare. Do not convert. |
| `timezone` | `restaurants.timezone` | Compare. Do not shift timestamps. |
| `rate_multiplier` on a channel operation | Not the Channel Multiplier API | Do not treat this field as a NORU markup engine. |

Do not invent room or rate codes. They come from this payload.

## Inventory contract

Inventory Push body:

- `hotelCode`
- `updates[]` of inclusive `startDate` and `endDate`
- `rooms[]` of `roomCode` and integer `available`

The authoritative read is `pms_room_type_availability`. It returns nightly availability for a half-open stay `[arrival, departure)`. An Aiosell end date is the last night, so the adapter asks NORU for departure = end date plus one day.

One Aiosell block carries one integer for the whole range. If NORU nights inside that range differ, the adapter splits the range before the push. That split is translation only. Overbooking stays 0. Push batching does not change Rooms & Inventory and does not add a second inventory formula.

## Rate and currency contract

Rate Push body:

- `hotelCode`
- `updates[]` of inclusive `startDate` and `endDate`
- `rates[]` of `roomCode`, `rateplanCode`, and `rate`

`rate` is the nightly amount in the Aiosell property currency. NORU’s daily price is `hotel_rate_calendar`, otherwise `hotel_rate_plans.base_rate`. Plan currency is `hotel_rate_plans.currency`. Property currency is `restaurants.currency_code`.

The integration compares both with `property_details.currency`. If a mapped rate plan’s currency differs, that mapping is blocked. It is not converted. NORU has `pms_exchange_rates`. Those quotes are not used, because FX is not part of the current Aiosell contract.

The same inclusive-range rule applies. Nights with different prices are split into separate upserts.

## Restriction mapping matrix

Unset Aiosell restriction fields are sent as JSON `null`. Inventory restrictions are room-level and require `toChannels`. Rate restrictions are room plus rate plan and require `toChannels`. NORU stores stay restrictions on `hotel_rate_restrictions` per rate plan and date. Advance days sit on the rate plan, not per night. `toChannels` has no NORU column. The adapter must be given the OTA keys.

| Aiosell field | NORU | Classification |
|---|---|---|
| `stopSell` | `stop_sell` | Exact equivalent on the rate-plan row. Not a room-only flag. |
| `minimumStay` | `min_stay` | Exact on the rate restriction. Partial for a room-only push. |
| `maximumStay` | `max_stay` | Exact on the rate restriction. Partial for a room-only push. |
| `closeOnArrival` | `closed_to_arrival` | Exact on the rate restriction. Partial for a room-only push. |
| `closeOnDeparture` | `closed_to_departure` | Exact on the rate restriction. Partial for a room-only push. |
| `minimumStayArrival` | none | Missing. Do not map to `min_stay`. |
| `maximumStayArrival` | none | Missing. Do not map to `max_stay`. |
| `exactStayArrival` | none | Missing. |
| `minimumAdvanceReservation` | `min_advance_days` on the rate plan | Partial. Plan-level, not per night. |
| `maximumAdvanceReservation` | `max_advance_days` on the rate plan | Partial. Plan-level, not per night. |
| `toChannels` | none | Required by Aiosell. The adapter supplies the channel list. |

## Reservation book contract

One NORU-hosted URL receives `action` `book`, `modify`, or `cancel`.

Book fields the contract names:

- `action`, `hotelCode`, `channel`, `bookingId`, optional `cmBookingId`
- `bookedOn`, `checkin`, `checkout`, `segment`, `specialRequests`, `pah`
- `amount.amountAfterTax`, `amountBeforeTax`, `tax`, `currency`, `commission`, `tcs`, `tds`
- `guest.firstName`, `lastName`, `email`, `phone`, and address fields, all optional
- `rooms[]`: `roomCode`, `rateplanCode`, optional `guestName`, `occupancy.adults`, `occupancy.children`, `prices[].date`, `prices[].sellRate`
- optional encrypted `creditCard`

NORU create (`create_hotel_reservation_priced` / `_commercial`) can accept a commercial source label, sales-channel label, `external_reference`, `special_requests`, room units, and occupants when a `guest_id` exists. It does not store `pah`, commission, TCS, TDS, or the OTA nightly sell rates as an import snapshot.

## Multi-room OTA booking rule

An Aiosell book payload contains `rooms[]`. One booking with two rooms becomes:

- one NORU master reservation
- two `hotel_reservation_rooms`

It does not become two child reservations. NORU group create already persists one confirmation and many room units. Gaps that remain:

- each room needs a mapped room type and rate plan
- `guestName` may be absent
- infants are not in the Aiosell occupancy object
- the booking total is `amount.amountAfterTax`
- unit amounts are the sums of `prices[].sellRate` and must be snapshotted
- the lead guest is the booking guest when a usable identity exists

## Guest-optional booking gap

The contract says every guest field may be missing, null, or empty. A booking must not be rejected because guest details are unavailable.

NORU cannot do that today. `hotel_reservations.guest_id` is NOT NULL, and the priced create RPC requires `_guest_id`. There is no unnamed-guest profile. Duplicate search and guest create need a name or contact.

This is an MVP backend gap. It is not solved in this document. Later options, not chosen here, are a property-level unnamed profile, or a create path that allows a booking without a Guest Profile. The adapter must not invent a real guest from an empty payload.

## Special request handling

`specialRequests` is OTA-dependent opaque free text. Store it as plain text on `hotel_reservations.special_requests`. Do not parse it. Do not infer structure. Do not copy it into preference fields. An empty or missing value stays empty.

## OTA financial metadata boundary

`pah`, `amountAfterTax`, `amountBeforeTax`, `tax`, `currency`, `commission`, `tcs`, and `tds` are booking metadata.

- Safe later home: an external booking snapshot owned as import metadata.
- Unsafe: creating folio lines, payments, or taxes in Cashiering because these values arrived.
- `guarantee_method` is a label, not a folio posting.
- `pah` true means collect at the hotel. `pah` false means prepaid. Do not infer that from the amount.
- Current reservation columns do not hold commission, TCS, or TDS.

Distribution does not post Cashiering transactions.

## Credit-card and PCI boundary

Optional `creditCard` fields are encrypted with AES-128-ECB, hex encoded, using a 16-character partner key issued after Aiosell verification. Decrypted data must never be logged. PCI-DSS handling would be required to decrypt or store them.

NORU has no compliant card store. Credit-card decryption and storage are out of MVP. Do not decrypt. Do not persist ciphertext. Do not log the object. Do not retain the raw webhook body if it may contain the card object.

## Modify full-state rule

`action=modify` is the complete new booking on the same URL. It is not a diff and not a patch.

Future handling:

1. Find the reservation by the idempotency identity.
2. Load the current NORU booking.
3. Compare it with the complete Aiosell state.
4. Derive only the supported NORU commands.
5. Apply those commands.
6. Reject or log unsupported changes without a partial silent rewrite.

Do not call `amend_hotel_reservation_priced` for every modify.

| Change | Current NORU command | Gap |
|---|---|---|
| One room: dates, occupancy, room type, or rate plan | Amend, when the reservation has one room unit | Amend reprices from NORU and can discard `sellRate`. Price must be preserved separately. |
| More than one room: those same fields | None | `MULTI_ROOM_AMEND_UNSUPPORTED`. |
| Nightly `sellRate` | None | Must be snapshotted. Must not be replaced by the rate calendar. |
| Guest | Guest Profile commands, only when an identity exists | Empty guest stays the guest-less gap. |
| `specialRequests` | `special_requests` | Safe as plain text. |
| `pah`, amounts, commission, TCS, TDS | None | Import snapshot. Not a folio post. |

## Cancel flow

The cancel body is only `action`, `hotelCode`, `channel`, and `bookingId`.

1. Resolve restaurant from `hotelCode`.
2. Resolve the reservation from restaurant + provider `aiosell` + `hotelCode` + `channel` + `bookingId`.
3. Call `cancel_hotel_reservation_unit`.

No direct table update. A repeated cancel for an already cancelled booking is an idempotent success.

## Idempotency identity

The contract says the webhook is idempotent on `bookingId`. Across many hotels that value can collide. `cmBookingId` is optional and cannot be the sole key.

Smallest safe unique identity:

`restaurant_id` + provider `aiosell` + `hotelCode` + `channel` + `bookingId`

`external_reference` is free text and is not unique. It is not this key. A second delivery of the same book returns success and does not create another reservation.

## No-show limitation

`POST /marknoshow/{pms}` is documented for `channel` `booking.com` and `gommt` only. Expedia, Agoda, and every other channel are not specified for this call. Do not imply them.

NORU can already mark no-show locally with `mark_hotel_reservation_no_show`. The outbound notify is later, and only for those two channels.

## Channel multiplier note

`POST /channel_multiplier/{pms}` sends `hotelCode`, a factor `multiplier`, and a non-empty `channels` list. `1.2` means +20%. `0.9` means −10%. Aiosell applies the factor on top of the pushed rate. It does not replace the pushed rate.

Two future strategies, neither implemented:

- A. NORU calculates a final channel rate before the rate push.
- B. NORU pushes the property-currency base rate and, later, configures the Aiosell multiplier.

Strategy B matches the contract. Channel Multiplier is LATER. A basic rate push does not need it. The `rate_multiplier` sometimes returned on a connected-channel operation is not this API.

## Fetch and reconciliation role

`POST /data/{pms}` reads inventory, rates, or reservations by `type`. It can verify a sandbox push, support a manual reconcile, detect drift, and recover a reservation after a missed webhook. It is not specified as a realtime stream. It is not built in the first push increment. AIOS-06 owns it.

## Messaging later scope

Message Webhook and Message Reply are later and out of the initial MVP. The contract includes `conversation_id`, `message_id`, `booking_id`, `channel`, guest details, attachments, and message content. `message_id` should eventually support deduplication. Messaging is not part of reservation book.

## Logging and security rules

If an outbound request fails, surface the response body. Do not retry blindly.

A future technical log records request type, direction, property, channel, booking id when present, status, response `success`, response `message` or a body summary, attempt count, whether another attempt is allowed, and timestamps.

Do not log:

- Basic Auth username or password
- decrypted card data
- card ciphertext
- partner keys or other secrets

The partner password is a server secret, one pair for the partner. It does not go in `pms_integrations.config`, which already rejects secret-shaped keys. It does not go on `restaurants`.

## Date, null, and upsert semantics

- Dates are `YYYY-MM-DD`.
- The global rule says timestamps are `YYYY-MM-DD HH:MM:SS` with no timezone suffix. The book field table also calls `bookedOn` ISO 8601, while the sample has no suffix. Do not append `Z`. Do not convert using the property timezone.
- `startDate` and `endDate` are inclusive. NORU stay nights are half-open, so the last Aiosell night is the day before NORU departure.
- Pushes upsert the date range.
- Restriction fields that are unset are explicit JSON `null`, not omitted keys.

## Capability matrix

| Capability | Status |
|---|---|
| `partnerId` / PMS slug | MISSING |
| Basic Auth username and password | MISSING |
| `hotelCode` | MISSING |
| Property currency | PARTIAL. `restaurants.currency_code` exists. Comparison is not built. |
| Property timezone | PARTIAL. `restaurants.timezone` exists. Comparison is not built. |
| `roomCode` | PARTIAL. Mapping table exists. |
| `rateplanCode` | PARTIAL. Mapping table exists. |
| Connected channels | PARTIAL. Channel rows exist. OTA hotel code and operation do not. |
| Inventory push | MISSING |
| Rate push | MISSING |
| Inventory restrictions | MISSING |
| Rate restrictions | MISSING |
| Fetch inventory, rates, reservations | MISSING |
| Book webhook | MISSING |
| Modify webhook | MISSING |
| Cancel webhook | MISSING |
| `bookingId` idempotency | MISSING |
| `cmBookingId` | MISSING as an optional attribute |
| Guest optionality | MISSING |
| Multi-room booking | PARTIAL. Group room units exist. Import path does not. |
| Nightly OTA prices | MISSING |
| `pah` and amount fields | MISSING as metadata |
| Commission, TCS, TDS | MISSING as metadata |
| `specialRequests` | PARTIAL. `special_requests` can hold the text. |
| Credit-card handling | OUT OF MVP |
| No-show outbound | LATER. `booking.com` and `gommt` only. |
| Channel multiplier | LATER |
| Message webhook and reply | OUT OF MVP |
| Sync logging and retry policy | PARTIAL. `distribution_logs` has no attempt policy. |
| Reconciliation | MISSING |

## Source-of-truth matrix

| Concern | Owner |
|---|---|
| Property master, currency, timezone | Property / `restaurants` |
| Room inventory formula | Rooms & Inventory via `pms_room_type_availability` |
| Rate calendar and restrictions | Rate & Revenue |
| Reservation business state | Reservations, through create, amend, cancel, and no-show commands |
| Guest master | Guest Profile |
| Cashiering ledger | Cashiering |
| Provider connection metadata | Distribution |
| External hotel, room, and rate codes | Distribution |
| External booking identity | Distribution |
| Technical sync state and logs | Distribution |

Distribution reads the owning modules and calls their commands. It does not replace them.

## Sandbox readiness

Aiosell testing availability and NORU implementation readiness are separate.

| Test | Aiosell | NORU |
|---|---|---|
| Connect one hotel | Real credentials arrive after onboarding. Docs sandbox hotel code is `sandbox-pms`. | NOT READY |
| Map one room and one rate | Property details once credentials exist. | PARTIAL tables, no Aiosell writer |
| Push inventory | READY IN DOCS SANDBOX | NOT READY |
| Push one BAR rate | READY IN DOCS SANDBOX | NOT READY |
| Fetch inventory | Documented `POST /data/{pms}` | NOT READY |
| Fetch rate | Documented `POST /data/{pms}` | NOT READY |
| Push one restriction | Documented. Missing NORU fields stay null. | NOT READY |
| Receive one book | Webhook Tester | NOT READY |
| Receive the same book again | Webhook Tester | NOT READY |
| Receive one modify | Webhook Tester | NOT READY |
| Receive one cancel | Webhook Tester | NOT READY |
| Read the reservation back | Documented reservation fetch | NOT READY |

The integration can be built against placeholders before partner onboarding. Do not hard-code real credentials.

## Minimum future data additions

Reuse `distribution_channels`, `distribution_room_mappings`, `distribution_rate_mappings`, `distribution_logs` as a technical log base, `pms_integrations` for non-secret metadata, `pms_room_type_availability`, `hotel_rate_calendar`, `hotel_rate_restrictions`, and the reservation commands. Do not duplicate them. Do not add provider columns to `hotel_reservations`.

| Addition | Class |
|---|---|
| Partner slug in non-secret metadata, password in a server secret | REQUIRED FOR SANDBOX |
| Non-secret `hotelCode` on the property connection | REQUIRED FOR SANDBOX |
| Writes into the existing room and rate mapping tables | REQUIRED FOR SANDBOX |
| Inclusive-range translator in the adapter | REQUIRED FOR SANDBOX |
| Unique external reservation map on restaurant, provider, `hotelCode`, `channel`, `bookingId` | REQUIRED FOR MVP |
| Inbound event log that omits secrets and cards | REQUIRED FOR MVP |
| Deliberate guest-less booking path | REQUIRED FOR MVP |
| Import snapshot for `pah`, amounts, commission, TCS, TDS, and nightly `sellRate` | REQUIRED FOR MVP |
| Channel multiplier configuration | LATER |
| No-show notify for `booking.com` and `gommt` | LATER |
| Fetch reconciliation | LATER |
| Arrival-only stay fields | LATER |
| FX conversion | NOT REQUIRED |
| Card decryption or storage | NOT REQUIRED for MVP |
| Messaging tables | LATER |
| An 11th PMS navigation module | NOT REQUIRED |

## MVP versus later scope

MVP:

- Get Property Details and store `hotelCode`, room codes, and rate codes.
- Inventory push and rate push in the property currency, with currency mismatch blocking the rate.
- Restriction push of the fields NORU stores, with explicit nulls for the rest, and a supplied `toChannels` list.
- Book, idempotent repeat, supported single-room modify, and cancel.
- Preserve OTA nightly sell rates.
- Solve guest-less create deliberately before calling the current RPC with an invented guest.

Later:

- Channel Multiplier.
- Mark No Show for `booking.com` and `gommt` only.
- Fetch inventory, rates, and reservations for reconcile and missed-webhook recovery.
- Arrival-specific restriction fields if NORU later stores them.

Out of initial MVP:

- Credit-card decryption and storage.
- Message Webhook and Message Reply.

## Regression risks

- Changing `pms_room_type_availability` or the amend command for Aiosell would change New Reservation and Front Office. The adapter translates. It does not replace those commands.
- Making `external_reference` unique would reject current free-text references. The booking map is a separate key.
- Creating a Guest Profile for every empty payload would pollute the guest master.
- Calling amend on every modify would reprice OTA sell rates from the rate calendar and would fail multi-room changes.
- Logging raw webhook bodies could retain card ciphertext.
- Putting the partner password in `pms_integrations.config` violates the existing secret rejection and the contract’s partner-level secret.
- Using `pms_exchange_rates` would invent FX the Aiosell contract does not provide.
- Adding Distribution to the locked ten-item PMS bar would break the navigation contract.

## Implementation sequence

Each later increment stays closed until it is explicitly commissioned. AIOS-02 through AIOS-05 are recorded below. Do not start AIOS-06 from this file.

### AIOS-02 — Contract adapters and external booking identity

Status: implemented in code. Migration `0162` is written and not applied.

Schema added:

- `pms_external_reservation_mappings` for the external booking identity.
- `pms_distribution_sync_events` for technical inbound and outbound events.
- `distribution_channels`, `distribution_room_mappings`, `distribution_rate_mappings`, `distribution_logs`, and `pms_integrations` were not changed.
- `hotel_reservations.external_reference` was not changed and is not unique.

Unique key, enforced in the database:

`restaurant_id` + `provider` + `hotel_code` + `channel` + `external_booking_id`

`cm_booking_id` is nullable and is not part of the key. The same booking id may exist for another property or another channel. The same identity cannot point at two NORU reservations. A repeat of the same identity and the same reservation returns the existing row and does not reassign it. A reservation from another property is rejected by `EXTERNAL_RESERVATION_PROPERTY_MISMATCH` and by the composite foreign key `(reservation_id, restaurant_id) → hotel_reservations (id, restaurant_id)`.

Contract types and runtime validation live in `src/packages/pms/lib/distribution/aiosell-contract.ts`. Zod parses book, modify, cancel, property details, inventory push, rate push, restriction pushes, fetch selectors, and `{ success, message }`. Guest fields, `cmBookingId`, `specialRequests`, and room `guestName` may be missing, null, or empty. Date values stay Aiosell strings. Omitted restriction fields parse as JSON null. `creditCard` is removed before parsing and is not on the parsed type.

The mapping service is `createExternalReservationMapping` and `findExternalReservationMapping`. The database writer is `create_external_reservation_mapping`, executable by `service_role` only. It does not call reservation create, amend, or cancel.

Logging decision: `distribution_logs` stays as it is. It has no direction, provider, text booking id, attempt count, or retry flag, and `payload_summary` could hold a webhook body. The new sync-event table stores a response message only. It has no payload, Basic Auth, or card column.

Import snapshot decision: deferred to AIOS-05. `pah`, amount fields, commission, TCS, TDS, and nightly `sellRate` are parsed on the contract type and are not stored. Nothing is posted to Cashiering.

Tests: `aiosell-contract.test.ts` and `external-reservation-mapping.test.ts`.

No network client, webhook, credential, or ARI push was added in AIOS-02.

Remaining AIOS-02 debt: a repeated create does not backfill `cm_booking_id` onto an existing row. Guest-less reservation create is still unsolved. The in-memory mapping tests mirror the SQL rules.

### AIOS-03 — Connection metadata and room/rate mappings

Status: implemented in code. Migration `0163` is applied. Manual database verification was deferred at operator direction and is not PASS.

Schema reused:

- `pms_integrations` for the Aiosell connection. New nullable columns: `partner_slug`, `external_property_code` (the hotelCode), `last_validated_at`, `last_error`.
- `distribution_room_mappings.external_room_code` for the Aiosell room type code.
- `distribution_rate_mappings` for the rate plan, with new `external_room_code` for the room the rate plan is nested under.
- `distribution_channels` for OTA rows, with `channel_property_code` and `external_operations`.

One enabled Aiosell connection per restaurant, provider, and environment is enforced by `pms_integrations_aiosell_active_unique`. Sandbox and production are separate rows. Partner slug and hotelCode are different columns and are stored exactly. Provider text `Aiosell` folds to `aiosell`. No other identifier is case-folded.

Room and rate mappings hang on a NORU anchor channel, `aiosell.sandbox` or `aiosell.production`. That code is not an Aiosell OTA key. The anchor exists because the mapping tables are channel-scoped, while Aiosell room and rate codes are property-level. One external room code maps to one room type on that anchor. A physical room id is rejected.

A rate mapping is accepted only when the NORU rate plan's room type already has a room mapping whose room code is the supplied Aiosell room code. A different room is `WRONG_ROOM_RATE_PLAN`. The same rate code cannot point at two rate plans.

Currency and timezone checks are exact string comparisons. A mismatch blocks `readyForOutboundAri`. No FX conversion runs, and `pms_exchange_rates` is not used. Validation does not change the property or the rate plan.

Connected channels store the exact `partner_id`, one OTA property code, and the operation names seen for that channel. A per-operation `rate_multiplier` is not stored. That remains later. `commercial_sales_channel` and `pms_distribution_channel_posture` are not used as the Aiosell channel key.

`projectAiosellConnectionRead` is a local readiness projection. It does not call Aiosell. Outbound ARI is ready only when the connection, partner slug, hotelCode, environment, one room mapping, one valid rate mapping, currency, and timezone all pass. Credentials and HTTP reachability are not checked.

`pms_integration_config_is_safe` was not weakened. The Aiosell writer also rejects username, authorization, and card-shaped config keys. The writer does not put a password in `config`. `auth_method` may be `basic`, which names the future scheme and is not a secret.

Tests: `aiosell-connection.test.ts`.

No network client, webhook, reservation import, or ARI push was added in AIOS-03.

Remaining AIOS-03 debt: manual database verification of `0163` was deferred and is not PASS. Card 6 and the Distribution workspace were not given a connection form. A repeated connected-channel operation cannot store a different `rate_multiplier` per operation. An existing Card 6 mapping row with an empty external code is not adopted automatically.

### AIOS-04 — Outbound Aiosell sandbox ARI

Status: client implemented. No new migration. Real NORU → Aiosell HTTP verification was not run.

The server-only client is `createAiosellClient`. Base URL is `https://live.aiosell.com/api/v2/cm`. Basic Auth is built from `AIOSELL_BASIC_AUTH_USERNAME` and `AIOSELL_BASIC_AUTH_PASSWORD`. Those values are not written to `pms_integrations`, restaurants, or distribution rows. The partner slug and hotelCode come from the AIOS-03 connection row. A missing secret returns `AIOSELL_CREDENTIALS_MISSING` and does not echo the missing value. There is no default environment. Requests time out after 15 seconds. A failed response body is surfaced. There is no retry loop.

Endpoints used: property details, inventory push, rate push, rate-restriction push, and fetch inventory/rates for a manual check. No-show, channel multiplier, message reply, and reservation fetch are not called.

Property details are parsed and compared. `hotel_id` must equal the configured hotelCode. Currency and timezone use the AIOS-03 exact comparisons. A mismatch blocks the push and does not change NORU mappings, currency, or timezone.

Inventory reads `pms_room_type_availability` through `getRoomTypeAvailabilityCompat` and uses the nightly rows. An inclusive Aiosell date asks NORU for departure the next day. Equal adjacent counts are compressed. Different counts stay split. A negative count is rejected. A missing room mapping is rejected. NORU room type ids are not sent as room codes.

Rates use `hotel_rate_calendar` for a date and `hotel_rate_plans.base_rate` when that date has no calendar row. Amounts use the existing two-decimal money rounding. A currency mismatch blocks the push. No exchange-rate table is used.

Restriction decision: NORU restrictions are per rate plan and date, so only the rate-restriction push is sent. Room-level inventory restrictions are not fabricated. Supported fields map from `stop_sell`, `min_stay`, `max_stay`, `closed_to_arrival`, and `closed_to_departure`. Arrival-only stay fields and advance fields are JSON null. A date with no restriction row sends null for the supported fields too. `toChannels` uses connected OTA codes and never `aiosell.sandbox` or `aiosell.production`. If none remain, the restriction push is not sent.

`prepareAiosellInventoryPush`, `prepareAiosellRatePush`, and `prepareAiosellRateRestrictions` return the payload without an HTTP call. A real push writes one append-only `pms_distribution_sync_events` row afterwards. Attempt count is 1 and retry is not eligible. The response summary is scrubbed of the username, password, and Basic header.

Tests: `aiosell-ari.test.ts` and `aiosell-client.test.ts`, with a mocked transport.

Docs-sandbox verification: not run from NORU. Real NORU → Aiosell call: not verified. Partner credentials were not present for this run.

No reservation webhook or booking import was added. AIOS-05 was not started.

Remaining AIOS-04 debt: no real authenticated call, no operator UI, and no retry worker. Reservation fetch is AIOS-06. AIOS-03 manual database verification remains deferred.

### AIOS-05 — Inbound reservation webhook

Status: implementation pass. Live core verification passed. The Aiosell Webhook Tester was not exercised.

Live core verification passed for one single-room booking: nightly `sellRate` snapshot, external mapping, external snapshot, folio shell, and history. A duplicate book stayed idempotent. A guest-less book created `External guest` with `profile_origin = external_provisional`. The live `channel` ambiguity hotfix passed: the function uses `channel_key`, and the mapping lookup uses `m.channel = channel_key`. Modify, cancel, multi-room, and Webhook Tester end-to-end cases remain deferred for final readiness.

One route receives book, modify, and cancel:

`POST /api/pms/distribution/aiosell/reservations`

Basic Auth uses `AIOSELL_BASIC_AUTH_USERNAME` and `AIOSELL_BASIC_AUTH_PASSWORD`. The comparison uses `timingSafeEqual`. A failed check returns HTTP 401 before the payload is processed. The Authorization header is not logged.

`hotelCode` must match exactly one enabled Aiosell connection. Zero matches and more than one match are rejected. The incoming `channel` and `bookingId` are stored exactly. `aiosell.sandbox` and `aiosell.production` are not accepted as the OTA channel. Room and rate codes resolve through the AIOS-03 mappings. A missing or cross-room mapping rejects the event.

Book is idempotent on restaurant, provider, hotelCode, channel, and bookingId. A duplicate returns the existing reservation and does not create another guest, room unit, folio, or mapping. The database identity lock is `pg_advisory_xact_lock`, with the AIOS-02 unique constraint as the backstop.

Guest data is optional. A supplied name is stored on a new `guest_profiles` row with `profile_origin = external_provisional`. When every name field is absent, `first_name` is the technical label `External guest`. No email, phone, or address is invented. OTA guests are not matched to an existing profile by name, phone, or masked email. `hotel_reservations.guest_id` stays required. A verified `staff` profile is not overwritten when a later modify omits guest fields. The external snapshot keeps the OTA guest fields separately.

One booking creates one master reservation. One room is `reservation_mode = single`. More than one room is `group`, with one `hotel_reservation_rooms` row per Aiosell room. No physical room is assigned. The initial status is `confirmed`. Source is the existing value `future_online`. Checkout stays the exclusive departure date.

Each room unit stores the OTA `sellRate` on the existing `nightly_rate_snapshot` as `{ date, rate, source: "external" }`. `price_hotel_stay` is not called. Amount, commission, tax, TCS, TDS, and `pah` are columns on `pms_external_reservation_snapshots`. They do not create folio transactions or payments. One empty folio shell is opened for the master. `specialRequests` is copied as text. `bookedOn` stays on the snapshot. NORU `created_at` stays the ingest time. `cmBookingId` is stored when present and is not rewritten by a duplicate book.

Modify is a full replacement of dates, room units, occupancy, nightly sell rates, amount, pah, and special requests on the same reservation id, confirmation number, and folio. A checked-in, checked-out, cancelled, or no-show reservation returns a status conflict and is not rewritten. An identical modify is idempotent.

Cancel calls `cancel_hotel_reservation_unit` with the reason `Cancelled by OTA via Aiosell` for each pending or confirmed unit. A second cancel is success with no extra effect. Checked-in and checked-out stays are not regressed. Inventory rows are not updated by this adapter. Availability continues to read reservation room units.

`creditCard` is removed before parsing and before the database call. The snapshot may store `credit_card_present`. Ciphertext is not stored. The raw webhook body is not stored. Inbound `pms_distribution_sync_events` rows keep provider, action, channel, booking id, and a short message.

Webhook Tester: not tested. A public URL was not configured in this run. Send book, modify, and cancel to the route above with Basic Auth. A processed call returns `{ "success": true, "message": "..." }`. Inspect the reservation by the returned confirmation flow in Front Office. Do not send a live card payload to a log.

Remaining AIOS-05 debt: Webhook Tester was not run. Modify, cancel, and multi-room live cases remain for final readiness. AIOS-03 manual database verification remains deferred. The AIOS-04 real NORU → Aiosell call remains unverified.

### AIOS-06 — Fetch, reconciliation, and supported no-show

Status: implementation pass with external runtime verification debt. No migration. No UI. No scheduler.

`reconcileAiosellPropertyReservations` is the server entry. It takes one property, an explicit sandbox or production environment, and an inclusive `startDate`/`endDate`. It calls `POST /data/{pms}` with `type=reservation`, `hotelCode`, `startDate`, and `endDate`. The contract returns an array of reservation objects. There is no cursor, limit, or page field. One response is the window Aiosell returned, not complete historical truth. The contract does not name which reservation date the window filters.

Each array item is parsed with the AIOS-05 book, modify, or cancel schema and normalized by `normalizeAiosellStayCommand`. The writer remains `apply_external_reservation_event`. AIOS-06 does not insert reservation rows itself.

Outcomes:

- No external mapping: writer action `book`.
- Mapping exists and the AIOS-05 fingerprint matches the stored snapshot: unchanged. The writer is not called.
- Mapping exists and the fingerprint differs: writer action `modify` with the full fetched state.
- Array item `action=cancel`: writer action `cancel`.
- A booking that is absent from the array is not cancelled. The contract does not say absence means cancellation.

`bookedOn` is the original booking timestamp. The fetch contract has no modified timestamp, version, or status timestamp. The fingerprint blocks an identical rewrite. It does not prove the fetched copy is newer than a webhook already stored in NORU. Reconciliation does not invent an ordering key and does not roll a booking back from absence.

Room and rate codes resolve through the existing distribution mappings for that property’s Aiosell environment anchor. A missing or cross-room mapping fails that booking only. A `hotelCode` that is not the property being reconciled is `AIOSELL_PROPERTY_MISMATCH`. One item failure does not stop the other bookings. A failed fetch or missing connection fails the whole run and returns `runError`.

Sync events use `pms_distribution_sync_events`. Messages are outcome codes and counts. They do not include guest name, email, phone, address, special requests, card material, Basic Auth, or the raw Aiosell body. Card keys are stripped before the writer. `creditCardPresent` may be stored. Ciphertext is not.

`notifyAiosellReservationNoShow` calls `POST /marknoshow/{pms}` only when the reservation belongs to the property, the mapping provider is `aiosell`, and `channel` is exactly `booking.com` or `gommt`. It does not call `mark_hotel_reservation_no_show`. Front Office `completeFoNoShow` remains the local status authority.

Runtime verification: mocked fixtures only. No live Aiosell call was made.

### AIOS-07 — Operator UI and production readiness

Status: implemented. Overall Aiosell status is IMPLEMENTATION COMPLETE / RUNTIME VERIFICATION PENDING. It is not production ready.

The operator surface is the Aiosell tab on the existing Distribution route, `/restaurant/pms/distribution`. It is not a new PMS module. Owners and managers use the same Distribution authorization. There is no credential field. Credential state is `configured` or `missing`.

Save metadata writes environment, partner slug, and external hotel code through the existing connection record. Validate Connection calls property-details on the server and stores `last_validated_at` and a short `last_error`. The raw Aiosell body is not returned.

Runtime UI metadata save failed while a sandbox mapping anchor already had room mappings. Postgres reported `distribution_room_mappings_channel_fk` on `distribution_channels`. The save loaded no in-memory anchor when `integration_id` was null, minted a new channel id, then upserted `distribution_channels` on `(restaurant_id, code)` and set `id` to that new value. The referenced key change was rejected because the foreign key has no `ON UPDATE CASCADE`.

The save now looks up the integration by property, provider, and environment, and the channel by property and `aiosell.sandbox` or `aiosell.production`. An existing row is updated in place. The channel update sets `integration_id` and name only. It does not set `id`, `code`, or environment, and it does not write room or rate mappings. A missing environment anchor is inserted once. Switching sandbox to production inserts or updates `aiosell.production` and leaves the sandbox anchor and its mapping `channel_id` values unchanged. No migration was added. The foreign key was not weakened. Focused connection tests cover the existing sandbox anchor, stable channel and mapping ids, metadata updates, repeated saves, slug and hotel-code changes, and the sandbox-to-production split.

A direct Basic Auth sandbox call to `GET /property_details/sandbox-pms?partnerId=sample-pms` returned HTTP 200. Validate Connection then failed with `AIOSELL_RESPONSE_INVALID`. The current parser required `connected_channels[].operation` to be a non-empty string. The sandbox body sends `operation: null` on each connected-channel row, including duplicate rows. Address coordinates, empty contact fields, and an empty `tax_id` were not the parse failure. The property-details schema now accepts null `operation`, string `long` and `latt`, empty optional strings, and duplicate connected channels. `hotel_id`, currency, timezone, room ids, and rate-plan ids stay required. A hotel-code mismatch is still rejected. Currency `INR` or timezone `Asia/Dhaka` differing from the NORU property stays a readiness mismatch and is not reported as an invalid response. That does not make the property production ready.

New outbound sync events store a safe code such as `AIOSELL_AUTH_FAILED`, `AIOSELL_HTTP_ERROR`, or `AIOSELL_RESPONSE_INVALID`. The remote body is not written into `response_message`. Existing rows are left in place. The workspace replaces JSON-like provider text with `withheld`. Connection validation runtime verification remains pending until the browser retest. No migration was added.

Room and rate mappings use the existing distribution mapping services for the selected environment. A rate code that does not match the room type’s room mapping is rejected. Deactivate sets `active` false. Mappings are not created automatically.

The Aiosell panel lists connected OTA rows for the selected environment and does not show `aiosell.sandbox` or `aiosell.production` as OTAs. Webhook ingest accepts `channel` only when that code is an active `ota` row for the same property and environment, tied to the enabled Aiosell integration. `booking.com` is added with Add Booking.com. That insert does not change the mapping anchor or room and rate mappings. `channel_property_code` stays empty because the sandbox property-details body did not provide a Booking.com hotel code distinct from the anchor. `external_operations` stays empty because the observed operation was null. An unknown channel string is still rejected.

Sync status reads `pms_distribution_sync_events` and shows the latest validation, ARI, inbound reservation, reconciliation, and no-show rows, plus a short recent list. Messages that look like an email, card number, secret, or raw provider JSON are replaced with `withheld`.

After the sandbox property-details call succeeded, Latest error still showed `Aiosell response did not match the contract.` The view selected the newest failed row, so an older `property_details` failure stayed current after a later success. Latest error is now the newest sync event only when that event failed. A newer success clears it. A newer failure, including a different operation, is shown. Older rows stay in the recent list and are not deleted.

Run Reconciliation calls `reconcileAiosellPropertyReservations` for the current property, explicit environment, and inclusive dates. It does not run on a schedule. The panel states that the fetch window date is provider-defined and that one run is not complete history. Counts and booking id, channel, and code are shown.

Readiness is derived. It is Ready only when metadata, environment, partner slug, hotel code, server credentials, a successful validation, currency, timezone, an active room mapping, a valid rate mapping, and a public webhook address are present, and the newest sync event did not fail. A newest sync event that failed, with the other checks passing, is Attention. An older failure superseded by a newer success does not keep readiness at Attention. Anything required missing is Not ready.

The webhook URL is `{VITE_PUBLIC_APP_URL}/api/pms/distribution/aiosell/reservations`. If that public base URL is absent, webhook readiness is incomplete. No hostname is invented. Auth remains Basic Auth. No token is shown.

There is no Aiosell production activation command. The panel says production activation requires manual final approval, and it stays unavailable when readiness has not passed.

The stale-fetch warning is shown. `bookedOn` is not used as a version. This provider limit does not by itself mark the integration blocked.

No-show stays a backend notification for `booking.com` and `gommt`. The Front Office no-show command was not given a second button and was not wired. That wiring remains debt.

Manual verification, not executed by this implementation:

A. Open Distribution → Aiosell, choose sandbox, save partner slug and hotel code, then Validate Connection.
B. Confirm the validation result is currency and timezone compatibility only, with no raw property-details body.
C. Run one sandbox inventory or rate push from the existing ARI server path and confirm a sync event without secrets.
D. Send one inbound book to the webhook with Basic Auth and confirm one master, one room unit, one folio, mapping, snapshot, and history.
E. Send the same book again and confirm no second reservation.
F. Send one full-state modify and confirm the same confirmation number and folio.
G. Send one cancel and confirm the canonical unit cancel.
H. Send one booking with two rooms and confirm one master and two room units.
I. Send one book with no guest and confirm `External guest` / `external_provisional` and no invented contact.
J. Run Reconciliation for a sandbox date window and confirm fetched bookings follow create, modify, unchanged, or explicit cancel.
K. Run the same window again and confirm unchanged when the fingerprint matches.
L. Remove a room mapping and confirm that booking fails while the others continue.
M. After Front Office marks a `booking.com` or `gommt` stay no-show, call the notification service separately. Other channels must be rejected. The local status must already have been set by Front Office.
N. Send a book that includes `creditCard` and confirm HTTP success, `credit_card_present`, and no stored card material.
O. Read `pms_distribution_sync_events` and confirm no guest contact, special requests, card material, Basic Auth, or raw body.

Remaining external runtime debt: AIOS-03 manual database verification, the AIOS-04 real call, AIOS-05 modify/cancel/multi-room/Webhook Tester, and the AIOS-06 live fetch. No production activation was performed.

### Later increments

No phase after AIOS-07 was started.
