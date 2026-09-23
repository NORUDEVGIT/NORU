import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/room-inventory.functions.ts"),
  "utf8",
);

describe("Room & Inventory operational block server functions", () => {
  it("keeps all block operations behind authenticated server functions", () => {
    expect(source).toContain('createServerFn({ method: "POST" })');
    expect(source).toContain(".middleware([requireSupabaseAuth])");
  });

  it("derives the operational actor on the server", () => {
    expect(source).toContain("requireOperationalBlockManager");
    expect(source).toContain("me.id");

    expect(source).not.toMatch(/membershipId\s*:\s*idSchema/);
  });

  it("restricts operational block managers to owner or manager", () => {
    expect(source).toContain('membership.role !== "owner"');
    expect(source).toContain('membership.role !== "manager"');
  });

  it("lists blocks from the canonical operational block table", () => {
    expect(source).toContain('.from("pms_operational_inventory_blocks")');

    expect(source).toContain('.eq("restaurant_id", data.restaurantId)');
  });

  it("uses the canonical create block RPC", () => {
    expect(source).toContain('"pms_create_operational_block"');

    expect(source).toContain("_restaurant_id: data.restaurantId");
    expect(source).toContain("_target_kind: data.targetKind");
    expect(source).toContain("_room_id: data.roomId ?? null");
    expect(source).toContain("_room_type_id: data.roomTypeId");
    expect(source).toContain("_quantity: data.quantity ?? null");
    expect(source).toContain("_group_id: data.groupId ?? null");
    expect(source).toContain("_block_type: data.blockType");
    expect(source).toContain("_start_date: data.startDate");
    expect(source).toContain("_end_date: data.endDate");
    expect(source).toContain("_reason: data.reason");
    expect(source).toContain("_membership_id: me.id");
  });

  it("uses the canonical activate block RPC", () => {
    expect(source).toContain('"pms_activate_operational_block"');
    expect(source).toContain("_block_id: data.blockId");
    expect(source).toContain("_membership_id: me.id");
  });

  it("uses the canonical approval RPC with the authenticated manager as approver", () => {
    expect(source).toContain('"pms_approve_operational_block"');
    expect(source).toContain("_approver_membership_id: me.id");
  });

  it("uses the canonical release RPC and requires a release reason", () => {
    expect(source).toContain('"pms_release_operational_block"');
    expect(source).toContain("_release_reason: data.reason");

    expect(source).toContain("reason: z.string().trim().min(1).max(500)");
  });

  it("uses the canonical cancel block RPC", () => {
    expect(source).toContain('"pms_cancel_operational_block"');
    expect(source).toContain("_notes: blankToNull(data.notes)");
  });

  it("validates block dates before calling the database", () => {
    expect(source).toContain("input.endDate <= input.startDate");
    expect(source).toContain("End date must be after start date.");
  });

  it("requires a room for room-target blocks", () => {
    expect(source).toContain('input.targetKind === "room"');
    expect(source).toContain("A room is required for a room-target block.");
  });

  it("requires quantity for quantity-target blocks", () => {
    expect(source).toContain('input.targetKind === "quantity"');
    expect(source).toContain("Quantity is required for a quantity block.");
  });

  it("does not allow TypeScript to define inventory impact or approval policy", () => {
    expect(source).not.toMatch(/inventoryImpact\s*:\s*z\./);

    expect(source).not.toMatch(/approvalRequired\s*:\s*z\./);
  });

  it("keeps Card 2 block policy authoritative in the database", () => {
    expect(source).not.toContain("_inventory_impact");
    expect(source).not.toContain("_approval_required");
  });
});

describe("Room & Inventory canonical read adapters", () => {
  it("keeps availability behind Front Office access and the compatibility wrapper", () => {
    const availability = source.slice(
      source.indexOf("export const listRoomTypeInventoryAvailability"),
      source.indexOf("export const listRoomInventoryEvents"),
    );
    expect(availability).toContain(".middleware([requireSupabaseAuth])");
    expect(availability).toContain("requireFrontOfficeAccess");
    expect(availability).toContain("getRoomTypeAvailabilityCompat");
    expect(availability).not.toContain("count_sellable_rooms");
    expect(availability).not.toContain("count_reserved_rooms");
  });

  it("reads canonical inventory events through a narrow frozen-types boundary", () => {
    expect(source).toContain('from("pms_room_inventory_events")');
    expect(source).toContain("actor_membership_id");
    expect(source).toContain("previous_values");
    expect(source).toContain("new_values");
  });
});

