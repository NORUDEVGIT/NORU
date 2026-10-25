import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { GroupRecord } from "./groups.functions";
import {
  allotmentAvailabilityRanges,
  allotmentBlockEligibilityIssue,
  allotmentSummary,
  allotmentsForCreate,
  canSelectGroupCreateStep,
  emptyAllotmentRow,
  emptyGroupCreateDraft,
  executeGroupBlockCreate,
  GB05_NON_ATOMIC_CREATE_DEBT,
  GROUP_CREATE_INVENTORY_IMPACT,
  GROUP_CREATE_NO_HOLD,
  GROUP_CREATE_STATUSES,
  GROUP_CREATE_STEPS,
  GROUP_BLOCK_NOT_AVAILABLE,
  GROUP_CREATE_SUCCESS,
  groupBlockPreflightFromRules,
  groupCreateDraftIsDirty,
  groupCreateSuccessDetail,
  groupStayIsValid,
  otherLocalRequestedForRow,
  readyGroupBlockPreflight,
  remainingAfterBlockPreview,
  staffFacingBlockError,
  toGroupCreateCommand,
  validateAllotmentRow,
  validateGroupCreateDetails,
  type GroupCreateDraft,
} from "./groups-create-wizard";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const wizardUi = source("src/packages/pms/components/reservations/create-group-wizard.tsx");
const groupsUi = source("src/packages/pms/components/reservations/groups-workspace.tsx");
const groupsFunctions = source("src/packages/pms/lib/groups.functions.ts");
const groupsDomain = source("src/packages/pms/lib/groups.ts");
const inventoryLifecycle = source("src/packages/pms/lib/groups-inventory-lifecycle.test.ts");
const nightAudit = source("src/packages/pms/lib/nightaudit.functions.ts");

function sampleGroup(partial: Partial<GroupRecord> = {}): GroupRecord {
  return {
    id: "group-1",
    confirmationNumber: "GR-000012",
    name: "Crew allotment",
    code: "CREW",
    groupType: "corporate",
    status: "definite",
    companyMasterId: null,
    travelAgentMasterId: null,
    groupAccountMasterId: null,
    leaderGuestId: null,
    arrivalDate: "2026-11-10",
    departureDate: "2026-11-12",
    cutoffDate: "2026-11-01",
    externalReference: null,
    notes: null,
    source: null,
    marketSegment: null,
    ratePlanId: null,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    ...partial,
  };
}

function validDraft(partial: Partial<GroupCreateDraft> = {}): GroupCreateDraft {
  return {
    ...emptyGroupCreateDraft(),
    name: "Crew allotment",
    groupType: "corporate",
    status: "definite",
    arrivalDate: "2026-11-10",
    departureDate: "2026-11-12",
    cutoffDate: "2026-11-01",
    ...partial,
  };
}

