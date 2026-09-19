# Card 6 — What is real, what is held, and what must happen next

This note covers **Connectivity & Distribution** on Property Setup Card 6
(`/restaurant/settings#connectivity-distribution`).

Phases 1–3 shipped the **operator experience**: create integrations, map rooms
and rates, configure which data would sync, validate, activate, and monitor.
They did **not** ship a live channel-manager, OTA, payment, SMS, email or
accounting connector.

That is intentional. The UI is honest about it. This file lists every gap that
stops those screens from talking to a real third party, why it was held, what
a later phase must build, and the **target architecture**: one Noru backend,
many vendor adapters (not a new backend per integration).

NORU Direct Booking (`/restaurant/pms/distribution`) and POS charge-to-room are
already live products. They are **not** this Card 6 work and must not be
confused with it.

---

## What already works (real)

| Capability | Why it is real |
| --- | --- |
| Save integration **metadata** (name, category, provider, environment, non-secret settings, event list) | Stored in `pms_integrations` |
| Enable / disable / delete an integration | Stored; credentials are still not stored |
| Simulated Test Connection that only checks the form is complete | Browser-side; records `last_test_at` as **simulated** |
| Create a distribution configuration that points at a Phase 1 integration | `distribution_channels.integration_id` |
| Map Noru room types, rate plans and (where catalogued) meal plans | Live mapping tables |
| Save inventory / rate **sync intent** (toggles, outbound direction, manual frequency) | `sync_config` jsonb |
| Validate mappings + sync settings before activation | Server + UI |
| Activate / deactivate operational intent | `sync_active`, `activated_at` |
| Delete a distribution row without deleting the integration or PMS rooms/rates | Cascade on mapping tables only |
| Empty last-sync, disabled Sync Now, empty history | Honest empty states — not fake success |

If an operator can click through Card 6 end to end, they have configured **intent**.
Nothing has been sent to Booking.com, Aiosell, Stripe, Twilio, or similar.

---

## Held items, by phase

### Phase 1 — Integrations

#### 1. Credential vault

**What is missing.** API keys, client secrets, webhook signing secrets,
passwords and tokens are never saved. They exist only in the drawer session.
Re-open the integration and the operator must type them again.

**Why it is held.** NORU has no per-property secret store, no application
encryption layer, and no vault. Platform env vars are the only real secrets
today. Writing property keys into `pms_integrations.config` would put live
credentials in the database and in backups.

**What is needed.**

- A server-side secret store (Supabase Vault, a KMS-backed table, or an
  external vault) scoped to `restaurant_id`.
- Encrypt at rest; never return the raw secret to the browser (masked or
  “configured” only).
- Server functions that read secrets only on the server for handshake and
  outbound calls.
- Keep the existing check that secret-shaped keys cannot live in `config`.

**How it will be done.** Add a `pms_integration_secrets` (or Vault) write path
in the save handler. The drawer shows “credentials stored” without values.
Rotation is a dedicated re-enter flow. Logs, toasts and activity never print
secrets.

#### 2. Real connection test / handshake

**What is missing.** Test Connection never calls the provider. A pass means
“the form looks complete.” Status stays `pending`. Phase 1 code never writes
`connected`.

**Why it is held.** A green “Connected” badge without a handshake would lie.
SET5 already locks payment / accounting / API / third-party as not connected.

**What is needed.**

- Per-provider adapter: Stripe ping, Twilio lookup, SMTP AUTH, channel-manager
  health, etc.
- Use stored secrets from the vault.
- Map real HTTP / SDK errors to human messages (not stack traces).
- Only then set `status = connected` (or `error`).

**How it will be done.** Replace `simulateIntegrationTest` with a server
`testPmsCard6Integration` that dispatches on `provider`. Keep the simulated
path only for local/dev if a provider is not configured.

#### 3. Webhooks and inbound events

**What is missing.** Operators can tick event names and a webhook path. Nothing
listens, verifies signatures, or writes inbound payloads.

**Why it is held.** No public webhook endpoint, no signing-secret storage, no
idempotent event inbox.

