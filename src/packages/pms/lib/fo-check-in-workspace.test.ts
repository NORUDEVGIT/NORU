import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
  foBuildFolioPreviewDisplay,
  foCheckInWorkspaceContinueLabel,
  foCheckInWorkspaceInitialStep,
  foDeriveReservationType,
  foGuestDisplayId,
  foGuestIdLooksLikeUuid,
  foGuaranteeStatusLabel,
  foOpensPreArrivalCheckInWorkspace,
  foCheckInWorkspaceProminentUnassigned,
  foPickGuestIdentityDocumentPreview,
} from "./fo-check-in-workspace";
import { FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS } from "./front-office-room-operations";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO Check-In workspace — Phase 1", () => {
  it("routes pre-arrival stays to wide workspace, not narrow reservation sheet", () => {
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /FoCheckInWorkspaceSheet/);
    assert.match(workspace, /foOpensPreArrivalCheckInWorkspace/);
    assert.match(workspace, /ReservationSideSheet/);
    assert.equal(foOpensPreArrivalCheckInWorkspace({ status: "confirmed" }), true);
    assert.equal(foOpensPreArrivalCheckInWorkspace({ status: "pending" }), true);
    assert.equal(foOpensPreArrivalCheckInWorkspace({ status: "checked_in" }), false);
  });

  it("uses wide sheet sizing, not sm:max-w-md", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS/);
    assert.equal(FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS, FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS);
    assert.match(FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS, /min\(78vw,1180px\)/);
    assert.doesNotMatch(sheet, /sm:max-w-md/);
    assert.match(sheet, /data-testid="fo-check-in-workspace"/);
  });

  it("highlights unassigned room assignment", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /foCheckInWorkspaceProminentUnassigned/);
    assert.match(sheet, /fo-ci-workspace-unassigned/);
    assert.equal(
      foCheckInWorkspaceProminentUnassigned({
        id: "r1",
        status: "confirmed",
        roomId: null,
      } as never),
      true,
    );
  });

  it("shows assigned room context when roomId is set", () => {
    assert.equal(foCheckInWorkspaceContinueLabel({ roomId: "room-1" }), "Next: Guest Verification");
    assert.equal(foCheckInWorkspaceInitialStep({ roomId: "room-1" }), "registration");
  });

  it("uses live readers for reservation, guest, folio, and arrival financial", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /getReservation/);
    assert.match(sheet, /getAmendContext/);
    assert.match(sheet, /getReservationFolio/);
    assert.match(sheet, /getFrontOfficeArrivalQuickView/);
    assert.match(sheet, /fo-ci-workspace-reservation/);
    assert.match(sheet, /fo-ci-workspace-guest/);
  });

  it("does not fabricate package rows, tax math, or card PAN", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /getReservationCommercialAttribution/);
    assert.match(sheet, /foBuildFolioPreviewDisplay/);
    assert.doesNotMatch(sheet, /\*\*\*\*/);
    assert.match(sheet, /FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE/);
    assert.match(sheet, /GUARANTEE_HOLD_UNSUPPORTED/);
  });

  it("does not claim Save as Draft persistence", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.doesNotMatch(sheet, /Save as Draft/i);
    assert.doesNotMatch(sheet, /Save & Continue Later/i);
    assert.match(sheet, /fo-ci-workspace-footer/);
    assert.match(sheet, /Close/);
  });

  it("continues into FoCheckInStepper with correct initial steps", () => {
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /onContinueCheckInFromWorkspace/);
    assert.match(workspace, /foCheckInWorkspaceInitialStep/);
    assert.equal(foCheckInWorkspaceInitialStep({ roomId: null }), "stay");
    assert.equal(foCheckInWorkspaceInitialStep({ roomId: "x" }), "registration");
    assert.match(workspace, /CheckInDialog/);
    assert.match(readRel("../components/frontoffice/front-office-dialogs.tsx"), /FoCheckInStepper/);
  });

  it("keeps room row vs stay bar entry points separate", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(calendar, /onSelectRoom\(room\.id\)/);
    assert.match(calendar, /onSelectStay\(stayFromReservation/);
    assert.match(workspace, /openRoomQuickView/);
    assert.match(workspace, /openStayQuickView/);
    assert.match(workspace, /RoomQuickViewSheet/);
  });

  it("derives reservation type safely from company / travel agent ids", () => {
    assert.equal(
      foDeriveReservationType({ companyMasterId: null, travelAgentMasterId: "ta-1" }),
      "Travel Agency",
    );
    assert.equal(
      foDeriveReservationType({ companyMasterId: "co-1", travelAgentMasterId: null }),
      "Corporate",
    );
    assert.equal(
      foDeriveReservationType({ companyMasterId: null, travelAgentMasterId: null }),
      "Individual",
    );
  });

  it("does not add schema migrations or new check-in writers", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.doesNotMatch(sheet, /completeFoCheckIn/);
    assert.doesNotMatch(sheet, /saveCheckInRegistration/);
    assert.doesNotMatch(sheet, /assignReservationRoom/);
  });
});

