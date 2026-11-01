/* ------------------------------------------------------------------ */
/* Reservation list -> PDF (print view).                               */
/* The period picker (Today, Last 7 days, Custom, All dates) is the     */
/* shared ExportPdfDialog from guest-export-pdf. This file only builds  */
/* the printable reservation table.                                     */
/*                                                                      */
/* Because the reservations are fetched before printing, the print      */
/* window is opened first (inside the click) and filled afterwards.     */
/* Otherwise the browser's pop-up blocker would stop it.                */
/* ------------------------------------------------------------------ */

export type ReservationExportRow = {
  confirmationNumber: string;
  guestName: string;
  roomTypeName: string;
  /** "Unassigned" when no room is set. */
  room: string;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  source: string;
  ratePlan: string;
  total: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Call this straight from the click handler, before any await. */
export function openPdfWindow(): Window | null {
  const printWindow = window.open("", "_blank", "width=1100,height=700");

  if (!printWindow) {
    window.alert("Please allow pop-ups to export the list as PDF.");
    return null;
  }

  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><title>Preparing PDF…</title><p style="font-family:Arial,sans-serif;padding:24px;color:#4a2c1a">Preparing your PDF…</p>',
  );
  printWindow.document.close();

  return printWindow;
}

/** Fills the window from openPdfWindow() with the reservation table and prints it. */
export function exportReservationsToPdf({
  printWindow,
  title,
  restaurantName,
  scope,
  rangeLabel,
  rows,
}: {
  printWindow: Window;
  title: string;
  restaurantName: string;
  /** Current desk view, for example "All Reservations". */
  scope: string;
  /** Period chosen in the dialog, for example "Last 7 days (…)". */
  rangeLabel: string;
  rows: ReservationExportRow[];
}) {
  const body = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.confirmationNumber)}</td>
          <td>${escapeHtml(row.guestName)}</td>
          <td>${escapeHtml(row.roomTypeName)}<br /><span class="muted">${escapeHtml(row.room)}</span></td>
          <td>${escapeHtml(row.arrival)}</td>
          <td>${escapeHtml(row.departure)}</td>
          <td class="num">${escapeHtml(row.nights)}</td>
          <td class="num">${escapeHtml(row.adults)} / ${escapeHtml(row.children)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.source)}</td>
          <td>${escapeHtml(row.ratePlan)}</td>
          <td class="num">${escapeHtml(row.total)}</td>
        </tr>`,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} - ${escapeHtml(restaurantName)}</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #2b1a10; padding: 24px; }
          h1 { margin: 0 0 6px; color: #4a2c1a; font-size: 22px; }
          .meta { margin: 0 0 20px; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th { background: #4a2c1a; color: #fff; text-align: left; }
          th, td { border: 1px solid #d9c8a4; padding: 6px 7px; vertical-align: top; }
          tbody tr:nth-child(even) { background: #f7f7f7; }
          .num { text-align: right; white-space: nowrap; }
          .muted { color: #7a6b58; font-size: 9.5px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml(restaurantName)} · ${escapeHtml(scope)} · Arrival: ${escapeHtml(rangeLabel)} · Exported ${escapeHtml(new Date().toLocaleString())} · ${rows.length} reservations</p>
        <table>
          <thead>
            <tr>
              <th>Res. No.</th><th>Guest</th><th>Room type / Room</th><th>Arrival</th><th>Departure</th>
              <th>Nights</th><th>Adults / Children</th><th>Status</th><th>Source</th><th>Rate plan</th><th>Total</th>
            </tr>
          </thead>
          <tbody>${body || '<tr><td colspan="11">No reservations arrive in this period.</td></tr>'}</tbody>
        </table>
        <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body>
    </html>`);
  printWindow.document.close();
}