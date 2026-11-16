import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoomRequirementsView } from "@/packages/pms/components/bookings/room-requirements-fields";
import { parseCreateReservationDraft } from "@/packages/pms/lib/create-reservation-draft";
import {
  applyRoomRequirements,
  initialStep1RoomingState,
  selectReservationMode,
  type Step1RoomingState,
} from "@/packages/pms/lib/create-reservation-rooming";
import {
  buildEditChangeRows,
  draftFromReservation,
  editDraftDirty,
  editDraftRequirements,
  persistableChanges,
  roomRequirementsEditLocked,
  type ReservationEditDraft,
} from "@/packages/pms/lib/reservation-edit-workspace";
import {
  ACCESSIBLE_ROOM_HELP,
  ACCESSIBLE_ROOM_LABEL,
  ASSIGNED_ROOM_REQUIREMENT_WARNING,
  CONNECTING_ROOM_HELP,
  CONNECTING_ROOM_LABEL,
  GUEST_ACCESSIBILITY_PROMPT,
  NO_ROOM_REQUIREMENTS,
  assignedRoomRequirementWarning,
  guestAccessibilityNote,
  persistUnitRoomRequirements,
  resolveCreateUnitRequirements,
  roomRequirementChanges,
  roomRequirementColumns,
  roomRequirementsFromRow,
  type RoomRequirementWriteDb,
  type RoomRequirements,
} from "@/packages/pms/lib/reservation-room-requirements";
import {
  createReservationRoomUnitPayload,
  projectReservationRoomUnits,
  type ReservationRoomUnitRow,
} from "@/packages/pms/lib/reservation-room-units";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

const req = (accessible: boolean, connecting: boolean): RoomRequirements => ({
  accessibleRoomRequired: accessible,
  connectingRoomRequired: connecting,
});

/** Records every write. Mirrors the update().eq().eq().in() shape of the service client. */
function fakeDb(failWith?: string) {
  const writes: Array<{
    table: string;
    values: Record<string, boolean>;
    filters: Array<[string, unknown]>;
  }> = [];
  const db: RoomRequirementWriteDb = {
    from: (table) => ({
      update: (values) => {
        const write = { table, values, filters: [] as Array<[string, unknown]> };
        writes.push(write);
        const builder = {
          eq(column: string, value: string) {
            write.filters.push([column, value]);
            return builder;
          },
          in(column: string, values: number[]) {
            write.filters.push([column, values]);
            return builder;
          },
          then<T>(
            resolveFn: (value: { error: { message: string } | null }) => T,
            rejectFn?: (reason: unknown) => T,
          ) {
            return Promise.resolve({ error: failWith ? { message: failWith } : null }).then(
              resolveFn,
              rejectFn,
            );
          },
        };
        return builder as never;
      },
    }),
  };
  return { db, writes };
}

function unitRow(
  id: string,
  sequence: number,
  requirements: Partial<ReservationRoomUnitRow> = {},
): ReservationRoomUnitRow {
  return {
    id,
    unit_sequence: sequence,
    room_type_id: "type-1",
    room_id: null,
    arrival_date: "2026-09-22",
    departure_date: "2026-09-24",
    adults: 2,
    children: 0,
    infants: 0,
    rate_plan_id: null,
    currency: null,
    nightly_rate_snapshot: [],
    room_subtotal: null,
    priced_at: null,
    status: "confirmed",
    ...requirements,
  };
}

function detail(rows: ReservationRoomUnitRow[], overrides: Partial<ReservationDetail> = {}) {
  const base = {
    id: "res-1",
    guestId: "guest-1",
    guestName: "Maria Santos",
    roomTypeId: "type-1",
    roomTypeName: "Deluxe King",
    roomId: null,
    roomNumber: null,
    arrivalDate: "2026-09-22",
    departureDate: "2026-09-24",
    adults: 2,
    children: 0,
    infants: 0,
    status: "confirmed",
    specialRequests: null,
    notes: null,
    ratePlanId: null,
    ratePlanName: null,
    currency: null,
    roomSubtotal: null,
    nightlyRates: [],
    pricedAt: null,
    commercialBookingSource: null,
    marketSegment: null,
    externalReference: null,
    guaranteeMethod: null,
    ...overrides,
  } as unknown as ReservationDetail;
  base.rooms = projectReservationRoomUnits(base, rows);
  return base;
}

