import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  LEGACY_ACTIVE_PMS_PERMISSION_CODES,
  PMS_PERMISSIONS,
  PMS_PERMISSION_CODES,
  PMS_PERMISSION_CROSS_TENANT,
  PMS_PERMISSION_DENIED,
  PMS_PERMISSION_PARENT_VIEW,
  PMS_PERMISSION_RISK,
  PMS_PERMISSION_UNKNOWN,
  PMS_PERMISSION_VIEW_REQUIRED,
  PROFILE_MUST_CHANGE_PASSWORD_DEFAULT,
  RETIRED_PMS_PERMISSION_CODES,
  actorMayAssignRole,
  actorMayGrantPermissions,
  assertRolePermissionGrants,
  criticalPermissionCodes,
  isPmsPermissionCode,
  mustChangePasswordFromProfile,
  parentViewPermission,
  permissionRisk,
  roleGrantErrors,
  unionPermissionCodes,
} from "./pms-permissions.ts";
import {
  assertAllEffectivePermissions,
  assertAnyEffectivePermission,
  assertAssignableHotelRole,
  assertEffectivePermission,
  assignMembershipRole,
  hasEffectivePermission,
  listMembershipRoles,
  listPermissionGrantSources,
  loadUnionPermissionCodes,
  removeMembershipRole,
  resolveEffectivePermissions,
  resolveMembershipPermissions,
} from "./pms-permissions.server.ts";

const DRIZZLE_0193 = join(process.cwd(), "drizzle/migrations/0193_pms_rbac_foundation.sql");
const SUPABASE_0193 = join(process.cwd(), "supabase/migrations/0193_pms_rbac_foundation.sql");