describe("GB05 Create Group / Block wizard", () => {
  it("opens Create Group / Block from New Group without the old inline create form", () => {
    expect(groupsUi).toContain('data-testid="groups-new-group"');
    expect(groupsUi).toContain("onClick={() => setNewOpen(true)}");
    expect(groupsUi).toContain("<CreateGroupWizard");
    expect(groupsUi).toContain("open={newOpen}");
    expect(groupsUi).not.toContain("setNewOpen((open) => !open)");
    expect(groupsUi).not.toMatch(/newOpen && canWrite \? \n?\s*<GroupForm/);
    expect(groupsUi).not.toContain("createGroup,");
    expect(wizardUi).toContain('title="Create Group / Block"');
    expect(wizardUi).toContain("Set up the group master and room allotment.");
    expect(wizardUi).toContain("ReservationWorkspaceOverlay");
  });

  it("closes locally without route navigation", () => {
    expect(groupsUi).not.toContain("useNavigate");
    expect(groupsUi).not.toContain("@tanstack/react-router");
    expect(wizardUi).not.toContain("useNavigate");
    expect(wizardUi).not.toContain('to="/restaurant');
    expect(wizardUi).toContain("onOpenChange={(next) => {");
    expect(wizardUi).toContain("requestClose()");
    expect(wizardUi).toContain("Discard this group draft?");
  });

  it("renders supported group fields and omits unsupported policy or financial fields", () => {
    expect(wizardUi).toContain('data-testid="group-create-name"');
    expect(wizardUi).toContain('data-testid="group-create-code"');
    expect(wizardUi).toContain('data-testid="group-create-type"');
    expect(wizardUi).toContain('data-testid="group-create-status"');
    expect(wizardUi).toContain('data-testid="group-create-arrival"');
    expect(wizardUi).toContain('data-testid="group-create-departure"');
    expect(wizardUi).toContain('data-testid="group-create-cutoff"');
    expect(wizardUi).toContain('data-testid="group-create-notes"');
    expect(wizardUi).toContain('data-testid="group-create-source"');
    expect(wizardUi).toContain('data-testid="group-create-segment"');
    expect(wizardUi).toContain('data-testid="group-create-rate-plan"');
    expect(wizardUi).toContain("Preferred group rate plan");
    expect(wizardUi).toContain("Group leader");
    expect(wizardUi).toContain("Internal notes");
    expect(wizardUi).not.toMatch(
      /deposit requirement|cancellation policy|no-show policy|billing instructions|routing instructions|master folio|negotiated/i,
    );
    expect(wizardUi).not.toContain("Policies & Commercial");
    expect(GROUP_CREATE_STEPS).toHaveLength(3);
    expect(GROUP_CREATE_STEPS.map((step) => step.label)).toEqual([
      "Group Details",
      "Room Allotment",
      "Review",
    ]);
  });

  it("validates stay dates and only offers Tentative or Definite on create", () => {
    expect(groupStayIsValid("2026-11-10", "2026-11-12")).toBe(true);
    expect(groupStayIsValid("2026-11-12", "2026-11-10")).toBe(false);
    expect(validateGroupCreateDetails(validDraft({ departureDate: "2026-11-10" }))).toBe(
      "Departure must be after arrival.",
    );
    expect(GROUP_CREATE_STATUSES).toEqual(["tentative", "definite"]);
    expect(wizardUi).toContain('value="tentative"');
    expect(wizardUi).toContain('value="definite"');
    expect(wizardUi).not.toContain('value="cancelled"');
    expect(wizardUi).not.toContain('value="completed"');
    expect(wizardUi).toContain("Active room blocks still hold inventory");
  });

  it("binds stay validation in CreateGroupWizard so the availability memo cannot throw ReferenceError", () => {
    const importBlock = wizardUi.slice(0, wizardUi.indexOf("export function CreateGroupWizard"));
    expect(importBlock).toContain("allotmentAvailabilityRanges");
    expect(wizardUi).toContain("allotmentAvailabilityRanges(draft.allotments)");
    expect(wizardUi).not.toMatch(/if \(!groupStayIsValid\(row\.startDate/);
    expect(canSelectGroupCreateStep(0, 1, validateGroupCreateDetails(validDraft()) == null)).toBe(
      true,
    );
    expect(
      canSelectGroupCreateStep(
        0,
        1,
        validateGroupCreateDetails(validDraft({ departureDate: "2026-11-10" })) == null,
      ),
    ).toBe(false);
    expect(
      allotmentAvailabilityRanges([
        emptyAllotmentRow("2026-11-12", "2026-11-10", "invalid"),
        emptyAllotmentRow("2026-11-10", "2026-11-12", "valid"),
        emptyAllotmentRow("2026-11-10", "2026-11-12", "dup"),
      ]),
    ).toEqual([{ arrival: "2026-11-10", departure: "2026-11-12" }]);
  });

  it("reuses existing company, travel-agent, guest, and rate-plan reads", () => {
    expect(wizardUi).toContain("CreateReservationMasterPicker");
    expect(wizardUi).toContain('kind="company"');
    expect(wizardUi).toContain('kind="travel_agent"');
    expect(wizardUi).toContain("listGuests");
    expect(wizardUi).toContain('data-testid="group-leader-picker"');
    expect(wizardUi).not.toContain("View Profile");
    expect(wizardUi).toContain("listRatePlans");
    expect(wizardUi).toContain("activeOnly: true");
    expect(wizardUi).not.toContain("baseRate");
    expect(wizardUi).not.toContain("negotiated rate");
  });

  it("supports multiple local allotment rows with catalogue room types and availability reads", () => {
    expect(wizardUi).toContain('data-testid="group-create-add-row"');
    expect(wizardUi).toContain("Add Room Type");
    expect(wizardUi).toContain("listRoomTypes");
    expect(wizardUi).toContain("getRoomTypeAvailability");
    expect(wizardUi).toContain('queryKey: ["pms-groups-create-availability"');
    expect(wizardUi).toContain("Available:");
    expect(wizardUi).toContain("Requested:");
    expect(wizardUi).toContain("Remaining general availability after block:");
    expect(wizardUi).not.toContain("negotiated block");
    expect(wizardUi).not.toContain("per-block rate");
    expect(wizardUi).toContain('data-testid="group-create-remove-row"');
    expect(wizardUi).toContain("onChange(draft.allotments.filter((item) => item.key !== row.key))");
  });

  it("validates allotment dates and quantity against the group window and availability", () => {
    const draft = validDraft();
    const row = emptyAllotmentRow(draft.arrivalDate, draft.departureDate, "row-1");
    expect(validateAllotmentRow(row, draft, null)).toBe("Select a room type.");
    expect(
      validateAllotmentRow(
        { ...row, roomTypeId: "twin", startDate: "2026-11-12", endDate: "2026-11-10" },
        draft,
        null,
      ),
    ).toBe("Block departure must be after arrival.");
    expect(
      validateAllotmentRow(
        { ...row, roomTypeId: "twin", startDate: "2026-11-09", endDate: "2026-11-12" },
        draft,
        null,
      ),
    ).toBe("Block dates must fall inside the group stay window.");
    expect(validateAllotmentRow({ ...row, roomTypeId: "twin", allotted: 0 }, draft, 8)).toBe(
      "Rooms blocked must be at least 1.",
    );
    expect(validateAllotmentRow({ ...row, roomTypeId: "twin", allotted: 9 }, draft, 8)).toBe(
      "Only 8 rooms are available to block for these dates.",
    );
    expect(validateAllotmentRow({ ...row, roomTypeId: "twin", allotted: 5 }, draft, 8)).toBeNull();
  });

  it("does not fake remaining availability when another local row shares type and dates", () => {
    const rows = [
      { ...emptyAllotmentRow("2026-11-10", "2026-11-12", "a"), roomTypeId: "twin", allotted: 5 },
      { ...emptyAllotmentRow("2026-11-10", "2026-11-12", "b"), roomTypeId: "twin", allotted: 3 },
    ];
    expect(otherLocalRequestedForRow(rows, rows[0]!)).toBe(3);
    expect(
      remainingAfterBlockPreview({ available: 14, requested: 5, otherLocalRequested: 3 }),
    ).toBeNull();
    expect(
      remainingAfterBlockPreview({ available: 14, requested: 5, otherLocalRequested: 0 }),
    ).toBe(9);
  });

  it("keeps review read-only with every allotment row and staff-facing inventory copy", () => {
    expect(wizardUi).toContain('data-testid="group-create-step-review"');
    expect(wizardUi).toContain('data-testid="group-create-review-allotment"');
    expect(wizardUi).toContain("validRows.map((row) =>");
    expect(wizardUi).toContain("Inventory impact");
    expect(wizardUi).toContain("GROUP_CREATE_INVENTORY_IMPACT");
    expect(wizardUi).toContain("GROUP_CREATE_NO_HOLD");
    expect(GROUP_CREATE_INVENTORY_IMPACT).toContain("reduce general sellable availability");
    expect(GROUP_CREATE_NO_HOLD).toBe("No room inventory will be held.");
    expect(wizardUi).not.toContain("syncBlockInventory");
    expect(wizardUi).not.toContain("pms_create_operational_block");
    expect(wizardUi).not.toContain("addGroupBlock for");
    const reviewStart = wizardUi.indexOf("function GroupReviewStep");
    const reviewEnd = wizardUi.indexOf("function GroupCreateSummary");
    const reviewChunk = wizardUi.slice(reviewStart, reviewEnd);
    expect(reviewChunk).not.toContain("<Input");
    expect(reviewChunk).not.toContain("<Select");
    expect(reviewChunk).not.toContain("<Textarea");
    expect(reviewChunk).not.toMatch(/inherit automatically|negotiated rate|master folio/i);
  });

  it("creates the group once, then each reviewed allotment row, without double submit", async () => {
    const draft = validDraft({
      allotments: [
        {
          ...emptyAllotmentRow("2026-11-10", "2026-11-12", "twin"),
          roomTypeId: "rt-twin",
          allotted: 10,
        },
        {
          ...emptyAllotmentRow("2026-11-10", "2026-11-12", "suite"),
          roomTypeId: "rt-suite",
          allotted: 3,
        },
      ],
    });
    const createGroup = vi.fn(async () => sampleGroup());
    const addGroupBlock = vi.fn(async (data: { roomTypeId: string }) => ({
      blockId: `block-${data.roomTypeId}`,
    }));
    const result = await executeGroupBlockCreate({
      restaurantId: "rest-1",
      draft,
      preflight: readyGroupBlockPreflight([
        { id: "rt-twin", name: "Twin" },
        { id: "rt-suite", name: "Suite" },
      ]),
      createGroup,
      addGroupBlock,
    });
    expect(createGroup).toHaveBeenCalledTimes(1);
    expect(createGroup).toHaveBeenCalledWith(
      expect.objectContaining(toGroupCreateCommand("rest-1", draft)),
    );
    expect(addGroupBlock).toHaveBeenCalledTimes(2);
    expect(addGroupBlock.mock.calls.map((call) => call[0].roomTypeId)).toEqual([
      "rt-twin",
      "rt-suite",
    ]);
    expect(result).toEqual({
      ok: true,
      group: sampleGroup(),
      blockIds: ["block-rt-twin", "block-rt-suite"],
      failed: [],
    });
    expect(wizardUi).toContain("if (busy || detailsIssue) return");
    expect(wizardUi).toContain("disabled={busy || Boolean(allotmentIssue)}");
    expect(wizardUi).toContain("Create Group & Block");
    expect(wizardUi).toContain("Creating group…");
    expect(wizardUi).toContain("Creating allotment…");
  });

  it("refreshes groups and selects the created group after success", () => {
    expect(groupsUi).toContain("onCreated={(groupId) => {");
    expect(groupsUi).toContain("setSelectedId(groupId)");
    expect(groupsUi).toContain('invalidateQueries({ queryKey: ["pms-groups", restaurantId] })');
    expect(groupsUi).toContain('invalidateQueries({ queryKey: ["pms-group", restaurantId] })');
    expect(wizardUi).toContain("onCreated(result.group.id)");
    expect(wizardUi).toContain("GROUP_CREATE_SUCCESS");
    expect(GROUP_CREATE_SUCCESS).toBe("Group & block created successfully");
    const detail = groupCreateSuccessDetail({
      group: sampleGroup(),
      allotmentRows: 2,
      totalAllotmentQuantity: 13,
    });
    expect(detail).toContain("GR-000012");
    expect(detail).toContain("Crew allotment");
    expect(detail).toContain("2 allotment rows");
    expect(detail).toContain("13 allotment quantity");
    expect(detail).not.toMatch(/\$|ETB|total rate/i);
  });

  it("presents partial block failure truthfully instead of pretending create rolled back", async () => {
    const draft = validDraft({
      allotments: [
        {
          ...emptyAllotmentRow("2026-11-10", "2026-11-12", "twin"),
          roomTypeId: "rt-twin",
          allotted: 10,
        },
        {
          ...emptyAllotmentRow("2026-11-10", "2026-11-12", "suite"),
          roomTypeId: "rt-suite",
          allotted: 3,
        },
      ],
    });
    const result = await executeGroupBlockCreate({
      restaurantId: "rest-1",
      draft,
      preflight: readyGroupBlockPreflight([
        { id: "rt-twin", name: "Twin" },
        { id: "rt-suite", name: "Suite" },
      ]),
      createGroup: async () => sampleGroup(),
      addGroupBlock: async (data) => {
        if (data.roomTypeId === "rt-suite") throw new Error("Allotment exceeds availability.");
        return { blockId: "block-twin" };
      },
    });
    expect(result.ok).toBe("partial");
    if (result.ok !== "partial") throw new Error("expected partial");
    expect(result.group.id).toBe("group-1");
    expect(result.blockIds).toEqual(["block-twin"]);
    expect(result.failed).toEqual([
      { key: "suite", roomTypeId: "rt-suite", message: "Allotment exceeds availability." },
    ]);
    expect(result.debt).toBe(GB05_NON_ATOMIC_CREATE_DEBT);
    expect(wizardUi).toContain("was created, but");
    expect(wizardUi).toContain("GB05_NON_ATOMIC_CREATE_DEBT");
  });

  it("keeps existing group reads, block release, rooming, and inventory writers unchanged", () => {
    expect(groupsFunctions).toContain("export const listGroups");
    expect(groupsFunctions).toContain("export const getGroup");
    expect(groupsFunctions).toContain("export const releaseGroupBlock");
    expect(groupsFunctions).toContain("export const convertRoomingRow");
    expect(groupsFunctions).toContain(
      "export async function resyncGroupBlockInventoryForReservation",
    );
    expect(groupsFunctions).toContain("async function syncBlockInventory");
    expect(groupsFunctions).toContain("pms_create_operational_block");
    expect(groupsUi).toContain("listGroups");
    expect(groupsUi).toContain("getGroup");
    expect(groupsUi).toContain("releaseGroupBlock");
    expect(groupsUi).toContain("convertRoomingRow");
    expect(groupsUi).toContain("GroupDetailWorkspace");
    expect(source("src/packages/pms/components/reservations/group-detail-workspace.tsx")).toContain(
      "detail?.reservations",
    );
    expect(groupsDomain).toContain("staysFitAllotment");
    expect(nightAudit).toContain("releaseGroupBlocksPastCutoff");
    expect(inventoryLifecycle).toContain("invokes syncBlockInventory after a linked cancel");
    expect(wizardUi).not.toContain("syncBlockInventory(");
    expect(wizardUi).not.toContain('from("pms_groups")');
  });

  it("keeps wizard state local until final create and ignores placeholder allotment rows", () => {
    expect(groupCreateDraftIsDirty(emptyGroupCreateDraft())).toBe(false);
    expect(groupCreateDraftIsDirty(validDraft())).toBe(true);
    expect(canSelectGroupCreateStep(0, 2, false)).toBe(false);
    expect(canSelectGroupCreateStep(1, 0, true)).toBe(true);
    const placeholder = emptyAllotmentRow("2026-11-10", "2026-11-12", "empty");
    const draft = validDraft({ allotments: [placeholder] });
    expect(allotmentsForCreate(draft)).toEqual([]);
    expect(
      allotmentSummary([{ ...placeholder, roomTypeId: "twin", allotted: 10 }])
        .totalAllotmentQuantity,
    ).toBe(10);
    expect(wizardUi).not.toContain("createGroup(");
    expect(wizardUi).toContain("executeGroupBlockCreate");
  });

  it("preflights group block eligibility before createGroup", async () => {
    expect(wizardUi).toContain("getInventoryRules");
    expect(wizardUi).toContain("GROUP_BLOCK_NOT_AVAILABLE");
    expect(wizardUi).toContain("group-create-row-type-disabled");
    expect(wizardUi).toContain("group-create-review-invalid");
    expect(wizardUi).not.toContain("BLOCK_TYPE_DISABLED");
    expect(GROUP_BLOCK_NOT_AVAILABLE).toBe("Not available for group blocks");

    const types = [
      { id: "rt-twin", name: "Deluxe Twin" },
      { id: "rt-suite", name: "Suite" },
    ];
    const disabled = groupBlockPreflightFromRules(
      [{ blockType: "group", enabled: false, inventoryImpact: "remove_from_inventory" }],
      types,
    );
    const row = {
      ...emptyAllotmentRow("2026-11-10", "2026-11-12", "twin"),
      roomTypeId: "rt-twin",
      allotted: 2,
    };
    expect(allotmentBlockEligibilityIssue(row, disabled)).toBe(
      "Deluxe Twin cannot currently be used for a room block.",
    );
    expect(validateAllotmentRow(row, validDraft(), 14, disabled)).toBe(
      "Deluxe Twin cannot currently be used for a room block.",
    );
    expect(validateAllotmentRow(row, validDraft(), 14, readyGroupBlockPreflight(types))).toBeNull();
    expect(staffFacingBlockError("BLOCK_TYPE_DISABLED", "Deluxe Twin")).toBe(
      "Deluxe Twin cannot currently be used for a room block.",
    );
    expect(staffFacingBlockError("BLOCK_TYPE_DISABLED", "Deluxe Twin")).not.toMatch(
      /BLOCK_TYPE_DISABLED/,
    );

    const createGroup = vi.fn(async () => sampleGroup());
    const addGroupBlock = vi.fn(async () => ({ blockId: "x" }));
    const blocked = await executeGroupBlockCreate({
      restaurantId: "rest-1",
      draft: validDraft({ allotments: [row] }),
      preflight: disabled,
      createGroup,
      addGroupBlock,
    });
    expect(blocked.ok).toBe(false);
    expect(createGroup).not.toHaveBeenCalled();
    expect(addGroupBlock).not.toHaveBeenCalled();

    const staleType = await executeGroupBlockCreate({
      restaurantId: "rest-1",
      draft: validDraft({ allotments: [{ ...row, roomTypeId: "rt-gone" }] }),
      preflight: readyGroupBlockPreflight(types),
      createGroup,
      addGroupBlock,
    });
    expect(staleType.ok).toBe(false);
    expect(createGroup).not.toHaveBeenCalled();

    const assignmentOnly = groupBlockPreflightFromRules(
      [{ blockType: "group", enabled: true, inventoryImpact: "assignment_only" }],
      types,
    );
    expect(allotmentBlockEligibilityIssue(row, assignmentOnly)).toBe(
      "Deluxe Twin cannot currently be used for a room block.",
    );
  });
});
