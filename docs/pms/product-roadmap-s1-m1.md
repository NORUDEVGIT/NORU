# NORU PMS S1 + M1 Product Plan — Option A (2026-09-14)

| Field | Value |
|---|---|
| **Title** | NORU PMS S1 + M1 Product Plan — Option A |
| **Date** | 2026-09-14 |
| **Option** | **A — LOCKED** by Rekik (Vice PM — PMS) |
| **Overall PM** | Abel |
| **Classification** | **PRODUCT PLAN** |
| **Review status** | **READY FOR PM REVIEW** (Abel / Rekik) for the first development cycle |
| **First cycle** | **E-S01 Pilot Front-Desk Day Integrity** — **AWAITING PM APPROVAL** — **NOT FOR DEVELOPER** |
| **PDF deliverable** | `NORU_PMS_S1_M1_Product_Plan_Option_A_2026-09-14.pdf` |
| **Baseline** | [Commercial Readiness & Gap Analysis (2026-09-11)](./commercial-readiness.md) |
| **Boundaries** | [`../architecture-ownership.md`](../architecture-ownership.md) — package ownership, routes, shared services. This plan does not redefine them. |

> **PRODUCT PLAN / OPTION A LOCKED (Rekik 2026-09-14)**
>
> **READY FOR PM REVIEW (Abel / Rekik)** for the first development cycle.
>
> First cycle is **E-S01 Pilot Front-Desk Day Integrity**. It is **AWAITING PM APPROVAL** and **NOT FOR DEVELOPER** until PM approves.
>
> This is **NOT** an engineering Functional Spec. It does **not** create GitHub issues and does **not** authorise a Developer handoff from this document alone.
>
> Commercial baseline: [`commercial-readiness.md`](./commercial-readiness.md). Package / route / shared-service boundaries: [`../architecture-ownership.md`](../architecture-ownership.md).
>
> Companion PDF name: **`NORU_PMS_S1_M1_Product_Plan_Option_A_2026-09-14.pdf`**.

Do **not** read this plan as live-capability documentation. Do **not** invent **LIVE OTA**, **payment-gateway settlement**, **classic nightly room-and-tax night audit**, **groups**, or **tax completeness** as current capabilities.

---

## 1. Executive strategy

### 1.1 Small → Medium → Large

NORU sells the rooms PMS in three commercial bands. Option A does **not** try to become a mid-market or enterprise PMS in one programme.

| Band | Programme | Commercial intent |
|---|---|---|
| **Small** | **S1** | Honest **pilot**, then a sellable small independent / boutique rooms hotel (~5–40 rooms), with a written limitations sheet. Direct booking, walk-in, phone. One folio. Recorded tenders. |
| **Medium** | **M1** | Mid-size readiness: advanced folio, companies, permissions + approval thresholds, a real distribution **path** (not claimed connectivity), reports, and optional groups MVP — only after S1 exit. |
| **Large** | Later (not this plan) | Scale, routing depth, gateway settlement, multi-property, governance, interfaces — **only** with a commercial case. **Multi-property is deferred** (see §9). |

S1 does **not** make NORU a complete modern PMS. M1 does **not** make NORU an enterprise PMS.

### 1.2 Option A inserts

Option A is the locked packaging of the 2026-09-11 Phase 1–5 advice into **S1 + M1**, with these inserts (items pulled forward or combined, not invented as CURRENT):

| Insert | Where | What Option A does |
|---|---|---|
| **E-S13** Arrival ID / document capture | S1, after E-S06 | Pulls the arrival **ID / document** gap into Small instead of leaving it as an unscheduled mid-size nice-to-have. |
| **E-S14** Doc A ship / UAT evidence pack | S1 closer | Makes the Document A honesty bar an **S1 exit artefact**, not an afterthought. |
| **M06** Permissions **+** Approval Thresholds | M1 (combined) | One mid-size control epic. Does **not** wait for a late “manager approvals” phase. |
| **M12** Notifications & communications | M1, between M08 and M09 | Pulls the planned communications surface into Medium. Still **not** an S1 blocker. |
| **M13 Offline** | Optional M1 only | **Deferred from S1.** Small-hotel pilots are assumed online. Offline is not an S1 epic. |