**What is needed.** Authenticated inbound route per property, signature check,
event log, retry/dead-letter. Wire only events the provider actually sends.

#### 4. Live payment / SMS / email / accounting / hospitality adapters

**What is missing.** Catalog entries exist (Stripe, Paystack, Twilio, SMTP,
Xero, …). They do not charge a card, send an SMS, or post a journal.

**Why it is held.** Same vault + handshake gap, plus each adapter is its own
product. SET5 honesty forbids inventing live gateways.

**What is needed.** One adapter at a time, behind the same integration record,
with a real test and a narrow first job (e.g. send one SMS, create one payment
intent). Do not bulk-enable the catalog.

---

### Phase 2 — Distribution mapping

#### 5. Live provider / channel catalog

**What is missing.** External room types, rates and meals are **local lists**
in `distribution-catalog.ts` (e.g. `bcom_deluxe_double`). They are not fetched
from Aiosell or an OTA.

**Why it is held.** There is no authenticated channel-manager API. Pretending
those IDs came from Booking.com would make mappings look live when they are
not.

**What is needed.** After Phase 1 handshake: `listRooms` / `listRates` /
`listMeals` from the provider. Cache in Noru with last-fetched time. Map to
the same `external_entity_id` column already used.

**How it will be done.** Keep the mapping UI. Replace `externalEntities()`
with a server fetch keyed by `integration_id`. Label stale cache. Do not
free-type external codes in Card 6.

#### 6. Policy mapping

**What is missing.** Cancellation / no-show policy mapping is omitted.

**Why it is held.** NORU has no cancellation/no-show policy catalogue to map
from. Inventing one would be a second product.

**What is needed.** A real PMS policy entity (or reuse an existing rules
table), then a catalog flag `mappingKinds: ["…","policies"]` per channel.

**How it will be done.** Same mapping section pattern as meals. Only show when
both Noru and the channel support it.

#### 7. Operational “channel connected”

**What is missing.** Card 6 OTA rows keep `distribution_channels.status =
not_connected`. Mapping status is only `pending` | `attention` | `disabled`.

**Why it is held.** That column is the live Direct/OTA operational flag.
Writing `active` / `connected` here would look like SET6 “OTA is live.”

**What is needed.** A real ARI (availability, rates, inventory) session with
the provider. Then, and only then, a separate operational status that SET6
and `/restaurant/pms/distribution` can read without lying.

#### 8. DIRECT channel

**What is missing.** Card 6 never lists, edits or deletes the seeded `DIRECT`
channel.

**Why it is held.** Direct booking is already live on another workspace.
Card 6 must not steal or break it.

**Future.** Leave Direct Booking on `/restaurant/pms/distribution`. Card 6
stays OTA / channel-manager mapping only.

---

### Phase 3 — Rules, sync, activation

#### 9. Outbound inventory / rate / restriction sync

**What is missing.** Toggles save **intent**. No job pushes availability,
rates or restrictions to a channel. Restriction sync UI is hidden because no
provider capability is confirmed.

**Why it is held.** No worker, no provider ARI API, no mapping from Noru
inventory calendar to OTA payloads. Fake “128 records processed” would be a
production lie.

**What is needed.**

- Provider adapters: inventory, rates, then restrictions (min/max stay, CTA,
  CTD, stop sell) **only where the contract documents them**.
- Queue / cron (or provider webhooks for pull).
- Idempotent payloads, date-range windows, occupancy / allotment rules agreed
  with the property.
- Map using Phase 2 `external_entity_id` rows — do not remap in the worker.

**How it will be done.** A server `syncNow` / scheduled runner reads
`sync_config` + mappings + vault credentials, calls the adapter, writes a
**real** sync-run row. UI already has the empty history and disabled Sync Now
slot.

#### 10. Real-time / interval sync and retries

**What is missing.** Frequency is **manual** only. Automatic sync and retry
toggles are disabled.

**Why it is held.** There is no scheduler and no retry budget tied to a real
job. Exposing “every 5 minutes” would imply a worker that does not exist.

**What is needed.** `pg_cron`, a queue, or an external worker; max attempts;
backoff; poison-message handling. Then extend `supportedFrequencies` in the
catalog **per provider**.

