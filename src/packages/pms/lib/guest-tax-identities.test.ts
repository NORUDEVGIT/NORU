import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  activeDefaultCount,
  activeTaxIdentities,
  applyDeactivate,
  applyReactivate,
  applySetDefault,
  buildGuestBuyerDetails,
  createGuestTaxIdentityRows,
  defaultFiscalCustomerType,
  duplicateGuestTin,
  guestLegalNamePrefill,
  guestTaxIdentitySelectable,
  normalizeGuestTin,
  type GuestTaxIdentityRow,
} from "./guest-tax-identities.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROPERTY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_GUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function identity(overrides: Partial<GuestTaxIdentityRow> = {}): GuestTaxIdentityRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    restaurantId: PROPERTY,
    guestProfileId: GUEST,
    legalName: "Abebe Kebede",
    tin: "1111111111",
    registrationNumber: null,
    phone: null,
    email: null,
    city: null,
    region: null,
    isDefault: false,
    isActive: true,
    ...overrides,
  };
}

describe("guest tax identities", () => {
  it("allows zero, one, and many identities for one guest", () => {
    assert.equal(activeTaxIdentities([]).length, 0);
    assert.equal(activeTaxIdentities([identity()]).length, 1);
    assert.equal(
      activeTaxIdentities([
        identity(),
        identity({ id: "22222222-2222-4222-8222-222222222222", tin: "2222222222" }),
      ]).length,
      2,
    );
  });

  it("requires a legal name and a TIN", () => {
    const missingName = createGuestTaxIdentityRows([], identity({ legalName: "  " }));
    assert.equal(missingName.ok, false);
    if (missingName.ok) return;
    assert.equal(missingName.code, "TAX_IDENTITY_NAME_REQUIRED");
    const missingTin = createGuestTaxIdentityRows([], identity({ tin: "   " }));
    assert.equal(missingTin.ok, false);
    if (missingTin.ok) return;
    assert.equal(missingTin.code, "TAX_IDENTITY_TIN_REQUIRED");
  });

  it("removes outer and embedded spaces from a TIN", () => {
    assert.equal(normalizeGuestTin("  123 456 7890 "), "1234567890");
  });

  it("rejects a duplicate normalized TIN for the same guest, including an active row", () => {
    const rows = [identity({ tin: "1234567890" })];
    assert.equal(duplicateGuestTin(rows, GUEST, " 123 456 7890 "), true);
    const created = createGuestTaxIdentityRows(rows, identity({ id: "new", tin: "123 456 7890" }));
    assert.equal(created.ok, false);
  });

  it("allows the same TIN on a different guest", () => {
    const rows = [identity()];
    assert.equal(duplicateGuestTin(rows, OTHER_GUEST, "1111111111"), false);
    const created = createGuestTaxIdentityRows(
      rows,
      identity({
        id: "22222222-2222-4222-8222-222222222222",
        guestProfileId: OTHER_GUEST,
        tin: "1111111111",
      }),
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.rows.length, 2);
  });

  it("keeps at most one active default and clears the previous default", () => {
    const first = identity({ id: "a", isDefault: true });
    const second = identity({ id: "b", tin: "2222222222" });
    assert.equal(activeDefaultCount([first, second], GUEST), 1);
    const next = applySetDefault([first, second], "b");
    assert.equal(next.find((row) => row.id === "a")?.isDefault, false);
    assert.equal(next.find((row) => row.id === "b")?.isDefault, true);
    assert.equal(activeDefaultCount(next, GUEST), 1);
  });

  it("does not choose B2B because a default identity exists", () => {
    const saved = [identity({ isDefault: true, tin: "1111111111" })];
    assert.equal(defaultFiscalCustomerType(saved), "B2C");
  });

  it("hides a deactivated identity from selection and clears its default without deleting it", () => {
    const rows = applyDeactivate([identity({ isDefault: true })], identity().id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.isActive, false);
    assert.equal(rows[0]?.isDefault, false);
    assert.equal(activeTaxIdentities(rows).length, 0);
    assert.equal(
      guestTaxIdentitySelectable(rows[0] ?? null, {
        restaurantId: PROPERTY,
        guestProfileId: GUEST,
      }),
      false,
    );
  });

  it("reactivates an inactive identity without making it the default", () => {
    const inactive = applyDeactivate([identity({ isDefault: true })], identity().id);
    const restored = applyReactivate(inactive, identity().id);
    assert.equal(restored[0]?.isActive, true);
    assert.equal(restored[0]?.isDefault, false);
    const reused = createGuestTaxIdentityRows(
      inactive,
      identity({ id: "new-id", legalName: "Abebe Trading" }),
    );
    assert.equal(reused.ok, true);
    if (!reused.ok) return;
    assert.equal(reused.rows.length, 1);
    assert.equal(reused.id, identity().id);
    assert.equal(reused.rows[0]?.isActive, true);
    assert.equal(reused.rows[0]?.legalName, "Abebe Trading");
  });

  it("rejects an identity from another guest or property", () => {
    const row = identity();
    assert.equal(
      guestTaxIdentitySelectable(row, { restaurantId: PROPERTY, guestProfileId: OTHER_GUEST }),
      false,
    );
    assert.equal(
      guestTaxIdentitySelectable(row, { restaurantId: OTHER_PROPERTY, guestProfileId: GUEST }),
      false,
    );
    assert.equal(
      guestTaxIdentitySelectable(row, { restaurantId: PROPERTY, guestProfileId: GUEST }),
      true,
    );
  });

  it("prefills the legal name from first, middle, and last and ignores the preferred name", () => {
    assert.equal(
      guestLegalNamePrefill({
        firstName: "Abebe",
        middleName: " ",
        lastName: "Kebede",
      }),
      "Abebe Kebede",
    );
    assert.equal(
      guestLegalNamePrefill({
        firstName: "Abebe",
        middleName: null,
        lastName: "Kebede",
      }),
      "Abebe Kebede",
    );
  });

  it("stores the migration once in both lanes and keeps TIN uniqueness per guest", () => {
    const drizzle = readFileSync(
      new URL("../../../../drizzle/migrations/0157_guest_tax_identities.sql", import.meta.url),
      "utf8",
    );
    const supabase = readFileSync(
      new URL("../../../../supabase/migrations/0157_guest_tax_identities.sql", import.meta.url),
      "utf8",
    );
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /CREATE TABLE public\.guest_tax_identities/);
    assert.match(drizzle, /guest_tax_identities_guest_tin_unique/);
    assert.equal(drizzle.includes("WHERE is_active"), false);
    assert.match(drizzle, /guest_tax_identities_one_active_default/);
    assert.match(drizzle, /WHERE is_default AND is_active/);
    assert.match(drizzle, /NOT is_default OR is_active/);
    assert.match(drizzle, /FOR UPDATE/);
    assert.match(drizzle, /replace\(btrim\(COALESCE\(_tin, ''\)\), ' ', ''\)/);
    assert.match(drizzle, /guest_profiles \(id, restaurant_id\)/);
    assert.match(drizzle, /TAX_IDENTITY_TIN_REUSED/);
    assert.match(drizzle, /is_active = false, is_default = false/);
    assert.equal(drizzle.includes("guest_profiles.tax_id"), false);
    assert.equal(drizzle.includes("DELETE FROM public.guest_tax_identities"), false);
    assert.equal(drizzle.includes("zone"), false);
    assert.match(drizzle, /ARRAY\['owner', 'manager', 'receptionist'\]/);
    const functions = readFileSync(
      new URL("./guest-tax-identities.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(functions, /requireGuestManager/);
    assert.equal(functions.includes("folio_transactions"), false);
    assert.equal(functions.includes("financial_accounts"), false);
    const roles = readFileSync(new URL("./guests.server.ts", import.meta.url), "utf8");
    assert.match(roles, /GUEST_MANAGE_ROLES = \["owner", "manager", "receptionist"\]/);
  });
});

describe("guest buyer details", () => {
  it("maps a saved identity and turns blanks into null", () => {
    const buyer = buildGuestBuyerDetails({
      legalName: " Abebe Trading ",
      tin: " 222 222 2222 ",
      registrationNumber: " ",
      phone: "",
      email: "abebe@example.com",
      city: "Addis Ababa",
      region: "Addis Ababa",
    });
    assert.deepEqual(buyer, {
      LegalName: "Abebe Trading",
      Tin: "2222222222",
      VatNumber: null,
      Phone: null,
      Email: "abebe@example.com",
      City: "Addis Ababa",
      Region: null,
      Zone: null,
      Wereda: null,
      Kebele: null,
      HouseNumber: null,
      IdType: "KID",
      IdNumber: null,
    });
    assert.equal(
      buildGuestBuyerDetails({
        legalName: "Abebe Trading",
        tin: "111",
        registrationNumber: null,
        phone: null,
        email: null,
        city: "Addis Ababa",
        region: "1",
      })?.Region,
      "1",
    );
    assert.equal(
      buildGuestBuyerDetails({
        legalName: "Abebe Trading",
        tin: "111",
        registrationNumber: null,
        phone: null,
        email: null,
        city: "Addis Ababa",
        region: "Oromia",
      })?.Region,
      null,
    );
  });
});
