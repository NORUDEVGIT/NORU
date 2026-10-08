/** Issued folio invoice snapshot (frozen at issue time). */

export type FolioInvoiceLine = {
  id: string;
  transactionType: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  paymentMethod: string | null;
  taxSnapshot: Record<string, unknown> | null;
  originalTransactionId: string | null;
};

export type FolioInvoiceSnapshot = {
  version: number;
  issuedAt: string;
  issuerMembershipId: string;
  document: {
    issuedNumber: string;
    sequenceNumber: number;
    prefix: string;
    numberPadding: number;
    taxDisplay: string;
    invoiceFormat: string;
  };
  property: {
    currencyCode: string;
    legalEntityName: string | null;
    legalName: string | null;
    brandName: string | null;
    tradingName: string | null;
    vatNumber: string | null;
    vatRegistered: boolean | null;
  };
  folio: {
    id: string;
    folioNumber: string;
    status: string;
    currency: string;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
    confirmationNumber: string | null;
    arrivalDate: string | null;
    departureDate: string | null;
    reservationStatus: string | null;
  };
  lines: FolioInvoiceLine[];
  totals: {
    charges: number;
    credits: number;
    balance: number;
    tax: number;
  };
};

export type IssuedFolioInvoiceRow = {
  id: string;
  issuedNumber: string;
  sequenceNumber: number;
  issuedAt: string;
  reprintCount: number;
  lastReprintedAt: string | null;
  snapshot: FolioInvoiceSnapshot;
};

export function mapFolioInvoiceSnapshot(raw: unknown): FolioInvoiceSnapshot {
  const row = raw as Record<string, unknown>;
  const document = row.document as Record<string, unknown>;
  const property = row.property as Record<string, unknown>;
  const folio = row.folio as Record<string, unknown>;
  const totals = row.totals as Record<string, unknown>;
  const lines = Array.isArray(row.lines) ? row.lines : [];

  return {
    version: Number(row.version ?? 1),
    issuedAt: String(row.issuedAt ?? ""),
    issuerMembershipId: String(row.issuerMembershipId ?? ""),
    document: {
      issuedNumber: String(document?.issuedNumber ?? ""),
      sequenceNumber: Number(document?.sequenceNumber ?? 0),
      prefix: String(document?.prefix ?? ""),
      numberPadding: Number(document?.numberPadding ?? 6),
      taxDisplay: String(document?.taxDisplay ?? "exclusive"),
      invoiceFormat: String(document?.invoiceFormat ?? "standard"),
    },
    property: {
      currencyCode: String(property?.currencyCode ?? "GBP"),
      legalEntityName: property?.legalEntityName ? String(property.legalEntityName) : null,
      legalName: property?.legalName ? String(property.legalName) : null,
      brandName: property?.brandName ? String(property.brandName) : null,
      tradingName: property?.tradingName ? String(property.tradingName) : null,
      vatNumber: property?.vatNumber ? String(property.vatNumber) : null,
      vatRegistered: property?.vatRegistered === true,
    },
    folio: {
      id: String(folio?.id ?? ""),
      folioNumber: String(folio?.folioNumber ?? ""),
      status: String(folio?.status ?? ""),
      currency: String(folio?.currency ?? ""),
      guestName: String(folio?.guestName ?? ""),
      guestEmail: folio?.guestEmail ? String(folio.guestEmail) : null,
      guestPhone: folio?.guestPhone ? String(folio.guestPhone) : null,
      confirmationNumber: folio?.confirmationNumber ? String(folio.confirmationNumber) : null,
      arrivalDate: folio?.arrivalDate ? String(folio.arrivalDate) : null,
      departureDate: folio?.departureDate ? String(folio.departureDate) : null,
      reservationStatus: folio?.reservationStatus ? String(folio.reservationStatus) : null,
    },
    lines: lines.map((line) => {
      const l = line as Record<string, unknown>;
      return {
        id: String(l.id ?? ""),
        transactionType: String(l.transactionType ?? ""),
        category: String(l.category ?? ""),
        description: String(l.description ?? ""),
        amount: Number(l.amount ?? 0),
        postedAt: String(l.postedAt ?? ""),
        paymentMethod: l.paymentMethod ? String(l.paymentMethod) : null,
        taxSnapshot:
          l.taxSnapshot && typeof l.taxSnapshot === "object"
            ? (l.taxSnapshot as Record<string, unknown>)
            : null,
        originalTransactionId: l.originalTransactionId ? String(l.originalTransactionId) : null,
      };
    }),
    totals: {
      charges: Number(totals?.charges ?? 0),
      credits: Number(totals?.credits ?? 0),
      balance: Number(totals?.balance ?? 0),
      tax: Number(totals?.tax ?? 0),
    },
  };
}

export function invoiceIssuerLabel(property: FolioInvoiceSnapshot["property"]): string {
  return (
    property.legalEntityName?.trim() ||
    property.tradingName?.trim() ||
    property.brandName?.trim() ||
    property.legalName?.trim() ||
    "Property"
  );
}
