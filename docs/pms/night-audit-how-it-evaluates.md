# Night Audit — how each section evaluates the business date

This describes the Night Audit that is implemented now: Control Center, Financial, Operations, Exceptions, Run & Close, and History.

Night Audit reads the hotel. It does not post charges, change rooms, change reservations, register fiscal documents, approve rates, retry channels, or complete services. A finding is cleared by fixing the record in the owner module (Front Office, Cashiering, Housekeeping, Room & Inventory, Distribution, Rate & Revenue) and then running Recheck.

The date being audited is `restaurants.business_date`. It moves forward only when an owner or manager confirms **Close Business Date**. That calls `close_business_date`, which advances the date by exactly one day. There is no automatic rollover and no way to reopen a closed date from Night Audit.

## How a finding is classified

Every check ends as one of these:

| Result | Meaning | Can the date be closed? |
| --- | --- | --- |
| Blocker | The source record is still wrong in a way that must not be locked into a closed date. | No |
| Warning | Something is unfinished or imperfect, and the hotel is allowed to close with it. | Yes |
| Info | A fact worth seeing. It is not a problem. | Yes |
| Pass | Nothing was found for that check. | Yes |
| Not configured | That module is not set up for the property. Night Audit does not invent a failure. | Yes |
| Unavailable | A required read failed. Night Audit does not treat a failed read as a pass. | No |

Warnings never block close. Blockers do. If Financial or Operations cannot be read, the whole date is **Unavailable** and close stays locked.

The night auditor cannot mark a blocker as fixed, ignore it, or close past it. Recheck is the only way a blocker clears, and it clears only when the source no longer reports it.

## Overall readiness

Control Center and Run & Close share one overall status. The screen cannot say Ready while close would refuse.

The status is chosen in this order:

1. **Closed** — this business date’s run is already closed.
2. **Blocked** — any live board blocker, any open blocking exception, Financial blocked, or Operations blocked.
3. **Unavailable** — a required board check failed to load, or Financial or Operations failed to load.
4. **Warning** — no blockers, and at least one warning exists.
5. **Ready** — no blockers and no warnings.

Close is allowed only for Ready or Warning, and only after Final Recheck, and only for an owner or manager on desktop.

The live board is the older checklist that still has to agree with close. These board rows block when their count is greater than zero:

- Arrivals still pending or confirmed on or before the business date
- Overstays
- Folio or invoice settlement contradictions (an ordinary open folio balance is not one of these)
- An open hotel cashier drawer, when the property uses hotel drawers
- An occupied room that is out of order or out of service, or an occupied room with an open housekeeping discrepancy
- A checked-in stay with no room
- Two checked-in stays in one room
- A closed folio that is not zero
- A posting after a folio was closed
- A duplicate room charge for one stay

**Cancel / no-show pending** is always Unavailable on purpose. There is no standing fee worklist, so that row is not treated as a failure and it does not block close.

## Control Center

Control Center does not calculate its own numbers. It shows the current business date, the property-local clock, the run state, and the overall status, then the counts from Financial, Operations, and the exception queue.

| What you see | Where the number comes from |
| --- | --- |
| Financial blockers and warnings | Financial reconciliation |
| Operational blockers and warnings | Operations reconciliation |
| Open exceptions | Stored exception rows that are still open on this run |
| Open drawers | Hotel cashier drawers still open |
| Arrivals, overstays, room conflicts, overbooking | Operations summary |
| Fiscal | Financial fiscal problems, excluding pure info rows |

**Recheck** re-reads Financial, Operations, and the run. It does not close the date and it does not change source records.

The primary button depends on the overall status:

| Status | Button | Where it goes |
| --- | --- | --- |
| Blocked | Review First Blocker | Financial, Operations, or Exceptions, whichever is blocked |
| Warning | Review & Close | Run & Close |
| Ready | Run & Close | Run & Close |
| Unavailable | Retry Checks | Recheck |
| Closed | View Run | History |

There is no Close button on Control Center.

## Financial

Financial answers: can tonight’s money be locked without hiding a broken folio, invoice, allocation, drawer, or fiscal document?

It uses the same settlement rules as Cashiering. It does not recompute tax or settlement with a second formula. Amounts are the frozen snapshots already stored on the documents. The business-date window is the property’s local day, not the server’s clock.

Financial is **Blocked** when any blocker below exists, **Warning** when there are warnings and no blockers, and **Ready** when there are neither. If the read fails, the section is **Unavailable** and close is locked.

### Guest folios

One row per guest folio on the property ledger.

