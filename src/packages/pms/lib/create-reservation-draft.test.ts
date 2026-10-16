import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  clearCreateReservationDraftFrom,
  createReservationDraftIsMeaningful,
  createReservationDraftKey,
  parseCreateReservationDraft,
  readCreateReservationDraftFrom,
  shouldDropMissingRoomType,
  writeCreateReservationDraftTo,
  type CreateReservationDraft,
} from "./create-reservation-draft.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function draft(patch: Partial<CreateReservationDraft> = {}): CreateReservationDraft {
  return {
    version: 1,
    workflowStep: 0,
    reservationType: "individual",
    reservationMode: "single",
    activeRoomIndex: 0,
    guest: null,
    arrival: "2026-10-10",
    departure: "2026-10-11",
    adults: 1,
    children: 0,
    infants: 0,
    roomsRequested: 1,
    extraRoomUnits: [],
    roomTypeId: "",
    selectedRoomType: null,
    roomId: "unassigned",
    ratePlanId: "",
    ratePreference: "",
    searchRoomTypeFilter: "",
    availabilitySearchCommitted: null,
    quoteCurrency: "",
    specialRequests: "",
    notes: "",
    bookingSource: "",
    salesChannel: "",
    marketSegment: "",
    externalReference: "",
    purposeOfStay: "",
    relationTab: "company",
    companyMaster: null,
    travelAgentMaster: null,
    groupMaster: null,
    companyOverride: false,
    travelAgentOverride: false,
    groupOverride: false,
    linkedGroupId: null,
    linkedBlockId: null,
    companyContactId: "",
    travelAgentContactId: "",
    billingRuleId: "",
    packageActivationIds: [],
    selectedServiceRequests: [],
    guaranteeMethod: "",
    depositReference: "",
    depositPaymentMethod: "",
    depositDueDate: "",
    ...patch,
  };
}

const defaults = { arrival: "2026-10-10", departure: "2026-10-11", unassignedRoomId: "unassigned" };

