/** Property block for cashiering print documents (invoices, credit/debit notes). */

export type CashieringDocumentProperty = {
  currencyCode: string;
  legalEntityName: string | null;
  legalName: string | null;
  brandName: string | null;
  tradingName: string | null;
  vatNumber: string | null;
  vatRegistered: boolean | null;
  tinNumber: string | null;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  displayName: string | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function mapCashieringDocumentProperty(raw: unknown): CashieringDocumentProperty | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const currency = text(row.currencyCode) ?? "GBP";
  const legalEntityName = text(row.legalEntityName);
  const legalName = text(row.legalName);
  const brandName = text(row.brandName);
  const tradingName = text(row.tradingName);
  const displayName =
    text(row.displayName) ??
    legalEntityName ??
    tradingName ??
    brandName ??
    legalName ??
    null;
  return {
    currencyCode: currency,
    legalEntityName,
    legalName,
    brandName,
    tradingName,
    vatNumber: text(row.vatNumber),
    vatRegistered: row.vatRegistered === true ? true : row.vatRegistered === false ? false : null,
    tinNumber: text(row.tinNumber),
    fullAddress: text(row.fullAddress),
    phone: text(row.phone),
    email: text(row.email),
    logoUrl: text(row.logoUrl),
    displayName,
  };
}

/** Prefer frozen snapshot values; fill gaps from live property (logo, address, etc.). */
export function mergeCashieringDocumentProperty(
  snapshot: unknown,
  live: CashieringDocumentProperty | null,
): CashieringDocumentProperty | null {
  const base = mapCashieringDocumentProperty(snapshot);
  if (!live) return base;
  if (!base) return live;
  return {
    currencyCode: base.currencyCode || live.currencyCode,
    legalEntityName: base.legalEntityName ?? live.legalEntityName,
    legalName: base.legalName ?? live.legalName,
    brandName: base.brandName ?? live.brandName,
    tradingName: base.tradingName ?? live.tradingName,
    vatNumber: base.vatNumber ?? live.vatNumber,
    vatRegistered: base.vatRegistered ?? live.vatRegistered,
    tinNumber: base.tinNumber ?? live.tinNumber,
    fullAddress: base.fullAddress ?? live.fullAddress,
    phone: base.phone ?? live.phone,
    email: base.email ?? live.email,
    logoUrl: base.logoUrl ?? live.logoUrl,
    displayName: base.displayName ?? live.displayName,
  };
}

export function cashieringPropertyHotelName(property: CashieringDocumentProperty | null): string {
  if (!property) return "Property";
  return (
    property.displayName?.trim() ||
    property.tradingName?.trim() ||
    property.brandName?.trim() ||
    property.legalEntityName?.trim() ||
    property.legalName?.trim() ||
    "Property"
  );
}
