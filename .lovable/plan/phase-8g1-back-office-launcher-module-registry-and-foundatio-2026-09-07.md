# Phase 8G1 — Back Office launcher, module registry and foundation routes

Foundation only. No database changes, no ownership migration, no business logic changes.

## What gets built

**1. Module registry** — `src/lib/back-office-modules.ts`, modelled on the existing Restaurant Management registry: groups plus ten modules with `key`, `title`, `description`, `icon`, `group`, `canonicalRoute`, optional `currentRoute` (the shared screen that exists today), optional `moduleKey` (existing module-access key used only to decide whether a "open the current screen" link is shown), `implementationStatus`, and `sourcePackages` notes.

Groups and modules, in launcher order:

- Overview — Dashboard (foundation)
- People & workforce — Human Resources (partial, shared/transitional → `/restaurant/staff`), Payroll (planned)
- Supply chain & cost — Inventory / Warehouse (partial, shared → `/restaurant/inventory`), Procurement (partial, shared → `/restaurant/inventory?tab=suppliers`), Cost Control (planned)
- Finance & intelligence — Accounting & Finance (foundation/partial, shared → `/restaurant/cashiering`), Reports & Intelligence (partial, shared → `/restaurant/reports`)
- Control & governance — Audit & Compliance (foundation), Master Data (foundation)

No module is marked "existing"; nothing is Back Office–owned today.

**2. Package home** — `/restaurant/back-office` launcher: NORU shell, property name, header "Back Office", positioning line describing it as the enterprise consolidation and control layer (not another operational package), grouped tiles with an honest status chip on each, and a clear way back to Property Home.

**3. Ten foundation routes** — `/restaurant/back-office/{dashboard,hr,payroll,inventory,procurement,accounting,reports,audit,cost-control,master-data}`. Each is a truthful foundation page: what Back Office will own, which package(s) the data will come from, what is still shared during migration, and — only when the person already has the matching module access today — a single "Open the current …" link to the existing shared screen. No metrics, no financial totals, no copied PMS/RM reports, no payroll or ledger scaffolding.

Dashboard shows which Back Office modules are enabled/available for this person, their honest status, and an explanation of the planned consolidation — no numbers.

Audit page describes future property-level audit and compliance only; it exposes no platform-admin audit data.

**4. Guard** — every one of the eleven routes uses the existing sign-in check followed by `requireRoutePackage("back_office")`. No new entitlement logic; compatibility default unchanged; disabled or expired sends the person to Property Home with the existing notice.

**5. Back Office sidebar** — the shared shell gains a `boModule` prop alongside the existing `pmsModule`/`rmModule` handling: inside `/restaurant/back-office/*` the sidebar shows Property Home, Back Office Home and the grouped Back Office modules, with breadcrumb Property Home → Back Office → submodule and context label "Back Office · <module>". PMS and Restaurant Management navigation stay hidden in this context and are otherwise untouched.

**6. Property Home** — the existing Back Office card becomes a link to `/restaurant/back-office` when the package is enabled; its current shared-service links remain beneath it. Hidden exactly as today when the package is off.

**7. Documentation** — `docs/architecture-ownership.md` gains a Back Office section: canonical routes, target ownership, current transitional source screens, status per module, what stays shared, and what later phases must migrate.

## Explicitly not in this phase

Moving Inventory, Procurement, HR, Accounting or Reports into Back Office; redirecting `/restaurant/inventory`, `/restaurant/staff`, `/restaurant/reports`, `/restaurant/configuration`, `/restaurant/settings`; any table, RLS, foreign-key, server-function or entitlement-logic change; Standalone POS split; folder reorganisation.

## Verification

Typecheck, production build, and an authenticated browser pass over the launcher and all ten foundation routes plus the retained shared screens, PMS and a public restaurant page. Package guard checked both ways (compatibility default loads; a temporary disabled entitlement blocks and is then removed). Closes with the 25-point implementation report.
