import type { ReactNode } from "react";

import type { ReservationPrintDocumentData } from "@/packages/pms/lib/reservation-print-document";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .reservation-print-document,
  .reservation-print-document * { visibility: visible; }
  .reservation-print-document {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    background: #ffffff !important;
    color: #1c1917 !important;
  }
  .reservation-print-document header,
  .reservation-print-document section,
  .reservation-print-document tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .reservation-print-document table,
  .reservation-print-document th,
  .reservation-print-document td {
    border-color: #d6d3d1 !important;
  }
}
@page { size: A4; margin: 14mm; }
`;

export function ReservationPrintDocument({ data }: { data: ReservationPrintDocumentData }) {
  const contact = [
    data.propertyAddress,
    data.propertyPhone,
    data.propertyEmail,
    data.propertyWebsite,
  ].filter((value): value is string => Boolean(value));
  const showRequests =
    data.preferences.length > 0 ||
    data.serviceRequests.length > 0 ||
    Boolean(data.specialRequests) ||
    Boolean(data.roomAssignment);
  const showPackages = data.packagesKnown || data.packages.length > 0;
  const showTotals = Boolean(data.roomTotal || data.packagesTotal);

  return (
    <article
      className="reservation-print-document hidden bg-white text-[#1c1917] print:block"
      data-testid="reservation-print-document"
      data-print-mode={data.mode}
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
            {contact.length > 0 ? (
              <p className="mt-2 text-xs leading-5 text-[#44403c]">{contact.join(" · ")}</p>
            ) : null}
          </div>
          <div className="min-w-[180px] text-right">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1c1917]">
              {data.title}
            </h2>
            {data.showDraftBadge ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#8A6A1F]">
                Draft
              </p>
            ) : null}
            {data.confirmationNumber ? (
              <p className="mt-2 text-xs text-[#44403c]">Confirmation {data.confirmationNumber}</p>
            ) : null}
            {data.statusLabel ? (
              <p className="mt-1 text-xs text-[#44403c]">Status {data.statusLabel}</p>
            ) : null}
            {data.createdAt ? (
              <p className="mt-1 text-xs text-[#44403c]">Created {data.createdAt}</p>
            ) : null}
            {data.confirmedAt ? (
              <p className="mt-1 text-xs text-[#44403c]">Confirmed {data.confirmedAt}</p>
            ) : null}
            {data.generatedAt ? (
              <p className="mt-1 text-xs text-[#44403c]">Generated {data.generatedAt}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-8">
        <PrintSection title="Guest Information">
          <PrintLines rows={data.guest} />
        </PrintSection>
        <PrintSection title="Booking Information">
          <PrintLines rows={data.booking} />
        </PrintSection>
      </div>

      <PrintSection title="Stay Details">
        <PrintLines rows={data.stay} columns />
      </PrintSection>

      <PrintSection title="Room & Rate">
        <div className="flex gap-4">
          {data.room.imageUrl ? (
            <img src={data.room.imageUrl} alt="" className="h-16 w-24 shrink-0 object-cover" />
          ) : null}
          <PrintLines
            rows={[
              data.room.typeName ? { label: "Room Type", value: data.room.typeName } : null,
              data.room.code ? { label: "Room Code", value: data.room.code } : null,
              data.room.ratePlan ? { label: "Rate Plan", value: data.room.ratePlan } : null,
              data.room.inclusions ? { label: "Inclusions", value: data.room.inclusions } : null,
              data.room.ratePerNight
                ? { label: "Rate per Night", value: data.room.ratePerNight }
                : null,
              data.room.nights ? { label: "Nights", value: data.room.nights } : null,
              data.room.roomTotal ? { label: "Room Total", value: data.room.roomTotal } : null,
            ].filter((row): row is { label: string; value: string } => row != null)}
            columns
          />
        </div>
      </PrintSection>

      {showPackages ? (
        <PrintSection title="Packages & Add-ons">
          {data.packages.length === 0 ? (
            <p className="text-xs text-[#44403c]">No packages selected</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#d6d3d1] text-left text-[10px] uppercase tracking-wide text-[#44403c]">
                  <th className="py-1 pr-3 font-semibold">Description</th>
                  <th className="py-1 pr-3 font-semibold">Quantity</th>
                  <th className="py-1 pr-3 font-semibold">Price</th>
                  <th className="py-1 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.packages.map((row) => (
                  <tr
                    key={`${row.description}-${row.quantity ?? ""}-${row.price ?? ""}`}
                    className="border-b border-[#e7e5e4]"
                  >
                    <td className="py-1.5 pr-3 align-top">
                      <p>{row.description}</p>
                      {row.inclusions ? (
                        <p className="mt-0.5 text-[10px] text-[#57534e]">
                          Includes: {row.inclusions}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 align-top">{row.quantity ?? "—"}</td>
                    <td className="py-1.5 pr-3 align-top">{row.price ?? "—"}</td>
                    <td className="py-1.5 align-top">{row.amount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PrintSection>
      ) : null}

      {showTotals ? (
        <PrintSection title="Totals">
          <PrintLines
            rows={[
              data.roomTotal ? { label: "Room Total", value: data.roomTotal } : null,
              data.packagesTotal ? { label: "Packages Total", value: data.packagesTotal } : null,
              data.reservationTotal
                ? { label: "Reservation Total", value: data.reservationTotal }
                : null,
            ].filter((row): row is { label: string; value: string } => row != null)}
          />
        </PrintSection>
      ) : null}

      {data.payment.length > 0 ? (
        <PrintSection title="Payment & Deposit">
          <PrintLines rows={data.payment} columns />
        </PrintSection>
      ) : null}

      {data.policies.length > 0 ? (
        <PrintSection title="Stay Policies">
          <PrintLines rows={data.policies} />
        </PrintSection>
      ) : null}

      {showRequests ? (
        <PrintSection title="Guest Requests & Preferences">
          {data.preferences.length > 0 ? (
            <div className="mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#44403c]">
                Saved Preferences
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {data.preferences.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.serviceRequests.length > 0 ? (
            <div className="mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#44403c]">
                Service Requests
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {data.serviceRequests.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.specialRequests ? (
            <p className="text-xs">
              <span className="text-[#57534e]">Special Requests </span>
              {data.specialRequests}
            </p>
          ) : null}
          {data.roomAssignment ? (
            <p className="mt-1 text-xs">
              <span className="text-[#57534e]">Room Assignment </span>
              {data.roomAssignment}
            </p>
          ) : null}
        </PrintSection>
      ) : null}

      <footer className="mt-6 border-t border-[#d6d3d1] pt-3 text-[11px] leading-5 text-[#44403c]">
        <p>{data.footer}</p>
        {data.generatedAt ? <p className="mt-1">Generated {data.generatedAt}</p> : null}
      </footer>
    </article>
  );
}

function PrintSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-[#e7e5e4] pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1917]">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function PrintLines({
  rows,
  columns = false,
}: {
  rows: Array<{ label: string; value: string }>;
  columns?: boolean;
}) {
  if (rows.length === 0) return <p className="text-xs text-[#44403c]">—</p>;
  return (
    <dl className={columns ? "grid grid-cols-2 gap-x-6 gap-y-1" : "space-y-1"}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 text-xs">
          <dt className="text-[#57534e]">{row.label}</dt>
          <dd className="text-[#1c1917]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