describe("FO Check-In workspace — Phase 2 polish", () => {
  it("reservation card exposes View/Edit reservation actions", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /fo-ci-workspace-view-reservation/);
    assert.match(sheet, /fo-ci-workspace-edit-reservation/);
    assert.match(sheet, /fo-ci-workspace-guarantee-status/);
    assert.match(sheet, /getReservationCommercialAttribution/);
  });

  it("derives honest guarantee status labels", () => {
    assert.equal(
      foGuaranteeStatusLabel({
        guaranteeMethod: "credit_card",
        depositRequired: false,
        depositPosted: 0,
        depositWaived: false,
      }),
      "Guaranteed",
    );
    assert.equal(
      foGuaranteeStatusLabel({
        guaranteeMethod: null,
        depositRequired: true,
        depositPosted: 0,
        depositWaived: false,
      }),
      "Deposit required",
    );
  });

  it("prefers profile number over raw UUID for guest id display", () => {
    assert.equal(foGuestDisplayId("G-0001256"), "G-0001256");
    assert.equal(foGuestDisplayId(null), null);
    assert.equal(foGuestIdLooksLikeUuid("550e8400-e29b-41d4-a716-446655440000"), true);
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /foGuestDisplayId/);
    assert.match(sheet, /fo-ci-workspace-guest-id-omitted/);
    assert.match(sheet, /listGuestDocuments/);
    assert.match(sheet, /No identity document image available/);
  });

  it("stay tiles route edits through existing amend actions", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /StayDetailTile/);
    assert.match(sheet, /extend_stay/);
    assert.match(sheet, /add_remove_guest/);
    assert.match(sheet, /upgrade_downgrade/);
  });

  it("room assignment uses assignable rooms and room type cover without auto assign", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /listAssignableRooms/);
    assert.match(sheet, /getRoomTypeAvailability/);
    assert.match(sheet, /fo-ci-workspace-room-cover/);
    assert.doesNotMatch(sheet, /Auto Assign/i);
    assert.doesNotMatch(sheet, /autoAssign/i);
  });

  it("folio preview does not sum taxes or estimated totals in the browser", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /foBuildFolioPreviewDisplay/);
    assert.doesNotMatch(sheet, /roomSubtotal\s*\+/);
    assert.doesNotMatch(sheet, /packagesSubtotal\s*\+/);
    const preview = foBuildFolioPreviewDisplay({
      money: (n) => `$${n}`,
      roomSubtotal: 18000,
      packages: [{ packageName: "Breakfast", appliedAmount: 0 }],
      packagesSubtotal: 0,
      grandCommercialSubtotal: 18000,
      folioBalance: null,
    });
    assert.equal(preview.taxesAndService, null);
    assert.equal(preview.estimatedTotal, "$18000");
  });

  it("payment card avoids PAN/CVV and fake card verified copy", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /Card authorization: Not supported/);
    assert.doesNotMatch(sheet, /CVV/i);
    assert.doesNotMatch(sheet, /\*\*\*\*/);
    assert.doesNotMatch(sheet, /card verified/i);
  });

  it("identity document preview uses listGuestDocuments urls only", () => {
    const pick = foPickGuestIdentityDocumentPreview([
      {
        url: "https://signed.example/id.jpg",
        mimeType: "image/jpeg",
        verificationStatus: "verified",
      },
    ]);
    assert.equal(pick.url, "https://signed.example/id.jpg");
  });
});