#### 11. Sync Now, history, errors, retry

**What is missing.** Sync Now is disabled (`Sync service not connected`).
History is an empty state. Last sync is always Never. There are no
`sync_runs` / `sync_errors` tables.

**Why it is held.** `distribution_logs` is Direct Booking activity, not OTA
sync. Reusing it would mix two products. A mock “success” path was rejected
for production.

**What is needed.**

```
distribution_sync_runs   (distribution_id, type, status, timestamps, counts)
distribution_sync_errors (run_id, entity, external_id, message, technical)
```

Statuses: `running` | `success` | `failed` | `partial` | `cancelled`. Retry
only if the adapter supports it. Technical details behind an expand, never
secrets.

**How it will be done.** Enable Sync Now when `sync_active` and a real adapter
exists. Write the run first, update it on completion, invalidate the Card 6
query so Last Sync / Healthy come from that row.

#### 12. Activation vs live sync

**What is missing.** Activate sets `sync_active`. It does **not** start a
provider session or publish inventory.

**Why it is held.** Activation without a worker would still look like “the
channel is live.” Copy in the confirmation modal says no external sync runs
until a service is connected.

**What is needed.** Activation remains the gate. The first real sync should
run only after activate **and** adapter health. Deactivate must stop the
worker without deleting mappings (already the rule).

---

## Why we hold all of this (one list)

1. **No credential vault** — cannot persist or use real keys safely.
2. **No provider adapters** — no HTTP/SDK layer to Aiosell, OTAs, Stripe, etc.
3. **Honesty locks** — SET5 / SET6 / Card 6 tests forbid fake Connected, fake
   last-sync, and fake OTA live.
4. **No sync worker** — nowhere to run ARI publication or retries.
5. **Incomplete PMS catalogues** — no policy entity; restriction APIs
   undocumented for current providers.
6. **Two products** — Direct Booking and POS folio posting are live; Card 6
   must not overwrite them.

---

## Target architecture: one backend, many integrations

The frontend can be generic. Talking to a vendor cannot. Adding a live Aiosell
adapter does **not** make Stripe or Booking.com work with no further backend.
The right model is **one Noru integration platform** and **one small adapter
per vendor**.

### What is already generic (keep this)

Card 6 is already the shared operator surface:

- One Integrations drawer, one save, one Test Connection UI
- One Distribution mapping / sync / activation experience
- Shared tables: `pms_integrations`, mapping tables, `sync_config`
- Catalog of providers and field shapes (`integrations-catalog.ts`,
  `distribution-catalog.ts`)

Operators add “another integration” from the UI. That part stays general.
A new catalog row only adds a **form**. It does not connect.

### What is not generic

Vendors do not share one protocol.

| | Aiosell / CM | Stripe | Twilio | SMTP |
| --- | --- | --- | --- | --- |
| Auth | Vendor API key / HMAC as documented | Secret key / OAuth | Account SID + token | Username + password |
| Handshake | Their health / login URL | e.g. retrieve account | Lookup / balance | SMTP AUTH |
| After connect | Rooms, rates, availability | Charges, customers | SMS | Email |

A generic “POST this URL with this key” can work for a dumb in-house webhook.
It does **not** replace a channel manager or a payment gateway. Wrong URL,
wrong header, or wrong JSON and it fails — or worse, looks connected and
still does not sync.

### The one backend (build once)

Shared by every live vendor:

1. **Integration record** — already exists (`pms_integrations`): name,
   provider, category, environment, status, non-secret settings.
2. **Secret vault** — missing. Store keys per `restaurant_id` +
   `integration_id`. Server-only. UI shows “configured,” never the raw secret.
   Do not put secrets in `config` jsonb.
3. **Adapter registry** — `getAdapter(provider)`. If none is registered, that
   provider stays simulated / Test Connection and Sync Now stay non-live.
4. **Standard jobs** an adapter may implement (only what the vendor supports):
   - `testConnection`
   - `listExternalCatalog` (rooms, rates, meals, …)
   - `syncInventory` / `syncRates` / `syncRestrictions`
   - `handleWebhook` (optional)
