import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveHousekeepingDataScope } from "@/core/lib/module-access";
import {
  PHASE25_RETIRED_PMS_PERMISSION_CODES,
  PMS_PERMISSION_CODES,
  PMS_PERMISSION_DENIED,
  PMS_PERMISSIONS,
  actorMayAssignRole,
  actorMayGrantPermissions,
  assertOwnerMembershipUntouched,
  isPmsPermissionCode,
  isRetiredPmsPermissionCode,
} from "./pms-permissions";
import { hasEffectivePermission } from "./pms-permissions.server";
import { assertActivePmsStaffHasRole } from "./pms-staff-rules";

const root = join(process.cwd(), "src/packages/pms");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("Phase 2.5 property and staff rules", () => {
  it("property configure does not imply go-live", () => {
    const configure = {
      isOwner: false,
      codes: new Set([PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE]),
    };
    assert.equal(hasEffectivePermission(configure as never, PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE), true);
    assert.equal(hasEffectivePermission(configure as never, PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE), false);
    const owner = { isOwner: true, codes: new Set<string>() };
    assert.equal(hasEffectivePermission(owner as never, PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE), true);
  });

  it("rooms setup and room inventory view are different permissions", () => {
    const viewer = { isOwner: false, codes: new Set([PMS_PERMISSIONS.ROOM_INVENTORY_VIEW]) };
    assert.equal(hasEffectivePermission(viewer as never, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE), false);
    const setup = { isOwner: false, codes: new Set([PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW]) };
    assert.equal(hasEffectivePermission(setup as never, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE), true);
  });

  it("organization configure does not grant staff or role administration", () => {
    const org = { isOwner: false, codes: new Set([PMS_PERMISSIONS.CONFIG_ORGANIZATION_CONFIGURE]) };
    assert.equal(hasEffectivePermission(org as never, PMS_PERMISSIONS.STAFF_VIEW), false);
    assert.equal(hasEffectivePermission(org as never, PMS_PERMISSIONS.ROLES_CREATE), false);
  });

  it("integration configure does not grant fiscal document authorization", () => {
    const integration = { isOwner: false, codes: new Set([PMS_PERMISSIONS.CONFIG_INTEGRATION_CONFIGURE]) };
    assert.equal(hasEffectivePermission(integration as never, PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE), false);
  });

  it("lets a non-owner grant only a subset of their own permissions", () => {
    const actor = { isOwner: false, codes: [PMS_PERMISSIONS.ROLES_VIEW, PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS] };
    assert.equal(
      actorMayGrantPermissions(actor, [PMS_PERMISSIONS.ROLES_VIEW]),
      true,
    );
    assert.equal(
      actorMayGrantPermissions(actor, [PMS_PERMISSIONS.ROLES_VIEW, PMS_PERMISSIONS.CASHIERING_VIEW]),
      false,
    );
    assert.equal(actorMayAssignRole(actor, [PMS_PERMISSIONS.ROLES_VIEW]), true);
    assert.equal(actorMayAssignRole({ isOwner: true, codes: [] }, [PMS_PERMISSIONS.CASHIERING_REFUND, PMS_PERMISSIONS.CASHIERING_VIEW]), true);
  });

  it("rejects active PMS staff with zero roles and blocks non-owner changes to Owner", () => {
    assert.throws(() => assertActivePmsStaffHasRole(true, []), /at least one role/);
    assert.doesNotThrow(() => assertActivePmsStaffHasRole(false, []));
    assert.throws(() => assertOwnerMembershipUntouched(false, "owner"), new RegExp(PMS_PERMISSION_DENIED));
    assert.doesNotThrow(() => assertOwnerMembershipUntouched(true, "owner"));
    assert.doesNotThrow(() => assertOwnerMembershipUntouched(false, "receptionist"));
  });

  it("treats a housekeeper role string as row scope only", () => {
    assert.equal(resolveHousekeepingDataScope("housekeeper"), "housekeeper");
    assert.equal(hasEffectivePermission({ isOwner: false, codes: new Set() } as never, PMS_PERMISSIONS.HOUSEKEEPING_VIEW), false);
    assert.equal(
      hasEffectivePermission(
        { isOwner: false, codes: new Set([PMS_PERMISSIONS.HOUSEKEEPING_VIEW]) } as never,
        PMS_PERMISSIONS.HOUSEKEEPING_TASK_EDIT,
      ),
      false,
    );
  });

  it("derives capability flags from permissions, including a Manager-named role with no grants", () => {
    const namedManager = { isOwner: false, codes: new Set<string>() };
    const granted = { isOwner: false, codes: new Set([PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE]) };
    const owner = { isOwner: true, codes: new Set<string>() };
    assert.equal(hasEffectivePermission(namedManager as never, PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(hasEffectivePermission(granted as never, PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE), true);
    assert.equal(hasEffectivePermission(owner as never, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), true);
  });
});

describe("Phase 2.5 source locks", () => {
  const files = walk(root);

  it("does not call canEditSet1 from PMS server functions", () => {
    const offenders = files.filter((file) => {
      if (!file.endsWith(".functions.ts")) return false;
      return readFileSync(file, "utf8").includes("canEditSet1(");
    });
    assert.deepEqual(offenders, []);
  });

  it("does not write restaurant_users.hotel_role_id", () => {
    const offenders = files.filter((file) =>
      /\.update\(\s*\{[^}]*hotel_role_id/.test(readFileSync(file, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });

  it("uses one charge code and one folio-close code", () => {
    const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
    assert.equal(joined.includes("cashiering.folio.charge.post"), false);
    assert.equal(joined.includes("cashiering.folio.close"), false);
    assert.equal(PMS_PERMISSIONS.CASHIERING_CHARGE_POST, "cashiering.charge.post");
    assert.equal(PMS_PERMISSIONS.CASHIERING_FOLIO_CLOSE, "cashiering.folio.authorize");
  });

  it("only references typed permission constants from requirePmsActor", () => {
    const unknown: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/requireP(?:ermission|msActor)(?:Any|All)?\([^;\n]{0,180}["'][a-z]+\.[a-z]/.test(src)) unknown.push(file);
    }
    assert.deepEqual(unknown, []);
    for (const code of PMS_PERMISSION_CODES) assert.equal(isPmsPermissionCode(code), true);
    for (const code of PHASE25_RETIRED_PMS_PERMISSION_CODES) {
      assert.equal(isPmsPermissionCode(code), false);
      assert.equal(isRetiredPmsPermissionCode(code), true);
    }
  });

  it("retires duplicate codes in migration 0194 without deleting rows", () => {
    const supabase = readFileSync(join(process.cwd(), "supabase/migrations/0194_pms_rbac_phase25.sql"), "utf8");
    const drizzle = readFileSync(join(process.cwd(), "drizzle/migrations/0194_pms_rbac_phase25.sql"), "utf8");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /SET active = false/);
    assert.doesNotMatch(supabase, /DELETE FROM public\.pms_permissions/);
    for (const code of PHASE25_RETIRED_PMS_PERMISSION_CODES) {
      assert.match(supabase, new RegExp(`'${code}'`));
    }
  });
});
