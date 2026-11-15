import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AccessibilityReviewPanel,
  RoomAccessibilityFeatures,
  RoomTypeAccessibleRooms,
} from "@/packages/pms/components/rooms/room-accessibility-panels";
import {
  ACCESSIBILITY_FEATURES_HELP,
  ACCESSIBILITY_FEATURES_TITLE,
  ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS,
  ACCESSIBLE_ROOM_HELP_TEXT,
  ACCESSIBLE_ROOM_LABEL,
  BULK_CREATE_ACCESSIBLE_WARNING,
  CONTAINS_ACCESSIBLE_ROOMS_HELP,
  CONTAINS_ACCESSIBLE_ROOMS_LABEL,
  ROOM_ACCESSIBLE_WITHOUT_FEATURES,
  ROOM_FEATURES_WITHOUT_ACCESSIBLE,
  SINGLE_CREATE_ACCESSIBLE_SUGGESTION,
  TYPE_ACCESSIBLE_ROOMS_WITHOUT_GUIDANCE,
  TYPE_GUIDANCE_WITHOUT_ACCESSIBLE_ROOMS,
  accessibilityValidationWarnings,
  accessibleRoomCount,
  buildAccessibilityReview,
  isAccessibilityAmenity,
  roomAccessibilityHint,
  roomTypeAccessibilityHint,
  type AccessibilityReviewInput,
} from "./room-accessibility";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

const DIALOG = read("src/packages/pms/components/rooms/room-board-dialogs.tsx");
const WIZARD = read("src/packages/pms/components/settings/room-type-wizard/room-type-wizard-step1.tsx");
const INVENTORY = read("src/packages/pms/components/settings/pms-property-setup-card2-inventory.tsx");
const CARD8 = read("src/packages/pms/lib/pms-property-setup-card8-validation.functions.ts");
const ROOMS_FNS = read("src/packages/pms/lib/rooms.functions.ts");

const RAW_TERMS = /hotel_rooms|room_types|accessible_eligible|room_type_amenities|room_amenities|amenity_id|ACC_|require_accessibility_match/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("accessibility amenity filter", () => {
  it("keeps ACC_ codes and the Accessibility category, nothing else", () => {
    expect(isAccessibilityAmenity({ code: "ACC_GRAB_RAILS", category: "Accessibility" })).toBe(true);
    expect(isAccessibilityAmenity({ code: "acc_lowered_sink", category: null })).toBe(true);
    expect(isAccessibilityAmenity({ code: "", category: "Accessibility" })).toBe(true);
    expect(isAccessibilityAmenity({ code: "BATH_SHOWER", category: "Bathroom" })).toBe(false);
    expect(isAccessibilityAmenity({ code: null, category: null })).toBe(false);
  });
});

