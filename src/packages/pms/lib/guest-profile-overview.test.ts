import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  OVERVIEW_BALANCE_PLACEHOLDER,
  OVERVIEW_LOYALTY_COPY,
  OVERVIEW_MIGRATION_FILE,
  OVERVIEW_REVENUE_PLACEHOLDER,
  OVERVIEW_SERVICE_EMPTY,
  canStartReservationForRole,
  formatGuestAddress,
  guestInitials,
  wave2PreferenceChips,
} from "./guest-profile-overview.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest Overview helpers", () => {
  it("formats address, initials, and reservation-start roles", () => {
    assert.equal(
      formatGuestAddress({
        addressLine1: "1 Harbour",
        city: "Cape Town",
        country: "ZA",
      }),
      "1 Harbour · Cape Town · ZA",
    );
    assert.equal(guestInitials("Ada Lovelace"), "AL");
    assert.equal(canStartReservationForRole("receptionist"), true);
    assert.equal(canStartReservationForRole("cashier"), false);
  });

  it("maps Wave 2 preference columns into overview chips without inventing values", () => {
    const chips = wave2PreferenceChips(
      {
        roomPreference: null,
        bedPreference: "King",
        floorPreference: null,
        viewPreference: null,
        foodPreference: null,
        communicationPreference: null,
        accessibilityRequirements: "Step-free",
        specialRequests: null,
      },
      { bedPreference: "Bed" },
      (_key, stored) => stored,
    );
    assert.deepEqual(
      chips.map((chip) => chip.label),
      ["Bed", "Accessibility"],
    );
  });
});

describe("Guest Overview honesty", () => {
  it("keeps revenue and outstanding as placeholders and does not fake points", () => {
    const overview = readRel("../components/guests/guest-overview-card.tsx");
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    const functions = readRel("./guests.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0086_pms_guest_overview.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0086_pms_guest_overview.sql");

    assert.equal(OVERVIEW_MIGRATION_FILE, "0086_pms_guest_overview.sql");
    assert.match(overview, /guest-overview/);
    assert.match(overview, /OVERVIEW_REVENUE_PLACEHOLDER/);
    assert.match(overview, /OVERVIEW_BALANCE_PLACEHOLDER/);
    assert.match(overview, /OVERVIEW_SERVICE_EMPTY|listGuestServiceHistory/);
    assert.match(overview, /OVERVIEW_LOYALTY_COPY/);
    assert.doesNotMatch(overview, /room_subtotal|lifetime spend/i);
    assert.match(dashboard, /OVERVIEW_REVENUE_PLACEHOLDER/);
    assert.match(dashboard, /guest-dashboard-kpi-upcoming/);
    assert.doesNotMatch(dashboard, /\$4,500|12,500/);
    assert.match(functions, /listGuestPreferenceSummary/);
    assert.match(functions, /listGuestServiceHistory/);
    assert.match(functions, /createGuestPhotoUpload/);
    assert.match(functions, /guest_preference_values/);
    assert.match(functions, /guest_service_history/);
    assert.doesNotMatch(functions, /getGuestRevenue/);
    assert.match(migration, /guest_profile_counters/);
    assert.match(migration, /guest_preference_values/);
    assert.match(migration, /guest_service_history/);
    assert.equal(migration, drizzle);
    assert.match(OVERVIEW_REVENUE_PLACEHOLDER, /Placeholder until Revenue/);
    assert.match(OVERVIEW_BALANCE_PLACEHOLDER, /Placeholder until Financial/);
    assert.match(OVERVIEW_SERVICE_EMPTY, /No guest service records yet/);
    assert.match(OVERVIEW_LOYALTY_COPY, /no points balance/i);
  });

  it("composes Overview from existing guest APIs and prefill New Reservation", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const header = readRel("../components/guests/guest-profile-header.tsx");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const booking = readRel("../../../routes/restaurant/bookings/new.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");

    assert.match(shell, /GuestOverviewCard/);
    assert.match(shell, /defaultGuestProfileCard|dashboard/);
    assert.match(header, /New Reservation/);
    assert.match(header, /guestId: guest.id/);
    assert.match(header, /createGuestPhotoUpload/);
    assert.match(form, /preferredContactMethod/);
    assert.match(booking, /guestId/);
    assert.match(booking, /fetchPrefillGuest/);
    assert.match(directory, /displayProfileNumber\(g.id, g.profileNumber\)/);
  });
});