| Finding | Severity | What it means |
| --- | --- | --- |
| Closed folio with a non-zero balance | Blocker | The folio is closed and the ledger is not zero. |
| Posting after the folio was closed | Blocker | A transaction is dated after `closed_at`. |
| Duplicate room charge | Blocker | The same stay has more than one posted room charge. |
| Open folio with a balance | Warning | The guest still owes or has a credit. An open balance is allowed at close. |
| Priced stay with no folio | Warning | A priced confirmed or in-house stay has no folio. |

An open in-house balance does **not** stop the audit. A closed folio that is not zero does.

### Issued guest invoices and settlement

Compares the folio ledger with issued guest invoices, using Cashiering’s invoice classification (invoice total, credit and debit notes, payments, deposits, and cash-debit cover).

| Finding | Severity | What it means |
| --- | --- | --- |
| Folio settled, invoice still outstanding | Blocker | The ledger says the folio is settled, but an issued invoice still has a balance. |
| Allocation larger than the payment or deposit | Blocker | More was allocated than the source still has available. |
| Allocation with no invoice | Blocker | The allocation points at an invoice that is not on this property. |

### Guest payments and advance deposits

| Finding | Severity | What it means |
| --- | --- | --- |
| Allocation larger than the source | Blocker | Same integrity rule as above, shown on the payment. |
| Unallocated guest payment or deposit | Warning | Money is still available to allocate. Unallocated cash is not treated as corruption. |

### Company and group accounts

Company and group accounts receivable. A normal outstanding balance is allowed.

| Finding | Severity | What it means |
| --- | --- | --- |
| Withholding does not match the invoice | Blocker | The withholding stored on the invoice does not match the active certificates. |
| Allocation larger than the account payment | Blocker | Same “allocated more than available” rule, on an account payment. |
| Allocation points at a missing invoice | Blocker | The invoice is not on this property. |
| Allocation points at a void or unissued invoice | Blocker | The document is not a valid allocation target. |
| Cross-ledger transfer is incomplete | Blocker | A transfer has no pair, or the two sides do not sum to zero. |
| Unallocated payment while an invoice is outstanding | Warning | The account has both spare payment and an open invoice. |
| Valid outstanding balance | Info | Ordinary receivables. They do not block close. |

### Cashier shifts and cash drawers

Only **hotel** drawers are in this check. Outlet drawers are outside Night Audit.

| Finding | Severity | What it means |
| --- | --- | --- |
| Open hotel drawer | Blocker | A hotel cashier shift is still open. |
| Closed drawer with a cash variance | Warning | The drawer was closed, and the counted cash does not match. Close is still allowed. |
| No hotel drawers on the property | N/A | Till close does not apply. |

### Fiscalization

Only documents whose type is handled by the property’s fiscal integration are checked. If fiscalization is not turned on, the section says it is not configured and does not invent errors.

| Document status | Severity |
| --- | --- |
| FAILED, NOT_REGISTERED, BLOCKED, CANCEL_PENDING, or an unrecognized status | Blocker |
| PENDING | Warning |
| REGISTERED, CANCELLED | Info |

A device fault that was later fixed does not clear this by itself. The document status has to change. After the document is registered, Recheck drops the blocker. While it is still failed or not registered, the date cannot be closed. Night Audit does not retry the fiscal device.

### Fiscal close override

For an exceptional fiscal outage, an **Owner** or **Manager** may authorize a close override only for one of these fiscal blockers: `fiscal_failed`, `fiscal_cancel_pending`, `fiscal_not_registered`, `fiscal_blocked`, or `fiscal_unrecognized`. The authorization requires a reason, is recorded against that run and business date, and applies only to that Night Audit close.

The override does not repair, cancel, register, retry, or otherwise change the fiscal document. Its actual status remains visible as FAILED, NOT_REGISTERED, BLOCKED, or the original status. It remains in the fiscal queue and will naturally be considered by later reconciliations if their ordinary scope includes it. All non-fiscal blockers — including folio integrity, allocations, arrivals, room conflicts, unavailable reconciliations, and operational issues — remain non-overrideable.

An overridden issue is shown as **Overridden** in Exceptions, Financial, Run & Close, and the permanently retained closed-run history, with its fiscal status, reason, authorizer, and timestamp. It no longer counts as a blocking exception for that one run; it does not become resolved.

### Tax and service charge

Compares the tax and service-charge amounts frozen on the documents with the amounts the same rules produce from those snapshots.

| Finding | Severity | What it means |
| --- | --- | --- |
| Tax snapshot does not match | Warning | The stored tax does not match the snapshot. |
| Service-charge snapshot does not match | Warning | The stored service charge does not match the snapshot. |

