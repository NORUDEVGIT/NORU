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
  foRackCheckedInStay,
  foRackConfirmedAssignedStay,
  foStayInformationSourceLabel,
} from "./fo-check-in-workspace";
import { OVERVIEW_LABEL_UNAVAILABLE } from "./reservation-detail-overview";
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
    assert.match(sheet, /fo-ci-workspace-stay-information/);
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
    assert.match(calendar, /onSelectStay\(foRackActionStay/);
    assert.match(workspace, /openRoomQuickView/);
    assert.match(workspace, /openStayQuickView/);
    assert.match(workspace, /RoomQuickViewSheet/);
  });

  it("opens assigned and unassigned confirmed stays in the same check-in sheet", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(calendar, /foRackConfirmedAssignedStay/);
    assert.match(calendar, /onSelectStay\(foRackActionStay\(confirmed/);
    assert.equal(foOpensPreArrivalCheckInWorkspace({ status: "confirmed" }), true);
    assert.match(workspace, /foOpensPreArrivalCheckInWorkspace\(sheetStay\)/);
    assert.doesNotMatch(
      workspace,
      /foOpensPreArrivalCheckInWorkspace\(sheetStay\)[\s\S]{0,80}sheetStay\.roomId/,
    );
    const assigned = foRackConfirmedAssignedStay([
      { status: "confirmed" as const, roomId: "room-1" },
    ]);
    assert.equal(assigned?.roomId, "room-1");
    assert.equal(
      foRackConfirmedAssignedStay([{ status: "confirmed" as const, roomId: null }]),
      null,
    );
    assert.equal(
      foRackConfirmedAssignedStay([
        { status: "checked_in" as const, roomId: "room-1" },
        { status: "confirmed" as const, roomId: "room-1" },
      ]),
      null,
    );
  });

  it("opens a rack checked-in room in the in-house sheet for that unit", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    const occupancy = readRel("./frontoffice.functions.ts");
    assert.match(calendar, /inHouseTargetForRoom\(room, stays\)/);
    assert.match(calendar, /onSelectInHouse\(inHouse\)/);
    assert.match(calendar, /onSelectRoom\(room\.id\)/);
    assert.match(workspace, /onSelectInHouse=\{openInHouseFromRack\}/);
    assert.match(workspace, /<InHouseQuickViewSheet/);
    assert.match(workspace, /reservationId=\{inHouseQv\?\.reservationId \?\? null\}/);
    assert.match(workspace, /reservationRoomId=\{inHouseQv\?\.reservationRoomId \?\? null\}/);
    assert.match(
      workspace,
      /initialReservationRoomId=\{inHouseMove\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(
      workspace,
      /initialReservationRoomId=\{inHouseCheckOut\.reservationRoomId \?\? undefined\}/,
    );
    assert.match(workspace, /<FoCheckInWorkspaceSheet/);
    assert.match(workspace, /<RoomQuickViewSheet/);
    assert.match(occupancy, /id, reservation_id, room_id, status/);
    assert.match(occupancy, /reservationRoomId: occupiedRoom\?\.reservationRoomId \?\? null/);
    assert.doesNotMatch(calendar, /onSelectRoom\(room\.id\)[\s\S]{0,40}onSelectInHouse/);

    const checkedIn = foRackCheckedInStay({
      roomId: "room-1",
      stays: [
        { id: "res-in", status: "checked_in", roomId: "room-1" },
        { id: "res-next", status: "confirmed", roomId: "room-1" },
      ],
      occupied: { reservationId: "res-in", reservationRoomId: "unit-1" },
    });
    assert.deepEqual(checkedIn, { reservationId: "res-in", reservationRoomId: "unit-1" });

    const sibling = foRackCheckedInStay({
      roomId: "room-2",
      stays: [
        {
          id: "res-multi",
          status: "checked_in",
          roomId: "room-1",
          rooms: [
            { id: "unit-1", roomId: "room-1", status: "checked_in" },
            { id: "unit-2", roomId: "room-2", status: "checked_in" },
          ],
        },
      ],
    });
    assert.deepEqual(sibling, { reservationId: "res-multi", reservationRoomId: "unit-2" });
    assert.notEqual(sibling?.reservationRoomId, "unit-1");

    assert.equal(
      foRackCheckedInStay({
        roomId: "room-9",
        stays: [{ id: "res-confirmed", status: "confirmed", roomId: "room-9" }],
      }),
      null,
    );
    assert.equal(
      foRackCheckedInStay({
        roomId: "room-vacant",
        stays: [],
      }),
      null,
    );
    assert.equal(
      foRackConfirmedAssignedStay([{ status: "confirmed" as const, roomId: "room-9" }])?.roomId,
      "room-9",
    );
  });

  it("shows a source label instead of the stored code or id", () => {
    const phoneId = "550e8400-e29b-41d4-a716-446655440000";
    const sources = [{ id: phoneId, code: "PHONE", name: "Phone" }];
    assert.equal(foStayInformationSourceLabel("staff", phoneId, sources), "Phone");
    assert.equal(foStayInformationSourceLabel("staff", "travel_agency", null), "Travel agency");
    assert.equal(foStayInformationSourceLabel("walk_in", null, null), "Walk-in");
    assert.equal(foStayInformationSourceLabel("future_online", null, null), "Future online");
    assert.equal(foStayInformationSourceLabel("staff", null, null), "Staff");
    assert.equal(
      foStayInformationSourceLabel("staff", "11111111-1111-4111-8111-111111111111", sources),
      OVERVIEW_LABEL_UNAVAILABLE,
    );
    assert.equal(foStayInformationSourceLabel(null, null, null), "—");
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /foStayInformationSourceLabel/);
    assert.match(sheet, /getPmsSet6Snapshot/);
    assert.doesNotMatch(sheet, /reservation-detail-overview/);
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
  it("shows guarantee status from the commercial and arrival readers", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
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

  it("stay amendments live in the Edit Details form, not inline body edits", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    const form = readRel("../components/frontoffice/fo-edit-details-form.tsx");
    assert.match(sheet, /fo-ci-workspace-tab-edit-details/);
    assert.match(sheet, /<FoEditDetailsForm/);
    assert.match(form, /amendReservation/);
    assert.doesNotMatch(sheet, /fo-ci-workspace-edit-/);
    assert.doesNotMatch(sheet, /StayDetailTile/);
    assert.doesNotMatch(sheet, /Edit in Reservation/);
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

  it("header shows identity, status, room chip and status-aware tabs; actions live in tabs", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    const header = sheet.slice(
      sheet.indexOf('data-testid="fo-ci-workspace-header"'),
      sheet.indexOf("</SheetHeader>"),
    );
    assert.match(header, /stay\.guestName/);
    assert.match(header, /stay\.confirmationNumber/);
    assert.match(header, /ReservationStatusBadge/);
    assert.match(header, /fo-ci-workspace-unassigned/);
    assert.match(header, /fo-ci-workspace-assigned-room/);
    assert.match(header, /<FoGuestWorkspaceTabBar tabs=\{tabs\}/);
    assert.match(
      sheet,
      /const tabs = foGuestWorkspaceTabs\(stay\.status, \{ canReadFolio: canOpenCashiering \}\)/,
    );
    assert.doesNotMatch(header, /<Button/);
    assert.doesNotMatch(sheet, /More actions/);
    assert.doesNotMatch(sheet, /DropdownMenu/);
    const assignTab = sheet.slice(sheet.indexOf("fo-ci-workspace-tab-assign-room"));
    assert.match(assignTab, /fo-ci-workspace-assign-room/);
    assert.match(assignTab, /fo-ci-workspace-change-room/);
    assert.match(assignTab, /onAction\("assign", stay\)/);
    const checkInTab = sheet.slice(sheet.indexOf("fo-ci-workspace-tab-check-in"));
    assert.match(checkInTab, /fo-ci-workspace-check-in/);
    assert.match(checkInTab, /onContinueCheckIn\(stay\)/);
    assert.doesNotMatch(sheet, /<footer/);
    assert.doesNotMatch(sheet, /fo-ci-workspace-footer/);
    assert.doesNotMatch(sheet, /fo-ci-workspace-continue/);
  });

  it("removes duplicate body actions, including request and notes edits", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    for (const gone of [
      "Open Reservation",
      "View Reservation",
      "Edit Reservation",
      "View Profile",
      "View Folio</Button>",
      "fo-ci-workspace-open-reservation",
      "fo-ci-workspace-view-reservation",
      "fo-ci-workspace-edit-guest",
      "fo-ci-workspace-view-profile",
      "fo-ci-workspace-view-folio",
      "fo-ci-workspace-edit-special-requests",
      "fo-ci-workspace-edit-notes",
      "Find Another Room",
      "<Link",
    ]) {
      assert.equal(sheet.includes(gone), false, gone);
    }
    assert.equal(sheet.match(/fo-ci-workspace-assign-room/g)?.length, 1);
    const body = sheet.slice(sheet.indexOf("</SheetHeader>"));
    assert.equal((body.match(/>\s*Edit\s*</g) ?? []).length, 0);
  });

  it("shows the amber assignment banner for confirmed unassigned stays", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /stay\.status === "confirmed" && !roomAssigned/);
    assert.match(sheet, /fo-ci-workspace-assignment-required/);
    assert.match(sheet, /Room assignment required/);
    assert.match(sheet, /border-amber-300 bg-amber-50/);
  });

  it("overview lays out the compact cards in order", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    const titles = [
      'data-testid="fo-ci-workspace-overview"',
      'title="Guest Information"',
      'title="Stay & Accommodation"',
      'title={roomAssigned ? "Room Information" : "Room Assignment"}',
      'title="Financial Summary"',
      'title="Special Requests / Notes"',
      'data-testid="fo-ci-workspace-notes"',
    ];
    const positions = titles.map((title) => sheet.indexOf(title));
    for (const pos of positions) assert.ok(pos > 0);
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
    assert.doesNotMatch(sheet, /title="Folio Preview"/);
    assert.doesNotMatch(sheet, /title="Payment \/ Guarantee"/);
  });

  it("workflow tabs keep amend, no-show, cancellation and folio on existing handlers", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /stayQuickViewMenuItems/);
    assert.match(sheet, /const canNoShow = menuItems\.some\(\(item\) => item\.id === "no_show"\)/);
    assert.match(
      sheet,
      /const canCheckIn = menuItems\.some\(\(item\) => item\.id === "check_in"\)/,
    );
    assert.match(sheet, /const canCancel = isStayCancellable\(stay\.status\)/);
    assert.match(sheet, /onAction\("no_show", stay\)/);
    assert.match(sheet, /setCancelOpen\(true\)/);
    assert.match(sheet, /enabled: open && tab === "cancel_no_show"/);
    assert.match(sheet, /onClick=\{openViewFolio\}/);
    assert.match(sheet, /if \(!canOpenCashiering\)/);
    assert.match(sheet, /<FoEditDetailsForm/);
    assert.match(sheet, /FoCancelStepper/);
    assert.equal(sheet.match(/>\s*Change Room\s*</g)?.length, 1);
    assert.equal(sheet.match(/fo-ci-workspace-assign-room/g)?.length, 1);
    assert.equal(sheet.match(/fo-ci-workspace-change-room/g)?.length, 1);
  });

  it("room card reads authoritative room fields and does not invent them", () => {
    const sheet = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
    assert.match(sheet, /fo-ci-workspace-room-number/);
    assert.match(sheet, /reservation\?\.roomNumber/);
    assert.match(sheet, /arrival\?\.room\.roomNumber/);
    assert.match(sheet, /fo-ci-workspace-room-building/);
    assert.match(sheet, /assignedRoomMeta\?\.building/);
    assert.match(sheet, /fo-ci-workspace-room-floor/);
    assert.match(sheet, /assignedRoomMeta\?\.floor/);
    assert.match(sheet, /fo-ci-workspace-room-status/);
    assert.match(sheet, /arrival\?\.room\.status/);
    assert.match(sheet, /fo-ci-workspace-room-housekeeping/);
    assert.match(sheet, /arrival\?\.room\.housekeepingStatus/);
    assert.doesNotMatch(sheet, /Building A|Floor 1|Vacant Clean/);
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
