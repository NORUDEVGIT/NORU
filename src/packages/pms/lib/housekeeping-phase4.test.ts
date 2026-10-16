import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyHousekeepingCard2Settings, evaluateRoomReadinessWithPolicy } from "./housekeeping-card2.server.ts";
import {
  formatHousekeepingHistoryDetail,
  maintenanceTicketStateConsistent,
  nextMaintenanceStatusFromOpenTickets,
} from "./housekeeping-ops.ts";
import { roomPersistencePayload } from "./room-inventory-compat.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("HK Phase 4 — ticket ↔ maintenance_status mapping", () => {
  it("maps open/start/resolve without using hotel_rooms.status values", () => {
    assert.equal(nextMaintenanceStatusFromOpenTickets([{ status: "open" }]), "maintenance_required");
    assert.equal(
      nextMaintenanceStatusFromOpenTickets([{ status: "open" }, { status: "in_progress" }]),
      "in_progress",
    );
    assert.equal(nextMaintenanceStatusFromOpenTickets([{ status: "resolved" }]), "normal");
    assert.equal(nextMaintenanceStatusFromOpenTickets([]), "normal");
    assert.equal(
      maintenanceTicketStateConsistent({
        liveTickets: [{ status: "resolved" }],
        roomMaintenanceStatus: "maintenance_required",
      }),
      false,
    );
    assert.equal(
      maintenanceTicketStateConsistent({
        liveTickets: [{ status: "open" }],
        roomMaintenanceStatus: "normal",
      }),
      false,
    );
  });
});