function extractPermissionCodes(sql: string): string[] {
  return [...sql.matchAll(/\('([a-z][a-z0-9_.]+)'/g)].map((match) => match[1]);
}

function createStore() {
  return {
    restaurant_users: [] as Array<Record<string, unknown>>,
    pms_membership_roles: [] as Array<Record<string, unknown>>,
    pms_hotel_roles: [] as Array<Record<string, unknown>>,
    pms_role_permissions: [] as Array<Record<string, unknown>>,
    pms_permissions: [] as Array<Record<string, unknown>>,
  };
}

function createClient(store: ReturnType<typeof createStore>) {
  function from(table: keyof ReturnType<typeof createStore>) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let insertPayload: Record<string, unknown> | null = null;
    let deleting = false;
    const apply = () =>
      (store[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
    const self: {
      select: () => typeof self;
      eq: (col: string, val: unknown) => typeof self;
      in: (col: string, vals: unknown[]) => typeof self;
      order: () => typeof self;
      insert: (payload: Record<string, unknown>) => typeof self;
      delete: () => typeof self;
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
      single: () => Promise<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      }>;
      then: (
        onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      select() {
        return self;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return self;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return self;
      },
      order() {
        return self;
      },
      insert(payload: Record<string, unknown>) {
        insertPayload = payload;
        return self;
      },
      delete() {
        deleting = true;
        return self;
      },
      async maybeSingle() {
        return { data: apply()[0] ?? null, error: null };
      },
      async single() {
        if (insertPayload) {
          const duplicate = (store[table] ?? []).some(
            (row) =>
              row.membership_id === insertPayload?.membership_id &&
              row.role_id === insertPayload.role_id,
          );
          if (duplicate)
            return {
              data: null,
              error: { message: "duplicate key value violates unique constraint" },
            };
          const row = {
            id: String(insertPayload.id ?? `row-${(store[table] ?? []).length + 1}`),
            created_at: "2026-01-01T00:00:00Z",
            ...insertPayload,
          };
          store[table] = [...(store[table] ?? []), row];
          return { data: row, error: null };
        }
        const row = apply()[0] ?? null;
        return { data: row, error: row ? null : { message: "not found" } };
      },
      then(onFulfilled, onRejected) {
        if (deleting) {
          store[table] = (store[table] ?? []).filter(
            (row) => !filters.every((filter) => filter(row)),
          );
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: apply(), error: null }).then(onFulfilled, onRejected);
      },
    };
    return self;
  }
  return { from };
}

function seedPermission(
  store: ReturnType<typeof createStore>,
  id: string,
  code: string,
  active = true,
) {
  store.pms_permissions.push({ id, code, active });
}

function seedRole(
  store: ReturnType<typeof createStore>,
  input: { id: string; restaurantId: string; name: string; active?: boolean },
) {
  store.pms_hotel_roles.push({
    id: input.id,
    restaurant_id: input.restaurantId,
    name: input.name,
    active: input.active !== false,
  });
}

function seedGrant(
  store: ReturnType<typeof createStore>,
  input: { roleId: string; restaurantId: string; permissionId: string; allowed?: boolean },
) {
  store.pms_role_permissions.push({
    role_id: input.roleId,
    restaurant_id: input.restaurantId,
    permission_id: input.permissionId,
    allowed: input.allowed !== false,
  });
}

describe("PMS RBAC Phase 1 catalogue", () => {
  it("locks 98 distinct typed permission codes with parent View and risk metadata", () => {
    assert.equal(PMS_PERMISSION_CODES.length, 98);
    assert.equal(new Set(PMS_PERMISSION_CODES).size, 98);
    for (const code of PMS_PERMISSION_CODES) {
      assert.equal(PMS_PERMISSION_PARENT_VIEW[code], parentViewPermission(code));
      assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(PMS_PERMISSION_RISK[code]));
      assert.equal(isPmsPermissionCode(code), true);
      assert.equal(RETIRED_PMS_PERMISSION_CODES.includes(code as never), false);
    }
    assert.deepEqual(criticalPermissionCodes(), [
      PMS_PERMISSIONS.RESERVATION_OVERBOOKING_AUTHORIZE,
      PMS_PERMISSIONS.GUEST_PRIVACY_DELETE,
      PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
      PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE,
      PMS_PERMISSIONS.NIGHT_AUDIT_FISCAL_AUTHORIZE,
      PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE,
      PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE,
      PMS_PERMISSIONS.ROLES_CREATE,
      PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,
    ]);
    assert.equal(permissionRisk(PMS_PERMISSIONS.CASHIERING_WRITE_OFF), "CRITICAL");
    assert.equal(permissionRisk(PMS_PERMISSIONS.DASHBOARD_VIEW), "LOW");
    assert.equal(permissionRisk(PMS_PERMISSIONS.RESERVATION_CREATE), "MEDIUM");
    assert.equal(permissionRisk(PMS_PERMISSIONS.STAFF_ASSIGN_ROLES), "HIGH");
  });

  it("maps every child action to its module View permission", () => {
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.RESERVATION_CREATE),
      PMS_PERMISSIONS.RESERVATION_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.CASHIERING_WRITE_OFF),
      PMS_PERMISSIONS.CASHIERING_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.CASHIERING_SHIFT_AUTHORIZE),
      PMS_PERMISSIONS.CASHIERING_SHIFT_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.CASHIERING_INVOICE_AUTHORIZE),
      PMS_PERMISSIONS.CASHIERING_INVOICE_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.MAINTENANCE_CREATE),
      PMS_PERMISSIONS.MAINTENANCE_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE),
      PMS_PERMISSIONS.FISCAL_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.GUEST_ACCOUNT_EDIT),
      PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW,
    );
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS),
      PMS_PERMISSIONS.ROLES_VIEW,
    );
    for (const code of PMS_PERMISSION_CODES) {
      const view = parentViewPermission(code);
      assert.equal(parentViewPermission(view), view);
    }
  });

  it("keeps retired and leftover Card 7 codes out of the new UI catalogue", () => {
    for (const code of RETIRED_PMS_PERMISSION_CODES) {
      assert.equal(isPmsPermissionCode(code), false);
    }
    for (const code of LEGACY_ACTIVE_PMS_PERMISSION_CODES) {
      assert.equal(isPmsPermissionCode(code), false);
      assert.equal(RETIRED_PMS_PERMISSION_CODES.includes(code as never), false);
    }
  });
});