Option A does **not** insert LIVE OTA, gateway settlement, classic nightly NA, groups-as-CURRENT, or tax-complete accounting into S1.

### 1.3 Document A ship / UAT standard

**Document A** is the [Commercial Readiness & Gap Analysis (2026-09-11)](./commercial-readiness.md). Every S1 and M1 cycle inherits this ship / UAT bar:

| Rule | Meaning |
|---|---|
| **`NOT VERIFIED` is never `PASS`** | A check that was not run stays `NOT VERIFIED` / `NOT RUN`. Independent QA does not rewrite an unrun check into PASS. |
| **Code wins on conflict** | If copy, catalogue labels, or this plan disagree with `main`, code wins. Then the docs are corrected. |
| **No invented money or inventory success** | Coming soon / foundation / planned surfaces must not fake a posting, a settlement, an OTA sync, or a room state. |
| **No invented commercial claims** | Do not UAT-pass or sell **LIVE OTA**, **gateway settlement**, **classic nightly room-and-tax NA**, **groups**, or **tax-complete** hotel accounting unless that cycle actually delivered them (none of those are CURRENT). |
| **Written limitations** | Any pilot sell ships with the E-S00 limitations sheet. Sales copy cannot outrun the sheet. |
| **Boundaries hold** | No new packages. No Back Office hotel general ledger. Shared services stay as in [`../architecture-ownership.md`](../architecture-ownership.md). |

A cycle that violates Document A is **not shippable**, even if the screens look finished.

### 1.4 Offline deferred from S1

Disconnected / offline front-desk operation is **out of S1**. It is **optional E-M13** only, and only after PM confirms a commercial case. S1 UAT assumes a connected property.

---

## 2. S1 epic register

Build order below is the Option A sequence. **E-S01 is FIRST** for the first development cycle (subject to the open E-S00 order decision in §9).

| Order | Epic | Name | Priority |
|---|---|---|---|
| 1 | **E-S00** | Honest Pilot Commercial Pack (sales limitation sheet + capability-label honesty) | **MUST** |
| 2 | **E-S01** | **Pilot Front-Desk Day Integrity** (**FIRST** cycle) | **BLOCKER** |
| 3 | **E-S02** | Room-charge posting model | **BLOCKER** |
| 4 | **E-S03** | Tax & fees v1 | **BLOCKER** |
| 5 | **E-S04** | Guest receipt / folio statement | **MUST** |
| 6 | **E-S05** | Deposit & cancellation-fee engine | **MUST** |
| 7 | **E-S06** | Housekeeping departure / readiness automation | **MUST** |
| 8 | **E-S13** | Arrival ID / document capture *(Option A insert)* | **SHOULD** |
| 9 | **E-S07** | Cashier shift variance & close integrity | **MUST** |
| 10 | **E-S08** | Night-audit honesty & audit UI | **MUST** |
| 11 | **E-S09** | Direct-booking pay rules | **SHOULD** |
| 12 | **E-S10** | Guest request board | **SHOULD** |
| 13 | **E-S11** | Small-hotel report honesty pack | **SHOULD** |
| 14 | **E-S12** | Room status / OOO–OOS operational completeness | **SHOULD** |
| 15 | **E-S14** | Doc A ship / UAT evidence pack *(Option A insert)* | **MUST** |

**BLOCKER** = S1 cannot exit (and cannot be sold beyond a tightly disclosed pilot) without it. **MUST** = required for S1 exit. **SHOULD** = Option A wants it in S1; PM may slip a SHOULD to a later S1 patch without reopening Medium.

---

## 3. S1 deep notes

Grounded in Document A (2026-09-11) plus CURRENT `main` facts called out in that record. **Planned** work is not CURRENT.

