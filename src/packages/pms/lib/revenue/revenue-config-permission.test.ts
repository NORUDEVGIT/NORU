import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVENUE_CONFIG_LOAD_ERROR,
  REVENUE_CONTROL_LOAD_ERROR,
  revenueUiError,
  toRevenueReadError,
} from "./revenue-read-error.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function sliceExport(source: string, name: string) {
  const start = source.indexOf(`export const ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("Rate & Revenue permission hotfix — trusted reads", () => {
  it("A. authorized owner can load Revenue base config after requireRateManager", () => {
    const fns = readRel("./revenue-config.functions.ts");
    const base = sliceExport(fns, "getRevenueBaseConfig");
    assert.match(base, /requireRateManager/);
    assert.match(base, /supabaseAdmin/);
    assert.match(base, /loadRevenueBaseConfig\(supabaseAdmin/);
    assert.doesNotMatch(base, /loadRevenueBaseConfig\(context\.supabase/);
    const roles = readRel("../rates.server.ts");
    assert.match(roles, /RATE_MANAGE_ROLES = \["owner", "manager"\]/);
  });

  it("B. authorized manager can load Revenue base config", () => {
    const roles = readRel("../rates.server.ts");
    assert.match(roles, /RATE_MANAGE_ROLES = \["owner", "manager"\]/);
    const requireFn = roles.slice(
      roles.indexOf("export async function requireRateManager"),
      roles.indexOf("export function blankToNull"),
    );
    assert.match(requireFn, /requireModuleRole/);
    assert.match(requireFn, /RATE_MANAGE_ROLES/);
    assert.match(requireFn, /withPmsPackage/);
  });

  it("C. foreign restaurantId is rejected", () => {
    const requireFn = readRel("../rates.server.ts");
    assert.match(requireFn, /requireModuleRole/);
    const membership = readRel("../../../../core/lib/workforce.server.ts");
    assert.match(membership, /You don't have access to this restaurant/);
    assert.match(membership, /eq\("restaurant_id", restaurantId\)/);
    assert.match(membership, /eq\("user_id", context.userId\)/);
  });

  it("D. unauthorized role remains rejected", () => {
    const requireFn = readRel("../rates.server.ts");
    assert.match(requireFn, /RATE_MANAGE_ROLES/);
    assert.doesNotMatch(requireFn, /receptionist|accountant|cashier/);
    const access = readRel("./revenue-access.ts");
    assert.match(access, /REVENUE_OPERATE_ROLES = \["owner", "manager"\]/);
  });

  it("E. room types load through the trusted base-config path", () => {
    const fns = readRel("./revenue-config.functions.ts");
    const list = sliceExport(fns, "listRevenueRoomTypes");
    assert.match(list, /requireRateManager/);
    assert.match(list, /loadRevenueRoomTypes\(supabaseAdmin/);
    const server = readRel("./revenue-config.server.ts");
    assert.match(server, /from\("room_types"\)/);
    assert.match(server, /loadRevenueRoomTypes/);
  });

  it("F. rate plans load through the trusted base-config path", () => {
    const fns = readRel("./revenue-config.functions.ts");
    const list = sliceExport(fns, "listRevenueRatePlans");
    assert.match(list, /requireRateManager/);
    assert.match(list, /loadRevenueRatePlans\(supabaseAdmin/);
    const server = readRel("./revenue-config.server.ts");
    assert.match(server, /from\("hotel_rate_plans"\)/);
  });

  it("G. successful empty config still renders not configured", () => {
    const bar = readRel("../../components/rates/revenue-context-bar.tsx");
    assert.match(bar, /No room types are configured for this property/);
    assert.match(bar, /No rate plans are configured for this property/);
    assert.match(bar, /status === "loading"/);
    assert.match(bar, /status === "error"/);
  });

  it("H. failed config request renders error, not a fake empty catalogue", () => {
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    const bar = readRel("../../components/rates/revenue-context-bar.tsx");
    assert.match(workspace, /baseQuery.isSuccess \? baseQuery.data.roomTypes : \[\]/);
    assert.match(workspace, /baseQuery.isSuccess \? baseQuery.data.ratePlans : \[\]/);
    assert.match(workspace, /coreConfigStatus/);
    assert.match(bar, /REVENUE_CONFIG_LOAD_ERROR/);
    assert.match(bar, /status=\{coreConfigStatus\}/);
    assert.equal(REVENUE_CONFIG_LOAD_ERROR, "Revenue configuration could not be loaded.");
  });

  it("I. Revenue Control loads property context through the same trusted path", () => {
    const fns = readRel("./revenue-control.functions.ts");
    const server = readRel("./revenue-control.server.ts");
    assert.match(fns, /requireRateManager/);
    assert.match(fns, /supabaseAdmin/);
    assert.match(fns, /loadRevenueControlWorkspace\(supabaseAdmin/);
    assert.doesNotMatch(fns, /loadRevenueControlWorkspace\(context\.supabase/);
    assert.match(server, /loadRevenueProperty/);
    assert.doesNotMatch(server, /async function loadCurrency/);
  });

  it("J. no pricing behavior changed", () => {
    const ratesFns = readRel("../rates.functions.ts");
    assert.match(ratesFns, /rpc\("price_hotel_stay"/);
    assert.match(ratesFns, /rpc\("reprice_hotel_reservation"/);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(!migrations.some((name) => /p2.?hotfix|revenue.config.permission|restaurants.select/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
  });

  it("maps privileged database errors to generic copy", () => {
    const mapped = toRevenueReadError(
      new Error("permission denied for table restaurants"),
      REVENUE_CONFIG_LOAD_ERROR,
    );
    assert.equal(mapped.message, REVENUE_CONFIG_LOAD_ERROR);
    assert.equal(
      revenueUiError(new Error("permission denied for table restaurants"), REVENUE_CONTROL_LOAD_ERROR),
      REVENUE_CONTROL_LOAD_ERROR,
    );
    assert.equal(toRevenueReadError(new Error("Property not found.")).message, "Property not found.");
  });

  it("does not convert a restaurants permission failure into an empty property", () => {
    const server = readRel("./revenue-config.server.ts");
    const property = server.slice(
      server.indexOf("export async function loadRevenueProperty"),
      server.indexOf("export async function loadRevenueRoomTypes"),
    );
    assert.match(property, /if \(result.error\) throw new Error\(result.error.message\)/);
    assert.match(property, /if \(!row\) throw new Error\("Property not found."\)/);
    assert.doesNotMatch(property, /return \[\]/);
  });
});