describe("Create: requirements captured per room unit", () => {
  it("writes false when nothing was sent at all", () => {
    expect(resolveCreateUnitRequirements({ unitCount: 1 })).toEqual([req(false, false)]);
  });

  it("keeps a single room payload without room units", () => {
    const payload = createReservationRoomUnitPayload({
      roomTypeId: "type-1",
      adults: 2,
      children: 0,
      infants: 0,
      ratePlanId: null,
      roomsRequested: 1,
      room1Requirements: req(true, true),
      extraUnits: [],
    });
    expect(payload).toEqual({ rooms: 1, roomUnits: null });
  });

  it("carries the fields through the create server function schema and handler", () => {
    const source = read("src/packages/pms/lib/reservations.functions.ts");
    expect(source).toMatch(/roomUnits: z[\s\S]*?accessibleRoomRequired: z\.boolean\(\)\.optional\(\)/);
    expect(source).toContain("resolveCreateUnitRequirements");
    expect(source).toContain("saveRoomRequirementsAtomic");
    expect(source).toContain("saveReservationRoomRequirements");
    // The RPC arguments are not changed. The deployed functions ignore unknown keys.
    expect(source).not.toMatch(/room_type_id: unit\.roomTypeId,[\s\S]{0,200}accessible_room_required/);
  });

  it("keeps the create wizard payload explicit", () => {
    const page = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
    expect(page).toContain("accessibleRoomRequired: room1Requirements.accessibleRoomRequired");
    expect(page).toContain("connectingRoomRequired: room1Requirements.connectingRoomRequired");
    expect(page).toContain("room1Requirements,");
    const list = read("src/packages/pms/components/bookings/create-reservation-rooming-list.tsx");
    expect(list).toContain("RoomRequirementsFields");
  });
});

describe("Create: wizard state", () => {
  function group(): Step1RoomingState {
    const state = selectReservationMode(initialStep1RoomingState(), "group").state;
    return {
      ...state,
      extras: [
        {
          key: "b",
          roomTypeId: "type-1",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: null,
          occupant: null,
        },
        {
          key: "c",
          roomTypeId: "type-1",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: null,
          occupant: null,
        },
      ],
    };
  }

  it("updates only the targeted room", () => {
    let state = applyRoomRequirements(group(), 0, { accessibleRoomRequired: true });
    state = applyRoomRequirements(state, 2, { connectingRoomRequired: true });
    expect(state.room1).toMatchObject({ accessibleRoomRequired: true });
    expect(state.room1.connectingRoomRequired).toBeUndefined();
    expect(state.extras[0]!.accessibleRoomRequired).toBeUndefined();
    expect(state.extras[1]).toMatchObject({ connectingRoomRequired: true });
    expect(state.extras[1]!.accessibleRoomRequired).toBeUndefined();
  });

  it("keeps requirements and defaults to false when a saved draft is restored", () => {
    const parsed = parseCreateReservationDraft({
      version: 1,
      room1Requirements: { accessibleRoomRequired: true },
      extraRoomUnits: [
        { key: "a", roomTypeId: "t", connectingRoomRequired: true },
        { key: "b", roomTypeId: "t" },
      ],
    });
    expect(parsed?.room1Requirements).toEqual(req(true, false));
    expect(parsed?.extraRoomUnits[0]).toMatchObject({
      accessibleRoomRequired: false,
      connectingRoomRequired: true,
    });
    expect(parsed?.extraRoomUnits[1]).toMatchObject({
      accessibleRoomRequired: false,
      connectingRoomRequired: false,
    });
    expect(parseCreateReservationDraft({ version: 1 })?.room1Requirements).toEqual(
      NO_ROOM_REQUIREMENTS,
    );
  });
});

