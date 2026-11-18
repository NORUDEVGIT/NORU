# PMS RBAC status

Status date: 5 November 2026. Branch: `feature/guest-preferences-workspace`.

The merge of the settings UI polish is in commit `687dcc01` (“Merge the settings UI polish and keep PMS permission gates.”). Parents are `bf3e6257` (through Phase 3) and `8fe6fabf` (PR #295). That commit is not pushed. The permission-gap work after the merge is still uncommitted.

Phases 1, 2, 2.5, and 3 are implemented in code. They are not finished end to end until migrations `0193` and `0194` are applied to the database and the leftover items below are either converted or accepted as policy.

## What each phase delivered

Phase 1 is the foundation. The owner (`restaurant_users.role === "owner"`) has implicit full access and does not need grant rows. Other staff get the union of `allowed = true` permissions from their active PMS roles. There is no deny. The catalogue is the typed `PMS_PERMISSIONS` list. `getMyPmsPermissions` returns `{ membershipId, restaurantId, isOwner, codes }`. A missing permission is reported as “You don't have permission to do that.” Permissions are not stored in the JWT. `STAFF_ROLES` and `restaurant_users.role` stay for the owner check and for F&B / POS. A new PMS staff row is stored as `"receptionist"`. That stored role is not a PMS grant.

Phase 2 moves live PMS server checks onto `requirePmsActor`, `requirePmsActorAny`, `requirePmsActorAll`, and `hasEffectivePermission`. View and edit stay separate. `canEditSet1` is not PMS navigation authority.

Phase 2.5 retires duplicate catalogue codes. `isRetired` checks both the original 16 codes from `0193` and the seven codes from `0194`: `cashiering.folio.create`, `cashiering.room_charge.post`, `front_office.fee.post`, `front_office.guest_request.edit`, `guest.document.edit`, `housekeeping.discrepancy.edit`, and `reports.pms.print`. Canonical replacements include `cashiering.charge.post` and `cashiering.folio.authorize` (Close Folio). Retired `reports.pms.print` is not enforced. There is no hidden `distribution.*` runtime requirement. Distribution uses `configuration.integration.view` and `configuration.integration.configure`.

Phase 3 is the client layer: `pms-client-access.ts`, `use-pms-permissions.ts`, and `PmsRouteGate`. The query key is `["pms-permissions", restaurantId]`, stale time is 60 seconds, and retry is off. While the query is loading, `can*` is false. Callers check `isLoading` before treating false as a denial. Loading shows “Checking access…” and does not redirect. An error does not redirect. PMS Home uses `fallback="first-module"` when `dashboard.view` is missing. Other modules show the denied panel. Route gates sit inside `RestaurantShell` because `restaurantId` is known only after membership loads. The PMS sidebar uses `pmsModuleVisible`. POS and F&B navigation is unchanged.

## What the post-merge pass changed

These edits are in the working tree and are not committed.

- Rate, revenue, and distribution access payloads come from permissions. `loadRevenueAccess` uses `rates.view` and the matching edit codes. `getRatesAccess` treats manage as configure, calendar override, restriction configure, or activate. `getDistributionAccess` uses integration view and configure. The rate and distribution screens deny on the view permission.
- Guest workspace access (`getGuestWorkspaceAccess`) uses profile and account permissions. `resolveGuestWorkspaceAccess(role)` remains as a pure helper for older tests.
- Stay visibility uses `guestStayAccessForActor`: reservation view, front-office view, and cashiering view. `guestStayAccessForRole` remains for tests. Travel-agent commission settle uses `guest.account.edit`.
- Arrivals open with front-office view or reservation view. Reservation detail reads open with reservation view. Write controls still use reservation create, edit, or cancel.
- Company, group, travel-agent, and the other account directories open with `guest.account.view`. Profile directory and profile detail still use `getGuestsAccess`, which is `guest.profile.view`.
- Guest privacy export, delete, and merge handlers use `guest.privacy.export`, `guest.privacy.delete`, and `guest.merge.authorize`.
- Housekeeping, rooms, room inventory, and maintenance server handlers use catalogue permissions. `evaluateRoomAssignment` is a read and uses `room.inventory.view`.
- Revenue source locks that required `requireRateManager` inside function files now require `requirePmsActor`. The helper is still exported from `rates.server.ts` and is not called by live handlers.

## Database

`0193` and `0194` are not applied. The Supabase project connection was skipped, so this session did not run them.

Apply the Supabase copies, in order, once:

1. `supabase/migrations/0193_pms_rbac_foundation.sql`
2. `supabase/migrations/0194_pms_rbac_phase25.sql`

Matching files exist under `drizzle/migrations/`. Do not apply both copies to the same database. `0193` adds membership-role assignment and reconciles the catalogue. It does not itself switch live authorization; the server code does that. `0194` deactivates the seven duplicate codes and removes authenticated manager write policies on the Card 7 role tables. It does not delete permission rows. Member SELECT stays.

After apply, confirm the catalogue matches `PMS_PERMISSIONS`, `pms_membership_roles` is the assignment table the resolver reads, and the deactivated codes are `active = false`.

## Left on purpose

- `requireGuestPrivacyOfficer` in `guests.server.ts` still throws “Only owners and managers can export, anonymise or unmerge guest data.” Live privacy handlers do not call it. `guest-profile-wave5.test.ts` still source-locks the helper and that sentence.
- `canAuthorizeCheckInDepositWaiver(role)` is still a role helper. The check-in screen uses `front_office.check_in.override`. The payment test locks the helper and is a Vitest file, so it is not run under `node:test`.
- `resolveRevenueAccess(role)` and `resolveGuestWorkspaceAccess(role)` stay as pure historical helpers. Live loaders do not authorize with them.
- `requireRateManager` stays exported. Live rate handlers use `requirePmsActor`.
- `requireReservationManager` stays exported. Tests source-lock that import string.
- `canEditSet1` and `canActivateSet1` stay for F&B and Set 1 tests. Card 8 go-live still falls back to `canActivateSet1(role)` on the server when the permission flag is absent. The client go-live control also requires `configuration.property.activate` and the server checklist.
- Housekeeping assignment override still reads `me.role` when the stored Card 2 policy is `owner_manager` or `housekeeping_supervisor`. That is the saved policy enum, not a staff grant. Housekeeping route access is `housekeeping.board.view` and `housekeeping.task.edit`. `resolveHousekeepingDataScope` is legacy data scope, not authorization.
- `ROLE_MODULES` remains the F&B map in `module-access.ts`. The PMS administration screen no longer renders it. It does not filter the PMS sidebar.
- Guest relationship roles (`employer`, `bill_to`, `booker_ta`) are not staff authorization.
- `hotel_role_id` is not written. Card 7 membership assignment shows “Moved to Staff & Access”.

## Source locks updated for the current screens

A focused run reported 310 tests, 304 passed, and 6 failed. Those six locks were updated to the code that is in the tree:

- `requirePmsActor` is called with the permission code after `restaurantId`.
- `listReservationsForGuestAccount` is exported from `guest-accounts.functions.ts`. The reservations workspace still says account masters are not Sales & Events group blocks.
- Night-audit OTB capture is the same call, split across lines.
- The Rate & Revenue workspace uses the toolbar (`rate-revenue-toolbar`) instead of mounting `RevenueContextBar`. Shared context, the calendar, and Revenue Control stay wired.
- Revenue Control opens the calendar from the inventory table with “View Calendar”.

The follow-up run of those files did not finish. The first test process stayed open after printing its summary, and new commands stopped returning output.

The site was not started, so these screens were not clicked through in a browser.

## What Phase 4 is

Phase 4 is the Staff & Access workspace. The UI is in the working tree and is not committed.

Settings → Card 5 → Step 1 is Staff & Access, ahead of Departments, Outlets & Facilities, and Sales & Events. The step is visible with `administration.staff.view` or `administration.roles.view`. Each tab follows its own view permission. Add Staff requires both create and assign-roles. Profile edit and role assignment stay separate. Role name/description edit and permission mapping stay separate. An active-only role change uses `administration.roles.activate` and does not also require role edit.

Templates only preselect permissions. Full Access selects low, medium, and high actions and leaves critical actions off until they are confirmed. Owner rows show Owner · Full Access and do not take custom roles. Card 7 and `/restaurant/pms/administration` point at Staff & Access. `/restaurant/staff` is unchanged.

Create and reset already set `profiles.must_change_password`. The first-login password screen is Phase 5. There is no email invite.

`0193` and `0194` are still not applied. Browser UAT was not run. Do not treat runtime access as proven until those migrations are applied and the staff and role screens are clicked through.

## UAT to run after the migrations are applied

Create these roles and open the matching URLs directly. A denied module shows the access panel and does not render the protected screen.

- Front Desk Viewer: view codes only. Can open the desk. Cannot create or edit.
- Reservation Creator: reservation create, without unrelated cashiering or settings edits.
- Cashier Payment Only: payment post. Checkout stays open without that code, and only the post control is disabled.
- Night Audit Run Only: the night-audit run code, without fiscal authorize unless that code is also granted.
- Settings Rooms Admin: rooms-operations configure, without the other settings cards.
- Critical Ops: the critical action codes assigned to a non-owner.
- A role whose name is Manager and whose only code is `dashboard.view`. The name grants nothing else.
- One person with both a reservation-creator role and a cashier role. The union applies. There is no deny row.

Owner still has every permission with no grant rows.

## Front Office desk actions (uncommitted, migration 0211)

Problem: a Front Office user could not post a charge, take a payment, assign a room, or edit a reservation unless they also held the matching module View (Cashiering, Reservations, Guest Profiles, Housekeeping). Settings forces that View on for any module action, so the desk grant alone exposed the whole module.

Change: 15 new desk codes plus one promoted code. Each desk code parents to `front_office.desk.view`, so granting it does not open the other module. The owning module's code still works for the same server write. Existing roles keep working.

### New permission codes

| Code | Action | Risk tier | Used for |
| --- | --- | --- | --- |
| `front_office.charge.post` | Post Charge from Desk | Medium | Folio charges, add service, early-departure penalty |
| `front_office.deposit.post` | Post Deposit from Desk | Medium | Check-in deposit |
| `front_office.payment.post` | Take Payment from Desk | Medium | Folio payments, check-out payment |
| `front_office.folio.authorize` | Close Folio from Desk | High | Close folio (folio tab and check-out) |
| `front_office.adjustment.post` | Post Adjustment from Desk | High | Folio adjustments |
| `front_office.discount.post` | Post Discount from Desk | High | Folio discounts |
| `front_office.folio.refund` | Refund from Desk | High | Folio refunds |
| `front_office.invoice.authorize` | Issue Invoice from Desk | High | Issue invoice from the folio tab |
| `front_office.housekeeping_task.create` | Create Housekeeping Task from Desk | Medium | Room HK task |
| `front_office.housekeeping_task.edit` | Update Housekeeping Task from Desk | Medium | Start cleaning on a desk task |
| `front_office.maintenance.create` | Create Work Order from Desk | Medium | Maintenance work order |
| `front_office.guest.edit` | Update Guest on this Stay | Medium | Guest details, ID documents, check-in registration |
| `front_office.guest_service.create` | Add Guest Service from Desk | Medium | Guest service request |
| `front_office.assignment.edit` | Assign Room from Desk | Medium | Room assign and change before arrival |
| `front_office.reservation.edit` | Edit Reservation from Desk | Medium | Reservation amend and occupants |

The risk tier comes from the `HIGH_CODES` list in `pms-permissions.ts`. Codes not listed there are Medium.

Promoted: `front_office.check_out.override` (Check-Out Override, High). It was a legacy code with no live gate. It is now a Settings permission under Exceptions, and checkout settlement override requires it.

Catalogue count: `PMS_PERMISSION_CODES` goes from 102 to 118.

Transfer and write-off are not in the desk list. They stay Cashiering-only.

### Migration

- `supabase/migrations/0211_front_office_desk_actions.sql`, identical copy in `drizzle/migrations/`.
- Inserts the 15 codes (ON CONFLICT updates metadata, keeps `active = true`) and upserts `front_office.check_out.override`.
- Not applied to any database and not committed. The new codes grant nothing until 0211 is applied, because the resolver reads `pms_permissions`.
- 0193, 0208, 0209, and 0210 are not edited.

### Server changes

- `src/packages/pms/lib/fo-desk-permissions.ts` (new): `moduleOrDesk`, `FO_STAY_FOLIO_READ`, `FO_CHECK_IN_FOLIO_READ`, `FO_CHECK_OUT_FOLIO_READ`, `FO_DESK_BALANCE_READ`, `folioEntryPermissions`.
- Cashiering folio: `cashieringCapability` accepts the module code or the desk code for charge, payment, deposit, refund, adjustment, discount, close, and invoice authorize. Transfer and write-off stay Cashiering-only. `postFolioEntry` accepts either code. `getFolioWorkspace` and `getReservationFolio` read with `FO_STAY_FOLIO_READ`, so the folio tab loads without Cashiering View.
- Stay-list and quick-view balances (`loadFoStaySignals`) read with `FO_DESK_BALANCE_READ`. The module Cashiering screens are unchanged.
- Check-in: registration save needs guest edit (`guest.profile.edit` or `front_office.guest.edit`). Completing check-in posts pending services only when the actor also has charge post. Check-in deposit needs the deposit module or desk code.
- Check-out: contract, confirmation, and context reads need `FO_CHECK_OUT_FOLIO_READ`. Payment needs payment (module or desk). Close folio needs folio close (module or desk). Settlement override needs both `front_office.check_out.create` and `front_office.check_out.override`. The `canOverride` flag in the check-out contract uses `mayOverrideCheckOut`.
- Guest: `updateGuest`, guest document upload and save, document review, and guest service accept guest edit or the desk code. Guest merge, privacy, and other guest-module actions have no desk code and still need their own guest codes.
- Reservation: `amendReservation` and `manageReservationRoomGuest` accept reservation edit or the desk code. `assignReservationRoom` accepts assignment edit or the desk code. Stay edit alone does not assign a room.
- Housekeeping: create accepts HK create or desk create. Start and assign accept HK edit or desk edit. Cancel stays HK-only. Maintenance create accepts maintenance create or desk create.
- Cancel and no-show fee charge: the action needs cancel or no-show, and the fee post needs charge (module or desk).
- Early-departure penalty and `changeStayDates` penalty accept charge (module or desk).
- Approvals: `evaluateFoApprovalRequirement` takes `canAuthorize` from the live permission. The role check was removed (`FO_LIVE_AUTHORIZER_ROLES`, `isFoLiveAuthorizer`). Mapping in `fo-approvals.functions.ts` (`APPROVAL_GRANT`):
  - `front_office.check_in.override` → `front_office.check_in.override`
  - `front_office.check_out.override` → `front_office.check_out.override`
  - `front_office.fee.override` → `front_office.fee.override`
  - `late_checkout.authorize` → `front_office.fee.override`
- Late checkout hints in the in-house and departure desk lists take `canAuthorizeLateCheckout` from Fee Override.

### Client changes

- `front-office-desk-access.ts`: `frontOfficeDeskAccess(snapshot)` returns boolean flags per Front Office action (check-in, stay edit, room assign, charge, stay folio read, guest view, and others). `foDeskMenuAllowed(access, id)` maps rack and reservation menu ids to those flags.
- `use-pms-permissions.ts`: `useFrontOfficeDeskAccess(restaurantId)`.
- Gated UI (the buttons now follow the flags above): rack menu and rack drag, room HK modal entry, guest search result actions, arrival and departure quick views, in-house quick view folio tab, reservation side sheet menus, walk-in quick view, check-in workspace sheet actions, edit-details save, check-out payment and close folio, housekeeping and maintenance modal confirm, arrivals and departures check-out, stay-list check-out, walk-in "Finish check-in", registration duplicate-profile search, registration ID save, review step edit buttons.
- Open Folio still requires `cashiering.folio.view` (`CASHIERING_VIEW`). Open Guest Profile requires `guest.profile.view`. Open Reservation requires `reservation.reservation.view`. These are intentional: opening a module screen still needs that module's View.
- Settings: a new group `desk-actions` ("Actions from the desk") sits under Front Office in `staff-access.ts`. Check-Out Override is listed under Exceptions.

### Tests

- `pms-permissions.test.ts`: count 118. The 0193 "every live code is seeded" check now also accepts the later seed files 0085, 0196, 0203, 0209, and 0211.
- `fo-phase8.test.ts`: approval tests use `canAuthorize` and `foLateCheckoutRequiresApproval(needs, canAuthorize)`. Membership-role assertions were replaced with `APPROVAL_GRANT` and `hasEffectivePermission` assertions.
- New `front-office-desk-access.test.ts`: desk code parent is Front Office; Front Office view plus desk code is a valid grant; stay edit does not assign rooms; rack menu omits check-in without the grant; override path requires `FRONT_OFFICE_CHECK_OUT_OVERRIDE`.
- Source-lock tests for check-in, folio tab, and guest workspace tabs were updated to the new `desk.canReadStayFolio` and `desk.canCheckIn` lines.

Last run (`tsx --test` on `pms-permissions.test.ts`, `front-office-desk-access.test.ts`, and `fo-phase8.test.ts`): 34 tests, 33 passed, 1 failed. The failure is "does not add a fake Approvals inbox or request table". It fails with `6 !== 0` because it counts any `0101_` or `0102_` migration file, and the repo already has `0101_hk_history_guest_request_event.sql`, `0101_pms_rate_change_events.sql`, and `0102_pms_rate_restriction_change_events.sql`. That check is not part of this change and was not fixed.

Not run under `tsx --test`: `fo-check-in-workspace`, `fo-folio-tab`, `fo-guest-workspace-tabs`, and `fo-rack-bar-menu` use `vitest`, and they fail to load in this environment with `Cannot read properties of undefined (reading 'config')`. Their source-lock lines were updated but not run. `fo-phase3` and `fo-phase4` have source-lock failures ("Move guest" text, `view === "inhouse"` and `view === "departures"`). They were not investigated and may predate this change. Full `tsc` was not run.

### Known gaps (not changed)

- Owner, or any active membership whose role is `owner`, skips every check.
- Permissions are empty while loading, so action buttons stay hidden until the snapshot loads.
- `updateGuest` with only the desk guest-edit code can edit any guest on the property, not only the guests on that stay.
- Read-only quote endpoints (`quoteInHouseStayChange`, `getAmendContext`) still need only Front Office view.
- Transfer and write-off stay Cashiering-only, so Front Office users still need the Cashiering module for them.
- Some desk screens were not re-checked for every button. Check the Front Office buttons in a browser before relying on them.

## Reservations action gates (uncommitted, no migration)

Goal: every reservation action button and server write follows one rule set. No permission means the control is hidden. A permission that exists but is blocked by business state (closed reservation, checked-in stay, past arrival) means the control is visible and disabled.

### Rules

- Rate plan changes need `reservation.rate.override`. This covers Edit Reservation, the Rates tab, the room-type change dialog, reprice, and any amend that changes `ratePlanId`.
- Room assign, change, unassign and room-type change need `reservation.assignment.edit`. This covers the Rooms tab, calendar drops, and the Edit Reservation room field. A room-type change also needs Edit Reservation.
- New Reservation shows only with `reservation.reservation.create`. Export PDF shows only with `reservation.reservation.print`.
- Calendar menu actions each check their own permission. There is no combined flag.
- Late checkout and expected arrival keep the Front Office stay codes (`front_office.stay.edit`). Check-in on the occupants card uses `front_office.check_in.create`.
- Guest profile writes need `guest.profile.*`. Edit Reservation alone does not grant them. Add companion needs `guest.profile.create` and the reservation edit code. Edit companion needs `guest.profile.edit`. Remove companion needs Edit Reservation.
- Folio tab is shown only with `cashiering.folio.view`. Its money buttons follow the Cashiering capability flags.
- Packages add and remove stay under Edit Reservation.
- Cancel settlement stays under `reservation.reservation.cancel`. `front_office.fee.override` is required only to waive a fee. The fee post does not need a separate charge permission.

### Server gates added or changed

- `amendReservation`: `assertAmendScopedGrants` requires rate override when `ratePlanId` changes. It requires assignment edit (or the desk equivalent `front_office.assignment.edit`) when `roomId` changes. Comparison uses `?? null`, so a missing field means clear.
- `confirmReservationRoomTypeChange`: requires rate override when the plan changes. It requires assignment edit when an assigned room would be released. `evaluateRoomTypeChange` now returns `heldRoomId`.
- `applyReservationPromotion` and `removeReservationPromotion`: still Edit Reservation. The UI now hides them without edit.
- `postCancelOrNoShowFee`: cancel uses `CANCEL_PERMISSIONS` (cancel or the Front Office cancel code). No-show uses `front_office.no_show.edit`. The charge requirement was removed.
- `completeFoCancel`: `CANCEL_PERMISSIONS`.
- `getCancelNoShowContext`: front office view or reservation view.

### Client gates added or changed

- `reservation-detail-actions.ts`: `ReservationDetailGrants` now has `checkIn`. `reservationDetailGrants(access)` builds all grants from the permission snapshot.
- `reservation-detail-workspace.tsx`: passes `grants={detailGrants}` and `stayOpen` to every tab. The Folio tab is hidden without `openFolio`. The AmendDialog room type and room fields are disabled without assignment edit.
- Stay tab: ETA and late checkout need `stayEdit`, with the status checks kept. Save and Cancel need Edit Reservation.
- Rates tab: Change Rate Plan and Edit Rate need rate override. Apply Discount, Add promotion, Remove promotion and the rate-notes footer need Edit Reservation.
- Rooms tab: room menu actions are filtered by grant. Change Room Type needs Edit Reservation. In-house room moves need `stayEdit`. Assign, change and unassign need assignment edit. The room-occupants Check In button uses `checkIn`, not Edit Reservation.
- Room type change dialog: the rate plan select is locked to the current plan without rate override.
- Guest tab: Add Guest needs Edit Reservation and guest create. Edit companion needs guest edit. Remove needs Edit Reservation. Preference and special request Edit buttons need Edit Reservation.
- Requests tab: Add Request needs the guest service create grant. Start, complete and assign need guest edit. Save occasion and Save Changes need Edit Reservation. Back to Folio shows only with `openFolio`.
- Notes tab: Add Note needs Edit Reservation (internal) or guest edit (guest profile note). Add Trace, pin, and the task menu need Edit Reservation.
- Packages tab: remove and add need Edit Reservation.
- Edit Reservation page: rate plan select needs rate override. Room select needs assignment edit. Guest name, phone and email need `guest.profile.edit` or `front_office.guest.edit`. The room type select is locked when the user cannot assign and a room is assigned.
- Reservations list: New Reservation needs the create grant. Export PDF needs the print grant. The waitlist gets `canCreateGuest` and `canCreateReservation` props. Convert needs reservation create.
- Create reservation page: guest create and master create use `GUEST_PROFILE_CREATE`, not guest view.
- Front Office notes save (`front-office-frames.tsx`) sends the stored `ratePlanId`, so the new rate override check does not block it.

### Tests

- Updated source locks to the new gates: `cashiering-phase0.test.ts` (fee gate), `create-reservation-phase1.test.ts` (create page guest gate), `pms-ui-permission-audit.test.ts` (detail workspace grants).
- The changed files parse with no syntax errors (26 files).
- Failures that also occur on the untouched `HEAD` were not changed. They include the `AC-CR1-18`, `AC-CR1-9`, `AC-CR3-13`, `AC-CR3-7` and housekeeping CTA locks.

### Known gaps

- Full `tsc` has not completed a valid run. The full run was stopped, and a scoped run on the changed files was still running when this was written.
- `reservation-workspace/booking-calendar.ts` `calendarDropRefusal` and the calendar server path were not re-tested against a browser.
- `PricingSection` in `reservation-detail-workspace.tsx` is unused and was not gated.

## Cashiering action gates (uncommitted, no migration)

Rule: no permission hides the action; a blocking business state shows it disabled with a reason. Server enforcement was not weakened, and posting/financial rules are unchanged.

### Scope

- The Cashiering page loads folio grants with `scope: "cashiering"`, so only `cashiering.*` codes count. Front Office, Reservations and Night Audit keep the default `"desk"` scope, which still accepts their own desk codes.
- `getCashieringAccess` and `FolioWorkspace` expose `canReceiveInvoicePayment` (`cashiering.payment.post` and `cashiering.allocation.edit`).

### Client gates

| Action | Permission |
| --- | --- |
| Return to guest folio, settlement transfer, history Transfer | `cashiering.transfer.post` |
| Correct charge: amount, quantity, reversal | `cashiering.adjustment.post` |
| Correct charge: apply discount | `cashiering.discount.post` |
| History Refund | `cashiering.refund` |
| Receive deposit | `cashiering.deposit.post` |
| Allocate deposit, `?action=allocate` drawer | `cashiering.allocation.edit` |
| Open account | `cashiering.charge.post` and `guest.account.view` |
| Close account (disabled when balance is not zero) | `cashiering.folio.close` |
| Receive payment on account (disabled when closed) | `cashiering.payment.post` |
| Invoice payment (guest and company) | `cashiering.payment.post` and `cashiering.allocation.edit` |
| Company invoice draft create/save, line checkboxes | `cashiering.invoice.edit` |
| Issue / reprint invoice, settlement "Issue final invoice", credit/debit note issue | `cashiering.invoice.authorize` |
| Cashier Shift tab and side rail entry | any `cashiering.shift.*` |
| Side rail Folios / Payments | `cashiering.folio.view` |
| Side rail Night Audit | `night_audit.run.view` |
| Guest Profile links | `guest.profile.view` |
| Reservation links | `reservation.reservation.view` |
| Fiscal settings link | `configuration.integration.view` |

Printing stays available to anyone who can view the folio or invoice.

### Removed

- Role checks in account workspace, payment, allocation, charge-ownership and guest-allocation capabilities. They take permission grants instead.
- Cashier/Accountant/Manager role lists for the Cashiering and Night Audit side rail.
- Dead, ungated `components/cashiering/cashiering-tabs.tsx` (no imports).

### Known gaps

- Some internal components still accept unused `canOperate` / `canManage` props; they no longer gate anything.
- Legacy `requireCashier*` role helpers in `cashiering.server.ts` remain exported but are not called.
- Pre-existing source-text test failures in the cashiering suites were not fixed (for example `DebitNoteSection`, `canManage ?`, `Issue invoice` in `guest-folio-page.tsx`, settlement `canClose: input.canManage`).