describe("create reservation draft persistence", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const workspace = readRel("../components/workspaces/reservations-workspace.tsx");
  const helper = readRel("./create-reservation-draft.ts");

  it("persists step 1, step 2, packages, requests, and step 3 payment fields", () => {
    const store = new MemoryStorage();
    const saved = draft({
      workflowStep: 2,
      guest: { id: "guest-1", fullName: "Sara Bekele" },
      arrival: "2026-10-12",
      departure: "2026-10-14",
      adults: 2,
      roomTypeId: "rt-1",
      ratePlanId: "rp-1",
      bookingSource: "phone",
      salesChannel: "direct",
      relationTab: "company",
      companyMaster: { id: "co-1", name: "Habesha Beer", code: "HBB", paymentTerms: null },
      companyContactId: "contact-1",
      billingRuleId: "bill-1",
      packageActivationIds: ["act-1"],
      selectedServiceRequests: [{ serviceTypeId: "svc-1", name: "Wake-up Call", description: "" }],
      specialRequests: "High floor",
      notes: "Staff note",
      guaranteeMethod: "card",
      depositPaymentMethod: "cash",
      depositReference: "AUTH-1",
      depositDueDate: "2026-10-12",
    });
    writeCreateReservationDraftTo(store, "property-a", "member-a", saved);
    const restored = readCreateReservationDraftFrom(store, "property-a", "member-a");
    assert.equal(restored?.workflowStep, 2);
    assert.equal(restored?.guest?.fullName, "Sara Bekele");
    assert.equal(restored?.arrival, "2026-10-12");
    assert.equal(restored?.roomTypeId, "rt-1");
    assert.equal(restored?.bookingSource, "phone");
    assert.deepEqual(restored?.packageActivationIds, ["act-1"]);
    assert.equal(restored?.specialRequests, "High floor");
    assert.equal(restored?.notes, "Staff note");
    assert.equal(restored?.depositPaymentMethod, "cash");
    assert.equal(restored?.depositReference, "AUTH-1");
    assert.equal(createReservationDraftIsMeaningful(saved, defaults), true);
  });

  it("keeps drafts inside one property and scope", () => {
    const store = new MemoryStorage();
    writeCreateReservationDraftTo(
      store,
      "property-a",
      "member-a",
      draft({ guest: { id: "g", fullName: "A" } }),
    );
    writeCreateReservationDraftTo(
      store,
      "property-b",
      "member-a",
      draft({ guest: { id: "g2", fullName: "B" } }),
    );
    assert.notEqual(
      createReservationDraftKey("property-a", "member-a"),
      createReservationDraftKey("property-b", "member-a"),
    );
    assert.equal(
      readCreateReservationDraftFrom(store, "property-a", "member-a")?.guest?.fullName,
      "A",
    );
    assert.equal(
      readCreateReservationDraftFrom(store, "property-b", "member-a")?.guest?.fullName,
      "B",
    );
    assert.equal(readCreateReservationDraftFrom(store, "property-a", "member-b"), null);
  });

  it("drops secrets, stale quote totals, and unsupported versions", () => {
    const parsed = parseCreateReservationDraft({
      version: 1,
      guest: { id: "g", fullName: "A" },
      cardNumber: "4242424242424242",
      cardExpiry: "2030-01",
      cardHolderName: "A",
      cvv: "123",
      quoteTotal: 999,
      subtotal: 999,
    });
    assert.equal(parsed?.guest?.id, "g");
    assert.equal("cardNumber" in (parsed ?? {}), false);
    assert.equal("cvv" in (parsed ?? {}), false);
    assert.equal("quoteTotal" in (parsed ?? {}), false);
    const snapshot = page.slice(
      page.indexOf("const draftSnapshot"),
      page.indexOf("const draftMeaningful"),
    );
    assert.doesNotMatch(snapshot, /cardNumber|cardExpiry|cardHolderName|cvv|quoteTotal|subtotal/);
    const store = new MemoryStorage();
    store.setItem(
      createReservationDraftKey("property-a", "member-a"),
      JSON.stringify({ version: 2 }),
    );
    assert.equal(readCreateReservationDraftFrom(store, "property-a", "member-a"), null);
    assert.equal(store.getItem(createReservationDraftKey("property-a", "member-a")), null);
  });

  it("drops a room type that is no longer available and does not treat a stored total as price", () => {
    assert.equal(
      shouldDropMissingRoomType({
        roomTypeId: "rt-old",
        searchSettled: true,
        availableRoomTypeIds: ["rt-new"],
      }),
      true,
    );
    assert.equal(
      shouldDropMissingRoomType({
        roomTypeId: "rt-new",
        searchSettled: true,
        availableRoomTypeIds: ["rt-new"],
      }),
      false,
    );
    assert.equal(
      shouldDropMissingRoomType({
        roomTypeId: "rt-old",
        searchSettled: false,
        availableRoomTypeIds: [],
      }),
      false,
    );
    assert.doesNotMatch(helper, /quoteTotal:/);
  });

  it("clears on confirmed discard and successful create, and keeps the draft when the overlay closes", () => {
    const store = new MemoryStorage();
    writeCreateReservationDraftTo(store, "property-a", "member-a", draft({ workflowStep: 1 }));
    clearCreateReservationDraftFrom(store, "property-a", "member-a");
    assert.equal(readCreateReservationDraftFrom(store, "property-a", "member-a"), null);
    assert.match(
      page,
      /clearCreateReservationDraft\(restaurantId, accessQuery\.data\.membershipId\)/,
    );
    assert.match(page, /clearCreateReservationDraft\(restaurantId, membershipScope\)/);
    assert.match(page, /Discard this reservation draft\?/);
    assert.match(page, /readCreateReservationDraft/);
    assert.match(page, /writeCreateReservationDraft/);
    assert.doesNotMatch(page, /localStorage|sessionStorage/);
    const closeStart = workspace.indexOf("function closeWorkspaceOverlay");
    const closeBody = workspace.slice(closeStart, closeStart + 500);
    assert.doesNotMatch(closeBody, /clearCreateReservationDraft/);
    assert.doesNotMatch(helper, /submitReservation|createGuestServiceRequest|checkIn\(|post_folio/);
  });

  it("treats an untouched form as not meaningful", () => {
    assert.equal(createReservationDraftIsMeaningful(draft(), defaults), false);
  });
});
