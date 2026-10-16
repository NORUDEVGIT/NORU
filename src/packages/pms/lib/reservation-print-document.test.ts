import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BOOKING_CONFIRMATION_PRINT_TITLE,
  buildDraftReservationPrintData,
  buildPersistedReservationPrintData,
  confirmedTimestampFromHistory,
  DRAFT_RESERVATION_PRINT_FOOTER,
  DRAFT_RESERVATION_PRINT_TITLE,
  formatPrintDate,
  PERSISTED_RESERVATION_PRINT_FOOTER,
  reservationPrintTitle,
  RESERVATION_SUMMARY_PRINT_TITLE,
  type DraftReservationPrintInput,
  type PersistedReservationPrintInput,
} from "./reservation-print-document.ts";

const reviewUi = readFileSync(
  new URL("../components/bookings/create-reservation-review.tsx", import.meta.url),
  "utf8",
);
const printUi = readFileSync(
  new URL("../components/bookings/reservation-print-document.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/workspaces/reservation-detail-workspace.tsx", import.meta.url),
  "utf8",
);
const printLib = readFileSync(new URL("./reservation-print-document.ts", import.meta.url), "utf8");

const RAW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function draftInput(
  overrides: Partial<DraftReservationPrintInput> = {},
): DraftReservationPrintInput {
  return {
    generatedAt: "14 Oct 2026, 18:02",
    propertyName: "NORU House",
    propertyAddress: "12 Bole Road, Addis Ababa",
    propertyPhone: "+251 11 000 0000",
    propertyEmail: "stay@noru.test",
    guestName: "Maria Santos",
    phone: "+251 91 000 0000",
    email: "maria@example.com",
    nationality: "Ethiopian",
    idDocumentNumber: "EP12345678",
    bookedBy: "Same as guest",
    bookingSource: "Direct",
    salesChannel: "Phone",
    marketSegment: "Leisure",
    companyName: "Acme Travel",
    companyTerms: "Due on arrival",
    travelAgentName: null,
    travelAgentTerms: null,
    groupName: null,
    arrivalLabel: "14 Oct 2026",
    departureLabel: "16 Oct 2026",
    nights: 2,
    rooms: 1,
    adults: 2,
    children: 1,
    infants: 0,
    roomImageUrl: "https://example.test/room.jpg",
    roomName: "Deluxe King",
    roomCode: "DLX",
    ratePlan: "Flexible Bed & Breakfast",
    inclusions: "Breakfast included",
    ratePerNight: "ETB 4,500",
    roomTotal: "ETB 9,000",
    packages: [
      {
        name: "Airport transfer",
        chargeBasis: "per_stay",
        quantity: null,
        unitAmount: "ETB 1,200",
        amount: null,
        inclusions: "Private car",
      },
    ],
    paymentType: "Card guarantee",
    paymentMethod: "Same as payment type",
    depositRequired: "Yes",
    depositAmount: "ETB 2,000",
    depositDueDate: "2026-10-12",
    cancellation: "Free cancellation until 13 Oct 2026",
    noShowPolicy: "Standard no-show",
    noShowPenalty: "First night",
    earlyDeparture: "Early departure · First night",
    refundabilityKind: "refundable",
    refundabilityLabel: "Flexible",
    preferences: ["High Floor: Yes"],
    serviceRequests: ["Extra pillows"],
    specialRequests: "Late arrival",
    roomAssignment: "Room 204",
    ...overrides,
  };
}

function persistedInput(
  overrides: Partial<PersistedReservationPrintInput> = {},
): PersistedReservationPrintInput {
  return {
    generatedAt: "14 Oct 2026, 18:02",
    propertyName: "NORU House",
    propertyAddress: "12 Bole Road",
    propertyPhone: null,
    propertyEmail: null,
    status: "confirmed",
    confirmationNumber: "NR-1001",
    createdAt: "2026-10-10T09:30:00.000Z",
    confirmedAt: "2026-10-10T10:00:00.000Z",
    guestName: "Maria Santos",
    phone: "+251 91 000 0000",
    email: "maria@example.com",
    nationality: "Ethiopian",
    idDocumentNumber: "EP12345678",
    bookedBy: "Same as guest",
    bookingSource: "Direct",
    salesChannel: "Phone",
    marketSegment: "Leisure",
    companyName: null,
    travelAgentName: null,
    groupName: null,
    arrivalDate: "2026-10-14",
    departureDate: "2026-10-16",
    nights: 2,
    rooms: 1,
    adults: 2,
    children: 0,
    infants: 0,
    roomImageUrl: null,
    roomName: "Deluxe King",
    roomCode: "DLX",
    ratePlan: "Flexible Bed & Breakfast",
    inclusions: null,
    ratePerNight: "ETB 4,500",
    roomTotal: "ETB 9,000",
    packages: [
      {
        name: "Airport transfer",
        chargeBasis: "per_stay",
        quantity: 1,
        unitAmount: "ETB 1,200",
        amount: "ETB 1,200",
        inclusions: "Private car",
      },
    ],
    packagesKnown: true,
    packagesTotal: "ETB 1,200",
    paymentType: "Card guarantee",
    paymentMethod: "CASH",
    depositRequired: "Yes",
    depositAmount: "ETB 2,000",
    depositDueDate: "2026-10-12",
    paymentTerms: [],
    cancellation: "Free cancellation",
    noShow: "Standard no-show · First night",
    earlyDeparture: "Early departure · First night",
    refundability: "Refundable",
    preferences: ["Non-Smoking"],
    serviceRequests: [],
    specialRequests: "Late arrival",
    roomAssignment: "Room 204",
    ...overrides,
  };
}

