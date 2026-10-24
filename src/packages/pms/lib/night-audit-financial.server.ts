/**
 * Property-scoped financial read for Night Audit.
 *
 * The audit date is restaurants.business_date. Timestamp membership uses
 * propertyDayBounds / belongsToBusinessDate. This module does not post,
 * allocate, register, retry, or close a drawer.
 */
import { belongsToBusinessDate, propertyDayBounds } from "./cashiering-control";
import { activeWithholdingNet } from "./cashiering-account-allocation";
import { fiscalSnapshotMode, registeredCashDebitCover } from "./cashiering-cash-debit-cover";
import {
  guestInvoiceOriginalAmount,
  guestPaymentFace,
  snapshotParentChargeIds,
} from "./cashiering-guest-allocation";
import {
  reconcileNightAuditFinancials,
  type AccountFact,
  type FiscalDocumentFact,
  type NightAuditFinancialFacts,
  type NightAuditFinancialReconciliation,
} from "./night-audit-financial";
import { selectAll, selectByIds } from "./night-audit-read";
import { isMissingSchemaError } from "./pms-set2-structure";

// PostgREST builders are untyped here; the loader only reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function person(value: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const label = [value?.first_name, value?.last_name].filter(Boolean).join(" ").trim();
  return label || "Guest";
}

function snapshotNumber(snapshot: unknown, key: "tax" | "serviceCharge" | "withholding"): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const totals = (snapshot as { totals?: Record<string, unknown> }).totals;
  const raw = totals?.[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw;
}

async function optional<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    if (isMissingSchemaError(error as { message?: string; code?: string })) return [];
    throw error;
  }
}

