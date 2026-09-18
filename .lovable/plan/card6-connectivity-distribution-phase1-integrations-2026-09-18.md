# Card 6 — Connectivity & Distribution, Phase 1: Integrations

GitHub issue [#180](https://github.com/NORUDEVGIT/NORU/issues/180) · branch `feature/180-connectivity-integrations-phase1` · migration slot `0069`.

Phase 1 builds the **Integrations** half of Card 6: connecting and configuring external systems.
The Distribution tab exists as a visible, inactive placeholder. No Phase 2 mapping or rules work is
included.

## 1. The security decision this phase is built around

NORU today has no vault, no application encryption layer and no per-property secret store. Every
existing "secret" in the product is either a platform-level environment variable or a posture flag.
There is nowhere safe to put a property's Stripe secret key.

So Phase 1 is **metadata-only**:

| Persisted in Supabase | Never persisted anywhere |
| --- | --- |
| Name, category, provider, environment | API keys, secret keys |
| Status, enabled flag, description | Client secrets, webhook signing secrets |
| Selected event subscriptions | SMTP / gateway passwords |
| Non-secret technical mappings | Account passwords of any kind |
| Non-secret security metadata (IP allowlist, signature toggle) | |
| Last-test timestamp and activity log | |

Credentials live in React component state for the life of the drawer session and are discarded when
it closes. They are never written to Supabase, the TanStack Query cache, `localStorage`,
`sessionStorage`, the URL, server logs or toast text.

The consequence the UI must state honestly: **editing an integration asks the operator to re-enter
credentials**, because Phase 1 did not keep them. The drawer says this in plain language rather than
rendering masked bullets that imply a stored secret exists.

## 2. The honesty rules this phase inherits

The codebase already refuses to claim connections that are not real. `IntegrationHonesty` in
`pms-set5-depts-guestsvc.ts` hard-types `paymentConnected: false`, `accountingConnected: false`,
`apiConnected: false` and `thirdPartyConnected: false`, with `posChargeToRoomLive: true` as the one
genuinely live bridge. Those locks stay in force:

- The Test Connection modal is a **simulator**. It never reaches a third party.
- A simulated pass records `lastTestAt` and leaves the record `PENDING`.
- **`CONNECTED` is never set by Phase 1 code.** It exists in the status union and badge map so a
  future phase with real handshakes can use it.
- Every simulated result is labelled as simulated in the modal, the table and the activity log.
- The real live connections (POS charge-to-room, NORU Direct Booking) keep their truthful signals in
  the SET5 honesty board and are not editable through the simulated drawer.

## 3. Architecture: why Integrations is not Distribution

`distribution_channels`, `distribution_room_mappings`, `distribution_rate_mappings` and
`distribution_logs` already exist. They are the operational Direct/OTA distribution model with real
booking-side behaviour. Turning them into a generic connector store would make the Phase 2 mapping
work harder and couple two unrelated lifecycles.

Phase 1 therefore adds its own tables and never reads or writes the distribution ones.

| Concern | Integrations (Phase 1) | Distribution (Phase 2) |
| --- | --- | --- |
| Question answered | Can we talk to this system? | What do we sell, where, at what price? |
| Storage | `pms_integrations` | `distribution_channels` + mapping tables |
| Lifecycle | Credential handshake, enable/disable | Inventory and rate publication |
| Failure mode | Auth error | Overbooking, rate parity breach |

## 4. Schema — `0069_pms_card6_integrations.sql` (dual-lane)

Written to both `supabase/migrations/` and `drizzle/migrations/`, following the `0068` convention.

**`public.pms_integrations`**

`id`, `restaurant_id` → `restaurants(id) ON DELETE CASCADE`, `name`, `category`, `provider`,
`environment` (`sandbox` | `production`), `status`, `enabled`, `description`, `auth_method`,
`config jsonb` (non-secret field values only), `events text[]`, `webhook_path`, `last_test_at`,
`last_test_result`, `created_at`, `updated_at`.

Constraints: `UNIQUE (restaurant_id, name)`; category, provider-shape, environment, status and
auth-method check constraints; a check that `config` contains no key matching the secret-name
pattern, so a future bug cannot quietly persist a credential.

**`public.pms_integration_activity`**

`id`, `restaurant_id`, `integration_id` → `pms_integrations(id) ON DELETE SET NULL`,
`integration_name` (denormalised so history survives deletion), `event`
(`created` | `updated` | `enabled` | `disabled` | `deleted` | `test_passed` | `test_failed`),
`detail`, `simulated boolean NOT NULL`, `actor_user_id`, `created_at`.

Both tables: tenant indexes, `set_updated_at` trigger where applicable, least-privilege grants,
RLS enabled, members read via `is_restaurant_member`, owner/manager mutate via `has_restaurant_role`.

## 5. Server functions — `integrations-card6.functions.ts`

Five `createServerFn({ method: "POST" })` handlers, each with `requireSupabaseAuth`, Zod input
validation and `withPmsPackage` + module-role enforcement, mirroring `housekeeping-card2.functions.ts`:

| Function | Guard | Notes |
| --- | --- | --- |
| `getPmsCard6Integrations` | member read | Returns records, summary counts and recent activity |
| `savePmsCard6Integration` | owner/manager | Create or update; strips any secret-shaped key server-side before insert |
| `setPmsCard6IntegrationEnabled` | owner/manager | Enable/disable, logs the event |
| `deletePmsCard6Integration` | owner/manager | Deletes the record, keeps activity history |
| `recordPmsCard6IntegrationTest` | owner/manager | Records a simulated result; refuses to write `CONNECTED` |

Secret stripping happens in **two** places — the Zod schema rejects unknown/secret keys, and the
mapper rebuilds `config` from an allowlist derived from the catalog. Neither alone is trusted.

## 6. The configuration-driven catalog

One typed module, `integrations-catalog.ts`, is the single source of truth for what the drawer
renders. Adding a provider means adding a catalog entry, never a new component.

```
IntegrationCategory
  └── providers[]
        ├── authMethods[]
        ├── fields[]        (id, label, type, required, secret, placeholder, help, validation)
        ├── events[]        (optional per category)
        └── supportsWebhook (drives the read-only generated URL)
```

Field types: `text`, `select`, `toggle`, `checkbox-group`, `secret`, `readonly`, `textarea`.

Categories and their providers:

- **Payments** — Stripe, Telebirr, Chapa, CBE Birr, Generic Gateway
- **Communication (SMS)** — Twilio, Africa's Talking, Ethio Telecom SMS, Generic SMS Gateway
- **Communication (Email)** — SMTP, SendGrid, Mailgun, Amazon SES
- **Accounting / ERP** — QuickBooks Online, Xero, Odoo, Peachtree/Sage, Generic API
- **Hospitality / POS** — NORU POS, Generic POS, Door Lock System, Telephone/PABX
- **Government / Tax** — ERCA Fiscal Device, Tax Reporting Endpoint
- **Other Services** — Webhook Endpoint, Custom REST API, Analytics

Conditional rendering is **structural**: fields that do not apply are absent from the React tree, not
hidden with CSS. The same rule applies to the webhook section and the event picker.

## 7. UI surface — exactly four pieces

Per the brief: one main page, one type-selection layer, one reusable drawer, one small test modal.

1. **`pms-property-setup-card6-section.tsx`** — fullscreen Card 6 shell reusing the Card 1/Card 2
   chrome (`#251605` top nav, `#F7F4EE` canvas), header, subtitle, and the two tabs. The Distribution
   tab renders a Phase 2 placeholder panel and nothing else.
2. **`pms-card6-integrations-tab.tsx`** — four summary cards (Total, Enabled, Awaiting setup,
   Errors), search box, category filter, status filter, and the table: Name, Type, Provider, Status,
   Environment, Last Test, row actions. Loading, empty and error states included.
3. **`pms-card6-integration-type-dialog.tsx`** — compact category grid; choosing one opens the drawer.
4. **`pms-card6-integration-drawer.tsx`** — the single reusable `Sheet`, used for both create and
   edit, with collapsible sections, scrollable body, sticky footer, inline validation, and unsaved-
   change guarding.
5. **`pms-card6-test-connection-dialog.tsx`** — the small simulated test modal.

Status model and badges: `CONNECTED` (green, reserved), `PENDING` (amber), `NOT_CONFIGURED` (grey),
`ERROR` (red), `DISABLED` (muted).

The read-only webhook URL appears only once the integration has been saved and actually has a path.
Rendering a placeholder would invite someone to hand a provider an address that does not resolve, so
an unsaved integration gets a sentence explaining that the URL is generated on save instead.

## 8. Card 6 wiring

- `PROPERTY_SETUP_CARDS` entry 6 becomes `specced: true` with hash `connectivity-distribution`.
  Its `id` stays `notifications-security` because the programme status map and existing tests key on
  it; only the presentation changes.
- `pms-set1-hub.tsx` gains a `card6Open` branch alongside `card1Open` / `card2Open`.
- `SET5_INTEGRATIONS_HREF` retargets to the Card 6 hash, so `/restaurant/pms/integrations` lands on
  the new experience. The SET5 honesty board stays as the truthful live-connection status panel and
  links across to Card 6 rather than duplicating it.

## 9. Verification

`integrations-card6.test.ts` covers:

- Catalog integrity: every provider has fields, every secret field is flagged, no category is empty.
- Validation: required fields, URL/email/port formats, conditional requirements.
- **Secret isolation**: the persisted-config builder drops every secret field, asserted per provider.
- **Honesty**: no code path produces `CONNECTED`; a simulated pass yields `PENDING` + `lastTestAt`.
- **Separation**: the Phase 1 source files contain no reference to `distribution_channels` or the
  mapping tables.
- Migration shape: `0069` exists in both lanes, enables RLS on both tables, and scopes policies by
  `restaurant_id`.

Then `tsc --noEmit`, `npm run lint` and `npm run build`.

## 10. Explicitly out of scope

Room type mapping, rate plan mapping, meal plan mapping, policy mapping, inventory distribution
rules, rate distribution rules, sync defaults, and the distribution activation workflow. All Phase 2
or later.