| Epic | Problem (CURRENT) | Essence (S1 outcome) | Out of this epic | UX (desk, not Spec) |
|---|---|---|---|---|
| **E-S00** Honest Pilot Commercial Pack | Catalogue and sales copy can be read as more than the product is. Distribution is labelled `existing` but is **not** live OTA. Card is a **recorded tender**, not a gateway. Folio transfers expose `transfersSupported: false`. Room charge is **stay-level**. | One written **sales limitation sheet** plus honest in-product capability labels. Sales and CS use the same sheet. | Building OTA, gateway, groups, tax engine, or checkout rules. | A single limitations page / PDF the desk and sales can quote. No “Live OTA” or “card captured” chrome. |
| **E-S01** Pilot Front-Desk Day Integrity | Document A: FO checkout and folio settle are **separate**; outstanding balance did **not** have a verified hard block. Receipt / invoice weak. Departure is commercially **PARTIAL**. | One enforceable **departure integrity** story: stay → folio → settle → close → complete, with a PM-chosen unpaid rule (see §9). Pilot day can be trusted at the desk. | Tax engine, nightly accrual, OTA, groups, notifications, new packages, Back Office ledger, ID capture, HK automation. | Stepper the clerk cannot skip. Balance and settle state visible. Unpaid path is explicit (block **or** recorded override — PM decides). No fake “paid”. |
| **E-S02** Room-charge posting model | Room charge is **stay-level**, not classic nightly room + tax. Night audit exception-checks + business-date close exist; they do **not** post nightly room-and-tax. | A **decided, documented posting model** for S1 (stay-level kept, or a bounded nightly v1). Audit and folio match the decision. | Classic full night audit, tax-complete accounting, multi-folio routing. | Clerk sees **when** the room charge appears and for **what period**. No implied nightly NA if stay-level is kept. |
| **E-S03** Tax & fees v1 | **No** property tax / fee engine. Property Setup copy already says taxes & city levies are **not** configurable. Do **not** claim tax-complete hotel accounting. | A **bounded v1** (what is taxed, what is a fee, what is shown on folio/receipt) after the §9 tax-v1 decision. Honest “not tax-complete” remains on the limitations sheet. | Full jurisdictional tax compliance, city-ledger tax packs, VAT returns, multi-property tax. | Folio lines show tax/fee **or** an honest “tax not configured” state. Never a green “tax complete” badge. |
| **E-S04** Guest receipt / folio statement | Receipt / invoice **NOT VERIFIED** / weak in Document A. | Guest can leave with a **printable / sendable** folio statement that matches posted lines and recorded tenders. | Fiscal invoice device, gateway merchant receipt, email product (E-S09 / M12). | One “Print / save statement” from checkout or Cashiering. Amounts match the folio. No invented invoice number series unless it exists. |
| **E-S05** Deposit & cancellation-fee engine | Deposit is **manual only**. **No** formal cancellation-fee engine. FO check-in already has a deposit **policy gate** (posted or waived) — that is not a fee engine. | Rules the desk can apply: take / waive deposit; calculate and post a cancel or no-show fee through Cashiering. | Groups allotment penalties, OTA cancel mapping, gateway pre-auth. | Policy visible at booking, cancel, and no-show. Waive is supervisor-shaped, not silent. |
| **E-S06** Housekeeping departure / readiness | HK readiness gate is **PARTIAL**. Checkout automation is a Document A Phase 2 item. | Departure flips room work; arrival cannot complete into a room the board does not treat as ready — or the override is recorded. | Full HK labour, inspection QA programme, inventory min/max. | Board and FO agree on dirty / clean / inspected / OOO. Clerk sees “room not ready” in language the HK board uses. |
| **E-S13** Arrival ID / document capture | ID / document capture **MISSING**. Guest profiles exist; capture is not a first-class arrival step. | Capture or explicitly waive ID / document at arrival. Stored on the guest / stay the desk can retrieve. | KYC product, passport MRZ hardware, police export, mid-size registration cards as a legal pack. | Registration step: capture / skip-with-reason. Image or reference visible later. No fake “ID verified by government”. |
| **E-S07** Cashier shift variance & close | Basic cashier shifts exist. Variance / close integrity is not a sellable control story. | Open → post → close with an expected vs counted variance and a reason when it does not match. | Payment gateway till, restaurant till merge, Back Office GL. | Close sheet: expected, counted, variance, reason. Cannot post without an open shift where that is already the rule. |
| **E-S08** Night-audit honesty & audit UI | Exception checks + `close_business_date` (and later NA-1 close-of-day chrome) are **not** classic nightly room-and-tax posting. Security & Audit module is **planned**. | An honest close-of-day UI: blockers, date roll, history. Labels never say “nightly room and tax posted” unless E-S02 actually delivered that. | Classic NA, financial tax pack, enterprise audit vault. | Blocker board → Confirm date roll. “What this close does / does not post” in plain language. |
| **E-S09** Direct-booking pay rules | **Direct booking is live.** Pay / deposit rules for the public booking path are incomplete vs desk policy. | Public booking and desk use the **same** deposit / guarantee / recorded-tender rules. Still **not** a gateway. | LIVE OTA, channel manager, card-present gateway. | Booking site states what is collected vs recorded. Failure is visible; success is a real posting or an honest “pay at hotel”. |
| **E-S10** Guest request board | Guest request board **DEFERRED**. Guest Services catalogue status is **planned**. FO amendments may take a request note — that is not a board. | Open → in progress → done requests the desk and (if in scope) HK can see. | Concierge marketplace, guest app, notifications product (M12). | Simple board, stay-linked. Done does not invent a charge; charges still go through Cashiering. |
| **E-S11** Small-hotel report honesty pack | Occupancy / ADR / RevPAR-style PMS reports exist as a surface. Commercial honesty (what the figure includes) is not a pilot pack. | A short **pilot report set** with definitions: occupancy basis, stay-level vs nightly revenue, exclusions. | Mid-size pack (M07), owner PDF suite, BI warehouse. | Report footer states the definition. No “RevPAR as STR” claim unless the formula is the one implemented. |
| **E-S12** Room status / OOO–OOS completeness | Room inventory and OOO / OOS exist. Operational completeness (desk + HK + sellable) still has edge holes for a pilot. | Sellable / OOO / OOS / occupied meaning is consistent on dashboard, rack, and HK. | Yield, overbooking as a commercial product, multi-property inventory. | Same status words everywhere. Selling an OOO room is blocked or loudly confirmed — no silent oversell. |
| **E-S14** Doc A ship / UAT evidence pack | Without a closing evidence pack, S1 can “look done” while Document A rules are skipped. | S1 exit file: UAT scripts, `NOT RUN` honesty, limitations sheet attached, non-claims signed by PM. | Developer handoff, GitHub issues, M1 scope. | Not a guest UX. A PM/QA checklist that blocks “S1 done” until Document A is met. |