describe("Room Configuration", () => {
  it("uses the canonical label and help text for the room flag", () => {
    expect(ACCESSIBLE_ROOM_LABEL).toBe("Accessible room");
    expect(ACCESSIBLE_ROOM_HELP_TEXT).toBe("Used when a stay requires an accessible room.");
    expect(DIALOG).toMatch(/label=\{ACCESSIBLE_ROOM_LABEL\}/);
    expect(DIALOG).toMatch(/ACCESSIBLE_ROOM_HELP_TEXT/);
    expect(DIALOG).not.toMatch(/label="Accessible"/);
  });

  it("shows the room's accessibility features read-only with the helper", () => {
    const markup = html(
      createElement(RoomAccessibilityFeatures, {
        accessible: true,
        features: [
          { name: "Grab Rails", addedToRoom: false },
          { name: "Accessible Room Entrance", addedToRoom: true },
        ],
      }),
    );
    expect(markup).toContain(ACCESSIBILITY_FEATURES_TITLE);
    expect(markup).toContain("Grab Rails");
    expect(markup).toContain("Accessible Room Entrance");
    expect(markup).toContain("Added to this room");
    expect(markup).toContain(ACCESSIBILITY_FEATURES_HELP);
    expect(markup).not.toMatch(/<input|<button|<select/);
    expect(markup).not.toContain(ROOM_ACCESSIBLE_WITHOUT_FEATURES);
  });

  it("warns when the room is accessible but has no features", () => {
    const markup = html(createElement(RoomAccessibilityFeatures, { accessible: true, features: [] }));
    expect(markup).toContain(ROOM_ACCESSIBLE_WITHOUT_FEATURES);
    expect(roomAccessibilityHint(true, 0)?.tone).toBe("warning");
  });

  it("warns when features exist but the room is not accessible", () => {
    const markup = html(
      createElement(RoomAccessibilityFeatures, {
        accessible: false,
        features: [{ name: "Grab Rails", addedToRoom: false }],
      }),
    );
    expect(markup).toContain(ROOM_FEATURES_WITHOUT_ACCESSIBLE);
    expect(roomAccessibilityHint(false, 0)).toBeNull();
  });

  it("never changes the flag on its own", () => {
    // The flag is only loaded from the room and changed by the staff checkbox.
    expect(DIALOG.match(/setAccessible\(/g)).toHaveLength(1);
    expect(DIALOG).toMatch(/setAccessible\(room\.accessible\)/);
    expect(DIALOG).toMatch(/onChange=\{setAccessible\}/);
    expect(DIALOG).toMatch(/\.filter\(isAccessibilityAmenity\)/);
  });
});

describe("Room Type", () => {
  it("relabels the guidance toggle without enforcement wording", () => {
    expect(CONTAINS_ACCESSIBLE_ROOMS_LABEL).toBe("Contains accessible rooms");
    expect(CONTAINS_ACCESSIBLE_ROOMS_HELP).toContain("must still be marked Accessible room individually");
    expect(WIZARD).toMatch(/\{CONTAINS_ACCESSIBLE_ROOMS_LABEL\}/);
    expect(WIZARD).not.toMatch(/Accessible Room Eligible|Eligible for accessible features/);
    for (const copy of [CONTAINS_ACCESSIBLE_ROOMS_LABEL, CONTAINS_ACCESSIBLE_ROOMS_HELP]) {
      expect(copy).not.toMatch(/eligib|required|enforce/i);
    }
  });

  it("counts accessible rooms among active rooms", () => {
    const rooms = [
      { accessible: true, active: true },
      { accessible: true, active: true },
      { accessible: false, active: true },
      { accessible: true, active: false },
    ];
    expect(accessibleRoomCount(rooms)).toEqual({ accessible: 2, total: 3 });
    const markup = html(createElement(RoomTypeAccessibleRooms, { containsAccessibleRooms: true, rooms }));
    expect(markup).toContain("Accessible rooms: 2 of 3");
    expect(WIZARD).toMatch(/<RoomTypeAccessibleRooms[\s\S]*?rooms=\{stagedRooms\}/);
  });

  it("warns when the guidance is ON and no room is accessible", () => {
    const markup = html(
      createElement(RoomTypeAccessibleRooms, {
        containsAccessibleRooms: true,
        rooms: [{ accessible: false, active: true }],
      }),
    );
    expect(markup).toContain(TYPE_GUIDANCE_WITHOUT_ACCESSIBLE_ROOMS);
    expect(markup).toContain('data-tone="warning"');
  });

  it("notes accessible rooms when the guidance is OFF", () => {
    const markup = html(
      createElement(RoomTypeAccessibleRooms, {
        containsAccessibleRooms: false,
        rooms: [{ accessible: true, active: true }],
      }),
    );
    expect(markup).toContain(TYPE_ACCESSIBLE_ROOMS_WITHOUT_GUIDANCE);
    expect(markup).toContain('data-tone="info"');
    expect(roomTypeAccessibilityHint(false, 0)).toBeNull();
    expect(roomTypeAccessibilityHint(true, 1)).toBeNull();
  });
});

describe("room creation", () => {
  it("suggests confirming a single room when the type contains accessible rooms", () => {
    expect(WIZARD).toMatch(
      /typeForm\.accessibleEligible \? \(\s*<AccessibilityHintNote\s*hint=\{\{ tone: "info", message: SINGLE_CREATE_ACCESSIBLE_SUGGESTION \}\}/,
    );
    expect(SINGLE_CREATE_ACCESSIBLE_SUGGESTION).toContain("Confirm whether this physical room is accessible");
  });

  it("warns before bulk create when the type contains accessible rooms", () => {
    expect(WIZARD).toMatch(
      /typeForm\.accessibleEligible \? \(\s*<AccessibilityHintNote\s*hint=\{\{ tone: "warning", message: BULK_CREATE_ACCESSIBLE_WARNING \}\}/,
    );
    expect(BULK_CREATE_ACCESSIBLE_WARNING).toContain("will not be marked accessible automatically");
  });

  it("keeps not accessible as the default and never inherits from the type", () => {
    expect(ROOMS_FNS).toMatch(/accessible: data\.accessible \?\? false,/);
    const bulkCall = WIZARD.slice(WIZARD.indexOf("const result = await bulkFn({"), WIZARD.indexOf("return result;"));
    expect(bulkCall).not.toMatch(/accessible/);
    expect(WIZARD).not.toMatch(/accessible:\s*typeForm\.accessibleEligible/);
    expect(WIZARD).not.toMatch(/setSingle\([^)]*accessible:\s*true/);
  });
});

describe("Property Setup accessibility review", () => {
  const input: AccessibilityReviewInput = {
    accessibilityRuleOn: true,
    roomTypes: [
      { id: "t-king", name: "Deluxe King", containsAccessibleRooms: true, active: true },
      { id: "t-twin", name: "Standard Twin", containsAccessibleRooms: false, active: true },
      { id: "t-suite", name: "Suite", containsAccessibleRooms: true, active: true },
    ],
    rooms: [
      { roomNumber: "101", roomTypeId: "t-king", accessible: true, active: true, accessibilityFeatureCount: 2 },
      { roomNumber: "102", roomTypeId: "t-king", accessible: false, active: true, accessibilityFeatureCount: 1 },
      { roomNumber: "201", roomTypeId: "t-twin", accessible: true, active: true, accessibilityFeatureCount: 0 },
      { roomNumber: "202", roomTypeId: "t-twin", accessible: false, active: true, accessibilityFeatureCount: 0 },
      { roomNumber: "203", roomTypeId: "t-twin", accessible: true, active: false, accessibilityFeatureCount: 0 },
    ],
  };

  it("counts every mismatch category", () => {
    const review = buildAccessibilityReview(input);
    expect(review.counts).toEqual({
      accessibleRooms: 2,
      typesContainingAccessibleRooms: 2,
      typesMarkedWithoutAccessibleRooms: 1,
      accessibleRoomsWithoutFeatures: 1,
      roomsWithFeaturesNotAccessible: 1,
    });
    const items = Object.fromEntries(review.groups.map((group) => [group.category, group.items]));
    expect(items).toEqual({
      accessible_room_type_not_marked: ["Room 201 · Standard Twin"],
      type_marked_without_accessible_rooms: ["Suite"],
      accessible_room_without_features: ["Room 201 · Standard Twin"],
      features_room_not_accessible: ["Room 102 · Deluxe King"],
    });
    expect(review.readinessWarning).toBeNull();
  });

  it("raises the readiness warning when the rule is ON with zero accessible rooms", () => {
    const review = buildAccessibilityReview({
      ...input,
      rooms: input.rooms.map((room) => ({ ...room, accessible: false })),
    });
    expect(review.readinessWarning).toBe(ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS);
    expect(review.groups.find((group) => group.category === "rule_without_accessible_rooms")?.items).toEqual([
      ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS,
    ]);
    const off = buildAccessibilityReview({ ...input, accessibilityRuleOn: false, rooms: [] });
    expect(off.readinessWarning).toBeNull();
  });

  it("renders staff labels and follows the rule shown on screen", () => {
    const review = buildAccessibilityReview({
      ...input,
      accessibilityRuleOn: false,
      rooms: input.rooms.map((room) => ({ ...room, accessible: false })),
    });
    const on = html(createElement(AccessibilityReviewPanel, { review, accessibilityRuleOn: true }));
    expect(on).toContain(ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS);
    expect(on).toContain("Accessible rooms");
    expect(on).toContain("Room 102 · Deluxe King");
    expect(on).toContain("Types marked accessible with no accessible rooms");
    const off = html(createElement(AccessibilityReviewPanel, { review, accessibilityRuleOn: false }));
    expect(off).not.toContain(ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS);
  });

  it("shows no IDs or database wording and offers no fix action", () => {
    const review = buildAccessibilityReview({
      ...input,
      rooms: [
        ...input.rooms,
        {
          roomNumber: "301",
          roomTypeId: "8d7e6c80-7082-4f40-b5ed-e860cf8e4af4",
          accessible: true,
          active: true,
          accessibilityFeatureCount: 0,
        },
      ],
    });
    const markup = html(createElement(AccessibilityReviewPanel, { review, accessibilityRuleOn: true }));
    expect(markup).not.toMatch(UUID);
    expect(markup).not.toMatch(RAW_TERMS);
    expect(markup).not.toMatch(/<button|<input/);
    expect(markup).toContain("Room 301");
  });

  it("is mounted next to the Accessibility Match rule and feeds System Validation as warnings only", () => {
    expect(INVENTORY).toMatch(/<AccessibilityReviewPanel[\s\S]*?accessibilityRuleOn=\{draft\.requireAccessibilityMatch\}/);
    expect(CARD8).toMatch(/\{ id: "accessibility", label: "Accessibility", warnings: accessibilityWarnings \}/);
    expect(CARD8).not.toMatch(/id: "accessibility"[^}]*blockers/);
    const warnings = accessibilityValidationWarnings(
      buildAccessibilityReview({ ...input, rooms: input.rooms.map((room) => ({ ...room, accessible: false })) }),
    );
    expect(warnings[0]).toBe(ACCESSIBILITY_RULE_WITHOUT_ACCESSIBLE_ROOMS);
    expect(warnings[1]).toMatch(/^Accessibility configuration has \d+ items? to review in Inventory Rules\.$/);
  });

  it("only reads configuration", () => {
    const loader = read("src/packages/pms/lib/room-accessibility.functions.ts");
    expect(loader).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe("eligibility regression lock", () => {
  const migrations = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  const definers = migrations.filter((name) =>
    /FUNCTION public\.pms_evaluate_room_assignment\(/.test(read(`supabase/migrations/${name}`)),
  );

  it("pms_evaluate_room_assignment is still last defined in 0168", () => {
    expect(definers.at(-1)).toBe("0168_room_assignment_eligibility_qualification.sql");
  });

  it("the evaluator reads only the room flag for accessibility", () => {
    const sql = read(`supabase/migrations/${definers.at(-1)}`);
    expect(sql).toMatch(/AND _accessible_required\s+AND NOT room\.accessible THEN/);
    expect(sql).not.toMatch(/accessible_eligible|room_type_amenities|room_amenities|hotel_room_amenity_overrides|ACC_/);
  });

  it("0210 final enforcement adds no capability source of its own", () => {
    const sql = read("supabase/migrations/0210_room_requirement_final_enforcement.sql").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/accessible_eligible|room_type_amenities|room_amenities|hotel_room_amenity_overrides|ACC_/);
  });

  it("no migration after 0210 touches accessibility capability", () => {
    const later = migrations.filter(
      (name) => /^\d{4}_/.test(name) && name > "0210_room_requirement_final_enforcement.sql",
    );
    for (const name of later) {
      // Calling the evaluator is allowed (0213 asks it about the partner's room). Redefining it,
      // or adding a capability source of its own, is not.
      expect(read(`supabase/migrations/${name}`)).not.toMatch(
        /accessible_eligible|CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?pms_evaluate_room_assignment/i,
      );
    }
  });

  it("the review helpers stay out of assignment code", () => {
    const pmsLib = readdirSync(resolve(root, "src/packages/pms/lib")).filter((name) => /\.(ts|tsx)$/.test(name));
    const importers = pmsLib.filter(
      (name) =>
        !name.endsWith(".test.ts") &&
        /(from |import\()"\.\/room-accessibility(\.functions)?"/.test(read(`src/packages/pms/lib/${name}`)),
    );
    expect(importers.sort()).toEqual(["pms-property-setup-card8-validation.functions.ts", "room-accessibility.functions.ts"]);
    expect(read("src/packages/pms/lib/room-accessibility.ts")).not.toMatch(/evaluateRoomAssignment|assign_hotel|rpc\(/);
  });
});
