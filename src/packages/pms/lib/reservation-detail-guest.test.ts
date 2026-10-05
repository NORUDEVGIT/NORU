import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  accompanyingRelationshipLabel,
  buildGuestDraft,
  guestPreferenceChips,
  mergedPreferenceChips,
  preferenceStoredLabel,
  reservationGuestKind,
  stayRequestPreferenceChips,
} from "@/packages/pms/lib/reservation-detail-guest";
import type { GuestPreferences, GuestProfile } from "@/packages/pms/lib/guests.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

const guestUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-guest.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const reservation = {
  id: "11111111-1111-4111-8111-111111111111",
  confirmationNumber: "NR-000245",
  guestId: "22222222-2222-4222-8222-222222222222",
  guestName: "Maria Santos",
  guestPhone: "+351 91 234 5678",
  guestEmail: "maria@email.com",
  guestVip: true,
  roomTypeId: "33333333-3333-4333-8333-333333333333",
  roomTypeName: "Deluxe King",
  roomId: null,
  roomNumber: null,
  arrivalDate: "2026-09-22",
  departureDate: "2026-09-24",
  nights: 2,
  adults: 2,
  children: 0,
  status: "confirmed",
  createdAt: "2026-09-20T10:24:00Z",
  updatedAt: "2026-09-20T10:24:00Z",
  specialRequests: "High Floor\nNon-smoking Room",
  notes: "Welcome amenity if available",
  cancellationReason: null,
  source: "staff",
  ratePlanId: null,
  ratePlanName: "BAR",
  currency: "ETB",
  roomSubtotal: 9000,
  nightlyRates: [],
  pricedAt: null,
  commercialBookingSource: "direct",
  marketSegment: "leisure",
  externalReference: null,
  guaranteeMethod: "credit_card",
  companyMasterId: null,
  companyName: null,
  travelAgentMasterId: null,
  travelAgentName: null,
  groupAccountMasterId: null,
  groupName: null,
  roomOperationalStatus: null,
  housekeepingStatus: null,
  infants: 0,
  roomsRequested: 1,
  purposeOfStay: "holiday",
  salesChannel: null,
  depositRequirementSnapshot: null,
  cancellationPolicySnapshot: null,
  refundabilitySnapshot: null,
  createdByStaffMembershipId: null,
  createdByName: null,
  bookerGuestId: null,
  lateCheckoutGranted: false,
  expectedArrivalAt: null,
  lateCheckoutUntil: null,
} as ReservationDetail;

const guest = {
  id: reservation.guestId,
  firstName: "Maria",
  lastName: "Santos",
  fullName: "Maria Santos",
  phone: "+351 91 234 5678",
  email: "maria@email.com",
  nationality: "Portugal",
  vipStatus: true,
  guestStatus: "active",
  updatedAt: reservation.updatedAt,
  idDocumentNumber: "A1234567",
  mergedIntoGuestId: null,
  anonymisedAt: null,
  restricted: false,
  blacklisted: false,
  lastStayAt: null,
  profileNumber: "GP-000245",
  language: "English",
  dateOfBirth: "1988-03-14",
  addressLine1: "Av. da Liberdade 123",
  addressLine2: null,
  city: "Lisbon",
  region: null,
  country: "Portugal",
  postalCode: null,
  notes: "Profile note",
  linkedCustomerUserId: null,
  createdAt: reservation.createdAt,
  idDocumentType: "passport",
  idDocumentExpiry: null,
  consent: {
    dataProcessing: { state: "granted", recordedAt: null, recordedByName: null },
    marketing: { state: "granted", recordedAt: null, recordedByName: null },
    available: true,
    defaults: null,
  },
  title: "ms",
  middleName: null,
  preferredName: null,
  gender: "female",
  phoneAlt: null,
  emailAlt: null,
  position: null,
  department: null,
  sourceOfBusiness: null,
  restrictionSeverity: null,
  restrictionReason: null,
  restrictionSetAt: null,
  restrictionSetByName: null,
  restrictionUntil: null,
  emergencyContacts: [],
  emergencyContactsAvailable: true,
  profileType: null,
  photoUrl: null,
  photoStoragePath: null,
  preferredContactMethod: "email",
  preferredContactTime: null,
  geoLatitude: null,
  geoLongitude: null,
} as GuestProfile;

const preferences: GuestPreferences = {
  roomPreference: "other:Non-smoking Room",
  bedPreference: "other:King Bed",
  floorPreference: "other:High Floor",
  viewPreference: "other:City View",
  foodPreference: null,
  communicationPreference: null,
  accessibilityRequirements: null,
  specialRequests: null,
  smokingAllowed: false,
};

describe("Reservation Detail Guest tab", () => {
  it("wires the Guest workspace into the existing overlay", () => {
    expect(workspace).toContain("<ReservationDetailGuestTab");
    expect(workspace).toContain('detailTab === "guest"');
    expect(workspace).toContain('onBackToOverview={() => setDetailTab("overview")}');
    expect(workspace).toContain("Open guest profile");
    expect(workspace).toContain('{ id: "overview", label: "Overview" }');
    expect(guestUi).toContain("Primary Guest Information");
    expect(guestUi).toContain("Contact Information");
    expect(guestUi).toContain("Membership & Loyalty");
    expect(guestUi).toContain("Accompanying Guests");
    expect(guestUi).toContain("Guest Preferences");
    expect(guestUi).toContain("Special Requests");
    expect(guestUi).toContain("Guest Notes (Reservation Specific)");
    expect(guestUi).toContain("Back to Overview");
    expect(guestUi).toContain("Save Changes");
    expect(guestUi).toContain("amendReservation");
    expect(guestUi).not.toContain("stayPanel");
    expect(guestUi).not.toContain("Noru Rewards");
    expect(guestUi).not.toContain("pointsBalance");
  });

  it("seeds live profile, contact, and reservation-owned notes", () => {
    const draft = buildGuestDraft(reservation, guest);
    expect(draft.preferredContactMethod).toBe("email");
    expect(draft.sendMarketing).toBe(true);
    expect(draft.sendConfirmation).toBe(false);
    expect(draft.guestType).toBe("individual");
    expect(draft.guestNotes).toBe("Welcome amenity if available");
    expect(draft.specialRequests).toContain("High Floor");
    expect(draft.accompanying).toEqual([]);
    expect(reservationGuestKind({ ...reservation, companyMasterId: "c1" })).toBe("company");
    expect(reservationGuestKind({ ...reservation, travelAgentMasterId: "t1" })).toBe(
      "travel_agent",
    );
    expect(preferenceStoredLabel("other:King Bed")).toBe("King Bed");
    expect(preferenceStoredLabel("id:abc")).toBeNull();
  });

  it("renders preference chips and keeps accompanying guests local-only", () => {
    const chips = mergedPreferenceChips(preferences, reservation.specialRequests);
    expect(guestPreferenceChips(preferences).some((chip) => chip.label.includes("King Bed"))).toBe(
      true,
    );
    expect(
      stayRequestPreferenceChips(reservation.specialRequests).some(
        (chip) => chip.id === "high_floor",
      ),
    ).toBe(true);
    expect(chips.length).toBeGreaterThan(0);
    expect(accompanyingRelationshipLabel("spouse")).toBe("Spouse");
    expect(guestUi).toContain("guest-accompanying-empty");
    expect(guestUi).toContain("not stored on this reservation yet");
    expect(guestUi).toContain("notes: draft.guestNotes");
    expect(guestUi).toContain("specialRequests: draft.specialRequests");
    expect(guestUi).not.toContain("updateGuest");
    expect(guestUi).not.toContain("saveGuestConsent");
  });
});