---

## 4. S1 exit gate, exclusions, and sales promises

### 4.1 S1 exit gate

S1 may be called **exited** only when **all** of the following are true:

1. Every **BLOCKER** and **MUST** epic is PM-accepted against Document A (SHOULD slippage recorded).
2. E-S14 evidence pack is attached (UAT, `NOT RUN` list, limitations sheet).
3. No S1 surface claims LIVE OTA, gateway settlement, classic nightly NA, groups, tax completeness, or multi-property.
4. Package boundaries in [`../architecture-ownership.md`](../architecture-ownership.md) are unchanged (no new packages; no Back Office hotel GL).
5. Abel / Rekik record S1 exit. This plan alone is not that record.

### 4.2 S1 exclusions

| Excluded from S1 | Why |
|---|---|
| LIVE OTA / channel-manager sync | Distribution is foundation + **direct booking** only. Catalogue `existing` ≠ live sync. |
| Groups / MICE / allotments | Sales & Events is **planned**. Mid+; open MVP decision is M1 (§9). |
| Folio transfer / split / routing / company bill-to | Cashiering exposes **`transfersSupported: false`**. Ledger has no folio-to-folio transfer. M1. |
| Payment-gateway settlement | Card is a **recorded tender label**, not a gateway. M10 path is open. |
| Classic nightly room-and-tax night audit | CURRENT close is exceptions + business-date roll. E-S02 may choose stay-level and **keep** this exclusion. |
| Tax-complete hotel accounting | E-S03 is **v1 only**. Full compliance is not S1. |
| Offline / disconnected desk | **Deferred from S1.** Optional **E-M13** only. |
| Notifications product | Planned module. M12, not S1. |
| Multi-property / chain | **Deferred** (not M1 by default). |
| New packages; Back Office ledger | Boundaries stay in architecture-ownership. Accounting & Finance remains presentational / shared foundation. |

