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
  chargeSource?: string | null;
  quantity?: number | null;
  unitAmount?: number | null;
  chargeSnapshot?: Record<string, unknown> | null;
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
    notes: string | null;
  };
  property: {
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
    roomNumber: string | null;
  };
  lines: FolioInvoiceLine[];
  totals: {
    charges: number;
    credits: number;
    balance: number;
    tax: number;
    subtotal: number | null;
    serviceCharge: number | null;
    invoiceTotal: number | null;
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
      notes: document?.notes ? String(document.notes) : null,
    },
    property: {
      currencyCode: String(property?.currencyCode ?? "GBP"),
      legalEntityName: property?.legalEntityName ? String(property.legalEntityName) : null,
      legalName: property?.legalName ? String(property.legalName) : null,
      brandName: property?.brandName ? String(property.brandName) : null,
      tradingName: property?.tradingName ? String(property.tradingName) : null,
      vatNumber: property?.vatNumber ? String(property.vatNumber) : null,
      vatRegistered: property?.vatRegistered === true,
      tinNumber: property?.tinNumber ? String(property.tinNumber) : null,
      fullAddress: property?.fullAddress ? String(property.fullAddress) : null,
      phone: property?.phone ? String(property.phone) : null,
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
      roomNumber: folio?.roomNumber ? String(folio.roomNumber) : null,
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
        chargeSource: l.chargeSource ? String(l.chargeSource) : null,
        quantity: l.quantity == null || l.quantity === "" ? null : Number(l.quantity),
        unitAmount: l.unitAmount == null || l.unitAmount === "" ? null : Number(l.unitAmount),
        chargeSnapshot:
          l.chargeSnapshot && typeof l.chargeSnapshot === "object"
            ? (l.chargeSnapshot as Record<string, unknown>)
            : null,
      };
    }),
    totals: {
      charges: Number(totals?.charges ?? 0),
      credits: Number(totals?.credits ?? 0),
      balance: Number(totals?.balance ?? 0),
      tax: Number(totals?.tax ?? 0),
      subtotal: totals?.subtotal == null || totals.subtotal === "" ? null : Number(totals.subtotal),
      serviceCharge:
        totals?.serviceCharge == null || totals.serviceCharge === ""
          ? null
          : Number(totals.serviceCharge),
      invoiceTotal:
        totals?.invoiceTotal == null || totals.invoiceTotal === ""
          ? null
          : Number(totals.invoiceTotal),
    },
  };
}

export type InvoiceComponentLine = {
  id: string;
  description: string;
  amount: number;
  name: string;
  code: string | null;
  basis: string | null;
  calculation: string | null;
};

export type InvoiceGroupView = {
  parentTransactionId: string;
  postedAt: string;
  description: string;
  category: string;
  departmentName: string | null;
  chargeSource: string | null;
  quantity: number | null;
  unitAmount: number | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grossTotal: number;
  invoiceState: "uninvoiced" | "invoiced" | "in_draft";
  coveredInvoiceId: string | null;
  coveredInvoiceNumber: string | null;
  taxLines: InvoiceComponentLine[];
  serviceLines: InvoiceComponentLine[];
};

export type InvoiceSelectionPreview = {
  groups: InvoiceGroupView[];
  warnings: Array<{ parentTransactionId: string; code: string }>;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  legacyFolio: boolean;
};

export type InvoiceDraftRow = {
  id: string;
  notes: string | null;
  updatedAt: string;
  createdByMembershipId: string;
  selectedIds: string[];
  preparedBy: string | null;
};

export type InvoiceBoard = {
  legacyFolio: boolean;
  invoiceableAmount: number;
  groups: InvoiceGroupView[];
  draft: InvoiceDraftRow | null;
};

export function invoiceIssuerLabel(property: FolioInvoiceSnapshot["property"]): string {
  return (
    property.legalEntityName?.trim() ||
    property.tradingName?.trim() ||
    property.brandName?.trim() ||
    property.legalName?.trim() ||
    "Property"
  );
}