Night Audit does not post a correction. Occupancy municipal fee is not calculated inside Night Audit; the tax section says it is kept separate.

## Operations

Operations answers: can tonight’s stays, rooms, and the next day’s known pressures be closed safely?

A stay is counted as one checked-in **room unit**, not as the reservation header and not as each traveler. The header room is not copied onto sibling units.

Operations is **Blocked** only by the blockers in the tables below. Distribution, revenue, waitlist, and services never block, even when they warn. If the whole operational read fails, the tab is **Unavailable** and close is locked. A section that is not configured stays “not configured” and does not block.

### Arrivals

| Case | Severity | What it means |
| --- | --- | --- |
| Pending or confirmed, and the arrival date is on or before the business date | Blocker | The arrival was not checked in, cancelled, or marked no-show. |
| Arrival date is after the business date | Not listed | Tomorrow’s arrivals are not tonight’s problem. |

Night Audit does not check the guest in and does not auto-no-show.

### Departures and in-house

| Case | Severity | What it means |
| --- | --- | --- |
| Checked in, and the departure date is before the business date | Blocker | Overstay. Extend the stay or check the guest out. |
| Checked in, and the departure date is the business date | Warning | Due out today. A granted late checkout is shown and still does not block. |
| Checked in, departure still in the future | Info on the in-house count | Staying guests. They are counted, not flagged. |

The in-house count is the number of checked-in room units.

### Room assignment and occupancy

This section is about whether the checked-in units are in a legal room. It is not a list of every room in the hotel. The table shows rooms that are not a clean pass.

| Finding | Severity | What it means |
| --- | --- | --- |
| Checked in with no room | Blocker | The unit has no room assignment. |
| Two or more checked-in units in one room | Blocker | Double occupancy. |
| Checked in, and the room status is out of order or out of service | Blocker | The guest is in a restricted room. |
| Occupied, and maintenance marks the room out of order or out of service (and the room status itself does not already say that) | Blocker | Maintenance says the room is unavailable. |
| Occupied, and maintenance is open but not “unavailable” | Warning | Maintenance needs follow-up. It does not block. |
| Urgent maintenance request in an occupied room | Warning | The request is urgent. It does not block. |
| Ordinary open maintenance request in an occupied room | Info | Visible only. |
| Maintenance requests could not be read | Warning | Room status is still checked. The missed request list does not by itself make Operations unavailable. |

### Housekeeping and room state

This section starts from the **same room rows** as occupancy, then keeps a room when any of these is true:

- the room has a housekeeping finding, or
- housekeeping status is dirty, or
- housekeeping status is pickup.

| Finding | Severity | What it means |
| --- | --- | --- |
| Occupied room with an open or unresolved housekeeping discrepancy | Blocker | The discrepancy is still open. |
| Vacant, dirty, and no open cleaning task | Warning | Nobody is assigned to clean it. An occupied dirty room is not this finding. |
| Out of order or out of service with no reason recorded | Warning | The restriction has no reason. |
| Occupied, housekeeping inspected, and the room is inactive | Warning | The room record contradicts itself. |

Dirty or pickup rooms can appear here even when they have no finding, so the section can list rooms that occupancy hides. The reverse is also true: a clean double-occupied room appears under occupancy and not here.

When the only problems are housekeeping problems, the two tables list the same rooms and the same worst issue. That overlap is in the presentation. The counts behind the sections stay separate: occupancy counts assignment conflicts, housekeeping counts housekeeping findings.

### Overbooking

Looks at tonight and tomorrow only. Capacity, allowance, committed demand, and recorded approvals come from Room & Inventory. Night Audit does not approve an overbooking.

| Case | Severity |
| --- | --- |
| Tonight’s shortage is above the allowance and is not fully approved | Blocker |
| Tonight’s shortage is inside the allowance but not fully approved | Warning |
| Tomorrow is short, whether or not it is over the allowance | Warning |
| Shortage is fully covered by recorded approvals | Info |
| Overbooking is not configured | Not configured, and it does not block |
| Waitlist request for tonight or tomorrow | Info |
| Converted waitlist entry whose reservation is missing | Warning |

Waitlist demand does not consume inventory and never blocks close.

### Distribution

Channel connection and failed syncs for this business date. Night Audit does not retry a channel.

| Case | Severity |
| --- | --- |
| Enabled connection has a last error | Warning |
| One or more failed syncs for an operation and channel | Warning |
| No known failures | Info |
| Distribution is not configured | Not configured |
| The read failed | Warning, titled unavailable. It does not block close. |

