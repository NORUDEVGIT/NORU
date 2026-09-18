import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GUEST_PROFILE_CARDS, GUEST_PROFILE_TYPES } from "./guest-profile-wave1.ts";
import {
  WAVE3_ACCEPTANCE_CRITERIA,
  WAVE3_DASHBOARD_CONTEXT,
  WAVE3_KPI_NOT_AVAILABLE,
  WAVE3_POSTED_FOLIO_LABEL,
  WAVE3_PROFILE_HISTORY_COPY,
  WAVE3_QUOTED_ROOM_TOTAL_LABEL,
  WAVE3_ROOM_UNASSIGNED,
  WAVE3_STAY_HISTORY_CONTEXT,
  WAVE3_STAY_HISTORY_EMPTY,
  deriveStayOverview,
  folioHref,
  frontOfficeHref,
  knownMoneyTotal,
  mapReservationToStay,
  reservationHref,
  stayQuickActions,
  stayRoomNumberLabel,
  wave3StayHistoryEmpty,
  type GuestStay,
  type GuestStayAccess,
} from "./guest-profile-wave3.ts";
import { nightsBetween } from "../../../shared/lib/property-dates.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const FULL_ACCESS: GuestStayAccess = { reservation: true, frontOffice: true, folio: true };
const NO_ACCESS: GuestStayAccess = { reservation: false, frontOffice: false, folio: false };

function stay(
  partial: Partial<GuestStay> &
    Pick<GuestStay, "id" | "confirmationNumber" | "arrivalDate" | "departureDate" | "status">,
): GuestStay {
  return mapReservationToStay({
    roomTypeName: "Deluxe",
    roomId: null,
    roomNumber: null,
    roomSubtotal: null,
    currency: "GBP",
    ...partial,
  });
}

