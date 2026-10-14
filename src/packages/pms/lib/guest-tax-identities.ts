/**
 * Reusable fiscal tax identities for an individual guest.
 *
 * A saved identity is a buyer snapshot the operator can choose when registering
 * a guest invoice as B2B. It does not create a company, an account, or a
 * company invoice. The fiscal customer type stays B2C until the operator
 * chooses B2B. A default identity only preselects that choice afterwards.
 */

import { normalizeFiscalRegion } from "./fiscal/fiscal-region.ts";

export const GUEST_FISCAL_ID_TYPE = "KID" as const;

export type GuestFiscalCustomerType = "B2C" | "B2B";

export type GuestTaxBuyerDetails = {
  LegalName: string;
  Tin: string;
  VatNumber: string | null;
  Phone: string | null;
  Email: string | null;
  City: string | null;
  Region: string | null;
  Zone: null;
  Wereda: null;
  Kebele: null;
  HouseNumber: null;
  IdType: typeof GUEST_FISCAL_ID_TYPE;
  IdNumber: null;
};

export type GuestTaxIdentityFields = {
  legalName: string;
  tin: string;
  registrationNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
};

export type GuestTaxIdentityRow = GuestTaxIdentityFields & {
  id: string;
  restaurantId: string;
  guestProfileId: string;
  isDefault: boolean;
  isActive: boolean;
};

export function defaultFiscalCustomerType(
  _identities: ReadonlyArray<unknown> = [],
): GuestFiscalCustomerType {
  return "B2C";
}

/** Trim the ends and remove embedded spaces. No other TIN transformation. */
export function normalizeGuestTin(value: string): string {
  return value.trim().replaceAll(" ", "");
}

export function guestLegalNamePrefill(guest: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [guest.firstName, guest.middleName, guest.lastName]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function blankTaxIdentityText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildGuestBuyerDetails(
  identity: GuestTaxIdentityFields,
): GuestTaxBuyerDetails | null {
  const legalName = identity.legalName.trim();
  const tin = normalizeGuestTin(identity.tin);
  if (legalName.length === 0 || tin.length === 0) return null;
  return {
    LegalName: legalName,
    Tin: tin,
    VatNumber: blankTaxIdentityText(identity.registrationNumber),
    Phone: blankTaxIdentityText(identity.phone),
    Email: blankTaxIdentityText(identity.email),
    City: blankTaxIdentityText(identity.city),
    Region: normalizeFiscalRegion(identity.region),
    Zone: null,
    Wereda: null,
    Kebele: null,
    HouseNumber: null,
    IdType: GUEST_FISCAL_ID_TYPE,
    IdNumber: null,
  };
}

export function guestTaxIdentitySelectable(
  identity: Pick<
    GuestTaxIdentityRow,
    "restaurantId" | "guestProfileId" | "isActive" | "legalName" | "tin"
  > | null,
  expected: { restaurantId: string; guestProfileId: string },
): boolean {
  if (!identity || !identity.isActive) return false;
  if (identity.restaurantId !== expected.restaurantId) return false;
  if (identity.guestProfileId !== expected.guestProfileId) return false;
  return buildGuestBuyerDetails(identity) != null;
}

export function activeTaxIdentities<T extends { isActive: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.isActive);
}

export function duplicateGuestTin(
  rows: readonly Pick<GuestTaxIdentityRow, "id" | "guestProfileId" | "tin">[],
  guestProfileId: string,
  tin: string,
  exceptId?: string,
): boolean {
  const normalized = normalizeGuestTin(tin);
  if (normalized.length === 0) return false;
  return rows.some(
    (row) =>
      row.guestProfileId === guestProfileId &&
      row.id !== exceptId &&
      normalizeGuestTin(row.tin) === normalized,
  );
}

/** Reactivate the inactive row with the same TIN instead of inserting another. */
export function createGuestTaxIdentityRows(
  rows: readonly GuestTaxIdentityRow[],
  input: GuestTaxIdentityRow,
):
  | { ok: true; rows: GuestTaxIdentityRow[]; id: string }
  | {
      ok: false;
      code: "TAX_IDENTITY_TIN_REUSED" | "TAX_IDENTITY_NAME_REQUIRED" | "TAX_IDENTITY_TIN_REQUIRED";
    } {
  const legalName = input.legalName.trim();
  const tin = normalizeGuestTin(input.tin);
  if (legalName.length === 0) return { ok: false, code: "TAX_IDENTITY_NAME_REQUIRED" };
  if (tin.length === 0) return { ok: false, code: "TAX_IDENTITY_TIN_REQUIRED" };
  const existing = rows.find(
    (row) => row.guestProfileId === input.guestProfileId && normalizeGuestTin(row.tin) === tin,
  );
  if (existing?.isActive) return { ok: false, code: "TAX_IDENTITY_TIN_REUSED" };
  const id = existing?.id ?? input.id;
  const created: GuestTaxIdentityRow = {
    ...input,
    id,
    legalName,
    tin,
    registrationNumber: blankTaxIdentityText(input.registrationNumber),
    phone: blankTaxIdentityText(input.phone),
    email: blankTaxIdentityText(input.email),
    city: blankTaxIdentityText(input.city),
    region: blankTaxIdentityText(input.region),
    isActive: true,
    isDefault: false,
  };
  const next = [...rows.filter((row) => row.id !== id), created];
  return {
    ok: true,
    id,
    rows: input.isDefault ? applySetDefault(next, id) : next,
  };
}

export function applySetDefault(
  rows: readonly GuestTaxIdentityRow[],
  identityId: string,
): GuestTaxIdentityRow[] {
  const target = rows.find((row) => row.id === identityId);
  if (!target?.isActive) return rows.map((row) => ({ ...row }));
  return rows.map((row) =>
    row.guestProfileId === target.guestProfileId
      ? { ...row, isDefault: row.id === identityId }
      : { ...row },
  );
}

export function applyDeactivate(
  rows: readonly GuestTaxIdentityRow[],
  identityId: string,
): GuestTaxIdentityRow[] {
  return rows.map((row) =>
    row.id === identityId ? { ...row, isActive: false, isDefault: false } : { ...row },
  );
}

export function applyReactivate(
  rows: readonly GuestTaxIdentityRow[],
  identityId: string,
): GuestTaxIdentityRow[] {
  return rows.map((row) => (row.id === identityId ? { ...row, isActive: true } : { ...row }));
}

export function activeDefaultCount(
  rows: readonly Pick<GuestTaxIdentityRow, "guestProfileId" | "isDefault" | "isActive">[],
  guestProfileId: string,
): number {
  return rows.filter(
    (row) => row.guestProfileId === guestProfileId && row.isActive && row.isDefault,
  ).length;
}