export async function loadNightAuditFinancialReconciliation(
  admin: Admin,
  restaurantId: string,
  businessDate: string,
  timezone: string,
  currency: string,
  checkedAt = new Date().toISOString(),
): Promise<NightAuditFinancialReconciliation> {
  const bounds = propertyDayBounds(businessDate, timezone);
  const onAuditDate = (iso: string | null | undefined) =>
    Boolean(iso) && iso! >= bounds.startIso && iso! < bounds.endIso && belongsToBusinessDate(iso!, businessDate, timezone);

  type FolioRow = {
    id: string;
    folio_number: string;
    status: string;
    reservation_id: string | null;
    closed_at: string | null;
  };
  type TxnRow = {
    id: string;
    folio_id: string;
    financial_account_id: string | null;
    transaction_type: string;
    category: string | null;
    amount: number | string;
    posted_at: string;
    payment_method: string | null;
    reference_type: string | null;
    reference_id: string | null;
    original_transaction_id: string | null;
    transfer_id: string | null;
    transfer_direction: string | null;
  };
  const folios = await selectAll<FolioRow>((from, to) =>
    admin
      .from("guest_folios")
      .select("id, folio_number, status, reservation_id, closed_at")
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const transactions = await selectAll<TxnRow>((from, to) =>
    admin
      .from("folio_transactions")
      .select(
        "id, folio_id, financial_account_id, transaction_type, category, amount, posted_at, payment_method, reference_type, reference_id, original_transaction_id, transfer_id, transfer_direction",
      )
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  type ReservationRow = {
    id: string;
    confirmation_number: string;
    status: string;
    room_subtotal: number | string | null;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
    hotel_rooms: { room_number: string | null } | null;
  };
  const reservations = await selectAll<ReservationRow>((from, to) =>
    admin
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, status, room_subtotal, guest_profiles!hotel_reservations_guest_same_property(first_name, last_name), hotel_rooms!hotel_reservations_room_same_type(room_number)",
      )
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const reservationById = new Map(reservations.map((row) => [row.id, row]));
  const folioReservation = new Set(folios.flatMap((folio) => (folio.reservation_id ? [folio.reservation_id] : [])));

  type InvoiceRow = {
    id: string;
    folio_id: string;
    issued_number: string;
    issued_at: string | null;
    coverage_scope: string | null;
    snapshot: unknown;
  };
  type NoteRow = {
    id: string;
    guest_invoice_id: string | null;
    account_invoice_id: string | null;
    note_type: string;
    total_delta: number | string;
    issued_at: string | null;
  };
  type PaymentAlloc = {
    id: string;
    invoice_id: string;
    amount: number | string;
    payment_transaction_id: string;
    created_at?: string | null;
  };
  type DepositAlloc = PaymentAlloc & { deposit_transaction_id: string };
  type ChargeAlloc = { charge_transaction_id: string; amount: number | string };
  const invoices = await optional(() =>
    selectAll<InvoiceRow>((from, to) =>
      admin
        .from("guest_folio_invoices")
        .select("id, folio_id, issued_number, issued_at, coverage_scope, snapshot")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const notes = await optional(() =>
    selectAll<NoteRow>((from, to) =>
      admin
        .from("invoice_credit_notes")
        .select("id, guest_invoice_id, account_invoice_id, note_type, total_delta, issued_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const paymentAllocations = await optional(() =>
    selectAll<PaymentAlloc>((from, to) =>
      admin
        .from("guest_payment_invoice_allocations")
        .select("id, invoice_id, amount, payment_transaction_id, created_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const depositAllocations = await optional(() =>
    selectAll<DepositAlloc>((from, to) =>
      admin
        .from("guest_deposit_invoice_allocations")
        .select("id, invoice_id, amount, deposit_transaction_id, created_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const chargeAllocations = await optional(() =>
    selectAll<ChargeAlloc>((from, to) =>
      admin
        .from("folio_deposit_allocations")
        .select("charge_transaction_id, amount")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const debitIds = notes.filter((note) => note.note_type === "debit").map((note) => note.id);
  const debitRegistrations = new Map<string, { status: string; mode: "CASH" | "CREDIT" | null }>();
  if (debitIds.length > 0) {
    const registrationRows = await optional(() =>
      selectByIds<{ source_id: string; status: string; request_snapshot: unknown }>(debitIds, (chunk) =>
        admin
          .from("fiscal_registrations")
          .select("source_id, status, request_snapshot")
          .eq("restaurant_id", restaurantId)
          .eq("source_type", "debit_note")
          .eq("fiscal_document_type", "DEB")
          .in("source_id", chunk),
      ),
    );
    for (const row of registrationRows) {
      debitRegistrations.set(row.source_id, {
        status: row.status,
        mode: fiscalSnapshotMode(row.request_snapshot),
      });
    }
  }

  const allocatedBySource = new Map<string, number>();
  const invoiceNumbers = new Map(invoices.map((invoice) => [invoice.id, invoice.issued_number]));
  const targetsBySource = new Map<string, string[]>();
  for (const row of paymentAllocations) {
    allocatedBySource.set(row.payment_transaction_id, (allocatedBySource.get(row.payment_transaction_id) ?? 0) + num(row.amount));
    const label = invoiceNumbers.get(row.invoice_id);
    if (label) targetsBySource.set(row.payment_transaction_id, [...(targetsBySource.get(row.payment_transaction_id) ?? []), label]);
  }
  for (const row of depositAllocations) {
    allocatedBySource.set(
      row.deposit_transaction_id,
      (allocatedBySource.get(row.deposit_transaction_id) ?? 0) + num(row.amount),
    );
    const label = invoiceNumbers.get(row.invoice_id);
    if (label) {
      targetsBySource.set(row.deposit_transaction_id, [...(targetsBySource.get(row.deposit_transaction_id) ?? []), label]);
    }
  }
  const refundedByPayment = new Map<string, number>();
  for (const txn of transactions) {
    if (txn.transaction_type !== "refund" || !txn.original_transaction_id) continue;
    refundedByPayment.set(
      txn.original_transaction_id,
      (refundedByPayment.get(txn.original_transaction_id) ?? 0) + Math.abs(num(txn.amount)),
    );
  }

  const folioGuest = (folioId: string) => {
    const folio = folios.find((row) => row.id === folioId);
    const reservation = folio?.reservation_id ? reservationById.get(folio.reservation_id) : undefined;
    return person(reservation?.guest_profiles);
  };

  type AccountRow = {
    id: string;
    account_kind: string;
    account_number: string;
    currency: string;
  };
  type AccountInvoiceRow = {
    id: string;
    financial_account_id: string;
    issued_number: string | null;
    issued_at: string | null;
    snapshot: unknown;
  };
  type AccountAllocRow = {
    id: string;
    financial_account_id: string;
    invoice_id: string;
    payment_transaction_id: string;
    amount: number | string;
    created_at?: string | null;
  };
  type CertificateRow = {
    id: string;
    financial_account_id: string;
    invoice_id: string;
    amount: number | string;
    reverses_certificate_id: string | null;
    created_at?: string | null;
  };
  const accounts = await optional(() =>
    selectAll<AccountRow>((from, to) =>
      admin
        .from("financial_accounts")
        .select("id, account_kind, account_number, currency")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const accountInvoices = await optional(() =>
    selectAll<AccountInvoiceRow>((from, to) =>
      admin
        .from("financial_account_invoices")
        .select("id, financial_account_id, issued_number, issued_at, snapshot")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const accountAllocations = await optional(() =>
    selectAll<AccountAllocRow>((from, to) =>
      admin
        .from("financial_account_payment_allocations")
        .select("id, financial_account_id, invoice_id, payment_transaction_id, amount, created_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const certificates = await optional(() =>
    selectAll<CertificateRow>((from, to) =>
      admin
        .from("withholding_certificates")
        .select("id, financial_account_id, invoice_id, amount, reverses_certificate_id, created_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );

  const accountFacts: AccountFact[] = accounts.map((account) => {
    const invoiceRows = accountInvoices.filter((invoice) => invoice.financial_account_id === account.id);
    const allocRows = accountAllocations.filter((row) => row.financial_account_id === account.id);
    const allocatedByPayment = new Map<string, number>();
    for (const row of allocRows) {
      allocatedByPayment.set(
        row.payment_transaction_id,
        (allocatedByPayment.get(row.payment_transaction_id) ?? 0) + num(row.amount),
      );
    }
    const payments = transactions.filter(
      (txn) => txn.financial_account_id === account.id && txn.transaction_type === "payment",
    );
    return {
      id: account.id,
      name: account.account_number,
      kind: account.account_kind,
      currency: account.currency || currency,
      invoices: invoiceRows.map((invoice) => {
        const invoiceNotes = notes.filter((note) => note.account_invoice_id === invoice.id);
        const allocated = allocRows
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + num(row.amount), 0);
        const withholdingNet = activeWithholdingNet(
          certificates
            .filter((row) => row.invoice_id === invoice.id)
            .map((row) => ({
              id: row.id,
              amount: num(row.amount),
              reversesCertificateId: row.reverses_certificate_id,
            })),
        );
        return {
          id: invoice.id,
          number: invoice.issued_number ?? invoice.id,
          voided: false,
          issued: Boolean(invoice.issued_number),
          invoiceTotal: guestInvoiceOriginalAmount(
            invoice.snapshot as { totals?: { invoiceTotal?: number | null } },
          ) ?? 0,
          noteDeltas: invoiceNotes.map((note) => num(note.total_delta)),
          allocated,
          withholdingNet,
          snapshotWithholding: snapshotNumber(invoice.snapshot, "withholding"),
          currency: account.currency || currency,
        };
      }),
      payments: payments.map((payment) => ({
        id: payment.id,
        face: guestPaymentFace(num(payment.amount)),
        refunded: refundedByPayment.get(payment.id) ?? 0,
        allocated: allocatedByPayment.get(payment.id) ?? 0,
        currency: account.currency || currency,
      })),
      allocations: allocRows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        paymentId: row.payment_transaction_id,
        amount: num(row.amount),
      })),
    };
  });

  const shiftResult = await admin.rpc("list_hotel_drawers", { _restaurant_id: restaurantId });
  if (shiftResult.error) throw new Error(shiftResult.error.message);
  const shiftRows = (Array.isArray(shiftResult.data) ? shiftResult.data : []) as Array<{
    id: string;
    membership_id: string;
    status: "open" | "closed";
    opened_at: string;
    expected?: number | string | null;
    closing_count?: number | string | null;
    variance?: number | string | null;
  }>;

  const cashierNames = new Map<string, string>();
  try {
    const memberIds = [...new Set(shiftRows.map((shift) => shift.membership_id))];
    if (memberIds.length > 0) {
      const members = await admin
        .from("restaurant_users")
        .select("id, user_id")
        .eq("restaurant_id", restaurantId)
        .in("id", memberIds);
      const memberRows = (members.data ?? []) as Array<{ id: string; user_id: string }>;
      if (memberRows.length > 0) {
        const profiles = await admin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", memberRows.map((member) => member.user_id));
        const profileRows = (profiles.data ?? []) as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
        }>;
        for (const member of memberRows) {
          const profile = profileRows.find((row) => row.id === member.user_id);
          const label = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
          if (label) cashierNames.set(member.id, label);
        }
      }
    }
  } catch {
    // A missing display name does not change drawer blocker truth.
  }

  const integration = await admin
    .from("pms_integrations")
    .select("enabled")
    .eq("restaurant_id", restaurantId)
    .eq("category", "fiscal")
    .eq("provider", "erp_fiscal")
    .maybeSingle();
  if (integration.error) throw new Error(integration.error.message);
  const integrationEnabled = Boolean(integration.data) && integration.data.enabled !== false;

  type FiscalRow = {
    id: string;
    source_type: string;
    source_id: string;
    fiscal_document_type: string;
    status: string;
    trnx_id: string | null;
    external_document_number: string | null;
    external_irn: string | null;
    external_rrn: string | null;
    request_snapshot: unknown;
    created_at: string;
  };
  const fiscalRows = await optional(() =>
    selectAll<FiscalRow>((from, to) =>
      admin
        .from("fiscal_registrations")
        .select(
          "id, source_type, source_id, fiscal_document_type, status, trnx_id, external_document_number, external_irn, external_rrn, request_snapshot, created_at",
        )
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const registeredKeys = new Set(fiscalRows.map((row) => `${row.source_type}:${row.source_id}`));
  const fiscalDocuments: FiscalDocumentFact[] = [];
  for (const row of fiscalRows) {
    const onDate = onAuditDate(row.created_at);
    const terminal = row.status === "REGISTERED" || row.status === "CANCELLED";
    if (terminal && !onDate) continue;
    fiscalDocuments.push({
      id: row.source_id,
      number: row.external_document_number || row.trnx_id || row.source_id,
      documentType: row.fiscal_document_type,
      sourceType: row.source_type,
      issuedAt: row.created_at,
      status: row.status,
      externalReference: row.external_document_number || row.external_irn || row.external_rrn,
      mode: fiscalSnapshotMode(row.request_snapshot),
    });
  }
  const pushMissing = (document: FiscalDocumentFact, at: string | null) => {
    if (!onAuditDate(at)) return;
    if (registeredKeys.has(`${document.sourceType}:${document.id}`)) return;
    fiscalDocuments.push(document);
  };
  for (const invoice of invoices) {
    if (invoice.coverage_scope === "legacy_folio") continue;
    pushMissing(
      {
        id: invoice.id,
        number: invoice.issued_number,
        documentType: "INV",
        sourceType: "guest_invoice",
        issuedAt: invoice.issued_at,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      invoice.issued_at,
    );
  }
  for (const invoice of accountInvoices) {
    if (!invoice.issued_number) continue;
    pushMissing(
      {
        id: invoice.id,
        number: invoice.issued_number,
        documentType: "INV",
        sourceType: "account_invoice",
        issuedAt: invoice.issued_at,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      invoice.issued_at,
    );
  }
  for (const note of notes) {
    pushMissing(
      {
        id: note.id,
        number: note.id,
        documentType: note.note_type === "debit" ? "DEB" : "CRE",
        sourceType: note.note_type === "debit" ? "debit_note" : "credit_note",
        issuedAt: note.issued_at,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      note.issued_at,
    );
  }
  for (const row of paymentAllocations) {
    pushMissing(
      {
        id: row.id,
        number: row.id,
        documentType: "SALES_RECEIPT",
        sourceType: "guest_allocation",
        issuedAt: row.created_at ?? null,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      row.created_at ?? null,
    );
  }
  for (const row of accountAllocations) {
    pushMissing(
      {
        id: row.id,
        number: row.id,
        documentType: "SALES_RECEIPT",
        sourceType: "account_allocation",
        issuedAt: row.created_at ?? null,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      row.created_at ?? null,
    );
  }
  for (const row of certificates) {
    pushMissing(
      {
        id: row.id,
        number: row.id,
        documentType: "WITHHOLDING",
        sourceType: "withholding",
        issuedAt: row.created_at ?? null,
        status: "NOT_REGISTERED",
        externalReference: null,
        mode: null,
      },
      row.created_at ?? null,
    );
  }

  const facts: NightAuditFinancialFacts = {
    businessDate,
    timezone,
    checkedAt,
    folios: folios.map((folio) => {
      const reservation = folio.reservation_id ? reservationById.get(folio.reservation_id) : undefined;
      return {
        id: folio.id,
        number: folio.folio_number,
        status: folio.status,
        closedAt: folio.closed_at,
        guestName: person(reservation?.guest_profiles),
        reservationId: folio.reservation_id,
        confirmationNumber: reservation?.confirmation_number ?? "—",
        room: reservation?.hotel_rooms?.room_number ?? "—",
        currency,
      };
    }),
    transactions: transactions
      .filter((txn) => txn.folio_id)
      .map((txn) => ({
        folioId: txn.folio_id,
        amount: num(txn.amount),
        postedAt: txn.posted_at,
        referenceType: txn.reference_type,
        referenceId: txn.reference_id,
      })),
    missingFolios: reservations
      .filter(
        (reservation) =>
          num(reservation.room_subtotal) > 0 &&
          (reservation.status === "checked_in" || reservation.status === "checked_out") &&
          !folioReservation.has(reservation.id),
      )
      .map((reservation) => ({
        id: reservation.id,
        confirmationNumber: reservation.confirmation_number,
        status: reservation.status,
        guestName: person(reservation.guest_profiles),
        room: reservation.hotel_rooms?.room_number ?? "—",
      })),
    invoices: invoices.map((invoice) => {
      const invoiceNotes = notes.filter((note) => note.guest_invoice_id === invoice.id);
      const parentIds = snapshotParentChargeIds(invoice.snapshot);
      const depositApplied =
        depositAllocations.filter((row) => row.invoice_id === invoice.id).reduce((sum, row) => sum + num(row.amount), 0) +
        chargeAllocations
          .filter((row) => parentIds.includes(row.charge_transaction_id))
          .reduce((sum, row) => sum + num(row.amount), 0);
      return {
        id: invoice.id,
        folioId: invoice.folio_id,
        number: invoice.issued_number,
        issuedAt: invoice.issued_at,
        guestName: folioGuest(invoice.folio_id),
        currency,
        eligible: invoice.coverage_scope !== "legacy_folio",
        invoiceTotal: guestInvoiceOriginalAmount(invoice.snapshot as { totals?: { invoiceTotal?: number | null } }),
        noteDeltas: invoiceNotes.map((note) => num(note.total_delta)),
        paymentAllocated: paymentAllocations
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + num(row.amount), 0),
        depositApplied,
        cashDebitCovered: registeredCashDebitCover(
          invoiceNotes.map((note) => ({
            id: note.id,
            noteType: note.note_type,
            totalDelta: num(note.total_delta),
          })),
          invoiceNotes.map((note) => ({
            sourceId: note.id,
            status: debitRegistrations.get(note.id)?.status ?? "",
            mode: debitRegistrations.get(note.id)?.mode ?? null,
          })),
        ),
        snapshotTax: snapshotNumber(invoice.snapshot, "tax"),
        snapshotServiceCharge: snapshotNumber(invoice.snapshot, "serviceCharge"),
        issuedOnAuditDate: onAuditDate(invoice.issued_at),
      };
    }),
    sources: transactions
      .filter((txn) => txn.transaction_type === "payment" || txn.transaction_type === "deposit")
      .filter((txn) => !txn.financial_account_id)
      .map((txn) => ({
        id: txn.id,
        kind: txn.transaction_type === "deposit" ? ("deposit" as const) : ("payment" as const),
        reference: txn.payment_method ? `${txn.transaction_type} · ${txn.payment_method}` : txn.transaction_type,
        guestName: folioGuest(txn.folio_id),
        currency,
        face: guestPaymentFace(num(txn.amount)),
        refunded: refundedByPayment.get(txn.id) ?? 0,
        allocated: allocatedBySource.get(txn.id) ?? 0,
        targetInvoice: (targetsBySource.get(txn.id) ?? []).join(", ") || null,
      })),
    allocations: [
      ...paymentAllocations.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        amount: num(row.amount),
        sourceId: row.payment_transaction_id,
        kind: "payment" as const,
      })),
      ...depositAllocations.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        amount: num(row.amount),
        sourceId: row.deposit_transaction_id,
        kind: "deposit" as const,
      })),
    ],
    accounts: accountFacts,
    transfers: transactions
      .filter((txn) => txn.transfer_id || txn.transfer_direction || txn.transaction_type.startsWith("transfer"))
      .map((txn) => ({
        id: txn.id,
        transferId: txn.transfer_id,
        direction: txn.transfer_direction || txn.transaction_type,
        amount: num(txn.amount),
        accountId: txn.financial_account_id,
      })),
    drawers: shiftRows.map((shift) => ({
      id: shift.id,
      cashier: cashierNames.get(shift.membership_id) ?? "Cashier",
      shift: shift.id.slice(0, 8),
      openedAt: shift.opened_at,
      expectedCash: num(shift.expected),
      closingCount: shift.closing_count == null ? null : num(shift.closing_count),
      variance: shift.variance == null ? null : num(shift.variance),
      state: shift.status,
      scope: "hotel" as const,
      currency,
    })),
    integrationEnabled,
    fiscalDocuments,
    taxLines: transactions
      .filter(
        (txn) =>
          (txn.category === "tax" || txn.category === "service_charge") &&
          onAuditDate(txn.posted_at),
      )
      .map((txn) => ({
        currency,
        category: txn.category as "tax" | "service_charge",
        amount: num(txn.amount),
      })),
  };

  return reconcileNightAuditFinancials(facts);
}
