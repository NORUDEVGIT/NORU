import { describe, expect, it } from "vitest";

import {
  buildNoShowConfirmationHtml,
  type NoShowConfirmationInput,
} from "@/packages/pms/lib/noshow-confirmation-print";

function sample(overrides: Partial<NoShowConfirmationInput> = {}): NoShowConfirmationInput {
  return {
    property: {
      name: "Noru House",
      logoUrl: "https://cdn.example/logo.png",
      address: "12 Bole Road, Addis Ababa",
      phone: "+251 11 000 0000",
      email: "stay@noru.test",
    },
    generatedAt: "11 Nov 2026, 17:10",
    confirmationNumber: "NR-1044",
    guestName: "Ada Bekele",
    stay: "10 Nov 2026 – 12 Nov 2026",
    room: "Room 305",
    roomType: "King",
    reason: "Guest Did Not Arrive",
    policy: "First night",
    charge: "ETB 4500",
    chargeStatus: "Posted",
    roomRelease: "Room 305 will be released.",
    reservationResult: "The reservation will be marked No-Show.",
    processedBy: "Abebawe Demeke",
    publicNotes: "Late arrival if the flight is delayed.",
    ...overrides,
  };
}

describe("no-show confirmation document", () => {
  it("prints a branded confirmation and leaves staff notes out", () => {
    const html = buildNoShowConfirmationHtml(sample());
    expect(html).toContain("No-Show Confirmation");
    expect(html).toContain("Noru House");
    expect(html).toContain("12 Bole Road, Addis Ababa");
    expect(html).toContain("+251 11 000 0000");
    expect(html).toContain("stay@noru.test");
    expect(html).toContain("https://cdn.example/logo.png");
    expect(html).toContain("NR-1044");
    expect(html).toContain("Ada Bekele");
    expect(html).toContain("10 Nov 2026 – 12 Nov 2026");
    expect(html).toContain("Room 305");
    expect(html).toContain("King");
    expect(html).toContain("Guest Did Not Arrive");
    expect(html).toContain("First night");
    expect(html).toContain("ETB 4500");
    expect(html).toContain("Posted");
    expect(html).toContain("Room 305 will be released.");
    expect(html).toContain("Abebawe Demeke");
    expect(html).toContain("11 Nov 2026, 17:10");
    expect(html).toContain("Late arrival if the flight is delayed.");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("Internal folio note");
  });

  it("rejects a non-http logo", () => {
    const html = buildNoShowConfirmationHtml(
      sample({ property: { ...sample().property, logoUrl: "javascript:alert(1)" } }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("NORU");
  });
});
