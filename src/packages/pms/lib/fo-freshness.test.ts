import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FO_CHECK_IN_POLL_MS,
  FO_FRESHNESS_BOUNDS,
  FO_OPERATIONAL_POLL_MS,
  foOperationalQueryOptions,
} from "@/packages/pms/lib/fo-freshness";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("FO-07 freshness bounds", () => {
  it("polls an open desk and stays idle in a background tab", () => {
    expect(FO_OPERATIONAL_POLL_MS).toBe(30_000);
    expect(FO_CHECK_IN_POLL_MS).toBe(20_000);
    expect(foOperationalQueryOptions()).toEqual({
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    });
    expect(FO_FRESHNESS_BOUNDS.rack).toContain("30 seconds");
    expect(FO_FRESHNESS_BOUNDS.checkIn).toContain("20 seconds");
  });

  it("applies the bound to rack, arrivals, in-house, departures, exceptions, and check-in", () => {
    const sources = [
      "src/packages/pms/components/frontoffice/room-rack-calendar.tsx",
      "src/packages/pms/components/workspaces/arrivals-workspace.tsx",
      "src/packages/pms/components/workspaces/in-house-workspace.tsx",
      "src/packages/pms/components/workspaces/departures-workspace.tsx",
      "src/packages/pms/components/frontoffice/fo-exceptions-frame.tsx",
      "src/packages/pms/components/frontoffice/fo-checkin-v2-workspace.tsx",
    ].map(read);
    for (const source of sources) {
      expect(source).toContain("foOperationalQueryOptions");
    }
    expect(sources[0]).toContain('data-testid="fo-rack-refresh"');
    expect(sources[1]).toContain('data-testid="fo-arrivals-refresh"');
    expect(sources[2]).toContain('data-testid="fo-inhouse-refresh"');
    expect(sources[3]).toContain('data-testid="fo-departures-refresh"');
    expect(sources[4]).toContain('data-testid="fo-exceptions-refresh"');
    expect(sources[5]).toContain('data-testid="fo-ci-v2-refresh"');
    expect(sources[5]).toContain("FO_CHECK_IN_POLL_MS");
  });

  it("invalidates Front Office reads after housekeeping, inventory, cashiering, and guest writes", () => {
    const owners = [
      "src/packages/pms/components/housekeeping/housekeeping-board.tsx",
      "src/packages/pms/components/housekeeping/housekeeping-tabs.tsx",
      "src/packages/pms/components/rooms/rooms-dashboard.tsx",
      "src/packages/pms/components/rooms/rooms-tab.tsx",
      "src/packages/pms/components/rooms/room-inventory-inventory.tsx",
      "src/packages/pms/components/cashiering/guest-folio-page.tsx",
      "src/packages/pms/components/cashiering/financial-account-workspace.tsx",
      "src/packages/pms/components/guests/guest-form-dialog.tsx",
    ].map(read);
    for (const source of owners) {
      expect(source).toContain("invalidateFrontOfficeOwnerReads");
    }
    const contract = read("src/packages/pms/lib/fo-freshness.ts");
    expect(contract).toContain('["front-office"]');
    expect(contract).toContain('["fo-ci-v2-readiness"]');
    expect(contract).toContain('["fo-ci-v2-cashiering"]');
    expect(contract).toContain('["fo-ci-v2-guest"]');
    expect(contract).not.toContain("supabase.channel");
  });
});
