export type AccountInvoiceKind = "company" | "group";

export type AccountInvoiceComponent = {
  id: string;
  kind: "parent" | "tax" | "service_charge";
  amount: number;
  description: string;
};

export type AccountInvoiceGroup = {
  sourceGroupId: string;
  origin: "direct" | "transferred";
  postedAt: string | null;
  description: string;
  departmentName: string | null;
  quantity: number | null;
  unitAmount: number | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grossTotal: number;
  sourceGuest: string | null;
  sourceFolioNumber: string | null;
  sourceRoomNumber: string | null;
  sourceConfirmation: string | null;
  invoiceState: "uninvoiced" | "in_draft" | "invoiced";
  coveredInvoiceId: string | null;
  coveredInvoiceNumber: string | null;
  ledgerIds: string[];
  components: AccountInvoiceComponent[];
};

export type AccountBillTo = {
  name: string;
  code: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  creditDays: number | null;
  address: string | null;
};

export type AccountInvoiceSnapshot = {
  version: number;
  target: "financial_account";
  issuedAt: string;
  issuerMembershipId: string | null;
  document: {
    issuedNumber: string;
    sequenceNumber: number | null;
    notes: string | null;
    issuedByName: string | null;
  };
  property: {
    currencyCode: string;
    legalEntityName: string | null;
    legalName: string | null;
    brandName: string | null;
    tradingName: string | null;
    vatNumber: string | null;
    tinNumber: string | null;
    fullAddress: string | null;
    phone: string | null;
  };
  account: {
    id: string;
    accountNumber: string;
    accountKind: AccountInvoiceKind;
    currency: string;
  };
  billTo: AccountBillTo;
  lines: Array<{
    id: string;
    kind: string;
    description: string;
    amount: number;
    sourceGuest: string | null;
    sourceFolioNumber: string | null;
    sourceRoomNumber: string | null;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    serviceCharge: number;
    invoiceTotal: number;
  };
};

export type IssuedAccountInvoice = {
  id: string;
  issuedNumber: string;
  sequenceNumber: number;
  issuedAt: string;
  reprintCount: number;
  lastReprintedAt: string | null;
  snapshot: AccountInvoiceSnapshot;
};

export type AccountInvoiceBoard = {
  account: {
    id: string;
    accountNumber: string;
    accountKind: AccountInvoiceKind;
    status: "open" | "closed";
    currency: string;
    balance: number;
    creditLimitAmount: number | null;
  };
  billTo: AccountBillTo;
  invoiceableAmount: number;
  groups: AccountInvoiceGroup[];
  draft: {
    id: string;
    notes: string | null;
    updatedAt: string;
    selectedIds: string[];
  } | null;
};

