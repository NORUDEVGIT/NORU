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
- `ROLE_MODULES` remains display inside the administration workspace and the F&B map in `module-access.ts`. It does not filter the PMS sidebar.
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

Phase 4 is Staff & Access. It is not built.

It should add:

- a role editor and a permission matrix over the existing catalogue
- staff creation that stores the non-grant `"receptionist"` role and assigns one or more PMS roles
- email invite
- multi-role assignment on a membership
- cache refresh through the existing `usePmsPermissions` / `invalidatePmsPermissions` layer

It should not put permissions in the JWT, fall back to legacy role checks, equate view with edit, use `configuration.security.configure` as the Card 7 gate, or change POS / F&B navigation.

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
