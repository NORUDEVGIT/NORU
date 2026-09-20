import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import { SET6_OFFLINE_INTENT_ONLY, neverFakeOfflineReady } from "./pms-set6-sales-distribution.ts";
import { CARD8_OFFLINE_HONESTY } from "./pms-property-setup-card8.ts";
import {
  CARD8_CONFLICT_POLICIES,
  CARD8_FINANCIAL_OFFLINE,
  CARD8_OFFLINE_CAPABILITY_CODES,
  CARD8_OFFLINE_MIGRATION,
  CARD8_OFFLINE_NEVER_GATEWAY,
  CARD8_OFFLINE_POLICY_ONLY_COPY,
  CARD8_OFFLINE_RUNTIME_ABSENT,
  CARD8_OFFLINE_SCHEMA_APPLIED,
  CARD8_OFFLINE_SET6_LEGACY,
  CARD8_OFFLINE_TABLES,
  CARD8_POLICY_STATES,
  card8OfflineCapabilityErrors,
  card8OfflinePolicyErrors,
  emptyCard8OfflinePolicy,
  emptyCard8OfflineSnapshot,
  evaluateCard8OfflineReadiness,
  set6DoesNotCompleteCard8,
} from "./pms-property-setup-card8-offline.ts";

const drizzleSqlPath = join(process.cwd(), "drizzle/migrations/0090_pms_card8_offline_policy.sql");
const supabaseSqlPath = join(
  process.cwd(),
  "supabase/migrations/0090_pms_card8_offline_policy.sql",
);
const set6Lib = readFileSync(new URL("./pms-set6-sales-distribution.ts", import.meta.url), "utf8");
const set6Fns = readFileSync(
  new URL("./pms-set6-sales-distribution.functions.ts", import.meta.url),
  "utf8",
);
const offlineLib = readFileSync(
  new URL("./pms-property-setup-card8-offline.ts", import.meta.url),
  "utf8",
);
const functions = readFileSync(
  new URL("./pms-property-setup-card8-offline.functions.ts", import.meta.url),
  "utf8",
);
const tab = readFileSync(
  new URL("../components/settings/pms-card8-offline-tab.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
  "utf8",
);

function configuredSnapshot() {
  const snapshot = emptyCard8OfflineSnapshot();
  snapshot.policy = {
    ...emptyCard8OfflinePolicy(),
    configured: true,
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
  return snapshot;
}

describe("PMS Property Setup Card 8 Phase 1 Offline & Sync policy", () => {
  it("treats unsaved policy as FAIL and valid saved policy as PASS with runtime warning", () => {
    assert.equal(CARD8_OFFLINE_SCHEMA_APPLIED, true);
    const unsaved = evaluateCard8OfflineReadiness(emptyCard8OfflineSnapshot());
    assert.equal(unsaved.verdict, "FAIL");
    assert.equal(unsaved.ready, false);
    assert.ok(unsaved.blockers.some((row) => /save offline & sync policy/i.test(row)));
    assert.ok(unsaved.warnings.some((row) => /runtime limitation/i.test(row)));

    const saved = evaluateCard8OfflineReadiness(configuredSnapshot());
    assert.equal(saved.verdict, "PASS");
    assert.equal(saved.ready, true);
    assert.equal(saved.status, "in_progress");
    assert.ok(saved.warnings.includes(CARD8_OFFLINE_POLICY_ONLY_COPY));
  });

  it("never treats SET6 compatibility intent as Card 8 completion", () => {
    assert.equal(
      set6DoesNotCompleteCard8(
        { frontOfficeEnabled: true, pmsEnabled: true, savedAt: "2026-09-20T00:00:00.000Z" },
        { conflictLabel: "server wins", savedAt: "2026-09-20T00:00:00.000Z" },
      ),
      false,
    );
    assert.ok(neverFakeOfflineReady(SET6_OFFLINE_INTENT_ONLY));
    assert.doesNotMatch(set6Lib, /pms_offline_policies/);
    assert.doesNotMatch(set6Fns, /saveCard8OfflinePolicy|CARD8_OFFLINE/);
    assert.match(set6Lib, /frontOfficeEnabled/);
  });

  it("rejects runtime_supported and gateway success", () => {
    assert.deepEqual(
      [...CARD8_OFFLINE_CAPABILITY_CODES],
      [
        "front_office",
        "reservations",
        "room_status",
        "housekeeping",
        "guest_profile",
        "cashiering_controlled",
        "basic_payments_controlled",
      ],
    );
    assert.deepEqual([...CARD8_POLICY_STATES], ["unavailable", "policy_configured"]);
    assert.deepEqual(
      [...CARD8_CONFLICT_POLICIES],
      ["server_authoritative", "version_check", "business_rule", "manual_review"],
    );
    assert.deepEqual([...CARD8_FINANCIAL_OFFLINE], ["forbidden", "cash_pending_only"]);
    const gateway = emptyCard8OfflinePolicy();
    (gateway as { financialOfflinePolicy: string }).financialOfflinePolicy = "gateway_success";
    assert.ok(card8OfflinePolicyErrors(gateway).includes(CARD8_OFFLINE_NEVER_GATEWAY));
    const snapshot = configuredSnapshot();
    snapshot.capabilities[0] = {
      ...snapshot.capabilities[0]!,
      policyState: "runtime_supported" as never,
    };
    assert.ok(
      card8OfflineCapabilityErrors(snapshot.capabilities).some((row) =>
        /runtime-supported/i.test(row),
      ),
    );
  });

  it("loads and saves through restaurant-scoped APIs without a runtime engine", () => {
    assert.match(functions, /export const getCard8OfflinePolicy/);
    assert.match(functions, /export const saveCard8OfflinePolicy/);
    assert.match(functions, /canEditSet1/);
    assert.match(functions, /from\("pms_offline_policies"\)/);
    assert.match(functions, /from\("pms_offline_capabilities"\)/);
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.match(functions, /CARD8_OFFLINE_AUDIT/);
    assert.doesNotMatch(functions, /serviceWorker|indexedDB|offlineQueue|activatePmsSet1/);
    assert.doesNotMatch(
      functions,
      /post_folio_transaction|createReservation|updateHousekeepingTask/,
    );
    assert.doesNotMatch(functions, /getCard7Validation|evaluateSet1Checklist/);
  });

  it("renders policy UI with a runtime banner and no fake sync-health", () => {
    assert.match(tab, /CARD8_OFFLINE_POLICY_ONLY_COPY/);
    assert.match(tab, /pms-card8-runtime-banner/);
    assert.match(tab, /Overview \/ Policy/);
    assert.match(tab, /Offline Capabilities/);
    assert.match(tab, /Sync Settings/);
    assert.match(tab, /Conflict & Retry/);
    assert.match(tab, /Financial Safety/);
    assert.doesNotMatch(
      tab,
      /last sync|pending count|failed count|conflict count|sync health|device status/i,
    );
    assert.doesNotMatch(tab, /runtime_supported|gateway_success/);
    assert.match(section, /Card8OfflineTab/);
    assert.match(section, /restaurantId/);
    assert.match(section, /Card8ValidationTab/);
    assert.match(CARD8_OFFLINE_HONESTY, /policy only/i);
    assert.match(CARD8_OFFLINE_HONESTY, /never read Offline Ready/);
    assert.match(CARD8_OFFLINE_RUNTIME_ABSENT, /no approved offline runtime/i);
    assert.match(CARD8_OFFLINE_SET6_LEGACY, /legacy intent/i);
  });
});

describe("Card 8 dual-lane 0090", () => {
  it("keeps authored policy tables byte-identical", () => {
    assert.equal(CARD8_OFFLINE_MIGRATION, "0090_pms_card8_offline_policy.sql");
    assert.deepEqual(
      [...CARD8_OFFLINE_TABLES],
      ["pms_offline_policies", "pms_offline_capabilities"],
    );
    assert.equal(existsSync(drizzleSqlPath), true);
    assert.equal(existsSync(supabaseSqlPath), true);
    const sql = readFileSync(drizzleSqlPath, "utf8");
    assert.equal(sql, readFileSync(supabaseSqlPath, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_offline_policies/);
    assert.match(offlineLib, /pms_offline_policies/);
  });
});
