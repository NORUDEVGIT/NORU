import { describe, expect, it } from "vitest";

import {
  buildGroupBlockConfirmationHtml,
  savedGroupBlockConfirmationInput,
  type GroupBlockConfirmationInput,
} from "@/packages/pms/lib/group-block-confirmation-print";

function sample(): GroupBlockConfirmationInput {
  return {
    property: {
      name: "Noru House",
      logoUrl: "https://cdn.example/logo.png",
      address: "12 Bole Road, Addis Ababa",
      phone: "+251 11 000 0000",
      email: "stay@noru.test",
    },
    generatedAt: "11 Nov 2026, 13:00",
    groupName: "Ethiopia Hiking",
    groupCode: "EHK_01",
    status: "Tentative",
    stay: "14 Nov 2026 – 18 Nov 2026 · 4 nights",
    cutoff: "10 Nov 2026",
    company: "Summit Co",
    travelAgency: "—",
    groupLeader: "Ada Bekele",
    profileSource: "Direct Web",
    staySource: "Uses profile source",
    profileMarketSegment: "Group",
    stayMarketSegment: "Uses profile segment",
    ratePlan: "GRP · Group rate",
    allotments: [
      {
        roomType: "Twin",
        dates: "14 Nov 2026 – 18 Nov 2026",
        roomsBlocked: "8",
        cutoff: "Inherits stay cut-off 10 Nov 2026",
      },
    ],
    roomTypes: "1",
    totalRoomsBlocked: "8",
    totalRoomNights: "32",
    publicNotes: "Ground-floor rooms if available.",
  };
}

describe("group block confirmation document", () => {
  it("prints a hotel confirmation and leaves staff notes out", () => {
    const html = buildGroupBlockConfirmationHtml({
      ...sample(),
      publicNotes: "Ground-floor rooms if available.",
    });
    expect(html).toContain("Group / Block Confirmation");
    expect(html).toContain("Noru House");
    expect(html).toContain("12 Bole Road, Addis Ababa");
    expect(html).toContain("+251 11 000 0000");
    expect(html).toContain("stay@noru.test");
    expect(html).toContain("https://cdn.example/logo.png");
    expect(html).toContain("Ethiopia Hiking");
    expect(html).toContain("EHK_01");
    expect(html).toContain("Tentative");
    expect(html).toContain("14 Nov 2026 – 18 Nov 2026 · 4 nights");
    expect(html).toContain("Profile Source");
    expect(html).toContain("Stay Source");
    expect(html).toContain("Profile Market Segment");
    expect(html).toContain("Stay Market Segment");
    expect(html).toContain("GRP · Group rate");
    expect(html).toContain("Twin");
    expect(html).toContain("Rooms blocked");
    expect(html).toContain("Ground-floor rooms if available.");
    expect(html).toContain("window.print()");
    expect(html).toContain("DRAFT");
    expect(html).not.toContain("Staff note about the cutoff");
    expect(html).not.toContain("Internal profile note");
  });

  it("omits the notes section when there is no public note", () => {
    const html = buildGroupBlockConfirmationHtml({ ...sample(), publicNotes: "  " });
    expect(html).not.toContain("<h3>Notes</h3>");
  });

  it("prints the saved confirmation number and leaves the draft mark off", () => {
    const input = savedGroupBlockConfirmationInput({
      property: sample().property,
      generatedAt: "11 Nov 2026, 14:00",
      group: {
        confirmationNumber: "GRP-1042",
        name: "Ethiopia Hiking",
        code: "EHK_01",
        status: "definite",
        arrivalDate: "2026-11-14",
        departureDate: "2026-11-18",
        cutoffDate: "2026-11-10",
        source: "DIR",
        marketSegment: "GRP",
      },
      blocks: [
        {
          roomTypeId: "twin",
          roomTypeName: "Twin",
          startDate: "2026-11-14",
          endDate: "2026-11-18",
          allotted: 8,
          cutoffDate: null,
        },
      ],
      roomTypes: [{ id: "twin", name: "Twin" }],
      companyName: "Summit Co",
      profileSourceName: "Direct Web",
      profileSourceCode: "WEB",
      profileMarketSegmentName: "Group",
      profileMarketSegmentCode: "GRP",
      sources: [{ code: "DIR", name: "Direct" }],
      segments: [{ code: "GRP", name: "Group" }],
      ratePlan: "GRP · Group rate",
      publicNotes: "Ground-floor rooms if available.",
    });
    expect(input.draft).toBe(false);
    expect(input.groupCode).toBe("GRP-1042 · EHK_01");
    expect(input.staySource).toBe("Direct");
    expect(input.stayMarketSegment).toBe("Uses profile segment");
    expect(input.publicNotes).toBe("Ground-floor rooms if available.");
    const html = buildGroupBlockConfirmationHtml(input);
    expect(html).toContain("GRP-1042 · EHK_01");
    expect(html).toContain("Ground-floor rooms if available.");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("DRAFT");
    expect(html).not.toContain("before the group was created");
    expect(html).not.toContain("Staff stay note");
  });

  it("rejects a non-http logo", () => {
    const html = buildGroupBlockConfirmationHtml({
      ...sample(),
      property: { ...sample().property, logoUrl: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain(">NORU<");
  });
});