describe("PMS RBAC Phase 1 role grant validation", () => {
  it("rejects a child grant without its parent View across modules", () => {
    assert.match(
      roleGrantErrors([PMS_PERMISSIONS.RESERVATION_CREATE]).join("\n"),
      new RegExp(PMS_PERMISSION_VIEW_REQUIRED),
    );
    assert.match(
      roleGrantErrors([PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN]).join("\n"),
      new RegExp(PMS_PERMISSION_VIEW_REQUIRED),
    );
    assert.match(
      roleGrantErrors([PMS_PERMISSIONS.CASHIERING_WRITE_OFF]).join("\n"),
      new RegExp(PMS_PERMISSION_VIEW_REQUIRED),
    );
    assert.match(
      roleGrantErrors([PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE]).join("\n"),
      new RegExp(PMS_PERMISSION_VIEW_REQUIRED),
    );
    assert.doesNotThrow(() =>
      assertRolePermissionGrants([
        PMS_PERMISSIONS.RESERVATION_VIEW,
        PMS_PERMISSIONS.RESERVATION_CREATE,
      ]),
    );
  });

  it("rejects unknown, retired, and inactive catalogue codes", () => {
    assert.match(
      roleGrantErrors(["not.a.permission"]).join("\n"),
      new RegExp(PMS_PERMISSION_UNKNOWN),
    );
    assert.match(
      roleGrantErrors(["reservation.status.edit"]).join("\n"),
      new RegExp(PMS_PERMISSION_UNKNOWN),
    );
    assert.match(
      roleGrantErrors(["guest.vip.edit"]).join("\n"),
      new RegExp(PMS_PERMISSION_UNKNOWN),
    );
    assert.throws(
      () => assertRolePermissionGrants(["housekeeping.restriction.edit"]),
      /not in the PMS catalogue/,
    );
  });

  it("treats Owner as able to grant any valid catalogue set, staff only a subset", () => {
    const grants = [PMS_PERMISSIONS.RESERVATION_VIEW, PMS_PERMISSIONS.RESERVATION_CREATE];
    assert.equal(actorMayGrantPermissions({ isOwner: true, codes: [] }, grants), true);
    assert.equal(actorMayAssignRole({ isOwner: true, codes: [] }, grants), true);
    assert.equal(actorMayGrantPermissions({ isOwner: false, codes: grants }, grants), true);
    assert.equal(
      actorMayGrantPermissions(
        { isOwner: false, codes: [PMS_PERMISSIONS.RESERVATION_VIEW] },
        grants,
      ),
      false,
    );
    assert.equal(
      actorMayGrantPermissions({ isOwner: true, codes: [] }, [PMS_PERMISSIONS.RESERVATION_CREATE]),
      false,
    );
  });
});