export type AccountOwnedRow = {
  kind: "parent" | "tax" | "service_charge";
  amount: number;
  movedOut: number;
  covered: boolean;
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function roundAccountMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Uncovered account-owned shares. A partial transfer invoices the transfer_in amount, not the guest gross. */
export function ownedAccountGroup(rows: readonly AccountOwnedRow[]): {
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
} {
  let subtotal = 0;
  let tax = 0;
  let serviceCharge = 0;
  for (const row of rows) {
    if (row.covered) continue;
    const owned = roundAccountMoney(Math.max(row.amount - row.movedOut, 0));
    if (owned <= 0.009) continue;
    if (row.kind === "parent") subtotal += owned;
    else if (row.kind === "tax") tax += owned;
    else serviceCharge += owned;
  }
  subtotal = roundAccountMoney(subtotal);
  tax = roundAccountMoney(tax);
  serviceCharge = roundAccountMoney(serviceCharge);
  return {
    subtotal,
    tax,
    serviceCharge,
    total: roundAccountMoney(subtotal + tax + serviceCharge),
  };
}

export function mapAccountBillTo(value: unknown, kind: AccountInvoiceKind): AccountBillTo {
  const row = (value ?? {}) as Record<string, unknown>;
  const company = kind === "company";
  return {
    name: text(row.name) ?? "Account",
    code: text(row.code),
    taxId: company ? text(row.taxId) : null,
    phone: text(row.phone),
    email: text(row.email),
    paymentTerms: company ? text(row.paymentTerms) : null,
    creditDays:
      company && row.creditDays != null && row.creditDays !== "" ? num(row.creditDays) : null,
    address: company ? text(row.address) : null,
  };
}

export function mapAccountInvoiceGroup(value: unknown): AccountInvoiceGroup {
  const row = (value ?? {}) as Record<string, unknown>;
  const components = Array.isArray(row.components)
    ? row.components.map((item) => {
        const component = item as Record<string, unknown>;
        const kind =
          component.kind === "tax" || component.kind === "service_charge"
            ? component.kind
            : "parent";
        return {
          id: String(component.id ?? ""),
          kind,
          amount: num(component.amount),
          description: text(component.description) ?? "Charge",
        } as AccountInvoiceComponent;
      })
    : [];
  const ledgerIds = Array.isArray(row.ledgerIds)
    ? row.ledgerIds.map((id) => String(id))
    : components.map((component) => component.id);
  return {
    sourceGroupId: String(row.sourceGroupId ?? ""),
    origin: row.origin === "direct" ? "direct" : "transferred",
    postedAt: text(row.postedAt),
    description: text(row.description) ?? "Charge",
    departmentName: text(row.departmentName),
    quantity: row.quantity == null || row.quantity === "" ? null : num(row.quantity),
    unitAmount: row.unitAmount == null || row.unitAmount === "" ? null : num(row.unitAmount),
    subtotal: num(row.subtotal),
    taxTotal: num(row.taxTotal),
    serviceChargeTotal: num(row.serviceChargeTotal),
    grossTotal: num(row.grossTotal),
    sourceGuest: text(row.sourceGuest),
    sourceFolioNumber: text(row.sourceFolioNumber),
    sourceRoomNumber: text(row.sourceRoomNumber),
    sourceConfirmation: text(row.sourceConfirmation),
    invoiceState:
      row.invoiceState === "invoiced" || row.invoiceState === "in_draft"
        ? row.invoiceState
        : "uninvoiced",
    coveredInvoiceId: text(row.coveredInvoiceId),
    coveredInvoiceNumber: text(row.coveredInvoiceNumber),
    ledgerIds,
    components,
  };
}

export function mapAccountInvoiceSnapshot(value: unknown): AccountInvoiceSnapshot {
  const row = (value ?? {}) as Record<string, unknown>;
  const document = (row.document ?? {}) as Record<string, unknown>;
  const property = (row.property ?? {}) as Record<string, unknown>;
  const account = (row.account ?? {}) as Record<string, unknown>;
  const totals = (row.totals ?? {}) as Record<string, unknown>;
  const kind: AccountInvoiceKind = account.accountKind === "group" ? "group" : "company";
  const lines = Array.isArray(row.lines)
    ? row.lines.map((item) => {
        const line = item as Record<string, unknown>;
        return {
          id: String(line.id ?? ""),
          kind: String(line.kind ?? "parent"),
          description: text(line.description) ?? "Charge",
          amount: num(line.amount),
          sourceGuest: text(line.sourceGuest),
          sourceFolioNumber: text(line.sourceFolioNumber),
          sourceRoomNumber: text(line.sourceRoomNumber),
        };
      })
    : [];
  return {
    version: num(row.version) || 1,
    target: "financial_account",
    issuedAt: text(row.issuedAt) ?? "",
    issuerMembershipId: text(row.issuerMembershipId),
    document: {
      issuedNumber: text(document.issuedNumber) ?? "",
      sequenceNumber: document.sequenceNumber == null ? null : num(document.sequenceNumber),
      notes: text(document.notes),
      issuedByName: text(document.issuedByName),
    },
    property: {
      currencyCode: text(property.currencyCode) ?? text(account.currency) ?? "GBP",
      legalEntityName: text(property.legalEntityName),
      legalName: text(property.legalName),
      brandName: text(property.brandName),
      tradingName: text(property.tradingName),
      vatNumber: text(property.vatNumber),
      tinNumber: text(property.tinNumber),
      fullAddress: text(property.fullAddress),
      phone: text(property.phone),
    },
    account: {
      id: String(account.id ?? ""),
      accountNumber: text(account.accountNumber) ?? "",
      accountKind: kind,
      currency: text(account.currency) ?? text(property.currencyCode) ?? "GBP",
    },
    billTo: mapAccountBillTo(row.billTo, kind),
    lines,
    totals: {
      subtotal: num(totals.subtotal),
      tax: num(totals.tax),
      serviceCharge: num(totals.serviceCharge),
      invoiceTotal: num(totals.invoiceTotal),
    },
  };
}

export function accountInvoiceIssuerLabel(property: AccountInvoiceSnapshot["property"]): string {
  return (
    property.legalEntityName ||
    property.legalName ||
    property.brandName ||
    property.tradingName ||
    "Property"
  );
}