describe("shared reservation print document", () => {
  it("is the only reservation print template and both screens use it", () => {
    assert.equal(
      existsSync(
        new URL("../components/bookings/create-reservation-review-print.tsx", import.meta.url),
      ),
      false,
    );
    assert.equal(reviewUi.includes("ReservationReviewPrint"), false);
    assert.equal(workspace.includes("ReservationReviewPrint"), false);
    assert.match(reviewUi, /<ReservationPrintDocument data=\{printData\} \/>/);
    assert.match(reviewUi, /buildDraftReservationPrintData\(/);
    assert.match(workspace, /<ReservationPrintDocument data=\{printData\} \/>/);
    assert.match(workspace, /buildPersistedReservationPrintData\(/);
    assert.equal(printUi.match(/data-testid="reservation-print-document"/g)?.length, 1);
  });

  it("uses draft and persisted titles without a fake confirmation number", () => {
    assert.equal(reservationPrintTitle("draft"), DRAFT_RESERVATION_PRINT_TITLE);
    assert.equal(reservationPrintTitle("persisted", "confirmed"), BOOKING_CONFIRMATION_PRINT_TITLE);
    for (const status of ["pending", "checked_in", "checked_out", "cancelled", "no_show"]) {
      assert.equal(reservationPrintTitle("persisted", status), RESERVATION_SUMMARY_PRINT_TITLE);
    }
    const draft = buildDraftReservationPrintData({
      ...draftInput(),
      confirmationNumber: "FAKE-100",
    } as DraftReservationPrintInput);
    assert.equal(draft.title, DRAFT_RESERVATION_PRINT_TITLE);
    assert.equal(draft.confirmationNumber, null);
    assert.equal(draft.showDraftBadge, true);
    assert.equal(draft.statusLabel, null);
    const confirmed = buildPersistedReservationPrintData(persistedInput());
    assert.equal(confirmed.title, BOOKING_CONFIRMATION_PRINT_TITLE);
    assert.equal(confirmed.confirmationNumber, "NR-1001");
    assert.equal(confirmed.statusLabel, "Confirmed");
    const pending = buildPersistedReservationPrintData(
      persistedInput({ status: "pending", confirmationNumber: "   ", confirmedAt: null }),
    );
    assert.equal(pending.title, RESERVATION_SUMMARY_PRINT_TITLE);
    assert.equal(pending.confirmationNumber, null);
    assert.equal(pending.confirmedAt, null);
    assert.equal(formatPrintDate("2026-10-14"), "14 Oct 2026");
  });

  it("renders guest, stay, room, package, payment, and policy values from real fields", () => {
    const draft = buildDraftReservationPrintData(draftInput());
    assert.deepEqual(
      draft.guest.map((row) => row.label),
      ["Name", "Phone", "Email", "Nationality", "ID / Passport"],
    );
    assert.equal(draft.guest.find((row) => row.label === "Name")?.value, "Maria Santos");
    assert.equal(draft.guest.find((row) => row.label === "ID / Passport")?.value, "•••• 5678");
    assert.equal(draft.stay.find((row) => row.label === "Check-in")?.value, "14 Oct 2026");
    assert.equal(draft.stay.find((row) => row.label === "Nights")?.value, "2");
    assert.equal(draft.room.typeName, "Deluxe King");
    assert.equal(draft.room.code, "DLX");
    assert.equal(draft.room.ratePlan, "Flexible Bed & Breakfast");
    assert.equal(draft.room.ratePerNight, "ETB 4,500");
    assert.equal(draft.room.roomTotal, "ETB 9,000");
    assert.equal(draft.packages[0]?.description, "Airport transfer");
    assert.equal(draft.packages[0]?.quantity, "Per stay");
    assert.equal(draft.packages[0]?.price, "ETB 1,200");
    assert.equal(draft.packages[0]?.amount, null);
    assert.equal(draft.roomTotal, "ETB 9,000");
    assert.equal(draft.packagesTotal, null);
    assert.equal(draft.reservationTotal, null);
    assert.equal(draft.payment.find((row) => row.label === "Deposit Amount")?.value, "ETB 2,000");
    assert.equal(
      draft.payment.find((row) => row.label === "Deposit Due Date")?.value,
      "12 Oct 2026",
    );
    assert.equal(
      draft.policies.find((row) => row.label === "Cancellation")?.value,
      "Free cancellation until 13 Oct 2026",
    );
    assert.match(draft.policies.find((row) => row.label === "No-show")?.value ?? "", /First night/);
    assert.equal(draft.preferences[0], "High Floor: Yes");
    assert.equal(draft.serviceRequests[0], "Extra pillows");
    assert.equal(draft.specialRequests, "Late arrival");
    assert.equal(draft.footer, DRAFT_RESERVATION_PRINT_FOOTER);
    const persisted = buildPersistedReservationPrintData(persistedInput());
    assert.equal(persisted.packages[0]?.quantity, "1 · Per stay");
    assert.equal(persisted.packages[0]?.amount, "ETB 1,200");
    assert.equal(persisted.packagesTotal, "ETB 1,200");
    assert.equal(persisted.reservationTotal, null);
    assert.equal(persisted.footer, PERSISTED_RESERVATION_PRINT_FOOTER);
    assert.match(persisted.createdAt ?? "", /2026/);
    assert.match(persisted.confirmedAt ?? "", /2026/);
  });

  it("omits internal notes, raw ids, and sensitive card fields", () => {
    const leaked = {
      internalNotes: "Staff-only trace",
      notes: "Do not print",
      cardNumber: "4111111111111111",
      cvv: "123",
      expiry: "12/30",
    };
    const draft = buildDraftReservationPrintData({
      ...draftInput({
        bookingSource: RAW_ID,
        salesChannel: RAW_ID,
        marketSegment: RAW_ID,
        idDocumentNumber: "EP12345678",
      }),
      ...leaked,
    } as DraftReservationPrintInput);
    const persisted = buildPersistedReservationPrintData({
      ...persistedInput({
        bookingSource: RAW_ID,
        salesChannel: RAW_ID,
        marketSegment: RAW_ID,
        confirmationNumber: RAW_ID,
      }),
      ...leaked,
    } as PersistedReservationPrintInput);
    for (const data of [draft, persisted]) {
      const serialized = JSON.stringify(data);
      assert.equal(serialized.includes("Staff-only trace"), false);
      assert.equal(serialized.includes("Do not print"), false);
      assert.equal(serialized.includes("4111111111111111"), false);
      assert.equal(serialized.includes("123"), false);
      assert.equal(serialized.includes("12/30"), false);
      assert.equal(serialized.includes(RAW_ID), false);
      assert.equal(serialized.includes("Internal Notes"), false);
    }
    assert.equal(
      draft.booking.some((row) => row.label === "Booking Source"),
      false,
    );
    assert.equal(persisted.confirmationNumber, null);
    assert.equal(
      confirmedTimestampFromHistory([
        { eventType: "created", createdAt: "2026-10-01T00:00:00.000Z", newValues: null },
      ]),
      null,
    );
    assert.equal(
      confirmedTimestampFromHistory([
        {
          eventType: "status_changed",
          createdAt: "2026-10-02T00:00:00.000Z",
          newValues: { status: "confirmed" },
        },
      ]),
      "2026-10-02T00:00:00.000Z",
    );
    assert.doesNotMatch(printUi, /Internal Notes|cvv|cardNumber|expiry/i);
    assert.doesNotMatch(printLib, /internalNotes|cardNumber|cvv/);
  });

  it("prints through window.print without mutating the reservation", () => {
    assert.match(
      reviewUi,
      /data-testid="review-print-reservation"[\s\S]{0,160}onClick=\{\(\) => window\.print\(\)\}/,
    );
    assert.doesNotMatch(
      reviewUi.slice(
        reviewUi.indexOf('data-testid="review-print-reservation"'),
        reviewUi.indexOf("Print Reservation\n"),
      ),
      /mutate|createReservation|submitReservation/,
    );
    assert.doesNotMatch(reviewUi, /create\.mutate|submitReservation/);
    assert.match(
      workspace,
      /data-testid="reservation-detail-print"[\s\S]{0,160}onClick=\{\(\) => window\.print\(\)\}/,
    );
    const detailPrint = workspace.slice(
      workspace.indexOf("const noShowName = snapshotDisplayName"),
      workspace.indexOf("const stayPanel"),
    );
    assert.doesNotMatch(
      detailPrint,
      /mutate|setReservationStatus|reservation\.notes|cardNumber|cvv/i,
    );
    assert.match(detailPrint, /cancellationPolicySnapshot/);
    assert.match(detailPrint, /noShowPolicySnapshot/);
    assert.match(detailPrint, /earlyDeparturePolicySnapshot/);
    assert.match(detailPrint, /refundabilitySnapshot/);
    assert.doesNotMatch(printUi, /mutate|createReservation|setReservationStatus|window\.print/);
    assert.match(printUi, /@media print/);
    assert.match(printUi, /body \* \{ visibility: hidden; \}/);
    assert.match(
      printUi,
      /\.reservation-print-document,\s*\.reservation-print-document \* \{ visibility: visible; \}/,
    );
    assert.match(printUi, /@page \{ size: A4;/);
  });
});