### 4.3 Sales may / must-not promise (S1)

**Sales may promise** (written limitations attached):

- Rooms PMS for a **small independent / boutique** property (pilot, then S1-exited small)
- Reservations, desk, rooms / rates, guests
- Housekeeping (with S1 readiness rules once E-S06 is in)
- Basic folio and cashier shifts; recorded cash / card / transfer **labels**
- Business-date close with exception checks (honest NA — not classic nightly room-and-tax)
- **Direct booking**
- Optional restaurant **charge-to-room** when both packages are enabled
- An **honest pilot** with the E-S00 limitations sheet

**Sales must not promise:**

- Live OTA / channel manager
- Groups / corporate / agent billing
- Payment-gateway settlement
- Folio split / transfer / routing
- Full tax-compliant hotel accounting
- Classic nightly room-and-tax night audit
- Enterprise / multi-property PMS
- A complete mid-market PMS
- Offline front desk (S1)

---

## 5. M1 epic register

M1 starts only after S1 exit (or an explicit PM waiver naming which S1 BLOCKERs remain). Order is Option A.

| Order | Epic | Name | Priority |
|---|---|---|---|
| 1 | **E-M01** | Advanced folio & transfers | **BLOCKER** (for mid-size sell) |
| 2 | **E-M02** | Company profiles & bill-to | **MUST** |
| 3 | **E-M03** | Folio split / routing | **MUST** |
| 4 | **E-M04** | Groups / allotments MVP | **SHOULD** (MVP path open — §9) |
| 5 | **E-M05** | Distribution path (live OTA **or** partner channel manager) | **BLOCKER** (path **OPEN** — §9) |
| 6 | **E-M06** | **Permissions + Approval Thresholds** *(Option A combine)* | **MUST** |
| 7 | **E-M07** | Mid-size commercial report pack | **MUST** |
| 8 | **E-M08** | Travel-agent / source-of-business | **SHOULD** |
| 9 | **E-M12** | Notifications & communications *(Option A insert)* | **SHOULD** |
| 10 | **E-M09** | Maintenance / engineering depth | **SHOULD** |
| 11 | **E-M10** | Payment-collection path | **OPEN** (§9) |
| 12 | **E-M11** | Security & audit | **SHOULD** |
| 13 | **E-M13** | Offline / disconnected desk | **OPTIONAL** (deferred from S1) |

---

## 6. M1 deep notes