describe("Edit: stored values load, change and persist per unit", () => {
  const unitA = "aaaaaaaa-0000-0000-0000-000000000001";
  const unitB = "bbbbbbbb-0000-0000-0000-000000000002";

  it("loads the stored values of the only room unit", () => {
    const draft = draftFromReservation(
      detail([unitRow(unitA, 1, { accessible_room_required: true, connecting_room_required: false })]),
    );
    expect(draft.reservationRoomId).toBe(unitA);
    expect(editDraftRequirements(draft)).toEqual(req(true, false));
  });

  it("loads the values of the selected unit on a multi-room stay", () => {
    const reservation = detail([
      unitRow(unitA, 1, { accessible_room_required: true }),
      unitRow(unitB, 2, { connecting_room_required: true }),
    ]);
    const unselected = draftFromReservation(reservation);
    expect(roomRequirementsEditLocked(unselected)).toBe(true);
    expect(editDraftRequirements(unselected)).toEqual(req(false, false));
    const second = draftFromReservation(reservation, reservation.rooms![1]);
    expect(second.reservationRoomId).toBe(unitB);
    expect(editDraftRequirements(second)).toEqual(req(false, true));
  });

  it("locks the controls when there is no unit to save to", () => {
    expect(roomRequirementsEditLocked(draftFromReservation(detail([])))).toBe(true);
  });

  function drafts(stored: Partial<ReservationRoomUnitRow>) {
    const before = draftFromReservation(detail([unitRow(unitA, 1, stored)]));
    return { before, after: { ...before } as ReservationEditDraft };
  }

  it("shows false to true in the change review and enables save", () => {
    const { before, after } = drafts({});
    after.accessibleRoomRequired = true;
    const rows = buildEditChangeRows({ before, after });
    const row = rows.find((item) => item.item === ACCESSIBLE_ROOM_LABEL)!;
    expect(row).toMatchObject({ before: "No", after: "Yes", persistable: true });
    expect(persistableChanges(rows).map((item) => item.item)).toContain(ACCESSIBLE_ROOM_LABEL);
    expect(editDraftDirty(before, after)).toBe(true);
  });

  it("shows true to false in the change review", () => {
    const { before, after } = drafts({ connecting_room_required: true });
    after.connectingRoomRequired = false;
    const rows = buildEditChangeRows({ before, after });
    expect(rows.find((item) => item.item === CONNECTING_ROOM_LABEL)).toMatchObject({
      before: "Yes",
      after: "No",
      persistable: true,
    });
  });

  it("adds nothing to the review when nothing changed", () => {
    const { before, after } = drafts({ accessible_room_required: true });
    const items = buildEditChangeRows({ before, after }).map((item) => item.item);
    expect(items).not.toContain(ACCESSIBLE_ROOM_LABEL);
    expect(items).not.toContain(CONNECTING_ROOM_LABEL);
    expect(editDraftDirty(before, after)).toBe(false);
    expect(roomRequirementChanges(req(true, false), req(true, false))).toEqual([]);
  });

  it("lists both when both change", () => {
    expect(roomRequirementChanges(req(false, true), req(true, false))).toEqual([
      { item: ACCESSIBLE_ROOM_LABEL, before: "No", after: "Yes" },
      { item: CONNECTING_ROOM_LABEL, before: "Yes", after: "No" },
    ]);
  });

  it("writes false to true and true to false on the selected unit only", async () => {
    const { db, writes } = fakeDb();
    const on = await persistUnitRoomRequirements(db, {
      restaurantId: "p1",
      reservationId: "r1",
      unitId: unitB,
      stored: req(false, false),
      next: req(true, false),
    });
    const off = await persistUnitRoomRequirements(db, {
      restaurantId: "p1",
      reservationId: "r1",
      unitId: unitB,
      stored: req(true, true),
      next: req(false, true),
    });
    expect(on && off).toBe(true);
    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(write.table).toBe("hotel_reservation_rooms");
      expect(write.filters).toContainEqual(["id", unitB]);
      expect(write.filters).not.toContainEqual(["id", unitA]);
      expect(Object.keys(write.values).sort()).toEqual([
        "accessible_room_required",
        "connecting_room_required",
      ]);
    }
    expect(writes[0]!.values).toEqual({
      accessible_room_required: true,
      connecting_room_required: false,
    });
    expect(writes[1]!.values).toEqual({
      accessible_room_required: false,
      connecting_room_required: true,
    });
  });

  it("makes no write when the stored value is unchanged", async () => {
    const { db, writes } = fakeDb();
    const wrote = await persistUnitRoomRequirements(db, {
      restaurantId: "p1",
      reservationId: "r1",
      unitId: unitA,
      stored: req(true, false),
      next: req(true, false),
    });
    expect(wrote).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("is wired through the amend schema, the unit read and the save call", () => {
    const source = read("src/packages/pms/lib/reservations.functions.ts");
    expect(source).toMatch(/specialOccasion: z[\s\S]*?accessibleRoomRequired: z\.boolean\(\)\.optional\(\)/);
    expect(source).toContain("accessible_room_required, connecting_room_required");
    expect(source).toContain("persistUnitRoomRequirements");
    const workspace = read("src/packages/pms/components/workspaces/reservation-edit-workspace.tsx");
    expect(workspace).toContain("accessibleRoomRequired: liveDraft.accessibleRoomRequired");
    expect(workspace).toContain("connectingRoomRequired: liveDraft.connectingRoomRequired");
    expect(workspace).toContain("<RoomRequirementsFields");
  });
});

describe("Guest accessibility prompt", () => {
  const html = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(RoomRequirementsView, {
        idPrefix: "room-1",
        value: NO_ROOM_REQUIREMENTS,
        onChange: () => undefined,
        ...props,
      }),
    );

  it("shows the prompt and leaves the requirement off", () => {
    const markup = html({ guestAccessibilityText: "Uses a wheelchair. Needs a roll-in shower." });
    expect(markup).toContain(GUEST_ACCESSIBILITY_PROMPT);
    expect(markup).toContain("room-1-guest-accessibility-prompt");
    const accessible = markup.match(/<button[^>]*id="room-1-accessible-room-required"[^>]*>/)![0];
    expect(accessible).toContain('data-state="unchecked"');
    expect(accessible).toContain('aria-checked="false"');
  });

  it("offers the saved text to view without opening it by default", () => {
    const closed = html({ guestAccessibilityText: "Step-free access" });
    expect(closed).toContain("View");
    expect(closed).not.toContain("room-1-guest-accessibility-text");
    const opened = html({ guestAccessibilityText: "Step-free access", initiallyOpen: true });
    expect(opened).toContain("Step-free access");
  });

  it("shows nothing for empty or blank text", () => {
    for (const text of [null, undefined, "", "   \n"]) {
      expect(html({ guestAccessibilityText: text })).not.toContain(GUEST_ACCESSIBILITY_PROMPT);
    }
  });

  it("returns the saved text unchanged and never parses it", () => {
    expect(guestAccessibilityNote("  wheelchair accessible room  ")).toBe(
      "wheelchair accessible room",
    );
    expect(guestAccessibilityNote(null)).toBeNull();
    const source = read("src/packages/pms/components/bookings/room-requirements-fields.tsx");
    expect(source).not.toMatch(/\.(test|match|includes|toLowerCase)\(/);
  });

  it("does not turn on a requirement when the draft is built from a guest with accessibility text", () => {
    const draft = draftFromReservation(detail([unitRow("u1", 1)], { guestId: "guest-1" }));
    expect(editDraftRequirements(draft)).toEqual(req(false, false));
    expect(
      read("src/packages/pms/components/bookings/room-requirements-fields.tsx"),
    ).not.toContain("onChange({ accessibleRoomRequired: true");
  });
});

describe("Legacy connecting text", () => {
  it("does not enable the hard requirement from special requests", () => {
    const reservation = detail([unitRow("u1", 1)], {
      specialRequests: "Connecting rooms please. Connecting room (if available).",
    });
    const draft = draftFromReservation(reservation);
    expect(draft.specialRequests).toContain("Connecting rooms");
    expect(draft.connectingRoomRequired).toBe(false);
    expect(draft.accessibleRoomRequired).toBe(false);
    expect(reservation.rooms![0]!.connectingRoomRequired).toBe(false);
  });

  it("reads only an explicit true from storage", () => {
    expect(roomRequirementsFromRow({})).toEqual(req(false, false));
    expect(roomRequirementsFromRow(null)).toEqual(req(false, false));
    expect(roomRequirementsFromRow({ connecting_room_required: null })).toEqual(req(false, false));
    expect(roomRequirementsFromRow({ connecting_room_required: true })).toEqual(req(false, true));
  });

  it("keeps the soft special-request chips away from the hard requirement", () => {
    for (const name of [
      "create-reservation-review.ts",
      "reservation-detail-requests.ts",
      "reservation-detail-rooms.ts",
    ]) {
      expect(read(`src/packages/pms/lib/${name}`)).not.toContain("reservation-room-requirements");
    }
  });

  it("states the difference next to the controls", () => {
    const markup = renderToStaticMarkup(
      createElement(RoomRequirementsView, {
        idPrefix: "room-1",
        value: NO_ROOM_REQUIREMENTS,
        onChange: () => undefined,
        showSoftRequestNote: true,
      }),
    );
    expect(markup).toContain("Special requests are notes only");
  });
});

describe("Assigned room warning", () => {
  it("warns when a requirement is turned on for a unit that holds a room", () => {
    for (const after of [req(true, false), req(false, true), req(true, true)]) {
      expect(
        assignedRoomRequirementWarning({
          hasAssignedRoom: true,
          before: req(false, false),
          after,
        }),
      ).toBe(ASSIGNED_ROOM_REQUIREMENT_WARNING);
    }
  });

  it("does not warn without an assigned room, when turning off, or when unchanged", () => {
    const none = (input: Parameters<typeof assignedRoomRequirementWarning>[0]) =>
      expect(assignedRoomRequirementWarning(input)).toBeNull();
    none({ hasAssignedRoom: false, before: req(false, false), after: req(true, false) });
    none({ hasAssignedRoom: true, before: req(true, true), after: req(false, false) });
    none({ hasAssignedRoom: true, before: req(true, false), after: req(true, false) });
  });

  it("renders the notice and does not change the room or block the save", () => {
    const markup = renderToStaticMarkup(
      createElement(RoomRequirementsView, {
        idPrefix: "edit-room",
        value: req(true, false),
        onChange: () => undefined,
        assignedRoomWarning: ASSIGNED_ROOM_REQUIREMENT_WARNING,
      }),
    );
    expect(markup).toContain("The currently assigned room has not been re-checked");
    expect(markup).not.toMatch(/<button[^>]*id="edit-room-accessible-room-required"[^>]*disabled/);

    // Turning a requirement on touches the requirement columns only. The room stays.
    const columns = roomRequirementColumns(req(true, false));
    expect(Object.keys(columns).sort()).toEqual([
      "accessible_room_required",
      "connecting_room_required",
    ]);
  });

  it("keeps eligibility and unassignment logic out of the frontend files", () => {
    const files = [
      "src/packages/pms/components/bookings/room-requirements-fields.tsx",
      "src/packages/pms/lib/reservation-room-requirements.ts",
    ]
      .map(read)
      .map((source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
    for (const source of files) {
      expect(source).not.toMatch(
        /pms_evaluate_room_assignment|getAssignmentEligibility|assign_hotel_reservation_room|unassign|accessibilityCapable|hotel_room_links/i,
      );
    }
    const workspace = read("src/packages/pms/components/workspaces/reservation-edit-workspace.tsx");
    const block = workspace.slice(
      workspace.indexOf("<RoomRequirementsFields"),
      workspace.indexOf("<RoomRequirementsFields") + 900,
    );
    expect(block).not.toMatch(/roomId:\s*null/);
  });
});

describe("Hard requirement wording", () => {
  it("never uses soft wording", () => {
    const text = [
      ACCESSIBLE_ROOM_LABEL,
      ACCESSIBLE_ROOM_HELP,
      CONNECTING_ROOM_LABEL,
      CONNECTING_ROOM_HELP,
      read("src/packages/pms/components/bookings/room-requirements-fields.tsx"),
      read("src/packages/pms/lib/reservation-room-requirements.ts"),
    ].join("\n");
    expect(text).not.toMatch(/preferred|if available|try to match/i);
    expect(ACCESSIBLE_ROOM_HELP).toBe("Only assign a room marked as accessible.");
    expect(CONNECTING_ROOM_HELP).toBe("Only assign a room with connecting-room capability.");
  });
});