describe("Room & Inventory assignment eligibility server function", () => {
  const eligibility = source.slice(source.indexOf("evaluateRoomAssignmentSchema"));

  it("exports an authenticated evaluateRoomAssignment server function", () => {
    expect(source).toContain("export const evaluateRoomAssignment");
    expect(eligibility).toContain('createServerFn({ method: "POST" })');
    expect(eligibility).toContain(".middleware([requireSupabaseAuth])");
  });

  it("re-derives Front Office access on the server", () => {
    expect(eligibility).toContain("requireFrontOfficeAccess");
    expect(eligibility).not.toMatch(/membershipId\s*:\s*idSchema/);
    expect(eligibility).not.toMatch(/userId\s*:\s*idSchema/);
    expect(eligibility).not.toMatch(/role\s*:\s*z\./);
  });

  it("uses the assignment compatibility helper instead of calling the RPC directly", () => {
    expect(eligibility).toContain("getAssignmentEligibilityCompat");
    expect(eligibility).not.toContain("pms_evaluate_room_assignment");
  });

  it("does not duplicate assignment policy in TypeScript", () => {
    expect(eligibility).not.toContain("sellable_status_required");
    expect(eligibility).not.toContain("housekeeping_affects_assignment");
    expect(eligibility).not.toContain("maintenance_affects_availability");
    expect(eligibility).not.toContain("require_room_type_match");
    expect(eligibility).not.toContain("preferenceScore +");
    expect(eligibility).not.toContain("OCCUPANCY_EXCEEDED");
  });

  it("passes all canonical assignment inputs through the compatibility helper", () => {
    expect(eligibility).toContain("restaurantId: data.restaurantId");
    expect(eligibility).toContain("roomId: data.roomId");
    expect(eligibility).toContain("roomTypeId: data.roomTypeId");
    expect(eligibility).toContain("arrival: data.arrival");
    expect(eligibility).toContain("departure: data.departure");
    expect(eligibility).toContain("excludeReservationId: data.excludeReservationId ?? null");
    expect(eligibility).toContain("adults: data.adults ?? null");
    expect(eligibility).toContain("children: data.children ?? null");
    expect(eligibility).toContain("requiredBedType: data.requiredBedType ?? null");
    expect(eligibility).toContain("accessibleRequired: data.accessibleRequired ?? false");
    expect(eligibility).toContain("connectingRequired: data.connectingRequired ?? false");
    expect(eligibility).toContain("preferredBuildingId: data.preferredBuildingId ?? null");
    expect(eligibility).toContain("preferredFloorId: data.preferredFloorId ?? null");
    expect(eligibility).toContain("guestPreferenceMatched: data.guestPreferenceMatched ?? false");
    expect(eligibility).toContain("forCheckIn: data.forCheckIn ?? false");
  });

  it("validates that departure is after arrival", () => {
    expect(eligibility).toContain("input.departure <= input.arrival");
    expect(eligibility).toContain("Departure must be after arrival.");
  });

  it("preserves the AssignmentEligibilityResult contract", () => {
    expect(eligibility).toContain("Promise<AssignmentEligibilityResult>");
    expect(eligibility).toContain('source: "legacy"');
    expect(eligibility).toContain("eligible:");
    expect(eligibility).toContain("blockers: []");
    expect(eligibility).toContain("warnings: []");
    expect(eligibility).toContain("preferenceScore: 0");
    expect(eligibility).toContain("preferenceReasons: []");
  });

  it("reuses the existing listAssignableRooms clash predicates for legacy fallback", () => {
    expect(eligibility).toContain('.in("status", ["pending", "confirmed", "checked_in"])');
    expect(eligibility).toContain('room?.status === "available"');
  });
});
