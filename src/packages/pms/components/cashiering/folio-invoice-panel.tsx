import { CashieringDocumentLetterhead } from "@/packages/pms/components/cashiering/cashiering-document-letterhead";
import {
  mergeCashieringDocumentProperty,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import {
  type FolioInvoiceSnapshot,
  type IssuedFolioInvoiceRow,
} from "@/packages/pms/lib/cashiering-invoices.server";
import {
  isTaxRelatedCategory,
} from "@/packages/pms/components/cashiering/folio-bits";
import { stayNights } from "@/packages/pms/lib/folio-workspace";

export function NoruMarkSvg({
  className = "size-9",
  strokeColor = "currentColor",
}: {
  className?: string;
  strokeColor?: string;
}) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M10 27V12.5C10 10.567 11.567 9 13.5 9C15.433 9 17 10.567 17 12.5V23.5C17 25.433 18.567 27 20.5 27C22.433 27 24 25.433 24 23.5V9"
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolioInvoicePanel({
  invoice,
  money,
  dateTime,
  liveProperty = null,
}: {
  invoice: IssuedFolioInvoiceRow;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
  liveProperty?: CashieringDocumentProperty | null;
}) {
  const snap = invoice.snapshot;

  return (
    <section
      className="rounded-xl border border-border bg-white p-6 text-foreground print:border-0 print:p-0"
      data-testid="issued-invoice-print"
    >
      <IssuedInvoiceDocument snap={snap} money={money} dateTime={dateTime} liveProperty={liveProperty} />
    </section>
  );
}

export function FolioInvoicePreview({
  invoice,
  money,
  dateTime,
  liveProperty = null,
}: {
  invoice: IssuedFolioInvoiceRow;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
  liveProperty?: CashieringDocumentProperty | null;
}) {
  const snap = invoice.snapshot;

  return (
    <section
      className="space-y-4 rounded-xl border border-[#E8E1D7] bg-white p-6 shadow-sm"
      data-testid="issued-invoice-preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E1D7] pb-3 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold uppercase tracking-wider text-[#0E2C6C]">Issued invoice</span>
          <span className="mx-2">·</span>
          <span>Issued {dateTime(invoice.issuedAt)}</span>
          {invoice.reprintCount > 0 ? (
            <span> · Reprinted {invoice.reprintCount} time{invoice.reprintCount === 1 ? "" : "s"}</span>
          ) : null}
        </div>
        <p className="text-right">
          Immutable snapshot. Later folio or Settings changes do not alter this document.
        </p>
      </div>
      <IssuedInvoiceDocument snap={snap} money={money} dateTime={dateTime} liveProperty={liveProperty} />
    </section>
  );
}

export function IssuedInvoiceDocument({
  snap,
  money,
  dateTime,
  liveProperty = null,
}: {
  snap: FolioInvoiceSnapshot;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
  liveProperty?: CashieringDocumentProperty | null;
  compact?: boolean;
}) {
  const nights = stayNights(snap.folio.arrivalDate, snap.folio.departureDate) ?? 1;
  const property = mergeCashieringDocumentProperty(snap.property, liveProperty);
  const currency = property?.currencyCode || snap.folio.currency || "ETB";

  // Group child tax/service rows into their parents when linked
  const parentIds = new Set(snap.lines.map((l) => l.id));
  const childTaxMap = new Map<string, number>();
  for (const line of snap.lines) {
    if (line.originalTransactionId && isTaxRelatedCategory(line.category)) {
      childTaxMap.set(
        line.originalTransactionId,
        (childTaxMap.get(line.originalTransactionId) ?? 0) + Number(line.amount || 0),
      );
    }
  }

  const invoiceItems = snap.lines.filter((line) => {
    if (line.originalTransactionId && isTaxRelatedCategory(line.category) && parentIds.has(line.originalTransactionId)) {
      return false;
    }
    return true;
  });

  const subtotal = snap.totals.subtotal ?? snap.totals.charges ?? 0;
  const tax = snap.totals.tax ?? 0;
  const serviceCharge = snap.totals.serviceCharge ?? 0;
  const totalAmount = snap.totals.invoiceTotal ?? (subtotal + tax + serviceCharge);

  return (
    <div className="space-y-6 bg-white font-sans text-slate-800">
      {/* Top Header: Left Logo & Hotel Info | Right Title & Invoice Meta */}
      <header className="flex flex-wrap items-start justify-between gap-6 pb-2">
        <CashieringDocumentLetterhead property={property} />

        <div className="text-right space-y-1 sm:min-w-[220px]">
          <h1 className="text-xl font-extrabold tracking-tight text-[#0E2C6C] uppercase">
            INTERNAL INVOICE
          </h1>
          <div className="mt-2 space-y-0.5 text-xs text-slate-700">
            <p>
              <span className="font-semibold text-slate-500">No:</span>{" "}
              <span className="font-bold text-[#0E2C6C]">{snap.document.issuedNumber}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Date:</span>{" "}
              <span>{snap.issuedAt.slice(0, 10)}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Folio:</span>{" "}
              <span>{snap.folio.folioNumber}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Reservation:</span>{" "}
              <span>{snap.folio.confirmationNumber || "—"}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Guest & Stay Period Details (2-column layout matching Image 1) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs">
        <div className="space-y-0.5">
          <p className="font-bold text-[#0E2C6C] uppercase tracking-wider text-[11px]">Guest</p>
          <p className="text-sm font-bold text-slate-950">{snap.folio.guestName}</p>
          <p className="text-slate-600">
            Room {snap.folio.roomNumber || "—"}
          </p>
        </div>
        <div className="space-y-0.5 sm:text-left">
          <p className="font-bold text-[#0E2C6C] uppercase tracking-wider text-[11px]">Stay Period</p>
          <p className="text-sm font-semibold text-slate-900">
            {snap.folio.arrivalDate?.slice(0, 10) || "—"} → {snap.folio.departureDate?.slice(0, 10) || "—"}
          </p>
          <p className="text-slate-600">Nights: {nights}</p>
        </div>
      </section>

      {/* Line Items Table with Light Blue Header */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-[#EDF3FA] text-[#0E2C6C]">
            <tr>
              <th className="px-3 py-2 text-left font-bold tracking-tight">Date</th>
              <th className="px-3 py-2 text-left font-bold tracking-tight">Description</th>
              <th className="px-2 py-2 text-center font-bold tracking-tight">Qty</th>
              <th className="px-3 py-2 text-right font-bold tracking-tight">Amount</th>
              <th className="px-3 py-2 text-right font-bold tracking-tight">Tax</th>
              <th className="px-3 py-2 text-right font-bold tracking-tight">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF3FA]/70">
            {invoiceItems.map((line) => {
              const lineTax = childTaxMap.get(line.id) ?? (Number((line.taxSnapshot as { amount?: number } | null)?.amount) || 0);
              const qty = line.quantity ?? 1;
              const lineAmount = Number(line.amount || 0);
              const itemTotal = lineAmount + lineTax;
              const dateStr = line.postedAt.slice(0, 10);

              return (
                <tr key={line.id} className="transition-colors hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[#0E2C6C]">
                    {dateStr}
                  </td>
                  <td className="px-3 py-2.5 font-normal text-slate-800">
                    {line.description}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums text-slate-700">
                    {qty}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-800">
                    {money(lineAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {money(lineTax)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {money(itemTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Right-aligned Totals Block matching reference Image 1 */}
      <footer className="pt-2">
        <div className="ml-auto w-full sm:w-64 space-y-1.5 text-xs">
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-bold text-[#0E2C6C]">Subtotal</span>
            <span className="tabular-nums font-semibold">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-bold text-[#0E2C6C]">VAT (15%)</span>
            <span className="tabular-nums font-semibold">{money(tax)}</span>
          </div>
          {serviceCharge > 0 ? (
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-bold text-[#0E2C6C]">Service Fee</span>
              <span className="tabular-nums font-semibold">{money(serviceCharge)}</span>
            </div>
          ) : null}
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
            <span className="text-sm font-extrabold text-[#0E2C6C]">Total Amount</span>
            <span className="text-sm sm:text-base font-extrabold text-[#0E2C6C] tabular-nums" data-testid="invoice-total">
              {money(totalAmount)} {currency}
            </span>
          </div>
        </div>

        {/* Footer Notes and Sign-off */}
        <div className="mt-8 border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1">
          {snap.document.notes ? (
            <p className="font-semibold text-slate-800">Notes: {snap.document.notes}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Immutable snapshot. Amounts are frozen ledger snapshots at issue time ({dateTime(snap.issuedAt)}).
            Tax display preference: {snap.document.taxDisplay}.
            <span className="hidden" aria-hidden="true">invoiceTotal: {snap.totals.invoiceTotal}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