describe("HK Phase 4 — canonical maintenance_status writer", () => {
  it("syncs tickets through applyRoomMaintenanceStatus and strips saveRoom updates", () => {
    const server = readRel("./housekeeping.server.ts");
    assert.match(server, /export async function applyRoomMaintenanceStatus/);
    assert.match(server, /Canonical writer for hotel_rooms.maintenance_status/);
    const writer = server.slice(
      server.indexOf("export async function applyRoomMaintenanceStatus"),
      server.indexOf("export async function syncRoomMaintenanceFromTickets"),
    );
    assert.match(writer, /update\(\{ maintenance_status: params.nextStatus \}\)/);
    assert.doesNotMatch(writer, /\.update\(\{[^}]*\bstatus:/);

    const ops = readRel("./housekeeping.functions.ts");
    assert.match(ops, /syncRoomMaintenanceFromTickets/);
    const create = ops.slice(ops.indexOf("export const createMaintenanceRequest"), ops.indexOf("export const updateMaintenanceRequest"));
    const update = ops.slice(ops.indexOf("export const updateMaintenanceRequest"), ops.indexOf("export const listHousekeepingHistory"));
    assert.match(create, /syncRoomMaintenanceFromTickets/);
    assert.match(update, /syncRoomMaintenanceFromTickets/);

    const complete = ops.slice(ops.indexOf("export const completeHousekeepingTask"), ops.indexOf("export const listInspections"));
    assert.doesNotMatch(complete, /syncRoomMaintenanceFromTickets/);
    assert.doesNotMatch(complete, /applyRoomMaintenanceStatus/);

    const stripped = roomPersistencePayload(
      { room_number: "305", maintenance_status: "in_progress", status: "out_of_order" },
      "update",
    );
    assert.equal("maintenance_status" in stripped, false);
    assert.equal("status" in stripped, false);
  });

  it("keeps OOO on the restriction RPC and does not fork a work_orders table", () => {
    const restrict = readRel("./housekeeping.functions.ts");
    const block = restrict.slice(
      restrict.indexOf("export const setRoomRestriction"),
      restrict.indexOf("export const listDiscrepancies"),
    );
    assert.match(block, /setOperationalRestrictionCompat/);
    assert.doesNotMatch(block, /applyRoomMaintenanceStatus/);

    const ui = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    const tab = ui.slice(ui.indexOf("export function MaintenanceTab"), ui.lastIndexOf("Log request"));
    assert.match(tab, /hk-maintenance-workspace/);
    assert.match(tab, /Set OOO \/ OOS restriction/);
    assert.doesNotMatch(tab, /work_orders/);
    assert.doesNotMatch(ui, /from\("work_orders"\)/);
  });

  it("blocks FO check-in when maintenanceClearRequired and status is not normal", () => {
    const blocked = evaluateRoomReadinessWithPolicy(
      { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "maintenance_required" },
      emptyHousekeepingCard2Settings({ maintenanceClearRequired: true }),
    );
    assert.equal(blocked.ready, false);
    assert.match(blocked.reason ?? "", /Maintenance must clear/);

    const cleared = evaluateRoomReadinessWithPolicy(
      { status: "available", housekeepingStatus: "inspected", maintenanceStatus: "normal" },
      emptyHousekeepingCard2Settings({ maintenanceClearRequired: true }),
    );
    assert.equal(cleared.ready, true);
  });
});

describe("HK Phase 4A — Card 2 snapshot helper is imported", () => {
  it("imports loadCard2HousekeepingSnapshot from the canonical Card 2 functions module", () => {
    const server = readRel("./housekeeping.server.ts");
    assert.match(
      server,
      /import \{ loadCard2HousekeepingSnapshot \} from "\.\/housekeeping-card2\.functions"/,
    );
    const enabled = server.slice(
      server.indexOf("async function requireHousekeepingEnabled"),
      server.indexOf("export async function requireHousekeepingAccess"),
    );
    assert.match(enabled, /loadCard2HousekeepingSnapshot\(supabaseAdmin, restaurantId\)/);
    assert.doesNotMatch(enabled, /from\("pms_housekeeping_settings"\)\.upsert/);
  });
});

describe("HK Phase 4A — create then list maintenance tickets", () => {
  it("lists from the same table create writes and does not hide the new open row", () => {
    const ops = readRel("./housekeeping.functions.ts");
    const list = ops.slice(
      ops.indexOf("export const listMaintenanceRequests"),
      ops.indexOf("export const createMaintenanceRequest"),
    );
    const create = ops.slice(
      ops.indexOf("export const createMaintenanceRequest"),
      ops.indexOf("export const updateMaintenanceRequest"),
    );
    assert.match(create, /from\("housekeeping_maintenance_requests"\)/);
    assert.match(list, /from\("housekeeping_maintenance_requests"\)/);
    assert.match(list, /hotel_rooms!housekeeping_maintenance_room_same_property/);
    assert.doesNotMatch(list, /hotel_rooms!inner/);
    assert.doesNotMatch(list, /\.eq\("status"/);
    assert.doesNotMatch(list, /\.gte\("created_at"/);
    assert.doesNotMatch(list, /from\("work_orders"\)/);

    const tab = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    const maint = tab.slice(
      tab.indexOf("export function MaintenanceTab"),
      tab.indexOf("export function HousekeepingHistoryTab"),
    );
    assert.match(maint, /queryKey: \["hk-maintenance", restaurantId\]/);
    const createMut = maint.slice(maint.indexOf("const create = useMutation"), maint.indexOf("const update = useMutation"));
    assert.match(createMut, /invalidate\(\)/);
    assert.match(createMut, /setSelectedId\(row\.id\)/);
  });
});

describe("HK Phase 4A — history detail is hotel language", () => {
  it("formats known events and never dumps raw JSON or ids", () => {
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "cleaning_task_created",
        newValues: {
          task_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          task_type: "departure_cleaning",
          priority: "high",
        },
      }),
      "Departure cleaning · High priority",
    );
    assert.equal(formatHousekeepingHistoryDetail({ eventType: "cleaning_started" }), "Cleaning started");
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "cleaning_completed",
        newValues: JSON.stringify({
          task_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          housekeeping_status: "clean",
          automatic_transition: true,
        }),
      }),
      "Room changed to Clean",
    );
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "room_dirty",
        newValues: {
          housekeeping_status: "dirty",
          reservation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          automatic_transition: true,
        },
      }),
      "Room changed to Dirty after checkout",
    );
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "maintenance_created",
        notes: "Plumbing Work",
        newValues: {
          request_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          category: "plumbing",
          priority: "normal",
        },
      }),
      "Plumbing Work",
    );
    assert.equal(
      formatHousekeepingHistoryDetail({
        eventType: "maintenance_updated",
        newValues: { status: "in_progress", request_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      }),
      "Maintenance work started",
    );
    assert.equal(formatHousekeepingHistoryDetail({ eventType: "maintenance_resolved" }), "Maintenance issue resolved");
    assert.equal(formatHousekeepingHistoryDetail({ eventType: "inspection_passed" }), "Inspection passed");
    assert.equal(
      formatHousekeepingHistoryDetail({ eventType: "inspection_failed", notes: "Missed corners" }),
      "Inspection failed · Missed corners",
    );
    const unknown = formatHousekeepingHistoryDetail({
      eventType: "mystery_event",
      newValues: JSON.stringify({
        task_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        automatic_transition: true,
      }),
    });
    assert.equal(unknown, "Mystery event");
    assert.doesNotMatch(unknown, /task_id/);
    assert.doesNotMatch(unknown, /\{/);

    const ui = readRel("../components/housekeeping/housekeeping-tabs.tsx");
    const history = ui.slice(ui.indexOf("export function HousekeepingHistoryTab"));
    assert.match(history, /formatHousekeepingHistoryDetail/);
    assert.doesNotMatch(history, /h\.notes \?\? h\.newValues/);
    assert.doesNotMatch(history, /JSON\.stringify/);
  });
});
