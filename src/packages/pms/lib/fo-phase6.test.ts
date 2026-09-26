import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canConfirmFoGuestServiceRequest,
  foGuestServiceDerivedFlags,
  foGuestServiceHeadline,
  foGuestServiceSignals,
  preferredTimeOverdue,
} from "./fo-guest-services.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO Phase 6 — canonical Guest Services source", () => {
  it("FO summary reads guest_service_history and does not write fo_guest_requests", () => {
    const fns = readRel("./fo-guest-services.functions.ts");
    assert.match(fns, /export const getFrontOfficeGuestServiceSummary/);
    assert.match(fns, /from\("guest_service_history"\)/);
    assert.match(fns, /requireGuestManager/);
    assert.match(fns, /requireReservationManager/);
    assert.match(fns, /slaConfigured: false/);
    assert.doesNotMatch(fns, /from\("fo_guest_requests"\)/);
    assert.doesNotMatch(fns, /\.insert\(/);
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    const guestRequest = sheet.slice(sheet.indexOf("export function FoGuestRequestSheet"));
    assert.match(guestRequest, /createGuestServiceRequest/);
    assert.doesNotMatch(guestRequest, /createGuestRequest/);
    assert.doesNotMatch(guestRequest, /fo_guest_requests/);
    assert.doesNotMatch(guestRequest, /setGuestRequestStatus/);
  });

  it("does not add a second request engine or Guest Services table", () => {
    const repoRoot = join(here, "../../../..");
    const names = [
      ...readdirSync(join(repoRoot, "drizzle/migrations")),
      ...readdirSync(join(repoRoot, "supabase/migrations")),
    ];
    const extra = names.filter((name) => name.startsWith("0101_") || name.startsWith("0102_"));
    assert.equal(extra.length, 0);
    const panel = readRel("../components/frontoffice/fo-guest-services-panel.tsx");
    const qv = readRel("../components/frontoffice/in-house-quick-view.tsx");
    for (const src of [panel, qv, readRel("./fo-guest-services.functions.ts")]) {
      assert.doesNotMatch(src, /CREATE TABLE/i);
      assert.doesNotMatch(src, /from\("fo_guest_requests"\)/);
    }
  });
});

describe("FO Phase 6 — summary and signals", () => {
  it("builds active request summary and derived flags from canonical statuses", () => {
    const now = Date.parse("2026-09-26T12:00:00.000Z");
    const signals = foGuestServiceSignals(
      [
        { status: "requested", priority: "urgent", preferredAt: "2026-09-26T10:00:00.000Z" },
        { status: "in_progress", priority: "normal", preferredAt: null },
        { status: "completed", priority: "urgent", preferredAt: "2026-09-01T00:00:00.000Z" },
        { status: "cancelled", priority: "high", preferredAt: null },
      ],
      now,
    );
    assert.equal(signals.activeCount, 2);
    assert.equal(signals.unresolvedCount, 2);
    assert.equal(signals.hasUrgent, true);
    assert.equal(signals.hasOverdue, true);
    assert.equal(signals.highestPriority, "urgent");
    const flags = foGuestServiceDerivedFlags(signals);
    assert.equal(flags.active_guest_request, true);
    assert.equal(flags.urgent_guest_request, true);
    assert.equal(flags.overdue_guest_request, true);
    assert.equal(flags.unresolved_service_request, true);
    assert.equal(foGuestServiceHeadline(signals), "2 active · urgent · preferred time passed");
    assert.equal(preferredTimeOverdue("2026-09-26T13:00:00.000Z", now), false);
  });

  it("does not invent SLA or department routing in Front Office", () => {
    const helpers = readRel("./fo-guest-services.ts");
    const fns = readRel("./fo-guest-services.functions.ts");
    const panel = readRel("../components/frontoffice/fo-guest-services-panel.tsx");
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    for (const src of [helpers, fns, panel, sheet.slice(sheet.indexOf("export function FoGuestRequestSheet"))]) {
      assert.doesNotMatch(src, /slaBreached|response_target|escalat/i);
      assert.doesNotMatch(src, /pms_department_routing|SET5.*routing|routeRequest/);
    }
    assert.match(panel, /SLA clock is not configured/);
    assert.match(fns, /derived: foGuestServiceDerivedFlags/);
  });
});

describe("FO Phase 6 — create, add service, QV", () => {
  it("Guest Request launches the canonical writer with stay prefill", () => {
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    const guestRequest = sheet.slice(sheet.indexOf("export function FoGuestRequestSheet"));
    assert.match(guestRequest, /createGuestServiceRequest/);
    assert.match(guestRequest, /guestId: stay.guestId/);
    assert.match(guestRequest, /reservationId: stay.id/);
    assert.match(guestRequest, /serviceTypeId/);
    assert.match(guestRequest, /priority/);
    assert.match(sheet, /invalidateQueries\(\{ queryKey: \["guest-service-history"\] \}\)/);
    assert.match(guestRequest, /refreshKeys\(queryClient\)/);
    assert.equal(canConfirmFoGuestServiceRequest({ serviceTypeId: "", description: "towels", typesConfigured: true }), false);
    assert.equal(canConfirmFoGuestServiceRequest({ serviceTypeId: "t1", description: "  ", typesConfigured: true }), false);
    assert.equal(canConfirmFoGuestServiceRequest({ serviceTypeId: "t1", description: "towels", typesConfigured: false }), false);
    assert.equal(canConfirmFoGuestServiceRequest({ serviceTypeId: "t1", description: "towels", typesConfigured: true }), true);
  });

  it("Add Service stays the folio extra writer, not a Guest Services duplicate", () => {
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    const service = sheet.slice(sheet.indexOf("export function FoAmendServiceSheet"), sheet.indexOf("export function FoAmendSpecialRequestSheet"));
    assert.match(service, /addStayService/);
    assert.match(service, /posts a stay extra to the folio/i);
    assert.doesNotMatch(service, /createGuestServiceRequest/);
  });

  it("In-House QV shows the compact Guest Services list and View all opens Guest Profile services", () => {
    const qv = readRel("../components/frontoffice/in-house-quick-view.tsx");
    const panel = readRel("../components/frontoffice/fo-guest-services-panel.tsx");
    const menu = readRel("./fo-inhouse.ts");
    assert.match(qv, /FoGuestServicesPanel/);
    assert.match(panel, /data-testid="fo-gs-panel"/);
    assert.match(panel, /View all/);
    assert.match(panel, /guestProfileSearch\(\{ card: "services" \}\)/);
    assert.match(panel, /GUEST_PROFILE_DETAIL_PATH/);
    assert.match(menu, /Guest Request/);
    assert.match(menu, /Add Service/);
    assert.match(readRel("../components/frontoffice/arrival-quick-view.tsx"), /FoGuestServicesPanel/);
    assert.match(readRel("../components/frontoffice/departure-quick-view.tsx"), /FoGuestServicesPanel/);
    assert.match(readRel("../components/frontoffice/walk-in-quick-view.tsx"), /FoGuestServicesPanel/);
  });
});
