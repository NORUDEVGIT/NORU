export type NoShowConfirmationProperty = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type NoShowConfirmationInput = {
  property: NoShowConfirmationProperty;
  generatedAt: string;
  confirmationNumber: string;
  guestName: string;
  stay: string;
  room: string;
  roomType: string;
  reason: string;
  policy: string;
  charge: string;
  chargeStatus: string;
  roomRelease: string;
  reservationResult: string;
  processedBy: string;
  /** Guest-facing notes only. Staff notes must not be passed. */
  publicNotes: string | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function safeLogoUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!/^https?:\/\//i.test(text)) return null;
  return text;
}

function line(label: string, value: string) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function buildNoShowConfirmationHtml(input: NoShowConfirmationInput): string {
  const property = input.property;
  const contact = [property.address, property.phone, property.email]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  const logo = safeLogoUrl(property.logoUrl);
  const notes = input.publicNotes?.trim() ?? "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>No-Show Confirmation — ${escapeHtml(property.name)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { margin: 0; color: #251605; font-family: Georgia, "Palatino Linotype", Palatino, serif; }
      .brand { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #C89933; padding-bottom: 14px; }
      .kicker { margin: 0; font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8A641A; }
      h1 { margin: 4px 0 0; font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
      .contact { margin: 8px 0 0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #5C4E3E; }
      .logo { max-height: 52px; max-width: 160px; object-fit: contain; }
      .doc { text-align: right; font-family: Arial, sans-serif; }
      .doc h2 { margin: 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
      .meta { margin-top: 8px; font-size: 11px; color: #6B5E4E; }
      section { margin-top: 18px; }
      h3 { margin: 0 0 8px; border-bottom: 1px solid #E8DFD0; padding-bottom: 4px; font-family: Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A641A; }
      dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; margin: 0; }
      dt { font-family: Arial, sans-serif; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #6B5E4E; }
      dd { margin: 2px 0 0; font-size: 14px; }
      .notes { background: #FBF7F1; padding: 10px 12px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
      footer { margin-top: 22px; border-top: 1px solid #E8DFD0; padding-top: 8px; font-family: Arial, sans-serif; font-size: 10px; line-height: 1.45; color: #6B5E4E; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <header class="brand">
      <div>
        ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="" />` : `<p class="kicker">NORU</p>`}
        <h1>${escapeHtml(property.name)}</h1>
        ${contact.length ? `<p class="contact">${contact.map((item) => escapeHtml(item)).join("<br />")}</p>` : ""}
      </div>
      <div class="doc">
        <h2>No-Show Confirmation</h2>
        <p class="meta">${escapeHtml(input.generatedAt)}</p>
      </div>
    </header>
    <section>
      <h3>Reservation</h3>
      <dl>
        ${line("Confirmation", input.confirmationNumber)}
        ${line("Guest", input.guestName)}
        ${line("Stay", input.stay)}
        ${line("Room", input.room)}
        ${line("Room type", input.roomType)}
        ${line("Processed by", input.processedBy)}
      </dl>
    </section>
    <section>
      <h3>No-show</h3>
      <dl>
        ${line("Reason", input.reason)}
        ${line("Policy", input.policy)}
        ${line("Charge", input.charge)}
        ${line("Charge status", input.chargeStatus)}
        ${line("Room release", input.roomRelease)}
        ${line("Reservation", input.reservationResult)}
      </dl>
    </section>
    <section>
      <h3>Public notes</h3>
      <div class="notes">${escapeHtml(notes || "—")}</div>
    </section>
    <footer>
      This confirmation was prepared in NORU from the no-show review. It is not a receipt and does not confirm payment.
    </footer>
    <script>window.onload = () => { window.focus(); window.print(); };</script>
  </body>
</html>`;
}

/** Opens a no-show confirmation and prints that document. */
export function printNoShowConfirmation(input: NoShowConfirmationInput): void {
  const printWindow = window.open("", "_blank", "width=900,height=740");
  if (!printWindow) {
    window.alert("Please allow pop-ups to print the confirmation.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildNoShowConfirmationHtml(input));
  printWindow.document.close();
}