| Epic | Problem (CURRENT) | Essence (M1 outcome) | Out of this epic | UX |
|---|---|---|---|---|
| **E-M01** Advanced folio & transfers | Cashiering dashboard exposes **`transfersSupported: false`**. Ledger has **no** folio-to-folio transfer. One folio per stay is the S1 shape. | Transfer between folios becomes a real, audited posting — flag flipped only when the ledger can do it. | Split/routing product (E-M03), city ledger as ERP, gateway. | Transfer action hidden or disabled **until** true. Never a successful toast on a no-op. |
| **E-M02** Company profiles & bill-to | **No** company bill-to. Search may match a stored company/group **label**; that is not billing. | Company profile + bill-to folio / invoice target for mid-size corporates. | Travel-agent commission (E-M08), groups master (E-M04). | Company on the stay is a pick-list, not a note. Bill-to is visible on the folio header. |
| **E-M03** Folio split / routing | No split, routing, or multi-folio. | Route charges (e.g. room vs extras) to more than one folio on the same stay. | Payment gateway, master-account hotel chains. | Routing rules the clerk can see before post. Failed route is an error, not a silent guest folio. |
| **E-M04** Groups / allotments MVP | Sales & Events is **planned**. Groups are **not** a product. Document A: do not sell MICE. | Only if §9 chooses an MVP: block + pickup + group name. Otherwise this epic stays **not started** and sales stay on the S1 non-promise. | Full MICE, banquet CE, rooming-list EDI. | Group is a first-class object or it is absent — no “group” chip that is only a text field. |
| **E-M05** Distribution path | **`pms-modules.ts` marks Distribution `implementationStatus: "existing"`**. That is a **catalogue discrepancy**. CURRENT: workspace + foundation + **live direct booking**. **No** live OTA sync / channel manager. | PM chooses **one** path (build live OTA **or** partner CM). Until that ships, labels stay “direct booking + OTA foundation”. | Claiming connectivity before it exists; dual-running two live fabrics in v1. | Distribution screen states **Direct booking: live** / **OTA sync: not connected**. Never a green channel list of invented OTAs. |
| **E-M06** Permissions + Approval Thresholds | Administration is **partial**. FO has some supervisor overrides. No mid-size permission + amount-threshold product. | Role permissions **and** amount thresholds (waive, refund, unpaid checkout, rate override) as **one** control epic. | Enterprise SoD, multi-property roles. | Clerk hits a threshold → named approver, reason, audit line. No hidden “just click through”. |
| **E-M07** Mid-size report pack | S1 honesty pack is not a controller pack (manager flash, source, company, tax v1 columns). | Manager-grade rooms reports using the S1 posting / tax decisions. Still not a hotel GL. | Back Office consolidated ledger, STR export unless built. | Each report names filters and exclusions. Tax columns appear only if E-S03 delivered them. |
| **E-M08** Travel-agent / source-of-business | Source may exist as a label. Agent billing / commission is **not** a product. | Agent profile, source, and a bounded commission or bill-to path. | GDS, IATA full settlement. | Source is selectable. Commission is a posted rule or clearly “not calculated”. |
| **E-M12** Notifications & communications | Catalogue status **planned**. Not an S1 departure blocker. | Guest/staff messages the property opts into (confirm, receipt, HK task). | Marketing cloud, WhatsApp-as-PMS, offline push. | Send is real or the button is absent. No “email sent” when email is not configured. |
| **E-M09** Maintenance / engineering depth | Maintenance requests exist. Mid-size depth (SLA, block-sell, parts from shared inventory) is incomplete. | Work orders that can block a room honestly; parts from **shared** Inventory — no `pms_inventory`. | Full CMMS, capital projects. | OOO from maintenance matches the rack. Closing a WO does not silently make the room dirty/clean without HK. |
| **E-M10** Payment-collection path | Card = **recorded tender**, not gateway settlement. Path **OPEN** (§9). | A PM-chosen path: remain recorded-tender, or a bounded gateway, or a partner collect. Until decided, **do not build**. | Inventing a PSP integration “to look ready”. | Tender picker stays labelled **recorded** unless a gateway is actually live. |
| **E-M11** Security & audit | Security & Audit module **planned**. FO activity viewer is not an enterprise audit product. | Searchable audit of money, stay, permission, and approval events. | SIEM, immutable legal hold, multi-property. | Filter by stay / folio / actor. Export is honest about completeness. |
| **E-M13** Offline (optional) | Not in product. **Deferred from S1.** | Only if PM funds it: bounded desk continue + conflict rules. | Full offline hotel, OTAs offline, “works in aeroplane mode” as a brand claim without the epic. | Banner: **offline — last synced**. Conflict UI required. No silent overwrite. |

---

