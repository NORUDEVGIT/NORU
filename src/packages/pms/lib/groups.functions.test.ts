import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 6 Groups & Blocks", () => {
  it("adds an operational group schema separate from guest account masters", () => {
    const migration = source("supabase/migrations/0096_pms_groups_blocks.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pms_groups");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pms_group_blocks");
    expect(migration).toContain("pms_group_allotment_nights");
    expect(migration).toContain("pms_group_rooming_rows");
    expect(migration).toContain("pms_group_history");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS pms_group_id");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS pms_group_block_id");
    expect(migration).toContain("Not guest_account_masters");
  });

  it("writes groups through dedicated functions and reuses createReservation for pickup", () => {
    const functions = source("src/packages/pms/lib/groups.functions.ts");
    const reservations = source("src/packages/pms/lib/reservations.functions.ts");
    expect(functions).toContain("export const createGroup");
    expect(functions).toContain("export const addGroupBlock");
    expect(functions).toContain("pms_create_operational_block");
    expect(functions).toContain("pms_activate_operational_block");
    expect(functions).toContain("stayFitsAllotment");
    expect(functions).toContain("convertRoomingRow");
    expect(functions).toContain("createReservation");
    expect(functions).toContain("pms_group_history");
    expect(reservations).toContain("pmsGroupId");
    expect(reservations).toContain("pmsGroupBlockId");
    expect(reservations).toContain("assertGroupStayPickup");
    expect(reservations).not.toMatch(/allotmentPickup/i);
  });

  it("wires a Groups workspace on the Reservations route", () => {
    const workspace = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
    const ui = source("src/packages/pms/components/reservations/groups-workspace.tsx");
    expect(workspace).toContain("Groups & Blocks");
    expect(workspace).toContain("GroupsWorkspace");
    expect(ui).toContain("listGroups");
    expect(ui).toContain("getGroup");
    expect(ui).toContain("convertRoomingRow");
    expect(ui).toContain("releaseGroupBlock");
    expect(ui).not.toContain("PmsPlaceholder");
    expect(ui).not.toContain("fo_stay_companions");
  });
});
