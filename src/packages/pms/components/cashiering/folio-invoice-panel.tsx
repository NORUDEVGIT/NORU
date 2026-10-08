import {
  invoiceIssuerLabel,
  type FolioInvoiceSnapshot,
  type IssuedFolioInvoiceRow,
} from "@/packages/pms/lib/cashiering-invoices.server";
import {
  isTaxRelatedCategory,
  labelTransactionCategory,
  labelTransactionType,
} from "@/packages/pms/components/cashiering/folio-bits";

export function FolioInvoicePanel({
  invoice,
  money,
  dateTime,
}: {
  invoice: IssuedFolioInvoiceRow;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
}) {
  const snap = invoice.snapshot;
  const issuer = invoiceIssuerLabel(snap.property);

  return (
    <section
      className="hidden print:block space-y-4 rounded-xl border border-border bg-white p-6 text-foreground"
      data-testid="issued-invoice-print"
    >
      <IssuedInvoiceDocument snap={snap} issuer={issuer} money={money} dateTime={dateTime} />
    </section>
  );
}

export function FolioInvoicePreview({
  invoice,
  money,
  dateTime,
}: {
  invoice: IssuedFolioInvoiceRow;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
}) {
  const snap = invoice.snapshot;
  const issuer = invoiceIssuerLabel(snap.property);

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="issued-invoice-preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Issued invoice</p>
          <h3 className="font-display text-lg">{invoice.issuedNumber}</h3>
          <p className="text-sm text-muted-foreground">
            Issued {dateTime(invoice.issuedAt)}
            {invoice.reprintCount > 0
              ? ` · Reprinted ${invoice.reprintCount} time${invoice.reprintCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs text-right">
          Immutable snapshot. Later folio or Settings changes do not alter this document.
        </p>
      </div>
      <IssuedInvoiceDocument snap={snap} issuer={issuer} money={money} dateTime={dateTime} compact />
    </section>
  );
}

function IssuedInvoiceDocument({
  snap,
  issuer,
  money,
  dateTime,
  compact,
}: {
  snap: FolioInvoiceSnapshot;
  issuer: string;
  money: (value: number) => string;
  dateTime: (iso: string) => string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3 text-sm" : "space-y-4"}>
      <header className="border-b border-border pb-3">
        <p className="font-semibold">{issuer}</p>
        {snap.property.vatRegistered && snap.property.vatNumber ? (
          <p className="text-muted-foreground">VAT {snap.property.vatNumber}</p>
        ) : null}
        <p className="mt-2 text-lg font-semibold">Invoice {snap.document.issuedNumber}</p>
        <p className="text-muted-foreground">
          Folio {snap.folio.folioNumber} · {snap.folio.guestName}
        </p>
        {snap.folio.confirmationNumber ? (
          <p className="text-muted-foreground">Reservation {snap.folio.confirmationNumber}</p>
        ) : null}
      </header>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Posted</th>
            <th className="py-1 font-medium">Type</th>
            <th className="py-1 font-medium">Description</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {snap.lines.map((line) => (
            <tr key={line.id} className="border-t border-border/60">
              <td className="py-1 text-muted-foreground">{dateTime(line.postedAt)}</td>
              <td className="py-1">
                {isTaxRelatedCategory(line.category)
                  ? labelTransactionCategory(line.category)
                  : labelTransactionType(line.transactionType)}
              </td>
              <td className={`py-1 ${line.originalTransactionId ? "pl-4" : ""}`}>
                {line.originalTransactionId && isTaxRelatedCategory(line.category) ? "↳ " : ""}
                {line.description}
              </td>
              <td className="py-1 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Charges</span>
          <span className="tabular-nums">{money(snap.totals.charges)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Credits</span>
          <span className="tabular-nums">{money(snap.totals.credits)}</span>
        </div>
        {snap.totals.tax > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax (posted lines)</span>
            <span className="tabular-nums">{money(snap.totals.tax)}</span>
          </div>
        ) : null}
        <div className="mt-2 flex justify-between font-semibold">
          <span>Balance</span>
          <span className="tabular-nums">{money(snap.totals.balance)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tax display preference: {snap.document.taxDisplay}. Amounts are frozen ledger snapshots at
          issue time ({dateTime(snap.issuedAt)}).
        </p>
      </footer>
    </div>
  );
}