describe("PMS RBAC Phase 1 resolver", () => {
  it("unions multi-role grants without duplicates", async () => {
    const store = createStore();
    seedPermission(store, "p-view", PMS_PERMISSIONS.RESERVATION_VIEW);
    seedPermission(store, "p-create", PMS_PERMISSIONS.RESERVATION_CREATE);
    seedPermission(store, "p-edit", PMS_PERMISSIONS.RESERVATION_EDIT);
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "Clerk" });
    seedRole(store, { id: "role-b", restaurantId: "rest-a", name: "Editor" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-view" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-create" });
    seedGrant(store, { roleId: "role-b", restaurantId: "rest-a", permissionId: "p-view" });
    seedGrant(store, { roleId: "role-b", restaurantId: "rest-a", permissionId: "p-edit" });
    store.pms_membership_roles.push(
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-a" },
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-b" },
    );
    const codes = await loadUnionPermissionCodes(createClient(store), "rest-a", "mem-1");
    assert.deepEqual(codes.sort(), [
      PMS_PERMISSIONS.RESERVATION_CREATE,
      PMS_PERMISSIONS.RESERVATION_EDIT,
      PMS_PERMISSIONS.RESERVATION_VIEW,
    ]);
    assert.deepEqual(
      unionPermissionCodes(
        [PMS_PERMISSIONS.RESERVATION_VIEW, PMS_PERMISSIONS.RESERVATION_CREATE],
        [PMS_PERMISSIONS.RESERVATION_VIEW, PMS_PERMISSIONS.RESERVATION_EDIT],
      ).sort(),
      codes.sort(),
    );
  });

  it("does not treat a Manager role name as authorization", async () => {
    const store = createStore();
    seedPermission(store, "p-dash", PMS_PERMISSIONS.DASHBOARD_VIEW);
    seedPermission(store, "p-write-off", PMS_PERMISSIONS.CASHIERING_WRITE_OFF);
    seedRole(store, { id: "role-mgr", restaurantId: "rest-a", name: "Manager" });
    seedGrant(store, { roleId: "role-mgr", restaurantId: "rest-a", permissionId: "p-dash" });
    store.pms_membership_roles.push({
      membership_id: "mem-1",
      restaurant_id: "rest-a",
      role_id: "role-mgr",
    });
    const resolved = await resolveMembershipPermissions(createClient(store), {
      id: "mem-1",
      role: "receptionist",
      restaurant_id: "rest-a",
      active: true,
    });
    assert.equal(resolved.isOwner, false);
    assert.deepEqual([...resolved.codes], [PMS_PERMISSIONS.DASHBOARD_VIEW]);
    assert.equal(hasEffectivePermission(resolved, PMS_PERMISSIONS.DASHBOARD_VIEW), true);
    assert.equal(hasEffectivePermission(resolved, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), false);
    assert.throws(
      () => assertEffectivePermission(resolved, PMS_PERMISSIONS.CASHIERING_WRITE_OFF),
      new RegExp(PMS_PERMISSION_DENIED),
    );
  });

  it("gives Owner implicit access without membership-role or grant rows", () => {
    const resolved = {
      membershipId: "owner-1",
      restaurantId: "rest-a",
      isOwner: true,
      codes: new Set<(typeof PMS_PERMISSION_CODES)[number]>(),
    };
    assert.equal(hasEffectivePermission(resolved, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), true);
    assert.doesNotThrow(() =>
      assertEffectivePermission(resolved, PMS_PERMISSIONS.CASHIERING_WRITE_OFF),
    );
    assert.doesNotThrow(() =>
      assertAnyEffectivePermission(resolved, [
        PMS_PERMISSIONS.GUEST_PROFILE_VIEW,
        PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW,
      ]),
    );
    assert.doesNotThrow(() =>
      assertAllEffectivePermissions(resolved, [
        PMS_PERMISSIONS.STAFF_VIEW,
        PMS_PERMISSIONS.ROLES_VIEW,
      ]),
    );
  });

  it("denies inactive Owner membership and wrong-tenant resolution", async () => {
    const inactive = await resolveMembershipPermissions(createClient(createStore()), {
      id: "owner-1",
      role: "owner",
      restaurant_id: "rest-a",
      active: false,
    });
    assert.equal(inactive.isOwner, false);
    assert.deepEqual([...inactive.codes], []);
    assert.throws(
      () => assertEffectivePermission(inactive, PMS_PERMISSIONS.DASHBOARD_VIEW),
      new RegExp(PMS_PERMISSION_DENIED),
    );

    await assert.rejects(
      resolveEffectivePermissions(
        { supabase: createClient(createStore()), userId: "user-1" },
        "rest-b",
      ),
      /don't have access to this restaurant/,
    );
  });

  it("returns an empty set for active staff with no role assignments", async () => {
    const resolved = await resolveMembershipPermissions(createClient(createStore()), {
      id: "mem-1",
      role: "receptionist",
      restaurant_id: "rest-a",
      active: true,
    });
    assert.equal(resolved.isOwner, false);
    assert.deepEqual([...resolved.codes], []);
    assert.throws(
      () => assertEffectivePermission(resolved, PMS_PERMISSIONS.RESERVATION_VIEW),
      new RegExp(PMS_PERMISSION_DENIED),
    );
    assert.throws(
      () =>
        assertAnyEffectivePermission(resolved, [
          PMS_PERMISSIONS.GUEST_PROFILE_VIEW,
          PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW,
        ]),
      new RegExp(PMS_PERMISSION_DENIED),
    );
  });

  it("rejects cross-property role assignment and permission resolution", async () => {
    const store = createStore();
    seedPermission(store, "p-view", PMS_PERMISSIONS.RESERVATION_VIEW);
    seedRole(store, { id: "role-b", restaurantId: "rest-b", name: "Clerk" });
    seedGrant(store, { roleId: "role-b", restaurantId: "rest-b", permissionId: "p-view" });
    store.pms_membership_roles.push({
      membership_id: "mem-a",
      restaurant_id: "rest-a",
      role_id: "role-b",
    });
    const codes = await loadUnionPermissionCodes(createClient(store), "rest-a", "mem-a");
    assert.deepEqual(codes, []);
    await assert.rejects(
      assertAssignableHotelRole(createClient(store), "rest-a", "role-b"),
      (error: unknown) => {
        assert.equal(error instanceof Error && error.message, PMS_PERMISSION_CROSS_TENANT);
        return true;
      },
    );
    await assert.rejects(
      assignMembershipRole(createClient(store), {
        restaurantId: "rest-a",
        membershipId: "mem-a",
        roleId: "role-b",
      }),
      (error: unknown) => {
        assert.equal(error instanceof Error && error.message, PMS_PERMISSION_CROSS_TENANT);
        return true;
      },
    );
  });

  it("drops inactive role grants immediately and restores them on reactivation", async () => {
    const store = createStore();
    seedPermission(store, "p-view", PMS_PERMISSIONS.RESERVATION_VIEW);
    seedPermission(store, "p-create", PMS_PERMISSIONS.RESERVATION_CREATE);
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "A", active: true });
    seedRole(store, { id: "role-b", restaurantId: "rest-a", name: "B", active: false });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-view" });
    seedGrant(store, { roleId: "role-b", restaurantId: "rest-a", permissionId: "p-create" });
    store.pms_membership_roles.push(
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-a" },
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-b" },
    );
    assert.deepEqual(await loadUnionPermissionCodes(createClient(store), "rest-a", "mem-1"), [
      PMS_PERMISSIONS.RESERVATION_VIEW,
    ]);
    const roleB = store.pms_hotel_roles.find((row) => row.id === "role-b");
    if (roleB) roleB.active = true;
    assert.deepEqual(
      (await loadUnionPermissionCodes(createClient(store), "rest-a", "mem-1")).sort(),
      [PMS_PERMISSIONS.RESERVATION_CREATE, PMS_PERMISSIONS.RESERVATION_VIEW],
    );
  });

  it("denies disabled staff while keeping assignment rows", async () => {
    const store = createStore();
    seedPermission(store, "p-view", PMS_PERMISSIONS.RESERVATION_VIEW);
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "Clerk" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-view" });
    store.pms_membership_roles.push({
      membership_id: "mem-1",
      restaurant_id: "rest-a",
      role_id: "role-a",
    });
    const resolved = await resolveMembershipPermissions(createClient(store), {
      id: "mem-1",
      role: "receptionist",
      restaurant_id: "rest-a",
      active: false,
    });
    assert.deepEqual([...resolved.codes], []);
    assert.equal(hasEffectivePermission(resolved, PMS_PERMISSIONS.RESERVATION_VIEW), false);
    assert.equal(store.pms_membership_roles.length, 1);
  });

  it("unions grants and ignores allowed=false historical rows", async () => {
    const store = createStore();
    seedPermission(store, "p-view", PMS_PERMISSIONS.RESERVATION_VIEW);
    seedPermission(store, "p-create", PMS_PERMISSIONS.RESERVATION_CREATE);
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "A" });
    seedRole(store, { id: "role-b", restaurantId: "rest-a", name: "B" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-view" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-create" });
    seedGrant(store, { roleId: "role-b", restaurantId: "rest-a", permissionId: "p-view" });
    seedGrant(store, {
      roleId: "role-b",
      restaurantId: "rest-a",
      permissionId: "p-create",
      allowed: false,
    });
    store.pms_membership_roles.push(
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-a" },
      { membership_id: "mem-1", restaurant_id: "rest-a", role_id: "role-b" },
    );
    const codes = await loadUnionPermissionCodes(createClient(store), "rest-a", "mem-1");
    assert.equal(codes.includes(PMS_PERMISSIONS.RESERVATION_CREATE), true);
    const sources = await listPermissionGrantSources(createClient(store), "rest-a", "mem-1");
    const createSource = sources.find((row) => row.code === PMS_PERMISSIONS.RESERVATION_CREATE);
    assert.deepEqual(createSource?.roleNames, ["A"]);
  });

  it("assigns and lists same-property membership roles and is idempotent", async () => {
    const store = createStore();
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "Clerk" });
    const first = await assignMembershipRole(createClient(store), {
      restaurantId: "rest-a",
      membershipId: "mem-1",
      roleId: "role-a",
    });
    const second = await assignMembershipRole(createClient(store), {
      restaurantId: "rest-a",
      membershipId: "mem-1",
      roleId: "role-a",
    });
    assert.equal(first.id, second.id);
    const listed = await listMembershipRoles(createClient(store), "rest-a", "mem-1");
    assert.equal(listed.length, 1);
    await removeMembershipRole(createClient(store), {
      restaurantId: "rest-a",
      membershipId: "mem-1",
      roleId: "role-a",
    });
    assert.equal((await listMembershipRoles(createClient(store), "rest-a", "mem-1")).length, 0);
  });

  it("caches resolved permissions on the request context object", async () => {
    const store = createStore();
    store.restaurant_users.push({
      id: "mem-1",
      user_id: "user-1",
      restaurant_id: "rest-a",
      role: "receptionist",
      active: true,
    });
    seedPermission(store, "p-dash", PMS_PERMISSIONS.DASHBOARD_VIEW);
    seedRole(store, { id: "role-a", restaurantId: "rest-a", name: "Clerk" });
    seedGrant(store, { roleId: "role-a", restaurantId: "rest-a", permissionId: "p-dash" });
    store.pms_membership_roles.push({
      membership_id: "mem-1",
      restaurant_id: "rest-a",
      role_id: "role-a",
    });
    let roleReads = 0;
    const base = createClient(store);
    const client = {
      from(table: string) {
        if (table === "pms_membership_roles") roleReads += 1;
        return base.from(table as keyof ReturnType<typeof createStore>);
      },
    };
    const context = { supabase: client, userId: "user-1" };
    const first = await resolveEffectivePermissions(context, "rest-a");
    const second = await resolveEffectivePermissions(context, "rest-a");
    assert.equal(first, second);
    assert.equal(roleReads, 1);
    assert.deepEqual([...first.codes], [PMS_PERMISSIONS.DASHBOARD_VIEW]);
  });
});

