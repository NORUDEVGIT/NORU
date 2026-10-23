import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  AMENDMENT_PRINT_FOOTER,
  AMENDMENT_PRINT_TITLE,
  amendmentConfirmationCopy,
  type AmendmentPrintData,
} from "@/packages/pms/lib/reservation-amendment-print";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .reservation-print-document,
  .reservation-print-document * { visibility: visible; }
  body > *:not(.reservation-print-document) { display: none !important; }
  .reservation-print-document {
    display: block !important;
    position: static !important;
    left: auto;
    top: auto;
    width: 100%;
    margin: 0;
    background: #ffffff !important;
    color: #1c1917 !important;
    break-inside: auto;
    page-break-inside: auto;
  }
  .reservation-print-document header,
  .reservation-print-document section,
  .reservation-print-document tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .reservation-print-document thead {
    display: table-header-group;
  }
  .reservation-print-document table,
  .reservation-print-document th,
  .reservation-print-document td {
    border-color: #d6d3d1 !important;
  }
}
@page { size: A4; margin: 14mm; }
`;

export function ReservationAmendmentPrint({ data }: { data: AmendmentPrintData }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.body);
  }, []);
  const article = <AmendmentPrintArticle data={data} />;
  if (host) return createPortal(article, host);
  return article;
}

function AmendmentPrintArticle({ data }: { data: AmendmentPrintData }) {
  const showFinancial = Boolean(
    data.previousRoomTotal || data.updatedRoomTotal || data.roomTotalDifference,
  );
  const showPackages = Boolean(data.packagesSummary || data.packageAmount);

  return (
    <article
      className="reservation-print-document hidden bg-white text-[#1c1917] print:block"
      data-testid="reservation-amendment-print"
    >
      <style>{PRINT_CSS}</style>
      <header className="border-b-2 border-[#C4A35A] pb-4">
        <div className="flex items-start justify-between gap-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8A6A1F]">
              NORU
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1c1917]">
              {data.propertyName}
            </h1>
            {data.propertyContact ? (
              <p className="mt-2 text-xs leading-5 text-[#44403c]">{data.propertyContact}</p>
            ) : null}
          </div>
          <div className="min-w-[220px] text-right">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1c1917]">
              {AMENDMENT_PRINT_TITLE}
            </h2>
            <p className="mt-2 text-xs text-[#44403c]">Reservation {data.confirmationNumber}</p>
            {data.statusLabel ? (
              <p className="mt-1 text-xs text-[#44403c]">Status {data.statusLabel}</p>
            ) : null}
            {data.amendedAt ? (
              <p className="mt-1 text-xs text-[#44403c]">Amended {data.amendedAt}</p>
            ) : null}
            {data.amendedBy ? (
              <p className="mt-1 text-xs text-[#44403c]">Amended by {data.amendedBy}</p>
            ) : null}
            {data.reference ? (
              <p className="mt-1 text-xs text-[#44403c]">Reference {data.reference}</p>
            ) : null}
          </div>
        </div>
      </header>

      <p className="mt-4 text-xs leading-5 text-[#44403c]">
        {amendmentConfirmationCopy(data.confirmationNumber)}
      </p>

      <section className="mt-4 border-t border-[#e7e5e4] pt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
          Changes to your reservation
        </h3>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#d6d3d1] text-left text-[10px] uppercase tracking-wide text-[#44403c]">
              <th className="py-1 pr-3 font-semibold">Detail</th>
              <th className="py-1 pr-3 font-semibold">Previous</th>
              <th className="py-1 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.changes.map((row) => (
              <tr key={row.item} className="border-b border-[#e7e5e4]">
                <td className="py-1.5 pr-3">{row.item}</td>
                <td className="py-1.5 pr-3">{row.before}</td>
                <td className="py-1.5">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 border-t border-[#e7e5e4] pt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
          Updated reservation
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <PrintLine label="Guest Name" value={data.guestName} />
          <PrintLine label="Arrival" value={data.arrival} />
          <PrintLine label="Departure" value={data.departure} />
          <PrintLine label="Nights" value={data.nights} />
          <PrintLine label="Adults" value={data.adults} />
          <PrintLine label="Children" value={data.children} />
          <PrintLine label="Room Type" value={data.roomType} />
          <PrintLine label="Assigned Room" value={data.assignedRoom} />
          {data.ratePlan ? <PrintLine label="Rate Plan" value={data.ratePlan} /> : null}
          {data.ratePerNight ? (
            <PrintLine label="Rate per Night" value={data.ratePerNight} />
          ) : null}
          {data.roomTotal ? (
            <PrintLine label="Reservation Room Total" value={data.roomTotal} />
          ) : null}
          {data.source ? <PrintLine label="Source" value={data.source} /> : null}
          {data.marketSegment ? (
            <PrintLine label="Market Segment" value={data.marketSegment} />
          ) : null}
          {data.externalReference ? (
            <PrintLine label="External Reference" value={data.externalReference} />
          ) : null}
        </dl>
        {data.specialRequests ? (
          <p className="mt-2 text-xs">
            <span className="text-[#57534e]">Special Requests </span>
            {data.specialRequests}
          </p>
        ) : null}
      </section>

      {showFinancial ? (
        <section className="mt-4 border-t border-[#e7e5e4] pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
            Financial impact
          </h3>
          <dl className="mt-2 space-y-1 text-xs">
            {data.previousRoomTotal ? (
              <PrintLine label="Previous Room Total" value={data.previousRoomTotal} />
            ) : null}
            {data.updatedRoomTotal ? (
              <PrintLine label="Updated Room Total" value={data.updatedRoomTotal} />
            ) : null}
            {data.roomTotalDifference ? (
              <PrintLine label="Difference" value={data.roomTotalDifference} />
            ) : null}
          </dl>
        </section>
      ) : null}

      {showPackages ? (
        <section className="mt-4 border-t border-[#e7e5e4] pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
            Packages
          </h3>
          <dl className="mt-2 space-y-1 text-xs">
            {data.packagesSummary ? (
              <PrintLine label="Packages" value={data.packagesSummary} />
            ) : null}
            {data.packageAmount ? (
              <PrintLine label="Package Amount" value={data.packageAmount} />
            ) : null}
          </dl>
        </section>
      ) : null}

      {data.policy ? (
        <section className="mt-4 border-t border-[#e7e5e4] pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
            Cancellation Policy
          </h3>
          <p className="mt-2 text-xs">{data.policy}</p>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-[#d6d3d1] pt-3 text-[11px] leading-5 text-[#44403c]">
        <p>{AMENDMENT_PRINT_FOOTER}</p>
        {data.generatedAt ? (
          <p className="mt-1">Amendment confirmation generated {data.generatedAt}</p>
        ) : null}
      </footer>
    </article>
  );
}

function PrintLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-[#57534e]">{label}</dt>
      <dd className="text-[#1c1917]">{value}</dd>
    </div>
  );
}