### Revenue readiness

Pending approvals and restrictions from Rate & Revenue, plus frozen nightly rates. Night Audit does not approve a rate and does not calculate a replacement rate.

| Case | Severity |
| --- | --- |
| A pending approval overlaps the business date or the next date | Warning |
| Stop sell, closed to arrival, or closed to departure on the next date | Info |
| A confirmed or checked-in unit staying tonight has no frozen nightly rate for the business date | Warning |
| Revenue data could not be read | Warning. It does not block close. |
| Rate & Revenue is not configured | Not configured |

### Service operations

Meal and service entitlements whose service date is the business date and whose status is pending or in progress.

These are **Info**. Services never block close. Night Audit does not complete them and does not post them. If the entitlement tables are not set up, the section is not configured. If they cannot be read, the section is unavailable as a section; it is not turned into an operational blocker.

## Exceptions

Exceptions are one queue for this run, stored in `night_audit_exceptions`. Financial and operational findings are written into that queue. There is no separate exception table.

| Stored status | Meaning |
| --- | --- |
| Open | The source still has this finding, or it has not been rechecked since it came back. |
| Resolved | A recheck no longer found it. The row is kept. |
| Ignored | Legacy only. New blockers cannot be ignored. An ignored warning stays ignored if it returns. |

Lifecycle:

1. Recheck derives the current findings.
2. A new finding inserts one row. The same finding on a later recheck does not insert a second row.
3. A finding that disappeared is marked resolved.
4. A resolved finding that comes back reopens the same row.
5. A blocker that was ignored by an older system is reopened. A warning that was ignored stays ignored.

The queue can be filtered by status, severity, domain (Financial or Operations), category, and search. **Open Source** goes to the owner module. Closed runs are never synced again: a later business date cannot reopen an exception on a closed run.

Categories follow the finding: folios, invoices, payments, accounts, drawers, fiscal, tax, arrivals, departures, rooms, housekeeping, overbooking, distribution, revenue, and services.

## Run & Close

Run & Close shows the current date, the next date, and the same readiness as Control Center. It does not trust the numbers already on screen.

**Close Business Date** stays disabled until all of these are true:

- Financial is not blocked and not unavailable
- Operations is not blocked and not unavailable
- The live board has no blockers
- No blocking exception is still open
- Overall status is Ready or Warning
- Final Recheck has been run and still matches the data on screen
- The user is an owner or manager, on desktop
- This run is open or ready, and a close is not already in progress

The confirmation shows the current date, the next date, the financial blocker count, the operational blocker count, the warning count, and the audit note. The note is optional. It does not bypass a blocker.

After the user confirms, the server does this, in order:

1. Re-reads Financial and Operations.
2. Syncs exceptions.
3. Rejects the close if any blocker remains or a required read failed.
4. Checks that the run is still this business date.
5. Calls `close_business_date`, which locks the property, closes the run, and sets the business date to the next day.
6. After that commit, captures the on-the-books snapshot.

The close does not post, move rooms, or auto-no-show.

If two people close at the same time, the date advances once. The request that lost sees **Business Date Already Closed**, with the original closer and the original close time. The second note is not saved over the first.

If the on-the-books snapshot fails, the close still stands. The result says the snapshot failed. Retrying the snapshot does not close the date again, and it does not insert a second snapshot when one already exists.

## History

History lists stored runs. It does not recalculate old business dates.

A run status is open, ready, closed, or failed. The filter includes failed, and failed rows are never invented. Pages are 10, 25, or 50, default 25, applied in the database.

The run drawer shows what was stored at close: dates, closer, note, financial counts, operational counts, the exceptions that belong to that run, and whether an on-the-books snapshot exists. Older runs that were closed before a count existed show **Not captured**, not zero.

Report links for a closed run use that run’s business date:

| Report | Date parameter |
| --- | --- |
| Police / Guest Stay | `stayDate` |
| Cashier Invoice | `from` and `to`, both the closed date |
| Meal Service | `serviceDate` |
| Service Fulfillment | `serviceDate` |

Those links open Reports. Night Audit does not rebuild the reports.

## Who can see and do what

| Role | Close the date | Financial amounts | Stay and guest detail |
| --- | --- | --- | --- |
| Owner, manager | Yes | Yes | Yes |
| Cashier, accountant | No | Yes | Counts and room state only. Guest names on operational findings are hidden. |
| Receptionist | No | Counts only. Amounts, tax totals, and financial exception text are hidden. | Yes |
| Housekeeping | No | No | Room and housekeeping detail only |

Enforcement is on the server. Hiding a column in the browser is not the rule.
