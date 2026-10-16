import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  guestFolioSearchInputSchema,
  searchAllAccounts,
  searchGuestFolios,
} from "./folio-search.server.ts";
import {
  FOLIO_SEARCH_SORT_OPTIONS,
  paymentStateLabel,
  resolveStayStatusesForQuery,
  validateFolioStayDateRange,
} from "./folio-search-filters.ts";

describe("Guest folio search", () => {
  it("exports server search functions wired to folio search RPCs", () => {
    const source = readFileSync(new URL("./folio-search.server.ts", import.meta.url), "utf8");
    assert.match(source, /search_guest_folios/);
    assert.match(source, /search_all_accounts/);
    assert.match(source, /export const searchGuestFolios/);
    assert.match(source, /export const searchAllAccounts/);
  });

  it("validates stay overlap date pairs", () => {
    assert.equal(validateFolioStayDateRange("", ""), null);
    assert.match(validateFolioStayDateRange("2026-10-01", "") ?? "", /both a start and end/);
    assert.match(
      validateFolioStayDateRange("2026-10-10", "2026-10-01") ?? "",
      /on or after/,
    );
  });

  it("maps stay status filters to reservation statuses", () => {
    assert.deepEqual(resolveStayStatusesForQuery("checked_in"), ["checked_in"]);
    assert.equal(resolveStayStatusesForQuery("all"), null);
  });

  it("labels payment states for the toolbar", () => {
    assert.equal(paymentStateLabel("partially_paid"), "Partially Paid");
    assert.equal(paymentStateLabel("credit_balance"), "Credit Balance");
  });

  it("accepts server pagination and sort input", () => {
    const parsed = guestFolioSearchInputSchema.parse({
      restaurantId: "00000000-0000-4000-8000-000000000001",
      page: 2,
      pageSize: 25,
      sortBy: "balance",
      sortDirection: "desc",
      paymentState: "outstanding",
      stayFrom: "2026-10-01",
      stayTo: "2026-10-31",
    });
    assert.equal(parsed.page, 2);
    assert.equal(parsed.pageSize, 25);
    assert.equal(parsed.sortBy, "balance");
  });

  it("ships folio search migrations with guest and unified all-account RPCs", () => {
    const guestSql = readFileSync(
      new URL("../../../../drizzle/migrations/0132_folio_search_guest_folios.sql", import.meta.url),
      "utf8",
    );
    const allSql = readFileSync(
      new URL("../../../../drizzle/migrations/0133_folio_search_all_accounts.sql", import.meta.url),
      "utf8",
    );
    assert.match(guestSql, /search_guest_folios/);
    assert.match(guestSql, /guest_folios_opened_idx/);
    assert.match(allSql, /search_all_accounts/);
    assert.match(allSql, /financial_accounts/);
  });

  it("exposes sort options used by the folio search toolbar", () => {
    assert.ok(FOLIO_SEARCH_SORT_OPTIONS.some((option) => option.id === "arrival_date_desc"));
    assert.ok(FOLIO_SEARCH_SORT_OPTIONS.some((option) => option.id === "opened_at_desc"));
  });

  it("searchGuestFolios and searchAllAccounts are POST server functions", () => {
    assert.equal(typeof searchGuestFolios, "function");
    assert.equal(typeof searchAllAccounts, "function");
  });
});
