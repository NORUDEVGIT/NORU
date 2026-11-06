import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PMS_PERMISSIONS,
  actorMayAssignRole,
  actorMayGrantPermissions,
  assertOwnerMembershipUntouched,
  type PmsPermissionCode,
} from "./pms-permissions.ts";
import {
  cashierShiftAllowed,
  hasEffectivePermission,
  resolveMembershipPermissions,
  type EffectivePmsPermissions,
} from "./pms-permissions.server.ts";

type Row = Record<string, unknown>;

function client(store: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return api;
        },
        in(column: string, values: readonly unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return api;
        },
        order() {
          return api;
        },
        then(
          onFulfilled: (value: { data: Row[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const data = (store[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

function grant(
  store: Record<string, Row[]>,
  input: { membershipId: string; roleId: string; roleName: string; codes: PmsPermissionCode[] },
) {
  store.pms_hotel_roles.push({
    id: input.roleId,
    restaurant_id: "rest-a",
    name: input.roleName,
    active: true,
  });
  store.pms_membership_roles.push({
    membership_id: input.membershipId,
    restaurant_id: "rest-a",
    role_id: input.roleId,
  });
  for (const code of input.codes) {
    const id = `${input.roleId}:${code}`;
    store.pms_permissions.push({ id, code, active: true });
    store.pms_role_permissions.push({
      role_id: input.roleId,
      restaurant_id: "rest-a",
      permission_id: id,
      allowed: true,
    });
  }
}

function emptyStore(): Record<string, Row[]> {
  return {
    pms_membership_roles: [],
    pms_hotel_roles: [],
    pms_role_permissions: [],
    pms_permissions: [],
  };
}

async function staff(
  role: string,
  codesByRole: Array<{ roleId: string; roleName: string; codes: PmsPermissionCode[] }>,
): Promise<EffectivePmsPermissions> {
  const store = emptyStore();
  for (const row of codesByRole) {
    grant(store, {
      membershipId: "mem-1",
      roleId: row.roleId,
      roleName: row.roleName,
      codes: row.codes,
    });
  }
  return resolveMembershipPermissions(client(store), {
    id: "mem-1",
    role,
    restaurant_id: "rest-a",
    active: true,
  });
}

function allows(resolved: EffectivePmsPermissions, permission: PmsPermissionCode): boolean {
  return hasEffectivePermission(resolved, permission);
}

describe("PMS RBAC Phase 2 permission decisions", () => {
  it("does not let a role named Manager authorize anything beyond its grants", async () => {
    const resolved = await staff("receptionist", [
      { roleId: "role-manager", roleName: "Manager", codes: [PMS_PERMISSIONS.DASHBOARD_VIEW] },
    ]);
    assert.equal(allows(resolved, PMS_PERMISSIONS.DASHBOARD_VIEW), true);
    assert.equal(allows(resolved, PMS_PERMISSIONS.CASHIERING_REFUND), false);
    assert.equal(allows(resolved, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), false);
    assert.equal(allows(resolved, PMS_PERMISSIONS.RESERVATION_RATE_OVERRIDE), false);
    assert.equal(allows(resolved, PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(allows(resolved, PMS_PERMISSIONS.RESERVATION_EDIT), false);
  });

  it("does not let restaurant_users.role cashier grant cashiering", async () => {
    const resolved = await staff("cashier", []);
    assert.equal(resolved.isOwner, false);
    assert.deepEqual([...resolved.codes], []);
    for (const permission of [
      PMS_PERMISSIONS.CASHIERING_VIEW,
      PMS_PERMISSIONS.CASHIERING_PAYMENT_POST,
      PMS_PERMISSIONS.CASHIERING_REFUND,
      PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
    ]) {
      assert.equal(allows(resolved, permission), false);
    }
  });

  it("still lets an active owner through every permission with no grants", async () => {
    const resolved = await staff("owner", []);
    assert.equal(resolved.isOwner, true);
    assert.equal(allows(resolved, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), true);
    assert.equal(allows(resolved, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), true);
  });

  it("unions checkout and payment across two roles", async () => {
    const both = await staff("receptionist", [
      {
        roleId: "role-a",
        roleName: "Checkout",
        codes: [PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT],
      },
      {
        roleId: "role-b",
        roleName: "Payment",
        codes: [PMS_PERMISSIONS.CASHIERING_PAYMENT_POST],
      },
    ]);
    assert.equal(allows(both, PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT), true);
    assert.equal(allows(both, PMS_PERMISSIONS.CASHIERING_PAYMENT_POST), true);

    const checkoutOnly = await staff("receptionist", [
      {
        roleId: "role-a",
        roleName: "Checkout",
        codes: [PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT],
      },
    ]);
    assert.equal(allows(checkoutOnly, PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT), true);
    assert.equal(allows(checkoutOnly, PMS_PERMISSIONS.CASHIERING_PAYMENT_POST), false);
  });

  it("keeps cashiering permissions independent", async () => {
    const codes = [
      PMS_PERMISSIONS.CASHIERING_VIEW,
      PMS_PERMISSIONS.CASHIERING_CHARGE_POST,
      PMS_PERMISSIONS.CASHIERING_PAYMENT_POST,
      PMS_PERMISSIONS.CASHIERING_DEPOSIT_POST,
      PMS_PERMISSIONS.CASHIERING_REFUND,
      PMS_PERMISSIONS.CASHIERING_ADJUSTMENT_POST,
      PMS_PERMISSIONS.CASHIERING_DISCOUNT_POST,
      PMS_PERMISSIONS.CASHIERING_TRANSFER_POST,
      PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
      PMS_PERMISSIONS.CASHIERING_FOLIO_CLOSE,
      PMS_PERMISSIONS.CASHIERING_ALLOCATION_EDIT,
    ];
    for (const granted of codes) {
      const resolved = await staff("cashier", [
        { roleId: `role-${granted}`, roleName: "Operator", codes: [granted] },
      ]);
      for (const other of codes) {
        assert.equal(allows(resolved, other), other === granted);
      }
    }
  });

  it("limits shift.edit to the caller's own shift", async () => {
    const editor = await staff("cashier", [
      { roleId: "role-shift", roleName: "Shift", codes: [PMS_PERMISSIONS.CASHIERING_SHIFT_EDIT] },
    ]);
    assert.equal(cashierShiftAllowed(editor, "mem-1"), true);
    assert.equal(cashierShiftAllowed(editor, "mem-2"), false);
    const supervisor = await staff("cashier", [
      {
        roleId: "role-shift",
        roleName: "Shift",
        codes: [PMS_PERMISSIONS.CASHIERING_SHIFT_EDIT, PMS_PERMISSIONS.CASHIERING_SHIFT_AUTHORIZE],
      },
    ]);
    assert.equal(cashierShiftAllowed(supervisor, "mem-2"), true);
  });

  it("separates night audit, reservation, guest privacy, rates, and settings permissions", async () => {
    const runner = await staff("receptionist", [
      { roleId: "role-na", roleName: "Night", codes: [PMS_PERMISSIONS.NIGHT_AUDIT_RUN] },
    ]);
    assert.equal(allows(runner, PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(allows(runner, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), false);

    const closer = await staff("receptionist", [
      { roleId: "role-close", roleName: "Close", codes: [PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE] },
    ]);
    assert.equal(allows(closer, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), false);

    const editor = await staff("receptionist", [
      { roleId: "role-edit", roleName: "Editor", codes: [PMS_PERMISSIONS.RESERVATION_EDIT] },
    ]);
    assert.equal(allows(editor, PMS_PERMISSIONS.RESERVATION_CANCEL), false);
    assert.equal(allows(editor, PMS_PERMISSIONS.RESERVATION_RATE_OVERRIDE), false);

    const guestEditor = await staff("receptionist", [
      { roleId: "role-guest", roleName: "Guest", codes: [PMS_PERMISSIONS.GUEST_PROFILE_EDIT] },
    ]);
    assert.equal(allows(guestEditor, PMS_PERMISSIONS.GUEST_MERGE_AUTHORIZE), false);
    assert.equal(allows(guestEditor, PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT), false);
    assert.equal(allows(guestEditor, PMS_PERMISSIONS.GUEST_PRIVACY_DELETE), false);
    assert.equal(allows(guestEditor, PMS_PERMISSIONS.GUEST_RESTRICTION_AUTHORIZE), false);

    const ratePlanner = await staff("receptionist", [
      { roleId: "role-rate", roleName: "Rates", codes: [PMS_PERMISSIONS.RATES_CONFIGURE] },
    ]);
    assert.equal(allows(ratePlanner, PMS_PERMISSIONS.RESERVATION_RATE_OVERRIDE), false);
    assert.equal(allows(ratePlanner, PMS_PERMISSIONS.RATES_CALENDAR_OVERRIDE), false);

    const property = await staff("receptionist", [
      {
        roleId: "role-property",
        roleName: "Property",
        codes: [PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE],
      },
    ]);
    assert.equal(allows(property, PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE), false);

    const integration = await staff("receptionist", [
      {
        roleId: "role-integration",
        roleName: "Integration",
        codes: [PMS_PERMISSIONS.CONFIG_INTEGRATION_CONFIGURE],
      },
    ]);
    assert.equal(allows(integration, PMS_PERMISSIONS.FISCAL_DOCUMENT_AUTHORIZE), false);
  });

  it("uses one room restriction permission for inventory, housekeeping, and maintenance", async () => {
    const resolved = await staff("housekeeper", [
      {
        roleId: "role-room",
        roleName: "Rooms",
        codes: [PMS_PERMISSIONS.ROOM_RESTRICTION_EDIT],
      },
    ]);
    assert.equal(allows(resolved, PMS_PERMISSIONS.ROOM_RESTRICTION_EDIT), true);
    assert.equal(allows(resolved, PMS_PERMISSIONS.HOUSEKEEPING_TASK_EDIT), false);
    assert.equal(allows(resolved, PMS_PERMISSIONS.MAINTENANCE_EDIT), false);
  });

  it("blocks non-owner staff administration from owner targets and from escalating grants", () => {
    assert.throws(() => assertOwnerMembershipUntouched(false, "owner"), /permission/i);
    assert.doesNotThrow(() => assertOwnerMembershipUntouched(true, "owner"));
    assert.doesNotThrow(() => assertOwnerMembershipUntouched(false, "receptionist"));

    const actor = { isOwner: false, codes: [PMS_PERMISSIONS.RESERVATION_VIEW] };
    assert.equal(
      actorMayGrantPermissions(actor, [
        PMS_PERMISSIONS.RESERVATION_VIEW,
        PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
      ]),
      false,
    );
    assert.equal(
      actorMayAssignRole(actor, [
        PMS_PERMISSIONS.RESERVATION_VIEW,
        PMS_PERMISSIONS.RESERVATION_CREATE,
      ]),
      false,
    );
    assert.equal(
      actorMayAssignRole({ isOwner: true, codes: [] }, [
        PMS_PERMISSIONS.RESERVATION_VIEW,
        PMS_PERMISSIONS.RESERVATION_CREATE,
      ]),
      true,
    );
  });
});