describe("PMS RBAC Phase 1 must_change_password", () => {
  it("defaults false and only reads the identity column", () => {
    assert.equal(PROFILE_MUST_CHANGE_PASSWORD_DEFAULT, false);
    assert.equal(mustChangePasswordFromProfile(undefined), false);
    assert.equal(mustChangePasswordFromProfile(null), false);
    assert.equal(mustChangePasswordFromProfile({}), false);
    assert.equal(mustChangePasswordFromProfile({ must_change_password: false }), false);
    assert.equal(mustChangePasswordFromProfile({ must_change_password: true }), true);
    const sql = readFileSync(SUPABASE_0193, "utf8");
    assert.match(sql, /must_change_password boolean NOT NULL DEFAULT false/);
    assert.doesNotMatch(sql, /must_change_password boolean NOT NULL DEFAULT true/);
  });
});

describe("PMS RBAC Phase 1 migration 0193", () => {
  it("ships identical dual-lane SQL with tenant-safe membership roles", () => {
    assert.equal(existsSync(DRIZZLE_0193), true);
    assert.equal(existsSync(SUPABASE_0193), true);
    const sql = readFileSync(DRIZZLE_0193, "utf8");
    assert.equal(sql, readFileSync(SUPABASE_0193, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_membership_roles/);
    assert.match(sql, /UNIQUE \(membership_id, role_id\)/);
    assert.match(sql, /REFERENCES public\.restaurant_users \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.pms_hotel_roles \(id, restaurant_id\)/);
    assert.match(sql, /ON DELETE RESTRICT/);
    assert.match(sql, /assigned_by_membership_id uuid/);
    assert.match(
      sql,
      /FOR SELECT TO authenticated USING \(public\.is_restaurant_member\(restaurant_id\)\)/,
    );
    assert.doesNotMatch(sql, /FOR INSERT TO authenticated/);
    assert.doesNotMatch(sql, /FOR UPDATE TO authenticated/);
    assert.doesNotMatch(sql, /FOR DELETE TO authenticated/);
    assert.doesNotMatch(sql, /hotel_role_id =/);
    assert.match(sql, /GRANT SELECT ON public\.pms_membership_roles TO authenticated/);
    assert.match(sql, /GRANT ALL ON public\.pms_membership_roles TO service_role/);
    const upserted = extractPermissionCodes(
      sql.split("INSERT INTO public.pms_permissions")[1] ?? "",
    );
    assert.equal(upserted.length, 98);
    assert.equal(new Set(upserted).size, 98);
    for (const code of PMS_PERMISSION_CODES) {
      assert.equal(upserted.includes(code), true, code);
    }
    for (const code of RETIRED_PMS_PERMISSION_CODES) {
      assert.match(sql, new RegExp(`'${code}'`));
      assert.equal(upserted.includes(code), false);
    }
  });

  it("does not use hotel_role_id or staff_module_access in the new resolver", () => {
    const server = readFileSync(new URL("./pms-permissions.server.ts", import.meta.url), "utf8");
    const functions = readFileSync(
      new URL("./pms-permissions.functions.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(server, /select\([^)]*hotel_role_id|hotel_role_id:/);
    assert.doesNotMatch(server, /\.from\("staff_module_access"\)/);
    assert.doesNotMatch(server, /STAFF_ROLES/);
    assert.match(server, /await requirePmsPackage\(restaurantId\)/);
    assert.match(functions, /getMyPmsPermissions/);
    assert.match(functions, /codes: \[\.\.\.resolved\.codes\]/);
  });
});