5. **Sync runs / errors** — one history model for all distribution adapters.
6. **Card 6 UI** — calls those jobs. It must not contain Aiosell or Stripe
   HTTP itself.

```
Card 6 UI
    → integration record + vault + sync_config
        → adapter registry
            → adapters/aiosell.ts
            → adapters/stripe.ts
            → adapters/twilio.ts
            → adapters/generic_http.ts   (optional: URL + key + health path)
```

No new Card 6 and no new Noru backend when a vendor is added.

### Many integrations = catalog + adapter

| Layer | Who changes | What it does |
| --- | --- | --- |
| Catalog | Config / frontend data | Fields, labels, capability flags |
| Vault + jobs | Shared backend (once) | Store secrets, dispatch, history |
| Adapter | One file per vendor | Auth, URLs, payloads, error mapping |

If there is **no adapter**, the provider is “configure only” — which is the
current Card 6 behaviour.

### Optional generic HTTP adapter

A single adapter that takes **base URL + API key + health path** and sends
e.g. `GET /health` with `Authorization: Bearer`. Useful for in-house APIs.
Not a substitute for Aiosell, OTAs, or Stripe.

### What you need to add one live vendor

Not a new backend. You need:

| Need | Why |
| --- | --- |
| Official sandbox API docs | URLs, auth, payloads |
| Sandbox credentials | Real handshake without production traffic |
| Which jobs they support | Connection only vs catalog vs ARI vs payments |
| Catalog entry | Fields + capability flags |
| Adapter module | The only vendor-specific code |

Example: **Aiosell** → docs + sandbox key → vault fields + `aiosell.ts` with
`testConnection`, then `listRooms`, then `pushAvailability`.  
**Stripe** later → same vault and UI; new `stripe.ts`; payments category, not
distribution ARI.

### How you add the next vendor (after the platform exists)

1. Add a catalog row (fields + capabilities).
2. Add `adapters/<provider>.ts` implementing only the jobs you marked.
3. Register it in the adapter registry.
4. Test in sandbox.
5. Only then allow `connected` / Sync Now **for that provider**.

UI stays the same. Backend platform stays the same. Only catalog + adapter
grow.

**First build:** vault + registry + **one** adapter (the first real channel
manager). After that, each new live integration is mostly that adapter file,
not a Card 6 rewrite.

### What not to build

- A new Noru backend per integration
- Frontend-only “pick any company and it works”
- One HTTP format that all OTAs and gateways speak
- Turning on Connected / last-sync for providers that have no adapter

---

## Suggested future order

Do not start with a giant sync engine. Unlock in this order so each step is
real:

1. **Secret vault + one handshake**  
   Pick one provider (likely the first channel manager the property actually
   uses). Store secrets. Test Connection hits the real API. Status may become
   `connected`.

2. **Pull external catalogs**  
   Replace local Booking.com/Expedia/Agoda lists with fetched room/rate/meal
   IDs. Keep the Phase 2 mapping UI.

3. **One outbound ARI slice**  
   e.g. availability only, mapped rooms, sandbox first. Write real sync runs.
   Enable Sync Now for that slice only.

4. **Rates, then restrictions**  
   Catalog-driven. Hide anything the contract does not support.

5. **Scheduler + retries**  
   Then expose frequencies other than manual.

6. **Other integration categories**  
   Payments, SMS, email, accounting as separate adapter projects on the same
   Phase 1 record — not a Card 6 rewrite.

Until step 1 exists, Card 6 remains **configuration and intent**. That is
working as designed.

---

## Surfaces that must stay honest

| Surface | Must not claim |
| --- | --- |
| Card 6 Integrations | Connected, unless a real handshake succeeded |
| Card 6 Distribution | Last sync / Healthy / records processed without a sync-run row |
| SET5 integrations honesty | Live payment / accounting / API / channel manager |
| SET6 distribution posture | Live OTA / GDS |
| `/restaurant/pms/distribution` | That Card 6 OTA mapping is a live channel manager |

When a real adapter ships, update these locks in the **same** change that
turns the handshake on — never earlier.
