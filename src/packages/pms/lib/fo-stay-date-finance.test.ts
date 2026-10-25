import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  authoritativeRoomChargeDelta,
  earlyDeparturePolicyLine,
  extensionSummary,
  stayDateChangeKind,
  stayDateConfirmationTitle,
  stayDateFolioImpact,
  stayNightLabel,
  stayNights,
} from "./fo-stay-date-finance";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const sql = readRel("../../../../drizzle/migrations/0182_inhouse_stay_date_finance.sql");
const supabase = readRel("../../../../supabase/migrations/0182_inhouse_stay_date_finance.sql");
const writer = readRel("./frontoffice.functions.ts");
const sheet = readRel("../components/frontoffice/fo-rack-confirm-sheet.tsx");

describe("in-house stay-date kind", () => {
  it("treats extra nights as an extension", () => {
    assert.equal(stayNights("2026-10-22", "2026-10-24"), 2);
    assert.equal(
      stayDateChangeKind("2026-10-22", "2026-10-24", "2026-10-22", "2026-10-26"),
      "extend",
    );
    assert.equal(stayNightLabel(1), "1 night");
    assert.equal(stayNightLabel(2), "2 nights");
    assert.equal(extensionSummary(1, 2), "Extension: +1 night");
    assert.equal(extensionSummary(1, 4), "Extension: +3 nights");
    assert.equal(authoritativeRoomChargeDelta(1500, 3000), 1500);
    assert.equal(authoritativeRoomChargeDelta(Number.NaN, 3000), null);
  });

  it("treats fewer nights as an early departure", () => {
    assert.equal(
      stayDateChangeKind("2026-10-22", "2026-10-26", "2026-10-22", "2026-10-24"),
      "early_departure",
    );
    assert.equal(stayDateConfirmationTitle("early_departure"), "Early Departure");
  });

  it("treats a same-length shift as a date change", () => {
    assert.equal(
      stayDateChangeKind("2026-10-22", "2026-10-24", "2026-10-23", "2026-10-25"),
      "dates_changed",
    );
  });
});

describe("posted charge and early-departure penalty", () => {
  it("does not post a penalty when none is configured", () => {
    const lines = stayDateFolioImpact("early_departure", "none");
    assert.match(lines.join(" "), /No early-departure penalty is configured/);
    assert.equal(earlyDeparturePolicyLine({ penalty_type: "none" }).includes("not post"), false);
    assert.match(earlyDeparturePolicyLine(null), /No early-departure penalty is configured/);
  });

  it("records a configured penalty without posting it as a folio charge", () => {
    const line = earlyDeparturePolicyLine({
      name: "Flexible departure",
      penalty_type: "first_night",
    });
    assert.match(line, /Flexible departure/);
    assert.match(line, /does not post that penalty/);
    const lines = stayDateFolioImpact("early_departure", "first_night");
    assert.match(lines.join(" "), /not posted as its own folio charge/);
    assert.match(lines.join(" "), /Deposit money is not refunded/);
    assert.match(lines.join(" "), /reversed and the new room amount is posted/);
  });

  it("does not calculate the room price locally", () => {
    const model = readRel("./fo-stay-date-finance.ts");
    assert.doesNotMatch(model, /nightly|subtotal \*|tax/);
  });
});

describe("FO-03 writer", () => {
  it("keeps both migration lanes identical", () => {
    assert.equal(sql, supabase);
  });

  it("writes dates, reprices, and reconciles in one function", () => {
    const apply = sql.slice(sql.indexOf("FUNCTION public.apply_inhouse_stay_date_change"));
    assert.match(apply, /change_hotel_stay_dates/);
    assert.match(apply, /reprice_hotel_reservation_room/);
    assert.match(apply, /reconcile_reservation_unit_room_charge/);
    assert.match(apply, /assert_reservation_unit_room_charge_reconcilable/);
    assert.match(apply, /UNIT_DATES_DIVERGED/);
    assert.match(apply, /early_departure_penalty_posted', false/);
    assert.doesNotMatch(apply, /INSERT INTO public\.folio_transactions/);
    assert.match(sql, /Does not reprice/);
    assert.match(sql, /hotel_reservation_rooms/);
  });

  it("calls the orchestrator from changeStayDates and quotes through price_hotel_stay", () => {
    const change = writer.slice(
      writer.indexOf("export const changeStayDates"),
      writer.indexOf("export const markNoShow"),
    );
    assert.match(change, /apply_inhouse_stay_date_change/);
    assert.match(change, /_arrival: arrival/);
    assert.doesNotMatch(change, /folio_transactions|price_hotel_stay/);
    const quote = writer.slice(writer.indexOf("export const quoteInHouseStayChange"));
    assert.match(quote, /price_hotel_stay/);
    assert.match(quote, /penaltyPosted: false/);
  });

  it("shows separate Extend and Early Departure confirmations", () => {
    assert.match(sheet, /stayDateConfirmationTitle/);
    assert.match(sheet, /fo-stay-date-finance/);
    assert.match(sheet, /quoteInHouseStayChange/);
    assert.match(sheet, /fo-stay-date-policy/);
    assert.match(sheet, /Confirm Extension/);
    assert.match(sheet, /Current room total/);
    assert.match(sheet, /Could not calculate the updated room price/);
    assert.doesNotMatch(sheet, /Rate impact unavailable/);
    assert.doesNotMatch(sheet, /Deposit money is not refunded/);
    assert.doesNotMatch(sheet, /amend_hotel_reservation_priced/);
  });
});