## 7. M1 exit gate and exclusions

### 7.1 M1 exit gate

1. E-M01 transfers are **real** (`transfersSupported` is not a lie).
2. E-M02 + E-M03 make company bill-to and routing sellable **or** PM records them as still-limited on the M1 sheet.
3. E-M05 has a **chosen and shipped** path — or Distribution remains labelled foundation + direct booking (never “live OTA”).
4. E-M06 permissions + thresholds are live for money and override actions.
5. E-M10 is either **decided and shipped** or explicitly left as recorded tender on the M1 limitations sheet.
6. Document A bar still holds. Groups are sold only if E-M04 MVP actually shipped.
7. Abel / Rekik record M1 exit.

### 7.2 M1 exclusions (still not CURRENT, still not implied)

| Excluded unless a later programme | Note |
|---|---|
| Multi-property / chain PMS | **Deferred** — not M1 default. |
| Classic nightly room-and-tax NA | Only if a post-S1 programme reopens posting. E-S02 may have kept stay-level. |
| Tax-complete / fiscal-device accounting | E-S03 v1 ≠ completeness. |
| Enterprise interfaces (GDS, police, fiscal, door-lock vendor pack) | Large. |
| Back Office hotel general ledger | Architecture-ownership: Accounting & Finance is foundation / shared, not a hotel GL. |
| Offline as a default | Optional E-M13 only. |
| LIVE OTA | Only after E-M05 ships **that** path. Catalogue `existing` is still not connectivity. |

---

## 8. Parallel vs sequential

### 8.1 Safe to parallel (after the named dependency)

| Parallel set | Condition |
|---|---|
| E-S00 labels / sheet **with** E-S01 implementation design | Only after PM answers E-S01 ± E-S00 **order** (§9). Content of the sheet must not invent E-S01 rules that PM has not chosen. |
| E-S13 ID capture **with** E-S05 or E-S10 | No shared ledger writes required. Do not block E-S01 on S13. |
| E-S11 reports **with** E-S12 room-status | Read-only / status consistency. Must consume E-S02 definitions, not invent nightly revenue. |
| E-S07 variance **with** E-S08 NA honesty | After E-S01 settle language is stable enough to reuse. |
| E-M08 agents **with** E-M09 maintenance **with** E-M12 notifications | After E-M06 thresholds exist for any message or WO that moves money or room status. |
| E-M11 audit **with** E-M07 reports | After posting / permission events exist to audit. |

### 8.2 Unsafe to parallel (sequential)

| Do not start this… | …until |
|---|---|
| E-S01 **developer** work | PM **approves** the first cycle (and E-S00 order). **NOT FOR DEVELOPER** today. |
| E-S02 implementation | Posting-model **decision** (§9). Building nightly NA “in case” is unsafe. |
| E-S03 tax v1 implementation | Tax v1 **decision** (§9) and a decided E-S02 (tax attaches to a posting model). |
| E-S04 receipt | Folio line shape from E-S01 / E-S02 / E-S03 is known enough that the statement cannot lie. |
| E-S09 public pay rules | Desk deposit / tender rules (E-S01 / E-S05) exist to copy. |
| E-S14 S1 exit pack | BLOCKER + MUST epics are accept-or-slip recorded. |
| Any **M1** build | S1 exit **or** named PM waiver. |
| E-M03 routing | E-M01 transfers are real. Routing on `transfersSupported: false` is unsafe. |
| E-M04 groups UI | §9 groups MVP = yes. Otherwise it becomes a fake group product. |
| E-M05 “OTA” UI | §9 M05 path chosen. Painting live channels is unsafe. |
| E-M10 gateway work | §9 M10 path chosen. |
| E-M13 offline | Explicit PM fund + S1 online day is already honest. |

---

## 9. PM decisions still open

Option A is **locked as the programme shape**. These product decisions are **not** locked. Engineering must not guess them.

