/**
 * Create Reservation Phase 1 — Section 8: Packages GATE (Issue #151).
 *
 * Additive expansion of `/restaurant/bookings/new`. Setup `pms_packages` catalogue EXISTS (SET3).
 * Create bind + `quoteStay` package lines DO NOT EXIST.
 * Ship a visible gated Packages honesty box — detect only, no selectable attach.
 *
 * TIP locked (Rekik APPROVED 2026-09-15):
 * 1. Visible gated box (not omit-only).
 * 2. Reuse `getPmsSet3Snapshot` — no new catalog RPC.
 * 3. Settings link only for SET3 editors (owner|manager / canEditSet1).
 *    Receptionist honesty: omit the link (no silent denied editor).
 * 4. Bind OUT — no package arg on `createReservation` /
 *    `create_hotel_reservation_priced`, no new column, no notes smuggling.
 * 5. Sticky compose carefully with §5/§6 — honest “not attached / not in
 *    quote”. Do not invent package amounts or `0.00`. Do not replace
 *    Section 5 rate/total or Section 6 Room line.
 *
 * Guest Waves 1–5 + GE1–GE3 stay closed. Section 8 does not claim Phase 1
 * or Create Reservation DONE. Guarantee chrome is Section 7.
 * Migration for this section: NONE. Capability-only — no RLS model change.
 * Flag Abel: NOT required.
 */

import { SET3_PACKAGES_WARNING, SET3_RATES_UNAVAILABLE } from "./pms-set3-rates-guest.ts";

export const CREATE_RESERVATION_SECTION8_ISSUE = 151;
export const CREATE_RESERVATION_SECTION8_MIGRATION = "NONE";
export const CREATE_RESERVATION_SECTION8_FLAG_ABEL = "NOT required";

/** TIP pick 1: visible gated honesty card so detect ACs are testable. */
export const CREATE_RESERVATION_PACKAGES_BOX = "visible-gated";

/** TIP pick 2: detect via CURRENT SET3 snapshot. */
export const CREATE_RESERVATION_PACKAGES_DETECT_API = "getPmsSet3Snapshot";

/** TIP pick 3: Settings deep-link only when actor can edit SET3. */
export const CREATE_RESERVATION_PACKAGES_SETTINGS_LINK_RULE = "set3-editors-only";

/** TIP pick 4: bind stays OUT this section. */
export const CREATE_RESERVATION_PACKAGES_BIND = "out";

/** TIP pick 5: sticky honesty without replacing §5/§6 lines. */
export const CREATE_RESERVATION_PACKAGES_STICKY = "not-attached-not-in-quote";

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION8 = [
  "AC-CR8-1",
  "AC-CR8-2",
  "AC-CR8-3",
  "AC-CR8-4",
  "AC-CR8-5",
  "AC-CR8-6",
  "AC-CR8-7",
  "AC-CR8-8",
  "AC-CR8-9",
  "AC-CR8-10",
  "AC-CR8-11",
  "AC-CR8-12",
  "AC-CR8-13",
  "AC-CR8-14",
  "AC-CR8-15",
  "AC-CR8-16",
  "AC-CR8-17",
  "AC-CR8-18",
  "AC-CR8-19",
  "AC-CR8-20",
  "AC-CR8-21",
  "AC-CR8-22",
] as const;

export const CREATE_RESERVATION_SECTION8_TIP_AC_MAP = {
  "plan-detect-gate-box": ["AC-CR8-1", "AC-CR8-2", "AC-CR8-3", "AC-CR8-4"],
  "plan-bind-sticky-quote": ["AC-CR8-5", "AC-CR8-6", "AC-CR8-7", "AC-CR8-8"],
  "plan-permissions-closed": ["AC-CR8-9", "AC-CR8-10", "AC-CR8-11"],
  "plan-out-gates": [
    "AC-CR8-12",
    "AC-CR8-13",
    "AC-CR8-14",
    "AC-CR8-15",
    "AC-CR8-16",
    "AC-CR8-17",
    "AC-CR8-18",
    "AC-CR8-19",
    "AC-CR8-20",
    "AC-CR8-21",
    "AC-CR8-22",
  ],
} as const;

export const CREATE_RESERVATION_SECTION8_SCOPE =
  "Section 8 is Packages GATE — catalog detect and honesty only. Attach, bind, and quote lines are not LIVE. Guarantee chrome remains Section 7. This section does not claim Phase 1 or Create Reservation DONE.";

export const CREATE_RESERVATION_SECTION8_PROGRAMME_RULE =
  "Reference packages functionality only if CURRENT supports (create bind / quote do not). Detect Setup catalogue via getPmsSet3Snapshot. Modern NORU gated box. Do not clone legacy chrome. Do not invent a catalog or pricing engine.";

export const CREATE_RESERVATION_SECTION8_DETECT_DOC =
  "Detect reuses getPmsSet3Snapshot / loadSet3Snapshot (packagesAvailable + active count). No parallel catalog RPC. Schema missing aligns with SET3_RATES_UNAVAILABLE; empty aligns with SET3_PACKAGES_WARNING.";

