import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { foundationRevenueViews, implementedRevenueViews } from "../rate-revenue-workspace.ts";
import { resolveRevenueAccess } from "./revenue-access.ts";
import {
  allowedRevenueApprovalTransition,
  buildRateDisplaySnapshot,
  canSelfApproveRevenueRequest,
  encodeExpectedVersions,
  isStaleDomainError,
  isTerminalRevenueApprovalStatus,
  parseRevenueApprovalProposal,
  policyFromRow,
  summarizeCommercialApproval,
  summarizeRateApproval,
  summarizeRestrictionApproval,
} from "./revenue-approval.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const drizzle = readRel("../../../../../drizzle/migrations/0109_pms_revenue_approvals.sql");
const supabase = readRel("../../../../../supabase/migrations/0109_pms_revenue_approvals.sql");
const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");

const PROPERTY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const MANAGER_B = "22222222-2222-4222-8222-222222222222";
const STAFF_C = "33333333-3333-4333-8333-333333333333";
const USER_A = "44444444-4444-4444-8444-444444444444";
const USER_B = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";

function createMemoryDb() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    hotel_revenue_approval_policy: [],
    hotel_revenue_approval_requests: [],
    hotel_revenue_approval_events: [],
    restaurant_users: [
      { id: OWNER_A, restaurant_id: PROPERTY_A, user_id: USER_A, role: "owner", active: true },
      { id: MANAGER_B, restaurant_id: PROPERTY_A, user_id: USER_B, role: "manager", active: true },
      {
        id: STAFF_C,
        restaurant_id: PROPERTY_A,
        user_id: "77777777-7777-4777-8777-777777777777",
        role: "accountant",
        active: true,
      },
    ],
    profiles: [
      { id: USER_A, first_name: "Ada", last_name: "Owner", email: "ada@example.com" },
      { id: USER_B, first_name: "Mo", last_name: "Manager", email: "mo@example.com" },
    ],
  };
  let failApply = false;
  let staleApply = false;

  function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let mode: "select" | "insert" | "upsert" = "select";
    let payload: unknown = null;
    let inIds: { column: string; values: unknown[] } | null = null;
    let gte: [string, string] | null = null;
    let lte: [string, string] | null = null;
    let wantMaybe = false;
    let range: [number, number] | null = null;
    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown> | Array<Record<string, unknown>>) {
        mode = "insert";
        payload = value;
        return api;
      },
      upsert(value: Record<string, unknown>) {
        mode = "upsert";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      in(column: string, values: unknown[]) {
        inIds = { column, values };
        return api;
      },
      gte(column: string, value: string) {
        gte = [column, value];
        return api;
      },
      lte(column: string, value: string) {
        lte = [column, value];
        return api;
      },
      order() {
        return api;
      },
      range(fromIdx: number, toIdx: number) {
        range = [fromIdx, toIdx];
        return api;
      },
      limit(count: number) {
        return api;
      },
      maybeSingle() {
        wantMaybe = true;
        return api.then ? api : Promise.resolve(api).then(() => execute());
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };

    function execute() {
      const rows = tables[table] ?? [];
      if (mode === "upsert") {
        const row = payload as Record<string, unknown>;
        const existing = rows.find((item) => item.restaurant_id === row.restaurant_id);
        if (existing) Object.assign(existing, row);
        else rows.push({ ...row, created_at: new Date().toISOString() });
        tables[table] = rows;
        const current = rows.find((item) => item.restaurant_id === row.restaurant_id) ?? row;
        return { data: current, error: null, count: 1 };
      }
      if (mode === "insert") {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items as Array<Record<string, unknown>>) {
          rows.push({
            id: item.id ?? crypto.randomUUID(),
            created_at: new Date().toISOString(),
            ...item,
          });
        }
        tables[table] = rows;
        return { data: items, error: null };
      }
      let found = rows.filter((row) => matches(row, filters));
      if (inIds) found = found.filter((row) => inIds!.values.includes(row[inIds!.column]));
      if (gte) found = found.filter((row) => String(row[gte![0]] ?? "") >= gte![1]);
      if (lte) found = found.filter((row) => String(row[lte![0]] ?? "") <= lte![1]);
      if (range) found = found.slice(range[0], range[1] + 1);
      if (wantMaybe) return { data: found[0] ?? null, error: null };
      return { data: found, error: null, count: found.length };
    }

    return api;
  }

  function rpc(name: string, args: Record<string, unknown>) {
    if (name === "count_eligible_revenue_approvers") {
      const count = tables.restaurant_users.filter(
        (row) =>
          row.restaurant_id === args._restaurant_id &&
          row.active === true &&
          (row.role === "owner" || row.role === "manager"),
      ).length;
      return Promise.resolve({ data: count, error: null });
    }
    if (name === "submit_hotel_revenue_approval") {
      const membership = tables.restaurant_users.find((row) => row.id === args._membership_id);
      if (
        !membership ||
        membership.restaurant_id !== args._restaurant_id ||
        (membership.role !== "owner" && membership.role !== "manager")
      ) {
        return Promise.resolve({ data: null, error: { message: "REVENUE_APPROVAL_FORBIDDEN" } });
      }
      const id = crypto.randomUUID();
      tables.hotel_revenue_approval_requests.push({
        id,
        restaurant_id: args._restaurant_id,
        domain: args._domain,
        action_type: args._action_type,
        entity_type: args._entity_type,
        entity_id: args._entity_id,
        status: "pending",
        requested_by: args._membership_id,
        requested_at: new Date().toISOString(),
        request_reason: args._request_reason,
        reviewed_by: null,
        reviewed_at: null,
        review_reason: null,
        proposal_payload: args._proposal_payload,
        display_snapshot: args._display_snapshot,
        expected_version: args._expected_version,
        applied_operation_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      tables.hotel_revenue_approval_events.push({
        id: crypto.randomUUID(),
        restaurant_id: args._restaurant_id,
        approval_request_id: id,
        event_type: "submitted",
        actor_id: args._membership_id,
        reason: args._request_reason,
        created_at: new Date().toISOString(),
        metadata: null,
      });
      return Promise.resolve({ data: { id, status: "pending" }, error: null });
    }
    if (name === "transition_hotel_revenue_approval") {
      const request = tables.hotel_revenue_approval_requests.find(
        (row) => row.id === args._request_id && row.restaurant_id === args._restaurant_id,
      );
      if (!request)
        return Promise.resolve({ data: null, error: { message: "REVENUE_APPROVAL_NOT_FOUND" } });
      if (request.status !== "pending")
        return Promise.resolve({ data: null, error: { message: "REVENUE_APPROVAL_NOT_PENDING" } });
      if (args._event_type === "cancelled" && request.requested_by !== args._membership_id) {
        return Promise.resolve({
          data: null,
          error: { message: "REVENUE_APPROVAL_CANCEL_FORBIDDEN" },
        });
      }
      if (args._event_type === "rejected" && !String(args._reason ?? "").trim()) {
        return Promise.resolve({
          data: null,
          error: { message: "REVENUE_APPROVAL_REVIEW_REASON_REQUIRED" },
        });
      }
      const eligible = tables.restaurant_users.filter(
        (row) =>
          row.restaurant_id === args._restaurant_id &&
          row.active === true &&
          (row.role === "owner" || row.role === "manager"),
      ).length;
      if (
        args._event_type === "rejected" &&
        eligible > 1 &&
        request.requested_by === args._membership_id
      ) {
        return Promise.resolve({
          data: null,
          error: { message: "REVENUE_APPROVAL_SELF_NOT_ALLOWED" },
        });
      }
      request.status = args._event_type;
      request.reviewed_by = args._membership_id;
      request.reviewed_at = new Date().toISOString();
      request.review_reason = args._reason ?? null;
      tables.hotel_revenue_approval_events.push({
        id: crypto.randomUUID(),
        restaurant_id: args._restaurant_id,
        approval_request_id: request.id,
        event_type: args._event_type,
        actor_id: args._membership_id,
        reason: args._reason ?? null,
        created_at: new Date().toISOString(),
        metadata: null,
      });
      return Promise.resolve({ data: { id: request.id, status: args._event_type }, error: null });
    }
    if (name === "approve_hotel_revenue_approval") {
      const request = tables.hotel_revenue_approval_requests.find(
        (row) => row.id === args._request_id && row.restaurant_id === args._restaurant_id,
      );
      if (!request)
        return Promise.resolve({ data: null, error: { message: "REVENUE_APPROVAL_NOT_FOUND" } });
      if (request.status !== "pending")
        return Promise.resolve({ data: null, error: { message: "REVENUE_APPROVAL_NOT_PENDING" } });
      const eligible = tables.restaurant_users.filter(
        (row) =>
          row.restaurant_id === args._restaurant_id &&
          row.active === true &&
          (row.role === "owner" || row.role === "manager"),
      ).length;
      if (eligible > 1 && request.requested_by === args._membership_id) {
        return Promise.resolve({
          data: null,
          error: { message: "REVENUE_APPROVAL_SELF_NOT_ALLOWED" },
        });
      }
      if (failApply)
        return Promise.resolve({ data: null, error: { message: "RATE_CHANGE_UNSUPPORTED" } });
      if (staleApply) {
        request.status = "stale";
        request.reviewed_by = args._membership_id;
        request.reviewed_at = new Date().toISOString();
        request.review_reason = "RATE_CHANGE_STALE";
        tables.hotel_revenue_approval_events.push({
          id: crypto.randomUUID(),
          restaurant_id: args._restaurant_id,
          approval_request_id: request.id,
          event_type: "stale",
          actor_id: args._membership_id,
          reason: "RATE_CHANGE_STALE",
          created_at: new Date().toISOString(),
          metadata: { source: "approve_revalidate" },
        });
        return Promise.resolve({
          data: { status: "stale", reason: "RATE_CHANGE_STALE", id: request.id },
          error: null,
        });
      }
      const operationId = crypto.randomUUID();
      request.status = "approved";
      request.reviewed_by = args._membership_id;
      request.reviewed_at = new Date().toISOString();
      request.review_reason = args._review_reason ?? null;
      request.applied_operation_id = operationId;
      tables.hotel_revenue_approval_events.push({
        id: crypto.randomUUID(),
        restaurant_id: args._restaurant_id,
        approval_request_id: request.id,
        event_type: "approved",
        actor_id: args._membership_id,
        reason: args._review_reason ?? null,
        created_at: new Date().toISOString(),
        metadata: { appliedOperationId: operationId },
      });
      return Promise.resolve({
        data: {
          status: "approved",
          id: request.id,
          appliedOperationId: operationId,
          applyResult: { operationId },
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
  }

  return {
    from,
    rpc,
    tables,
    setFailApply(value: boolean) {
      failApply = value;
    },
    setStaleApply(value: boolean) {
      staleApply = value;
    },
  };
}

describe("P7-STEP-02 — policy and contract", () => {
  it("treats a missing policy row as disabled", () => {
    assert.deepEqual(policyFromRow(null), { enabled: false });
    assert.deepEqual(policyFromRow({}), { enabled: false });
    assert.deepEqual(policyFromRow({ enabled: false }), { enabled: false });
    assert.deepEqual(policyFromRow({ enabled: true }), { enabled: true });
  });

  it("blocks self-approval only when another Rate Manager exists", () => {
    assert.equal(canSelfApproveRevenueRequest(2, OWNER_A, OWNER_A), false);
    assert.equal(canSelfApproveRevenueRequest(2, OWNER_A, MANAGER_B), true);
    assert.equal(canSelfApproveRevenueRequest(1, OWNER_A, OWNER_A), true);
  });

  it("keeps terminal statuses terminal", () => {
    assert.equal(allowedRevenueApprovalTransition("pending", "approved"), true);
    assert.equal(allowedRevenueApprovalTransition("pending", "stale"), true);
    assert.equal(allowedRevenueApprovalTransition("approved", "rejected"), false);
    assert.equal(allowedRevenueApprovalTransition("rejected", "approved"), false);
    assert.equal(allowedRevenueApprovalTransition("cancelled", "approved"), false);
    assert.equal(allowedRevenueApprovalTransition("stale", "approved"), false);
    assert.equal(isTerminalRevenueApprovalStatus("approved"), true);
    assert.equal(isTerminalRevenueApprovalStatus("pending"), false);
  });

  it("summarizes queue copy without inventing business conclusions", () => {
    assert.equal(
      summarizeRateApproval({
        ruleType: "SET_RATE",
        ratePlanNames: ["BAR"],
        roomTypeNames: ["Deluxe"],
        dates: Array.from(
          { length: 14 },
          (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
        ),
      }),
      "Set BAR / Deluxe rate for 14 dates",
    );
    assert.equal(
      summarizeRestrictionApproval({
        operationType: "SET_FIELDS",
        fields: ["stopSell"],
        ratePlanNames: ["BAR"],
        roomTypeNames: ["Deluxe"],
        dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
      }),
      "Apply Stop Sell to Deluxe / BAR for 3 dates",
    );
    assert.equal(
      summarizeCommercialApproval({
        operation: "CREATE",
        kind: "promotion",
        name: "Weekend Escape",
        code: "WKND",
      }),
      "Activate Weekend Escape promotion",
    );
    assert.match(
      summarizeCommercialApproval({
        operation: "EDIT",
        kind: "package",
        name: "Bed and breakfast",
        active: true,
      }),
      /Edit Bed and breakfast package/,
    );
  });
});

describe("P7-STEP-02 — schema and engine safety", () => {
  it("adds policy, requests, and immutable events without changing stay pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../supabase/migrations"));
    assert.ok(migrations.includes("0109_pms_revenue_approvals.sql"));
    assert.equal(drizzle.replace(/\r\n/g, "\n"), supabase.replace(/\r\n/g, "\n"));
    assert.match(supabase, /CREATE TABLE public\.hotel_revenue_approval_policy/);
    assert.match(supabase, /CREATE TABLE public\.hotel_revenue_approval_requests/);
    assert.match(supabase, /CREATE TABLE public\.hotel_revenue_approval_events/);
    assert.match(supabase, /enabled boolean NOT NULL DEFAULT false/);
    assert.match(supabase, /REVENUE_APPROVAL_EVENT_IMMUTABLE/);
    assert.match(supabase, /REVENUE_APPROVAL_REQUEST_IMMUTABLE/);
    assert.match(supabase, /pending → approved|status IN \(\s*'pending'/);
    assert.match(supabase, /apply_hotel_rate_changes/);
    assert.match(supabase, /apply_hotel_rate_restrictions/);
    assert.match(supabase, /apply_hotel_promotion_activation/);
    assert.match(supabase, /apply_hotel_package_activation/);
    assert.match(supabase, /count_eligible_revenue_approvers/);
    assert.match(supabase, /REVENUE_APPROVAL_SELF_NOT_ALLOWED/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /CREATE TABLE public\.pms_approval_rules/);
    assert.doesNotMatch(supabase, /rateOverrideNeedsApproval/);
    assert.doesNotMatch(supabase, /notification|slack|multi_stage|threshold/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /room_subtotal/);
    assert.match(pricing, /nightly_rate_snapshot/);
  });

  it("enables canApprove and the approvals workspace", () => {
    assert.equal(resolveRevenueAccess("owner").canApprove, true);
    assert.equal(resolveRevenueAccess("manager").canApprove, true);
    assert.ok(implementedRevenueViews().includes("approvals"));
    assert.ok(!foundationRevenueViews().includes("approvals"));
    assert.match(readRel("../rate-revenue-workspace.ts"), /id: "approvals"/);
    assert.match(readRel("../rate-revenue-workspace.ts"), /implemented: true/);
  });

  it("branches official apply wrappers and reuses existing apply RPCs", () => {
    const rateFns = readRel("./rate-change.functions.ts");
    const restrictionFns = readRel("./restriction-change.functions.ts");
    const promoFns = readRel("./commercial-promotion-activation.functions.ts");
    const packageFns = readRel("./commercial-package-activation.functions.ts");
    const server = readRel("./revenue-approval.server.ts");
    const adapters = readRel("./revenue-approval-adapters.ts");
    assert.match(rateFns, /executeOrSubmitRateChange/);
    assert.match(restrictionFns, /executeOrSubmitRestrictionChange/);
    assert.match(promoFns, /executeOrSubmitPromotionActivation/);
    assert.match(packageFns, /executeOrSubmitPackageActivation/);
    assert.match(server, /mode: "applied"/);
    assert.match(server, /mode: "submitted_for_approval"/);
    assert.match(server, /applyRateChanges/);
    assert.match(server, /applyRestrictionChanges/);
    assert.match(server, /applyStoredPromotionActivation/);
    assert.match(server, /applyStoredPackageActivation/);
    assert.match(adapters, /previewRateChanges/);
    assert.match(adapters, /previewRestrictionChanges/);
    assert.match(adapters, /previewStoredPromotionActivation/);
    assert.match(adapters, /previewStoredPackageActivation/);
    assert.doesNotMatch(
      adapters,
      /from\("hotel_rate_calendar"\)\.update|from\("hotel_rate_restrictions"\)\.update/,
    );
    assert.doesNotMatch(readRel("./revenue-approval.functions.ts"), /accountant|staff/);
    assert.match(readRel("./revenue-approval.functions.ts"), /requireRateManager/);
  });
});

describe("P7-STEP-02 — policy and request read models", () => {
  it("reads missing policy as disabled and upserts the toggle", async () => {
    const db = createMemoryDb();
    const missing = await db
      .from("hotel_revenue_approval_policy")
      .select("enabled")
      .eq("restaurant_id", PROPERTY_A)
      .maybeSingle();
    assert.deepEqual(policyFromRow(missing.data), { enabled: false });
    await db
      .from("hotel_revenue_approval_policy")
      .upsert({ restaurant_id: PROPERTY_A, enabled: true });
    const enabled = await db
      .from("hotel_revenue_approval_policy")
      .select("enabled")
      .eq("restaurant_id", PROPERTY_A)
      .maybeSingle();
    assert.deepEqual(policyFromRow(enabled.data), { enabled: true });
    await db
      .from("hotel_revenue_approval_policy")
      .upsert({ restaurant_id: PROPERTY_A, enabled: false });
    const disabled = await db
      .from("hotel_revenue_approval_policy")
      .select("enabled")
      .eq("restaurant_id", PROPERTY_A)
      .maybeSingle();
    assert.deepEqual(policyFromRow(disabled.data), { enabled: false });
    const other = await db
      .from("hotel_revenue_approval_policy")
      .select("enabled")
      .eq("restaurant_id", PROPERTY_B)
      .maybeSingle();
    assert.deepEqual(policyFromRow(other.data), { enabled: false });
  });

  it("counts only active owner/manager memberships", async () => {
    const db = createMemoryDb();
    assert.equal(
      (await db.rpc("count_eligible_revenue_approvers", { _restaurant_id: PROPERTY_A })).data,
      2,
    );
    db.tables.restaurant_users = db.tables.restaurant_users.filter((row) => row.id === OWNER_A);
    assert.equal(
      (await db.rpc("count_eligible_revenue_approvers", { _restaurant_id: PROPERTY_A })).data,
      1,
    );
  });

  it("lists requests with batched staff labels and loads detail", async () => {
    const db = createMemoryDb();
    const proposal = {
      restaurantId: PROPERTY_A,
      targets: [{ ratePlanId: PLAN, date: "2026-10-01" }],
      rule: { type: "SET_RATE", value: 180 },
      expectedVersions: [{ ratePlanId: PLAN, date: "2026-10-01", expectedVersion: "absent" }],
    };
    const snapshot = buildRateDisplaySnapshot({
      ruleType: "SET_RATE",
      ratePlanNames: ["BAR"],
      roomTypeNames: ["Deluxe"],
      dates: ["2026-10-01"],
      operationLabel: "single_rate_change",
    });
    const submitted = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "rate",
      _action_type: "single_rate_change",
      _entity_type: "rate_calendar",
      _entity_id: null,
      _request_reason: "BAR weekend",
      _proposal_payload: proposal,
      _display_snapshot: snapshot,
      _expected_version: "absent",
    });
    const page = await db
      .from("hotel_revenue_approval_requests")
      .select("*")
      .eq("restaurant_id", PROPERTY_A);
    assert.equal(page.data.length, 1);
    const members = await db
      .from("restaurant_users")
      .select("id, user_id")
      .eq("restaurant_id", PROPERTY_A)
      .in("id", [OWNER_A]);
    const profiles = await db
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", [USER_A]);
    const label = [profiles.data[0].first_name, profiles.data[0].last_name].join(" ");
    assert.equal(members.data[0].id, OWNER_A);
    assert.equal(label, "Ada Owner");
    const events = await db
      .from("hotel_revenue_approval_events")
      .select("*")
      .eq("approval_request_id", submitted.data.id);
    assert.equal(events.data[0].event_type, "submitted");
    assert.equal(page.data[0].display_snapshot.summary, snapshot.summary);
    assert.match(snapshot.summary, /Set BAR \/ Deluxe rate for 1 date/);
  });

  it("cancels for the requester only and rejects with a reason", async () => {
    const db = createMemoryDb();
    const first = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "rate",
      _action_type: "single_rate_change",
      _entity_type: "rate_calendar",
      _entity_id: null,
      _request_reason: null,
      _proposal_payload: {
        restaurantId: PROPERTY_A,
        targets: [],
        rule: { type: "SET_RATE", value: 1 },
      },
      _display_snapshot: { summary: "x" },
      _expected_version: "absent",
    });
    const otherCancel = await db.rpc("transition_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: first.data.id,
      _membership_id: MANAGER_B,
      _event_type: "cancelled",
      _reason: null,
    });
    assert.match(otherCancel.error.message, /REVENUE_APPROVAL_CANCEL_FORBIDDEN/);
    const cancelled = await db.rpc("transition_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: first.data.id,
      _membership_id: OWNER_A,
      _event_type: "cancelled",
      _reason: null,
    });
    assert.equal(cancelled.data.status, "cancelled");
    const later = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: first.data.id,
      _membership_id: MANAGER_B,
      _review_reason: null,
    });
    assert.match(later.error.message, /REVENUE_APPROVAL_NOT_PENDING/);

    const second = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "restriction",
      _action_type: "single_restriction_change",
      _entity_type: "restriction",
      _entity_id: null,
      _request_reason: null,
      _proposal_payload: { restaurantId: PROPERTY_A },
      _display_snapshot: { summary: "stop" },
      _expected_version: "absent",
    });
    const selfReject = await db.rpc("transition_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: second.data.id,
      _membership_id: OWNER_A,
      _event_type: "rejected",
      _reason: "too late",
    });
    assert.match(selfReject.error.message, /REVENUE_APPROVAL_SELF_NOT_ALLOWED/);
    const rejected = await db.rpc("transition_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: second.data.id,
      _membership_id: MANAGER_B,
      _event_type: "rejected",
      _reason: "too late",
    });
    assert.equal(rejected.data.status, "rejected");
  });

  it("approves through the reviewer when another approver exists", async () => {
    const db = createMemoryDb();
    const submitted = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "rate",
      _action_type: "single_rate_change",
      _entity_type: "rate_calendar",
      _entity_id: null,
      _request_reason: null,
      _proposal_payload: { restaurantId: PROPERTY_A },
      _display_snapshot: { summary: "set" },
      _expected_version: "absent",
    });
    const self = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: submitted.data.id,
      _membership_id: OWNER_A,
      _review_reason: null,
    });
    assert.match(self.error.message, /REVENUE_APPROVAL_SELF_NOT_ALLOWED/);
    const approved = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: submitted.data.id,
      _membership_id: MANAGER_B,
      _review_reason: "ok",
    });
    assert.equal(approved.data.status, "approved");
    assert.ok(approved.data.appliedOperationId);
    const row = db.tables.hotel_revenue_approval_requests[0]!;
    assert.equal(row.applied_operation_id, approved.data.appliedOperationId);
    assert.equal(row.status, "approved");
  });

  it("allows sole-approver self-approval and returns structured stale", async () => {
    const db = createMemoryDb();
    db.tables.restaurant_users = db.tables.restaurant_users.filter((row) => row.id === OWNER_A);
    const submitted = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "package_activation",
      _action_type: "EDIT",
      _entity_type: "package_activation",
      _entity_id: PLAN,
      _request_reason: null,
      _proposal_payload: { restaurantId: PROPERTY_A, operation: "EDIT", expectedVersion: "absent" },
      _display_snapshot: { summary: "edit" },
      _expected_version: "absent",
    });
    const approved = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: submitted.data.id,
      _membership_id: OWNER_A,
      _review_reason: null,
    });
    assert.equal(approved.data.status, "approved");

    const staleReq = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "rate",
      _action_type: "single_rate_change",
      _entity_type: "rate_calendar",
      _entity_id: null,
      _request_reason: null,
      _proposal_payload: { restaurantId: PROPERTY_A },
      _display_snapshot: { summary: "set" },
      _expected_version: "absent",
    });
    db.setStaleApply(true);
    const stale = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: staleReq.data.id,
      _membership_id: OWNER_A,
      _review_reason: null,
    });
    assert.equal(stale.data.status, "stale");
    assert.equal(stale.data.reason, "RATE_CHANGE_STALE");
    assert.equal(db.tables.hotel_revenue_approval_requests.at(-1)?.applied_operation_id, null);
  });

  it("keeps the request pending when approve apply fails", async () => {
    const db = createMemoryDb();
    const submitted = await db.rpc("submit_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _membership_id: OWNER_A,
      _domain: "rate",
      _action_type: "single_rate_change",
      _entity_type: "rate_calendar",
      _entity_id: null,
      _request_reason: null,
      _proposal_payload: { restaurantId: PROPERTY_A },
      _display_snapshot: { summary: "set" },
      _expected_version: "absent",
    });
    db.setFailApply(true);
    const failed = await db.rpc("approve_hotel_revenue_approval", {
      _restaurant_id: PROPERTY_A,
      _request_id: submitted.data.id,
      _membership_id: MANAGER_B,
      _review_reason: null,
    });
    assert.match(failed.error.message, /RATE_CHANGE_UNSUPPORTED/);
    assert.equal(db.tables.hotel_revenue_approval_requests[0]?.status, "pending");
    assert.equal(db.tables.hotel_revenue_approval_requests[0]?.applied_operation_id, null);
    assert.equal(
      db.tables.hotel_revenue_approval_events.filter((row) => row.event_type === "approved").length,
      0,
    );
  });

  it("rejects accountant submit and parses large bulk payloads", () => {
    const db = createMemoryDb();
    return db
      .rpc("submit_hotel_revenue_approval", {
        _restaurant_id: PROPERTY_A,
        _membership_id: STAFF_C,
        _domain: "rate",
        _action_type: "bulk_rate_change",
        _entity_type: "rate_bulk",
        _entity_id: null,
        _request_reason: null,
        _proposal_payload: { restaurantId: PROPERTY_A },
        _display_snapshot: { summary: "bulk" },
        _expected_version: "absent",
      })
      .then((result: { error: { message: string } | null }) => {
        assert.match(result.error?.message ?? "", /REVENUE_APPROVAL_FORBIDDEN/);
        const dates = Array.from({ length: 366 }, (_, index) => {
          const day = new Date(Date.UTC(2026, 0, 1 + index));
          return day.toISOString().slice(0, 10);
        });
        const payload = {
          restaurantId: PROPERTY_A,
          targets: dates.map((date) => ({ ratePlanId: PLAN, date })),
          rule: { type: "SET_RATE" as const, value: 140 },
          expectedVersions: dates.map((date) => ({
            ratePlanId: PLAN,
            date,
            expectedVersion: "absent",
          })),
        };
        const parsed = parseRevenueApprovalProposal("rate", payload);
        assert.equal(parsed.targets.length, 366);
        assert.equal(encodeExpectedVersions(payload.expectedVersions).split("|").length, 366);
        assert.ok(isStaleDomainError("COMMERCIAL_ACTIVATION_STALE"));
      });
  });

  it("lists all property-scoped actors and exposes reviewReason on list items", async () => {
    const db = createMemoryDb();
    // Add an actor for Property B to test tenant isolation
    db.tables.restaurant_users.push({
      id: "bbbbbbbb-1111-4111-8111-111111111111",
      restaurant_id: PROPERTY_B,
      user_id: "bbbbbbbb-2222-4222-8222-222222222222",
      role: "manager",
      active: true,
    });
    db.tables.profiles.push({
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      first_name: "Bob",
      last_name: "OtherProp",
      email: "bob@other.com",
    });

    // Populate a request with review_reason for Owner A
    db.tables.hotel_revenue_approval_requests.push({
      id: "req-1",
      restaurant_id: PROPERTY_A,
      domain: "rate",
      action_type: "single_rate_change",
      entity_type: "rate_calendar",
      entity_id: null,
      status: "rejected",
      requested_by: OWNER_A,
      requested_at: "2026-09-26T10:00:00.000Z",
      request_reason: "Close OTA",
      reviewed_by: MANAGER_B,
      reviewed_at: "2026-09-26T10:30:00.000Z",
      review_reason: "Inventory risk too high",
      proposal_payload: {},
      display_snapshot: { summary: "Close OTA on BAR" },
      expected_version: null,
      applied_operation_id: null,
      created_at: "2026-09-26T10:00:00.000Z",
      updated_at: "2026-09-26T10:30:00.000Z",
    });

    // Verify server contracts
    const server = readRel("./revenue-approval.server.ts");
    const fns = readRel("./revenue-approval.functions.ts");
    assert.match(server, /export async function listRevenueApprovalActors/);
    assert.match(server, /reviewReason: row\.review_reason/);
    assert.match(server, /reviewReason: string \| null/);
    assert.match(fns, /export const listRevenueApprovalActorsFn/);

    // Verify property-scoped actors query excludes Property B
    const activeMembers = await db
      .from("restaurant_users")
      .select("id, user_id, role")
      .eq("restaurant_id", PROPERTY_A);
    const eligible = activeMembers.data.filter(
      (m: { role: string }) => m.role === "owner" || m.role === "manager",
    );
    assert.equal(eligible.length, 2);
    assert.ok(eligible.some((m: { id: string }) => m.id === OWNER_A));
    assert.ok(eligible.some((m: { id: string }) => m.id === MANAGER_B));
    assert.ok(!eligible.some((m: { id: string }) => m.id === "bbbbbbbb-1111-4111-8111-111111111111"));

    // Verify review_reason is present on requests table and read model
    const requests = await db
      .from("hotel_revenue_approval_requests")
      .select("*")
      .eq("restaurant_id", PROPERTY_A);
    assert.equal(requests.data.length, 1);
    assert.equal(requests.data[0]?.request_reason, "Close OTA");
    assert.equal(requests.data[0]?.review_reason, "Inventory risk too high");
  });
});