| Decision | Options (illustrative, not a Spec) | Blocks |
|---|---|---|
| **Posting model** | Keep **stay-level** room charge (honest NA stays exception + date close) **vs** bounded nightly v1 (still **not** “classic NA complete”) | E-S02, E-S03, E-S08, E-S11, later M07 |
| **Block unpaid checkout** | Hard-block at non-zero **vs** supervisor override + reason (folio left open) **vs** settle-only in Cashiering with FO complete forbidden | E-S01 rule; E-M06 thresholds later |
| **Tax v1** | None in S1 (limitations sheet only) **vs** simple inclusive/exclusive % **vs** per-rate-plan tax as displayed today, documented as **not** a tax engine | E-S03, receipts, reports |
| **E-M05 path** | Build **live OTA** **vs** **partner channel manager** **vs** remain direct-booking + foundation through M1 | E-M05; sales claims |
| **E-M10** | Remain **recorded tender** **vs** bounded **gateway** **vs** partner collect | E-M10; must-not-promise on gateway |
| **Approve E-S01 ± E-S00 order** | **E-S01 first** (integrity, then write the sheet from the real rule) **vs** **E-S00 first** (sheet + labels before any desk-rule change) **vs** **paired** same cycle, sheet updated at accept | First cycle scheduling |
| **Groups MVP** | In M1 as E-M04 **vs** defer groups entirely to post-M1 | E-M04; mid-size MICE sales |
| **Multi-property** | **Deferred** (confirm stay deferred) **vs** reopen as Large only | Not in S1 or default M1 |

Until each row is decided, Specs may **frame** the question. They may not pick an option for the developer.

---

## 10. First cycle — E-S01 AWAITING PM APPROVAL / NOT FOR DEVELOPER

| Field | Value |
|---|---|
| **Epic** | **E-S01 Pilot Front-Desk Day Integrity** |
| **Programme** | S1 (Option A) |
| **Label** | **AWAITING PM APPROVAL** |
| **Engineering** | **NOT FOR DEVELOPER** |
| **Approvers** | Rekik and/or Abel |

This product plan **does not**:

- approve E-S01 for build
- create a Functional Spec
- create a GitHub issue
- hand work to a developer

**In scope for the future E-S01 Spec** (only after PM approval): enforceable departure integrity (stay / folio / settle / close / complete) using the PM unpaid-checkout decision; honesty about recorded tenders; no invented balance.

**Explicitly out of the first cycle** (same fence as Document A §8):

| Out of E-S01 | Why |
|---|---|
| OTA / live channel sync | Foundation + direct booking only. |
| Groups / MICE / allotments | Not a small-hotel day-integrity blocker. |
| Notifications & communications | Planned. M12. |
| New packages | [`../architecture-ownership.md`](../architecture-ownership.md). |
| Back Office ledger | Not a hotel GL. |
| Tax engine, nightly accrual, ID capture, HK automation, receipts product | Later S1 epics. Do not expand E-S01. |

**E-S00** may be scheduled before, after, or with E-S01 **only** when PM answers §9. Until then, do not open a second first cycle.

Requirement → Spec → Developer starts **only** after PM approval of this cycle.

---

## 11. Closing advisory

> **PRODUCT PLAN / OPTION A LOCKED (Rekik 2026-09-14).**
>
> Status: **READY FOR PM REVIEW** (Abel / Rekik) for the first development cycle.
>
> **E-S01 Pilot Front-Desk Day Integrity** remains **AWAITING PM APPROVAL** and **NOT FOR DEVELOPER**.
>
> This document is **not** an engineering Functional Spec. It does **not** create GitHub issues and does **not** authorise a Developer handoff by itself.
>
> Baseline: [`commercial-readiness.md`](./commercial-readiness.md). Boundaries: [`../architecture-ownership.md`](../architecture-ownership.md).
>
> Do **not** invent LIVE OTA, payment-gateway settlement, classic nightly room-and-tax night audit, groups, or tax completeness as current capabilities.
>
> PDF deliverable name: **`NORU_PMS_S1_M1_Product_Plan_Option_A_2026-09-14.pdf`**.