export const CREATE_RESERVATION_PACKAGES_SET3_SCHEMA_COPY = SET3_RATES_UNAVAILABLE;
export const CREATE_RESERVATION_PACKAGES_SET3_EMPTY_COPY = SET3_PACKAGES_WARNING;

export const CREATE_RESERVATION_PACKAGES_CREATE_ALLOWED = "Create is allowed without a package.";

export const CREATE_RESERVATION_PACKAGES_NOT_ATTACHED =
  "Packages are not attached on create and are not in this quote. Create is allowed without a package.";

export const CREATE_RESERVATION_PACKAGES_CHECKING = "Checking stay packages…";

export const CREATE_RESERVATION_PACKAGES_ERROR =
  "Stay packages could not be checked. Create is allowed without a package.";

export const CREATE_RESERVATION_PACKAGES_GATE_BADGE = "Not attached";

export const CREATE_RESERVATION_PACKAGES_SETTINGS_LINK = "Open Settings packages";

export const CREATE_RESERVATION_PACKAGES_SETTINGS_HREF = "/restaurant/settings#rates";

export const CREATE_RESERVATION_STICKY_PACKAGES =
  "Packages not attached on create — not in this quote.";

export const CREATE_RESERVATION_SECTION8_MIGRATION_REASON =
  "Setup pms_packages already exists (0049). createReservation → create_hotel_reservation_priced has no package arg. hotel_reservations has no package column. quoteStay / price_hotel_stay are room-plan only. Section 8 is catalog detect + gated honesty UX only. No new columns. No SECURITY DEFINER replace. Dual-lane APPLY not required. Flag Abel: NOT required.";

export const CREATE_RESERVATION_SECTION8_PERMISSION_DOC =
  "Detect uses getPmsSet3Snapshot (PMS package + membership). Settings deep-link only when canEditSet1 (owner|manager). Receptionist sees honesty without a Settings editor link. requireRoutePackage(\"pms\") and requireReservationManager unchanged. Capability-only — no RLS / entitlement model change.";

export const CREATE_RESERVATION_SECTION8_PARALLEL_OK =
  "Section 6 room assign and Section 7 Spec drafting are not blocked by this gate.";

export const CREATE_RESERVATION_SECTION8_LOCKED_NON_GOALS = [
  "selectable package attach",
  "invent catalog / pricing / RPC bind",
  "FO extras as packages",
  "meal plans on create",
  "commission settlement",
  "LIVE OTA / RMS package mapping",
  "email/SMS send confirmation",
  "notes / special-requests smuggling",
  "package 0.00 / fake sticky total",
  "parent Company Reservation CR-100",
  "new entitlement / RLS architecture",
  "Phase 1 / Create Reservation DONE claim",
] as const;

export type CreatePackagesCatalogState = "schema_missing" | "empty" | "active_not_attached";

export type CreatePackagesGateView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: CreatePackagesCatalogState; activeCount: number };

export function detectCreatePackagesCatalog(input: {
  packagesAvailable: boolean;
  activePackageCount: number;
}): CreatePackagesCatalogState {
  if (!input.packagesAvailable) return "schema_missing";
  if (input.activePackageCount <= 0) return "empty";
  return "active_not_attached";
}

export function resolveCreatePackagesGateView(input: {
  loading: boolean;
  error: boolean;
  packagesAvailable: boolean;
  activePackageCount: number;
}): CreatePackagesGateView {
  if (input.loading) return { kind: "loading" };
  if (input.error) return { kind: "error" };
  const state = detectCreatePackagesCatalog({
    packagesAvailable: input.packagesAvailable,
    activePackageCount: input.activePackageCount,
  });
  return {
    kind: state,
    activeCount: state === "active_not_attached" ? input.activePackageCount : 0,
  };
}

export function packagesGateCopy(view: CreatePackagesGateView): string {
  if (view.kind === "loading") return CREATE_RESERVATION_PACKAGES_CHECKING;
  if (view.kind === "error") return CREATE_RESERVATION_PACKAGES_ERROR;
  if (view.kind === "schema_missing") {
    return `${CREATE_RESERVATION_PACKAGES_SET3_SCHEMA_COPY} ${CREATE_RESERVATION_PACKAGES_CREATE_ALLOWED}`;
  }
  if (view.kind === "empty") {
    return `${CREATE_RESERVATION_PACKAGES_SET3_EMPTY_COPY} ${CREATE_RESERVATION_PACKAGES_CREATE_ALLOWED}`;
  }
  return CREATE_RESERVATION_PACKAGES_NOT_ATTACHED;
}

export function stickyPackagesCopy(): string {
  return CREATE_RESERVATION_STICKY_PACKAGES;
}

/** Settings deep-link only for SET3 editors. Omit for receptionist. */
export function canShowPackagesSettingsLink(canEditSet3: boolean): boolean {
  return canEditSet3 === true;
}

export function activePackageCountFromRows(packages: ReadonlyArray<{ active: boolean }>): number {
  return packages.filter((row) => row.active).length;
}
