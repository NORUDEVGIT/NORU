import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { packageEligibilityMessage } from "@/packages/pms/lib/reservation-detail-packages";
import { reservationError } from "@/packages/pms/lib/reservations.server";

/**
 * Posting trigger: a per-stay package posts when its snapshot row is inserted
 * and an open folio already exists. If the folio is created later, the folio
 * insert posts the still-unposted snapshot. A closed folio rejects the change.
 * There is no night-audit, check-in, or folio-settlement package poster to reuse.
 */
function migrationFile(lane: "drizzle" | "supabase", name: string): string {
  return readFileSync(resolve(process.cwd(), lane, "migrations", name), "utf8");
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

const migration = migrationFile("drizzle", "0177_reservation_package_folio_charge.sql");
const priorPackages = migrationFile("drizzle", "0176_reservation_unit_packages.sql");
const packageServer = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/revenue/commercial-package.server.ts"),
  "utf8",
);

describe("reservation package folio charge", () => {
  it("keeps the migration identical in both lanes and leaves 0176 unchanged", () => {
    expect(migration).toBe(migrationFile("supabase", "0177_reservation_package_folio_charge.sql"));
    expect(priorPackages).not.toContain("post_folio");
    expect(priorPackages).toContain("The package is not posted to the folio here.");
    expect(migration).toContain("room_subtotal is not changed");
    expect(migration).not.toMatch(/room_subtotal\s*=/);
    expect(migration).not.toContain("UPDATE public.hotel_reservations");
    expect(migration).not.toMatch(/open_folio_for_reservation\s*\(/);
    expect(migration).not.toContain("DELETE FROM public.folio_transactions");
    expect(migration).not.toContain("INSERT INTO public.folio_transactions");
    expect(migration).not.toContain("post_folio_charge_with_tax");
    expect(migration).not.toMatch(/SET status = 'open'/);
    expect(packageServer).not.toMatch(/post_folio|posted charge/);
  });

  it("posts one package charge from the snapshot through Cashiering", () => {
    const post = functionBody(migration, "post_reservation_package_charge");
    expect(migration).toContain(
      "A per-stay reservation package is posted when its hotel_reservation_packages",
    );
    expect(migration).toContain("Cashiering tax-on-post applies only to room and manual charges");
    expect(post).toContain("package_row.applied_amount");
    expect(post).toContain("'charge'");
    expect(post).toContain("'package'");
    expect(post).toContain("'reservation_package_charge'");
    expect(post).toContain("package_row.id");
    expect(post).toContain("public.post_folio_transaction");
    expect(post).toContain("COALESCE(package_row.reservation_room_id::text, '')");
    expect(post).not.toContain("hotel_reservation_rooms");
    expect(post).not.toContain("room_subtotal");
    expect(migration).toContain("'package'");
    expect(migration).toContain("folio_transactions_package_charge_once");
    expect(migration).toContain("'pkgchg' || replace(package_row.id::text, '-', '')");
    expect(migration).toContain("reference_type = 'reservation_package_charge'");
    expect(migration).toContain("AFTER INSERT ON public.hotel_reservation_packages");
    expect(migration).not.toContain("AFTER INSERT OR UPDATE ON public.hotel_reservation_packages");
    expect(migration).toContain("AFTER INSERT ON public.guest_folios");
    expect(migration).toContain("folio.status = 'open'");
    expect(migration).toContain("PERFORM public.post_reservation_package_charge(");
    expect(migration).toContain("reservation_package_charge");
    expect(functionBody(migration, "folio_transactions_assign_room_unit")).toContain(
      "reservation_package_charge",
    );
  });

  it("reverses a posted package and deletes an unposted package without a ledger row", () => {
    const reverse = functionBody(migration, "reverse_reservation_package_charge");
    const unpostedReturn = reverse.indexOf("IF NOT FOUND THEN");
    const correction = reverse.indexOf("public.post_folio_charge_correction");
    expect(unpostedReturn).toBeGreaterThanOrEqual(0);
    expect(correction).toBeGreaterThan(unpostedReturn);
    expect(reverse).toContain("'reverse_remaining'");
    expect(reverse).toContain("charge.amount");
    expect(reverse).toContain("'pkgrev' || replace(_package_row_id::text, '-', '')");
    expect(reverse).toContain("charge_reversal");
    expect(reverse).toContain("FOLIO_CLOSED");
    expect(migration).toContain("BEFORE DELETE ON public.hotel_reservation_packages");
    expect(functionBody(migration, "release_hotel_reservation_room_package")).toContain(
      "assert_hotel_reservation_package_mutable",
    );
    expect(migration).toContain("noru.package_actor_membership_id");
    expect(migration).toContain("PACKAGE_CURRENCY_MISMATCH");
    expect(reservationError("FOLIO_CLOSED").message).toBe(
      "This folio is closed. Nothing more can be posted to it.",
    );
    expect(reservationError("CORRECTION_INVOICED").message).toBe(
      "This charge is already on an issued invoice, so it cannot be corrected.",
    );
    expect(reservationError("PACKAGE_CURRENCY_MISMATCH").message).toBe(
      "The reservation currency does not match the guest folio.",
    );
    expect(packageEligibilityMessage("FOLIO_CLOSED")).toBe(
      reservationError("FOLIO_CLOSED").message,
    );
  });
});
