import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAuditEntries,
  normalizeApprovalEvent,
  normalizeCommercialEvent,
  normalizeRateEvent,
  normalizeRestrictionEvent,
  paginateAuditEntries,
  sortAuditEntriesGlobally,
  type UnifiedRevenueAuditEntry,
} from "./revenue-audit.ts";

describe("P8-STEP-02 Unified Revenue Audit Pure Domain Logic", () => {
  it("normalizes events from all 4 immutable source schemas into uniform UnifiedRevenueAuditEntry", () => {
    // 1. Rate change event
    const rateEntry = normalizeRateEvent({
      id: "rate-evt-1",
      created_at: "2026-06-01T12:00:00Z",
      action_type: "manual_override",
      rate_plan_id: "plan-1",
      room_type_id: "room-1",
      stay_date: "2026-06-10",
      previous_effective_rate: 100,
      new_effective_rate: 120,
      currency: "GBP",
      reason: "Peak demand weekend",
      actor_membership_id: "member-1",
      operation_id: "op-1",
      hotel_rate_plans: { code: "BAR", name: "Best Available Rate" },
      room_types: { name: "Deluxe King" },
    });
    assert.equal(rateEntry.domain, "rates");
    assert.equal(rateEntry.action, "manual_override");
    assert.equal(rateEntry.entityLabel, "Best Available Rate");
    assert.equal(rateEntry.scopeLabel, "2026-06-10 • Deluxe King (100 → 120 GBP)");
    assert.equal(rateEntry.sourceTable, "hotel_rate_change_events");
    assert.equal(rateEntry.detailSupported, true);

    // 2. Restriction change event
    const restEntry = normalizeRestrictionEvent({
      id: "rest-evt-1",
      created_at: "2026-06-01T12:05:00Z",
      action_type: "min_length_of_stay",
      rate_plan_id: "plan-1",
      room_type_id: "room-1",
      stay_date: "2026-06-10",
      reason: "Minimum 2 nights for weekend",
      actor_membership_id: "member-1",
      operation_id: "op-2",
      hotel_rate_plans: { code: "BAR", name: "Best Available Rate" },
      room_types: { name: "Deluxe King" },
    });
    assert.equal(restEntry.domain, "restrictions");
    assert.equal(restEntry.action, "min_length_of_stay");
    assert.equal(restEntry.scopeLabel, "2026-06-10 • Deluxe King");
    assert.equal(restEntry.sourceTable, "hotel_rate_restriction_change_events");

    // 3. Commercial change event
    const commEntry = normalizeCommercialEvent({
      id: "comm-evt-1",
      created_at: "2026-06-01T12:10:00Z",
      action_type: "activated",
      entity_type: "promotion_activation",
      entity_id: "promo-act-1",
      master_id: "Early Summer 15%",
      reason: "Seasonal promotion launch",
      actor_membership_id: "member-2",
      operation_id: "op-3",
    });
    assert.equal(commEntry.domain, "commercial");
    assert.equal(commEntry.action, "activated");
    assert.equal(commEntry.entityLabel, "Early Summer 15%");
    assert.equal(commEntry.sourceTable, "hotel_commercial_change_events");

    // 4. Approval event
    const appEntry = normalizeApprovalEvent({
      id: "app-evt-1",
      created_at: "2026-06-01T12:15:00Z",
      event_type: "approved",
      actor_id: "member-owner",
      reason: "Approved rate change",
      approval_request_id: "app-req-1",
      hotel_revenue_approval_requests: {
        domain: "rate",
        action_type: "rate_change",
        entity_type: "rate_plan",
        entity_id: "plan-1",
        status: "approved",
        request_reason: "High occupancy anticipated",
        review_reason: "Looks good to go",
        display_snapshot: { summary: "Override BAR to 150 GBP" },
        applied_operation_id: "op-4",
      },
    });
    assert.equal(appEntry.domain, "approvals");
    assert.equal(appEntry.action, "approved");
    assert.equal(appEntry.entityLabel, "Override BAR to 150 GBP");
    assert.equal(appEntry.operationId, "op-4");
    assert.equal(appEntry.approvalRequestId, "app-req-1");
    assert.equal(appEntry.sourceTable, "hotel_revenue_approval_events");
  });

  it("guarantees authoritative global ordering by timestamp DESC, id DESC with tie breaking", () => {
    const e1: UnifiedRevenueAuditEntry = {
      id: "evt-a",
      timestamp: "2026-06-01T10:00:00Z",
      domain: "rates",
      action: "manual_override",
      entityType: "rate_plan",
      entityId: "plan-1",
      entityLabel: "Plan A",
      scopeLabel: "2026-06-01",
      actorMembershipId: "m1",
      actorLabel: "Staff",
      reason: null,
      operationId: null,
      approvalRequestId: null,
      linkedOperationId: null,
      status: "applied",
      sourceTable: "hotel_rate_change_events",
      detailSupported: true,
    };

    const e2: UnifiedRevenueAuditEntry = {
      ...e1,
      id: "evt-b",
      timestamp: "2026-06-01T12:00:00Z", // later
    };

    const e3: UnifiedRevenueAuditEntry = {
      ...e1,
      id: "evt-c",
      timestamp: "2026-06-01T12:00:00Z", // same timestamp as e2, id 'evt-c' > 'evt-b'
    };

    const sorted = sortAuditEntriesGlobally([e1, e2, e3]);
    // Expected order: e3 (12:00:00Z, id 'evt-c'), then e2 (12:00:00Z, id 'evt-b'), then e1 (10:00:00Z)
    assert.equal(sorted[0].id, "evt-c");
    assert.equal(sorted[1].id, "evt-b");
    assert.equal(sorted[2].id, "evt-a");
  });

  it("applies pagination to the globally ordered combined result, never concatenating per-source pages", () => {
    // Generate 4 events each from 4 domains (16 total), interleaved in time
    const items: UnifiedRevenueAuditEntry[] = [];
    const domains = ["rates", "restrictions", "commercial", "approvals"] as const;

    for (let i = 1; i <= 16; i++) {
      const dIndex = (i - 1) % 4;
      const domain = domains[dIndex];
      const minute = String(i).padStart(2, "0");
      items.push({
        id: `evt-${i.toString().padStart(3, "0")}`,
        timestamp: `2026-06-01T10:${minute}:00Z`,
        domain,
        action: `action-${domain}`,
        entityType: "entity",
        entityId: `id-${i}`,
        entityLabel: `Entity ${i}`,
        scopeLabel: `Scope ${i}`,
        actorMembershipId: `m-${i}`,
        actorLabel: "Staff",
        reason: `Reason ${i}`,
        operationId: `op-${i}`,
        approvalRequestId: null,
        linkedOperationId: null,
        status: "applied",
        sourceTable: `source_${domain}`,
        detailSupported: true,
      });
    }

    const sorted = sortAuditEntriesGlobally(items);
    assert.equal(sorted[0].id, "evt-016"); // latest timestamp
    assert.equal(sorted[15].id, "evt-001"); // earliest timestamp

    // Page 1 with pageSize = 5
    const page1 = paginateAuditEntries(sorted, 1, 5);
    assert.equal(page1.total, 16);
    assert.equal(page1.page, 1);
    assert.equal(page1.pageSize, 5);
    assert.equal(page1.totalPages, 4);
    assert.equal(page1.pageEntries.length, 5);
    assert.deepEqual(
      page1.pageEntries.map((e) => e.id),
      ["evt-016", "evt-015", "evt-014", "evt-013", "evt-012"],
    );

    // Page 2 with pageSize = 5
    const page2 = paginateAuditEntries(sorted, 2, 5);
    assert.equal(page2.page, 2);
    assert.equal(page2.pageEntries.length, 5);
    assert.deepEqual(
      page2.pageEntries.map((e) => e.id),
      ["evt-011", "evt-010", "evt-009", "evt-008", "evt-007"],
    );

    // Page 4 with pageSize = 5 (last page has 1 item)
    const page4 = paginateAuditEntries(sorted, 4, 5);
    assert.equal(page4.page, 4);
    assert.equal(page4.pageEntries.length, 1);
    assert.equal(page4.pageEntries[0].id, "evt-001");
  });

  it("filters audit entries by action, actor, and text search across reason and labels", () => {
    const entries: UnifiedRevenueAuditEntry[] = [
      {
        id: "e1",
        timestamp: "2026-06-01T10:00:00Z",
        domain: "rates",
        action: "manual_override",
        entityType: "rate_plan",
        entityId: "p1",
        entityLabel: "Corporate Rate Plan",
        scopeLabel: "2026-06-01",
        actorMembershipId: "actor-alice",
        actorLabel: "Alice",
        reason: "Contract renegotiation",
        operationId: "op-101",
        approvalRequestId: null,
        linkedOperationId: null,
        status: "applied",
        sourceTable: "hotel_rate_change_events",
        detailSupported: true,
      },
      {
        id: "e2",
        timestamp: "2026-06-01T11:00:00Z",
        domain: "commercial",
        action: "promotion_activated",
        entityType: "promotion_activation",
        entityId: "p2",
        entityLabel: "Autumn Flash Sale",
        scopeLabel: "Promotion",
        actorMembershipId: "actor-bob",
        actorLabel: "Bob",
        reason: "Marketing campaign kickoff",
        operationId: "op-102",
        approvalRequestId: null,
        linkedOperationId: null,
        status: "applied",
        sourceTable: "hotel_commercial_change_events",
        detailSupported: true,
      },
    ];

    // Filter by action
    const actionFiltered = filterAuditEntries(entries, { action: "manual_override" });
    assert.equal(actionFiltered.length, 1);
    assert.equal(actionFiltered[0].id, "e1");

    // Filter by actor
    const actorFiltered = filterAuditEntries(entries, { actorMembershipId: "actor-bob" });
    assert.equal(actorFiltered.length, 1);
    assert.equal(actorFiltered[0].id, "e2");

    // Search by reason keyword
    const searchReason = filterAuditEntries(entries, { search: "renegotiation" });
    assert.equal(searchReason.length, 1);
    assert.equal(searchReason[0].id, "e1");

    // Search by entity label keyword
    const searchLabel = filterAuditEntries(entries, { search: "Flash Sale" });
    assert.equal(searchLabel.length, 1);
    assert.equal(searchLabel[0].id, "e2");

    // Search by operation id
    const searchOp = filterAuditEntries(entries, { search: "op-101" });
    assert.equal(searchOp.length, 1);
    assert.equal(searchOp[0].id, "e1");
  });
});