describe("Guest Profile Wave 3 lock — AC-W3-1…17", () => {
  it("locks the full AC-W3-1…17 set", () => {
    assert.deepEqual(
      [...WAVE3_ACCEPTANCE_CRITERIA],
      [
        "AC-W3-1",
        "AC-W3-2",
        "AC-W3-3",
        "AC-W3-4",
        "AC-W3-5",
        "AC-W3-6",
        "AC-W3-7",
        "AC-W3-8",
        "AC-W3-9",
        "AC-W3-10",
        "AC-W3-11",
        "AC-W3-12",
        "AC-W3-13",
        "AC-W3-14",
        "AC-W3-15",
        "AC-W3-16",
        "AC-W3-17",
      ],
    );
  });

  it("AC-W3-1 maps a known reservation to Stay History confirmation and dates", () => {
    const mapped = mapReservationToStay({
      id: "res-1",
      confirmationNumber: "NORU-1001",
      arrivalDate: "2026-09-14",
      departureDate: "2026-09-16",
      status: "confirmed",
      roomTypeName: "Deluxe",
    });
    assert.equal(mapped.confirmationNumber, "NORU-1001");
    assert.equal(mapped.arrivalDate, "2026-09-14");
    assert.equal(mapped.departureDate, "2026-09-16");
    assert.equal(reservationHref(mapped.id), "/restaurant/pms/reservations/res-1");
    const functions = readRel("./guests.functions.ts");
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    assert.match(functions, /export const listGuestStays/);
    assert.match(functions, /from\("hotel_reservations"\)/);
    assert.match(functions, /\.eq\("guest_id", guestId\)/);
    assert.match(history, /confirmationNumber/);
    assert.match(history, /arrivalDate/);
    assert.match(history, /departureDate/);
    assert.doesNotMatch(history, /NORU-DEMO|sample stay|invented/i);
  });

  it("AC-W3-2 keeps an honest empty Stay History with no sample rows", () => {
    const overview = deriveStayOverview([], "2026-09-14", FULL_ACCESS);
    assert.equal(overview.stayCount, 0);
    assert.equal(overview.featuredStay, null);
    assert.match(WAVE3_STAY_HISTORY_EMPTY, /does not invent stays/);
    assert.match(wave3StayHistoryEmpty("Ada Guest"), /Ada Guest/);
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    assert.match(history, /wave3StayHistoryEmpty/);
    assert.match(history, /guest-stay-history-empty/);
    assert.doesNotMatch(history, /NORU-1001|12,500|demo confirmation/);
  });

  it("AC-W3-3 derives Dashboard KPIs only from real stays or folio amounts", () => {
    const priced = stay({
      id: "res-1",
      confirmationNumber: "NORU-1",
      arrivalDate: "2026-09-10",
      departureDate: "2026-09-12",
      status: "checked_out",
      roomSubtotal: 240,
    });
    const overview = deriveStayOverview([priced], "2026-09-14", FULL_ACCESS);
    assert.equal(overview.stayCount, 1);
    assert.equal(overview.nightCount, 2);
    assert.equal(overview.roomTotal?.amount, 240);
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    assert.match(dashboard, /guest-dashboard-kpi-stays/);
    assert.match(dashboard, /guest-dashboard-kpi-nights/);
    assert.match(dashboard, /WAVE3_KPI_NOT_AVAILABLE/);
    assert.doesNotMatch(dashboard, /12 stays|\$4,500|12,500/);
    assert.equal(WAVE3_KPI_NOT_AVAILABLE, "Not available");
  });

  it("derives the compact summary's next stay from the earliest real upcoming reservation", () => {
    const later = stay({
      id: "res-later",
      confirmationNumber: "NORU-3",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-03",
      status: "confirmed",
    });
    const next = stay({
      id: "res-next",
      confirmationNumber: "NORU-2",
      arrivalDate: "2026-09-20",
      departureDate: "2026-09-22",
      status: "pending",
    });
    const overview = deriveStayOverview([later, next], "2026-09-14", FULL_ACCESS);
    assert.equal(overview.nextStay?.confirmationNumber, "NORU-2");
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    assert.match(dashboard, /guest-dashboard-kpi-next-stay/);
    assert.match(dashboard, /grid-cols-5 divide-x/);
  });

  it("AC-W3-4 deep-links to existing Reservation / FO / Folio surfaces", () => {
    assert.equal(reservationHref("abc-1"), "/restaurant/pms/reservations/abc-1");
    assert.equal(frontOfficeHref(), "/restaurant/pms/front-office");
    assert.equal(frontOfficeHref("inhouse"), "/restaurant/pms/front-office?tab=inhouse");
    assert.equal(folioHref("F-100"), "/restaurant/pms/cashiering?tab=folios&folio=F-100");
    const actions = readRel("../components/guests/guest-stay-actions.tsx");
    assert.match(actions, /to="\/restaurant\/pms\/reservations\/\$reservationId"/);
    assert.match(actions, /to="\/restaurant\/pms\/front-office"/);
    assert.match(actions, /to="\/restaurant\/pms\/cashiering"/);
    assert.match(actions, /tab: "folios"/);
    assert.doesNotMatch(actions, /guest-folio-page|\/restaurant\/pms\/guests\/.*folio/);
  });

  it("AC-W3-5 keeps Information profile History separate from Stay History", () => {
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    assert.match(detail, /guest-detail-tab-history/);
    assert.match(detail, /WAVE3_PROFILE_HISTORY_COPY/);
    assert.match(detail, /history\.map/);
    assert.equal(
      WAVE3_PROFILE_HISTORY_COPY,
      "Profile activity for this guest. This is not stay history.",
    );
    assert.match(shell, /GuestStayHistoryCard/);
    assert.match(shell, /card === "stay-history"/);
    assert.doesNotMatch(history, /guest_profile_history|eventType|note_added|consent_updated/);
    assert.doesNotMatch(detail, /Stay History/);
  });

  it("scopes Dashboard Overview and Stay History headers to the selected guest's full name", () => {
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.equal(WAVE3_DASHBOARD_CONTEXT, "This guest's overview");
    assert.equal(WAVE3_STAY_HISTORY_CONTEXT, "This guest's stays");
    assert.match(dashboard, /guestName/);
    assert.match(dashboard, /guest-dashboard-guest-name/);
    assert.match(dashboard, /WAVE3_DASHBOARD_CONTEXT/);
    assert.match(history, /guestName/);
    assert.match(history, /guest-stay-history-guest-name/);
    assert.match(history, /WAVE3_STAY_HISTORY_CONTEXT/);
    assert.match(shell, /guestQuery\.data\.guest\.fullName/);
    assert.match(shell, /card === "dashboard"/);
    assert.match(shell, /card === "stay-history"/);
    assert.match(shell, /card === "identity"/);
  });

  it("AC-W3-6 shows stored status and room/type, and Unassigned when room_id is missing", () => {
    const assigned = mapReservationToStay({
      id: "res-a",
      confirmationNumber: "NORU-A",
      arrivalDate: "2026-09-14",
      departureDate: "2026-09-15",
      status: "checked_in",
      roomId: "room-1",
      roomTypeName: "Deluxe",
      roomNumber: "204",
    });
    const unassigned = mapReservationToStay({
      id: "res-b",
      confirmationNumber: "NORU-B",
      arrivalDate: "2026-09-16",
      departureDate: "2026-09-18",
      status: "confirmed",
      roomId: null,
      roomTypeName: "Suite",
      roomNumber: null,
    });
    assert.equal(assigned.status, "checked_in");
    assert.equal(assigned.roomTypeName, "Deluxe");
    assert.equal(stayRoomNumberLabel(assigned), "204");
    assert.equal(stayRoomNumberLabel(unassigned), WAVE3_ROOM_UNASSIGNED);
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    assert.match(history, /ReservationStatusBadge/);
    assert.match(history, /stayRoomNumberLabel/);
    assert.doesNotMatch(history, /Room 101/);
  });

  it("AC-W3-7 counts stays and nights with the same nightsBetween rule as Reservations", () => {
    const twoNights = stay({
      id: "res-1",
      confirmationNumber: "NORU-1",
      arrivalDate: "2026-09-14",
      departureDate: "2026-09-16",
      status: "confirmed",
    });
    assert.equal(twoNights.nights, nightsBetween("2026-09-14", "2026-09-16"));
    assert.equal(twoNights.nights, 2);
    const empty = deriveStayOverview([], "2026-09-14", FULL_ACCESS);
    assert.equal(empty.stayCount, 0);
    assert.equal(empty.nightCount, 0);
    const filled = deriveStayOverview([twoNights], "2026-09-14", FULL_ACCESS);
    assert.equal(filled.stayCount, 1);
    assert.equal(filled.nightCount, 2);
    const functions = readRel("./guests.functions.ts");
    assert.match(functions, /deriveStayOverview/);
    assert.match(readRel("./guest-profile-wave3.ts"), /nightsBetween/);
  });

  it("AC-W3-8 omits amount KPIs unless room_subtotal or folio totals exist — never fake 0.00", () => {
    const unpriced = stay({
      id: "res-1",
      confirmationNumber: "NORU-1",
      arrivalDate: "2026-09-14",
      departureDate: "2026-09-16",
      status: "confirmed",
      roomSubtotal: null,
    });
    const overview = deriveStayOverview([unpriced], "2026-09-14", FULL_ACCESS);
    assert.equal(overview.roomTotal, null);
    assert.equal(overview.folioOutstanding, null);
    assert.equal(knownMoneyTotal([{ amount: null }]), null);
    assert.notEqual(knownMoneyTotal([{ amount: null }])?.amount, 0);
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    assert.match(loyalty, /WAVE3_QUOTED_ROOM_TOTAL_LABEL/);
    assert.match(loyalty, /WAVE3_POSTED_FOLIO_LABEL/);
    assert.equal(WAVE3_QUOTED_ROOM_TOTAL_LABEL, "Quoted room total");
    assert.equal(WAVE3_POSTED_FOLIO_LABEL, "Posted folio balance");
    assert.match(loyalty, /not shown as 0\.00/i);
    assert.doesNotMatch(loyalty, /lifetime spend|true revenue/i);
  });

  it("AC-W3-9 still ships stays/nights when revenue cannot be derived", () => {
    const unpriced = stay({
      id: "res-1",
      confirmationNumber: "NORU-1",
      arrivalDate: "2026-09-14",
      departureDate: "2026-09-17",
      status: "confirmed",
      roomSubtotal: null,
    });
    const overview = deriveStayOverview([unpriced], "2026-09-14", FULL_ACCESS);
    assert.equal(overview.stayCount, 1);
    assert.equal(overview.nightCount, 3);
    assert.equal(overview.roomTotal, null);
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    assert.match(dashboard, /guest-dashboard-kpi-stays/);
    assert.match(dashboard, /guest-dashboard-kpi-nights/);
    assert.match(loyalty, /WAVE3_QUOTED_ROOM_TOTAL_LABEL/);
  });

  it("AC-W3-10 hides or disables quick actions when the target record is missing", () => {
    const emptyActions = stayQuickActions(
      stay({
        id: "res-empty",
        confirmationNumber: "NORU-X",
        arrivalDate: "2026-08-01",
        departureDate: "2026-08-03",
        status: "checked_out",
        folioId: null,
      }),
      FULL_ACCESS,
      "2026-09-14",
    );
    assert.equal(emptyActions.reservation, "enabled");
    assert.equal(emptyActions.frontOffice, "disabled");
    assert.equal(emptyActions.folio, "disabled");
    const noStayOverview = deriveStayOverview([], "2026-09-14", FULL_ACCESS);
    assert.equal(noStayOverview.featuredStay, null);
    assert.equal(noStayOverview.stayCount, 0);
    const hidden = stayQuickActions(
      stay({
        id: "res-1",
        confirmationNumber: "NORU-1",
        arrivalDate: "2026-09-14",
        departureDate: "2026-09-15",
        status: "checked_in",
        folioId: "folio-1",
        folioNumber: "F-1",
      }),
      NO_ACCESS,
      "2026-09-14",
    );
    assert.equal(hidden.reservation, "hidden");
    assert.equal(hidden.frontOffice, "hidden");
    assert.equal(hidden.folio, "hidden");
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    assert.match(dashboard, /stayCount === 0/);
    assert.doesNotMatch(dashboard, /folio opened/);
  });

  it("AC-W3-11 does not invent an open-folio success or create a folio", () => {
    const functions = readRel("./guests.functions.ts");
    const actions = readRel("../components/guests/guest-stay-actions.tsx");
    assert.match(functions, /from\("guest_folios"\)/);
    assert.match(functions, /\.in\(\s*"reservation_id"/);
    assert.doesNotMatch(
      functions,
      /initializeFolio|openFolio|createFolio|insert\(\{[^}]*guest_folios/,
    );
    assert.doesNotMatch(actions, /folio opened|opened a folio|initializeFolio/i);
    const noFolio = stayQuickActions(
      stay({
        id: "res-1",
        confirmationNumber: "NORU-1",
        arrivalDate: "2026-09-14",
        departureDate: "2026-09-15",
        status: "checked_in",
      }),
      FULL_ACCESS,
      "2026-09-14",
    );
    assert.equal(noFolio.folio, "disabled");
  });

  it("AC-W3-12 does not treat profile-history rows as stays", () => {
    const functions = readRel("./guests.functions.ts");
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    const loadStart = functions.indexOf("async function loadGuestStaysForProfile");
    const loadSlice = functions.slice(loadStart, loadStart + 2500);
    assert.match(loadSlice, /hotel_reservations/);
    assert.doesNotMatch(loadSlice, /guest_profile_history/);
    assert.doesNotMatch(history, /guest_profile_history|note_added|consent_updated|merged_from/);
    const withNoStays = deriveStayOverview([], "2026-09-14", FULL_ACCESS);
    assert.equal(withNoStays.stayCount, 0);
  });

  it("AC-W3-13 tenant-scopes stay reads and server-validates restaurantId", () => {
    const functions = readRel("./guests.functions.ts");
    assert.match(functions, /export const listGuestStays/);
    assert.match(functions, /export const getGuestStayOverview/);
    assert.match(functions, /requireGuestManager\(context as never, data\.restaurantId\)/);
    assert.match(functions, /\.eq\("restaurant_id", restaurantId\)/);
    assert.match(functions, /\.eq\("guest_id", guestId\)/);
    assert.doesNotMatch(functions, /trust the browser restaurant id/i);
  });

  it("AC-W3-14 does not add a second stay table or parallel guest master", () => {
    const functions = readRel("./guests.functions.ts");
    const wave3 = readRel("./guest-profile-wave3.ts");
    assert.match(functions, /from\("hotel_reservations"\)/);
    assert.match(functions, /from\("guest_folios"\)/);
    assert.doesNotMatch(functions, /from\("guest_stays"\)|guest_stay_history|guest_masters/);
    assert.doesNotMatch(wave3, /guest_stays|second stay store write/);
    assert.match(wave3, /no second stay store/);
  });

  it("AC-W3-15 does not invent fabricated comms metrics; Wave 5 owns the hub after later waves", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("dashboard")?.live, true);
    assert.equal(byId.get("stay-history")?.live, true);
    assert.equal(byId.get("loyalty")?.live, true);
    assert.equal(byId.get("relationships")?.live, true);
    assert.equal(byId.get("notes-comms")?.wave, 5);
    assert.equal(byId.get("admin-privacy")?.wave, 5);
    assert.doesNotMatch(
      byId.get("loyalty")?.copy ?? "",
      /Coming in Wave 4|12,500|8[05]% occupied|occupancy %/i,
    );
    assert.doesNotMatch(byId.get("notes-comms")?.copy ?? "", /12,500|occupancy %|8[05]% occupied/i);
    assert.deepEqual(
      GUEST_PROFILE_TYPES.filter((type) => type.live).map((type) => type.id),
      ["individual", "company", "group", "travel-agent"],
    );
  });

  it("AC-W3-16 gates new stay/folio reads behind the existing guest-manage surface", () => {
    const functions = readRel("./guests.functions.ts");
    const listBlock = functions.slice(functions.indexOf("export const listGuestStays"));
    assert.match(listBlock, /requireGuestManager/);
    assert.match(functions, /guestStayAccessForRole/);
    assert.match(functions, /CASHIER_ACCESS_ROLES/);
    assert.doesNotMatch(
      functions,
      /createServerFn\(\{ method: "GET" \}\)[\s\S]{0,200}listGuestStays/,
    );
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.doesNotMatch(routes, /public stay history|customer stay list/i);
  });

  it("AC-W3-17 does not invent OTA, gateway, or classic night-audit KPIs", () => {
    const dashboard = readRel("../components/guests/guest-dashboard-card.tsx");
    const history = readRel("../components/guests/guest-stay-history-card.tsx");
    const wave3 = readRel("./guest-profile-wave3.ts");
    for (const source of [dashboard, history, wave3]) {
      assert.doesNotMatch(
        source,
        /channel stay|OTA stay|gateway settlement|nightly NA|room-and-tax|night audit revenue/i,
      );
      assert.doesNotMatch(source, /transfersSupported|lifetime spend/);
    }
  });
});
